// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Synopsis, plainText } from "@/components/metadata/Synopsis";
import type { MetadataAbout } from "@/lib/api";

// The About panel (user-locked 2026-10-21) consumes the SERVED convention
// block (media-data-convention): the caller passes the resolved
// `metadata.about` — the server already picked the winning namespace — and
// the panel renders it. No block → no panel; genres or facts alone never
// claim it (the server never serves such a block, and the SPA mirrors that
// honesty for an absent or empty description).

const SERVED_ABOUT: MetadataAbout = {
  source: "shikimori",
  description: "В 2071 году группа охотников за головами…",
  genres: ["Приключения", "Фантастика"],
  score: 4.65,
  kind: "tv",
  status: "released",
  episodes: 26,
  aired_on: "1998-04-03",
};

describe("Synopsis — the About panel over the served about block", () => {
  it("renders the served description, genre chips, and the fact line", () => {
    render(<Synopsis about={SERVED_ABOUT} />);

    const panel = screen.getByRole("region", { name: "About" });
    expect(panel.textContent).toContain("В 2071 году");
    expect(screen.getByText("Приключения")).toBeDefined();
    expect(screen.getByText("Фантастика")).toBeDefined();
    // The facts join in a fixed order: score ★ · kind · status · N ep · year.
    expect(
      screen.getByText("★ 4.65 · tv · released · 26 ep · 1998"),
    ).toBeDefined();
  });

  it("renders nothing without a served block — absence is absence", () => {
    const { container } = render(<Synopsis about={undefined} />);
    expect(container.querySelector('[aria-label="About"]')).toBeNull();
  });

  it("serves an honest partial — a description-only block renders just the paragraph", () => {
    const { container } = render(
      <Synopsis about={{ source: "shikimori", description: "Ковбои будущего." }} />,
    );

    const panel = screen.getByRole("region", { name: "About" });
    expect(panel.textContent).toContain("Ковбои будущего.");
    // No genres line, no fact line — never fabricated.
    expect(container.querySelector('[aria-label="Genres"]')).toBeNull();
    expect(panel.textContent).not.toContain("★");
  });

  it("a description that strips to whitespace is no panel — empty is noise", () => {
    const { container } = render(
      <Synopsis about={{ source: "shikimori", description: "   \n\t" }} />,
    );
    expect(container.querySelector('[aria-label="About"]')).toBeNull();
  });

  it("strips the BBCode wrapper tags sources wrap descriptions in — inner text kept", () => {
    render(
      <Synopsis
        about={{
          source: "shikimori",
          description:
            "[b]Жирно[/b] и [character=124731]Аста[/character] жив.",
        }}
      />,
    );
    const panel = screen.getByRole("region", { name: "About" });
    expect(panel.textContent).toContain("Жирно и Аста жив.");
    expect(panel.textContent).not.toContain("[b]");
  });

  it("plainText keeps the inner text and passes plain descriptions untouched", () => {
    expect(
      plainText("[b]Жирно[/b] и [character=124731]Аста[/character] жив."),
    ).toBe("Жирно и Аста жив.");
    expect(plainText("[url=https://x]ссылка[/url] [i]курсив[/i]")).toBe(
      "ссылка курсив",
    );
    expect(plainText("Обычное описание.")).toBe("Обычное описание.");
  });
});
