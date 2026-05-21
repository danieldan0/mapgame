/**
 * Variable-radius Poisson disk sampling using Bridson's algorithm.
 *
 * Each candidate point uses a minimum separation radius returned by `getRadius`.
 * The distance check between two points uses the average of their radii, producing
 * a smooth transition from dense (small-radius) land tiles to sparse (large-radius)
 * sea tiles.
 */
export function poissonDiskSample(
  width: number,
  height: number,
  getRadius: (x: number, y: number) => number,
  rMin: number,
  rMax: number,
  k = 30,
): [number, number][] {
  // Cell size guarantees at most one point per cell for the minimum radius.
  const cellSize = rMin / Math.SQRT2;
  const gridW = Math.ceil(width / cellSize) + 1;
  const gridH = Math.ceil(height / cellSize) + 1;

  // grid stores the index of the point in that cell, or -1 if empty.
  const grid = new Int32Array(gridW * gridH).fill(-1);

  const points: [number, number][] = [];
  const radii: number[] = [];
  const active: number[] = [];

  // How many cells to search around a candidate when checking neighbours.
  // Worst case: a neighbour has radius rMax, new point has radius rMax, so minimum
  // distance is rMax. Number of cells = ceil(rMax / cellSize) + 1.
  const searchCells = Math.ceil(rMax / cellSize) + 1;

  function cellIdx(x: number, y: number): number {
    return Math.floor(y / cellSize) * gridW + Math.floor(x / cellSize);
  }

  function addPoint(x: number, y: number): void {
    const idx = points.length;
    points.push([x, y]);
    radii.push(getRadius(x, y));
    grid[cellIdx(x, y)] = idx;
    active.push(idx);
  }

  function isValid(cx: number, cy: number, r: number): boolean {
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) return false;

    const gcx = Math.floor(cx / cellSize);
    const gcy = Math.floor(cy / cellSize);

    for (let dy = -searchCells; dy <= searchCells; dy++) {
      for (let dx = -searchCells; dx <= searchCells; dx++) {
        const nx = gcx + dx;
        const ny = gcy + dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;

        const idx = grid[ny * gridW + nx];
        if (idx === -1) continue;

        const [px, py] = points[idx];
        const minDist = (r + radii[idx]) / 2;
        const ddx = cx - px;
        const ddy = cy - py;
        if (ddx * ddx + ddy * ddy < minDist * minDist) return false;
      }
    }
    return true;
  }

  // Seed with a point near the centre.
  addPoint(
    width / 2 + (Math.random() - 0.5) * width * 0.1,
    height / 2 + (Math.random() - 0.5) * height * 0.1,
  );

  while (active.length > 0) {
    const ai = Math.floor(Math.random() * active.length);
    const pIdx = active[ai];
    const [px, py] = points[pIdx];
    const r = radii[pIdx];

    let placed = false;
    for (let attempt = 0; attempt < k; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = r + Math.random() * r; // annulus [r, 2r]
      const cx = px + Math.cos(angle) * dist;
      const cy = py + Math.sin(angle) * dist;
      const cr = getRadius(cx, cy);

      if (isValid(cx, cy, cr)) {
        addPoint(cx, cy);
        placed = true;
        break;
      }
    }

    if (!placed) {
      active[ai] = active[active.length - 1];
      active.pop();
    }
  }

  return points;
}
