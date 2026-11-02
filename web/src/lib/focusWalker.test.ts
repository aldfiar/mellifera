// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import { columnsFromTops, nextIndex, walkTargets } from "@/lib/focusWalker";

// tv-mode 3.1 — table-driven vectors over the pure D-pad focus core, over a
// synthetic 4-col × 3-row grid (COUNT 12, row-major indices 0..11). The
// edge behavior is asserted twice on purpose: once through named boundary
// corners (first-col left, last-col right, first-row up, last-row down) and
// once through an exhaustive sweep whose oracle is INDEPENDENT row/col
// coordinate math — a clamp that wrapped, drifted a row, or stepped the
// wrong direction fails the sweep, not the same formula it came from. The
// geometry-dependent bits run over stubbed offsets (jsdom has no layout):
// visibility arrives as an injected predicate and the column count as a
// plain number array, the density.ts injection posture. These vectors are
// the reviewer's re-run surface at GATE 2.

const COLS = 4;
const COUNT = 12; // 4-col × 3-row synthetic grid

function walk(current: number, key: string): number | null {
  return nextIndex({ count: COUNT, current, cols: COLS, key });
}

describe("nextIndex", () => {
  it.each([
    { current: 0, want: 1 },
    { current: 1, want: 2 },
    { current: 5, want: 6 },
    { current: 10, want: 11 },
  ])("right_moves_plus_one", ({ current, want }) => {
    expect(walk(current, "ArrowRight")).toBe(want);
  });

  it.each([
    { current: 1, want: 0 },
    { current: 5, want: 4 },
    { current: 11, want: 10 },
  ])("left_moves_minus_one", ({ current, want }) => {
    expect(walk(current, "ArrowLeft")).toBe(want);
  });

  it.each([
    { current: 0, want: 4 },
    { current: 3, want: 7 },
    { current: 5, want: 9 },
    { current: 7, want: 11 },
  ])("down_moves_by_cols", ({ current, want }) => {
    expect(walk(current, "ArrowDown")).toBe(want);
  });

  it.each([
    { current: 4, want: 0 },
    { current: 7, want: 3 },
    { current: 11, want: 7 },
  ])("up_moves_by_cols", ({ current, want }) => {
    expect(walk(current, "ArrowUp")).toBe(want);
  });

  // The four clamp edges as named corners of the synthetic grid: the press
  // resolves to the SAME index (clamped), never wraps to the opposite edge.
  it.each([
    { key: "ArrowLeft", current: 0, why: "first col" },
    { key: "ArrowLeft", current: 4, why: "first col" },
    { key: "ArrowRight", current: 3, why: "last col" },
    { key: "ArrowRight", current: 11, why: "last col" },
    { key: "ArrowUp", current: 0, why: "first row" },
    { key: "ArrowUp", current: 2, why: "first row" },
    { key: "ArrowDown", current: 8, why: "last row" },
    { key: "ArrowDown", current: 11, why: "last row" },
  ])("edges_clamp_no_wrap", ({ key, current, why }) => {
    expect(walk(current, key), `${key} at ${why} (${current})`).toBe(current);
  });

  // Exhaustive sweep over every cell × every arrow, with the oracle derived
  // from grid coordinates (row/col math) rather than the clamp formula —
  // any wrap-around or off-by-one row step fails here.
  it.each(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const)(
    "sweep_%s_matches_coordinate_oracle",
    (key) => {
      for (let current = 0; current < COUNT; current++) {
        const row = Math.floor(current / COLS);
        const col = current % COLS;
        let want: number;
        switch (key) {
          case "ArrowLeft":
            want = col === 0 ? current : current - 1;
            break;
          case "ArrowRight":
            want = col === COLS - 1 ? current : current + 1;
            break;
          case "ArrowUp":
            want = row === 0 ? current : current - COLS;
            break;
          case "ArrowDown":
            want = row === 2 ? current : current + COLS;
            break;
        }
        expect(walk(current, key), `${key} from ${current}`).toBe(want);
      }
    },
  );

  // Holding an edge key keeps re-resolving to the same index — no creep, no
  // wrap after repetition.
  it("repeated_edge_presses_stay_clamped", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      let current = 5;
      for (let press = 0; press < COUNT; press++) {
        const next = walk(current, key);
        expect(next).not.toBeNull();
        current = next as number;
        expect(current).toBeGreaterThanOrEqual(0);
        expect(current).toBeLessThan(COUNT);
      }
    }
  });

  // Any non-arrow key is UNHANDLED: null means the harness must not consume
  // the event. Enter (native activation), the space bar, media keys (the
  // playerShortcuts table's exclusive territory — design I3), navigation
  // keys, a lowercase arrow, and the empty key all land here.
  it.each([
    "Enter",
    " ",
    "Escape",
    "Home",
    "End",
    "Tab",
    "MediaPlayPause",
    "MediaTrackNext",
    "a",
    "arrowleft",
    "",
  ])("unhandled_keys_return_null", (key) => {
    expect(walk(5, key)).toBeNull();
  });

  // Degenerate grids throw — a caller whose discovery and focus disagree is
  // a bug, never a walkable state (fail-fast, the density.ts posture).
  it.each([
    { count: 0, current: 0, cols: COLS },
    { count: COUNT, current: COUNT, cols: COLS },
    { count: COUNT, current: -1, cols: COLS },
    { count: COUNT, current: 0, cols: 0 },
  ])("rejects_degenerate_grids", (grid) => {
    expect(() => nextIndex({ ...grid, key: "ArrowLeft" })).toThrow(RangeError);
  });
});

// walkTargets — the discovery helper. jsdom has no layout, so visibility is
// a stubbed predicate; the DOM-order and focusable-selector contracts are
// the assertions that matter here.
describe("walkTargets", () => {
  function gridRoot(): HTMLDivElement {
    const root = document.createElement("div");
    root.innerHTML = [
      '<div class="row">',
      '  <a href="/a" id="a">a</a>',
      '  <button id="b">b</button>',
      '  <a id="nohref">no-href anchor</a>', // anchors without href are NOT walkable
      "  <span>span</span>",
      '  <div tabindex="0">div</div>', // tabindex alone is NOT in the set
      "</div>",
      '<div class="row">',
      '  <a href="/c" id="c">c</a>',
      '  <button id="d">d</button>',
      '  <button id="e">e</button>',
      "</div>",
    ].join("");
    return root;
  }

  it("collects_links_and_buttons_in_dom_order", () => {
    const targets = walkTargets(gridRoot(), () => true);
    expect(targets.map((el) => el.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("visibility_predicate_is_injected", () => {
    const targets = walkTargets(
      gridRoot(),
      (el) => el.id !== "b" && el.id !== "d",
    );
    expect(targets.map((el) => el.id)).toEqual(["a", "c", "e"]);
  });

  // The composed path the harness runs: discovery → stubbed first-row
  // offsets → column count. jsdom cannot measure, so offsetTop is
  // defineProperty-stubbed per DOM position (4-col rows) — the same
  // injection point the harness's real geometry read replaces.
  it("composes_with_columns_from_tops_over_stubbed_offsets", () => {
    const root = document.createElement("div");
    for (let i = 0; i < COUNT; i++) {
      const a = document.createElement("a");
      a.href = `/item-${i}`;
      root.appendChild(a);
      Object.defineProperty(a, "offsetTop", {
        value: Math.floor(i / COLS) * 200,
        configurable: true,
      });
    }
    const targets = walkTargets(root, () => true);
    expect(targets).toHaveLength(COUNT);
    expect(columnsFromTops(targets.map((el) => el.offsetTop))).toBe(COLS);
  });
});

// columnsFromTops — the first-row prefix count over stubbed offsets.
describe("columnsFromTops", () => {
  it.each([
    {
      tops: [0, 0, 0, 0, 220, 220, 220, 220, 440, 440, 440, 440],
      want: 4,
    },
    { tops: [10, 10, 10], want: 3 },
    { tops: [10], want: 1 },
    { tops: [0, 200, 400], want: 1 }, // single-column grid: every top distinct
    { tops: [], want: 0 }, // empty grid: nothing measured
  ])("counts_the_first_row_over_stubbed_offsets", ({ tops, want }) => {
    expect(columnsFromTops(tops)).toBe(want);
  });
});
