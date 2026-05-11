export interface PolygonData {
  id: string;
  points: number[]; // [x, y, x, y, ...]
  terrainColor: number;
  ownerColor?: number;
}