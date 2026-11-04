/**
 * ConstellationLines.js — Joins the points with glowing cyan constellation lines.
 * Stride-sampled for smooth 60 FPS performance.
 */

import * as THREE from 'three';
import { SPHERE_R, positionToSphere, slerpSphere } from '../math.js';

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

    const COUNT = 100;
    const stride = Math.floor(1000000 / COUNT);
    const waypoints = [];

    for (let i = 0; i < COUNT; i++) {
      const pos1 = 1 + i * stride;
      waypoints.push(positionToSphere(pos1, SPHERE_R));
    }

    const pts = [];
    const samplesPerSeg = 8;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const pA = waypoints[i];
      const pB = waypoints[i + 1];
      for (let s = 0; s < samplesPerSeg; s++) {
        const t = s / samplesPerSeg;
        const p = slerpSphere(pA, pB, t, SPHERE_R + 0.25);
        pts.push(new THREE.Vector3(p.x, p.y, p.z));
      }
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
