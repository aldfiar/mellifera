// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// tvCssContract 5.1 — fs-contract pins over the .tv shell block (the
// density.test.ts readFileSync idiom: jsdom evaluates no media queries, so
// index.css is pinned by text and accepted visually by inspection — the
// cardact-trigger MANUAL TEST NOTE precedent). The block is delimited by the
// tv-mode markers in index.css, so the sweep below can never leak into the
// desktop rules around it: D3's absolute vw/vh rule fails loudly the moment
// a bare fixed px drifts into a size declaration during a later edit (the
// 4K-at-dpr-1 trap), and the pinned strings fail on any formatting drift.

// The tv block lives between these two markers (tv-mode 5.1). Slicing keeps
// the no-bare-px sweep scoped to the block — a bare px elsewhere in index.css
// is desktop code and none of this contract's business.
const TV_BLOCK_START = "/* ---- TV mode shell (tv-mode 5.1)";
const TV_BLOCK_END = "/* ---- end tv-mode shell (tv-mode 5.1) ---- */";

function readTvBlock(): string {
  const css = readFileSync(
    resolve(process.cwd(), "src/styles/index.css"),
    "utf8",
  );
  const start = css.indexOf(TV_BLOCK_START);
  const end = css.indexOf(TV_BLOCK_END);
  expect(start, "tv block start marker missing from index.css").toBeGreaterThanOrEqual(0);
  expect(end, "tv block end marker missing from index.css").toBeGreaterThan(start);
  return css.slice(start, end + TV_BLOCK_END.length);
}

// One CSS rule body -> its declarations (`prop: value`, semicolon-separated).
// Comments are stripped first so prose numbers can never trip the sweep.
function declarationsOf(block: string): Array<{ prop: string; value: string }> {
  const sansComments = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const decls: Array<{ prop: string; value: string }> = [];
  for (const body of sansComments.match(/\{([^{}]*)\}/g) ?? []) {
    for (const decl of body.slice(1, -1).split(";")) {
      const trimmed = decl.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(":");
      if (idx === -1) continue;
      decls.push({
        prop: trimmed.slice(0, idx).trim(),
        value: trimmed.slice(idx + 1).trim(),
      });
    }
  }
  return decls;
}

// The size properties the sweep guards (D3): every tv-mode SIZE is a vw/vh
// clamp. Non-size declarations (display, opacity, color, ...) are exempt.
const SIZE_PROPS = new Set([
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "gap",
  "row-gap",
  "column-gap",
  "font-size",
  "line-height",
  "border-radius",
  "border-width",
  "outline",
  "outline-width",
  "outline-offset",
  "flex-basis",
  "letter-spacing",
]);

describe("tv shell block (tv-mode 5.1)", () => {
  const block = readTvBlock();

  it("root type is the viewport clamp scaled by --tv-dpr on html.tv", () => {
    expect(block).toContain("html.tv {");
    expect(block).toContain(
      "font-size: calc(clamp(16px, 1.05vw, 30px) * var(--tv-dpr, 1))",
    );
  });

  it("shell padding is the 2.5vw / 2.5vh overscan pair", () => {
    expect(block).toContain("html.tv .app-content {");
    expect(block).toContain("padding: 2.5vh 2.5vw");
  });

  it("content cap is lifted to min(92vw, 1800px), scaled by --tv-dpr", () => {
    expect(block).toContain(
      "max-width: calc(min(92vw, 1800px) * var(--tv-dpr, 1))",
    );
  });

  it("focus ring is the clamp scaled by --tv-dpr; the offset stays a raw fraction", () => {
    expect(block).toContain(
      "outline: calc(clamp(2px, 0.2vw, 5px) * var(--tv-dpr, 1)) solid hsl(var(--ring))",
    );
    expect(block).toContain("outline-offset: clamp(2px, 0.2vw, 4px)");
  });

  it("poster track budget derives from the 100vh fractions, not the desktop 182px chrome", () => {
    expect(block).toContain("html.tv .series-poster-grid {");
    expect(block).toContain("--poster-track-max:");
    expect(block).toContain("calc((100vh - var(--tv-poster-chrome)) / 3)");
    // The desktop tier pick is overridden inside the block — the desktop
    // vars stay untouched outside it (this is an override, not an edit).
    expect(block).toContain("--tv-poster-chrome:");
  });

  it("persistent reveal rides BOTH pointer:coarse and html.tv", () => {
    // The coarse block (shipped, untouched) stays, and html.tv carries its
    // twin — TV Chrome reports pointer: fine, so the coarse block alone
    // would leave the triggers hover-gated on a TV.
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/index.css"),
      "utf8",
    );
    expect(css).toContain("@media (pointer: coarse)");
    expect(block).toContain("html.tv .cardact-trigger {");
    expect(block).toContain("opacity: 1");
    expect(block).toContain(
      "width: calc(clamp(40px, 2.5vw, 64px) * var(--tv-dpr, 1))",
    );
    expect(block).toContain(
      "height: calc(clamp(40px, 2.5vw, 64px) * var(--tv-dpr, 1))",
    );
  });

  it("pure viewport fractions stay raw — never wrapped in --tv-dpr (D3')", () => {
    // The unscaled set: padding, the poster-grid rule (its governing leg
    // calc((100vh - chrome)) / 3) is dpr-invariant; wrapping the 120px floor
    // leg to 240 CSS px at dpr 2 would invert the max() precedence and clip
    // the second row), the outline offset, the status-chrome reserve and the
    // img cap are pure fractions and stay byte-raw.
    expect(block).toContain("padding: 2.5vh 2.5vw");
    expect(block).toContain("--tv-poster-chrome: 12vh");
    expect(block).toContain("clamp(120px, 4vw, 240px)");
    expect(block).not.toContain("clamp(120px, 4vw, 240px) * var(--tv-dpr");
    expect(block).toContain("--tv-status-chrome: clamp(48px, 7vh, 110px)");
    expect(block).toContain(
      "max-height: calc(100vh - var(--tv-status-chrome)) !important",
    );
    // Bidirectional drift guard: EXACTLY the px-bearing size props carry the
    // wrap — a wrap drifting into a fraction rule (or vice versa) fails here.
    const wrappedProps = declarationsOf(block)
      .filter((d) => d.value.includes("--tv-dpr"))
      .map((d) => d.prop)
      .sort();
    expect(wrappedProps).toEqual([
      "font-size",
      "height",
      "max-width",
      "outline",
      "width",
    ]);
  });

  it("photo stage caps at calc(100vh - the status line var), replacing the desktop 136px chrome", () => {
    expect(block).toContain(
      'html.tv main > section[aria-label="Media stage"] {',
    );
    expect(block).toContain("--tv-status-chrome:");
    // The !important is the inline-style override: the desktop cap
    // (photoStageMaxH(PHOTO_STAGE_CHROME_PX)) rides the img's style
    // attribute, and a stylesheet rule loses to inline style without it.
    expect(block).toContain(
      "max-height: calc(100vh - var(--tv-status-chrome)) !important",
    );
  });

  it("metadata column hides under html.tv on the photo lane only", () => {
    // The photo lane is the only lane whose stage section is a DIRECT child
    // of main (the watch lane nests its stage inside the grid), so the
    // adjacent-sibling selector hits exactly the photo identity block.
    expect(block).toContain(
      'html.tv main > section[aria-label="Media stage"] + *',
    );
    expect(block).toContain("display: none");
  });

  it("no bare fixed px in any size declaration of the tv block (D3 sweep)", () => {
    const decls = declarationsOf(block);
    const sized = decls.filter(
      (d) => SIZE_PROPS.has(d.prop) || d.prop.startsWith("--"),
    );
    // Guard the guard: the sweep must actually see the block's sizes — a
    // refactor that empties the block must fail here, not pass vacuously.
    expect(sized.length).toBeGreaterThanOrEqual(8);
    for (const d of sized) {
      expect(d.value, `size declaration ${d.prop}: ${d.value}`).toMatch(
        /(?:\d|\))\s*(?:vw|vh)/,
      );
    }
  });
});
