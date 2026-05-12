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
  tileTypes: Record<string, TileType>;
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
  | { type: 'ATTACK'; sourceTileId: number; targetTileId: number }
  | { type: 'EXPAND'; sourceTileId: number; targetTileId: number } // Claim unoccupied land
  | { type: 'END_TURN' };

