import type { GameState, GameAction, RoomInfo, PlayerInfo } from '@mapgame/shared';
import { generateMap } from '../mapgen/generateMap';
import { handleAction } from './gameEngine';

export class GameRoom {
  public id: string;
  public name: string;
  public status: 'waiting' | 'playing' = 'waiting';
  private state: GameState;
  private players: Map<string, PlayerInfo> = new Map();

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
      this.players.set(socketId, { id: socketId, name, isReady: false });
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

  public areAllPlayersReady(): boolean {
    if (this.players.size === 0) return false;
    for (const player of this.players.values()) {
      if (!player.isReady) return false;
    }
    return true;
  }

  public startGame(): void {
    this.status = 'playing';
    this.state = generateMap();
  }

  public getState(): GameState {
    return this.state;
  }

  public regenerateMap(): void {
    this.state = generateMap();
  }

  public handleAction(action: GameAction, playerId: number): boolean {
    return handleAction(this.state, action, playerId);
  }
}

