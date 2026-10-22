// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import type { MetadataAbout } from "@/lib/api";

// Synopsis — the About panel (the Plex/Jellyfin idiom, user-locked
// 2026-10-21): the scraped narrative metadata shown PROMINENTLY — on the
// element page beside the player, and on top of a series' episode flow —
// instead of only inside the footer's raw namespace groups.
//
// The panel consumes the SERVED convention block (media-data-convention):
// the server resolves the winning source_chain namespace first-wins —
// whole, gate-resolved, key-order-immune — and hands the caller the
// `metadata.about` object. The SPA walks no namespaces of its own: the
// caller (ItemDetail / Collection) passes the served block, and a missing
// block renders NOTHING (an empty panel is noise, not information).
//
// Presentation only: the description strips the BBCode wrapper tags sources
// wrap descriptions in, genres render as chips, and the ride-along facts
// join in a fixed, predictable order. Values render verbatim (kind/status
// are the source's own vocabulary); aired_on renders as its year prefix.
// No interpretation, no fabrication.
export function Synopsis(props: { about?: MetadataAbout }): ReactElement | null {
  const panel = panelOf(props.about);
  if (panel === null) {
    return null;
  }
  return (
    <section
      aria-label="About"
      className="flex flex-col gap-2 rounded-lg border bg-card p-3"
    >
      <h2 className="text-sm font-semibold">About</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {panel.description}
      </p>
      {panel.genres.length > 0 ? (
        <div className="flex flex-wrap gap-1" aria-label="Genres">
          {panel.genres.map((genre) => (
            <span
              key={genre}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {genre}
            </span>
          ))}
        </div>
      ) : null}
      {panel.facts.length > 0 ? (
        <p className="text-xs text-muted-foreground">{panel.facts.join(" · ")}</p>
      ) : null}
    </section>
  );
}

// SynopsisPanel — the presentation view: the description paragraph, the
// genre names, and the joined fact words (score ★ / kind / status / N ep /
// year).
interface SynopsisPanel {
  description: string;
  genres: string[];
  facts: string[];
}

// panelOf — the served about block shaped for rendering. null when the
// block is absent or its description strips to nothing: the description is
// the carrier the server resolved on, so an empty one is no panel.
function panelOf(about: MetadataAbout | undefined): SynopsisPanel | null {
  if (about === undefined) {
    return null;
  }
  const description = plainText(about.description).trim();
  if (description === "") {
    return null;
  }
  const genres = Array.isArray(about.genres)
    ? about.genres.filter((genre) => genre !== "")
    : [];
  const facts: string[] = [];
  if (about.score !== undefined) {
    facts.push(`★ ${about.score}`);
  }
  if (about.kind) {
    facts.push(about.kind);
  }
  if (about.status) {
    facts.push(about.status);
  }
  if (about.episodes !== undefined) {
    facts.push(`${about.episodes} ep`);
  }
  const year = about.aired_on === undefined ? null : yearOf(about.aired_on);
  if (year !== null) {
    facts.push(String(year));
  }
  return { description, genres, facts };
}

// yearOf — the "YYYY" prefix of an aired_on date ("1998-02-20"). Anything
// shorter or non-numeric yields null (never a guess).
function yearOf(value: string): number | null {
  if (value.length < 4) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

// plainText — strip the BBCode wrapper tags sources wrap descriptions in
// ("[character=124731]Аста[/character] и…" → "Аста и…"), keeping the INNER
// text: the tags are markup, not data. Unknown/non-string input passes
// through untouched — never a guess, never a crash.
export function plainText(value: string): string {
  return value.replace(/\[\/?[a-z*]+(?:=[^\]]*)?\]/gi, "");
}
