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
  phase: 'placement' | 'playing';
  turnState: TurnState;
  tileTypes: Record<string, TileType>;
  mapWidth: number;
  mapHeight: number;
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

export type RoomRole = 'host' | 'admin' | 'player' | 'spectator';

export interface PlayerInfo {
  id: string; // Socket ID or generated ID
  playerId: number | null;
  name: string;
  color: number;
  isReady: boolean;
  roles: RoomRole[];
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
  mapSettings: MapSettings;
}

export interface RoleUpdateRequest {
  targetSocketId: string;
  role: RoomRole;
  enabled: boolean;
}

export interface TransferHostRequest {
  targetSocketId: string;
}

export interface RoomSettingsRequest {
  name: string;
  isPrivate: boolean;
  password?: string;
  maxPlayers: number;
  mapSettings?: Partial<MapSettings>;
}

export type CreateRoomRequest = RoomSettingsRequest;

export interface UpdateRoomSettingsRequest extends Partial<RoomSettingsRequest> {
  mapSettings?: Partial<MapSettings>;
}

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

export interface MapSettings {
  width: number;
  height: number;
  seed?: number;
  seaLevel: number;
  landTileSize: number;
  seaTileSize: number;
  maxCities: number;
  cityMinDistRatio: number;
  noiseWavelength: number;
  noiseOctaves: number;
  noisePersistence: number;
  noiseLacunarity: number;
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  width: 2000,
  height: 2000,
  seaLevel: 0.48,
  landTileSize: 42,
  seaTileSize: 84,
  maxCities: 20,
  cityMinDistRatio: 0.1,
  noiseWavelength: 750,
  noiseOctaves: 6,
  noisePersistence: 0.5,
  noiseLacunarity: 2.0,
};

// Action Types for Client -> Server communication
export type GameAction =
  | { type: 'SUBMIT_PLAN'; actionType: PlannedActionType; targetTileIds: number[]; defenderId?: number }
  | { type: 'END_TURN' }
  | { type: 'PLACE_START'; tileId: number }
  | { type: 'CONFIRM_PLACEMENT' };
