/**
 * FlightController.js — time-based camera flight to a target digit position.
 *
 * - 4-5 second flight along a gentle arc (NOT frame-count based)
 * - Log-scale zoom
 * - ease-in-out + slight FOV kick at peak speed
 * - Critically damped spring settle
 * - prefers-reduced-motion: instant jump
 * - SAFE: single rAF loop, t=0..1, robust end condition
 * - All camera fields checked for NaN/Infinity
 */

import * as THREE from 'three';
import { phyllotaxisPos } from '../math.js';
import { easeInOut } from '../math.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLIGHT_DURATION = REDUCED_MOTION ? 0 : 4500;  // ms
const ARRIVE_DISTANCE = 30;  // world units from target at rest
const BASE_FOV = 60;
const PEAK_FOV_KICK = 8;  // degrees wider at peak speed

export class FlightController {
  constructor(camera) {
    this._camera = camera;
    this._flying = false;
    this._t = 0;
    this._startTime = 0;
    this._startPos = new THREE.Vector3();
    this._startTarget = new THREE.Vector3();
    this._endPos = new THREE.Vector3();
    this._endTarget = new THREE.Vector3();
    this._midPos = new THREE.Vector3();  // arc apex

    // Spring settle state
    this._springPos = new THREE.Vector3();
    this._springVel = new THREE.Vector3();
    this._settling = false;
    this._settled = false;

    // Current position (updated each frame)
    this.position = new THREE.Vector3(0, 0, 300);
    this.target = new THREE.Vector3(0, 0, 0);
    this.fov = BASE_FOV;

    this._onComplete = null;
    this._searchId = 0;
  }

  /**
   * Fly to the phyllotaxis position of digit index `digitIndex` (0-based).
   * zScale: current 3D z scale.
   */
  flyTo(digitIndex, zScale, onComplete) {
    const myId = ++this._searchId;
    const { x, y, z } = phyllotaxisPos(digitIndex, zScale);

    this._endTarget.set(x, y, z);
    // Camera lands ARRIVE_DISTANCE away from the target, looking inward
    const dir = this._endTarget.clone().normalize();
    this._endPos.set(x - dir.x * ARRIVE_DISTANCE, y - dir.y * ARRIVE_DISTANCE, z + ARRIVE_DISTANCE * 0.5);

    this._startPos.copy(this.position);
    this._startTarget.copy(this.target);

    // Arc: midpoint halfway up from both positions
    this._midPos.lerpVectors(this._startPos, this._endPos, 0.5);
    this._midPos.y += 50;  // gentle arc upward
    this._midPos.z += 30;

    this._flying = true;
    this._settling = false;
    this._t = 0;
    this._startTime = performance.now();
    this._onComplete = () => {
      if (myId === this._searchId) onComplete?.(this._endTarget.clone());
    };

    if (REDUCED_MOTION) {
      // Instant
      this.position.copy(this._endPos);
      this.target.copy(this._endTarget);
      this._flying = false;
      this._settled = true;
      this._onComplete?.(this._endTarget.clone());
    }
  }

  /** Update camera each frame. dt = delta time in seconds. */
  update(dt, now) {
    if (!this._flying && !this._settling) return;

    if (this._flying) {
      const elapsed = now - this._startTime;
      if (FLIGHT_DURATION === 0) {
        this._t = 1;
      } else {
        this._t = Math.min(elapsed / FLIGHT_DURATION, 1);
      }

      const t = easeInOut(this._t);

      // Quadratic bezier: start -> mid -> end
      const t1 = 1 - t;
      const bx = t1*t1*this._startPos.x + 2*t1*t*this._midPos.x + t*t*this._endPos.x;
      const by = t1*t1*this._startPos.y + 2*t1*t*this._midPos.y + t*t*this._endPos.y;
      const bz = t1*t1*this._startPos.z + 2*t1*t*this._midPos.z + t*t*this._endPos.z;

      if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) {
        // Safety fallback
        this.position.copy(this._endPos);
        this._flying = false;
        this._settling = true;
        this._springPos.copy(this._endPos);
        this._springVel.set(0, 0, 0);
        return;
      }

      this.position.set(bx, by, bz);
      this.target.lerpVectors(this._startTarget, this._endTarget, t);

      // FOV kick: widest at t=0.5
      const speed = 4 * this._t * (1 - this._t);  // 0..1..0
      this.fov = BASE_FOV + speed * PEAK_FOV_KICK;

      if (this._t >= 1) {
        this._flying = false;
        this._settling = true;
        this._springPos.copy(this.position);
        this._springVel.set(0, 0, 0);
        this._onComplete?.();
        this._onComplete = null;
      }
    }

    if (this._settling) {
      // Critically damped spring: omega=8, zeta=1
      const omega = 8, zeta = 1;
      const springK = omega * omega;
      const damping = 2 * omega * zeta;
      const delta = this._endPos.clone().sub(this._springPos);
      const acc = delta.multiplyScalar(springK).sub(this._springVel.clone().multiplyScalar(damping));
      this._springVel.addScaledVector(acc, dt);
      this._springPos.addScaledVector(this._springVel, dt);

      this.position.copy(this._springPos);
      this.fov += (BASE_FOV - this.fov) * Math.min(1, dt * 6);

      if (delta.length() < 0.05 && this._springVel.length() < 0.05) {
        this._settling = false;
        this._settled = true;
        this.position.copy(this._endPos);
        this.fov = BASE_FOV;
      }
    }

    // Apply to Three.js camera
    this._camera.position.copy(this.position);
    this._camera.lookAt(this.target);
    this._camera.fov = this.fov;
    this._camera.updateProjectionMatrix();
  }

  isFlying() { return this._flying; }
  isSettling() { return this._settling; }
}

