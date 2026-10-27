/**
 * palette.js — 10-colour perceptual digit palette
 *
 * Digits 0–9 are assigned distinct, colour-blind-safe HSL colours
 * in a cyan → magenta → gold ramp.
 * Each entry: { r, g, b } in 0-255 range.
 */

// HSL → RGB helper
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// 10 colours: perceptual cyan→violet→magenta→red→orange→gold ramp
// Designed to be distinguishable under common CVD simulations
const DIGIT_HSL = [
  [195, 85, 62],   // 0 – cyan
  [220, 78, 68],   // 1 – periwinkle
  [258, 72, 68],   // 2 – lavender
  [290, 68, 63],   // 3 – violet-magenta
  [325, 76, 62],   // 4 – rose
  [352, 74, 62],   // 5 – coral-red
  [22,  84, 63],   // 6 – amber
  [42,  88, 60],   // 7 – gold
  [80,  70, 56],   // 8 – yellow-green
  [155, 68, 55],   // 9 – teal
];

export const PALETTE = DIGIT_HSL.map(([h, s, l]) => hslToRgb(h, s, l));

// Pre-compute CSS strings for HUD use
export const PALETTE_CSS = PALETTE.map(
  ({ r, g, b }) => `rgb(${r},${g},${b})`
);

// Dot sizes: 1.5 + 0.5*(digit/9) — bigger for higher digits
export function dotSize(digit) {
  return 1.5 + 0.5 * (digit / 9);
}

// Alpha for normal (unselected) dots
export const DOT_ALPHA = 0.75;
// Alpha for dimmed dots (during arrival)
export const DOT_ALPHA_DIM = 0.18;
