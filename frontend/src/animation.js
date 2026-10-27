/**
 * animation.js — Camera flight controller
 *
 * Drives the camera from full galaxy view to the target digit's coordinates
 * with logarithmic zoom interpolation and cubic easing.
 *
 * Resilience features:
 * - Cancels any previous rAF loop before starting.
 * - Enforces finite, clamped values on all camera dimensions.
 * - Bounds zoom in log space: safe from log(0) and negative values.
 * - Wraps frame calculations in try/catch to fall back gracefully to _jumpToEnd().
 */

import { phyllotaxisPos, ZOOM_DETAIL, ZOOM_CHARS, SPIRAL_C } from './galaxy.js';
import { apiDigits } from './api.js';

// Cubic easing
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Log-linear zoom interpolation with sanity guards
function lerpZoom(z0, z1, t) {
  const safeZ0 = Math.max(1e-4, Number.isFinite(z0) ? z0 : 0.1);
  const safeZ1 = Math.max(1e-4, Number.isFinite(z1) ? z1 : 600);
  const safeT  = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return Math.exp(Math.log(safeZ0) * (1 - safeT) + Math.log(safeZ1) * safeT);
}

// Check prefers-reduced-motion
const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TOTAL_DURATION = 4200; // ms

export class FlightAnimation {
  /**
   * @param {GalaxyRenderer} galaxy
   * @param {number} targetPos0   - 0-indexed position in pi digits
   * @param {number} matchLen     - number of matched digits
   * @param {number} N            - total digits in index
   * @param {Function} onProgress - progress callback (t: 0..1)
   * @param {Function} onArrival  - callback when arrival finishes
   */
  constructor(galaxy, targetPos0, matchLen, N, onProgress, onArrival) {
    this.galaxy     = galaxy;
    this.targetPos0 = Math.max(0, targetPos0);
    this.matchLen   = Math.max(1, matchLen);
    this.N          = Math.max(10, N);
    this.onProgress = onProgress || (() => {});
    this.onArrival  = onArrival  || (() => {});

    const { x, y } = phyllotaxisPos(this.targetPos0);
    this.targetWorldX = x;
    this.targetWorldY = y;

    this.zoomStart = this._computeInitialZoom(this.N);
    this.zoomEnd   = 600;

    this._fetched500  = false;
    this._fetched5000 = false;
    this._raf         = null;
    this._startTime   = null;
    this._done        = false;
  }

  _computeInitialZoom(N) {
    const maxR = SPIRAL_C * Math.sqrt(N + 1);
    const halfViewport = Math.min(window.innerWidth || 800, window.innerHeight || 600) / 2;
    const zoom = (halfViewport / maxR) * 0.85;
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 0.1;
  }

  start() {
    this.stop(); // Cancel any existing rAF before starting

    if (prefersReduced()) {
      this._jumpToEnd();
      return;
    }

    const galaxy = this.galaxy;
    galaxy.cam.x    = 0;
    galaxy.cam.y    = 0;
    galaxy.cam.zoom = this.zoomStart;
    galaxy.dimOthers     = false;
    galaxy.showHighlight = false;
    galaxy.setTarget(this.targetPos0, this.matchLen);

    this._startTime = null;
    this._done      = false;
    this._raf       = requestAnimationFrame((ts) => this._frame(ts));
  }

  stop() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  _frame(timestamp) {
    if (this._done) return;

    try {
      if (!this._startTime) this._startTime = timestamp;
      const elapsed = timestamp - this._startTime;
      const rawT    = Math.min(1, elapsed / TOTAL_DURATION);
      const t       = easeInOutCubic(rawT);

      const galaxy = this.galaxy;

      // Camera interpolation
      if (rawT < 0.15) {
        const drift = rawT / 0.15;
        galaxy.cam.zoom = lerpZoom(this.zoomStart, this.zoomStart * 1.3, drift);
        galaxy.cam.x    = this.targetWorldX * drift * 0.2;
        galaxy.cam.y    = this.targetWorldY * drift * 0.2;
      } else if (rawT < 0.85) {
        const localT = (rawT - 0.15) / 0.70;
        const et     = easeInOutCubic(localT);

        galaxy.cam.zoom = lerpZoom(this.zoomStart * 1.3, this.zoomEnd, et);
        galaxy.cam.x    = this.targetWorldX * et;
        galaxy.cam.y    = this.targetWorldY * et;

        // Fetch windows at zoom thresholds
        const currentZoom = galaxy.cam.zoom;
        if (!this._fetched500 && currentZoom >= ZOOM_DETAIL) {
          this._fetched500 = true;
          const start = Math.max(1, this.targetPos0 - 250 + 1);
          apiDigits(start, 500).then(({ digits, start: s }) => {
            galaxy.setDigitWindow(s, digits);
          }).catch(() => {});
        }
        if (!this._fetched5000 && currentZoom >= ZOOM_CHARS * 0.6) {
          this._fetched5000 = true;
          const start = Math.max(1, this.targetPos0 - 2500 + 1);
          apiDigits(start, 5000).then(({ digits, start: s }) => {
            galaxy.setDigitWindow(s, digits);
          }).catch(() => {});
        }
      } else {
        galaxy.cam.x    = this.targetWorldX;
        galaxy.cam.y    = this.targetWorldY;
        galaxy.cam.zoom = this.zoomEnd;

        if (rawT > 0.88) {
          galaxy.dimOthers     = true;
          galaxy.showHighlight = true;
        }
      }

      // Assert finite numbers on camera
      if (!Number.isFinite(galaxy.cam.x) || !Number.isFinite(galaxy.cam.y) || !Number.isFinite(galaxy.cam.zoom)) {
        galaxy.cam.x    = this.targetWorldX;
        galaxy.cam.y    = this.targetWorldY;
        galaxy.cam.zoom = this.zoomEnd;
      }

      this.onProgress(rawT);

      if (rawT >= 1) {
        this._arrived();
        return;
      }

      this._raf = requestAnimationFrame((ts) => this._frame(ts));
    } catch (err) {
      console.error('[FlightAnimation] Recovered from frame error:', err);
      this._jumpToEnd();
    }
  }

  _arrived() {
    this._done = true;
    this.stop();

    const galaxy = this.galaxy;
    galaxy.cam.x         = this.targetWorldX;
    galaxy.cam.y         = this.targetWorldY;
    galaxy.cam.zoom      = this.zoomEnd;
    galaxy.dimOthers     = true;
    galaxy.showHighlight = true;

    this.onProgress(1);
    this.onArrival();
  }

  _jumpToEnd() {
    this._done = true;
    this.stop();

    const galaxy = this.galaxy;
    galaxy.cam.x         = this.targetWorldX;
    galaxy.cam.y         = this.targetWorldY;
    galaxy.cam.zoom      = this.zoomEnd;
    galaxy.setTarget(this.targetPos0, this.matchLen);
    galaxy.dimOthers     = true;
    galaxy.showHighlight = true;

    const start = Math.max(1, this.targetPos0 - 2500 + 1);
    apiDigits(start, 5000).then(({ digits, start: s }) => {
      galaxy.setDigitWindow(s, digits, true);
    }).catch(() => {});

    this.onProgress(1);
    this.onArrival();
  }
}
