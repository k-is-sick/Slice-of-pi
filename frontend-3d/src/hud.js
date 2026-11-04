/**
 * hud.js — Result HUD card renderer with full position breakdown and styling.
 */

import { SPHERE_R, positionToSphere, computeDigitTrajectory } from './math.js';

const PALETTE_CSS = [
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

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString() : String(n);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function showHUD(data, mode, linesActive = false) {
  const hudEl = document.getElementById('hud');
  const headlineEl = document.getElementById('hud-headline');
  const metaEl = document.getElementById('hud-meta');
  const surroundEl = document.getElementById('hud-surrounding');
  const coordsContainer = document.getElementById('hud-coords-breakdown');
  const topNewSearch = document.getElementById('btn-top-search');

  hudEl.classList.remove('hidden');
  document.body.classList.add('has-hud');
  if (topNewSearch) topNewSearch.classList.remove('hidden');

  const startPos = data.found ? data.position : data.longest_prefix_position;
  const matchStr = data.found ? data.query : (data.longest_prefix || '');

  // ── 1. Headline with High-Visibility Badge ─────────────────────────────────
  if (data.found) {
    if (matchStr && matchStr.length > 1) {
      const endPos = startPos + matchStr.length - 1;
      headlineEl.innerHTML =
        `Found at positions <span class="pos">#${fmt(startPos)} — #${fmt(endPos)}</span> in π <span style="font-size:0.85rem;color:var(--text-dim)">(${matchStr.length} digits)</span>`;
    } else {
      headlineEl.innerHTML =
        `Found at position <span class="pos">#${fmt(data.position)}</span> in π`;
    }
  } else {
    headlineEl.innerHTML =
      `<span class="not-found-label">Not found</span> in ${fmt(data.N || 1e6)} digits —` +
      (data.longest_prefix
        ? ` first ${data.longest_prefix.length} digits match at position <span class="pos">#${fmt(data.longest_prefix_position)}</span>`
        : ` no prefix matched`);
  }

  // ── 2. Meta Row ────────────────────────────────────────────────────────────
  const parts = [];
  if (data.found && data.occurrences != null) {
    parts.push(`<span><span class="meta-label">Occurrences:</span> <strong>${fmt(data.occurrences)}</strong></span>`);
  }
  parts.push(`<span><span class="meta-label">Search time:</span> <strong>${(data.search_ms ?? 0).toFixed(2)} ms</strong></span>`);
  parts.push(`<span><span class="meta-label">Indexed:</span> <strong>${fmt(data.N || 1e6)} digits</strong></span>`);

  if (!data.found && data.probability_pct != null) {
    const pctStr = data.probability_pct < 0.01
      ? '<0.01%'
      : data.probability_pct.toFixed(2) + '%';
    parts.push(`<span><span class="meta-label">Probability:</span> <strong>${pctStr}</strong></span>`);
  }
  metaEl.innerHTML = parts.join('');

  // ── 3. Surrounding Context with Per-Digit Coloring ─────────────────────────
  if (data.surrounding) {
    const s = data.surrounding;
    const ms = data.match_start ?? 0;
    const ml = data.match_len ?? (data.found ? data.query.length : (data.longest_prefix?.length ?? 0));

    const before = escHtml(s.slice(0, ms));
    const match  = escHtml(s.slice(ms, ms + ml));
    const after  = escHtml(s.slice(ms + ml));

    const cls = data.found ? 'match' : 'prefix-match';

    const coloured = (str, highlight = false) =>
      str.split('').map(ch => {
        const d = parseInt(ch, 10);
        const colour = PALETTE_CSS[d] || '#ffffff';
        const style = `color:${colour}`;
        return highlight
          ? `<span class="${cls}" style="${style}">${ch}</span>`
          : `<span style="${style}">${ch}</span>`;
      }).join('');

    surroundEl.innerHTML = coloured(before) + coloured(match, true) + coloured(after);
  } else {
    surroundEl.textContent = '—';
  }

  // ── 4. All Digits Coordinates Breakdown (Compact & Scroller-Free) ──────────
  if (startPos && matchStr && matchStr.length > 0) {
    const pills = [];
    const indices = [];

    if (matchStr.length <= 8) {
      for (let i = 0; i < matchStr.length; i++) indices.push(i);
    } else {
      // First 4 digits, ellipsis, last 2 digits to guarantee zero overflow
      indices.push(0, 1, 2, 3, -1, matchStr.length - 2, matchStr.length - 1);
    }

    const waypoints = computeDigitTrajectory(startPos, matchStr, SPHERE_R);

    for (const idx of indices) {
      if (idx === -1) {
        pills.push(`<span class="coord-ellipsis">+${matchStr.length - 6} more digits</span>`);
        continue;
      }
      const pos1 = startPos + idx;
      const ch = matchStr[idx];
      const d = parseInt(ch, 10);
      const color = PALETTE_CSS[d] || '#7ee8fa';
      const pt = waypoints[idx] || positionToSphere(pos1, SPHERE_R);

      // Convert to lat/lon for display
      const lat = (Math.asin(Math.max(-1, Math.min(1, pt.y / SPHERE_R))) * 180 / Math.PI).toFixed(1);
      const lon = (Math.atan2(pt.z, pt.x) * 180 / Math.PI).toFixed(1);
      pills.push(`
        <div class="coord-pill" title="Digit '${ch}' at position #${fmt(pos1)} (lat: ${lat}°, lon: ${lon}°)">
          <span class="coord-digit" style="color:${color}">${ch}</span>
          <span class="coord-pos">#${fmt(pos1)}</span>
          <span class="coord-xy">(${lat > 0 ? '+' : ''}${lat}°, ${lon > 0 ? '+' : ''}${lon}°)</span>
        </div>
      `);
    }

    if (coordsContainer) {
      coordsContainer.innerHTML = pills.join('');
      coordsContainer.style.display = 'flex';
    }
  } else if (coordsContainer) {
    coordsContainer.innerHTML = '';
    coordsContainer.style.display = 'none';
  }

  // Update Constellation button state
  const hudLinesBtn = document.getElementById('btn-hud-lines');
  if (hudLinesBtn) hudLinesBtn.classList.toggle('active', linesActive);

  // ARIA live region
  const aria = document.getElementById('aria-live');
  if (aria) {
    aria.textContent = data.found
      ? `Found "${data.query}" at position ${data.position}`
      : `"${data.query}" not found in first ${data.N || 1e6} digits`;
  }
}

export function hideHUD() {
  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.classList.add('hidden');
  document.body.classList.remove('has-hud');
  const topNewSearch = document.getElementById('btn-top-search');
  if (topNewSearch) topNewSearch.classList.add('hidden');
}

export function showToast(msg, ms = 2500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}
