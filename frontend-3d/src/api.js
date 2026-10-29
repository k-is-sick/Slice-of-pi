/**
 * api.js — API calls to the FastAPI backend
 */

const BASE = '';  // same origin in production; Vite proxy handles /api in dev

export async function apiSearch(q) {
  const r = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`Search failed: ${r.status}`);
  return r.json();
}

export async function apiMeta() {
  const r = await fetch(`${BASE}/api/meta`);
  if (!r.ok) throw new Error(`Meta failed: ${r.status}`);
  return r.json();
}

export async function apiOverview() {
  const r = await fetch(`${BASE}/api/overview`);
  if (!r.ok) throw new Error(`Overview failed: ${r.status}`);
  return r.json();
}

/**
 * Fetch a binary chunk of raw digit values (0-9, 1 byte each).
 * Returns a Uint8Array.
 */
export async function apiDigitsBin(start, count, signal) {
  const r = await fetch(`${BASE}/api/digits_bin?start=${start}&count=${count}`, { signal });
  if (!r.ok) throw new Error(`digits_bin failed: ${r.status}`);
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}

