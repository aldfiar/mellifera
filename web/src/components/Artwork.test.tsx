// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { fallbackGradient, PosterFrame } from "@/components/Artwork";

// Artwork 3.2's acceptance floor: the fallback vector is a PURE function of
// the name — deterministic (golden), distinct across names, pastel-banded,
// the first grapheme carried VERBATIM (Cyrillic included); PosterFrame
// renders the blob img when a src resolves and the name-derived gradient +
// initial when one does not — never a broken-image glyph, never a blank
// span.

describe("fallbackGradient — golden-vector determinism (artwork 3.2)", () => {
  it("returns the pinned golden vector for a fixed name", () => {
    // Golden: the FNV-1a → hue derivation is frozen; a drift in the hash,
    // the hue offset, or the pastel bands fails exactly here.
    expect(fallbackGradient("Оська")).toEqual({
      from: "hsl(102 68% 82%)",
      to: "hsl(181 62% 74%)",
      initial: "О",
    });
  });

  it("is deterministic — the same name renders the same vector", () => {
    for (const name of ["Оська", "Властелин колец", "Clannad", ""]) {
      expect(fallbackGradient(name)).toEqual(fallbackGradient(name));
    }
  });

  it("distinct names → distinct vectors", () => {
    const names = ["Оська", "Властелин колец", "Clannad", "Мага", "Зářický příklad"];
    const vectors = names.map(fallbackGradient);
    const keys = new Set(vectors.map((v) => `${v.from}|${v.to}`));
    expect(keys.size).toBe(names.length);
  });

  it("keeps the first grapheme verbatim — Cyrillic, latin, whitespace-led", () => {
    expect(fallbackGradient("Оська").initial).toBe("О");
    expect(fallbackGradient("Clannad").initial).toBe("C");
    expect(fallbackGradient("  Властелин").initial).toBe("В"); // leading spaces skipped
    expect(fallbackGradient("").initial).toBe(""); // honest empty — never a fabricated glyph
  });

  it("both stops stay pastel — hue in [0,360), fixed saturation/lightness bands", () => {
    const names = ["Оська", "Clannad", "Мага", "Властелин колец", "Зářický příklad", "x"];
    for (const name of names) {
      const { from, to } = fallbackGradient(name);
      for (const stop of [from, to]) {
        const m = /^hsl\((\d+) (?:6[0-9]|7[0-9])% (?:7[0-9]|8[0-9])%\)$/.exec(stop);
        expect(m, stop).not.toBeNull();
        if (m) {
          expect(Number(m[1])).toBeLessThan(360);
        }
      }
    }
  });
});

describe("PosterFrame (artwork 3.2)", () => {
  it("renders a blob img when src is present", () => {
    render(<PosterFrame src="blob:art-1" name="Оська" className="w-10" />);

    const img = screen.getByRole("img", { name: "Оська" });
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("blob:art-1");
    expect(img.className).toContain("w-10"); // the surface's layout rides both shapes
    expect(img.className).toContain("object-cover");
  });

  it("renders the name-derived gradient + initial when src is absent — never a blank span", () => {
    const g = fallbackGradient("Оська");
    render(<PosterFrame src={null} name="Оська" />);

    const el = screen.getByRole("img", { name: "Оська" });
    expect(el.tagName).toBe("SPAN");
    expect(el.style.background).toContain(g.from);
    expect(el.style.background).toContain(g.to);
    expect(el.textContent).toBe("О"); // the initial, not a placeholder dot
  });

  it("a failed decode swaps the img for the fallback — never a broken-image glyph", () => {
    render(<PosterFrame src="blob:dead" name="Имя" />);
    expect(screen.getByRole("img", { name: "Имя" }).tagName).toBe("IMG");

    fireEvent.error(screen.getByRole("img", { name: "Имя" }));

    const el = screen.getByRole("img", { name: "Имя" });
    expect(el.tagName).toBe("SPAN"); // the fallback card, gradient + initial
    expect(el.style.background).toContain("hsl(");
  });

  it("a new src recovers from a previous failure", () => {
    const { rerender } = render(<PosterFrame src="blob:dead" name="Имя" />);
    fireEvent.error(screen.getByRole("img", { name: "Имя" }));
    expect(screen.getByRole("img", { name: "Имя" }).tagName).toBe("SPAN");

    rerender(<PosterFrame src="blob:alive" name="Имя" />);
    expect(screen.getByRole("img", { name: "Имя" }).tagName).toBe("IMG");
  });

  it("never fetches anything itself — the src it gets is the blob it renders", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<PosterFrame src={null} name="Х" />);
    render(<PosterFrame src="blob:given" name="Х" />);
    expect(fetchSpy).not.toHaveBeenCalled(); // bytes ride the callers' channels
  });
});
