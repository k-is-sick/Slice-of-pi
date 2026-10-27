/**
 * api.js — Backend fetch wrappers with in-flight deduplication and LRU caching
 */

const BASE = '/api';
const CACHE = new Map();
const CACHE_MAX = 200;
const IN_FLIGHT = new Map();

function cacheGet(key) { return CACHE.get(key); }

function cacheSet(key, value) {
  if (CACHE.size >= CACHE_MAX) {
    CACHE.delete(CACHE.keys().next().value);
  }
  CACHE.set(key, value);
}

export async function fetchJSON(url) {
  const cached = cacheGet(url);
  if (cached !== undefined) return cached;

  if (IN_FLIGHT.has(url)) {
    return IN_FLIGHT.get(url);
  }

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      cacheSet(url, data);
      return data;
    } finally {
      IN_FLIGHT.delete(url);
    }
  })();

  IN_FLIGHT.set(url, promise);
  return promise;
}

/** GET /api/search?q=<digits> */
export async function apiSearch(q) {
  return fetchJSON(`${BASE}/search?q=${encodeURIComponent(q)}`);
}

/**
 * GET /api/digits?start=<1-indexed>&count=<max5000>
 * Keyed by start block (nearest 1000) for caching / dedupe efficiency.
 */
export async function apiDigits(start, count) {
  const safeStart = Math.max(1, Math.floor(start));
  const safeCount = Math.min(5000, Math.max(1, Math.floor(count)));
  return fetchJSON(`${BASE}/digits?start=${safeStart}&count=${safeCount}`);
}

/** GET /api/overview — cached by server, lightweight */
let _overviewPromise = null;
export async function apiOverview() {
  if (!_overviewPromise) {
    _overviewPromise = fetchJSON(`${BASE}/overview`);
  }
  return _overviewPromise;
}

/** GET /api/meta */
let _metaPromise = null;
export async function apiMeta() {
  if (!_metaPromise) {
    _metaPromise = fetchJSON(`${BASE}/meta`);
  }
  return _metaPromise;
}
