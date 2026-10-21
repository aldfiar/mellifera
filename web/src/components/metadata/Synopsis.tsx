// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import type { ItemDocument } from "@/lib/document";
import { sourcesOf } from "@/lib/document";

// Synopsis — the About panel (the Plex/Jellyfin idiom, user-locked
// 2026-10-21): the scraped narrative metadata shown PROMINENTLY — on the
// element page beside the player, and on top of a series' episode flow —
// instead of only inside the footer's raw namespace groups.
//
// Derivation is field-name-driven, never plugin-named: the FIRST source
// namespace of the document that carries a present `description` provides
// the panel, and its `genres`, `score`, `kind`, `status`, `episodes`, and
// `aired_on`/`year` facts ride along from the SAME namespace — cohesion:
// the facts of the source that wrote the synopsis. A document with no
// description renders NOTHING (an empty panel is noise, not information);
// genres or facts alone never claim the panel.
//
// Values render verbatim (kind/status are the source's own vocabulary);
// aired_on renders as its year prefix. No interpretation, no fabrication.
export function Synopsis(props: { doc: ItemDocument }): ReactElement | null {
  const panel = synopsisOf(props.doc);
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

// SynopsisPanel — the derived panel: the description paragraph, the genre
// names, and the joined fact words (score ★ / kind / status / N ep / year).
interface SynopsisPanel {
  description: string;
  genres: string[];
  facts: string[];
}

// synopsisOf — the pure derivation (unit-tested below the component): the
// first description-bearing namespace wins; its facts join in a fixed,
// predictable order. null when no namespace carries a description.
export function synopsisOf(doc: ItemDocument): SynopsisPanel | null {
  for (const { namespace } of sourcesOf(doc)) {
    const record = namespace as Record<string, unknown>;
    const raw =
      typeof record.description === "string" ? record.description : "";
    const description = plainText(raw).trim();
    if (description === "") {
      continue;
    }
    const genres = Array.isArray(record.genres)
      ? record.genres.filter(
          (genre): genre is string => typeof genre === "string" && genre !== "",
        )
      : [];
    const facts: string[] = [];
    if (typeof record.score === "number") {
      facts.push(`★ ${record.score}`);
    } else if (typeof record.score === "string" && record.score !== "") {
      facts.push(`★ ${record.score}`);
    }
    if (typeof record.kind === "string" && record.kind !== "") {
      facts.push(record.kind);
    }
    if (typeof record.status === "string" && record.status !== "") {
      facts.push(record.status);
    }
    if (typeof record.episodes === "number") {
      facts.push(`${record.episodes} ep`);
    }
    const year = yearOf(record.aired_on) ?? yearOf(record.year);
    if (year !== null) {
      facts.push(String(year));
    }
    return { description, genres, facts };
  }
  return null;
}

// yearOf — the "YYYY" prefix of an aired_on date ("1998-02-20"); a bare
// number year passes through. Anything else yields null (never a guess).
function yearOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value > 0 ? value : null;
  }
  if (typeof value !== "string" || value.length < 4) {
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
