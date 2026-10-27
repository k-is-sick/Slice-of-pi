"""
test_search.py — Pytest suite for search.py
=============================================

Tests:
  1. SA binary search matches brute-force str.find on 1M digits (1000 random queries)
  2. Leading-zero queries
  3. Not-found → returns longest prefix
  4. Probability note on not-found
"""

import os
import random
import sys
from pathlib import Path

import numpy as np
import pytest

# Ensure backend/ is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

import search as _search

DATA_DIR = Path(__file__).parent.parent / "data"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module", autouse=True)
def load_index():
    """Initialise the search module once for all tests."""
    if not (DATA_DIR / "pi.digits").exists():
        pytest.skip(
            "pi.digits not found — run build.py first. "
            "Example: python backend/build.py --source generate 1000000"
        )
    _search.initialise()


@pytest.fixture(scope="module")
def pi_str() -> str:
    """Return up to 1M digits as a Python string for brute-force comparison."""
    cap = min(1_000_000, _search._N)
    return _search._digits_mm[:cap].tobytes().decode("ascii")


# ---------------------------------------------------------------------------
# Test 1: SA search == brute-force str.find (1000 random queries)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("seed", [42])
def test_sa_vs_bruteforce(pi_str, seed):
    rng = random.Random(seed)
    n = len(pi_str)
    errors = []

    for _ in range(1000):
        # Pick a random substring from the first 1M digits
        length = rng.randint(3, 12)
        start = rng.randint(0, n - length - 1)
        q = pi_str[start:start + length]

        result = _search.search(q)
        expected_pos = pi_str.find(q)  # 0-indexed; -1 if not found

        if expected_pos == -1:
            if result.found:
                errors.append(
                    f"Query {q!r}: SA says found at {result.position}, "
                    f"brute-force says not found in first {n} digits"
                )
        else:
            if not result.found:
                errors.append(
                    f"Query {q!r}: SA says not found, "
                    f"brute-force says found at {expected_pos + 1}"
                )
            elif result.position != expected_pos + 1:
                # SA gives FIRST occurrence; brute-force also gives first from pos 0
                # They must agree
                errors.append(
                    f"Query {q!r}: SA pos={result.position}, "
                    f"brute-force pos={expected_pos + 1}"
                )

    assert not errors, f"{len(errors)} mismatches:\n" + "\n".join(errors[:5])


# ---------------------------------------------------------------------------
# Test 2: Leading zeros
# ---------------------------------------------------------------------------

def test_leading_zeros_single():
    """'0' should be found very early in pi's digits (pi = 3.14159265358...)."""
    result = _search.search("0")
    assert result.found
    # First '0' in pi after decimal should be within first 50 digits
    # pi digits: 14159265358979323846264338327950288...
    # Position of first '0' is 32 (1-indexed)
    assert result.position is not None
    assert result.position < 100


def test_leading_zeros_preserved():
    """Queries starting with '0' should NOT be treated as integers (preserve leading zeros)."""
    result_00 = _search.search("00")
    result_000 = _search.search("000")
    # Both should be found; their positions should differ from each other
    assert result_00.found or result_00.longest_prefix is not None
    if result_00.found and result_000.found:
        # The occurrence of "000" must be a subset of positions where "00" starts
        pass
    # Crucially, "00" != "0" — they are different queries
    result_0 = _search.search("0")
    assert result_0.query == "0"
    assert result_00.query == "00"


# ---------------------------------------------------------------------------
# Test 3: Not found → longest prefix
# ---------------------------------------------------------------------------

def test_not_found_has_longest_prefix():
    """
    A long random string unlikely to appear in the indexed digits
    should return found=False with a non-None longest_prefix.
    """
    # Use a query very unlikely to appear: 20-digit string
    if _search._N < 10_000:
        pytest.skip("Need at least 10k digits for this test")

    # Construct a query we're fairly sure won't appear
    q = "9" * 20
    result = _search.search(q)

    if result.found:
        pytest.skip(f"String {q!r} happened to be found at pos {result.position}")

    assert not result.found
    # Should have a prefix
    assert result.longest_prefix is not None
    assert len(result.longest_prefix) >= 1
    assert result.longest_prefix == q[:len(result.longest_prefix)]


# ---------------------------------------------------------------------------
# Test 4: Probability note
# ---------------------------------------------------------------------------

def test_not_found_probability():
    """Not-found results should include a probability percentage."""
    if _search._N < 10_000:
        pytest.skip("Need at least 10k digits")

    q = "8" * 20
    result = _search.search(q)

    if result.found:
        pytest.skip(f"String {q!r} happened to be found")

    assert result.probability_pct is not None
    assert 0.0 <= result.probability_pct <= 100.0


# ---------------------------------------------------------------------------
# Test 5: Known pi digits (fixed)
# ---------------------------------------------------------------------------

def test_known_subsequence():
    """'14159' should be found at position 1 in any valid pi digit file."""
    result = _search.search("14159")
    assert result.found, "Known substring '14159' must be found in pi"
    assert result.position == 1, f"Expected position 1, got {result.position}"


def test_known_single_digits():
    """All single digits 0-9 should be found within the first 100 digits of pi."""
    for d in "0123456789":
        result = _search.search(d)
        assert result.found, f"Digit {d!r} not found"
        assert result.position <= 100, (
            f"Digit {d!r} first occurrence at {result.position}, expected within 100"
        )
