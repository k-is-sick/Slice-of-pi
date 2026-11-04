# Slice of Pi — Implementation Plan

## Project Structure

```
d:\Slice_of_pi\
├── backend\
│   ├── build.py               # Pi generation + index building
│   ├── server.py              # FastAPI app
│   ├── search.py              # Search logic (Tier 1 + SA)
│   ├── verify.py              # 50-digit verification
│   ├── benchmark.py           # Latency benchmark script
│   ├── tests\
│   │   └── test_search.py     # pytest suite
│   └── data\                  # pi.digits, *.npy, meta.json (gitignored)
├── frontend\
│   ├── index.html
│   ├── src\
│   │   ├── main.js            # Entry, router, URL param handling
│   │   ├── galaxy.js          # Canvas phyllotaxis rendering engine
│   │   ├── animation.js       # Flight animation + easing
│   │   ├── hud.js             # Result HUD card
│   │   ├── api.js             # Fetch wrappers + LRU cache
│   │   └── palette.js         # 10-colour digit palette
│   └── style.css
├── README.md
└── requirements.txt
```

---

## Phase 1 — Backend: Data Pipeline (`build.py`)

### Goals
- Generate or load pi digits into `data/pi.digits` (1 byte/digit ASCII, post-decimal)
- Verify first 50 digits against hardcoded ground truth
- Build Tier 1 direct-address tables (k=1..7, `uint32`, `.npy`)
- Build Tier 2 suffix array (`uint32` for N≤2^32-1, else `uint64`) via `pydivsufsort`
- Write `data/meta.json` with `N` and `sha256`

### Sub-steps
1. **CLI**: `argparse` with `--source file PATH` | `--source generate N`
2. **Generation**: use `mpmath` (mp.dps = N+10) for N ≤ 10M; document y-cruncher for larger
3. **Verification**: compare digits[0:50] against `"14159265358979323846264338327950288419716939937510"`
4. **Tier 1**: for k=1..7, iterate digits once → first occurrence of each k-length pattern → uint32 array of size 10^k, save as `tier1_k{k}.npy`
5. **Suffix array**: `pydivsufsort.divsufsort(digit_bytes)` → `.npy`; dtype depends on N
6. **meta.json**: `{"N": N, "sha256": "...", "built_at": "..."}`

### Memory constraints
- Digit file: N bytes (memmap)
- SA: 4N bytes (uint32, for N < 4B)
- Tier 1 total: ~43 MB for k=1..7 (4*(10+100+...+10M) bytes)

---

## Phase 2 — Backend: Search Engine (`search.py`)

### Tier 1 path (len ≤ 7)
- Load `tier1_k{len}.npy` with `np.load(..., mmap_mode='r')`
- Index = int(q) → O(1) lookup

### Tier 2 path (SA binary search)
- Use `np.searchsorted`-style binary search on SA (memmap)
- `lower_bound`: find first SA[i] such that digits[SA[i]:SA[i]+len] >= q
- `upper_bound`: find first SA[i] such that digits[SA[i]:SA[i]+len] > q
- `first_position = min(sa[lo:hi]) + 1`
- `occurrences = hi - lo`
- Return up to 20 sampled positions from `sa[lo:hi]`

### Not-found path
- Binary search on prefix length (1..len-1) for longest matching prefix
- Return prefix position + probability note: `P ≈ 1 - exp(-N / 10^len)`

### Caching
- `@lru_cache(maxsize=10_000)` on the search function

---

## Phase 3 — Backend: FastAPI Server (`server.py`)

### Endpoints
| Method | Path | Params | Response |
|--------|------|--------|----------|
| GET | `/api/search` | `q=` | `{position, occurrences, positions[], surrounding, search_ms, found, longest_prefix?}` |
| GET | `/api/digits` | `start=, count=` (max 5000) | `{digits: string, start: int}` |
| GET | `/api/overview` | — | `{samples: [{pos, digit}], N}` (20k pts, cached) |
| GET | `/api/meta` | — | `{N, sha256, built_at}` |

### Startup
- Load SA memmap, load/cache Tier 1 arrays, compute overview sample

---

## Phase 4 — Backend: Tests (`tests/test_search.py`)

- 1000 random substrings (lengths 3-12) from 1M pi digits: SA result == `str.find`
- Leading zeros (e.g., "00", "000")
- Not found: return longest prefix ≥ 1
- Probability note present when not found

---

## Phase 5 — Frontend: Galaxy Renderer (`galaxy.js`)

### Phyllotaxis layout
```
r(i) = c * sqrt(i)
θ(i) = i * 137.508° (golden angle)
x(i) = cx + r(i) * cos(θ(i))
y(i) = cy + r(i) * sin(θ(i))
```
- `c` chosen so N digits fill ~90% of canvas
- Overview: render ~20k dots from `/api/overview`; each dot coloured by digit value

### Colour palette (10-colour, perceptual, colour-blind-safe)
Cyan→Magenta→Gold ramp in HSL:
```
0: hsl(195, 85%, 60%)   1: hsl(220, 80%, 65%)
2: hsl(265, 75%, 68%)   3: hsl(300, 70%, 62%)
4: hsl(330, 78%, 60%)   5: hsl(355, 75%, 60%)
6: hsl(25, 85%, 62%)    7: hsl(45, 88%, 60%)
8: hsl(75, 72%, 56%)    9: hsl(155, 70%, 54%)
```

### Dot size: 1.5 + 0.5*(digit/9) px

### Camera model
- State: `{cx, cy, zoom}` (world → screen: `sx = (wx - cx)*zoom + W/2`)
- Viewport culling: skip dots outside `[0, W] x [0, H]`

---

## Phase 6 — Frontend: Flight Animation (`animation.js`)

### Sequence (3.5–5 s total)
1. **Overview phase** (t=0→0.5): full galaxy visible, begin zoom-in
2. **Zoom phase** (t=0.5→0.85): log-scale zoom from `z_min` to `z_target`, pan toward target coords; cross-fade to real digit window fetched from API
3. **Arrival** (t=0.85→1.0): target digits light up with pulsing ring

### Easing: `easeInOutCubic(t) = t<0.5 ? 4t³ : 1-(-2t+2)³/2`

### Log zoom interpolation
```js
zoom(t) = zoomStart * (zoomEnd/zoomStart)^eased(t)
```

### Threshold-based fetching
- At zoom > 50: fetch 500 real digits centred on target
- At zoom > 500: fetch 5000 real digits; render digit characters

### `prefers-reduced-motion`: skip to final frame immediately

---

## Phase 7 — Frontend: HUD + Controls

### HUD card (glassmorphism panel)
- Found at position **1,234,567** (with thousands separators)
- Occurrences: **142** in N digits indexed
- Surrounding: `...31415[926535]89793...` (match highlighted)
- Search time: **0.3 ms**
- Position convention note: "Position 1 = first digit after the decimal point"

### Not-found variant
- Longest prefix matched at position X
- Expected position: ~10^len (formatted)
- Probability: `P(found) ≈ X%`

### Controls
- **Replay flight** — re-runs animation
- **Explore** — free pan/zoom with mouse drag + wheel / pinch-zoom
- **Share** — copies `?n=<digits>` URL to clipboard + "Save card" PNG export via `canvas.toDataURL()`

---

## Phase 8 — README + Benchmark

### README sections
- Architecture overview
- Position convention
- Memory sizing (SA ~4 bytes/digit → 400 MB for 100M)
- How to scale N (y-cruncher, uint64 SA)
- Setup: `pip install -r requirements.txt && python build.py --source generate 1000000`

### `benchmark.py`
- Lengths 3, 7, 9, 12
- 200 random queries each
- Report p50/p99 latency
- Targets: len≤7 <1 ms, len>7 <5 ms

---

## Build Order (Sequential)

1. `requirements.txt` + project skeleton
2. `backend/build.py` (generate + index)
3. `backend/search.py` (Tier 1 + SA + not-found)
4. `backend/server.py` (FastAPI)
5. `backend/tests/test_search.py`
6. `backend/benchmark.py`
7. `frontend/` (palette → galaxy → animation → HUD → main)
8. `README.md`
9. Wire up: CORS, static serving, URL params, Share/PNG export

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Suffix array lib | `pydivsufsort` | Pure Python wrapper, handles large N |
| Pi generation | `mpmath` up to 10M | No system dependency; document y-cruncher for >10M |
| SA dtype | uint32 if N<4B, else uint64 | Saves 2x memory for most cases |
| Frontend bundler | Vite (optional) | Spec allows it; simpler dev experience |
| Animation zoom | log-linear interpolation | Prevents near-instant zoom-in feel |
| Cache | `lru_cache(10000)` backend + `Map` frontend | Per spec |
