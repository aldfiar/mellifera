// SPDX-License-Identifier: Apache-2.0

// focusWalker — the pure D-pad focus core for TV mode (tv-mode design D5,
// task 3.1; the TvFocusRoot harness that wires these into one window
// keydown listener is task 3.2). No React, no layout reads: the grid is
// walked over row-major indices, and every DOM-dependent input — the
// focusable set, element visibility, the row geometry behind `cols` — is
// INJECTED as an argument, so jsdom tests feed synthetic rows and the same
// functions run unmodified in the browser (the density.ts pattern).
//
// The walk contract pinned here:
//   ArrowLeft/Right = current ∓ 1, ArrowUp/Down = current ∓ cols — EDGE-
//   CLAMPED with NO wrap-around (the mockup clamps; wrap disorients at 3 m).
//   Clamped means the current index HOLDS on an outward press: horizontal
//   presses hold at a row's ends (the left/right target must stay in the
//   same row — otherwise ArrowLeft from the second row's first card would
//   silently wrap onto the first row's last card), vertical presses hold at
//   the first/last row. The target is never slid along a boundary either —
//   down on the last row's first card stays on that card instead of jumping
//   to the row's end (a sideways move from a vertical press is its own
//   disorientation; spec: "a further outward press keeps focus clamped").
//   Any other key → null (UNHANDLED): Enter is never handled here (native
//   activation fires the click itself) and no media key ever is — the
//   walker and the player-shortcut table stay disjoint by construction
//   (design I3: ONE key table lives in playerShortcuts).

// WalkerGrid — the inputs nextIndex reads, all measured by the caller. The
// harness derives `count` from walkTargets, `current` from the focused
// target's index in that set, and `cols` from columnsFromTops over the
// first row's stubbed/measured offsetTops. `key` is KeyboardEvent.key
// verbatim — normalization of anything beyond the four arrows is not this
// module's job.
export interface WalkerGrid {
  count: number;
  current: number;
  cols: number;
  key: string;
}

// nextIndex — the row-major walk over a `count`-target grid with `cols`
// columns: the target index after `key`, edge-clamped per axis (an outward
// press holds the current index — no wrap-around, no boundary slide), or
// null when `key` is not one of the four arrows (unhandled — the harness
// must not consume the event).
//
// Degenerate grids throw: a count of 0 has nothing to focus and a `current`
// outside [0, count) means the harness's discovery and focus disagree —
// both are caller bugs, never walkable states.
export function nextIndex(grid: WalkerGrid): number | null {
  if (grid.cols < 1) {
    throw new RangeError(`cols must be >= 1, got ${grid.cols}`);
  }
  if (grid.count < 1) {
    throw new RangeError(`count must be >= 1, got ${grid.count}`);
  }
  if (grid.current < 0 || grid.current >= grid.count) {
    throw new RangeError(`current ${grid.current} outside [0, ${grid.count})`);
  }

  switch (grid.key) {
    case "ArrowLeft": // hold on the row's first card — never onto the previous row's last
      return grid.current % grid.cols === 0 ? grid.current : grid.current - 1;
    case "ArrowRight": // hold on the row's last card — never onto the next row's first
      return grid.current + 1 >= grid.count ||
        (grid.current + 1) % grid.cols === 0
        ? grid.current
        : grid.current + 1;
    case "ArrowUp": // hold on the first row
      return grid.current < grid.cols ? grid.current : grid.current - grid.cols;
    case "ArrowDown": // hold on the last row (also covers a ragged final row: no target below)
      return grid.current + grid.cols >= grid.count
        ? grid.current
        : grid.current + grid.cols;
    default:
      return null;
  }
}

// walkTargets — the D-pad addressable set: every `a[href]`/`button` under
// `root` in DOM order (querySelectorAll is depth-first document order, and
// grids lay their cells out row-major in the DOM, so index order IS visual
// order). Visibility is INJECTED — jsdom cannot evaluate layout or CSS, so
// the harness passes the real predicate (offsetWidth/offsetHeight +
// getComputedStyle) and tests pass a synthetic one over stubbed elements.
export function walkTargets(
  root: ParentNode,
  isVisible: (el: HTMLElement) => boolean,
): HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>("a[href], button");
  return Array.from(candidates).filter(isVisible);
}

// columnsFromTops — the column count from the FIRST ROW's geometry: the
// targets sit at row-major DOM order, so the first row is a prefix whose
// offsetTops all equal tops[0]; the count is that prefix's length. Takes
// the measured numbers as arguments (no element reads) so stubbed offsets
// drive the jsdom tests and the harness's real measurements drive the
// browser — the density.ts injected-measurement posture. A single-column
// grid (every top distinct) measures 1; an empty grid measures 0.
export function columnsFromTops(tops: number[]): number {
  if (tops.length === 0) {
    return 0;
  }
  const firstTop = tops[0];
  let cols = 1;
  while (cols < tops.length && tops[cols] === firstTop) {
    cols++;
  }
  return cols;
}
