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
  isDisconnected?: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  players: PlayerInfo[];
  status: 'waiting' | 'playing';
  hostPlayerId: number | null;
  isPrivate: boolean;
  hasPassword: boolean;
  maxPlayers: number;
}

export interface RoomSettingsRequest {
  name: string;
  isPrivate: boolean;
  password?: string;
  maxPlayers: number;
}

export type CreateRoomRequest = RoomSettingsRequest;

export type UpdateRoomSettingsRequest = Partial<RoomSettingsRequest>;

export interface JoinRoomRequest {
  roomId: string;
  password?: string;
}

export interface InviteRoomInfo {
  roomId: string;
  roomName: string;
  status: 'waiting' | 'playing';
  hasPassword: boolean;
}

// Action Types for Client -> Server communication
export type GameAction = 
  | { type: 'SUBMIT_PLAN'; actionType: PlannedActionType; targetTileIds: number[]; defenderId?: number }
  | { type: 'END_TURN' };
