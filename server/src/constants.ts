import type { TileType, Player } from '@mapgame/shared';

export const MAP_WIDTH = 2000;
export const MAP_HEIGHT = 2000;
export const NUM_POINTS = 300;

export const DEFAULT_TILE_TYPES: Record<string, TileType> = {
  land: { id: 'land', name: 'Land', color: 0x228B22 },
  sea: { id: 'sea', name: 'Sea', color: 0x4682B4 },
  city: { id: 'city', name: 'City', color: 0x808080 },
};

export const DEFAULT_PLAYERS: Record<number, Player> = {
  1: { id: 1, name: 'Player 1', color: 0xFF4500 },
  2: { id: 2, name: 'Player 2', color: 0x1E90FF },
};
