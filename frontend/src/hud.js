/**
 * hud.js — Result HUD card builder
 *
 * Renders the result card (found / not-found) and wires up the
 * control buttons (New Search, Replay, Explore, Connect Spiral, Share, Save card).
 */

import { PALETTE_CSS } from './palette.js';
import { phyllotaxisPos } from './galaxy.js';

/**
 * @param {Object} result         - API response from /api/search
 * @param {number} searchMs       - client-measured search time
 * @param {Function} onNewSearch  - callback for "New Search"
 * @param {Function} onReplay     - callback for "Replay"
 * @param {Function} onExplore    - callback for "Explore"
 * @param {Function} onToggleLines - callback for "Connect Spiral"
 * @param {Function} onShare      - callback for "Share"
 * @param {Function} onSave       - callback for "Save card"
 * @param {boolean} linesActive   - current state of connected lines
 */
export function renderHud(
  result,
  searchMs,
  onNewSearch,
  onReplay,
  onExplore,
  onToggleLines,
  onShare,
  onSave,
  linesActive = false
) {
  const hudEl = document.getElementById('hud');
  const headlineEl = document.getElementById('hud-headline');
  const metaEl = document.getElementById('hud-meta');
  const surroundEl = document.getElementById('hud-surrounding');
  const noteEl = document.getElementById('hud-note');

  document.body.classList.add('has-hud');

  const startPos = result.found ? result.position : result.longest_prefix_position;
  const matchStr = result.found ? result.query : (result.longest_prefix || '');

  // ── Headline with High-Visibility Badge ──────────────────────────────────
  if (result.found) {
    if (matchStr && matchStr.length > 1) {
      const endPos = startPos + matchStr.length - 1;
      headlineEl.innerHTML =
        `Found at positions <span class="pos">${fmt(startPos)} – ${fmt(endPos)}</span> in π <span style="font-size:0.85rem;color:var(--text-dim)">(${matchStr.length} digits)</span>`;
    } else {
      headlineEl.innerHTML =
        `Found at position <span class="pos">${fmt(result.position)}</span> in π`;
    }
  } else {
    headlineEl.innerHTML =
      `<span class="not-found-label">Not found</span> in ${fmt(result.N)} digits —` +
      (result.longest_prefix
        ? ` first ${result.longest_prefix.length} digits match at position <span class="pos">${fmt(result.longest_prefix_position)}</span>`
        : ` no prefix matched`);
  }

  // ── Meta row ─────────────────────────────────────────────────────────────
  const parts = [];

  if (result.found && result.occurrences != null) {
    parts.push(`<span><span class="meta-label">Occurrences:</span> <strong>${fmt(result.occurrences)}</strong></span>`);
  }
  parts.push(`<span><span class="meta-label">Search time:</span> <strong>${(result.search_ms ?? searchMs).toFixed(2)} ms</strong></span>`);
  parts.push(`<span><span class="meta-label">Indexed:</span> <strong>${fmt(result.N)} digits</strong></span>`);

  if (!result.found && result.probability_pct != null) {
    const pctStr = result.probability_pct < 0.01
      ? '<0.01%'
      : result.probability_pct.toFixed(2) + '%';
    parts.push(`<span><span class="meta-label">Probability:</span> <strong>${pctStr}</strong></span>`);
  }

  metaEl.innerHTML = parts.join('');

  // ── Surrounding context ──────────────────────────────────────────────────
  if (result.surrounding) {
    const s = result.surrounding;
    const ms = result.match_start ?? 0;
    const ml = result.match_len ?? (result.found ? result.query.length : (result.longest_prefix?.length ?? 0));

    const before = escHtml(s.slice(0, ms));
    const match  = escHtml(s.slice(ms, ms + ml));
    const after  = escHtml(s.slice(ms + ml));

    const cls = result.found ? 'match' : 'prefix-match';

    const coloured = (str, highlight = false) =>
      str.split('').map((ch) => {
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

  // ── All Digits Coordinates Breakdown (Compact & Scroller-Free) ──────────
  const coordsContainer = document.getElementById('hud-coords-breakdown');

  if (startPos && matchStr && matchStr.length > 0) {
    const pills = [];
    const indices = [];

    if (matchStr.length <= 8) {
      for (let i = 0; i < matchStr.length; i++) indices.push(i);
    } else {
      // First 4 digits, ellipsis, last 2 digits to guarantee zero overflow
      indices.push(0, 1, 2, 3, -1, matchStr.length - 2, matchStr.length - 1);
    }

    for (const idx of indices) {
      if (idx === -1) {
        pills.push(`<span class="coord-ellipsis">+${matchStr.length - 6} more digits</span>`);
        continue;
      }
      const pos1 = startPos + idx;
      const ch = matchStr[idx];
      const d = parseInt(ch, 10);
      const color = PALETTE_CSS[d] || '#7ee8fa';
      const { x, y } = phyllotaxisPos(pos1 - 1);
      pills.push(`
        <div class="coord-pill" title="Digit '${ch}' at position #${fmt(pos1)} (x: ${x.toFixed(1)}, y: ${y.toFixed(1)})">
          <span class="coord-digit" style="color:${color}">${ch}</span>
          <span class="coord-pos">#${fmt(pos1)}</span>
          <span class="coord-xy">(${x > 0 ? '+' : ''}${x.toFixed(1)}, ${y > 0 ? '+' : ''}${y.toFixed(1)})</span>
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

  // Hide note element if present to avoid pushing layout
  if (noteEl) {
    noteEl.style.display = 'none';
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  const newSearchBtn = document.getElementById('btn-new-search');
  if (newSearchBtn) newSearchBtn.onclick = onNewSearch;

  const replayBtn = document.getElementById('btn-replay');
  if (replayBtn) replayBtn.onclick = onReplay;

  const exploreBtn = document.getElementById('btn-explore');
  if (exploreBtn) exploreBtn.onclick = onExplore;

  const hudLinesBtn = document.getElementById('btn-hud-lines');
  if (hudLinesBtn) {
    hudLinesBtn.classList.toggle('active', linesActive);
    hudLinesBtn.onclick = () => {
      const active = onToggleLines();
      hudLinesBtn.classList.toggle('active', active);
    };
  }

  const shareBtn = document.getElementById('btn-share');
  if (shareBtn) shareBtn.onclick = onShare;

  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) saveBtn.onclick = onSave;

  // Show HUD
  hudEl.classList.remove('hidden');
}

export function hideHud() {
  document.getElementById('hud').classList.add('hidden');
  document.body.classList.remove('has-hud');
}

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US');
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
