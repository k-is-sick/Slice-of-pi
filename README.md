# Slice of Pi 🌀

> Find your number hiding in the digits of π.

Type any digit string and watch the camera fly through a phyllotaxis galaxy of 100 million digits to the exact spot your number first appears.

---

## Architecture

```
Slice_of_pi/
├── backend/
│   ├── build.py          # Data pipeline: generate/load digits, build index
│   ├── server.py         # FastAPI server (4 endpoints)
│   ├── search.py         # Two-tier search engine (Tier 1 + SA)
│   ├── benchmark.py      # p50/p99 latency benchmark
│   ├── tests/
│   │   └── test_search.py
│   └── data/             # Generated at build time (git-ignored)
│       ├── pi.digits        1 byte/digit ASCII, post-decimal
│       ├── tier1_k1.npy … tier1_k7.npy   first-occurrence tables
│       ├── suffix_array.npy              SA (uint32 or uint64)
│       └── meta.json                     N, sha256, built_at
└── frontend/
    ├── index.html
    ├── style.css
    └── src/
        ├── main.js        Orchestration, URL params, Share/Save
        ├── galaxy.js      Phyllotaxis renderer + Explore mode
        ├── animation.js   Flight camera animation
        ├── hud.js         Result card renderer
        ├── api.js         Fetch wrappers with LRU cache
        └── palette.js     10-colour digit palette
```

---

## Position Convention

- **Position 1** = the first digit **after** the decimal point.  
  π = 3.**1**4159265…  →  position 1 = `1`, position 5 = `9`, etc.
- The integer part (`3`) is not stored or indexed.

---

## Memory Sizing

| Artefact | Size formula | Example (100M digits) |
|----------|-------------|----------------------|
| `pi.digits` | N bytes | 100 MB |
| `suffix_array.npy` (uint32) | 4N bytes | 400 MB |
| `suffix_array.npy` (uint64) | 8N bytes | 800 MB (N ≥ 2³²) |
| Tier-1 tables k=1..7 | 4 × (10 + 100 + … + 10⁷) bytes | ~44 MB total |
| Runtime RAM (SA memmap) | OS page cache only | ~0 MB required |

**Total disk** for 100M digits: ~544 MB  
**Runtime RAM** (excluding page cache): < 100 MB

---

## Search Algorithm

### Tier 1 — O(1) for lengths 1–7
Pre-built `uint32` numpy arrays map every possible k-digit string directly to its first occurrence in `pi.digits`. Built once at index time by a single sequential scan.

### Tier 2 — O(k log N) for any length
Binary search (lower bound + upper bound) on the memory-mapped suffix array. The SA is a sorted index of all N starting positions; comparing a suffix to the query requires reading at most k bytes from the digit memmap.

**First occurrence** = `min(sa[lo:hi]) + 1`  
**Occurrences** = `hi - lo`

### Not-found path
Binary search on prefix length (1 .. len-1) finds the longest query prefix that does appear. The expected position of the full query is ~10^len (expected Nth occurrence at N/10^len), and the probability of appearance is shown: `P ≈ 1 − e^(−N/10^len)`.

---

## How to Scale N

| N | Notes |
|---|-------|
| ≤ 10M | Use `build.py --source generate N` (mpmath) |
| 10M – 10B | Use [y-cruncher](http://www.numberworld.org/y-cruncher/) → save `.txt` → `build.py --source file PATH` |
| > 2³² − 1 | SA automatically uses `uint64` (8 bytes/digit) |
| > 4B | Very large; SA = 32 GB. Use 64-bit OS, SSD-backed memmap |

**y-cruncher tip:** After generating, find the `.txt` output (e.g. `Pi - Dec - Chudnovsky.txt`), then:
```
python backend/build.py --source file "Pi - Dec - Chudnovsky.txt"
```

**pi2e.ch files** (digits-only, no `3.` prefix) — pass directly; the loader auto-detects.

---

## Setup

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

> **Note**: `gmpy2` may need a C compiler on some systems. If it fails, remove it from `requirements.txt`; `mpmath` alone handles up to 10M digits.

### 2. Generate pi digits & build the index

**Small dataset (1M digits, fast — for testing):**
```bash
python backend/build.py --source generate 1000000
```

**Default dev dataset (100M digits — recommended):**
```bash
python backend/build.py --source generate 10000000
# For 100M you need y-cruncher; see "How to Scale N" above
```

**From an existing file:**
```bash
python backend/build.py --source file /path/to/pi.txt
```

Build time for 10M digits: ~30 s on a modern laptop.  
Build time for 100M digits: ~5 min (SA construction dominates).

### 3. Run the API server
```bash
cd backend
uvicorn server:app --reload --port 8000
```

### 4. Serve the frontend
Open `frontend/index.html` directly in a browser, **or** use a dev server:
```bash
cd frontend
npx serve .
```

The frontend calls `/api/*` — set up a reverse proxy if running frontend and backend on different ports (or use `vite.config.js` proxy).

---

## Running Tests

```bash
pytest backend/tests/ -v
```

Tests require at least a 1M digit dataset. They will skip if `pi.digits` is missing.

---

## Benchmark

```bash
python backend/benchmark.py
```

**Targets (100M digits):**

| Query length | Tier | p99 target |
|---|---|---|
| 3 | Tier 1 (O(1)) | < 1 ms |
| 7 | Tier 1 (O(1)) | < 1 ms |
| 9 | SA binary search | < 5 ms |
| 12 | SA binary search | < 5 ms |

---

## API Reference

| Endpoint | Params | Description |
|----------|--------|-------------|
| `GET /api/search` | `q=<digits>` (max 50) | Search; returns position, occurrences, surrounding, search_ms |
| `GET /api/digits` | `start=<1-idx>&count=<≤5000>` | Window of raw digit characters |
| `GET /api/overview` | — | ~20k sampled positions for galaxy rendering (cached at startup) |
| `GET /api/meta` | — | N, sha256, built_at |

---

## Frontend Features

- **Phyllotaxis galaxy**: digit i at `(r=c√i, θ=i·137.508°)` — all coordinates computed in O(1)
- **Fly-through animation**: 4.2 s log-zoom + pan, 3-phase easing, threshold-based real-digit fetching
- **Colour-blind-safe palette**: 10 HSL colours in a cyan→magenta→gold ramp
- **Reduced motion**: skips animation entirely (`prefers-reduced-motion: reduce`)
- **Explore mode**: free pan + pinch-zoom after landing, fetches digit windows on demand
- **Share link**: `?n=<digits>` URL that auto-flies on load
- **Save card**: PNG export of the current canvas frame with number and position overlay
- **ARIA**: live region announces results; all controls keyboard-accessible
- **Responsive**: down to 360px width

---

## License

MIT
