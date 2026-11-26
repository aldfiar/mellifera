#!/usr/bin/env python3
"""Session-side layout probe for Android TV screenshots (design D7).

Replicates the PIL measurement the ruling session used when it sized the TV
layout:

- non-background band scan  -> content row bands / column bands
- bright-pixel text-box scan -> glyph (text line) heights
- grid column count          -> content-column segments within a named band

Usage:
    python3 -I scripts/tv_layout_probe.py <png> [options]
      --expect-cols N   column segments in the band must equal N
      --expect-rows N   content row bands must equal N
      --min-glyph PX    the tallest text box must be at least PX px
      --band Y0:Y1      name the horizontal band (inclusive pixel rows) for
                        the column count; default: the largest content row band

    exit 0 = within the given expectations, 1 = outside, 2 = usage or
    environment failure (unreadable png, Pillow missing). No expectations
    given: a pure measurement report, exit 0.

    python3 -I scripts/tv_layout_probe.py --selftest
      runs the pure scan laws on synthetic arrays; needs no Pillow.

Session-side tool: never a build or duty dependency, never shipped to the
device. Pillow imports lazily — only the png-reading path needs it.
"""

from __future__ import annotations

import argparse
import statistics
import sys
from collections import Counter

# A pixel counts as background while every channel sits within this distance
# of the sampled corner background — loose enough to absorb compression noise.
TOLERANCE = 24
# Luminance at or above this is a bright/text pixel (TV UI: light glyphs on a dark surface).
BRIGHT_LUMA = 160
# Noise floors: runs shorter than these are artifacts, not layout.
MIN_BAND_RUN = 2
MIN_SEGMENT_RUN = 2
MIN_BRIGHT_PIXELS = 2


class ProbeError(Exception):
    """Environment or input failure (unreadable png, Pillow missing)."""


# --- pure scan laws (no Pillow anywhere below this line) -------------------


def luminance(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def detect_background(image, patch=6):
    """The screenshot's chrome background: the corner-patch median, or the
    modal pixel when content covers the corners (the sample would invert the
    mask — the one failure mode a probe must not emit silently)."""
    h, w = len(image), len(image[0])
    p = max(1, min(patch, h // 4, w // 4))
    patches = []
    for ys, xs in ((0, 0), (0, w - p), (h - p, 0), (h - p, w - p)):
        pxs = [px for y in range(ys, ys + p) for px in image[y][xs : xs + p]]
        patches.append(tuple(int(round(statistics.median(c[i] for c in pxs))) for i in range(3)))
    spread = max(abs(a[i] - b[i]) for a in patches for b in patches for i in range(3))
    if spread <= 2 * TOLERANCE:
        return patches[0]
    return Counter(px for row in image for px in row).most_common(1)[0][0]


def content_mask(image, bg, tol=TOLERANCE):
    """Per-pixel content flags: any channel further than tol from the background."""
    return [[max(abs(px[i] - bg[i]) for i in range(3)) > tol for px in row] for row in image]


def runs(flags, min_run=1):
    """Contiguous True runs as inclusive (start, end) spans, dropping runs shorter than min_run."""
    out = []
    start = None
    for i, flag in enumerate(flags):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            if i - start >= min_run:
                out.append((start, i - 1))
            start = None
    if start is not None and len(flags) - start >= min_run:
        out.append((start, len(flags) - 1))
    return out


def row_flags(mask, min_pixels=1):
    return [sum(row) >= min_pixels for row in mask]


def column_flags(mask, min_pixels=1):
    counts = [0] * len(mask[0])
    for row in mask:
        for x, hit in enumerate(row):
            if hit:
                counts[x] += 1
    return [c >= min_pixels for c in counts]


def row_bands(image, bg=None, tol=TOLERANCE, min_run=MIN_BAND_RUN):
    if bg is None:
        bg = detect_background(image)
    return runs(row_flags(content_mask(image, bg, tol)), min_run)


def column_bands(image, bg=None, tol=TOLERANCE, min_run=MIN_BAND_RUN):
    if bg is None:
        bg = detect_background(image)
    return runs(column_flags(content_mask(image, bg, tol)), min_run)


def band_segments(image, y0, y1, bg=None, tol=TOLERANCE, min_run=MIN_SEGMENT_RUN):
    """Content-column runs across the inclusive row band y0..y1 — the grid column law."""
    if bg is None:
        bg = detect_background(image)
    return runs(column_flags(content_mask(image[y0 : y1 + 1], bg, tol)), min_run)


def glyph_boxes(image, y0=0, y1=None, luma=BRIGHT_LUMA, min_pixels=MIN_BRIGHT_PIXELS):
    """Runs of consecutive bright rows (text lines) as (start, end, height)."""
    if y1 is None:
        y1 = len(image) - 1
    flags = [
        sum(1 for px in image[y] if luminance(px) >= luma) >= min_pixels
        for y in range(y0, y1 + 1)
    ]
    return [(s, e, e - s + 1) for s, e in runs(flags)]


def glyph_heights(image, y0=0, y1=None, **kw):
    return [h for _, _, h in glyph_boxes(image, y0, y1, **kw)]


def measure(image, band=None, tol=TOLERANCE):
    """Full measurement: row bands, column segments in the named band, glyph heights."""
    if not image or not image[0]:
        raise ProbeError("empty image")
    bg = detect_background(image)
    mask = content_mask(image, bg, tol)
    bands = runs(row_flags(mask), min_run=MIN_BAND_RUN)
    if band is None and bands:
        band = max(bands, key=lambda b: b[1] - b[0])
    segments = None
    if band:
        segments = runs(column_flags(mask[band[0] : band[1] + 1]), min_run=MIN_SEGMENT_RUN)
    return {
        "size": (len(image[0]), len(image)),
        "background": bg,
        "row_bands": bands,
        "band": band,
        "segments": segments,
        "glyph_heights": glyph_heights(image),
    }


def evaluate(m, expect_cols=None, expect_rows=None, min_glyph=None):
    """The exit law: (ok, failures) — every given expectation must hold."""
    failures = []
    if expect_cols is not None:
        n = len(m["segments"]) if m["segments"] is not None else None
        if n != expect_cols:
            failures.append(f"cols: expected {expect_cols}, measured {n}")
    if expect_rows is not None and len(m["row_bands"]) != expect_rows:
        failures.append(f"rows: expected {expect_rows}, measured {len(m['row_bands'])}")
    if min_glyph is not None:
        top = max(m["glyph_heights"]) if m["glyph_heights"] else 0
        if top < min_glyph:
            failures.append(f"min-glyph: expected >= {min_glyph}, tallest {top}")
    return (not failures, failures)


# --- Pillow-dependent path (imported lazily, only here) --------------------


def load_image(path):
    """Decode a png into rows of (r, g, b) tuples."""
    try:
        from PIL import Image  # lazy: --selftest and the scan laws never need Pillow
    except ImportError:
        raise ProbeError(
            "reading a png needs Pillow, which is not installed:\n"
            "  python3 -m pip install --user Pillow\n"
            "(the --selftest scan laws run without it)"
        ) from None
    try:
        with Image.open(path) as img:
            rgb = img.convert("RGB")
            width, height = rgb.size
            data = list(rgb.getdata())
    except OSError as exc:
        raise ProbeError(f"cannot read {path}: {exc}") from None
    return [data[y * width : (y + 1) * width] for y in range(height)]


# --- selftest: the pure scan laws on synthetic arrays ----------------------


def blank_image(w, h, color):
    return [[color] * w for _ in range(h)]


def stamp(image, x0, y0, x1, y1, color):
    for y in range(y0, y1 + 1):
        row = image[y]
        for x in range(x0, x1 + 1):
            row[x] = color
    return image


BG = (16, 18, 24)        # dark chrome background
CARD = (90, 94, 102)     # mid-tone content: visible, below the bright threshold
WHITE = (255, 255, 255)  # text: bright
DIM = (60, 62, 70)       # dim content: visible to the band scan, invisible to the glyph scan


def case_runs_law():
    assert runs([False, True, True, True, False, True], min_run=2) == [(1, 3)]
    assert runs([False, True, True, True, False, True], min_run=1) == [(1, 3), (5, 5)]
    assert runs([False] * 6, min_run=1) == []
    assert runs([True] * 4, min_run=2) == [(0, 3)]


def case_background_detection():
    img = stamp(blank_image(40, 30, BG), 10, 10, 29, 19, CARD)
    assert detect_background(img) == BG


def case_row_bands():
    img = blank_image(40, 30, BG)
    stamp(img, 4, 3, 35, 6, CARD)    # band rows 3..6
    stamp(img, 4, 10, 35, 15, CARD)  # band rows 10..15
    stamp(img, 4, 20, 35, 27, CARD)  # band rows 20..27
    stamp(img, 18, 17, 18, 17, CARD)  # a lone pixel is noise, not a band
    assert row_bands(img) == [(3, 6), (10, 15), (20, 27)]


def case_column_bands():
    img = blank_image(40, 30, BG)
    stamp(img, 5, 4, 9, 25, CARD)    # columns 5..9
    stamp(img, 20, 2, 24, 27, CARD)  # columns 20..24
    assert column_bands(img) == [(5, 9), (20, 24)]


def case_band_segments():
    img = blank_image(96, 40, BG)
    for x0 in (4, 28, 52, 76):  # four 16-wide cards, 8-wide gutters
        stamp(img, x0, 10, x0 + 15, 30, CARD)
    assert band_segments(img, 10, 30) == [(4, 19), (28, 43), (52, 67), (76, 91)]
    stamp(img, 47, 12, 47, 13, CARD)  # a 1px sliver in the gutter stays noise
    assert band_segments(img, 10, 30) == [(4, 19), (28, 43), (52, 67), (76, 91)]


def case_glyph_heights():
    img = blank_image(60, 60, BG)
    stamp(img, 2, 5, 30, 14, WHITE)  # text line, 10 tall
    stamp(img, 2, 20, 30, 24, DIM)   # dim content — below luma, must not count
    stamp(img, 2, 30, 40, 57, WHITE)  # text line, 28 tall
    assert glyph_heights(img) == [10, 28]


def case_measure_pipeline():
    img = blank_image(96, 64, BG)
    stamp(img, 8, 2, 60, 5, WHITE)  # header text: rows 2..5
    for x0 in (4, 28, 52, 76):
        stamp(img, x0, 20, x0 + 15, 44, CARD)  # 4-poster grid band: rows 20..44
    stamp(img, 8, 54, 50, 61, WHITE)  # title line: rows 54..61
    m = measure(img)
    assert m["background"] == BG
    assert m["row_bands"] == [(2, 5), (20, 44), (54, 61)]
    assert m["band"] == (20, 44), "the tallest band is the grid"
    assert len(m["segments"]) == 4
    assert m["glyph_heights"] == [4, 8]
    ok, fails = evaluate(m, expect_cols=4, expect_rows=3, min_glyph=8)
    assert ok and not fails, fails
    ok, fails = evaluate(m, expect_cols=3)
    assert not ok and fails == ["cols: expected 3, measured 4"], fails


def case_expectation_gate():
    m = {"segments": [(4, 19), (28, 43)], "row_bands": [(2, 5)], "glyph_heights": [10, 28]}
    ok, fails = evaluate(m, expect_cols=2, expect_rows=1, min_glyph=28)
    assert ok and fails == [], fails
    ok, fails = evaluate(m)
    assert ok and fails == [], "measurement-only mode passes"
    ok, fails = evaluate(m, expect_cols=3, expect_rows=2, min_glyph=40)
    assert not ok and len(fails) == 3, fails
    assert fails[0].startswith("cols:")
    assert fails[1].startswith("rows:")
    assert fails[2].startswith("min-glyph:")


def case_empty_image():
    m = measure(blank_image(30, 20, BG))
    assert m["row_bands"] == []
    assert m["segments"] is None
    assert m["glyph_heights"] == []
    ok, fails = evaluate(m, expect_rows=1)
    assert not ok and fails == ["rows: expected 1, measured 0"], fails


def case_edge_touching():
    img = blank_image(20, 12, BG)
    stamp(img, 0, 4, 19, 7, CARD)  # a full-width band through the left and right edges
    assert row_bands(img) == [(4, 7)]
    assert band_segments(img, 4, 7) == [(0, 19)]

    img = blank_image(20, 12, BG)
    stamp(img, 0, 0, 19, 3, CARD)  # a band swallowing the top corners
    m = measure(img)               # corner sampling fails -> modal fallback
    assert m["background"] == BG
    assert m["row_bands"] == [(0, 3)]


def case_no_pil():
    # The selftest seam exists because the laws need no Pillow; if any law
    # ever imports it, the seam is broken.
    assert "PIL" not in sys.modules


SELFTEST_CASES = [
    ("runs_law", case_runs_law),
    ("background_detection", case_background_detection),
    ("row_band_scan", case_row_bands),
    ("column_band_scan", case_column_bands),
    ("band_column_segments", case_band_segments),
    ("glyph_height_scan", case_glyph_heights),
    ("measure_pipeline", case_measure_pipeline),
    ("expectation_gate", case_expectation_gate),
    ("empty_image", case_empty_image),
    ("edge_touching_content", case_edge_touching),
    ("scan_laws_run_without_pil", case_no_pil),
]


def run_selftest():
    if "PIL" in sys.modules:
        print("selftest: PIL already imported — the scan laws must run without it", file=sys.stderr)
        return 1
    failures = []
    for name, case in SELFTEST_CASES:
        try:
            case()
            print(f"PASS {name}")
        except AssertionError as exc:
            failures.append(name)
            print(f"FAIL {name}" + (f": {exc}" if exc else ""))
    total = len(SELFTEST_CASES)
    print(f"selftest: {total - len(failures)}/{total} passed")
    return 1 if failures else 0


# --- CLI --------------------------------------------------------------------


def parse_band(text):
    try:
        y0, y1 = (int(part) for part in text.split(":"))
    except ValueError:
        raise argparse.ArgumentTypeError(f"--band wants Y0:Y1 pixel rows, got {text!r}") from None
    if y0 < 0 or y0 > y1:
        raise argparse.ArgumentTypeError(f"--band wants 0 <= Y0 <= Y1, got {text!r}")
    return (y0, y1)


def build_parser():
    p = argparse.ArgumentParser(
        prog="tv_layout_probe.py",
        description="Session-side layout probe for Android TV screenshots "
        "(band scan, glyph heights, grid column count).",
    )
    p.add_argument("png", nargs="?", help="screenshot to measure")
    p.add_argument("--expect-cols", type=int, metavar="N", help="require N column segments in the band")
    p.add_argument("--expect-rows", type=int, metavar="N", help="require N content row bands")
    p.add_argument("--min-glyph", type=int, metavar="PX", help="require the tallest text box >= PX px")
    p.add_argument(
        "--band",
        type=parse_band,
        metavar="Y0:Y1",
        help="horizontal band (inclusive pixel rows) for the column count; "
        "default: the largest content row band",
    )
    p.add_argument("--selftest", action="store_true", help="run the pure scan laws on synthetic arrays")
    return p


def report(m):
    w, h = m["size"]
    print(f"image {w}x{h} background={m['background']}")
    print(f"content row bands: {len(m['row_bands'])} {m['row_bands']}")
    if m["band"]:
        print(
            f"column segments in band {m['band'][0]}:{m['band'][1]}: "
            f"{len(m['segments'])} {m['segments']}"
        )
    else:
        print("column segments: none (no content bands)")
    print(f"text boxes: {len(m['glyph_heights'])} heights {m['glyph_heights']}")


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.selftest:
        return run_selftest()
    if not args.png:
        build_parser().error("a png path is required (or --selftest)")
    try:
        image = load_image(args.png)
        m = measure(image, band=args.band)
    except ProbeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    report(m)
    ok, failures = evaluate(m, args.expect_cols, args.expect_rows, args.min_glyph)
    for failure in failures:
        print(f"MISMATCH {failure}")
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
