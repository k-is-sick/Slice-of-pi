"""
server.py — Slice of Pi FastAPI backend
========================================

Endpoints:
  GET /api/search?q=<digits>
  GET /api/digits?start=<1-indexed>&count=<max 5000>
  GET /api/overview          (20k sampled positions, cached at startup)
  GET /api/meta              (N, sha256, built_at)

Run with:
  uvicorn backend.server:app --reload --port 8000
or (from backend/ directory):
  uvicorn server:app --reload --port 8000
"""

import json
import math
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import search as _search

DATA_DIR = Path(__file__).parent / "data"
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

_overview_cache: dict[str, Any] | None = None
_meta_cache: dict[str, Any] | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _overview_cache, _meta_cache

    # Load index
    _search.initialise()

    # Load meta
    meta_path = DATA_DIR / "meta.json"
    if meta_path.exists():
        _meta_cache = json.loads(meta_path.read_text())
    else:
        _meta_cache = {"N": _search._N, "sha256": "unknown", "built_at": "unknown"}

    # Pre-compute overview: ~20k evenly-spaced sample points
    _overview_cache = _build_overview()

    print(f"[server] Ready. N={_search._N:,}")
    yield


def _build_overview() -> dict:
    """Sample ~20,000 digit positions evenly across the file for the galaxy view."""
    N = _search._N
    TARGET = 20_000
    stride = max(1, N // TARGET)
    positions = list(range(0, N, stride))[:TARGET]

    samples = []
    for p in positions:
        d = int(_search._digits_mm[p]) - 48   # ASCII '0'=48, convert to 0-9
        if 0 <= d <= 9:
            samples.append({"pos": p + 1, "digit": d})   # 1-indexed position

    return {"samples": samples, "N": N, "stride": stride}


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Slice of Pi", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.get("/api/meta")
def api_meta():
    return _meta_cache


@app.get("/api/overview")
def api_overview():
    return _overview_cache


@app.get("/api/digits")
def api_digits(
    start: int = Query(..., ge=1, description="1-indexed start position"),
    count: int = Query(..., ge=1, le=5000, description="Number of digits (max 5000)"),
):
    """Return a window of digits around a position."""
    if start > _search._N:
        raise HTTPException(status_code=404, detail="start exceeds N")

    digits = _search.get_digits(start, count)
    return {"digits": digits, "start": start, "count": len(digits)}


@app.get("/api/search")
def api_search(q: str = Query(..., min_length=1, max_length=50)):
    """
    Search for a digit string in pi.
    q must contain only ASCII digits; leading zeros are preserved.
    """
    # Validate
    if not q.isdigit():
        raise HTTPException(
            status_code=422,
            detail="Query must contain only digits (0-9)."
        )

    result = _search.search(q)

    resp: dict[str, Any] = {
        "query": result.query,
        "found": result.found,
        "search_ms": round(result.search_ms, 3),
        "N": _search._N,
    }

    if result.found:
        resp["position"] = result.position
        resp["occurrences"] = result.occurrences
        resp["positions"] = result.positions
        resp["surrounding"] = result.surrounding
        resp["match_start"] = result.match_start
        resp["match_len"] = result.match_len
    else:
        resp["longest_prefix"] = result.longest_prefix
        resp["longest_prefix_position"] = result.longest_prefix_position
        resp["probability_pct"] = result.probability_pct
        resp["expected_position"] = (
            10 ** len(q) if len(q) <= 15 else None
        )
        if result.surrounding:
            resp["surrounding"] = result.surrounding
            resp["match_start"] = result.match_start
            resp["match_len"] = result.match_len

    return resp


# ---------------------------------------------------------------------------
# Serve frontend static files (production mode)
# ---------------------------------------------------------------------------

if FRONTEND_DIR.exists() and (FRONTEND_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
