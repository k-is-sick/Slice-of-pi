"""
build.py — Slice of Pi data pipeline
=====================================
Generates or loads pi digits, verifies them, then builds:
  - data/pi.digits        : raw ASCII digit bytes, post-decimal (pos 1 = first digit after '3.')
  - data/tier1_k{k}.npy  : first-occurrence tables for k=1..7 (uint32)
  - data/suffix_array.npy : suffix array (uint32 for N<2^32, uint64 otherwise)
  - data/meta.json        : N, sha256, built_at

Usage:
  python build.py --source generate 1000000
  python build.py --source file /path/to/pi.txt
  python build.py --source file /path/to/pi.digits --raw   # already raw ASCII

For N > 10M digits, use y-cruncher (http://www.numberworld.org/y-cruncher/) or
pi2e.ch files and pass the output with --source file PATH.
"""

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Ground truth: first 50 digits of pi AFTER the decimal point
# ---------------------------------------------------------------------------
FIRST_50 = "14159265358979323846264338327950288419716939937510"

DATA_DIR = Path(__file__).parent / "data"


# ---------------------------------------------------------------------------
# Pi generation
# ---------------------------------------------------------------------------

def generate_pi_digits(n: int) -> bytes:
    """Return the first n post-decimal digits of pi as ASCII bytes."""
    if n > 10_000_000:
        raise ValueError(
            f"mpmath-based generation is limited to 10M digits. "
            f"For N={n:,}, use y-cruncher and --source file PATH."
        )
    print(f"Generating {n:,} digits of pi with mpmath...")
    t0 = time.perf_counter()
    try:
        import mpmath
        mpmath.mp.dps = n + 20          # extra guard digits
        pi_str = mpmath.nstr(mpmath.pi, n + 10, strip_zeros=False)
    except ImportError:
        print("mpmath not found, trying gmpy2 …")
        import gmpy2
        gmpy2.get_context().precision = int(n * 3.322) + 64  # bits
        pi_val = gmpy2.const_pi()
        pi_str = gmpy2.mpfr(pi_val).__format__(f".{n+5}f")

    # pi_str looks like "3.14159…"
    decimal_pos = pi_str.index('.')
    digits = pi_str[decimal_pos + 1: decimal_pos + 1 + n]
    elapsed = time.perf_counter() - t0
    print(f"  Generated in {elapsed:.1f}s")
    return digits.encode('ascii')


def load_pi_from_file(path: str, raw: bool = False) -> bytes:
    """
    Load pi digits from a text or raw file.
    Supports:
      - y-cruncher .txt output  (has a header, then '3.14159…' style)
      - pi2e.ch style files     (digits only, no '3.')
      - raw ASCII digit files   (--raw flag, 1 byte per digit)
    """
    path = Path(path)
    if raw:
        print(f"Loading raw ASCII digit file {path}...")
        return path.read_bytes()

    print(f"Loading pi text file {path}...")
    content = path.read_text(encoding='ascii', errors='ignore')
    # Strip whitespace and non-digit chars except '.'
    # Find the pattern '3.' and take everything after
    idx = content.find('3.')
    if idx >= 0:
        digits_str = content[idx + 2:]
    else:
        # Assume file contains digits only (no '3.')
        digits_str = content

    # Keep only digit characters
    digits_clean = ''.join(c for c in digits_str if c.isdigit())
    print(f"  Loaded {len(digits_clean):,} digits")
    return digits_clean.encode('ascii')


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

def verify_digits(digits: bytes) -> None:
    """Verify the first 50 digits against the known ground truth."""
    actual = digits[:50].decode('ascii')
    if actual != FIRST_50:
        raise ValueError(
            f"Digit verification FAILED!\n"
            f"  Expected: {FIRST_50}\n"
            f"  Got:      {actual}"
        )
    print(f"  [OK] First 50 digits verified: {actual}")


# ---------------------------------------------------------------------------
# Tier 1: direct-address first-occurrence tables
# ---------------------------------------------------------------------------

def build_tier1(digits: bytes, n: int) -> None:
    """Build first-occurrence tables for k = 1 .. 7."""
    print("Building Tier 1 first-occurrence tables...")
    for k in range(1, 8):
        size = 10 ** k
        table = np.full(size, 0xFFFFFFFF, dtype=np.uint32)  # sentinel = not found
        count = 0
        for i in range(n - k + 1):
            idx = int(digits[i:i + k])            # parse k-char integer
            if table[idx] == 0xFFFFFFFF:
                table[idx] = i                    # 0-indexed position in file
                count += 1
            if count == size:
                break                             # all k-grams found

        out = DATA_DIR / f"tier1_k{k}.npy"
        np.save(out, table)
        pct = 100 * count / size
        print(f"  k={k}: {count:,}/{size:,} patterns found ({pct:.1f}%) -> {out.name}")


# ---------------------------------------------------------------------------
# Tier 2: suffix array
# ---------------------------------------------------------------------------

def build_suffix_array(digits: bytes, n: int) -> None:
    """Build a suffix array over the digit bytes using pydivsufsort."""
    print(f"Building suffix array for {n:,} digits...")
    t0 = time.perf_counter()
    try:
        from pydivsufsort import divsufsort
    except ImportError:
        raise ImportError(
            "pydivsufsort is required for suffix array construction. "
            "Install it with: pip install pydivsufsort"
        )

    sa = divsufsort(digits)                        # returns int64 ndarray
    elapsed = time.perf_counter() - t0
    print(f"  SA built in {elapsed:.1f}s, shape={sa.shape}, dtype={sa.dtype}")

    # Downcast to uint32 if possible (saves 50% memory)
    if n < 2 ** 32:
        sa = sa.astype(np.uint32)
        print(f"  Downcast to uint32 -> {sa.nbytes / 1e6:.1f} MB")
    else:
        sa = sa.astype(np.uint64)
        print(f"  Keeping uint64 -> {sa.nbytes / 1e6:.1f} MB")

    out = DATA_DIR / "suffix_array.npy"
    np.save(out, sa)
    print(f"  Saved -> {out.name}")


# ---------------------------------------------------------------------------
# meta.json
# ---------------------------------------------------------------------------

def write_meta(digits: bytes, n: int) -> None:
    sha = hashlib.sha256(digits).hexdigest()
    meta = {
        "N": n,
        "sha256": sha,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    out = DATA_DIR / "meta.json"
    out.write_text(json.dumps(meta, indent=2))
    print(f"  meta.json -> N={n:,}, sha256={sha[:16]}...")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Slice of Pi — data builder")
    parser.add_argument(
        "--source", nargs="+", required=True,
        help="'generate N'  or  'file PATH'  or  'file PATH --raw'"
    )
    parser.add_argument(
        "--raw", action="store_true",
        help="Treat source file as raw 1-byte-per-digit ASCII"
    )
    parser.add_argument(
        "--skip-sa", action="store_true",
        help="Skip suffix array build (use if you just want to rebuild Tier 1)"
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    source = args.source
    if source[0] == "generate":
        if len(source) < 2:
            parser.error("'generate' requires N, e.g. --source generate 1000000")
        n = int(source[1])
        digits = generate_pi_digits(n)
    elif source[0] == "file":
        if len(source) < 2:
            parser.error("'file' requires PATH, e.g. --source file /path/to/pi.txt")
        digits = load_pi_from_file(source[1], raw=args.raw)
        n = len(digits)
    else:
        parser.error(f"Unknown source type: {source[0]!r}")

    print(f"\nTotal digits loaded: {n:,}")

    # Verification
    print("\nVerifying first 50 digits...")
    verify_digits(digits)

    # Save raw digit file
    out_digits = DATA_DIR / "pi.digits"
    out_digits.write_bytes(digits)
    print(f"  Saved {n:,} bytes -> {out_digits}")

    # Tier 1
    print()
    build_tier1(digits, n)

    # Tier 2
    if not args.skip_sa:
        print()
        build_suffix_array(digits, n)

    # Meta
    print()
    write_meta(digits, n)

    print("\n[DONE] Build complete!")
    print(f"  Digit file : {DATA_DIR / 'pi.digits'}  ({n / 1e6:.1f}M bytes)")
    print(f"  Suffix array: {DATA_DIR / 'suffix_array.npy'}  (~{4*n/1e6:.0f} MB)")


if __name__ == "__main__":
    main()
