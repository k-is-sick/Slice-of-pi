/**
 * Galaxies.js — 6-10 distant galaxy sprites generated procedurally on canvas.
 * Log-spiral arms + elliptical core, subtle dusty warm/blue tones.
 * Deep background (radius 850), fixed parallax ~0.
 */

import * as THREE from 'three';

function makeGalaxyTexture(seed, isSpiral = true) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const cx = size / 2;
  const cy = size / 2;

  // LCG pseudo-random generator
  let s = (seed ^ 0x9e3779b9) >>> 0;
  function rnd() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  }

  const armCount = 2 + Math.floor(rnd() * 2); // 2 or 3 arms
  const armTwist = 3.5 + rnd() * 2.0;
  const aspect = 0.4 + rnd() * 0.4; // tilt / elliptical flattening

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / (size * 0.45);
      const dy = (y - cy) / (size * 0.45 * aspect);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= 1.0) continue;

      const angle = Math.atan2(dy, dx);

      // Core intensity
      const core = Math.exp(-dist * dist * 12.0) * 1.5;

      let armVal = 0;
      if (isSpiral && dist > 0.1) {
        // Log spiral arms: angle ~ armTwist * log(dist)
        for (let a = 0; a < armCount; a++) {
          const armOffset = (a * 2.0 * Math.PI) / armCount;
          const thetaDiff = Math.sin(angle - armTwist * Math.log(dist + 0.05) + armOffset);
          const armDist = Math.abs(thetaDiff);
          armVal += Math.exp(-armDist * armDist * 8.0) * Math.exp(-dist * 2.2);
        }
      } else {
        // Elliptical blob
        armVal = Math.exp(-dist * 3.5);
      }

      const brightness = Math.min(1.0, core + armVal * 0.7);
      if (brightness < 0.01) continue;

      const idx = (y * size + x) * 4;
      // Core is warm yellow-white, arms are cooler blue-white / dusty teal
      const coreMix = Math.min(1.0, core * 1.2);
      const r = Math.floor(255 * (coreMix * 0.95 + (1.0 - coreMix) * 0.65));
      const g = Math.floor(255 * (coreMix * 0.88 + (1.0 - coreMix) * 0.75));
      const b = Math.floor(255 * (coreMix * 0.70 + (1.0 - coreMix) * 0.90));
      const a = Math.floor(255 * brightness * 0.65);

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }

  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

const GALAXY_COUNT = 8;
const GALAXY_DISTANCE = 820;

export class Galaxies {
  constructor(scene) {
    this._scene = scene;
    this._group = new THREE.Group();
    this._scene.add(this._group);
    this._textures = [];
  }

  build() {
    this.dispose();

    for (let i = 0; i < GALAXY_COUNT; i++) {
      const tex = makeGalaxyTexture(i * 997 + 13, i % 3 !== 0);
      this._textures.push(tex);

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });

      const sprite = new THREE.Sprite(mat);

      // Random position on sky sphere (radius 820)
      const u = (Math.random() * 2 - 1);
      const theta = Math.random() * Math.PI * 2;
      const sq = Math.sqrt(1 - u * u);
      const x = sq * Math.cos(theta) * GALAXY_DISTANCE;
      const y = u * GALAXY_DISTANCE;
      const z = sq * Math.sin(theta) * GALAXY_DISTANCE;

      sprite.position.set(x, y, z);
      const scale = 35 + Math.random() * 25;
      sprite.scale.set(scale, scale, 1);
      this._group.add(sprite);
    }
  }

  dispose() {
    while (this._group.children.length > 0) {
      const s = this._group.children[0];
      this._group.remove(s);
      if (s.material) s.material.dispose();
    }
    this._textures.forEach(t => t.dispose());
    this._textures = [];
  }
}

