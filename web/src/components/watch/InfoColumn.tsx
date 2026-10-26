// SPDX-License-Identifier: Apache-2.0
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";

import type { ItemDTO, MetadataCastEntry } from "@/lib/api";
import { getSeries, isServedArtPath } from "@/lib/api";
import { episodeFacts } from "@/lib/nextup";
import { useArtworkObjectUrl } from "@/lib/queries";
import { PosterFrame } from "@/components/Artwork";
import { Synopsis } from "@/components/metadata/Synopsis";

// InfoColumn — the watch view's info column (watch-flow-polish 3.2): the
// item page's identity-column idea grown into the watch lane, mounted RIGHT
// of the player. Blocks, in order:
//   heading    the SxxEyy eyebrow — derived from the item's parsed
//              season/episode facts exactly as the Next up cards derive
//              theirs (episodeFacts, lib/nextup: structural, no media-type
//              literals) — with the served episode block `title`; no title
//              → just the eyebrow; no parseable facts and no episode block
//              (a film) → the item's SERVED display name heads the column.
//   «Серия»    the served episode block `description`.
//   «В ролях»  the served `cast[]` entries verbatim — the name, its
//              optional role only when present, and an image only when
//              `photo_url` is present (the served proxy form rides the
//              authenticated art channel; absent → the generated pastel
//              initial the codebase already has — PosterFrame's fallback).
//   About      the shipped Synopsis panel as standing context: the
//              episode's series row's served about block — resolved through
//              the SHARED series cache (keyed ["series", library], the same
//              entry the identity block's Rename-series reads; TanStack
//              dedupes the two consumers into one fetch), matched BY PATH
//              on the parsed series anchor — else the item's own block.
//
// FIELD-DRIVEN ONLY: every block reads the SERVED convention projection
// (`ElementMetadata`: metadata.about / metadata.cast / metadata.episode) on
// the item and series documents. A field absent → block absent — no
// placeholder, no empty frame; a column with nothing to say renders nothing
// at all. The column never fabricates a value and never names a source:
// cast arrives from whatever conforming provider wrote the block (shikimori
// characters today, TMDB with Layer 4), and the UI renders exactly what the
// projection carries.

// presentText — a non-empty served string, else undefined ("" is absence —
// the same floor the identity block's `present` applies).
function presentText(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

// seriesAnchorOf — the episode's series fact anchor: parsed.series_relative_path.
// null when the document carries no anchor — the About source floors to the
// item's own block and a series row is never guessed.
function seriesAnchorOf(item: ItemDTO): string | null {
  const parsed = item.document.parsed;
  if (parsed === undefined || parsed === null || typeof parsed !== "object") {
    return null;
  }
  const value = (parsed as Record<string, unknown>).series_relative_path;
  return typeof value === "string" && value !== "" ? value : null;
}

export default function InfoColumn(props: {
  item: ItemDTO;
}): ReactElement | null {
  const { item } = props;

  // The SxxEyy eyebrow — the parsed (season, episode) facts, the Next up
  // cards' own derivation; null for a film (no anchor / no parseable
  // numbers), which is the display-name heading's cue.
  const facts = episodeFacts(item);
  const eyebrow =
    facts === null
      ? null
      : `S${String(facts.season).padStart(2, "0")}E${String(facts.episode).padStart(2, "0")}`;

  // The heading text — the served episode block title when present;
  // otherwise (no parseable facts — the film case) the item's SERVED
  // display name. No naming source → no heading text, never a fabricated
  // or file-derived one.
  const titleText = presentText(item.metadata?.episode?.title);
  const headingText =
    titleText ??
    (eyebrow === null ? presentText(item.display_name) : undefined);

  // «Серия» — the served episode block description; absent field → absent
  // block.
  const description = presentText(item.metadata?.episode?.description);

  // «В ролях» — the served cast entries; absent or empty cast → no row.
  const cast = item.metadata?.cast;

  // The About source: the series row through the shared series cache,
  // matched BY PATH on the parsed anchor; unresolved → the item's own
  // served block; neither → no panel (Synopsis renders nothing).
  const anchor = seriesAnchorOf(item);
  const seriesList = useQuery({
    queryKey: ["series", item.library_id],
    queryFn: () => getSeries(item.library_id),
    enabled: anchor !== null,
    retry: 0,
  });
  const series =
    anchor !== null
      ? ((seriesList.data?.items ?? []).find(
          (s) => s.relative_path === anchor,
        ) ?? null)
      : null;
  const about = series !== null ? series.metadata?.about : item.metadata?.about;

  // Nothing to say → no column at all (no empty frame in the watch lane).
  if (
    eyebrow === null &&
    headingText === undefined &&
    description === undefined &&
    (cast === undefined || cast.length === 0) &&
    about === undefined
  ) {
    return null;
  }

  return (
    <section aria-label="Watch info" className="flex min-w-0 flex-col gap-4">
      {eyebrow !== null || headingText !== undefined ? (
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow !== null ? (
            <p className="font-mono text-sm text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          {headingText !== undefined ? (
            <h2 className="break-words text-lg font-semibold leading-snug">
              {headingText}
            </h2>
          ) : null}
        </div>
      ) : null}

      {description !== undefined ? (
        <section className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-semibold">Серия</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </section>
      ) : null}

      {cast !== undefined && cast.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h3 className="text-sm font-semibold">В ролях</h3>
          <ul className="flex min-w-0 flex-col gap-2">
            {cast.map((entry, index) => (
              <CastRow key={`${String(index)}-${entry.name}`} entry={entry} />
            ))}
          </ul>
        </section>
      ) : null}

      <Synopsis about={about} />
    </section>
  );
}

// CastRow — one «В ролях» entry, verbatim: the name, its optional role only
// when present, and an image only when `photo_url` is present — and only in
// its SERVED proxy form (isServedArtPath, the identity lead image's guard:
// a raw remote URL never rides the authenticated byte channel). Absent
// photo → PosterFrame's generated fallback: the name's first grapheme on a
// pastel gradient — the avatar primitive the codebase already has, never a
// broken-image frame.
function CastRow(props: { entry: MetadataCastEntry }): ReactElement {
  const photo = isServedArtPath(props.entry.photo_url)
    ? props.entry.photo_url
    : null;
  const src = useArtworkObjectUrl(photo);
  const role = presentText(props.entry.role);
  return (
    <li className="flex min-w-0 items-center gap-3">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
        <PosterFrame
          src={src}
          name={props.entry.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium leading-tight">
          {props.entry.name}
        </span>
        {role !== undefined ? (
          <span className="text-xs text-muted-foreground">{role}</span>
        ) : null}
      </div>
    </li>
  );
}
