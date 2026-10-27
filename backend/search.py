"""
search.py — Slice of Pi search engine
======================================
Implements two-tier search over pi's digits:

  Tier 1  (len ≤ 7)  : O(1) direct-address first-occurrence lookup from
                        pre-built uint32 numpy tables.
  Tier 2  (any len)  : Binary search on the suffix array (memmap, never
                        fully loaded into RAM).

Both tiers return a SearchResult dataclass.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np

DATA_DIR = Path(__file__).parent / "data"

# ---------------------------------------------------------------------------
# Global index references (populated by initialise())
# ---------------------------------------------------------------------------

_digits_mm: Optional[np.ndarray] = None        # memmap of pi.digits as uint8
_sa_mm: Optional[np.ndarray] = None            # memmap of suffix_array.npy
_tier1: dict[int, np.ndarray] = {}             # k -> uint32 first-occ array
_N: int = 0                                    # total digit count


def initialise() -> None:
    """Load index artefacts into module-level globals (call once at startup)."""
    global _digits_mm, _sa_mm, _tier1, _N

    digits_path = DATA_DIR / "pi.digits"
    sa_path = DATA_DIR / "suffix_array.npy"

    if not digits_path.exists():
        raise FileNotFoundError(
            f"{digits_path} not found. Run build.py first."
        )

    _digits_mm = np.memmap(digits_path, dtype=np.uint8, mode="r")
    _N = len(_digits_mm)

    _sa_mm = np.load(str(sa_path), mmap_mode="r")

    for k in range(1, 8):
        tier_path = DATA_DIR / f"tier1_k{k}.npy"
        if tier_path.exists():
            _tier1[k] = np.load(str(tier_path), mmap_mode="r")

    print(f"[search] Index loaded: N={_N:,} digits, SA dtype={_sa_mm.dtype}")


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class SearchResult:
    query: str
    found: bool
    position: Optional[int] = None          # 1-indexed, None if not found
    occurrences: Optional[int] = None       # total in indexed N digits
    positions: list[int] = field(default_factory=list)   # up to 20 samples (1-indexed)
    surrounding: Optional[str] = None      # 40-char context string
    match_start: int = 0                   # offset into surrounding where match begins
    match_len: int = 0
    search_ms: float = 0.0
    # Not-found extras
    longest_prefix: Optional[str] = None
    longest_prefix_position: Optional[int] = None
    probability_pct: Optional[float] = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _digits_bytes(start: int, length: int) -> bytes:
    """Return digit bytes from the memmap as a bytes object."""
    chunk = _digits_mm[start: start + length]
    return chunk.tobytes()


def _as_query_bytes(q: str) -> bytes:
    """Convert digit string to ASCII bytes for comparison."""
    return q.encode("ascii")


def _sa_compare(sa_idx: int, q_bytes: bytes, qlen: int) -> int:
    """
    Compare suffix SA[sa_idx] with query q_bytes.
    Returns -1 / 0 / 1 (like strcmp).
    """
    pos = int(_sa_mm[sa_idx])
    suffix_slice = _digits_mm[pos: pos + qlen]
    if len(suffix_slice) < qlen:
        # Suffix is shorter than query → treat as less-than
        return -1
    # Compare byte by byte via numpy
    for a, b in zip(suffix_slice.tolist(), q_bytes):
        if a < b:
            return -1
        if a > b:
            return 1
    return 0


def _lower_bound(q_bytes: bytes, qlen: int) -> int:
    """First index in SA where suffix >= q_bytes."""
    lo, hi = 0, _N
    while lo < hi:
        mid = (lo + hi) >> 1
        if _sa_compare(mid, q_bytes, qlen) < 0:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _upper_bound(q_bytes: bytes, qlen: int) -> int:
    """First index in SA where suffix > q_bytes (strict)."""
    lo, hi = 0, _N
    while lo < hi:
        mid = (lo + hi) >> 1
        if _sa_compare(mid, q_bytes, qlen) <= 0:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _probability_pct(qlen: int) -> float:
    """P(a random len-qlen string appears at least once in N digits) × 100."""
    n = _N
    expected = n / (10 ** qlen)
    p = 1.0 - math.exp(-expected)
    return round(p * 100, 2)


def _get_surrounding(pos0: int, match_len: int, context: int = 20) -> tuple[str, int, int]:
    """
    Return a string of context digits before and after the match.
    pos0 is 0-indexed file position.
    Returns (surrounding_str, match_start_offset, match_len).
    """
    start = max(0, pos0 - context)
    end = min(_N, pos0 + match_len + context)
    raw = _digits_mm[start:end].tobytes().decode("ascii")
    match_start = pos0 - start
    return raw, match_start, match_len


# ---------------------------------------------------------------------------
# Core search — cached
# ---------------------------------------------------------------------------

@lru_cache(maxsize=10_000)
def search(q: str) -> SearchResult:
    """
    Search for digit string q in pi.
    Thread-safe (read-only) after initialise().
    """
    t0 = time.perf_counter()

    if not q.isdigit():
        raise ValueError(f"Query must contain only digits, got: {q!r}")

    qlen = len(q)

    # -----------------------------------------------------------------------
    # Tier 1: O(1) for len ≤ 7
    # -----------------------------------------------------------------------
    if qlen <= 7 and qlen in _tier1:
        tbl = _tier1[qlen]
        idx = int(q)
        raw_pos = int(tbl[idx])
        elapsed = (time.perf_counter() - t0) * 1000

        if raw_pos == 0xFFFFFFFF:
            # Not in tier1 — theoretically impossible for k≤6 in 100M digits,
            # but handle gracefully via SA
            pass  # fall through to SA
        else:
            surrounding, ms, ml = _get_surrounding(raw_pos, qlen)
            return SearchResult(
                query=q,
                found=True,
                position=raw_pos + 1,       # 1-indexed
                occurrences=None,           # tier1 doesn't count; SA will if needed
                positions=[raw_pos + 1],
                surrounding=surrounding,
                match_start=ms,
                match_len=ml,
                search_ms=elapsed,
            )

    # -----------------------------------------------------------------------
    # Tier 2: suffix array binary search
    # -----------------------------------------------------------------------
    q_bytes = _as_query_bytes(q)
    lo = _lower_bound(q_bytes, qlen)
    hi = _upper_bound(q_bytes, qlen)
    elapsed = (time.perf_counter() - t0) * 1000

    if lo >= hi:
        # Not found → find longest matching prefix
        return _not_found(q, elapsed)

    # Occurrences
    occ = int(hi - lo)

    # First position = minimum SA value in [lo, hi)
    window = _sa_mm[lo:hi]
    first_pos0 = int(np.min(window))      # 0-indexed

    # Sample up to 20 additional positions (1-indexed)
    sample_size = min(20, occ)
    if occ <= sample_size:
        sample = window.tolist()
    else:
        step = max(1, occ // sample_size)
        sample = window[::step][:sample_size].tolist()
    positions_1idx = sorted(int(p) + 1 for p in sample)

    surrounding, ms, ml = _get_surrounding(first_pos0, qlen)

    return SearchResult(
        query=q,
        found=True,
        position=first_pos0 + 1,
        occurrences=occ,
        positions=positions_1idx,
        surrounding=surrounding,
        match_start=ms,
        match_len=ml,
        search_ms=elapsed,
    )


def _not_found(q: str, elapsed_so_far: float) -> SearchResult:
    """Find longest matching prefix and compute probability."""
    qlen = len(q)
    best_prefix_len = 0
    best_pos0 = 0

    # Binary search on prefix length
    lo_p, hi_p = 1, qlen - 1
    while lo_p <= hi_p:
        mid_p = (lo_p + hi_p) // 2
        sub = q[:mid_p]
        sub_bytes = sub.encode("ascii")
        lo_sa = _lower_bound(sub_bytes, mid_p)
        hi_sa = _upper_bound(sub_bytes, mid_p)
        if lo_sa < hi_sa:
            best_prefix_len = mid_p
            best_pos0 = int(np.min(_sa_mm[lo_sa:hi_sa]))
            lo_p = mid_p + 1
        else:
            hi_p = mid_p - 1

    elapsed = (time.perf_counter() - 0) * 1000  # approximate; use elapsed_so_far

    if best_prefix_len == 0:
        return SearchResult(
            query=q,
            found=False,
            search_ms=elapsed_so_far,
            longest_prefix=None,
            longest_prefix_position=None,
            probability_pct=_probability_pct(qlen),
        )

    surrounding, ms, ml = _get_surrounding(best_pos0, best_prefix_len)
    return SearchResult(
        query=q,
        found=False,
        search_ms=elapsed_so_far,
        longest_prefix=q[:best_prefix_len],
        longest_prefix_position=best_pos0 + 1,
        surrounding=surrounding,
        match_start=ms,
        match_len=ml,
        probability_pct=_probability_pct(qlen),
    )


# ---------------------------------------------------------------------------
# Convenience: get a slice of digits
# ---------------------------------------------------------------------------

def get_digits(start: int, count: int) -> str:
    """
    Return count digits starting at 1-indexed position start.
    Clamped to [1, N].
    """
    s0 = max(0, start - 1)
    end = min(_N, s0 + count)
    return _digits_mm[s0:end].tobytes().decode("ascii")
