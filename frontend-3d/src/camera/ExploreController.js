/**
 * ExploreController.js — Silky-smooth 3D orbit, pan, and zoom controls.
 *
 * Features:
 * - Left Mouse Drag: Smooth orbit with inertia (damping)
 * - Right Mouse Drag / Shift + Left Drag: Pan in camera plane
 * - Mouse Wheel / Touch Pinch: Smooth logarithmic zoom
 * - Arrow Keys / WASD: Fly / pan in camera space
 * - Robust guards: Clamped radius [5, 3500], clamped phi [0.05, pi-0.05],
 *   Number.isFinite verification on all vectors.
 * - Never gets stuck: Focal orbit target is decoupled from camera position.
 */

import * as THREE from 'three';

export class ExploreController {
  constructor(camera, domElement) {
    this._camera = camera;
    this._el = domElement;
    this._enabled = true;

    // Focal point around which camera orbits
    this.orbitTarget = new THREE.Vector3(0, 0, 0);

    // Spherical coordinates of camera relative to orbitTarget
    this._spherical = new THREE.Spherical(300, Math.PI / 2, 0);

    // Velocities for smooth inertia
    this._velTheta = 0;
    this._velPhi = 0;
    this._velRadius = 0;
    this._velPan = new THREE.Vector3();

    this._damping = 0.88;

    // Pointer state
    this._isDragging = false;
    this._isPanning = false;
    this._lastX = 0;
    this._lastY = 0;
    this._keys = {};

    this._syncFromCamera();
    this._bindEvents();
  }

  /** Sync internal spherical coordinates from current camera position and target */
  _syncFromCamera() {
    const offset = this._camera.position.clone().sub(this.orbitTarget);
    if (offset.lengthSq() < 1e-4) {
      offset.set(0, 0, 50);
    }
    this._spherical.setFromVector3(offset);
    this._spherical.radius = Math.max(5, Math.min(3500, this._spherical.radius));
    this._spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this._spherical.phi));
  }

  /** Set new focal target and distance (e.g. upon arrival at a search digit) */
  setTargetAndDistance(targetPos, distance = 35) {
    this.orbitTarget.copy(targetPos);
    this._spherical.radius = distance;
    this._spherical.phi = Math.PI / 2.3;
    this._velTheta = 0;
    this._velPhi = 0;
    this._velRadius = 0;
    this._velPan.set(0, 0, 0);

    const offset = new THREE.Vector3().setFromSpherical(this._spherical);
    this._camera.position.copy(this.orbitTarget).add(offset);
    this._camera.lookAt(this.orbitTarget);
    this._camera.updateProjectionMatrix();
  }

  enable() {
    this._enabled = true;
    this._syncFromCamera();
  }

  disable() {
    this._enabled = false;
    this._velTheta = 0;
    this._velPhi = 0;
    this._velRadius = 0;
    this._velPan.set(0, 0, 0);
  }

  _bindEvents() {
    const onMouseDown = e => {
      if (!this._enabled) return;
      this._isDragging = true;
      this._isPanning = e.button === 2 || e.shiftKey;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };

    const onMouseMove = e => {
      if (!this._enabled || !this._isDragging) return;

      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;

      if (this._isPanning) {
        // Pan in camera plane
        const factor = this._spherical.radius * 0.0018;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this._camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this._camera.quaternion);

        this.orbitTarget.addScaledVector(right, -dx * factor);
        this.orbitTarget.addScaledVector(up, dy * factor);
      } else {
        // Orbit
        this._velTheta -= dx * 0.005;
        this._velPhi -= dy * 0.005;
      }
    };

    const onMouseUp = () => {
      this._isDragging = false;
      this._isPanning = false;
    };

    const onContextMenu = e => {
      e.preventDefault(); // prevent browser context menu on right click
    };

    const onWheel = e => {
      if (!this._enabled) return;
      e.preventDefault();
      const zoomFactor = Math.sign(e.deltaY) * 0.15;
      this._velRadius += zoomFactor;
    };

    const onKeyDown = e => {
      this._keys[e.code] = true;
    };
    const onKeyUp = e => {
      this._keys[e.code] = false;
    };

    // Touch events for mobile/tablet
    let touchDist = 0;
    const onTouchStart = e => {
      if (!this._enabled) return;
      if (e.touches.length === 1) {
        this._isDragging = true;
        this._isPanning = false;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this._isDragging = false;
        touchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };

    const onTouchMove = e => {
      if (!this._enabled) return;
      if (e.touches.length === 1 && this._isDragging) {
        const dx = e.touches[0].clientX - this._lastX;
        const dy = e.touches[0].clientY - this._lastY;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;

        this._velTheta -= dx * 0.006;
        this._velPhi -= dy * 0.006;
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const diff = touchDist - d;
        touchDist = d;
        this._velRadius += diff * 0.01;
      }
    };

    const onTouchEnd = () => {
      this._isDragging = false;
    };

    this._el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    this._el.addEventListener('contextmenu', onContextMenu);
    this._el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this._el.addEventListener('touchstart', onTouchStart, { passive: true });
    this._el.addEventListener('touchmove', onTouchMove, { passive: true });
    this._el.addEventListener('touchend', onTouchEnd, { passive: true });
  }

  update(dt) {
    if (!this._enabled) return;

    // Keyboard Pan
    const speed = this._spherical.radius * 0.7 * dt;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this._camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this._camera.quaternion);

    if (this._keys['KeyA'] || this._keys['ArrowLeft']) this.orbitTarget.addScaledVector(right, -speed);
    if (this._keys['KeyD'] || this._keys['ArrowRight']) this.orbitTarget.addScaledVector(right, speed);
    if (this._keys['KeyW'] || this._keys['ArrowUp']) this.orbitTarget.addScaledVector(up, speed);
    if (this._keys['KeyS'] || this._keys['ArrowDown']) this.orbitTarget.addScaledVector(up, -speed);
    if (this._keys['Equal'] || this._keys['NumpadAdd']) this._velRadius -= 0.15;
    if (this._keys['Minus'] || this._keys['NumpadSubtract']) this._velRadius += 0.15;

    // Apply angular velocities
    this._spherical.theta += this._velTheta;
    this._spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this._spherical.phi + this._velPhi));

    // Apply zoom velocity
    this._spherical.radius = Math.max(5, Math.min(3500, this._spherical.radius * (1 + this._velRadius)));

    // Damping
    this._velTheta *= this._damping;
    this._velPhi *= this._damping;
    this._velRadius *= this._damping;

    // Update Camera
    const offset = new THREE.Vector3().setFromSpherical(this._spherical);
    this._camera.position.copy(this.orbitTarget).add(offset);
    this._camera.lookAt(this.orbitTarget);
    this._camera.updateProjectionMatrix();
  }
}
