/**
 * SolarSystem.js — procedural solar system with sun, planets, rings, moon.
 * Placed far from the digit spiral. Slow orbital motion (~minutes per orbit).
 * No external textures. Hard bans: no purple-cyan gradient, no heavy glow.
 */

import * as THREE from 'three';

// Hash-based noise for planet surface textures
function hash(n) {
  let x = Math.sin(n) * 43758.5453;
  return x - Math.floor(x);
}

// Create procedural planet texture on canvas (256x256)
function makePlanetTexture(seed, type) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (type === 'rocky') {
    // Warm ochre / grey rock
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = hash(x * 0.07 + y * 0.13 + seed)
                + hash(x * 0.17 + y * 0.31 + seed + 1) * 0.5
                + hash(x * 0.39 + y * 0.67 + seed + 2) * 0.25;
        const v = n / 1.75;
        const r = Math.floor(120 + v * 100);
        const g = Math.floor(100 + v * 80);
        const b = Math.floor(80 + v * 60);
        const i = (y * size + x) * 4;
        img.data[i] = r; img.data[i+1] = g; img.data[i+2] = b; img.data[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } else if (type === 'gas') {
    // Horizontal band pattern (Jupiter-like)
    const img = ctx.createImageData(size, size);
    const bands = [
      [180, 140, 100],
      [140, 100, 80],
      [200, 170, 130],
      [100, 80, 70],
      [180, 150, 120],
    ];
    for (let y = 0; y < size; y++) {
      const bi = Math.floor((y / size) * bands.length * 2.5) % bands.length;
      const [br, bg, bb] = bands[bi];
      for (let x = 0; x < size; x++) {
        const n = hash(x * 0.03 + y * 0.08 + seed);
        const r = Math.floor(br + n * 30);
        const g = Math.floor(bg + n * 20);
        const b = Math.floor(bb + n * 15);
        const i = (y * size + x) * 4;
        img.data[i] = r; img.data[i+1] = g; img.data[i+2] = b; img.data[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } else if (type === 'ice') {
    // Pale blue-grey
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = hash(x * 0.05 + y * 0.11 + seed);
        const v = 0.7 + n * 0.3;
        const i = (y * size + x) * 4;
        img.data[i] = Math.floor(160 * v);
        img.data[i+1] = Math.floor(180 * v);
        img.data[i+2] = Math.floor(200 * v);
        img.data[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  return new THREE.CanvasTexture(canvas);
}

const PLANET_CONFIGS = [
  { r: 3,   radius: 0.8, type: 'rocky', orbitR: 25, speed: 0.0004,  tilt: 0.1 },
  { r: 5,   radius: 1.2, type: 'rocky', orbitR: 40, speed: 0.00025, tilt: 0.3 },
  { r: 8,   radius: 2.5, type: 'gas',   orbitR: 65, speed: 0.00012, tilt: 0.05, rings: true },
  { r: 11,  radius: 1.5, type: 'ice',   orbitR: 90, speed: 0.00007, tilt: 0.6  },
];

const SUN_POSITION = new THREE.Vector3(-200, 80, -500);

export class SolarSystem {
  constructor(scene) {
    this._scene = scene;
    this._objects = [];
    this._time = 0;
  }

  build() {
    this.dispose();

    // ── Sun ──
    const sunGeo = new THREE.SphereGeometry(10, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.copy(SUN_POSITION);
    this._scene.add(sun);
    this._objects.push({ mesh: sun, type: 'sun' });

    // Sun corona (transparent ring shell)
    const coronaGeo = new THREE.SphereGeometry(13, 24, 24);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    });
    const corona = new THREE.Mesh(coronaGeo, coronaMat);
    corona.position.copy(SUN_POSITION);
    this._scene.add(corona);
    this._objects.push({ mesh: corona, type: 'corona' });

    // Sun point light
    const sunLight = new THREE.PointLight(0xfff4e0, 2.0, 800);
    sunLight.position.copy(SUN_POSITION);
    this._scene.add(sunLight);
    this._objects.push({ mesh: sunLight, type: 'light' });

    // ── Planets ──
    PLANET_CONFIGS.forEach((cfg, i) => {
      const tex = makePlanetTexture(i * 100, cfg.type);
      const geo = new THREE.SphereGeometry(cfg.radius, 28, 28);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: cfg.type === 'gas' ? 0.7 : 0.9,
        metalness: 0.0,
      });
      const planet = new THREE.Mesh(geo, mat);

      // Pivot at sun position
      const pivot = new THREE.Object3D();
      pivot.position.copy(SUN_POSITION);
      pivot.rotation.z = cfg.tilt;
      planet.position.set(cfg.orbitR, 0, 0);
      pivot.add(planet);
      this._scene.add(pivot);

      const entry = { mesh: planet, pivot, cfg, type: 'planet' };

      // Rings
      if (cfg.rings) {
        const ringGeo = new THREE.RingGeometry(cfg.radius * 1.4, cfg.radius * 2.2, 48);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xb8a080,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2.2;
        planet.add(ring);
        entry.ring = ring;
      }

      // Moon (only for first planet)
      if (i === 0) {
        const moonGeo = new THREE.SphereGeometry(0.25, 16, 16);
        const moonMat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 1.0 });
        const moon = new THREE.Mesh(moonGeo, moonMat);
        moon.position.set(2, 0, 0);
        planet.add(moon);
        entry.moon = moon;
        entry.moonAngle = 0;
      }

      this._objects.push(entry);
    });
  }

  update(dt) {
    this._time += dt;
    this._objects.forEach(obj => {
      if (obj.type === 'planet') {
        obj.pivot.rotation.y += obj.cfg.speed;
        obj.mesh.rotation.y += obj.cfg.speed * 10;
        if (obj.moonAngle !== undefined) {
          obj.moonAngle += 0.003;
          obj.moon.position.set(
            Math.cos(obj.moonAngle) * 2,
            Math.sin(obj.moonAngle) * 0.3,
            Math.sin(obj.moonAngle) * 2,
          );
        }
      }
    });
  }

  dispose() {
    this._objects.forEach(obj => {
      if (obj.mesh) {
        if (obj.mesh.parent) obj.mesh.parent.remove(obj.mesh);
        this._scene.remove(obj.mesh);
        this._scene.remove(obj.pivot);
        if (obj.mesh.geometry) obj.mesh.geometry.dispose();
        if (obj.mesh.material) {
          if (obj.mesh.material.map) obj.mesh.material.map.dispose();
          obj.mesh.material.dispose();
        }
      }
    });
    this._objects = [];
  }
}

