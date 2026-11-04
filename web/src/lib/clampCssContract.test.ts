// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// clampCssContract (collections-ux 3.1) — fs-contract pins over the title
// clamp law (specs/web-ui "Title clamp law"): the poster-card .scard-title
// rule caps its title at 2 lines in pure CSS, so a long name can never push
// the card body content down. jsdom evaluates no layout, so index.css is
// pinned by text (the tvCssContract.test.ts readFileSync idiom) and accepted
// visually by inspection — the cardact-trigger MANUAL TEST NOTE precedent.

function readCss(): string {
  return readFileSync(
    resolve(process.cwd(), "src/styles/index.css"),
    "utf8",
  );
}

// The declaration body of the rule introduced by the given selector text.
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(
    at,
    `selector ${selector} missing from index.css`,
  ).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  expect(close, `rule ${selector} never closes`).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

// The tv block lives between these two markers (tv-mode 5.1) — the same
// slice bounds tvCssContract uses, so neither sweep can leak across them.
const TV_BLOCK_START = "/* ---- TV mode shell (tv-mode 5.1)";
const TV_BLOCK_END = "/* ---- end tv-mode shell (tv-mode 5.1) ---- */";

describe("title clamp law (collections-ux 3.1)", () => {
  const css = readCss();
  const titleRule = ruleBody(css, ".scard .scard-title {");

  it(".scard-title clamps at 2 lines with the webkit box trio", () => {
    expect(titleRule).toContain("display: -webkit-box");
    expect(titleRule).toContain("-webkit-box-orient: vertical");
    expect(titleRule).toContain("-webkit-line-clamp: 2");
    expect(titleRule).toContain("overflow: hidden");
  });

  it("the clamp keeps the any-script wrap beside it", () => {
    // overflow-wrap: anywhere predates the clamp (any script may still wrap
    // WITHIN a line) — the clamp caps the lines, the wrap guards the glyphs.
    expect(titleRule).toContain("overflow-wrap: anywhere");
  });

  it("the tv shell block carries no .scard-title override — the clamp survives html.tv", () => {
    const start = css.indexOf(TV_BLOCK_START);
    const end = css.indexOf(TV_BLOCK_END);
    expect(start, "tv block start marker missing from index.css").toBeGreaterThanOrEqual(0);
    expect(end, "tv block end marker missing from index.css").toBeGreaterThan(start);
    expect(css.slice(start, end)).not.toContain(".scard-title");
  });
});
