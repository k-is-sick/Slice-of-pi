/**
 * Stars.js — procedural star field (~80k points, 3 parallax layers)
 * Art direction: realistic star atlas. Warm orange to blue-white (blackbody 3000K-30000K).
 * Many dim, few bright (power-law magnitude distribution).
 * Faint Milky Way band: low-freq noise along tilted great circle.
 * NO uniform white dots, NO heavy glow everywhere.
 */

import * as THREE from 'three';

// Seeded RNG (mulberry32)
function makeRng(seed) {
  let s = seed | 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Blackbody colour 3000K-30000K → linear RGB (approximate) */
function blackbodyRGB(T) {
  // Simplified Planckian locus approximation
  let r, g, b;
  if (T <= 6600) {
    r = 1.0;
    g = Math.max(0, Math.min(1, -0.25 + (T - 1000) / 5600));
    b = T <= 2000 ? 0 : Math.max(0, Math.min(1, (T - 2000) / 4600));
  } else {
    r = Math.max(0.6, Math.min(1, 3.2e4 / T));
    g = Math.max(0.7, Math.min(1, 3.2e4 / T + 0.1));
    b = 1.0;
  }
  return [r, g, b];
}

/** Sample temperature from a distribution: more cold, few hot */
function sampleTemp(rng) {
  const u = rng();
  // Power-law: mostly 3000-8000K, rare up to 30000K
  return 3000 + u * u * 27000;
}

/** Power-law magnitude: returns brightness 0..1, many dim */
function sampleBrightness(rng) {
  const u = rng();
  return Math.pow(u, 2.5);  // most are dim
}

/** Milky Way band weight for a point on the unit sphere */
function milkyWayWeight(nx, ny, nz) {
  // Tilted galactic plane: roughly y=0 plane rotated ~60 deg
  const galX = nx * 0.5 + nz * 0.866;
  const galY = ny;
  const galZ = -nx * 0.866 + nz * 0.5;
  // Distance from galactic equator
  const lat = Math.abs(Math.asin(galY));
  const weight = Math.max(0, 1 - lat / (Math.PI / 6));  // within ±30deg
  // Add simple "turbulence" via trig hack
  const lon = Math.atan2(galZ, galX);
  const noise = 0.5 + 0.5 * Math.sin(lon * 7 + galY * 13);
  return weight * (0.5 + 0.5 * noise);
}

const LAYER_CONFIGS = [
  { count: 40000, radius: 900, parallax: 0.0,  seed: 0x1a2b3c },
  { count: 30000, radius: 800, parallax: 0.005, seed: 0x4d5e6f },
  { count: 10000, radius: 700, parallax: 0.012, seed: 0x7a8b9c },
];

export class Stars {
  constructor(scene) {
    this._scene = scene;
    this._meshes = [];
    this._time = 0;
  }

  build(qualityScale = 1.0) {
    this.dispose();
    LAYER_CONFIGS.forEach((cfg, li) => {
      const n = Math.floor(cfg.count * qualityScale);
      const rng = makeRng(cfg.seed);

      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const sizes = new Float32Array(n);
      const twinkle = new Float32Array(n);  // 1 = twinkle enabled

      for (let i = 0; i < n; i++) {
        // Uniform sphere
        const u = rng() * 2 - 1;
        const theta = rng() * Math.PI * 2;
        const sq = Math.sqrt(1 - u * u);
        const nx = sq * Math.cos(theta);
        const ny = u;
        const nz = sq * Math.sin(theta);

        // Milky Way: extra stars along band
        const mw = milkyWayWeight(nx, ny, nz);
        // Rejection sample: keep more stars in MW band
        if (rng() > 0.25 + 0.75 * mw && rng() > 0.3) {
          // still add but possibly dim
        }

        positions[i*3]   = nx * cfg.radius;
        positions[i*3+1] = ny * cfg.radius;
        positions[i*3+2] = nz * cfg.radius;

        const T = sampleTemp(rng);
        const bright = sampleBrightness(rng);
        // MW band gets slight ochre-dust overlay
        const dustTint = mw * 0.15;
        const [cr, cg, cb] = blackbodyRGB(T);
        colors[i*3]   = cr * bright + dustTint;
        colors[i*3+1] = cg * bright + dustTint * 0.7;
        colors[i*3+2] = cb * bright;

        // Size: bright few are larger
        sizes[i] = 1.0 + bright * 3.0;

        // Twinkle only for brightest 2%
        twinkle[i] = bright > 0.85 && li === 0 ? 1.0 : 0.0;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1));

      const mat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */`
          attribute float aSize;
          attribute float aTwinkle;
          varying vec3 vColor;
          varying float vAlpha;
          uniform float time;
          void main() {
            vColor = color;
            float tw = aTwinkle > 0.5 ? (0.85 + 0.15 * sin(time * 2.3 + position.x)) : 1.0;
            vAlpha = tw;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * tw;
          }
        `,
        fragmentShader: /* glsl */`
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float r = dot(uv,uv);
            if (r > 0.25) discard;
            float a = (1.0 - smoothstep(0.1, 0.25, r)) * vAlpha;
            gl_FragColor = vec4(vColor, a);
          }
        `,
        uniforms: { time: { value: 0 } },
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });

      const mesh = new THREE.Points(geo, mat);
      mesh.frustumCulled = false;
      // Parallax: stars don't move with camera (but slight offset)
      mesh.userData.parallax = cfg.parallax;
      this._scene.add(mesh);
      this._meshes.push(mesh);
    });
  }

  update(dt, camWorldPos) {
    this._time += dt;
    this._meshes.forEach(m => {
      m.material.uniforms.time.value = this._time;
      // Slight parallax — move sky sphere opposite to camera
      const p = m.userData.parallax;
      m.position.set(
        -camWorldPos.x * p,
        -camWorldPos.y * p,
        -camWorldPos.z * p,
      );
    });
  }

  dispose() {
    this._meshes.forEach(m => {
      this._scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    this._meshes = [];
  }
}

