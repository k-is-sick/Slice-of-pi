/**
 * ConstellationLines.js — Joins the phyllotaxis spiral points with glowing
 * constellation lines. Stride-sampled for smooth 60 FPS performance.
 */

import * as THREE from 'three';
import { phyllotaxisPos } from '../math.js';

export class ConstellationLines {
  constructor(scene) {
    this._scene = scene;
    this._mesh = null;
    this._active = false;
    this._zScale = 1.0;
    this._time = 0;
  }

  setZScale(z) {
    this._zScale = z;
    if (this._active) {
      this._rebuildLines();
    }
  }

  toggle() {
    this._active = !this._active;
    if (this._active) {
      this._rebuildLines();
    } else {
      this.clear();
    }
    return this._active;
  }

  isActive() {
    return this._active;
  }

  _rebuildLines() {
    this.clear();

    // Sample ~1,200 points along the spiral
    const COUNT = 1200;
    const pts = [];

    // Logarithmic distribution to cover both core and outer spiral
    for (let i = 0; i < COUNT; i++) {
      const idx = Math.floor(i * 18);
      const { x, y, z } = phyllotaxisPos(idx, this._zScale);
      pts.push(new THREE.Vector3(x, y, z));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(pts);

    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        uniform float time;
        varying float vAlpha;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = 0.45 + 0.25 * sin(time * 2.0 + position.x * 0.02);
        }
      `,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(0.49, 0.91, 0.98, vAlpha); // Glowing Cyan #7ee8fa
        }
      `,
      uniforms: { time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._mesh = new THREE.Line(geo, mat);
    this._scene.add(this._mesh);
  }

  update(dt) {
    if (!this._active || !this._mesh) return;
    this._time += dt;
    this._mesh.material.uniforms.time.value = this._time;
  }

  clear() {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
      this._mesh = null;
    }
  }

  dispose() {
    this.clear();
  }
}

