// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The overlay height contract, pinned against index.css (the density.test.ts
// fs-reading idiom): every overlay panel rendering variable-length content
// must cap its height and own a scroll region, and a long list inside such a
// panel is its OWN scroll region so the actions below it stay pinned. The
// 2026-10-27 identify bug was exactly a missing half of this pair —
// .cardact-panel had NO height contract, so 10 candidates × ~155px grew the
// panel to 1615px; the backdrop's flex-centering then pushed its top to
// −491px at a 633px viewport and the CORRECT candidate #0 rendered off-screen
// above the fold (read as a "search quality" failure). Neither rule may
// drift alone.
//
// Pitfall (proven in density.test.ts): resolve from process.cwd(), never
// import.meta.url — vitest's jsdom rejects file:// URL construction.

function overlayCss(): string {
  return readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");
}

function rule(source: string, selector: string): string {
  const at = source.indexOf(`${selector} {`);
  if (at < 0) {
    throw new Error(`selector missing from index.css: ${selector}`);
  }
  return source.slice(at, source.indexOf("}", at));
}

describe("overlay height contract (index.css)", () => {
  it(".cardact-panel is capped and scrolls — a long view can never leave the viewport", () => {
    const panel = rule(overlayCss(), ".cardact-panel");
    expect(panel).toContain("max-height: min(90vh, 640px)");
    expect(panel).toContain("overflow-y: auto");
  });

  it(".identify-candidates is its own scroll region (Back stays pinned below)", () => {
    const list = rule(overlayCss(), ".identify-candidates");
    expect(list).toContain("max-height: 46vh");
    expect(list).toContain("overflow-y: auto");
  });
});
