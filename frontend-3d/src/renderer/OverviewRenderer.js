/**
 * OverviewRenderer.js — renders the 20k-sample overview as a single Points object.
 * Used when camera is far from the origin.
 * Standard world coordinates (no duplicate camOffset).
 */

import * as THREE from 'three';
import { DIGIT_PALETTE } from '../constants.js';
import { apiOverview } from '../api.js';
import { phyllotaxisPos } from '../math.js';

const VERT = /* glsl */`
precision highp float;
attribute vec3 aPosition;
attribute float aDigit;

uniform float zScale;
uniform float pointSize;
uniform float alpha;
uniform vec3 palette[10];

varying vec3 vColor;
varying float vA;

void main() {
  vec3 pos = aPosition;
  pos.z *= zScale;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float dist = length(mvPosition.xyz);
  gl_PointSize = clamp(pointSize * 80.0 / max(dist, 1.0), 1.5, 9.0);

  int d = int(aDigit);
  vColor = palette[d];
  vA = alpha;
}
`;

const FRAG = /* glsl */`
precision mediump float;
varying vec3 vColor;
varying float vA;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float r = dot(uv, uv);
  if (r > 0.25) discard;
  float a = (1.0 - smoothstep(0.16, 0.25, r)) * vA;
  gl_FragColor = vec4(vColor, a);
}
`;

export class OverviewRenderer {
  constructor(scene) {
    this._scene = scene;
    this._mesh = null;
    this._loaded = false;
    this._palette = new Float32Array(DIGIT_PALETTE.flat());
  }

  async load() {
    try {
      const data = await apiOverview();
      const samples = data.samples || [];
      const N = samples.length;
      if (N === 0) return;

      const positions = new Float32Array(N * 3);
      const digits = new Float32Array(N);

      for (let i = 0; i < N; i++) {
        const s = samples[i];
        const idx = s.pos - 1;
        const { x, y, z } = phyllotaxisPos(idx, 1.0);
        positions[i * 3]     = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        digits[i] = s.digit;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('aPosition', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aDigit', new THREE.BufferAttribute(digits, 1));

      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          zScale:    { value: 1.0 },
          pointSize: { value: 1.0 },
          alpha:     { value: 1.0 },
          palette:   { value: this._palette },
        },
        transparent: true,
        depthWrite: false,
      });

      this._mesh = new THREE.Points(geo, mat);
      this._mesh.frustumCulled = false;
      this._scene.add(this._mesh);
      this._loaded = true;
    } catch (e) {
      console.warn('[OverviewRenderer] load failed:', e);
    }
  }

  update(zScale, alpha = 1.0) {
    if (!this._mesh) return;
    const u = this._mesh.material.uniforms;
    u.zScale.value = zScale;
    u.alpha.value = alpha;
  }

  setVisible(v) {
    if (this._mesh) this._mesh.visible = v;
  }

  dispose() {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
    }
  }
}
