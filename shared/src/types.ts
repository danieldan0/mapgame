export interface TileType {
  id: 'land' | 'sea' | 'city';
  name: string;
  color: number;
}

export interface Player {
  id: number;
  color: number;
  name: string;
}

export interface Tile {
  id: number;
  points: number[];
  neighbors: number[]; // Adjacency graph
  typeId: 'land' | 'sea' | 'city';
  ownerId: number | null;
}

export interface GameState {
  tiles: Record<number, Tile>;
  players: Record<number, Player>;
  turn: number;
  turnState: TurnState;
  tileTypes: Record<string, TileType>;
}

export type PlannedActionType = 'EXPAND' | 'ATTACK';

export interface PlayerTurnState {
  roll: number;
  power: number;
  dieSize: number;
  hasActed: boolean;
}

export interface DefenseRoll {
  attackerId: number;
  defenderId: number;
  roll: number;
  power: number;
  dieSize: number;
}

export interface TurnState {
  playerTurns: Record<number, PlayerTurnState>;
  defenseRolls: Record<string, DefenseRoll>;
}

export interface PlayerInfo {
  id: string; // Socket ID or generated ID
  playerId: number;
  name: string;
  color: number;
  isReady: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  players: PlayerInfo[];
  status: 'waiting' | 'playing';
}

// Action Types for Client -> Server communication
export type GameAction = 
  | { type: 'SUBMIT_PLAN'; actionType: PlannedActionType; targetTileIds: number[]; defenderId?: number }
  | { type: 'END_TURN' };

