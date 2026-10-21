// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Synopsis, plainText, synopsisOf } from "@/components/metadata/Synopsis";
import type { ItemDocument } from "@/lib/document";

// The About panel (user-locked 2026-10-21): the scraped narrative metadata
// shown prominently. The derivation is the pure core — the first
// description-bearing namespace provides the panel and its facts ride along;
// no description → no panel, genres alone never claim it.

const SHIKIMORI_LIKE: ItemDocument = {
  sources: {
    "serial-parser": { season: 1 },
    shikimori: {
      description: "В 2071 году группа охотников за головами…",
      genres: ["Приключения", "Фантастика"],
      score: "4.65",
      kind: "tv",
      status: "released",
      episodes: 26,
      aired_on: "1998-04-03",
    },
  },
};

describe("Synopsis — the About panel", () => {
  it("renders the description, genre chips, and the fact line from ONE namespace", () => {
    render(<Synopsis doc={SHIKIMORI_LIKE} />);

    const panel = screen.getByRole("region", { name: "About" });
    expect(panel.textContent).toContain("В 2071 году");
    expect(screen.getByText("Приключения")).toBeDefined();
    expect(screen.getByText("Фантастика")).toBeDefined();
    // The facts join in a fixed order: score ★ · kind · status · N ep · year.
    expect(screen.getByText("★ 4.65 · tv · released · 26 ep · 1998")).toBeDefined();
  });

  it("renders nothing without a description — genres or facts alone never claim the panel", () => {
    const doc: ItemDocument = {
      sources: {
        shikimori: { genres: ["Драма"], score: 9, kind: "movie" },
      },
    };
    const { container } = render(<Synopsis doc={doc} />);
    expect(container.querySelector('[aria-label="About"]')).toBeNull();
    expect(synopsisOf(doc)).toBeNull();
  });

  it("skips description-less namespaces — the first description-bearing one wins", () => {
    const doc: ItemDocument = {
      sources: {
        "tv-parser": { title: "Cowboy Bebop", year: 1998 },
        shikimori: { description: "Ковбои будущего." },
      },
    };
    const panel = synopsisOf(doc);
    expect(panel).not.toBeNull();
    expect(panel?.description).toBe("Ковбои будущего.");
    // aired_on absent, year absent from the SAME namespace → no year fact.
    expect(panel?.facts).toEqual([]);
  });

  it("a whitespace-only description is no description", () => {
    const doc: ItemDocument = {
      sources: { shikimori: { description: "   \n\t" } },
    };
    expect(synopsisOf(doc)).toBeNull();
  });

  it("strips the BBCode wrapper tags sources wrap descriptions in — inner text kept", () => {
    expect(plainText("[b]Жирно[/b] и [character=124731]Аста[/character] жив.")).toBe(
      "Жирно и Аста жив.",
    );
    expect(plainText("[url=https://x]ссылка[/url] [i]курсив[/i]")).toBe(
      "ссылка курсив",
    );
    // A plain description passes through untouched.
    expect(plainText("Обычное описание.")).toBe("Обычное описание.");
  });
});
