import bcrypt from 'bcryptjs';
import type { CreateRoomRequest, GameState, GameAction, Player, RoomInfo, PlayerInfo, RoomRole, UpdateRoomSettingsRequest } from '@mapgame/shared';
import { PLAYER_COLORS } from '../constants';
import { generateMap } from '../mapgen/generateMap';
import { handleAction, haveAllPlayersActed, previewAttack, skipPlayersWithNoTiles, startTurn } from './gameEngine';

export class GameRoom {
  public id: string;
  public name: string;
  public status: 'waiting' | 'playing' = 'waiting';
  public isPrivate: boolean;
  public maxPlayers: number;
  private passwordHash: string | null;
  private hostPlayerId: number | null = null;

  // Fired when a game starts (room status changes to 'playing')
  public onGameStart?: () => void;
  // Fired at the end of each turn with the new state (use for snapshotting)
  public onTurnEnd?: (state: GameState) => void;

  private state: GameState;
  private players: Map<string, PlayerInfo> = new Map();
  // socket ID -> persistent player UUID
  private socketToPersistentId: Map<string, string> = new Map();
  // persistent player UUID -> current socket ID
  private persistentIdToSocketId: Map<string, string> = new Map();
  // players who disconnected mid-game, keyed by persistent player UUID
  private disconnectedPlayers: Map<string, PlayerInfo> = new Map();
  // tracks whether a disconnected player had already acted in the turn they left
  private disconnectedTurnInfo: Map<string, { hadActed: boolean; turn: number }> = new Map();
  private nextPlayerId = 1;

  constructor(id: string, name: string, initialState?: GameState, settings?: Partial<CreateRoomRequest>) {
    this.id = id;
    this.name = name;
    this.isPrivate = settings?.isPrivate ?? false;
    this.maxPlayers = clampMaxPlayers(settings?.maxPlayers);
    this.passwordHash = settings?.password?.trim() || null;
    this.state = initialState ?? generateMap();
  }

  static fromSnapshot(id: string, name: string, gameState: GameState, settings?: Partial<CreateRoomRequest>): GameRoom {
    const room = new GameRoom(id, name, gameState, settings);
    room.status = 'playing';
    return room;
  }

  public getRoomInfo(): RoomInfo {
    const connected = Array.from(this.players.values());
    const disconnected = Array.from(this.disconnectedPlayers.values()).map(p => ({
      ...p,
      isDisconnected: true,
    }));
    return {
      id: this.id,
      name: this.name,
      players: [...connected, ...disconnected],
      status: this.status,
      hostPlayerId: this.getHostPlayerId(),
      isPrivate: this.isPrivate,
      hasPassword: this.passwordHash !== null,
      maxPlayers: this.maxPlayers,
    };
  }

  public async canJoin(password?: string): Promise<boolean> {
    if (this.passwordHash === null) return true;
    if (!password) return false;
    return bcrypt.compare(password, this.passwordHash);
  }

  public getSettings(): CreateRoomRequest {
    return {
      name: this.name,
      isPrivate: this.isPrivate,
      password: this.passwordHash ?? '',
      maxPlayers: this.maxPlayers,
    };
  }

  public hasOpenSeat(): boolean {
    return this.countRole('player') < this.maxPlayers;
  }

  public isHost(socketId: string): boolean {
    return this.hasRole(socketId, 'host');
  }

  public canManageRoom(socketId: string): boolean {
    return this.hasRole(socketId, 'host') || this.hasRole(socketId, 'admin');
  }

  public updateSettings(settings: UpdateRoomSettingsRequest): void {
    if (settings.name !== undefined) {
      const name = settings.name.trim();
      if (name) this.name = name;
    }

    if (settings.isPrivate !== undefined) {
      this.isPrivate = Boolean(settings.isPrivate);
    }

    if (settings.password !== undefined) {
      this.passwordHash = settings.password.trim() || null;
    }

    if (settings.maxPlayers !== undefined) {
      this.maxPlayers = Math.max(this.countRole('player'), clampMaxPlayers(settings.maxPlayers));
    }
  }

  public addPlayer(socketId: string, name: string, persistentId?: string): string | undefined {
    if (this.players.has(socketId)) return undefined;

    // Displacing an active connection from another device
    if (persistentId && this.persistentIdToSocketId.has(persistentId)) {
      const oldSocketId = this.persistentIdToSocketId.get(persistentId)!;
      const playerInfo = this.players.get(oldSocketId);
      if (playerInfo) {
        this.players.delete(oldSocketId);
        this.socketToPersistentId.delete(oldSocketId);
        
        playerInfo.id = socketId;
        this.players.set(socketId, playerInfo);
        this.socketToPersistentId.set(socketId, persistentId);
        this.persistentIdToSocketId.set(persistentId, socketId);
        return oldSocketId;
      }
    }

    // Reconnecting a previously disconnected player
    if (persistentId && this.disconnectedPlayers.has(persistentId)) {
      const playerInfo = this.disconnectedPlayers.get(persistentId)!;
      playerInfo.id = socketId;
      this.players.set(socketId, playerInfo);
      this.disconnectedPlayers.delete(persistentId);
      this.socketToPersistentId.set(socketId, persistentId);
      this.persistentIdToSocketId.set(persistentId, socketId);

      // Restore their turn state
      const info = this.disconnectedTurnInfo.get(persistentId);
      this.disconnectedTurnInfo.delete(persistentId);
      const turnState = playerInfo.playerId === null ? null : this.state.turnState.playerTurns[playerInfo.playerId];
      if (turnState) {
        turnState.hasActed = (info && info.turn === this.state.turn) ? info.hadActed : false;
      }
      return undefined;
    }

    const newPlayer: PlayerInfo = {
      id: socketId,
      playerId: this.nextPlayerId,
      name,
      color: this.getDefaultColor(),
      isReady: false,
      roles: this.players.size === 0 && this.disconnectedPlayers.size === 0 ? ['host', 'player'] : ['player'],
    };
    this.players.set(socketId, newPlayer);
    if (this.hostPlayerId === null && newPlayer.playerId !== null) {
      this.hostPlayerId = newPlayer.playerId;
    }
    this.nextPlayerId++;

    if (persistentId) {
      this.socketToPersistentId.set(socketId, persistentId);
      this.persistentIdToSocketId.set(persistentId, socketId);
    }
    return undefined;
  }

  // force=true: remove completely even during an active game (voluntary leave)
  // force=false (default): move to disconnectedPlayers during 'playing' so they can reconnect
  public removePlayer(socketId: string, force = false): void {
    const player = this.players.get(socketId);
    if (!player) return;

    if (this.status === 'playing' && !force) {
      const persistentId = this.socketToPersistentId.get(socketId);
      if (persistentId) {
        this.disconnectedPlayers.set(persistentId, { ...player });
        const turnState = player.playerId === null ? null : this.state.turnState.playerTurns[player.playerId];
        // Save whether they'd already acted this turn before forcing hasActed=true
        this.disconnectedTurnInfo.set(persistentId, {
          hadActed: turnState?.hasActed ?? false,
          turn: this.state.turn,
        });
        if (turnState) turnState.hasActed = true;
      }
    }

    this.players.delete(socketId);
    if (this.status === 'waiting') {
      this.recalculateWaitingRoomPlayerSlots();
      this.ensureHostExists();
    }
    const persistentId = this.socketToPersistentId.get(socketId);
    if (persistentId) {
      this.socketToPersistentId.delete(socketId);
      this.persistentIdToSocketId.delete(persistentId);
      if (force) this.disconnectedTurnInfo.delete(persistentId);
    }
  }

  public isEmpty(): boolean {
    return this.players.size === 0;
  }

  public hasDisconnectedPlayers(): boolean {
    return this.disconnectedPlayers.size > 0;
  }

  public hasDisconnectedPlayer(persistentId: string): boolean {
    return this.disconnectedPlayers.has(persistentId);
  }

  public hasActivePlayer(persistentId: string): boolean {
    return this.persistentIdToSocketId.has(persistentId);
  }

  public markPlayerDisconnected(persistentId: string, playerInfo: PlayerInfo): void {
    this.disconnectedPlayers.set(persistentId, {
      ...playerInfo,
      roles: playerInfo.roles ?? ['player'],
    });
  }

  public getPlayerInfo(socketId: string): PlayerInfo | null {
    return this.players.get(socketId) ?? null;
  }

  public setPlayerReady(socketId: string, isReady: boolean): void {
    const player = this.players.get(socketId);
    if (player && player.roles.includes('player')) {
      player.isReady = isReady;
    }
  }

  public setPlayerColor(socketId: string, color: number): boolean {
    const player = this.players.get(socketId);
    if (!player || this.status !== 'waiting') return false;
    if (!Number.isInteger(color) || color < 0x000000 || color > 0xFFFFFF) return false;

    const colorIsTaken = Array.from(this.players.values()).some(
      otherPlayer => otherPlayer.id !== socketId && otherPlayer.color === color
    );
    if (colorIsTaken) return false;

    player.color = color;
    player.isReady = false;
    return true;
  }

  public areAllPlayersReady(): boolean {
    const activePlayers = Array.from(this.players.values()).filter(player => player.roles.includes('player'));
    if (activePlayers.length === 0) return false;
    for (const player of activePlayers) {
      if (!player.isReady) return false;
    }
    return true;
  }

  public startGame(): void {
    this.status = 'playing';
    this.state = generateMap(this.getGamePlayers());
    startTurn(this.state);
    this.skipDisconnectedPlayers();
    this.onGameStart?.();
    this.onTurnEnd?.(this.state); // save initial snapshot
  }

  public getState(): GameState {
    return this.state;
  }

  public regenerateMap(): void {
    this.state = generateMap(this.getGamePlayers());
    startTurn(this.state);
    this.skipDisconnectedPlayers();
  }

  public handleAction(action: GameAction, playerId: number): boolean {
    const result = handleAction(this.state, action, playerId);
    const skippedPlayersChanged = skipPlayersWithNoTiles(this.state);

    if (result.actionAccepted && haveAllPlayersActed(this.state)) {
      this.state.turn++;
      startTurn(this.state);
      this.skipDisconnectedPlayers();
      this.onTurnEnd?.(this.state);
    }

    return result.stateChanged || skippedPlayersChanged;
  }

  public previewAttack(attackerId: number, defenderId: number): boolean {
    return previewAttack(this.state, attackerId, defenderId);
  }

  public getPlayerGameId(socketId: string): number | null {
    const player = this.players.get(socketId);
    if (!player?.roles.includes('player')) return null;
    return player.playerId;
  }

  public kickPlayer(targetSocketId: string): boolean {
    const target = this.players.get(targetSocketId);
    if (!target) return false;
    if (target.roles.includes('host') && this.countRole('host') <= 1) return false;

    this.removePlayer(targetSocketId, true);
    this.ensureHostExists();
    return true;
  }

  public updateRole(targetSocketId: string, role: RoomRole, enabled: boolean): boolean {
    const target = this.players.get(targetSocketId);
    if (!target || role === 'host') return false;
    if (role === 'player' && enabled && !target.roles.includes('player') && !this.hasOpenSeat()) return false;

    if (enabled) {
      this.addRole(target, role);
    } else {
      this.removeRole(target, role);
    }

    this.recalculateWaitingRoomPlayerSlots();
    this.ensureHostExists();
    return true;
  }

  public transferHost(targetSocketId: string): boolean {
    const target = this.players.get(targetSocketId);
    if (!target) return false;

    for (const player of this.players.values()) {
      player.roles = player.roles.filter(role => role !== 'host');
    }

    this.addRole(target, 'host');
    this.hostPlayerId = target.playerId;
    return true;
  }

  private skipDisconnectedPlayers(): void {
    for (const playerInfo of this.disconnectedPlayers.values()) {
      if (!playerInfo.roles.includes('player') || playerInfo.playerId === null) continue;
      const turnState = this.state.turnState.playerTurns[playerInfo.playerId];
      if (turnState) turnState.hasActed = true;
    }
  }

  private getDefaultColor(): number {
    const takenColors = new Set(Array.from(this.players.values()).map(player => player.color));
    const presetColor = PLAYER_COLORS.find(color => !takenColors.has(color));
    if (presetColor !== undefined) return presetColor;

    for (let offset = 0; offset < 99; offset++) {
      const color = generatePlayerColor(this.nextPlayerId + offset);
      if (!takenColors.has(color)) return color;
    }

    return generatePlayerColor(this.nextPlayerId);
  }

  private recalculateWaitingRoomPlayerSlots(): void {
    const playersByOldSlot = Array.from(this.players.values())
      .filter(player => player.roles.includes('player'))
      .sort((a, b) => (a.playerId ?? 9999) - (b.playerId ?? 9999));
    let nextPlayerId = 1;

    for (const player of playersByOldSlot) {
      player.playerId = nextPlayerId;
      nextPlayerId++;
    }

    for (const player of this.players.values()) {
      if (!player.roles.includes('player')) {
        player.playerId = null;
        player.isReady = false;
      }
    }

    this.nextPlayerId = nextPlayerId;
    this.hostPlayerId = this.getHostPlayerId();
  }

  private getGamePlayers(): Record<number, Player> {
    return Object.fromEntries(
      Array.from(this.players.values())
      .filter(player => player.roles.includes('player') && player.playerId !== null)
      .map(player => [
        player.playerId as number,
        {
          id: player.playerId as number,
          name: player.name,
          color: player.color,
        },
      ])
    );
  }

  private hasRole(socketId: string, role: RoomRole): boolean {
    return this.players.get(socketId)?.roles.includes(role) ?? false;
  }

  private countRole(role: RoomRole): number {
    return Array.from(this.players.values()).filter(player => player.roles.includes(role)).length;
  }

  private addRole(player: PlayerInfo, role: RoomRole): void {
    if (!player.roles.includes(role)) {
      player.roles.push(role);
    }

    if (role === 'player') {
      player.roles = player.roles.filter(existingRole => existingRole !== 'spectator');
      if (player.playerId === null) {
        player.playerId = this.nextPlayerId;
        this.nextPlayerId++;
      }
    }

    if (role === 'spectator') {
      player.roles = player.roles.filter(existingRole => existingRole !== 'player');
      player.playerId = null;
      player.isReady = false;
    }
  }

  private removeRole(player: PlayerInfo, role: RoomRole): void {
    if (role === 'player') {
      if (!player.roles.includes('spectator')) {
        player.roles.push('spectator');
      }
      player.playerId = null;
      player.isReady = false;
    }

    if (role === 'spectator' && !player.roles.includes('player')) {
      player.roles.push('player');
    }

    player.roles = player.roles.filter(existingRole => existingRole !== role);
  }

  private ensureHostExists(): void {
    if (this.countRole('host') > 0) {
      this.hostPlayerId = this.getHostPlayerId();
      return;
    }

    const nextHost = Array.from(this.players.values())[0];
    if (nextHost) {
      this.addRole(nextHost, 'host');
      this.hostPlayerId = nextHost.playerId;
    } else {
      this.hostPlayerId = null;
    }
  }

  private getHostPlayerId(): number | null {
    return Array.from(this.players.values()).find(player => player.roles.includes('host'))?.playerId ?? null;
  }
}

function clampMaxPlayers(maxPlayers?: number): number {
  return Math.max(2, Math.min(99, Number(maxPlayers) || 6));
}

function generatePlayerColor(playerId: number): number {
  const hue = (playerId * 137.508) % 360;
  return hslToRgbNumber(hue, 68, 52);
}

function hslToRgbNumber(h: number, s: number, l: number): number {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lightness - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return (
    (Math.round((r + m) * 255) << 16) |
    (Math.round((g + m) * 255) << 8) |
    Math.round((b + m) * 255)
  );
}
