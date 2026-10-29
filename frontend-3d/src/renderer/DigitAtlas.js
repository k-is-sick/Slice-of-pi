/**
 * DigitAtlas.js — Procedural canvas SDF/crisp glyph atlas for digits '0'-'9'
 * Generates a 512x64 texture containing 10 equal cells for digits 0-9.
 */

import * as THREE from 'three';

let cachedTexture = null;

export function getDigitAtlasTexture() {
  if (cachedTexture) return cachedTexture;

  const w = 512;
  const h = 64;
  const cellW = w / 10;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px "JetBrains Mono", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let d = 0; d < 10; d++) {
    const cx = d * cellW + cellW / 2;
    const cy = h / 2;
    // Draw with slight shadow for clean contrast
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(String(d), cx, cy);
  }

  cachedTexture = new THREE.CanvasTexture(canvas);
  cachedTexture.minFilter = THREE.LinearFilter;
  cachedTexture.magFilter = THREE.LinearFilter;
  cachedTexture.generateMipmaps = false;
  return cachedTexture;
}

