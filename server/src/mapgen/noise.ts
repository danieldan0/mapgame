/** 2D Perlin noise and fBm (fractional Brownian motion). */
export class PerlinNoise {
  private readonly perm: Uint8Array;

  constructor(seed = Math.random()) {
    this.perm = new Uint8Array(512);
    const p = Array.from({ length: 256 }, (_, i) => i);

    // Seeded Fisher-Yates shuffle using a simple LCG
    let s = (seed * 0xffffffff) >>> 0;
    for (let i = 255; i > 0; i--) {
      s = Math.imul(s, 1664525) + 1013904223 >>> 0;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }

    for (let i = 0; i < 256; i++) {
      this.perm[i] = this.perm[i + 256] = p[i];
    }
  }

  noise2d(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const u = fade(fx);
    const v = fade(fy);

    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];

    return lerp(v,
      lerp(u, grad(aa, fx, fy),       grad(ba, fx - 1, fy)),
      lerp(u, grad(ab, fx, fy - 1),   grad(bb, fx - 1, fy - 1)),
    );
  }

  /**
   * Fractional Brownian motion — sums multiple noise octaves.
   * Returns a value approximately in [-1, 1].
   */
  fbm(x: number, y: number, octaves = 6, persistence = 0.5, lacunarity = 2.0): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise2d(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
