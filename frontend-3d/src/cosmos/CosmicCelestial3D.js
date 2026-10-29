/**
 * CosmicCelestial3D.js — Prominent, visually rich celestial elements in 3D:
 * 1. Ringed Gas Giant (Saturn-like with tilted ring system & shadow)
 * 2. Orbiting Solar System (Glowing Sun, 3 orbiting planets with orbital rings, moon)
 * 3. 4 Stylized Spiral Galaxies with rotating spiral arms & glowing cores
 * 4. Procedural Shooting Stars (meteors) with glowing heads & fading trails
 *
 * Designed to be clearly visible in the camera viewport with rich aesthetic:
 * Cyan (#7ee8fa), Lavender (#c084fc), Gold (#fbbf24), Deep Indigo.
 */

import * as THREE from 'three';

// ── Procedural Textures ────────────────────────────────────────────────────────

function makeGasGiantTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const bands = [
    [165, 180, 252], // indigo
    [126, 232, 250], // cyan
    [192, 132, 252], // lavender
    [79, 70, 229],   // deep purple
    [224, 231, 255], // pale blue
    [30, 27, 75],    // dark navy
    [165, 180, 252],
  ];

  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const normY = y / size;
    const bandIdx = Math.floor(normY * bands.length * 2.2) % bands.length;
    const nextIdx = (bandIdx + 1) % bands.length;
    const mix = (normY * bands.length * 2.2) % 1;

    const [r1, g1, b1] = bands[bandIdx];
    const [r2, g2, b2] = bands[nextIdx];

    for (let x = 0; x < size; x++) {
      // Small horizontal turbulence
      const turb = Math.sin(x * 0.05 + y * 0.08) * 15;
      const r = Math.floor(r1 * (1 - mix) + r2 * mix + turb);
      const g = Math.floor(g1 * (1 - mix) + g2 * mix + turb * 0.8);
      const b = Math.floor(b1 * (1 - mix) + b2 * mix + turb * 1.2);

      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r));
      img.data[i + 1] = Math.max(0, Math.min(255, g));
      img.data[i + 2] = Math.max(0, Math.min(255, b));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeSunGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 245, 180, 1.0)');
  grad.addColorStop(0.2, 'rgba(251, 191, 36, 0.7)');
  grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.3)');
  grad.addColorStop(1.0, 'rgba(245, 158, 11, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

function makeSpiralGalaxyTexture(seed, colorA, colorB) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  // Background clear
  ctx.clearRect(0, 0, size, size);

  // Core glow
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 35);
  coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  coreGrad.addColorStop(0.3, colorA);
  coreGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 35, 0, Math.PI * 2);
  ctx.fill();

  // Spiral arms
  ctx.save();
  ctx.translate(cx, cy);
  for (let arm = 0; arm < 2; arm++) {
    const armAngle = arm * Math.PI;
    for (let a = 0; a < 3.2; a += 0.08) {
      const r = 8 + a * 30;
      const theta = a * 1.6 + armAngle;
      const px = Math.cos(theta) * r;
      const py = Math.sin(theta) * r * 0.7; // slight elliptical tilt

      const alpha = Math.max(0, 1.0 - a / 3.2) * 0.75;
      const dotR = 2.5 + Math.sin(a * 5) * 1.0;

      ctx.fillStyle = arm === 0 ? colorA : colorB;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  return tex;
}

// ── CosmicCelestial3D Class ────────────────────────────────────────────────────

export class CosmicCelestial3D {
  constructor(scene) {
    this._scene = scene;
    this._group = new THREE.Group();
    this._scene.add(this._group);

    this._planets = [];
    this._galaxies = [];
    this._shootingStars = [];
    this._time = 0;

    this._buildElements();
  }

  _buildElements() {
    // ── 1. Majestic Ringed Gas Giant (Saturn-like) ──────────────────────────
    // Placed in upper right field of view (visible from initial (0,0,300) camera)
    const giantGroup = new THREE.Group();
    giantGroup.position.set(240, 130, -90);

    const giantGeo = new THREE.SphereGeometry(22, 36, 36);
    const giantTex = makeGasGiantTexture();
    const giantMat = new THREE.MeshStandardMaterial({
      map: giantTex,
      roughness: 0.65,
      metalness: 0.1,
    });
    const giantMesh = new THREE.Mesh(giantGeo, giantMat);
    giantGroup.add(giantMesh);

    // Tilted Rings
    const ringGeo = new THREE.RingGeometry(28, 48, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8fa8ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2.3;
    ringMesh.rotation.y = 0.25;
    giantGroup.add(ringMesh);

    // Outer thin accent ring
    const ringGeo2 = new THREE.RingGeometry(51, 53, 64);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x7ee8fa,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.rotation.x = Math.PI / 2.3;
    ringMesh2.rotation.y = 0.25;
    giantGroup.add(ringMesh2);

    this._group.add(giantGroup);
    this._giantMesh = giantMesh;

    // ── 2. Orbiting Solar System ────────────────────────────────────────────
    // Placed in upper left field of view
    const ssGroup = new THREE.Group();
    ssGroup.position.set(-230, 140, -110);

    // Glowing Sun
    const sunGeo = new THREE.SphereGeometry(14, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff0aa });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    ssGroup.add(sunMesh);

    // Sun Corona Sprite
    const coronaTex = makeSunGlowTexture();
    const coronaMat = new THREE.SpriteMaterial({
      map: coronaTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const coronaSprite = new THREE.Sprite(coronaMat);
    coronaSprite.scale.set(65, 65, 1);
    ssGroup.add(coronaSprite);

    // Orbiting Planets
    const planetData = [
      { radius: 3.5, orbitR: 35, speed: 0.45, color: 0x7ee8fa, hasMoon: false },  // Cyan planet
      { radius: 5.0, orbitR: 58, speed: 0.28, color: 0xc084fc, hasMoon: true },   // Lavender world with moon
      { radius: 6.5, orbitR: 85, speed: 0.16, color: 0xfbbf24, hasMoon: false },  // Amber planet
    ];

    planetData.forEach((p, idx) => {
      // Orbit Ring
      const orbitGeo = new THREE.RingGeometry(p.orbitR - 0.4, p.orbitR + 0.4, 64);
      const orbitMat = new THREE.MeshBasicMaterial({
        color: 0x8ca0ff,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      });
      const orbitLine = new THREE.Mesh(orbitGeo, orbitMat);
      orbitLine.rotation.x = Math.PI / 2.2;
      ssGroup.add(orbitLine);

      // Planet Pivot
      const pivot = new THREE.Object3D();
      pivot.rotation.x = 0.25;
      ssGroup.add(pivot);

      // Planet Mesh
      const pGeo = new THREE.SphereGeometry(p.radius, 20, 20);
      const pMat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.7,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(p.orbitR, 0, 0);
      pivot.add(pMesh);

      const entry = { pivot, pMesh, speed: p.speed, orbitR: p.orbitR, angle: idx * 2.1 };

      // Moon
      if (p.hasMoon) {
        const moonGeo = new THREE.SphereGeometry(1.2, 12, 12);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.position.set(9, 0, 0);
        pMesh.add(moonMesh);
        entry.moon = moonMesh;
        entry.moonAngle = 0;
      }

      this._planets.push(entry);
    });

    this._group.add(ssGroup);

    // ── 3. Stylized Spiral Galaxies ─────────────────────────────────────────
    const galaxyConfigs = [
      { pos: [190, -110, -180], size: 68, colorA: 'rgba(192, 132, 252, 0.7)', colorB: 'rgba(126, 232, 250, 0.7)', rotSpeed: 0.08 },
      { pos: [-200, -120, -160], size: 55, colorA: 'rgba(126, 232, 250, 0.7)', colorB: 'rgba(251, 191, 36, 0.7)', rotSpeed: -0.06 },
      { pos: [80, 200, -220], size: 60, colorA: 'rgba(251, 191, 36, 0.7)', colorB: 'rgba(192, 132, 252, 0.7)', rotSpeed: 0.05 },
      { pos: [-110, -190, -200], size: 50, colorA: 'rgba(192, 132, 252, 0.6)', colorB: 'rgba(126, 232, 250, 0.6)', rotSpeed: -0.07 },
    ];

    galaxyConfigs.forEach((gc, idx) => {
      const gTex = makeSpiralGalaxyTexture(idx, gc.colorA, gc.colorB);
      const gMat = new THREE.SpriteMaterial({
        map: gTex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const gSprite = new THREE.Sprite(gMat);
      gSprite.position.set(...gc.pos);
      gSprite.scale.set(gc.size, gc.size, 1);
      this._group.add(gSprite);

      this._galaxies.push({ sprite: gSprite, rotSpeed: gc.rotSpeed });
    });

    // ── 4. Shooting Stars (Meteors) ─────────────────────────────────────────
    for (let i = 0; i < 4; i++) {
      this._shootingStars.push(this._createShootingStar());
    }
  }

  _createShootingStar() {
    const lineGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(6); // 2 points (head and tail)
    lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x7ee8fa,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this._group.add(line);

    return {
      line,
      active: false,
      timer: Math.random() * 3.0, // spawn delay
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      length: 45,
      life: 0,
      maxLife: 1.2,
    };
  }

  _spawnShootingStar(star) {
    star.active = true;
    star.life = 0;
    star.maxLife = 1.0 + Math.random() * 0.6;
    star.x = (Math.random() - 0.5) * 400;
    star.y = 120 + Math.random() * 120;
    star.z = -100 + (Math.random() - 0.5) * 200;

    // Angle down and across
    const angle = Math.PI * 0.25 + (Math.random() - 0.5) * 0.3;
    const speed = 250 + Math.random() * 150;
    star.vx = Math.cos(angle) * speed;
    star.vy = -Math.sin(angle) * speed;
    star.vz = (Math.random() - 0.5) * 60;
  }

  update(dt) {
    this._time += dt;

    // Rotate Gas Giant
    if (this._giantMesh) {
      this._giantMesh.rotation.y += dt * 0.2;
    }

    // Orbit Planets
    this._planets.forEach(p => {
      p.angle += dt * p.speed;
      p.pMesh.position.x = Math.cos(p.angle) * p.orbitR;
      p.pMesh.position.z = Math.sin(p.angle) * p.orbitR;
      p.pMesh.rotation.y += dt * 0.8;

      if (p.moon) {
        p.moonAngle += dt * 2.2;
        p.moon.position.x = Math.cos(p.moonAngle) * 9;
        p.moon.position.z = Math.sin(p.moonAngle) * 9;
      }
    });

    // Rotate Galaxies
    this._galaxies.forEach(g => {
      g.sprite.material.rotation += dt * g.rotSpeed;
    });

    // Update Shooting Stars
    this._shootingStars.forEach(s => {
      if (!s.active) {
        s.timer -= dt;
        if (s.timer <= 0) {
          this._spawnShootingStar(s);
        }
      } else {
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;

        const progress = s.life / s.maxLife;
        if (progress >= 1.0) {
          s.active = false;
          s.timer = 1.5 + Math.random() * 3.5;
          s.line.material.opacity = 0;
        } else {
          const alpha = progress < 0.2 ? progress / 0.2 : (1.0 - progress);
          s.line.material.opacity = alpha * 0.9;

          // Head & tail points
          const vLen = Math.hypot(s.vx, s.vy, s.vz) || 1;
          const tailX = s.x - (s.vx / vLen) * s.length;
          const tailY = s.y - (s.vy / vLen) * s.length;
          const tailZ = s.z - (s.vz / vLen) * s.length;

          const posAttr = s.line.geometry.attributes.position;
          posAttr.setXYZ(0, tailX, tailY, tailZ);
          posAttr.setXYZ(1, s.x, s.y, s.z);
          posAttr.needsUpdate = true;
        }
      }
    });
  }

  dispose() {
    this._scene.remove(this._group);
  }
}

