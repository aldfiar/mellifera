// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PlayerLegend from "@/components/playback/PlayerLegend";

// The legend's contracts (watch-flow-polish 3.4): it renders the exact key
// map the shortcuts table normalizes, and it is gated to fine-pointer
// (desktop) surfaces. jsdom evaluates no media queries (the cardact
// MANUAL TEST NOTE precedent), so the pointer gate is asserted on the
// class markers the stylesheet keys on — hidden by default, flex only
// under the (pointer: fine) variant.

describe("PlayerLegend — the keyboard map row (watch-flow-polish 3.4)", () => {
  it("legend_renders_on_fine_pointers_only", () => {
    render(<PlayerLegend />);

    const legend = screen.getByTestId("player-legend");

    // The full map, verbatim the bindings.
    const text = legend.textContent ?? "";
    for (const part of [
      "Space play / pause",
      "←/→ ±10 s",
      "↑/↓ volume",
      "F fullscreen",
      "N/P next / prev episode",
      "0-9 tenth of the media",
    ]) {
      expect(text).toContain(part);
    }

    // The pointer gate: display none by default, laid out only under the
    // (pointer: fine) media variant — a coarse-pointer (touch) surface
    // never renders the row.
    expect(legend.className).toContain("hidden");
    expect(legend.className).toContain("[@media(pointer:fine)]:flex");
  });
});
