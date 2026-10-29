/**
 * ChunkManager.js — GPU-driven digit chunk renderer
 *
 * Each chunk covers CHUNK_SIZE (65536) consecutive digit indices.
 * Stores only Uint8Array of digit values; vertex shader computes
 * phyllotaxis position from (chunkBase + gl_VertexID).
 *
 * Hash matches math.js digitHash() EXACTLY for identical CPU/GPU alignment.
 * Standard world coordinates (no double camOffset subtraction).
 */

import * as THREE from 'three';
import { CHUNK_SIZE, MAX_CHUNKS, SPIRAL_C, GOLDEN_ANGLE, DISC_THICKNESS, DIGIT_PALETTE } from '../constants.js';
import { apiDigitsBin } from '../api.js';
import { visibleIndexRange } from '../math.js';

// ── Shader source ─────────────────────────────────────────────────────────────

const VERT = /* glsl */`
precision highp float;

uniform float chunkBase;
uniform float zScale;       // 0 = 2D flat, 1 = full 3D
uniform float pointSize;    // base point size
uniform float fadeAlpha;    // cross-fade between LODs
uniform vec3  palette[10];  // colour per digit

attribute float digitVal;   // 0-9

varying vec3  vColor;
varying float vAlpha;

const float C          = ${SPIRAL_C.toFixed(6)};
const float PHI        = ${GOLDEN_ANGLE.toFixed(10)};
const float THICKNESS  = ${DISC_THICKNESS.toFixed(6)};

// Exact integer hash matching math.js digitHash() in JS
float hash(float n) {
  uint x = uint(n) ^ 0x45d9f3bu;
  x = (x ^ (x >> 16u)) * 0x45d9f3bu;
  x = (x ^ (x >> 16u)) * 0x45d9f3bu;
  return (float(x) / 4294967295.0) * 2.0 - 1.0;
}

void main() {
  float idx = chunkBase + float(gl_VertexID);

  float r         = C * sqrt(idx + 1.0);
  float theta     = idx * PHI;
  float thickness = THICKNESS * r;
  float z         = hash(idx) * thickness * zScale;

  vec3 worldPos   = vec3(r * cos(theta), r * sin(theta), z);
  vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);

  gl_Position  = projectionMatrix * mvPosition;

  // Perspective size attenuation with smooth clamp
  float dist = length(mvPosition.xyz);
  gl_PointSize = clamp(pointSize * 95.0 / max(dist, 1.0), 2.0, 11.0);

  int d = int(digitVal);
  vColor = palette[d];
  vAlpha = fadeAlpha;
}
`;

const FRAG = /* glsl */`
precision mediump float;
varying vec3  vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float r = dot(uv, uv);
  if (r > 0.25) discard;
  float alpha = (1.0 - smoothstep(0.16, 0.25, r)) * vAlpha;
  gl_FragColor = vec4(vColor, alpha);
}
`;

// ── ChunkManager ──────────────────────────────────────────────────────────────

export class ChunkManager {
  constructor(scene, zScale = 1.0) {
    this._scene = scene;
    this._zScale = zScale;
    this._N = 1_000_000;

    this._chunks = new Map();
    this._fetchQueue = new Set();
    this._lruClock = 0;
    this._searchId = 0;

    this._palette = new Float32Array(DIGIT_PALETTE.flat());
  }

  setN(n) { this._N = n; }

  setZScale(z) {
    this._zScale = z;
    this._chunks.forEach(c => {
      if (c.mesh && c.mesh.material && c.mesh.material.uniforms) {
        c.mesh.material.uniforms.zScale.value = z;
      }
    });
  }

  update(camera, camWorldPos) {
    const dist = camWorldPos.length();
    const fov = camera.fov * (Math.PI / 180);
    const aspect = camera.aspect || 1;
    const h = dist * Math.tan(fov / 2) * Math.sqrt(1 + aspect * aspect);

    const { iMin, iMax } = visibleIndexRange(dist, h * 1.3, this._N);
    const cMin = Math.floor(iMin / CHUNK_SIZE);
    const cMax = Math.floor(iMax / CHUNK_SIZE);

    const needed = new Set();
    for (let c = cMin; c <= cMax; c++) needed.add(c);

    // Mark used chunks
    needed.forEach(key => {
      const chunk = this._chunks.get(key);
      if (chunk) chunk.lastUsed = this._lruClock++;
    });

    // Update visibility and uniforms
    this._chunks.forEach((chunk, key) => {
      const visible = needed.has(key);
      chunk.mesh.visible = visible;
      if (visible) {
        const u = chunk.mesh.material.uniforms;
        u.zScale.value = this._zScale;
        u.fadeAlpha.value = chunk.alpha;
      }
    });

    // Evict LRU chunks over pool limit
    if (this._chunks.size > MAX_CHUNKS) {
      const sorted = [...this._chunks.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      while (this._chunks.size > MAX_CHUNKS) {
        const [key, chunk] = sorted.shift();
        this._scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        chunk.mesh.material.dispose();
        this._chunks.delete(key);
      }
    }

    // Fetch missing chunks
    needed.forEach(key => {
      if (!this._chunks.has(key) && !this._fetchQueue.has(key)) {
        this._fetchChunk(key);
      }
    });
  }

  async _fetchChunk(key) {
    this._fetchQueue.add(key);
    const sid = ++this._searchId;
    const base = key * CHUNK_SIZE;
    const count = Math.min(CHUNK_SIZE, this._N - base);
    if (count <= 0) { this._fetchQueue.delete(key); return; }

    try {
      const digits = await apiDigitsBin(base + 1, count);
      if (sid < this._searchId - 20) { this._fetchQueue.delete(key); return; }
      this._addChunk(key, base, digits);
    } catch {
      // silently ignore
    } finally {
      this._fetchQueue.delete(key);
    }
  }

  _addChunk(key, base, digits) {
    if (this._chunks.has(key)) return;

    const geo = new THREE.BufferGeometry();
    const digitAttr = new THREE.BufferAttribute(new Float32Array(digits), 1);
    geo.setAttribute('digitVal', digitAttr);
    geo.setDrawRange(0, digits.length);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        chunkBase: { value: base },
        zScale:    { value: this._zScale },
        pointSize: { value: 1.0 },
        fadeAlpha: { value: 0.0 },
        palette:   { value: [...this._palette] },
      },
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this._scene.add(points);

    this._chunks.set(key, {
      mesh: points,
      digits,
      base,
      lastUsed: this._lruClock++,
      alpha: 0,
    });

    // Fade in over 250ms
    const chunk = this._chunks.get(key);
    const start = performance.now();
    const fadeIn = () => {
      if (!this._chunks.has(key)) return;
      const t = Math.min((performance.now() - start) / 250, 1);
      chunk.alpha = t;
      if (chunk.mesh.material.uniforms) {
        chunk.mesh.material.uniforms.fadeAlpha.value = t;
      }
      if (t < 1) requestAnimationFrame(fadeIn);
    };
    requestAnimationFrame(fadeIn);
  }

  dispose() {
    this._chunks.forEach(c => {
      this._scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
    });
    this._chunks.clear();
  }
}
