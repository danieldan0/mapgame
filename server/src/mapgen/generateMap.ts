import { Delaunay } from 'd3-delaunay';
import type { GameState, Player, Tile } from '@mapgame/shared';
import { MAP_WIDTH, MAP_HEIGHT, DEFAULT_TILE_TYPES, DEFAULT_PLAYERS } from '../constants';
import { PerlinNoise } from './noise';
import { poissonDiskSample } from './poisson';

// --- Tuneable parameters ---

// Noise: one base "wavelength" covers this many map units -> controls continent scale.
const BASE_WAVELENGTH = 750;
const OCTAVES = 6;
const PERSISTENCE = 0.5;
const LACUNARITY = 2.0;

// Height above which a tile is land (after normalising noise to [0, 1]).
// ~0.48 produces roughly 50% land cover; raise for more sea, lower for more land.
const SEA_LEVEL = 0.48;

// Poisson disk radii: land tiles are small, sea tiles are large.
const R_LAND = 42;   // minimum separation on land -> dense small tiles
const R_SEA  = 84;   // minimum separation at sea  -> ~2× land radius, ~4× land area

// City placement: minimum Euclidean distance between any two city centres.
const CITY_MIN_DIST = 200;
const MAX_CITIES = 20;

// --- Map generation ---

export function generateMap(players: Record<number, Player> = DEFAULT_PLAYERS): GameState {
  const noise = new PerlinNoise();
  const baseFreq = 1 / BASE_WAVELENGTH;

  /**
   * Returns a height value in [0, 1].
   * Perlin fBm output sits in roughly [-0.75, 0.75], so we scale and clamp.
   */
  function heightAt(x: number, y: number): number {
    const raw = noise.fbm(x * baseFreq, y * baseFreq, OCTAVES, PERSISTENCE, LACUNARITY);
    return Math.max(0, Math.min(1, (raw / 0.75 + 1) / 2));
  }

  function radiusAt(x: number, y: number): number {
    return heightAt(x, y) >= SEA_LEVEL ? R_LAND : R_SEA;
  }

  // 1. Generate tile centres via variable-density Poisson disk sampling.
  const centres = poissonDiskSample(MAP_WIDTH, MAP_HEIGHT, radiusAt, R_LAND, R_SEA);

  // 2. Build Voronoi tessellation.
  const flat = new Float64Array(centres.length * 2);
  for (let i = 0; i < centres.length; i++) {
    flat[i * 2]     = centres[i][0];
    flat[i * 2 + 1] = centres[i][1];
  }
  const delaunay = new Delaunay(flat);
  const voronoi  = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);

  // 3. Build tiles; assign land/sea from the height map.
  const tiles: Record<number, Tile> = {};
  for (let i = 0; i < centres.length; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon) continue;

    const pts: number[] = [];
    for (const [x, y] of polygon) pts.push(x, y);

    const [cx, cy] = centres[i];
    tiles[i] = {
      id: i,
      points: pts,
      neighbors: Array.from(voronoi.neighbors(i)),
      typeId: heightAt(cx, cy) >= SEA_LEVEL ? 'land' : 'sea',
      ownerId: null,
    };
  }

  // 4. Place cities on land tiles, well-spaced via Euclidean distance.
  const landIds = Object.keys(tiles)
    .map(Number)
    .filter(id => tiles[id].typeId === 'land');

  // Shuffle
  for (let i = landIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [landIds[i], landIds[j]] = [landIds[j], landIds[i]];
  }

  const cityCentres: [number, number][] = [];
  for (const id of landIds) {
    if (cityCentres.length >= MAX_CITIES) break;
    const [cx, cy] = centres[id];
    const tooClose = cityCentres.some(([px, py]) => {
      const dx = cx - px, dy = cy - py;
      return dx * dx + dy * dy < CITY_MIN_DIST * CITY_MIN_DIST;
    });
    if (!tooClose) {
      tiles[id].typeId = 'city';
      cityCentres.push([cx, cy]);
    }
  }

  return {
    tiles,
    players: { ...players },
    turn: 1,
    phase: 'placement',
    turnState: { playerTurns: {}, defenseRolls: {} },
    tileTypes: { ...DEFAULT_TILE_TYPES },
  };
}
