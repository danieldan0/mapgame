import { Delaunay } from 'd3-delaunay';
import type { GameState, Player, Tile } from '@mapgame/shared';
import { MAP_WIDTH, MAP_HEIGHT, NUM_POINTS, DEFAULT_TILE_TYPES, DEFAULT_PLAYERS } from '../constants';

export function generateMap(players: Record<number, Player> = DEFAULT_PLAYERS): GameState {
  const points = new Float64Array(NUM_POINTS * 2);
  for (let i = 0; i < NUM_POINTS; i++) {
    points[i * 2] = Math.random() * MAP_WIDTH;
    points[i * 2 + 1] = Math.random() * MAP_HEIGHT;
  }
  
  let delaunay = new Delaunay(points);
  let voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);
  
  // Lloyd's relaxation
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < NUM_POINTS; i++) {
      const polygon = voronoi.cellPolygon(i);
      if (!polygon) continue;
      
      let cx = 0, cy = 0;
      for (let j = 0; j < polygon.length - 1; j++) {
        cx += polygon[j][0];
        cy += polygon[j][1];
      }
      cx /= (polygon.length - 1);
      cy /= (polygon.length - 1);
      
      points[i * 2] = cx;
      points[i * 2 + 1] = cy;
    }
    delaunay = new Delaunay(points);
    voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);
  }
  
  const tiles: Record<number, Tile> = {};
  
  // 1. Build initial tiles and adjacency graph
  for (let i = 0; i < NUM_POINTS; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon) continue;
    
    const flatPoints: number[] = [];
    for (const [x, y] of polygon) {
      flatPoints.push(x, y);
    }
    
    tiles[i] = {
      id: i,
      points: flatPoints,
      neighbors: Array.from(voronoi.neighbors(i)),
      typeId: Math.random() > 0.7 ? 'sea' : 'land', // Simple random distribution
      ownerId: null,
    };
  }

  // 2. Place cities (spread apart)
  let citiesPlaced = 0;
  const maxCities = 15;
  const tileIds = Object.keys(tiles).map(Number).sort(() => Math.random() - 0.5); // Shuffle
  
  for (const id of tileIds) {
    if (citiesPlaced >= maxCities) break;
    const tile = tiles[id];
    
    // Check if neighbors have a city
    let hasCityNeighbor = false;
    for (const nId of tile.neighbors) {
      if (tiles[nId] && tiles[nId].typeId === 'city') {
        hasCityNeighbor = true;
        break;
      }
    }
    
    if (!hasCityNeighbor && tile.typeId === 'land') {
      tile.typeId = 'city';
      citiesPlaced++;
    }
  }

  // 3. Assign starting locations to players
  const playerIds = Object.keys(players).map(Number);
  for (const playerId of playerIds) {
    // Find a random land or city tile that is not owned
    const availableStartTiles = Object.values(tiles).filter(t => t.ownerId === null && t.typeId !== 'sea');
    if (availableStartTiles.length > 0) {
      const startTile = availableStartTiles[Math.floor(Math.random() * availableStartTiles.length)];
      startTile.ownerId = playerId;
    }
  }
  
  return {
    tiles,
    players: { ...players },
    turn: 1,
    tileTypes: { ...DEFAULT_TILE_TYPES },
  };
}
