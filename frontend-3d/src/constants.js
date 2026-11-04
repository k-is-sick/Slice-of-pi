/**
 * constants.js — Shared constants for the Slice of Pi 3D frontend
 */

/** Phyllotaxis spiral constant. r = C * sqrt(i+1) */
export const SPIRAL_C = 4.5;

/** Golden angle in radians */
export const GOLDEN_ANGLE = 137.50776405003785 * (Math.PI / 180);

/** Digit count per chunk fetched from /api/digits_bin */
export const CHUNK_SIZE = 65536;

/** Max chunks resident in memory at once (LRU pool) */
export const MAX_CHUNKS = 10;

/** Overview sample count (from /api/overview) */
export const OVERVIEW_N = 20000;

/** Disc half-thickness scale (fraction of r) */
export const DISC_THICKNESS = 0.08;

/** z-scale for 3D mode; 0 for 2D (orthographic flat) */
export let Z_SCALE = 1.0;

/** Colour palette for digits 0-9 (linear RGB, matched to warm star-atlas tones) */
export const DIGIT_PALETTE = [
  [0.78, 0.42, 0.30],  // 0 — warm rust
  [0.85, 0.70, 0.35],  // 1 — gold
  [0.40, 0.72, 0.55],  // 2 — seafoam
  [0.35, 0.58, 0.82],  // 3 — steel blue
  [0.72, 0.45, 0.80],  // 4 — lavender
  [0.88, 0.55, 0.32],  // 5 — amber
  [0.38, 0.70, 0.70],  // 6 — teal
  [0.80, 0.38, 0.52],  // 7 — rose
  [0.52, 0.80, 0.38],  // 8 — lime
  [0.65, 0.65, 0.80],  // 9 — periwinkle
];

const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

export const QUALITY_PRESETS = {
  high:   { pixelRatio: Math.min(dpr, 2),   starCount: 120000, bloom: true,  grain: true,  shadows: false },
  medium: { pixelRatio: Math.min(dpr, 1.5), starCount: 80000,  bloom: false, grain: true,  shadows: false },
  low:    { pixelRatio: 1,                  starCount: 40000,  bloom: false, grain: false, shadows: false },
};

export let currentQuality = 'medium';
export function setQuality(q) { currentQuality = q; }
export function setZScale(z) { Z_SCALE = z; }

