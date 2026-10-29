/**
 * math.js — Shared math utilities (double precision, no THREE dependency)
 */

import { SPIRAL_C, GOLDEN_ANGLE, DISC_THICKNESS } from './constants.js';

/**
 * Fast integer hash for z-jitter per digit.
 * Must produce the EXACT same value as the GLSL hash function in ChunkManager.js!
 * Returns float in [-1, 1].
 */
export function digitHash(i) {
  let x = (i ^ 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x >>> 0) / 4294967295.0) * 2.0 - 1.0;
}

/** Polar coords for digit i (double precision) */
export function phyllotaxisPolar(i) {
  const r = SPIRAL_C * Math.sqrt(i + 1);
  const theta = i * GOLDEN_ANGLE;
  return { r, theta };
}

/** World position for digit i */
export function phyllotaxisPos(i, zScale = 1.0) {
  const { r, theta } = phyllotaxisPolar(i);
  const thickness = DISC_THICKNESS * r;
  const z = thickness * digitHash(i) * zScale;
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
    z,
    r,
    theta,
  };
}

/**
 * Analytically compute the index range [iMin, iMax] of digits that could
 * appear in a circle centred at distance `d` from the origin, radius `h`.
 * Uses r = C*sqrt(i+1) => i = (r/C)^2 - 1
 */
export function visibleIndexRange(d, h, N) {
  const rMin = Math.max(0, d - h);
  const rMax = d + h;
  let iMin = Math.floor((rMin / SPIRAL_C) ** 2 - 1);
  let iMax = Math.ceil((rMax / SPIRAL_C) ** 2 - 1);
  iMin = Math.max(0, iMin);
  iMax = Math.min(N - 1, iMax);
  return { iMin, iMax };
}

/** Lerp */
export function lerp(a, b, t) { return a + (b - a) * t; }

/** Smoothstep */
export function smoothstep(t) { return t * t * (3 - 2 * t); }

/** Ease-in-out cubic */
export function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
