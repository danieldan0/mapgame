import { Delaunay } from 'd3-delaunay';
import type { GameState, MapSettings, Player, Tile } from '@mapgame/shared';
import { DEFAULT_RULE_SETTINGS } from '@mapgame/shared';
import { DEFAULT_TILE_TYPES, DEFAULT_PLAYERS } from '../constants';
import { PerlinNoise } from './noise';
import { poissonDiskSample } from './poisson';
import { makeRng } from './rng';

export function generateMap(
  players: Record<number, Player> = DEFAULT_PLAYERS,
  settings: Partial<MapSettings> = {},
): GameState {
  const width            = settings.width            ?? 2000;
  const height           = settings.height           ?? 2000;
  const seaLevel         = settings.seaLevel         ?? 0.48;
  const rLand            = settings.landTileSize     ?? 42;
  const rSea             = settings.seaTileSize      ?? 84;
  const maxCities        = settings.maxCities        ?? 20;
  const cityMinDist      = width * (settings.cityMinDistRatio ?? 0.1);
  const baseWavelength   = settings.noiseWavelength  ?? 750;
  const octaves          = settings.noiseOctaves     ?? 6;
  const persistence      = settings.noisePersistence ?? 0.5;
  const lacunarity       = settings.noiseLacunarity  ?? 2.0;

  const seed = settings.seed ?? 0;
  const noise = new PerlinNoise(seed);
  const rng = makeRng(seed ^ 0x9e3779b9);
  const baseFreq = 1 / baseWavelength;

  function heightAt(x: number, y: number): number {
    const raw = noise.fbm(x * baseFreq, y * baseFreq, octaves, persistence, lacunarity);
    return Math.max(0, Math.min(1, (raw / 0.75 + 1) / 2));
  }

  function radiusAt(x: number, y: number): number {
    const h = heightAt(x, y);
    if (h >= seaLevel) return rLand;
    // Sea only: transition from rLand at the coast to rSea in open water.
    const margin = 0.08;
    const t = Math.min(1, (seaLevel - h) / margin);
    return rLand + (rSea - rLand) * t;
  }

  // 1. Generate tile centres via variable-density Poisson disk sampling.
  const centres = poissonDiskSample(width, height, radiusAt, rLand, rSea, 30, rng);

  // 2. Build Voronoi tessellation.
  const flat = new Float64Array(centres.length * 2);
  for (let i = 0; i < centres.length; i++) { flat[i*2] = centres[i][0]; flat[i*2+1] = centres[i][1]; }
  const voronoi = new Delaunay(flat).voronoi([0, 0, width, height]);

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
      typeId: heightAt(cx, cy) >= seaLevel ? 'land' : 'sea',
      ownerId: null,
    };
  }

  // 4. Place cities on land tiles, well-spaced via Euclidean distance.
  const landIds = Object.keys(tiles)
    .map(Number)
    .filter(id => tiles[id].typeId === 'land');

  for (let i = landIds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [landIds[i], landIds[j]] = [landIds[j], landIds[i]];
  }

  const cityCentres: [number, number][] = [];
  for (const id of landIds) {
    if (cityCentres.length >= maxCities) break;
    const [cx, cy] = centres[id];
    const tooClose = cityCentres.some(([px, py]) => {
      const dx = cx - px, dy = cy - py;
      return dx * dx + dy * dy < cityMinDist * cityMinDist;
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
    mapWidth: width,
    mapHeight: height,
    rules: { ...DEFAULT_RULE_SETTINGS, expandRoll: { ...DEFAULT_RULE_SETTINGS.expandRoll }, attackRoll: { ...DEFAULT_RULE_SETTINGS.attackRoll }, defendRoll: { ...DEFAULT_RULE_SETTINGS.defendRoll } },
  };
}
