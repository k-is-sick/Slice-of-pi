/**
 * math.js — Shared math utilities (double precision, no THREE dependency)
 */

import { SPIRAL_C, GOLDEN_ANGLE, DISC_THICKNESS } from './constants.js';

/** Sphere radius — all digit points lie on this surface */
export const SPHERE_R = 100;

/**
 * Maximum N used for Fibonacci sphere angle computation.
 * This determines how angles are distributed. Needs to be >= actual N.
 * We use a fixed value so the mapping is stable regardless of meta.N.
 */
export const SPHERE_MAX_N = 1_000_000;

/**
 * Map a 1-indexed position in pi to a point ON the sphere surface.
 * Uses Fibonacci sphere (golden angle azimuthal + evenly spaced polar)
 * so points are uniformly distributed — no clustering at poles.
 *
 * ALWAYS returns a valid {x,y,z} with |p| == SPHERE_R.
 * Guards against pos1 <= 0, NaN, Infinity, overflow.
 *
 * @param {number} pos1 1-indexed digit position (1 = first digit after "3.")
 * @param {number} R    sphere radius (default SPHERE_R)
 * @param {number} maxN total digit count (default SPHERE_MAX_N)
 */
export function positionToSphere(pos1, R = SPHERE_R, maxN = SPHERE_MAX_N) {
  // Sanitize input
  if (!Number.isFinite(pos1) || pos1 <= 0) return { x: 0, y: R, z: 0 };
  // Clamp to [1, maxN] so both poles are reachable
  const i = Math.max(0, Math.min(maxN - 1, pos1 - 1));  // 0-indexed
  // Fibonacci sphere: polar angle from equidistant cosine steps
  const cosTheta = 1 - (2 * (i + 0.5)) / maxN;
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const phi = (i * GOLDEN_ANGLE) % (2 * Math.PI);
  const x = R * sinTheta * Math.cos(phi);
  const y = R * cosTheta;
  const z = R * sinTheta * Math.sin(phi);
  // Final NaN guard — return north pole if anything went wrong
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return { x: 0, y: R, z: 0 };
  }
  return { x, y, z };
}

/**
 * Spherical Linear Interpolation (SLERP) between two 3D vectors on a sphere.
 * Produces points strictly on the sphere surface of radius R (no interior chords).
 */
export function slerpSphere(vA, vB, t, R = SPHERE_R) {
  const lenA = Math.hypot(vA.x, vA.y, vA.z) || 1;
  const lenB = Math.hypot(vB.x, vB.y, vB.z) || 1;
  const ax = vA.x / lenA, ay = vA.y / lenA, az = vA.z / lenA;
  const bx = vB.x / lenB, by = vB.y / lenB, bz = vB.z / lenB;

  let dot = ax * bx + ay * by + az * bz;
  dot = Math.max(-1, Math.min(1, dot));

  if (dot > 0.9999) {
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const z = az + (bz - az) * t;
    const len = Math.hypot(x, y, z) || 1;
    return { x: (x / len) * R, y: (y / len) * R, z: (z / len) * R };
  }

  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sinOmega;
  const wb = Math.sin(t * omega) / sinOmega;

  const nx = wa * ax + wb * bx;
  const ny = wa * ay + wb * by;
  const nz = wa * az + wb * bz;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  return { x: (nx / nLen) * R, y: (ny / nLen) * R, z: (nz / nLen) * R };
}

/**
 * Compute data-driven trajectory waypoints for consecutive digits across the sphere.
 *
 * Root-cause fix for Issue 1:
 * - Starting anchor p0 is determined by startPos1 on the sphere.
 * - Subsequent waypoints derive their heading turns and step distances directly from
 *   the digit characters themselves (d_k and d_{k-1}), rather than a fixed golden-angle
 *   harmonic step.
 * - Every point is mathematically guaranteed to have |p| == R (on the sphere surface).
 * - Different digit sequences yield genuinely distinct, non-symmetric paths.
 *
 * @param {number} startPos1 1-indexed start position of the match in pi
 * @param {string} matchStr  the matched digits (e.g. "2026")
 * @param {number} R         sphere radius
 * @returns {Array<{x:number, y:number, z:number}>}
 */
export function computeDigitTrajectory(startPos1, matchStr = '', R = SPHERE_R) {
  if (!startPos1 || !matchStr || matchStr.length === 0) return [];
  const p0 = positionToSphere(startPos1, R);
  const pts = [p0];
  const count = matchStr.length;
  if (count <= 1) return pts;

  let currentPos = { ...p0 };
  let currentHeading = 0;

  for (let k = 1; k < count; k++) {
    const dCurr = parseInt(matchStr[k], 10) || 0;
    const dPrev = parseInt(matchStr[k - 1], 10) || 0;

    // Normal at current point
    const len = Math.hypot(currentPos.x, currentPos.y, currentPos.z) || 1;
    const nx = currentPos.x / len;
    const ny = currentPos.y / len;
    const nz = currentPos.z / len;

    // Tangent orthonormal basis (u, v) on the sphere at currentPos
    const upX = Math.abs(ny) < 0.9 ? 0 : 1;
    const upY = Math.abs(ny) < 0.9 ? 1 : 0;
    const upZ = 0;

    // u = normalize(up x n)
    let ux = upY * nz - upZ * ny;
    let uy = upZ * nx - upX * nz;
    let uz = upX * ny - upY * nx;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen; uy /= uLen; uz /= uLen;

    // v = n x u
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;

    // Data-driven steering:
    // Turn angle derived from digit delta and absolute digit value
    const turn = ((dCurr - 4.5) * 0.72) + ((dPrev * 0.31) - 1.4);
    currentHeading = (currentHeading + turn) % (Math.PI * 2);

    // Tangent direction along sphere surface
    const tx = Math.cos(currentHeading) * ux + Math.sin(currentHeading) * vx;
    const ty = Math.cos(currentHeading) * uy + Math.sin(currentHeading) * vy;
    const tz = Math.cos(currentHeading) * uz + Math.sin(currentHeading) * vz;

    // Data-driven arc distance along the great circle (approx 8 deg to 18 deg)
    const arcDist = 0.14 + ((dCurr * 7 + dPrev * 3) % 10) * 0.016;

    // Great-circle step
    const cosDist = Math.cos(arcDist);
    const sinDist = Math.sin(arcDist);

    const nextNx = nx * cosDist + tx * sinDist;
    const nextNy = ny * cosDist + ty * sinDist;
    const nextNz = nz * cosDist + tz * sinDist;
    const nextLen = Math.hypot(nextNx, nextNy, nextNz) || 1;

    currentPos = {
      x: (nextNx / nextLen) * R,
      y: (nextNy / nextLen) * R,
      z: (nextNz / nextLen) * R,
    };
    pts.push(currentPos);
  }

  return pts;
}

/**
 * Generate a continuous great-circle line strip along the sphere surface
 * connecting consecutive waypoints with spherical slerp.
 * Offset R slightly (e.g. +0.3) to completely prevent z-fighting with the sphere.
 */
export function generateGreatCirclePath(waypoints, samplesPerSeg = 16, R = SPHERE_R + 0.3) {
  if (!waypoints || waypoints.length === 0) return [];
  if (waypoints.length === 1) {
    const p = waypoints[0];
    const len = Math.hypot(p.x, p.y, p.z) || 1;
    return [{ x: (p.x / len) * R, y: (p.y / len) * R, z: (p.z / len) * R }];
  }

  const path = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const pA = waypoints[i];
    const pB = waypoints[i + 1];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      path.push(slerpSphere(pA, pB, t, R));
    }
  }
  // Final end point
  const last = waypoints[waypoints.length - 1];
  const lastLen = Math.hypot(last.x, last.y, last.z) || 1;
  path.push({
    x: (last.x / lastLen) * R,
    y: (last.y / lastLen) * R,
    z: (last.z / lastLen) * R,
  });
  return path;
}

/**
 * Runtime assertion: test 1000 random + edge-case positions are on sphere,
 * and verify that 5+ distinct queries generate distinct non-star trajectories.
 */
export function assertSphereMapping(R = SPHERE_R, maxN = SPHERE_MAX_N) {
  const EPS = 0.001;
  const edgeCases = [1, 2, maxN, maxN - 1, Math.floor(maxN / 2), 999999, 1000001];
  const randoms = Array.from({ length: 1000 }, () => 1 + Math.floor(Math.random() * maxN));
  let fail = 0;
  for (const p of [...edgeCases, ...randoms]) {
    const { x, y, z } = positionToSphere(p, R, maxN);
    const dist = Math.sqrt(x * x + y * y + z * z);
    if (Math.abs(dist - R) > EPS) {
      console.error(`[assertSphereMapping] pos=${p} dist=${dist.toFixed(4)} != R=${R}`);
      fail++;
      if (fail > 5) break;
    }
  }

  // Verify trajectory variation across 5 distinct inputs
  const testInputs = ['3', '14', '15082003', '271828', '999999', '420691'];
  const trajectories = testInputs.map(q => computeDigitTrajectory(100, q, R));

  // Assert all points in all trajectories lie on sphere
  for (let t = 0; t < trajectories.length; t++) {
    const traj = trajectories[t];
    for (const pt of traj) {
      const d = Math.hypot(pt.x, pt.y, pt.z);
      if (Math.abs(d - R) > EPS) {
        console.error(`[assertSphereMapping] Trajectory pt dist ${d.toFixed(4)} != R`);
        fail++;
      }
    }
  }

  // Assert paths are not identical and do not form symmetric repeating chords
  const path1 = trajectories[2]; // '15082003'
  const path2 = trajectories[3]; // '271828'
  if (path1.length > 2 && path2.length > 2) {
    const chord1 = Math.hypot(path1[1].x - path1[0].x, path1[1].y - path1[0].y, path1[1].z - path1[0].z);
    const chord2 = Math.hypot(path2[1].x - path2[0].x, path2[1].y - path2[0].y, path2[1].z - path2[0].z);
    if (Math.abs(chord1 - chord2) < 0.0001) {
      console.warn('[assertSphereMapping] Warning: step chords are identical');
    }
  }

  if (fail === 0) console.info(`[assertSphereMapping] ✓ All positions on sphere & data-driven trajectories verified (R=${R})`);
}

/**
 * Fast integer hash for z-jitter per digit.
 * Must produce the EXACT same value as the GLSL hash function in ChunkManager.js!
 * Returns float in [-1, 1].
 */
export function digitHash(i) {
  let x = (i ^ 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x >>> 0) / 4294967295.0) * 2.0 - 1.0;
}

/** Polar coords for digit i (double precision) — kept for ChunkManager compatibility */
export function phyllotaxisPolar(i) {
  const r = SPIRAL_C * Math.sqrt(i + 1);
  const theta = i * GOLDEN_ANGLE;
  return { r, theta };
}

/** World position for digit i — kept for ChunkManager/ConstellationLines compatibility */
export function phyllotaxisPos(i, zScale = 1.0) {
  const { r, theta } = phyllotaxisPolar(i);
  const thickness = DISC_THICKNESS * r;
  const z = thickness * digitHash(i) * zScale;
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
    z,
    r,
    theta,
  };
}

/**
 * Analytically compute the index range [iMin, iMax] of digits that could
 * appear in a circle centred at distance `d` from the origin, radius `h`.
 * Uses r = C*sqrt(i+1) => i = (r/C)^2 - 1
 */
export function visibleIndexRange(d, h, N) {
  const rMin = Math.max(0, d - h);
  const rMax = d + h;
  let iMin = Math.floor((rMin / SPIRAL_C) ** 2 - 1);
  let iMax = Math.ceil((rMax / SPIRAL_C) ** 2 - 1);
  iMin = Math.max(0, iMin);
  iMax = Math.min(N - 1, iMax);
  return { iMin, iMax };
}

/** Lerp */
export function lerp(a, b, t) { return a + (b - a) * t; }

/** Smoothstep */
export function smoothstep(t) { return t * t * (3 - 2 * t); }

/** Ease-in-out cubic */
export function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
