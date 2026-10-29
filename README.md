# Slice of Pi 🥧✨

> Find your number hiding in the digits of π. A 3D WebGL2 cosmos & phyllotaxis galaxy explorer.

Type any digit string and watch the camera embark on a 3D flight through a procedural cosmos and phyllotaxis spiral of digits to the exact spot your sequence first appears.

---

## Architecture Overview

```
Slice_of_pi/
├── backend/
│   ├── build.py          # Data pipeline: generate/load digits, build Tier 1 & SA
│   ├── server.py         # FastAPI server (JSON & binary endpoints)
│   ├── search.py         # Two-tier search engine (Tier 1 direct + Suffix Array binary search)
│   ├── benchmark.py      # p50/p99 latency benchmarking
│   ├── verify_3d.py      # Automated Playwright test suite for 3D/2D verification
│   ├── tests/            # pytest unit & property tests
│   └── data/             # Generated artefacts (mmap-backed)
│       ├── pi.digits     # Raw ASCII digit bytes (1 byte/digit post-decimal)
│       ├── tier1_k*.npy  # Direct lookup tables (k=1..7)
│       ├── suffix_array.npy # Suffix array (uint32 for N < 2^32, uint64 for N ≥ 2^32)
│       └── meta.json     # N, SHA-256, build timestamp
├── frontend-3d/          # Modern WebGL2 Three.js + Vite frontend
│   ├── index.html        # Star-atlas landing UI & HUD card
│   ├── vite.config.js    # Vite build config with backend API proxy
│   └── src/
│       ├── main3d.js     # Orchestration, single RAF loop, state & mode management
│       ├── constants.js  # Phyllotaxis constants, color palettes, quality presets
│       ├── math.js       # Analytical visible index ranges & double-precision phyllotaxis
│       ├── api.js        # Binary & JSON fetch wrappers
│       ├── hud.js        # Scientific star-atlas HUD card & coordinate breakdowns
│       ├── renderer/
│       │   ├── ChunkManager.js     # GPU-driven 65,536-digit chunk pool, LRU cache
│       │   ├── OverviewRenderer.js # ~20k sampled points overview renderer
│       │   ├── MatchHighlight.js   # Pulsing match rings, connecting lines & billboards
│       │   └── DigitAtlas.js       # Procedural canvas SDF/crisp glyph atlas
│       ├── cosmos/
│       │   ├── Stars.js            # 80k-120k star atlas (blackbody 3000K-30000K, Milky Way)
│       │   ├── Nebulae.js          # Procedural 5-octave fbm sky-dome nebulae
│       │   ├── Galaxies.js         # Procedural log-spiral distant galaxy sprites
│       │   └── SolarSystem.js      # Procedural sun, textured planets, ringed giant & moon
│       └── camera/
│           ├── FlightController.js # Catmull-Rom bezier flight with spring settle
│           └── ExploreController.js# Orbit/pan/zoom with inertia & touch gestures
└── frontend/dist/        # Production bundle served directly by FastAPI
```

---

## Position Convention

- **Position 1** = the first digit **after** the decimal point.  
  $$\pi = 3.\mathbf{1}4159265\dots \implies \text{position 1} = 1, \text{position 5} = 9$$
- The integer part (`3`) is not stored or indexed.

---

## Memory & Scale Sizing

| Artefact | Formula | N = 100M digits | N = 1 Billion digits (1B) |
|---|---|---|---|
| `pi.digits` | $N$ bytes (mmap) | 100 MB | 1 GB |
| `suffix_array.npy` | $4N$ bytes (uint32 for $N < 2^{32}$) | 400 MB | 4 GB |
| Tier 1 tables ($k=1..7$) | Fixed $\sum_{k=1}^7 10^k \times 4$ | ~44.4 MB | ~44.4 MB |
| **Total Disk / mmap** | | **~544.4 MB** | **~5.05 GB** |
| **Active RAM Footprint** | | **< 60 MB** | **< 150 MB** |

> **Note on 1 Billion vs Multi-Billion Scale:**  
> Since $10^9 < 2^{32} \approx 4.29 \times 10^9$, standard 32-bit unsigned integers (`uint32`) comfortably index 1 Billion digits with no extra memory overhead. For multi-billion datasets ($N \ge 2^{32}$), `build.py` automatically preserves `uint64` dtype (8 bytes/digit).

---

## Importing from Y-Cruncher / Pi2e

For large runs ($N = 100\text{M} - 1\text{B}+$ digits), generate pi using [y-cruncher](http://www.numberworld.org/y-cruncher/) and run:

```bash
# From text export (with or without '3.' header)
python backend/build.py --source file /path/to/pi.txt

# Or from raw 1-byte-per-digit ASCII binary
python backend/build.py --source file /path/to/pi.digits --raw
```

---

## Development Setup

### 1. Backend (FastAPI)
```bash
cd backend
pip install -r ../requirements.txt

# Start backend server
python -m uvicorn server:app --reload --port 8000
```

### 2. Frontend (Vite Dev Server)
```bash
cd frontend-3d
npm install
npm run dev
# Opens on http://localhost:5173 with proxy to http://127.0.0.1:8000
```

---

## Production Build

To build the optimized client bundle:
```bash
cd frontend-3d
npm run build
```
This writes the minified bundle to `frontend/dist/`. The FastAPI backend automatically mounts and serves `frontend/dist/` at `http://127.0.0.1:8000/`.

---

## Verification & Automated Testing

Run the full end-to-end Playwright test suite against the live WebGL2 frontend:
```bash
python backend/verify_3d.py
```
This tests:
1. Target flight to `2026`
2. Preservation of leading zeros (`0007`)
3. Origin prefix (`14159265`)
4. 9-digit suffix array searches
5. Non-matching queries (`999999999999`) with probabilistic prefix fallbacks
6. 2D / 3D mode switching mid-flight
7. 5 rapid consecutive search interruptions
8. Verifies 0 console errors and 0 main-thread long tasks (>50ms)
