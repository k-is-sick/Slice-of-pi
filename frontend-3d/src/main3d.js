/**
 * main3d.js — Slice of Pi 3D Frontend
 *
 * Integrated with:
 * - Three.js WebGL2 GPU-driven digit rendering
 * - Prominent 3D Celestial elements (Ringed Gas Giant, Solar System, Galaxies, Meteors)
 * - Constellation "Connect Spiral" feature
 * - Silky-smooth roaming/orbit/pan controls
 * - In-world 3D position badges for ALL matched digits
 * - Original rich UI styling, chips, top bar, and scroller-free HUD
 */

import * as THREE from 'three';
import { ChunkManager } from './renderer/ChunkManager.js';
import { OverviewRenderer } from './renderer/OverviewRenderer.js';
import { MatchHighlight } from './renderer/MatchHighlight.js';
import { ConstellationLines } from './renderer/ConstellationLines.js';
import { Stars } from './cosmos/Stars.js';
import { Nebulae } from './cosmos/Nebulae.js';
import { CosmicCelestial3D } from './cosmos/CosmicCelestial3D.js';
import { FlightController } from './camera/FlightController.js';
import { ExploreController } from './camera/ExploreController.js';
import { apiSearch, apiMeta } from './api.js';
import { showHUD, hideHUD, showToast } from './hud.js';
import { phyllotaxisPos } from './math.js';
import { QUALITY_PRESETS, currentQuality, setQuality } from './constants.js';

// ── State ─────────────────────────────────────────────────────────────────────

let mode = localStorage.getItem('slice_pi_mode') || '3d';
let quality = localStorage.getItem('slice_pi_quality') || 'high';
let N = 1_000_000;
let lastSearchData = null;
let searching = false;

// ── Three.js Setup ────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');

// WebGL2 check
const testCtx = canvas.getContext('webgl2');
if (!testCtx) {
  document.getElementById('no-webgl').style.display = 'grid';
  throw new Error('WebGL2 not available');
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050712);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 6000);
camera.position.set(0, 0, 300);

// Ambient & Directional Lights
const ambient = new THREE.AmbientLight(0x6070a0, 0.7);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
dirLight.position.set(200, 300, 200);
scene.add(dirLight);

// ── Systems ───────────────────────────────────────────────────────────────────

let zScale = mode === '2d' ? 0 : 1;

// Deep starfield
const stars = new Stars(scene);
stars.build(1.0);

// Sky dome nebulae
const nebulae = new Nebulae(scene);
nebulae.build();

// Prominent 3D Celestial Cosmos (Ringed Planet, Solar System, Galaxies, Shooting Stars)
const celestial = new CosmicCelestial3D(scene);

// Digit Overview points
const overview = new OverviewRenderer(scene);
overview.load().then(() => {});

// High-density digit chunks
const chunks = new ChunkManager(scene, zScale);

// Match highlight (pulsing rings, connecting line, 3D badges)
const highlight = new MatchHighlight(scene);

// Constellation "Connect Spiral" lines
const constellation = new ConstellationLines(scene);
constellation.setZScale(zScale);

// Camera Controllers
const flightCtrl = new FlightController(camera);
const exploreCtrl = new ExploreController(camera, canvas);

// Flight Progress Bar Element
const flightBar = document.getElementById('flight-bar');

// ── Main RAF Loop ─────────────────────────────────────────────────────────────

let lastNow = performance.now();

function frame(now) {
  requestAnimationFrame(frame);

  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;

  // 1. Camera Animation & Controls
  if (flightCtrl.isFlying() || flightCtrl.isSettling()) {
    exploreCtrl.disable();
    flightCtrl.update(dt, now);

    // Update progress bar
    if (flightBar && flightCtrl._flying) {
      flightBar.style.width = `${(flightCtrl._t * 100).toFixed(1)}%`;
    }
  } else {
    if (flightBar) flightBar.style.width = '0%';
    exploreCtrl.enable();
    exploreCtrl.update(dt);
  }

  // Safety check on camera position
  const cp = camera.position;
  if (!Number.isFinite(cp.x) || !Number.isFinite(cp.y) || !Number.isFinite(cp.z)) {
    camera.position.set(0, 0, 300);
  }

  const camPos = camera.position;
  const dist = camPos.length();

  // 2. Overview vs Local Chunks LOD Cross-Fade
  const showOverview = dist > 140;
  const overviewAlpha = Math.min(1, Math.max(0, (dist - 100) / 100));
  overview.update(zScale, showOverview ? overviewAlpha : 0.0);
  overview.setVisible(showOverview);

  if (dist < 220) {
    chunks.update(camera, camPos);
  }

  // 3. Highlight & Constellation Updates
  highlight.update(dt, dist);
  constellation.update(dt);

  // 4. Background Celestial Animations
  stars.update(dt, camPos);
  nebulae.update(dt);
  celestial.update(dt);

  // 5. Render Scene
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);

// ── Search Action ─────────────────────────────────────────────────────────────

async function doSearch(q) {
  if (!q) return;
  q = String(q).trim();
  if (!/^\d+$/.test(q)) {
    showToast('Please enter digits only (0-9)');
    return;
  }
  if (searching) return;
  searching = true;

  // Hide hero, show spinner
  const heroEl = document.getElementById('hero');
  const spinner = document.getElementById('spinner');
  if (heroEl) heroEl.classList.add('hidden');
  if (spinner) spinner.classList.add('visible');
  hideHUD();

  try {
    const data = await apiSearch(q);
    lastSearchData = data;

    // Show result HUD
    showHUD(data, mode, constellation.isActive());

    if (data.found) {
      const targetPos = data.position - 1; // 0-indexed

      // Highlight all matched dots with pulsing rings and 3D badges
      highlight.show(data.position, data.query, zScale);

      // Launch camera flight
      flightCtrl.flyTo(targetPos, zScale, arrivalTarget => {
        exploreCtrl.setTargetAndDistance(arrivalTarget, 35);
        showToast(`Arrived at position #${data.position.toLocaleString()}`);
      });
    } else if (data.longest_prefix_position) {
      const targetPos = data.longest_prefix_position - 1;
      highlight.show(data.longest_prefix_position, data.longest_prefix || '', zScale);

      flightCtrl.flyTo(targetPos, zScale, arrivalTarget => {
        exploreCtrl.setTargetAndDistance(arrivalTarget, 35);
        showToast('Flew to longest matching prefix');
      });
    }
  } catch (err) {
    showToast('Search failed: ' + err.message);
    if (heroEl) heroEl.classList.remove('hidden');
  } finally {
    searching = false;
    if (spinner) spinner.classList.remove('visible');
  }
}

// ── Constellation Lines Toggle ────────────────────────────────────────────────

function toggleConstellation() {
  const active = constellation.toggle();
  const btnTop = document.getElementById('btn-toggle-lines');
  const btnHud = document.getElementById('btn-hud-lines');

  if (btnTop) btnTop.classList.toggle('active', active);
  if (btnHud) btnHud.classList.toggle('active', active);

  showToast(`Constellation lines: ${active ? 'ON' : 'OFF'}`);
  return active;
}

// ── 2D / 3D Mode Toggle ───────────────────────────────────────────────────────

function toggleMode() {
  mode = mode === '3d' ? '2d' : '3d';
  localStorage.setItem('slice_pi_mode', mode);

  const modeBtns = [document.getElementById('ctrl-mode'), document.getElementById('btn-toggle-mode')];
  modeBtns.forEach(b => {
    if (b) b.textContent = mode.toUpperCase();
  });

  zScale = mode === '2d' ? 0 : 1;
  chunks.setZScale(zScale);
  constellation.setZScale(zScale);

  if (lastSearchData) {
    const pos = lastSearchData.found ? lastSearchData.position : lastSearchData.longest_prefix_position;
    const str = lastSearchData.found ? lastSearchData.query : (lastSearchData.longest_prefix || '');
    if (pos && str) {
      highlight.show(pos, str, zScale);
    }
  }

  showToast(`Switched to ${mode.toUpperCase()} mode`);

  if (mode === '2d') {
    camera.position.z = Math.max(camera.position.z, 120);
    camera.lookAt(exploreCtrl.orbitTarget.x, exploreCtrl.orbitTarget.y, 0);
  }
}

// ── Wire UI Events ────────────────────────────────────────────────────────────

const inputEl = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

// Search submission
if (searchBtn) {
  searchBtn.addEventListener('click', () => {
    if (inputEl) doSearch(inputEl.value);
  });
}
if (inputEl) {
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch(inputEl.value);
    }
  });
}

// Suggestion chips
const chipsEl = document.getElementById('chips');
if (chipsEl) {
  chipsEl.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const q = chip.dataset.q;
    if (inputEl) inputEl.value = q;
    doSearch(q);
  });
}

// New Search buttons (Hero restore)
function resetToNewSearch() {
  hideHUD();
  highlight.clear();
  const heroEl = document.getElementById('hero');
  if (heroEl) heroEl.classList.remove('hidden');
  if (inputEl) {
    inputEl.value = '';
    inputEl.focus();
  }
  // Smoothly center camera back to galaxy overview
  exploreCtrl.setTargetAndDistance(new THREE.Vector3(0, 0, 0), 300);
}

document.getElementById('btn-new-search')?.addEventListener('click', resetToNewSearch);
document.getElementById('btn-top-search')?.addEventListener('click', resetToNewSearch);

// Constellation toggle buttons
document.getElementById('btn-toggle-lines')?.addEventListener('click', toggleConstellation);
document.getElementById('btn-hud-lines')?.addEventListener('click', toggleConstellation);

// 2D / 3D mode buttons
document.getElementById('ctrl-mode')?.addEventListener('click', toggleMode);
document.getElementById('btn-toggle-mode')?.addEventListener('click', toggleMode);

// Replay button
document.getElementById('btn-replay')?.addEventListener('click', () => {
  if (!lastSearchData) return;
  const targetPos = (lastSearchData.found ? lastSearchData.position : lastSearchData.longest_prefix_position) - 1;
  flightCtrl.flyTo(targetPos, zScale, arrivalTarget => {
    exploreCtrl.setTargetAndDistance(arrivalTarget, 35);
  });
});

// Explore button
document.getElementById('btn-explore')?.addEventListener('click', () => {
  showToast('Explore mode: Drag to orbit, Right-drag/Shift to pan, Scroll to zoom');
});

// Share button
document.getElementById('btn-share')?.addEventListener('click', () => {
  if (!lastSearchData) return;
  const url = `${location.origin}${location.pathname}?n=${lastSearchData.query}&mode=${mode}`;
  navigator.clipboard.writeText(url).then(() => showToast('Share link copied!'));
});

// ── Window Resize ─────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Initial Meta Load & URL Params ────────────────────────────────────────────

apiMeta().then(meta => {
  if (meta && meta.N) {
    N = meta.N;
    chunks.setN(N);
    const badge = document.getElementById('hero-badge-n');
    if (badge) badge.textContent = `${N.toLocaleString()} DIGITS • CELESTIAL PHYLLOTAXIS ARCHIVE`;
  }
}).catch(() => {});

const urlParams = new URLSearchParams(location.search);
if (urlParams.has('mode')) {
  mode = urlParams.get('mode');
  zScale = mode === '2d' ? 0 : 1;
  const ctrlBtn = document.getElementById('ctrl-mode');
  if (ctrlBtn) ctrlBtn.textContent = mode.toUpperCase();
}
if (urlParams.has('n')) {
  const qn = urlParams.get('n');
  if (inputEl) inputEl.value = qn;
  setTimeout(() => doSearch(qn), 400);
}
