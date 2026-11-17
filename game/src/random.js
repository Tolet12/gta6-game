// Seeded randomness (mulberry32). The whole city is derived from one seed so
// a given ?seed= always builds the same Palmera Bay.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.next = mulberry32(seed); }
  float() { return this.next(); }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); } // inclusive
  pick(list) { return list[Math.floor(this.next() * list.length) % list.length]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

export function seedFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get('seed');
    const n = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 7;
  } catch { return 7; }
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
// Shortest-path angle interpolation.
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
