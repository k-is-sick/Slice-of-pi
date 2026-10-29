/**
 * Nebulae.js — 2-3 faint fbm shader regions on the sky dome
 * Desaturated dusty ochre/teal-grey, very low opacity.
 * Digits always brighter than nebulae.
 */

import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vWorldDir;
void main() {
  vWorldDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
precision mediump float;
varying vec3 vWorldDir;
uniform float time;

// Simple fbm (6 octaves)
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(
    mix(hash21(i), hash21(i+vec2(1,0)), f.x),
    mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for(int i=0;i<5;i++) { v+=a*noise(p); p*=2.0; a*=0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vWorldDir);
  // Spherical coords
  float lon = atan(d.z, d.x);
  float lat = asin(d.y);

  vec2 uv = vec2(lon / 3.14159, lat / 1.5708) * 3.0;

  float n1 = fbm(uv + vec2(1.3, 0.7) + time * 0.0002);
  float n2 = fbm(uv * 1.7 + vec2(-2.1, 1.4));
  float n3 = fbm(uv * 0.8 + vec2(0.5, -1.1));

  // Region 1: ochre near galactic plane
  float galLat = abs(dot(d, vec3(0.0, 1.0, 0.0)));
  float r1 = smoothstep(0.6, 0.2, galLat) * n1;

  // Region 2: teal-grey patch
  float r2 = smoothstep(0.5, 0.0, abs(d.z + 0.3)) * smoothstep(0.4, 0.0, abs(d.y - 0.5)) * n2;

  // Region 3: dark dust lane
  float r3 = smoothstep(0.7, 0.1, galLat) * (1.0 - n3) * 0.5;

  // Ochre: (0.6, 0.5, 0.3), teal: (0.3, 0.45, 0.4)
  vec3 col = vec3(0.58, 0.48, 0.30) * r1 * 0.12
           + vec3(0.28, 0.40, 0.38) * r2 * 0.08
           + vec3(0.05, 0.04, 0.06) * r3 * 0.15;

  float a = (r1 + r2) * 0.12;
  if (a < 0.005) discard;
  gl_FragColor = vec4(col, a);
}
`;

export class Nebulae {
  constructor(scene) {
    this._scene = scene;
    this._mesh = null;
  }

  build() {
    this.dispose();
    const geo = new THREE.SphereGeometry(850, 32, 32);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
    });
    this._mesh = new THREE.Mesh(geo, mat);
    this._mesh.frustumCulled = false;
    this._scene.add(this._mesh);
  }

  update(dt) {
    if (this._mesh) this._mesh.material.uniforms.time.value += dt;
  }

  dispose() {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
      this._mesh = null;
    }
  }
}

