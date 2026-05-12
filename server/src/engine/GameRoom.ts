import type { GameState, GameAction, Player, RoomInfo, PlayerInfo } from '@mapgame/shared';
import { PLAYER_COLORS } from '../constants';
import { generateMap } from '../mapgen/generateMap';
import { handleAction } from './gameEngine';

export class GameRoom {
  public id: string;
  public name: string;
  public status: 'waiting' | 'playing' = 'waiting';
  private state: GameState;
  private players: Map<string, PlayerInfo> = new Map();
  private nextPlayerId = 1;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.state = generateMap();
  }

  public getRoomInfo(): RoomInfo {
    return {
      id: this.id,
      name: this.name,
      players: Array.from(this.players.values()),
      status: this.status,
    };
  }

  public addPlayer(socketId: string, name: string): void {
    if (!this.players.has(socketId)) {
      this.players.set(socketId, {
        id: socketId,
        playerId: this.nextPlayerId,
        name,
        color: this.getDefaultColor(),
        isReady: false,
      });
      this.nextPlayerId++;
    }
  }

  public removePlayer(socketId: string): void {
    this.players.delete(socketId);
  }

  public isEmpty(): boolean {
    return this.players.size === 0;
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
  }

  public getState(): GameState {
    return this.state;
  }

  public regenerateMap(): void {
    this.state = generateMap(this.getGamePlayers());
  }

  public handleAction(action: GameAction, playerId: number): boolean {
    return handleAction(this.state, action, playerId);
  }

  public getPlayerGameId(socketId: string): number | null {
    return this.players.get(socketId)?.playerId ?? null;
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

