"""
benchmark.py — Slice of Pi query latency benchmark
====================================================

Measures p50 and p99 latency for search queries of lengths 3, 7, 9, 12.
Uses 200 random queries per length, all selected from actual pi digit windows
(guaranteed to be found, which gives a fair worst-case for SA binary search).

Targets (on 100M digit dataset, commodity hardware):
  Tier 1 (len 3, 7) : p99 < 1 ms
  SA     (len 9, 12): p99 < 5 ms

Usage:
  python backend/benchmark.py
"""

import random
import sys
import time
from pathlib import Path
from statistics import quantiles

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import search as _search

DATA_DIR = Path(__file__).parent / "data"
LENGTHS = [3, 7, 9, 12]
QUERIES_PER_LEN = 200


def pick_queries(length: int, rng: random.Random) -> list[str]:
    """Pick QUERIES_PER_LEN actual substrings from pi digits."""
    n = _search._N
    queries = []
    seen = set()
    attempts = 0
    while len(queries) < QUERIES_PER_LEN and attempts < QUERIES_PER_LEN * 10:
        attempts += 1
        pos = rng.randint(0, n - length - 1)
        q = _search._digits_mm[pos: pos + length].tobytes().decode("ascii")
        if q not in seen:
            seen.add(q)
            queries.append(q)
    return queries


def bench_length(length: int, rng: random.Random) -> dict:
    queries = pick_queries(length, rng)

    # Warm up cache
    for q in queries[:5]:
        _search.search(q)

    # Clear cache so we measure fresh searches
    _search.search.cache_clear()

    latencies_ms = []
    for q in queries:
        t0 = time.perf_counter()
        _search.search(q)
        latencies_ms.append((time.perf_counter() - t0) * 1000)

    qs = quantiles(latencies_ms, n=100)  # returns 99 percentile points
    p50 = qs[49]
    p99 = qs[98]
    tier = "Tier1" if length <= 7 else "SA"
    target = 1.0 if length <= 7 else 5.0
    status = "PASS" if p99 < target else "FAIL"

    return {
        "length": length,
        "tier": tier,
        "n_queries": len(queries),
        "p50_ms": round(p50, 3),
        "p99_ms": round(p99, 3),
        "target_ms": target,
        "status": status,
    }


def main():
    print(f"Loading index from {DATA_DIR}...")
    _search.initialise()
    print(f"N = {_search._N:,} digits\n")

    rng = random.Random(2024)
    results = []
    for length in LENGTHS:
        print(f"Benchmarking length={length} ({QUERIES_PER_LEN} queries)...")
        r = bench_length(length, rng)
        results.append(r)

    print()
    print(f"{'Len':>4}  {'Tier':>6}  {'p50 (ms)':>10}  {'p99 (ms)':>10}  "
          f"{'Target':>8}  {'Pass?':>6}")
    print("-" * 56)
    for r in results:
        print(
            f"{r['length']:>4}  {r['tier']:>6}  {r['p50_ms']:>10.3f}  "
            f"{r['p99_ms']:>10.3f}  {r['target_ms']:>7.1f}ms  {r['status']:>6}"
        )

    all_pass = all(r["status"] == "PASS" for r in results)
    print()
    print("Overall:", "PASS - All targets met" if all_pass else "FAIL - Some targets missed")


if __name__ == "__main__":
    main()
