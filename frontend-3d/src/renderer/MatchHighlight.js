/**
 * MatchHighlight.js — High-visibility matched digit visualization in 3D:
 * 1. Pulsing golden/cyan core rings around ALL matched digit positions
 * 2. Connecting data-driven great-circle arcs (SLERP) across the sphere surface
 * 3. Individual 3D position badges for ALL digits showing:
 *    - Digit value (e.g. '2')
 *    - Exact position (e.g. '#3,118')
 */

import * as THREE from 'three';
import { SPHERE_R, computeDigitTrajectory, generateGreatCirclePath } from '../math.js';

const MAX_DISPLAY = 10;

const PALETTE_COLORS = [
  '#f87171', // 0
  '#fbbf24', // 1
  '#34d399', // 2
  '#60a5fa', // 3
  '#c084fc', // 4
  '#fb923c', // 5
  '#2dd4bf', // 6
  '#f472b6', // 7
  '#a3e635', // 8
  '#a78bfa', // 9
];

function makePositionBadgeTexture(digitChar, positionNum, colorHex) {
  const w = 140;
  const h = 70;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Background rounded badge (original radiant styling)
  ctx.fillStyle = 'rgba(6, 10, 32, 0.94)';
  ctx.strokeStyle = colorHex || '#7ee8fa';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.roundRect(8, 6, w - 16, h - 12, 12);
  ctx.fill();
  ctx.stroke();

  // Digit character (prominent)
  ctx.fillStyle = colorHex || '#ffffff';
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(digitChar, w / 2, 24);

  // Position number (#3,118)
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.fillText(`#${positionNum.toLocaleString()}`, w / 2, 48);

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  return tex;
}

export class MatchHighlight {
  constructor(scene) {
    this._scene = scene;
    this._dotMesh = null;
    this._lineMesh = null;
    this._badgeGroup = new THREE.Group();
    this._scene.add(this._badgeGroup);

    this._active = false;
    this._time = 0;
  }

  /**
   * Highlight all consecutive digits of the matched sequence with data-driven spherical arcs.
   * @param {number} startPos1 1-indexed start position in pi
   * @param {string} matchStr the matched string of digits (e.g. "2026")
   * @param {number} zScale current zScale
   */
  show(startPos1, matchStr = '', zScale = 1.0) {
    this.clear();
    if (!startPos1 || !matchStr || matchStr.length === 0) return;
    this._active = true;

    // Cap displayed digits to avoid clutter
    const displayStr = matchStr.slice(0, MAX_DISPLAY);
    const count = displayStr.length;

    // 1. Data-Driven Trajectory Waypoints on Sphere Surface
    const waypoints = computeDigitTrajectory(startPos1, displayStr, SPHERE_R);
    if (!waypoints || waypoints.length === 0) return;

    // ── 1. Pulsing Glowing Rings on EVERY matched digit ─────────────────────
    const dotPts = waypoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const dotGeo = new THREE.BufferGeometry().setFromPoints(dotPts);

    const dotMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        uniform float time;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float pulse = 1.0 + 0.3 * sin(time * 4.0);
          gl_PointSize = 15.0 * pulse;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float time;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float r = dot(uv, uv);
          if (r > 0.25) discard;
          float ring = abs(r - 0.14);
          float core = smoothstep(0.04, 0.0, r);
          float a = core * 2.0 + smoothstep(0.025, 0.0, ring) * 1.4;
          gl_FragColor = vec4(0.49, 0.91, 0.98, min(1.0, a)); // Glowing Cyan #7ee8fa
        }
      `,
      uniforms: { time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._dotMesh = new THREE.Points(dotGeo, dotMat);
    this._scene.add(this._dotMesh);

    // ── 2. Connecting Great-Circle Arcs Between Consecutive Digits ───────────
    if (waypoints.length >= 2) {
      const arcPoints = generateGreatCirclePath(waypoints, 16, SPHERE_R + 0.35);
      const linePts = arcPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));

      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x7ee8fa,
        transparent: true,
        opacity: 0.80,
        depthWrite: false,
      });
      this._lineMesh = new THREE.Line(lineGeo, lineMat);
      this._scene.add(this._lineMesh);
    }

    // ── 3. Position Badges for ALL Digits (Surface Normal Stems) ─────────────
    for (let k = 0; k < count; k++) {
      const ch = displayStr[k];
      const d = parseInt(ch, 10);
      const colorHex = !isNaN(d) ? PALETTE_COLORS[d] : '#7ee8fa';
      const currentPos1 = startPos1 + k;

      const badgeTex = makePositionBadgeTexture(ch, currentPos1, colorHex);
      const spriteMat = new THREE.SpriteMaterial({
        map: badgeTex,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(spriteMat);
      const p = waypoints[k];
      const len = Math.hypot(p.x, p.y, p.z) || 1;
      const nx = p.x / len, ny = p.y / len, nz = p.z / len;
      const offset = 6.0;

      sprite.position.set(p.x + nx * offset, p.y + ny * offset, p.z + nz * offset);
      sprite.scale.set(4.5, 2.25, 1.0);
      this._badgeGroup.add(sprite);

      // Connecting stem line from dot to badge along normal
      const stemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Vector3(p.x + nx * offset * 0.65, p.y + ny * offset * 0.65, p.z + nz * offset * 0.65),
      ]);
      const stemMat = new THREE.LineBasicMaterial({
        color: 0x7ee8fa,
        transparent: true,
        opacity: 0.45,
      });
      const stem = new THREE.Line(stemGeo, stemMat);
      this._badgeGroup.add(stem);
    }
  }

  update(dt, camDist = 100) {
    if (!this._active) return;
    this._time += dt;
    if (this._dotMesh) {
      this._dotMesh.material.uniforms.time.value = this._time;
    }
    // Only show 3D badges when zoomed near enough (< 160 units)
    this._badgeGroup.visible = camDist < 160;
  }

  clear() {
    this._active = false;
    if (this._dotMesh) {
      this._scene.remove(this._dotMesh);
      this._dotMesh.geometry.dispose();
      this._dotMesh.material.dispose();
      this._dotMesh = null;
    }
    if (this._lineMesh) {
      this._scene.remove(this._lineMesh);
      this._lineMesh.geometry.dispose();
      this._lineMesh.material.dispose();
      this._lineMesh = null;
    }
    while (this._badgeGroup.children.length > 0) {
      const child = this._badgeGroup.children[0];
      this._badgeGroup.remove(child);
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
      if (child.geometry) child.geometry.dispose();
    }
  }

  dispose() {
    this.clear();
    this._scene.remove(this._badgeGroup);
  }
}
