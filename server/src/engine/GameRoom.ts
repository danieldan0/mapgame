import type { GameState, GameAction, Player, RoomInfo, PlayerInfo } from '@mapgame/shared';
import { PLAYER_COLORS } from '../constants';
import { generateMap } from '../mapgen/generateMap';
import { handleAction, haveAllPlayersActed, previewAttack, skipPlayersWithNoTiles, startTurn } from './gameEngine';

export class GameRoom {
  public id: string;
  public name: string;
  public status: 'waiting' | 'playing' = 'waiting';

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

  constructor(id: string, name: string, initialState?: GameState) {
    this.id = id;
    this.name = name;
    this.state = initialState ?? generateMap();
  }

  static fromSnapshot(id: string, name: string, gameState: GameState): GameRoom {
    const room = new GameRoom(id, name, gameState);
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
    };
  }

  public addPlayer(socketId: string, name: string, persistentId?: string): void {
    if (this.players.has(socketId)) return;

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
      const turnState = this.state.turnState.playerTurns[playerInfo.playerId];
      if (turnState) {
        turnState.hasActed = (info && info.turn === this.state.turn) ? info.hadActed : false;
      }
      return;
    }

    const newPlayer: PlayerInfo = {
      id: socketId,
      playerId: this.nextPlayerId,
      name,
      color: this.getDefaultColor(),
      isReady: false,
    };
    this.players.set(socketId, newPlayer);
    this.nextPlayerId++;

    if (persistentId) {
      this.socketToPersistentId.set(socketId, persistentId);
      this.persistentIdToSocketId.set(persistentId, socketId);
    }
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
        const turnState = this.state.turnState.playerTurns[player.playerId];
        // Save whether they'd already acted this turn before forcing hasActed=true
        this.disconnectedTurnInfo.set(persistentId, {
          hadActed: turnState?.hasActed ?? false,
          turn: this.state.turn,
        });
        if (turnState) turnState.hasActed = true;
      }
    }

    this.players.delete(socketId);
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

  public markPlayerDisconnected(persistentId: string, playerInfo: PlayerInfo): void {
    this.disconnectedPlayers.set(persistentId, { ...playerInfo });
  }

  public getPlayerInfo(socketId: string): PlayerInfo | null {
    return this.players.get(socketId) ?? null;
  }

  public setPlayerReady(socketId: string, isReady: boolean): void {
    const player = this.players.get(socketId);
    if (player) {
      player.isReady = isReady;
    }
  }

  public setPlayerColor(socketId: string, color: number): boolean {
    const player = this.players.get(socketId);
    if (!player || this.status !== 'waiting') return false;
    if (!PLAYER_COLORS.includes(color)) return false;

    const colorIsTaken = Array.from(this.players.values()).some(
      otherPlayer => otherPlayer.id !== socketId && otherPlayer.color === color
    );
    if (colorIsTaken) return false;

    player.color = color;
    player.isReady = false;
    return true;
  }

  public areAllPlayersReady(): boolean {
    if (this.players.size === 0) return false;
    for (const player of this.players.values()) {
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
    return this.players.get(socketId)?.playerId ?? null;
  }

  private skipDisconnectedPlayers(): void {
    for (const playerInfo of this.disconnectedPlayers.values()) {
      const turnState = this.state.turnState.playerTurns[playerInfo.playerId];
      if (turnState) turnState.hasActed = true;
    }
  }

  private getDefaultColor(): number {
    const takenColors = new Set(Array.from(this.players.values()).map(player => player.color));
    return PLAYER_COLORS.find(color => !takenColors.has(color)) ?? PLAYER_COLORS[0];
  }

  private getGamePlayers(): Record<number, Player> {
    return Object.fromEntries(
      Array.from(this.players.values()).map(player => [
        player.playerId,
        {
          id: player.playerId,
          name: player.name,
          color: player.color,
        },
      ])
    );
  }
}
