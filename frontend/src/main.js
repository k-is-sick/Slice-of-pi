/**
 * main.js — Slice of Pi entry point
 *
 * Orchestrates:
 *  - Galaxy idle animation on load
 *  - Search form + chip handling
 *  - Flight animation dispatch
 *  - HUD render + control callbacks (New Search, Replay, Explore, Connect Spiral, Share, Save)
 *  - URL param ?n=<digits> auto-fly
 *  - How-it-works modal
 *  - Constellation / connected lines toggle
 */

import { GalaxyRenderer, phyllotaxisPos, SPIRAL_C } from './galaxy.js';
import { FlightAnimation } from './animation.js';
import { renderHud, hideHud } from './hud.js';
import { apiSearch, apiOverview, apiMeta, apiDigits } from './api.js';
import { PALETTE_CSS } from './palette.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const canvas        = document.getElementById('main-canvas');
const heroEl        = document.getElementById('hero');
const searchInput   = document.getElementById('search-input');
const searchForm    = document.getElementById('search-form');
const flightBar     = document.getElementById('flight-bar');
const ariaLive      = document.getElementById('aria-live');
const toast         = document.getElementById('toast');
const modalOverlay  = document.getElementById('modal-overlay');
const btnToggleLines = document.getElementById('btn-toggle-lines');
const btnTopSearch   = document.getElementById('btn-top-search');

// ── State ─────────────────────────────────────────────────────────────────────
let galaxy = null;
let currentFlight = null;
let currentResult = null;
let currentQuery  = '';
let currentSearchId = 0;
let metaData      = { N: 1_000_000 };

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Wire up UI events synchronously first so chips and search work immediately
  wireUIEvents();

  // Initialise renderer
  galaxy = new GalaxyRenderer(canvas);

  // Start single render loop
  galaxy.startLoop();

  // Load meta first (need N for initial zoom)
  try {
    metaData = await apiMeta();
  } catch (e) {
    console.warn('Could not load meta:', e.message);
  }

  // Set initial zoom based on N
  galaxy.cam.zoom = computeInitialZoom(metaData.N);

  // Load + set overview
  try {
    const overview = await apiOverview();
    galaxy.setOverview(overview.samples);
  } catch (e) {
    console.warn('Could not load overview:', e.message);
    galaxy.setOverview(generateSyntheticOverview(20000));
  }

  // URL auto-fly
  const params = new URLSearchParams(window.location.search);
  const autoQ = params.get('n');
  if (autoQ && /^\d+$/.test(autoQ)) {
    searchInput.value = autoQ;
    setTimeout(() => doSearch(autoQ), 600);
  }

  // Build colour legend in modal
  buildColourLegend();
}

function wireUIEvents() {
  // Top bar controls
  if (btnToggleLines) {
    btnToggleLines.addEventListener('click', toggleLines);
  }
  if (btnTopSearch) {
    btnTopSearch.addEventListener('click', prepareNewSearch);
  }

  // Wire up suggestion chips via delegation on container
  const chipsContainer = document.getElementById('chips');
  if (chipsContainer) {
    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      e.preventDefault();
      const q = (chip.getAttribute('data-q') || chip.dataset.q || '').trim();
      if (q) {
        searchInput.value = q;
        searchInput.focus();
        doSearch(q);
      }
    });
  }

  // Wire up individual chips as well for direct click support
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const q = (chip.getAttribute('data-q') || chip.dataset.q || '').trim();
      if (q) {
        searchInput.value = q;
        searchInput.focus();
        doSearch(q);
      }
    });
  });

  // Wire up search form
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = searchInput.value.trim().replace(/\D/g, '');
      if (!q) return;
      searchInput.value = q;
      doSearch(q);
    });
  }

  // Only allow digits in search input
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchInput.value = searchInput.value.replace(/\D/g, '');
    });
  }

  // Type-to-Search (Auto-focus and type into search bar anywhere on the page)
  window.addEventListener('keydown', e => {
    const active = document.activeElement;
    const activeTag = (active?.tagName || '').toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || active?.isContentEditable) {
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    if (!searchInput) return;

    if (e.key && e.key.length === 1) {
      if (heroEl && heroEl.classList.contains('hidden')) {
        heroEl.classList.remove('hidden');
        if (typeof hideHUD === 'function') hideHUD();
        searchInput.value = '';
      }

      e.preventDefault();
      searchInput.focus();

      const start = searchInput.selectionStart ?? searchInput.value.length;
      const end = searchInput.selectionEnd ?? searchInput.value.length;
      const currentVal = searchInput.value;
      searchInput.value = currentVal.slice(0, start) + e.key + currentVal.slice(end);
      const newPos = start + e.key.length;
      searchInput.setSelectionRange(newPos, newPos);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    if (e.key === 'Backspace') {
      if (heroEl && !heroEl.classList.contains('hidden')) {
        e.preventDefault();
        searchInput.focus();
        const start = searchInput.selectionStart ?? searchInput.value.length;
        const end = searchInput.selectionEnd ?? searchInput.value.length;
        const currentVal = searchInput.value;
        if (start === end && start > 0) {
          searchInput.value = currentVal.slice(0, start - 1) + currentVal.slice(end);
          searchInput.setSelectionRange(start - 1, start - 1);
        } else if (start !== end) {
          searchInput.value = currentVal.slice(0, start) + currentVal.slice(end);
          searchInput.setSelectionRange(start, start);
        }
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  // Modal handlers
  const howItWorksBtn = document.getElementById('how-it-works-link');
  if (howItWorksBtn) howItWorksBtn.addEventListener('click', openModal);
  const modalCloseBtn = document.getElementById('modal-close');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalOverlay && modalOverlay.classList.contains('open')) closeModal();
      else if (!heroEl.classList.contains('hidden') || !document.getElementById('hud').classList.contains('hidden')) {
        prepareNewSearch();
      }
    }
  });
}

// ── Search flow with searchId guard and complete try/catch ─────────────────────
async function doSearch(q) {
  if (!q || !/^\d+$/.test(q)) return;
  const searchId = ++currentSearchId;
  currentQuery = q;

  try {
    // Stop any existing flight
    if (currentFlight) {
      currentFlight.stop();
      currentFlight = null;
    }

    // Reset galaxy state
    galaxy.clearTarget();
    galaxy.digitWindow   = null;
    galaxy.dimOthers     = false;
    galaxy.showHighlight = false;
    hideHud();
    flightBar.style.width = '0%';
    if (btnTopSearch) btnTopSearch.classList.add('hidden');

    // Collapse hero
    heroEl.classList.add('hidden');

    // Fetch search result
    const result = await apiSearch(q);
    if (searchId !== currentSearchId) return; // Stale query superseded

    currentResult = result;

    // Determine target position (0-indexed)
    let targetPos0, matchLen;
    if (result.found) {
      targetPos0 = result.position - 1;
      matchLen   = q.length;
    } else if (result.longest_prefix_position != null) {
      targetPos0 = result.longest_prefix_position - 1;
      matchLen   = result.longest_prefix?.length ?? 1;
    } else {
      showResult(result);
      return;
    }

    // Set target on galaxy with query text for callout badge
    galaxy.setTarget(targetPos0, matchLen, q);

    // Start flight
    currentFlight = new FlightAnimation(
      galaxy,
      targetPos0,
      matchLen,
      metaData.N,
      (t) => {
        if (searchId === currentSearchId) {
          flightBar.style.width = (t * 100).toFixed(1) + '%';
        }
      },
      () => {
        if (searchId === currentSearchId) {
          showResult(result);
        }
      }
    );
    currentFlight.start();

    // ARIA announcement
    ariaLive.textContent = result.found
      ? `Found "${q}" at position ${result.position.toLocaleString('en-US')} in pi.`
      : `"${q}" not found. Longest matching prefix has ${result.longest_prefix?.length ?? 0} digits.`;
  } catch (err) {
    console.error('[doSearch] Error:', err);
    showToast(`Error: ${err.message}`);
    heroEl.classList.remove('hidden');
    if (currentResult) {
      showResult(currentResult);
    }
  }
}

function showResult(result) {
  if (btnTopSearch) btnTopSearch.classList.remove('hidden');

  renderHud(
    result,
    result.search_ms ?? 0,
    () => prepareNewSearch(),
    () => replayFlight(),
    () => enterExplore(),
    () => toggleLines(),
    () => shareResult(),
    () => saveCard(),
    galaxy.showConnectedLines
  );
}

// ── New Search / Reset to Input ────────────────────────────────────────────────
function prepareNewSearch() {
  hideHud();
  if (btnTopSearch) btnTopSearch.classList.add('hidden');
  heroEl.classList.remove('hidden');
  searchInput.focus();
  searchInput.select();
}

// ── Toggle Constellation / Spiral Lines ───────────────────────────────────────
function toggleLines() {
  const active = galaxy.toggleConnectedLines();
  if (btnToggleLines) {
    btnToggleLines.classList.toggle('active', active);
  }
  const hudLinesBtn = document.getElementById('btn-hud-lines');
  if (hudLinesBtn) {
    hudLinesBtn.classList.toggle('active', active);
  }
  showToast(active ? 'Spiral constellation lines: ON' : 'Spiral constellation lines: OFF');
  return active;
}

// ── Replay ────────────────────────────────────────────────────────────────────
function replayFlight() {
  if (!currentResult) return;
  hideHud();
  flightBar.style.width = '0%';
  galaxy.clearTarget();
  galaxy.dimOthers     = false;
  galaxy.showHighlight = false;
  galaxy.digitWindow   = null;

  const q = currentQuery;
  const result = currentResult;

  let targetPos0 = result.found
    ? result.position - 1
    : (result.longest_prefix_position ?? 1) - 1;
  let matchLen = result.found
    ? q.length
    : (result.longest_prefix?.length ?? 1);

  galaxy.cam.x = 0;
  galaxy.cam.y = 0;
  galaxy.cam.zoom = computeInitialZoom(metaData.N);
  galaxy.setTarget(targetPos0, matchLen, q);

  currentFlight = new FlightAnimation(
    galaxy,
    targetPos0,
    matchLen,
    metaData.N,
    (t) => { flightBar.style.width = (t * 100).toFixed(1) + '%'; },
    () => { showResult(result); }
  );
  currentFlight.start();
}

// ── Explore mode ──────────────────────────────────────────────────────────────
function enterExplore() {
  hideHud();
  galaxy.enableExplore((start, count) => {
    apiDigits(start, count).then(({ digits, start: s }) => {
      galaxy.setDigitWindow(s, digits);
    }).catch(() => {});
  });

  const exitBtn = document.createElement('button');
  exitBtn.id = 'exit-explore-btn';
  exitBtn.textContent = '← Back to Result';
  exitBtn.className = 'ctrl-btn primary';
  exitBtn.style.cssText = `
    position: fixed; top: 70px; left: 24px; z-index: 35;
    pointer-events: auto; backdrop-filter: blur(16px);
    background: rgba(14,20,50,0.92); border: 1.5px solid rgba(126,232,250,0.6);
    color: #7ee8fa; font-weight: 700; box-shadow: 0 4px 20px rgba(0,0,0,0.6);
  `;
  exitBtn.onclick = () => {
    galaxy.disableExplore();
    exitBtn.remove();
    showResult(currentResult);
  };
  document.body.appendChild(exitBtn);
}

// ── Share ──────────────────────────────────────────────────────────────────────
function shareResult() {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('n', currentQuery);
  navigator.clipboard.writeText(url.toString())
    .then(() => showToast('Link copied to clipboard!'))
    .catch(() => showToast('Copy failed — URL: ' + url.toString()));
}

// ── Save card ─────────────────────────────────────────────────────────────────
function saveCard() {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width  = canvas.width;
  exportCanvas.height = canvas.height;

  const ctx = exportCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);

  const dpr = window.devicePixelRatio || 1;
  ctx.font = `bold ${32 * dpr}px 'Space Grotesk', sans-serif`;
  ctx.fillStyle = 'rgba(126,232,250,0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `"${currentQuery}" in π`,
    exportCanvas.width / 2,
    exportCanvas.height - 60 * dpr
  );

  const pos = currentResult?.found
    ? `Position ${currentResult.position.toLocaleString('en-US')}`
    : `Not found (${currentResult?.longest_prefix?.length ?? 0} digits matched)`;

  ctx.font = `${18 * dpr}px 'Space Grotesk', sans-serif`;
  ctx.fillStyle = 'rgba(232,234,246,0.65)';
  ctx.fillText(pos, exportCanvas.width / 2, exportCanvas.height - 28 * dpr);

  ctx.font = `${13 * dpr}px 'Space Grotesk', sans-serif`;
  ctx.fillStyle = 'rgba(232,234,246,0.3)';
  ctx.textAlign = 'right';
  ctx.fillText('Slice of Pi', exportCanvas.width - 20 * dpr, exportCanvas.height - 10 * dpr);

  const a = document.createElement('a');
  a.download = `slice-of-pi-${currentQuery}.png`;
  a.href = exportCanvas.toDataURL('image/png');
  a.click();
  showToast('Image saved!');
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal() { modalOverlay.classList.add('open'); }
function closeModal() { modalOverlay.classList.remove('open'); }

// ── Colour legend ─────────────────────────────────────────────────────────────
function buildColourLegend() {
  const container = document.getElementById('colour-legend');
  if (!container) return;
  container.innerHTML = '';
  for (let d = 0; d <= 9; d++) {
    const wrap = document.createElement('div');
    wrap.className = 'colour-swatch';

    const dot = document.createElement('div');
    dot.className = 'swatch-dot';
    dot.style.background = PALETTE_CSS[d];

    const label = document.createElement('div');
    label.className = 'swatch-label';
    label.textContent = String(d);

    wrap.appendChild(dot);
    wrap.appendChild(label);
    container.appendChild(wrap);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeInitialZoom(N) {
  const maxR = SPIRAL_C * Math.sqrt(N + 1);
  const halfViewport = Math.min(window.innerWidth || 800, window.innerHeight || 600) / 2;
  return (halfViewport / maxR) * 0.80;
}

function generateSyntheticOverview(count) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const samples = [];
  for (let i = 0; i < count; i++) {
    const digit = Math.floor(((i * phi) % 1) * 10);
    samples.push({ pos: i * Math.ceil(1_000_000 / count) + 1, digit });
  }
  return samples;
}

// ── Kick off ──────────────────────────────────────────────────────────────────
init().catch(console.error);
