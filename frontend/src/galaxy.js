/**
 * galaxy.js — Phyllotaxis spiral renderer
 *
 * Performance Architecture:
 * 1. Analytical Viewport Culling:
 *    Digit index i lies at radius r = C * sqrt(i + 1).
 *    For viewport half-diagonal h and camera center distance d,
 *    any visible index must satisfy:
 *    i in [ floor(((max(0, d - h)) / C)^2 - 1), ceil(((d + h) / C)^2) ].
 *    This reduces visible index determination from O(N) to O(1).
 *
 * 2. Overview Precomputation:
 *    20,000 sample points precomputed into Float32Array (x, y) and Uint8Array (digit).
 *    Drawn per frame using linear arithmetic and 10 Path2D batches (rect).
 *    Zero per-frame allocations.
 *
 * 3. Digit Window (<= 6000 visible dots):
 *    Iterates strictly over the analytically-culled range clamped to the window.
 *    Only renders characters (fillText) when visibleCount <= 300 and zoom >= ZOOM_CHARS.
 *
 * 4. Star Field:
 *    Baked once on resize into an offscreen canvas.
 *    Composited in a single drawImage() call.
 */

import { PALETTE, DOT_ALPHA, DOT_ALPHA_DIM, dotSize } from './palette.js';

// ── Constants ─────────────────────────────────────────────────────────────────
export const GOLDEN_ANGLE = 2.399963229728653;   // 137.508° in radians
export const SPIRAL_C     = 0.35;                // World scale constant
export const ZOOM_DETAIL  = 8;                   // Switch from overview to digit window dots
export const ZOOM_CHARS   = 120;                 // Allow rendering digit glyphs

// ── Analytical Math Helpers ───────────────────────────────────────────────────

export function phyllotaxisPos(i) {
  const r     = SPIRAL_C * Math.sqrt(i + 1);
  const theta = i * GOLDEN_ANGLE;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

/**
 * Analytical O(1) viewport index range calculation.
 * Returns { iMin, iMax } of any indices that could fall within the viewport.
 */
export function getVisibleIndexRange(cam, W, H) {
  const d = Math.hypot(cam.x, cam.y);
  const safeZoom = Math.max(1e-4, cam.zoom);
  const h = Math.hypot(W, H) / (2 * safeZoom);

  const rMin = Math.max(0, d - h);
  const rMax = d + h;

  const iMin = Math.max(0, Math.floor((rMin / SPIRAL_C) ** 2 - 1));
  const iMax = Math.max(iMin, Math.ceil((rMax / SPIRAL_C) ** 2));

  return { iMin, iMax };
}

export function worldToScreen(wx, wy, cam, W, H) {
  return {
    sx: (wx - cam.x) * cam.zoom + W / 2,
    sy: (wy - cam.y) * cam.zoom + H / 2,
  };
}

export function screenToWorld(sx, sy, cam, W, H) {
  return {
    wx: (sx - W / 2) / cam.zoom + cam.x,
    wy: (sy - H / 2) / cam.zoom + cam.y,
  };
}

// ── Cosmic Background Moving Elements (Shooting stars, Planets, Solar system, Galaxies) ──
class CosmicCelestial {
  constructor() {
    this.shootingStars = [
      { active: false, x: 0, y: 0, vx: 0, vy: 0, len: 0, life: 0, maxLife: 0, timer: 40 },
      { active: false, x: 0, y: 0, vx: 0, vy: 0, len: 0, life: 0, maxLife: 0, timer: 160 }
    ];
    this.galaxies = [
      { relX: 0.16, relY: 0.22, radius: 52, rotSpeed: 0.00028, color1: 'rgba(192, 132, 252, 0.26)', color2: 'rgba(126, 232, 250, 0.16)' },
      { relX: 0.84, relY: 0.72, radius: 58, rotSpeed: -0.00020, color1: 'rgba(126, 232, 250, 0.22)', color2: 'rgba(245, 158, 11, 0.14)' }
    ];
    this.solarSystem = {
      relX: 0.82, relY: 0.22,
      sunRadius: 4.5,
      planets: [
        { orbitR: 30, speed: 0.0008, size: 2.5, color: '#7ee8fa' },
        { orbitR: 52, speed: 0.0004, size: 3.4, color: '#c084fc', moonR: 8, moonSpeed: 0.0028 }
      ]
    };
    this.ringedPlanet = {
      relX: 0.14, relY: 0.76,
      radius: 12,
      ringR: 26,
      ringH: 8,
      angle: -0.42
    };
  }

  update(W, H) {
    for (let i = 0; i < this.shootingStars.length; i++) {
      const s = this.shootingStars[i];
      if (s.active) {
        s.x += s.vx;
        s.y += s.vy;
        s.life++;
        if (s.life >= s.maxLife || s.x < -100 || s.x > W + 100 || s.y > H + 100) {
          s.active = false;
          s.timer = 90 + Math.random() * 180;
        }
      } else {
        s.timer--;
        if (s.timer <= 0) {
          s.active = true;
          s.life = 0;
          s.maxLife = 35 + Math.random() * 25;
          s.x = Math.random() * W * 0.85;
          s.y = Math.random() * H * 0.40;
          const speed = 11 + Math.random() * 7;
          const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.35;
          s.vx = Math.cos(angle) * speed;
          s.vy = Math.sin(angle) * speed;
          s.len = 75 + Math.random() * 85;
        }
      }
    }
  }

  draw(ctx, W, H, now) {
    ctx.save();

    // 1. Rotating Distant Spiral Galaxies
    for (let i = 0; i < this.galaxies.length; i++) {
      const g = this.galaxies[i];
      const gx = W * g.relX;
      const gy = H * g.relY;
      const rot = now * g.rotSpeed;

      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(rot);

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.radius);
      grad.addColorStop(0, g.color1);
      grad.addColorStop(0.5, g.color2);
      grad.addColorStop(1, 'rgba(5, 7, 18, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, g.radius, 0, Math.PI * 2);
      ctx.fill();

      // Spiral arms
      ctx.lineWidth = 1.2;
      for (let arm = 0; arm < 2; arm++) {
        const armOffset = arm * Math.PI;
        ctx.strokeStyle = arm === 0 ? 'rgba(192, 132, 252, 0.35)' : 'rgba(126, 232, 250, 0.35)';
        ctx.beginPath();
        for (let a = 0; a <= 2.8; a += 0.2) {
          const r = 4 + a * (g.radius * 0.32);
          const theta = a * 1.5 + armOffset;
          const px = Math.cos(theta) * r;
          const py = Math.sin(theta) * r * 0.65;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.restore();
    }

    // 2. Orbiting Solar System
    {
      const ss = this.solarSystem;
      const sx = W * ss.relX;
      const sy = H * ss.relY;

      const sunGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 20);
      sunGrad.addColorStop(0, 'rgba(255, 235, 170, 0.95)');
      sunGrad.addColorStop(0.3, 'rgba(245, 158, 11, 0.45)');
      sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff4cc';
      ctx.beginPath();
      ctx.arc(sx, sy, ss.sunRadius, 0, Math.PI * 2);
      ctx.fill();

      for (let p = 0; p < ss.planets.length; p++) {
        const pl = ss.planets[p];
        const angle = now * pl.speed;

        ctx.strokeStyle = 'rgba(140, 160, 255, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(sx, sy, pl.orbitR, pl.orbitR * 0.62, 0.3, 0, Math.PI * 2);
        ctx.stroke();

        const ea = angle;
        const ex = Math.cos(ea) * pl.orbitR;
        const ey = Math.sin(ea) * pl.orbitR * 0.62;
        const cosR = Math.cos(0.3), sinR = Math.sin(0.3);
        const px = sx + (ex * cosR - ey * sinR);
        const py = sy + (ex * sinR + ey * cosR);

        ctx.fillStyle = pl.color;
        ctx.beginPath();
        ctx.arc(px, py, pl.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        if (pl.moonR) {
          const ma = now * pl.moonSpeed;
          const mx = px + Math.cos(ma) * pl.moonR;
          const my = py + Math.sin(ma) * pl.moonR * 0.6;
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.arc(mx, my, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 3. Ringed Gas Giant
    {
      const rp = this.ringedPlanet;
      const rx = W * rp.relX;
      const ry = H * rp.relY;

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rp.angle);

      // Back of rings
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.38)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rp.ringR, rp.ringH, 0, Math.PI, Math.PI * 2);
      ctx.stroke();

      // Planet sphere
      const pGrad = ctx.createRadialGradient(-3, -3, 1, 0, 0, rp.radius);
      pGrad.addColorStop(0, '#a5b4fc');
      pGrad.addColorStop(0.6, '#4f46e5');
      pGrad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(0, 0, rp.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(165, 180, 252, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Front of rings
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.65)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rp.ringR, rp.ringH, 0, 0, Math.PI);
      ctx.stroke();

      // Outer thin ring
      ctx.strokeStyle = 'rgba(140, 180, 240, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, rp.ringR + 5, rp.ringH + 2, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // 4. Shooting Stars
    for (let i = 0; i < this.shootingStars.length; i++) {
      const s = this.shootingStars[i];
      if (!s.active) continue;

      const progress = s.life / s.maxLife;
      const alpha = progress < 0.2 ? progress / 0.2 : (1 - progress);

      const tailX = s.x - (s.vx / Math.hypot(s.vx, s.vy)) * s.len;
      const tailY = s.y - (s.vy / Math.hypot(s.vx, s.vy)) * s.len;

      const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
      grad.addColorStop(0, 'rgba(126, 232, 250, 0)');
      grad.addColorStop(0.7, `rgba(126, 232, 250, ${(alpha * 0.75).toFixed(2)})`);
      grad.addColorStop(1, `rgba(255, 255, 255, ${(alpha * 0.95).toFixed(2)})`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ── GalaxyRenderer ───────────────────────────────────────────────────────────

export class GalaxyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.dpr    = Math.min(window.devicePixelRatio || 1, 2);

    this.cam = { x: 0, y: 0, zoom: 1 };

    // Cosmic background moving elements
    this._celestial = new CosmicCelestial();

    // Overview data in typed arrays (precomputed)
    this.overviewCount  = 0;
    this.overviewX      = null; // Float32Array
    this.overviewY      = null; // Float32Array
    this.overviewDigit  = null; // Uint8Array

    // Digit window
    this.digitWindow      = null;
    this.digitWindowAlpha = 0;

    // Target highlight
    this.target        = null;
    this.targetPulse   = 0;
    this.showHighlight = false;
    this.dimOthers     = false;

    // Constellation / connected lines toggle
    this.showConnectedLines = false;

    // Explore mode
    this.exploreMode = false;
    this._drag       = null;
    this._onNeedDigits = null;

    // Single animation frame loop id
    this._raf = null;

    // Pre-baked starfield bitmap
    this._starsBitmap = null;
    this._starsW = 0;
    this._starsH = 0;

    // Dirty checking
    this._lastCamStr = null;
    this._lastPulseQ = -1;

    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ── Resize ──────────────────────────────────────────────────────────────────
  resize() {
    const dpr = this.dpr;
    const W   = window.innerWidth;
    const H   = window.innerHeight;

    this.canvas.width        = W * dpr;
    this.canvas.height       = H * dpr;
    this.canvas.style.width  = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.W = W;
    this.H = H;
    this._lastCamStr = null;
    this._buildStarsBitmap(W, H);
  }

  // ── Precompute Overview into Typed Arrays ──────────────────────────────────
  setOverview(samples) {
    if (!samples || !samples.length) return;
    const count = samples.length;
    this.overviewCount = count;
    this.overviewX     = new Float32Array(count);
    this.overviewY     = new Float32Array(count);
    this.overviewDigit = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
      const { pos, digit } = samples[i];
      const idx = pos - 1;
      const { x, y } = phyllotaxisPos(idx);
      this.overviewX[i]     = x;
      this.overviewY[i]     = y;
      this.overviewDigit[i] = digit;
    }
    this._lastCamStr = null;
  }

  // ── Digit window ──────────────────────────────────────────────────────────
  setDigitWindow(start, digitsStr, immediate = false) {
    this.digitWindow = { start, digits: digitsStr };
    if (immediate) this.digitWindowAlpha = 1;
    this._lastCamStr = null;
  }

  // ── Target ────────────────────────────────────────────────────────────────
  setTarget(pos0, len, query = '') {
    const { x, y } = phyllotaxisPos(pos0);
    this.target      = { pos0, len, worldX: x, worldY: y, query };
    this._lastCamStr = null;
  }

  toggleConnectedLines() {
    this.showConnectedLines = !this.showConnectedLines;
    this._lastCamStr = null;
    return this.showConnectedLines;
  }

  clearTarget() {
    this.target        = null;
    this.showHighlight = false;
    this.dimOthers     = false;
    this._lastCamStr   = null;
  }

  // ── Main Render Frame ─────────────────────────────────────────────────────
  render(t = 0) {
    const { ctx, W, H, cam } = this;

    // Validate camera finite values
    if (!Number.isFinite(cam.x) || !Number.isFinite(cam.y) || !Number.isFinite(cam.zoom) || cam.zoom <= 0) {
      cam.x = 0; cam.y = 0; cam.zoom = 0.5;
    }

    this.targetPulse = this.showHighlight ? (Math.sin(t * 0.003) + 1) / 2 : 0;

    // Clear background
    ctx.fillStyle = '#050712';
    ctx.fillRect(0, 0, W, H);

    // Starfield
    if (this._starsBitmap) {
      ctx.drawImage(this._starsBitmap, 0, 0, W, H);
    }

    // Nebula glow
    this._drawNebula(W, H);

    // Cosmic celestial moving elements (shooting stars, rotating galaxies, solar system, planets)
    if (this._celestial) {
      this._celestial.update(W, H);
      this._celestial.draw(ctx, W, H, t);
    }

    const zoom = cam.zoom;

    // Overview points (screen-space projected from precomputed typed arrays)
    if (zoom < ZOOM_DETAIL || !this.digitWindow) {
      this._drawOverviewPoints(zoom);
    }

    // Connected constellation lines if enabled
    if (this.showConnectedLines) {
      this._drawConnectedLines(zoom);
    }

    // Digit window (O(visible) analytically culled)
    if (this.digitWindow && zoom >= ZOOM_DETAIL / 2) {
      this.digitWindowAlpha = Math.min(1, (zoom - ZOOM_DETAIL / 2) / (ZOOM_DETAIL / 2));
      if (this.digitWindowAlpha > 0.01) {
        this._drawDigitWindow(zoom);
      }
    }

    // Target highlight
    if (this.target && this.showHighlight) {
      this._drawTargetHighlight();
    }
  }

  // ── Starfield (Built Once Per Resize) ─────────────────────────────────────
  _buildStarsBitmap(W, H) {
    if (W === this._starsW && H === this._starsH && this._starsBitmap) return;
    this._starsW = W; this._starsH = H;

    if (typeof OffscreenCanvas === 'undefined') {
      this._starsBitmap = null;
      return;
    }

    const off = new OffscreenCanvas(W, H);
    const c   = off.getContext('2d');

    const bg = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.72);
    bg.addColorStop(0,   '#0c1240');
    bg.addColorStop(0.45,'#080c25');
    bg.addColorStop(1,   '#050712');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    const band = c.createLinearGradient(0, H * 0.25, W, H * 0.75);
    band.addColorStop(0,   'rgba(50,70,150,0)');
    band.addColorStop(0.35,'rgba(55,75,160,0.07)');
    band.addColorStop(0.5, 'rgba(90,110,200,0.10)');
    band.addColorStop(0.65,'rgba(55,75,160,0.07)');
    band.addColorStop(1,   'rgba(50,70,150,0)');
    c.fillStyle = band;
    c.fillRect(0, 0, W, H);

    // Stars
    const rng = mulberry32(0xdeadbeef);
    const starCount = Math.min(1800, (W * H / 850) | 0);

    const whitePaths = new Path2D();
    const coolPaths  = new Path2D();
    const warmPaths  = new Path2D();

    for (let i = 0; i < starCount; i++) {
      const x    = rng() * W;
      const y    = rng() * H;
      const rv   = rng();
      const size = rv < 0.05 ? 1.6 : rv < 0.25 ? 1.1 : 0.6;
      const tint = rng();
      const p    = tint < 0.15 ? coolPaths : tint < 0.30 ? warmPaths : whitePaths;
      p.rect(x - size / 2, y - size / 2, size, size);
    }

    c.fillStyle = 'rgba(220,228,245,0.72)'; c.fill(whitePaths);
    c.fillStyle = 'rgba(160,195,255,0.65)'; c.fill(coolPaths);
    c.fillStyle = 'rgba(255,225,190,0.62)'; c.fill(warmPaths);

    for (let i = 0; i < 6; i++) {
      const x = rng() * W;
      const y = rng() * H;
      c.fillStyle = 'rgba(220,235,255,0.92)';
      c.beginPath();
      c.arc(x, y, 1.8, 0, Math.PI * 2);
      c.fill();
    }

    try {
      this._starsBitmap = off.transferToImageBitmap();
    } catch (_) {
      this._starsBitmap = null;
    }
  }

  // ── Nebula ────────────────────────────────────────────────────────────────
  _drawNebula(W, H) {
    const grd = this.ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
    grd.addColorStop(0,   'rgba(45,35,120,0.07)');
    grd.addColorStop(0.4, 'rgba(18,55,115,0.04)');
    grd.addColorStop(1,   'rgba(5,7,18,0)');
    this.ctx.fillStyle = grd;
    this.ctx.fillRect(0, 0, W, H);
  }

  // ── Overview Points (Typed Arrays, Linear Math, 10 Batches) ────────────────
  _drawOverviewPoints(zoom) {
    const { ctx, cam, W, H } = this;
    if (!this.overviewCount) return;

    const dotSize = Math.max(1.2, Math.min(3, 2.6 - zoom * 0.15));
    const half = dotSize / 2;
    const W2 = W / 2;
    const H2 = H / 2;
    const z  = cam.zoom;
    const cx = cam.x;
    const cy = cam.y;

    const xs    = this.overviewX;
    const ys    = this.overviewY;
    const ds    = this.overviewDigit;
    const count = this.overviewCount;

    // 10 Path2D batches, one per digit value
    const paths = Array.from({ length: 10 }, () => new Path2D());

    for (let i = 0; i < count; i++) {
      const sx = (xs[i] - cx) * z + W2;
      const sy = (ys[i] - cy) * z + H2;
      if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
      paths[ds[i]].rect(sx - half, sy - half, dotSize, dotSize);
    }

    const baseAlpha = Math.max(0.20, 1 - zoom / (ZOOM_DETAIL * 2));
    const alpha = (this.dimOthers ? DOT_ALPHA_DIM : 1) * baseAlpha;

    for (let d = 0; d < 10; d++) {
      const { r, g, b } = PALETTE[d];
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      ctx.fill(paths[d]);
    }
  }

  // ── Connected Constellation Lines (Filament Joining Spiral Points) ────────
  _drawConnectedLines(zoom) {
    const { ctx, cam, W, H } = this;
    if (!this.overviewCount) return;

    const xs    = this.overviewX;
    const ys    = this.overviewY;
    const count = this.overviewCount;
    const z     = cam.zoom;
    const cx    = cam.x;
    const cy    = cam.y;
    const W2    = W / 2;
    const H2    = H / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(126, 232, 250, 0.28)';
    ctx.lineWidth = Math.max(0.75, Math.min(2.0, 0.8 + zoom * 0.03));

    // Optimize: Stride overview points so max ~1,000 segments are stroked per frame (prevents Canvas 2D CPU lag)
    const stride = Math.max(1, (count / 1000) | 0);

    ctx.beginPath();
    let started = false;

    for (let i = 0; i < count; i += stride) {
      const sx = (xs[i] - cx) * z + W2;
      const sy = (ys[i] - cy) * z + H2;
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();

    // In close zoom, connect visible consecutive digits in the digit window
    if (this.digitWindow && zoom >= ZOOM_DETAIL / 2) {
      const { start, digits } = this.digitWindow;
      const startIdx = start - 1;
      const { iMin, iMax } = getVisibleIndexRange(cam, W, H);
      const winMin = Math.max(startIdx, iMin);
      const winMax = Math.min(startIdx + digits.length - 1, iMax);

      // Clamp visible range to max 350 to ensure 60 FPS without lag
      if (winMin <= winMax && winMax - winMin <= 350) {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.50)';
        ctx.lineWidth = Math.max(1, Math.min(2.5, zoom * 0.015));
        ctx.beginPath();
        let wStarted = false;
        for (let idx = winMin; idx <= winMax; idx++) {
          const { x, y } = phyllotaxisPos(idx);
          const sx = (x - cx) * z + W2;
          const sy = (y - cy) * z + H2;
          if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) {
            wStarted = false;
            continue;
          }
          if (!wStarted) {
            ctx.moveTo(sx, sy);
            wStarted = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // ── Digit Window: Analytically Culled O(visible) ──────────────────────────
  _drawDigitWindow(zoom) {
    const { ctx, cam, W, H, digitWindow, digitWindowAlpha, dimOthers, target } = this;
    if (!digitWindow) return;
    const { start, digits } = digitWindow;

    // Analytical culling in O(1)
    const { iMin, iMax } = getVisibleIndexRange(cam, W, H);
    const startIdx = start - 1;
    const endIdx   = startIdx + digits.length - 1;

    const winMin = Math.max(startIdx, iMin);
    const winMax = Math.min(endIdx, iMax);

    if (winMin > winMax) return;
    const visibleCount = winMax - winMin + 1;
    if (visibleCount > 6000) return; // Zoomed too far out, overview covers it

    const W2 = W / 2;
    const H2 = H / 2;
    const z  = cam.zoom;
    const cx = cam.x;
    const cy = cam.y;

    // Only render characters when zoomed in enough AND count is <= 300
    const showChars = zoom >= ZOOM_CHARS && visibleCount <= 300;

    const jStart = winMin - startIdx;
    const jEnd   = winMax - startIdx;

    if (showChars) {
      const fontSize = Math.max(10, Math.min(34, zoom * 0.10));
      ctx.font         = `${fontSize}px 'JetBrains Mono', monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      for (let j = jStart; j <= jEnd; j++) {
        const idx = startIdx + j;
        const { x, y } = phyllotaxisPos(idx);
        const sx = (x - cx) * z + W2;
        const sy = (y - cy) * z + H2;
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

        const digit = digits.charCodeAt(j) - 48;
        const isMatch = target && idx >= target.pos0 && idx < target.pos0 + target.len;
        const al = (dimOthers && !isMatch ? DOT_ALPHA_DIM : DOT_ALPHA) * digitWindowAlpha;
        const { r, g, b } = PALETTE[digit];
        ctx.globalAlpha = al;
        ctx.fillStyle   = `rgb(${r},${g},${b})`;
        ctx.fillText(digits[j], sx, sy);
      }
      ctx.globalAlpha = 1;
      return;
    }

    // Otherwise, draw dots using Path2D rects
    const paths     = Array.from({ length: 10 }, () => new Path2D());
    const matchPath = target ? new Path2D() : null;
    const ds0       = Math.max(0.6, Math.min(3, zoom * 0.016 + 0.5));

    for (let j = jStart; j <= jEnd; j++) {
      const idx = startIdx + j;
      const { x, y } = phyllotaxisPos(idx);
      const sx = (x - cx) * z + W2;
      const sy = (y - cy) * z + H2;
      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;

      const digit   = digits.charCodeAt(j) - 48;
      const ds      = dotSize(digit) * ds0;
      const isMatch = target && idx >= target.pos0 && idx < target.pos0 + target.len;

      if (isMatch && matchPath) {
        matchPath.rect(sx - ds, sy - ds, ds * 2, ds * 2);
      } else {
        paths[digit].rect(sx - ds, sy - ds, ds * 2, ds * 2);
      }
    }

    const baseAl = digitWindowAlpha;
    for (let d = 0; d < 10; d++) {
      const { r, g, b } = PALETTE[d];
      const al = (dimOthers ? DOT_ALPHA_DIM : DOT_ALPHA) * baseAl;
      ctx.fillStyle = `rgba(${r},${g},${b},${al.toFixed(2)})`;
      ctx.fill(paths[d]);
    }
    if (matchPath) {
      ctx.fillStyle = `rgba(200,245,255,${baseAl.toFixed(2)})`;
      ctx.fill(matchPath);
    }
  }

  // ── Target Highlight (High-Visibility Reticle & All Digit Coordinates) ────
  _drawTargetHighlight() {
    const { ctx, cam, W, H, target, targetPulse } = this;
    if (!target) return;

    ctx.save();
    let firstSx = null, firstSy = null;
    const matchPoints = [];

    for (let j = 0; j < target.len; j++) {
      const idx   = target.pos0 + j;
      const { x, y } = phyllotaxisPos(idx);
      const sx = (x - cam.x) * cam.zoom + W / 2;
      const sy = (y - cam.y) * cam.zoom + H / 2;
      const pos1 = idx + 1;
      matchPoints.push({ sx, sy, x, y, idx, pos1, j });
      if (j === 0) {
        firstSx = sx;
        firstSy = sy;
      }
    }

    // 1. Draw bright glowing connecting trail along the matched digits
    if (matchPoints.length > 1) {
      ctx.strokeStyle = `rgba(126, 232, 250, ${(0.85 + targetPulse * 0.15).toFixed(2)})`;
      ctx.lineWidth = Math.max(2, Math.min(5, cam.zoom * 0.02));
      ctx.beginPath();
      for (let j = 0; j < matchPoints.length; j++) {
        const { sx, sy } = matchPoints[j];
        if (j === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // 2. Glowing target rings & pulses on each digit
    for (let j = 0; j < matchPoints.length; j++) {
      const { sx, sy } = matchPoints[j];
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;

      const baseR  = Math.max(8, Math.min(22, cam.zoom * 0.045));
      const pulseR = baseR + targetPulse * 10;

      // Outer animated pulse ring
      ctx.strokeStyle = `rgba(126, 232, 250, ${(0.85 - targetPulse * 0.40).toFixed(2)})`;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      // Inner solid bright core ring
      ctx.strokeStyle = '#7ee8fa';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, baseR, 0, Math.PI * 2);
      ctx.stroke();

      // Central core dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Floating high-contrast callout banner above sequence
    if (firstSx !== null && firstSy !== null && firstSx > -150 && firstSx < W + 150 && firstSy > -60 && firstSy < H + 150) {
      const bannerLabel = target.query
        ? (target.len > 1 ? `Found "${target.query}" (${target.len} digits)` : `Found "${target.query}" • Pos #${(target.pos0 + 1).toLocaleString('en-US')}`)
        : `Position #${(target.pos0 + 1).toLocaleString('en-US')}`;
      ctx.font = 'bold 14px "Space Grotesk", sans-serif';
      const textWidth = ctx.measureText(bannerLabel).width;
      const padX   = 14;
      const badgeW = textWidth + padX * 2;
      const badgeH = 26;
      const badgeX = firstSx - badgeW / 2;
      const badgeY = firstSy - 42 - targetPulse * 3;

      ctx.fillStyle   = 'rgba(6, 12, 34, 0.96)';
      ctx.strokeStyle = 'rgba(126, 232, 250, 0.90)';
      ctx.lineWidth   = 1.8;

      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 7);
      else ctx.rect(badgeX, badgeY, badgeW, badgeH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle    = '#7ee8fa';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bannerLabel, firstSx, badgeY + badgeH / 2);

      // Downward pointer arrow
      ctx.fillStyle = 'rgba(126, 232, 250, 0.90)';
      ctx.beginPath();
      ctx.moveTo(firstSx - 5, badgeY + badgeH);
      ctx.lineTo(firstSx + 5, badgeY + badgeH);
      ctx.lineTo(firstSx, badgeY + badgeH + 6);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Coordinates & Position labels for ALL individual numbers
    for (let j = 0; j < matchPoints.length; j++) {
      const p = matchPoints[j];
      if (p.sx < -60 || p.sx > W + 60 || p.sy < -60 || p.sy > H + 60) continue;

      const posLabel = `#${p.pos1.toLocaleString('en-US')}`;
      const coordLabel = `(${p.x > 0 ? '+' : ''}${p.x.toFixed(1)}, ${p.y > 0 ? '+' : ''}${p.y.toFixed(1)})`;

      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const w1 = ctx.measureText(posLabel).width;
      ctx.font = '8.5px "JetBrains Mono", monospace';
      const w2 = ctx.measureText(coordLabel).width;
      const tagW = Math.max(w1, w2) + 12;
      const tagH = 24;

      const tagX = p.sx - tagW / 2;
      const tagY = p.sy + Math.max(12, cam.zoom * 0.045) + 6;

      ctx.fillStyle   = 'rgba(10, 16, 44, 0.92)';
      ctx.strokeStyle = 'rgba(140, 180, 255, 0.60)';
      ctx.lineWidth   = 1;

      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tagX, tagY, tagW, tagH, 5);
      else ctx.rect(tagX, tagY, tagW, tagH);
      ctx.fill();
      ctx.stroke();

      ctx.font         = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillStyle    = '#ffffff';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(posLabel, p.sx, tagY + 2);

      ctx.font      = '8.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#7ee8fa';
      ctx.fillText(coordLabel, p.sx, tagY + 13);
    }

    // 4. Guide line to screen center when zoomed out
    if (cam.zoom < ZOOM_CHARS && firstSx !== null) {
      const la = Math.max(0, 0.25 - cam.zoom / (ZOOM_CHARS * 2));
      if (la > 0.005) {
        ctx.strokeStyle = `rgba(126,232,250,${la.toFixed(3)})`;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(W / 2, H / 2);
        ctx.lineTo(firstSx, firstSy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  // ── Explore Mode (Free Pan & Zoom) ────────────────────────────────────────
  enableExplore(onNeedDigits) {
    this.exploreMode   = true;
    this._onNeedDigits = onNeedDigits;
    document.body.classList.add('explore');
    const c = this.canvas;

    this._onMouseDown = (e) => {
      this._drag = { startX: e.clientX, startY: e.clientY, camX: this.cam.x, camY: this.cam.y };
    };
    this._onMouseMove = (e) => {
      if (!this._drag) return;
      this.cam.x = this._drag.camX - (e.clientX - this._drag.startX) / this.cam.zoom;
      this.cam.y = this._drag.camY - (e.clientY - this._drag.startY) / this.cam.zoom;
      this._lastCamStr = null;
    };
    this._onMouseUp = () => {
      this._drag = null;
      this._fetchNearby();
    };
    this._onWheel = (e) => {
      e.preventDefault();
      const f  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const wb = screenToWorld(e.clientX, e.clientY, this.cam, this.W, this.H);
      this.cam.zoom = Math.max(0.01, Math.min(3000, this.cam.zoom * f));
      const wa = screenToWorld(e.clientX, e.clientY, this.cam, this.W, this.H);
      this.cam.x += wb.wx - wa.wx;
      this.cam.y += wb.wy - wa.wy;
      this._lastCamStr = null;
      this._fetchNearby();
    };

    let lastDist = null;
    this._onTouchStart = (e) => {
      if (e.touches.length === 1) {
        this._drag = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, camX: this.cam.x, camY: this.cam.y };
      } else if (e.touches.length === 2) {
        lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    };
    this._onTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this._drag) {
        this.cam.x = this._drag.camX - (e.touches[0].clientX - this._drag.startX) / this.cam.zoom;
        this.cam.y = this._drag.camY - (e.touches[0].clientY - this._drag.startY) / this.cam.zoom;
        this._lastCamStr = null;
      } else if (e.touches.length === 2 && lastDist !== null) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.cam.zoom = Math.max(0.01, Math.min(3000, this.cam.zoom * (d / lastDist)));
        lastDist = d;
        this._lastCamStr = null;
        this._fetchNearby();
      }
    };
    this._onTouchEnd = () => { this._drag = null; lastDist = null; };

    c.addEventListener('mousedown',  this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup',   this._onMouseUp);
    c.addEventListener('wheel',      this._onWheel,      { passive: false });
    c.addEventListener('touchstart', this._onTouchStart, { passive: false });
    c.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    c.addEventListener('touchend',   this._onTouchEnd);
  }

  disableExplore() {
    this.exploreMode = false;
    document.body.classList.remove('explore');
    const c = this.canvas;
    if (this._onMouseDown) c.removeEventListener('mousedown',  this._onMouseDown);
    if (this._onMouseMove) window.removeEventListener('mousemove', this._onMouseMove);
    if (this._onMouseUp)   window.removeEventListener('mouseup',   this._onMouseUp);
    if (this._onWheel)     c.removeEventListener('wheel',      this._onWheel);
    if (this._onTouchStart) c.removeEventListener('touchstart', this._onTouchStart);
    if (this._onTouchMove)  c.removeEventListener('touchmove',  this._onTouchMove);
    if (this._onTouchEnd)   c.removeEventListener('touchend',   this._onTouchEnd);
  }

  _fetchNearby() {
    if (!this._onNeedDigits) return;
    if (this._debounceFetchTimer) clearTimeout(this._debounceFetchTimer);
    this._debounceFetchTimer = setTimeout(() => {
      const { wx, wy } = screenToWorld(this.W / 2, this.H / 2, this.cam, this.W, this.H);
      const dist = Math.hypot(wx, wy);
      const approxIdx = Math.max(0, Math.round((dist / SPIRAL_C) ** 2 - 1));
      this._onNeedDigits(Math.max(1, approxIdx - 2500 + 1), 5000);
    }, 120);
  }

  // ── Render Loop ───────────────────────────────────────────────────────────
  startLoop() {
    if (this._raf) return;
    const loop = (t) => {
      this.render(t);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }
}

// ── Mulberry32 PRNG (Deterministic Star Positions) ───────────────────────────
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
