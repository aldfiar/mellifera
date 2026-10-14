// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";

import {
  ENDPOINTS,
  getSeries,
  getSeriesEpisodes,
  hasFrameGrabberThumb,
  hasOriginalFile,
  type ApiError,
  type ItemDTO,
  type LibraryDTO,
  type ProgressDTO,
  type SeriesDTO,
} from "@/lib/api";
import { getItem } from "@/lib/api";
import {
  useItemMedia,
  useItems,
  useLibraries,
  useLibrarySummary,
  useProgressList,
} from "@/lib/queries";
import type { ItemDocument } from "@/lib/document";
import { viewEntries } from "@/lib/document";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

// Home — the root route's collections surface (web-ui-phase-3 group 4):
//
//   1. the collections grid — one card per library (pastel type badge, name,
//      description, item count + updated stamp from the summary) with the
//      type chips as a client-side filter; zero-item collections render the
//      explicit "Not scanned yet" card state;
//   2. the Continue row — GET /progress records (newest-first, positive
//      positions) as Play cards deep-linking into /items/{id}, with the
//      item's frame-grabber thumb preview (authenticated fetch; no thumb fact
//      → the honest badge-only card), a percent-of-duration bar when the
//      item's ffprobe duration is known, and a real name: the SERVED
//      item `display_name` (display-naming — the server composes
//      `{serial title} · SxxEyy` and floors through `_view.title`), floored
//      client-side to viewTitle only when the served name is empty;
//   3. the Next up row — keyed on SERIES records (D-8): progress items map
//      through (library, parsed.series_relative_path) to the series row
//      (GET /series?library={id}, the collection page's shared cache), the
//      started tuple is the max (season, episode) across the series' progress
//      items, and the offered episode is the lowest strictly after it from
//      GET /series/{id}/episodes (one cached fetch per started series)
//      (episodeFacts/startedSeries/nextUpEntries below — the derivation's
//      pure core, unit-tested in Home.test.tsx). Card titles carry the
//      SERVED series `display_name`; the SxxEyy chip still composes from the
//      raw episode facts, which remain on the wire. Films never enter Next
//      up — it is an episode concept; films surface via Continue.
//
// No root folders and no enrich-lifecycle pills ever render here, and the
// surface never guesses: an episode whose series row does not resolve is
// OMITTED from Next up (honest fallback over a wrong suggestion). Play
// deep-links only — inline streaming is a deferred capability (design D3).

// Bounded first page the collection cards scan for a representative preview
// item (media-preview D8 — the card fetches the collection's first items; one
// small page per card, cached under the shared ["items", params] key space).
const CARD_PREVIEW_LIMIT = 12;

// Next up row cap — the row is a suggestion strip, not a queue dump.
const NEXT_UP_LIMIT = 12;

// TYPE_LABELS — human badge label per module_id (D6 keys). An unknown
// module_id renders verbatim rather than guessed.
const TYPE_LABELS: Record<string, string> = {
  serial: "Serials",
  tv: "Movies",
  image: "Photos",
  audio: "Audiobooks",
};

function typeLabel(moduleId: string): string {
  return TYPE_LABELS[moduleId] ?? moduleId;
}

// dotClass — mirrors the sidebar's pastel type dots (same module_id keys;
// same rationale as Collection's local copy: small accents, not a retheme).
function dotClass(moduleId: string): string {
  switch (moduleId) {
    case "serial":
      return "dot dot-serial";
    case "tv":
      return "dot dot-tv";
    case "image":
      return "dot dot-image";
    default:
      return "dot dot-audio";
  }
}

// formatDate — the stored RFC3339 stamp's date part, verbatim (no timezone
// re-bucketing); "" stamps render as "".
function formatDate(rfc3339: string): string {
  return rfc3339 ? rfc3339.slice(0, 10) : "";
}

// formatPosition — whole seconds as "H:MM:SS" / "MM:SS". Display formatting
// only: the stored position is rendered, never rewritten.
export function formatPosition(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0
    ? `${String(h)}:${String(m).padStart(2, "0")}:${ss}`
    : `${String(m).padStart(2, "0")}:${ss}`;
}

// ---- Next up derivation (pure core) ----------------------------------------

// EpisodeFacts — the parsed episode identity the Next up derivation runs on
// (D-8): the (season, episode) pair out of the source namespaces plus the
// series anchor parsed.series_relative_path the serial-scanner stamps — the
// series row is matched on the PATH fact, never on a title (serial episodes
// carry no title fact).
export interface EpisodeFacts {
  libraryId: number;
  seriesPath: string;
  season: number;
  episode: number;
}

// numberField — an integer field out of a dynamic source namespace, or null.
function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

// stringField — a non-empty string field out of a dynamic namespace, or null
// (same contract as Collection's local copy).
function stringField(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// episodeFacts — the item's (library, series path, season, episode) facts, or
// null when the document carries no parsed.series_relative_path anchor or no
// parseable episode numbers (the caller omits it rather than guessing).
export function episodeFacts(item: ItemDTO): EpisodeFacts | null {
  const parsed = item.document.parsed;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const seriesPath = stringField(
    (parsed as Record<string, unknown>).series_relative_path,
  );
  if (seriesPath === null) {
    return null;
  }
  const sources = item.document.sources;
  if (!sources || typeof sources !== "object") {
    return null;
  }
  for (const namespace of Object.values(sources)) {
    if (!namespace || typeof namespace !== "object") {
      continue;
    }
    const season = numberField(namespace.season);
    const episode = numberField(namespace.episode);
    if (season !== null && episode !== null) {
      return { libraryId: item.library_id, seriesPath, season, episode };
    }
  }
  return null;
}

// seriesKey — the (library, series path) grouping key.
function seriesKey(facts: { libraryId: number; seriesPath: string }): string {
  return `${String(facts.libraryId)}|${facts.seriesPath}`;
}

// tupleGt — (season, episode) ordering: a later season wins; within a season,
// the later episode.
function tupleGt(a: EpisodeFacts, b: EpisodeFacts): boolean {
  return a.season > b.season || (a.season === b.season && a.episode > b.episode);
}

// StartedSeries — one touched series: the HIGHEST started (season, episode)
// across its progress items (recency order comes from the progress list,
// which the server returns newest-first).
export interface StartedSeries {
  libraryId: number;
  seriesPath: string;
  season: number;
  episode: number;
}

// startedSeries — groups the progress list into touched series. tv-module
// items (films) never enter — Next up is an episode concept; records whose
// item has no parseable episode facts are skipped (the Next up fallback).
export function startedSeries(
  progress: ProgressDTO[],
  itemById: Map<string, ItemDTO>,
): StartedSeries[] {
  const byKey = new Map<string, StartedSeries>();
  for (const record of progress) {
    const item = itemById.get(record.item_id);
    if (!item || item.module_id === "tv") {
      continue;
    }
    const facts = episodeFacts(item);
    if (!facts) {
      continue;
    }
    const key = seriesKey(facts);
    const existing = byKey.get(key);
    if (!existing || tupleGt(facts, existing)) {
      byKey.set(key, facts);
    }
  }
  return [...byKey.values()];
}

// matchSeries — the series row for one episode's series anchor: the row whose
// relative_path equals parsed.series_relative_path. Deleted rows (the
// janitor's tombstones) are not a browse surface and never match. Null when
// no row resolves — the caller omits the series rather than guessing.
// Exported pure for tests.
export function matchSeries(
  rows: SeriesDTO[],
  seriesPath: string,
): SeriesDTO | null {
  for (const sr of rows) {
    if (sr.status !== "deleted" && sr.relative_path === seriesPath) {
      return sr;
    }
  }
  return null;
}

// NextUpEntry — one Play-able suggestion: the episode item to deep-link into,
// the series record that owns it, its SERVED display title and the "S02E06"
// label composed from the episode's raw facts (facts stay on the wire; only
// the naming moved server-side).
export interface NextUpEntry {
  item: ItemDTO;
  seriesId: string;
  title: string;
  label: string;
}

// nextUpEntries — per started series (progress recency order), the
// lowest-numbered episode strictly AFTER the highest started one, taken from
// the series record's episode list (GET /series/{id}/episodes — one cached
// fetch per started series). A series whose row did not resolve (the
// episode-without-series fallback) or that has no later episode — none
// exists, or its items carry no parseable facts — is omitted.
export function nextUpEntries(
  started: StartedSeries[],
  seriesByKey: Map<string, SeriesDTO>,
  episodesBySeriesId: Map<string, ItemDTO[]>,
): NextUpEntry[] {
  const out: NextUpEntry[] = [];
  for (const s of started) {
    const series = seriesByKey.get(seriesKey(s));
    if (!series) {
      continue;
    }
    const episodes = episodesBySeriesId.get(series.id);
    if (!episodes) {
      continue;
    }
    let best: EpisodeFacts | null = null;
    let bestItem: ItemDTO | null = null;
    for (const item of episodes) {
      const facts = episodeFacts(item);
      if (!facts || !tupleGt(facts, s)) {
        continue;
      }
      if (!best || tupleGt(best, facts)) {
        best = facts;
        bestItem = item;
      }
    }
    if (best && bestItem) {
      out.push({
        item: bestItem,
        seriesId: series.id,
        // The SERVED series name VERBATIM (display-naming) — a floor-empty ""
        // renders empty, never a client-side file-name fallback; the `?? ""`
        // only normalizes the optional TS field's absence.
        title: series.display_name ?? "",
        label: `S${String(best.season).padStart(2, "0")}E${String(best.episode).padStart(2, "0")}`,
      });
    }
  }
  return out;
}

// durationSeconds — the item's total whole-second duration, read from the
// verbatim ffprobe blob (ffprobe writes format.duration as a decimal-seconds
// STRING). Anything missing/unparseable → null: the Continue card then shows
// the position without a percent label or filled bar.
export function durationSeconds(doc: ItemDocument): number | null {
  const ffprobe = doc.ffprobe;
  if (!ffprobe || typeof ffprobe !== "object") {
    return null;
  }
  const format = (ffprobe as { format?: unknown }).format;
  if (!format || typeof format !== "object") {
    return null;
  }
  const raw = (format as { duration?: unknown }).duration;
  if (typeof raw !== "string" && typeof raw !== "number") {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// viewTitle — the item's display title: `_view.title.value` verbatim (same
// accessor contract as the collection page's local copy).
function viewTitle(doc: ItemDocument): string {
  const title = viewEntries(doc).find((e) => e.fieldPath === "title");
  const value = title?.entry.value;
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value); // lossless primitive stringify (INV-no-rounding)
  }
  return "—";
}

// representativeItem — the collection card's preview candidate (media-preview
// D8): the first item on the fetched page whose media can actually render in
// an <img> — a frame-grabber thumb (thumb variant), or an image original
// (parsed.absolute_path). A video original cannot decode in an <img>, so a
// movie without a thumb fact is NOT a resolvable preview — the card keeps its
// badge-only layout. Null when the page carries no resolvable item. Exported
// pure for tests.
export function representativeItem(items: ItemDTO[]): ItemDTO | null {
  for (const it of items) {
    if (
      hasFrameGrabberThumb(it.document) ||
      (it.media_type === "image" && hasOriginalFile(it.document))
    ) {
      return it;
    }
  }
  return null;
}

// CardPreview — the collection card's preview area above the badge row. It
// renders only once the representative item's media has ACTUALLY loaded
// through the authenticated fetch: while the media loads, when it fails, or
// when no representative exists, the card keeps its existing badge-only
// layout — never a broken-image state (spec "Collection card previews").
function CardPreview(props: { src: string | null }): ReactElement | null {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [props.src]);

  if (props.src === null || failed) {
    return null;
  }
  return (
    <span className="block aspect-video w-full overflow-hidden rounded-md bg-muted">
      <img
        src={props.src}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

// ---- Page ------------------------------------------------------------------

export default function Home(): ReactElement {
  const libraries = useLibraries();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  if (libraries.isLoading) {
    return <LoadingState label="Loading collections…" />;
  }
  if (libraries.error) {
    return (
      <ErrorState error={libraries.error as ApiError} onRetry={libraries.refetch} />
    );
  }

  const libs: LibraryDTO[] = libraries.data?.items ?? [];
  if (libs.length === 0) {
    return <EmptyState message="No collections yet — add one in Admin." />;
  }

  const types = [...new Set(libs.map((l) => l.module_id))];
  const visible = typeFilter
    ? libs.filter((l) => l.module_id === typeFilter)
    : libs;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
      <section aria-label="Collections" className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          <TypeChip
            label="All"
            active={typeFilter === null}
            onClick={() => setTypeFilter(null)}
          />
          {types.map((t) => (
            <TypeChip
              key={t}
              label={typeLabel(t)}
              dot={dotClass(t)}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            />
          ))}
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((lib) => (
            <CollectionCard key={lib.id} lib={lib} />
          ))}
        </ul>
      </section>

      <ContinueRow libraries={libs} />
      <NextUpRow />
    </main>
  );
}

// TypeChip — one client-side filter chip (All + one per type present). The
// pastel dot rides along as a small accent; selection uses the primary token,
// never a pastel fill (the palette decision stays open).
function TypeChip(props: {
  label: string;
  dot?: string;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={cn("chip", props.active && "chip-active")}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {props.dot ? <span className={props.dot} aria-hidden="true" /> : null}
      {props.label}
    </button>
  );
}

// CollectionCard — one card per collection: pastel type badge, name,
// description, item count + updated stamp from the summary (async like the
// sidebar's counts — the card is navigable before the summary lands). Above
// the badge row sits the media preview (media-preview D8): ONE representative
// item picked from the collection's first page — its thumb variant when the
// document carries the frame-grabber fact, else its original — loaded through
// the authenticated media fetch; the area appears only once the image
// actually resolves. Zero items → the explicit "Not scanned yet" card state
// with NO preview area; no resolvable media → the badge-only card. A missing
// description renders the card without the line. Never a root folder, never a
// pill (D5).
function CollectionCard(props: { lib: LibraryDTO }): ReactElement {
  const { lib } = props;
  const summary = useLibrarySummary(lib.id);
  const updated = summary.data ? formatDate(summary.data.updated_at) : "";
  const isEmpty = summary.data?.items === 0;

  const page = useItems({ library: lib.id, limit: CARD_PREVIEW_LIMIT, offset: 0 });
  const representative = useMemo(
    () => representativeItem(page.data?.items ?? []),
    [page.data],
  );
  const preview = useItemMedia(
    representative !== null
      ? ENDPOINTS.itemMedia(
          representative.id,
          hasFrameGrabberThumb(representative.document) ? "thumb" : undefined,
        )
      : null,
  );

  return (
    <li>
      <Link
        to={`/collections/${lib.id}`}
        className="flex h-full flex-col gap-2 rounded-md border p-4 hover:bg-accent"
      >
        {representative !== null ? <CardPreview src={preview} /> : null}
        <span className="flex items-center gap-2">
          <span className={dotClass(lib.module_id)} aria-hidden="true" />
          <span className="chip">{typeLabel(lib.module_id)}</span>
        </span>
        <span className="text-sm font-semibold">{lib.display_name}</span>
        {lib.description ? (
          <span className="text-xs text-muted-foreground">{lib.description}</span>
        ) : null}
        <span className="mt-auto text-xs tabular-nums text-muted-foreground">
          {isEmpty
            ? "Not scanned yet"
            : summary.data
              ? `${String(summary.data.items)} items${updated ? ` · updated ${updated}` : ""}`
              : ""}
        </span>
      </Link>
    </li>
  );
}

// ---- Continue ---------------------------------------------------------------

// ROW_EMPTY_MESSAGE — the SHARED Continue/Next up empty state: an empty
// progress list means both rows have nothing to show.
const ROW_EMPTY_MESSAGE =
  "Nothing in progress yet — open an item and it will show up here.";

function RowEmpty(): ReactElement {
  return <EmptyState message={ROW_EMPTY_MESSAGE} />;
}

// useProgressDocs — the item documents behind a progress list, fanned out on
// the shared ["item", id] cache (the detail page's entries), so each
// document is fetched once no matter how many rows consume it. Returns null
// while any document is still in flight — rows render a loading state, not
// partial derivations; documents that fail (e.g. an item deleted since) are
// simply absent from the map.
function useProgressDocs(records: ProgressDTO[]): Map<string, ItemDTO> | null {
  const docs = useQueries({
    queries: records.map((r) => ({
      queryKey: ["item", r.item_id],
      queryFn: () => getItem(r.item_id),
    })),
  });

  if (docs.some((d) => d.isLoading)) {
    return null;
  }
  const map = new Map<string, ItemDTO>();
  docs.forEach((d, i) => {
    const res = d.data;
    if (res) {
      map.set(records[i]!.item_id, res.item);
    }
  });
  return map;
}

// ContinueRow — GET /progress (newest-first, positive positions) as one card
// per in-progress item: the item's frame-grabber thumb preview when the
// document carries that fact (authenticated fetch — absent fact → the honest
// badge-only card), the SERVED display_name (display-naming — the server
// composes serial-episode names), percent-of-duration label + bar when the
// item's ffprobe duration is known (position label always), source
// collection, updated stamp, and Play deep-linking into the item detail.
function ContinueRow(props: { libraries: LibraryDTO[] }): ReactElement {
  const progress = useProgressList();
  const records: ProgressDTO[] = progress.data?.items ?? [];
  const docs = useProgressDocs(records);

  const cards = useMemo(() => {
    if (!docs) {
      return [];
    }
    return records
      .filter((r) => docs.has(r.item_id))
      .map((r) => ({ record: r, item: docs.get(r.item_id)! }));
  }, [records, docs]);

  if (progress.isLoading) {
    return <LoadingState label="Loading progress…" />;
  }
  if (progress.error) {
    return (
      <ErrorState error={progress.error as ApiError} onRetry={progress.refetch} />
    );
  }
  if (records.length === 0) {
    return <RowEmpty />;
  }
  if (!docs) {
    return <LoadingState label="Loading items…" />;
  }
  if (cards.length === 0) {
    return <RowEmpty />;
  }

  return (
    <section aria-label="Continue" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Continue</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <ContinueCard
            key={c.record.item_id}
            record={c.record}
            item={c.item}
            libraryName={
              props.libraries.find((l) => l.id === c.item.library_id)
                ?.display_name ?? ""
            }
          />
        ))}
      </ul>
    </section>
  );
}

// ContinueCard — one resume card: the thumb preview above the name (only when
// the document carries the frame-grabber fact — an absent fact keeps the
// badge-only card, never a broken image), the SERVED display_name (the
// server-composed episode name or the film's name; a floor-empty "" falls
// back to the document's `_view` title), and the bar only when the duration
// is known: an unfilled track would read as "not started", which would be a
// lie.
function ContinueCard(props: {
  record: ProgressDTO;
  item: ItemDTO;
  libraryName: string;
}): ReactElement {
  const { record, item } = props;
  const title = item.display_name || viewTitle(item.document);
  const duration = durationSeconds(item.document);
  const percent =
    duration !== null
      ? Math.min(100, Math.round((record.position_seconds / duration) * 100))
      : null;
  const hasThumb = hasFrameGrabberThumb(item.document);
  const thumb = useItemMedia(
    hasThumb ? ENDPOINTS.itemMedia(item.id, "thumb") : null,
  );

  return (
    <li>
      <Link
        to={`/items/${item.id}`}
        aria-label={`Play ${title}`}
        className="flex h-full flex-col gap-2 rounded-md border p-3 hover:bg-accent"
      >
        {hasThumb ? <CardPreview src={thumb} /> : null}
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {percent !== null ? `${String(percent)}% · ` : ""}
          {formatPosition(record.position_seconds)}
          {props.libraryName ? ` · ${props.libraryName}` : ""}
        </span>
        {percent !== null ? (
          <span
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${String(percent)}% watched`}
          >
            <span
              className="block h-full bg-primary"
              style={{ width: `${String(percent)}%` }}
            />
          </span>
        ) : null}
        <span className="mt-auto flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {formatDate(record.updated_at)}
          </span>
          <span className="chip">Play</span>
        </span>
      </Link>
    </li>
  );
}

// ---- Next up ----------------------------------------------------------------

// NextUpRow — keyed on SERIES records (D-8): progress items map through
// (library, parsed.series_relative_path) to the series row (one
// GET /series?library={id} per touched library, the collection page's shared
// ["series", id] cache), and per started series with a resolved row the
// episode list loads once (GET /series/{id}/episodes, the shared
// ["series-episodes", id] cache). The offered episode is the lowest
// (season, episode) strictly after the highest started one. A series whose
// row did not resolve — the episode-without-series fallback — or with no
// later episode is omitted; with nothing derivable the row renders its empty
// state (honest, never a guess). Films never enter (startedSeries skips the
// tv module).
function NextUpRow(): ReactElement {
  const progress = useProgressList();
  const records = useMemo(() => progress.data?.items ?? [], [progress.data]);
  const docs = useProgressDocs(records);

  const started = useMemo(
    () => (docs ? startedSeries(records, docs) : []),
    [records, docs],
  );

  const libraryIds = [...new Set(started.map((s) => s.libraryId))];
  const seriesLists = useQueries({
    queries: libraryIds.map((id) => ({
      queryKey: ["series", id],
      queryFn: () => getSeries(id),
    })),
  });

  const seriesByKey = new Map<string, SeriesDTO>();
  for (const s of started) {
    const idx = libraryIds.indexOf(s.libraryId);
    const rows = seriesLists[idx]?.data?.items ?? [];
    const series = matchSeries(rows, s.seriesPath);
    if (series !== null) {
      seriesByKey.set(seriesKey(s), series);
    }
  }

  const resolved = started
    .map((s) => seriesByKey.get(seriesKey(s)))
    .filter((s): s is SeriesDTO => s !== undefined);
  const episodePages = useQueries({
    queries: resolved.map((series) => ({
      queryKey: ["series-episodes", series.id],
      queryFn: () => getSeriesEpisodes(series.id),
    })),
  });

  const episodesBySeriesId = new Map<string, ItemDTO[]>();
  resolved.forEach((series, i) => {
    const data = episodePages[i]?.data;
    if (data) {
      episodesBySeriesId.set(series.id, data.items);
    }
  });

  const nextUp = docs
    ? nextUpEntries(started, seriesByKey, episodesBySeriesId)
    : [];

  if (progress.isLoading) {
    return <LoadingState label="Loading progress…" />;
  }
  if (progress.error) {
    return (
      <ErrorState error={progress.error as ApiError} onRetry={progress.refetch} />
    );
  }
  if (records.length === 0) {
    return <RowEmpty />;
  }
  if (docs === null) {
    return <LoadingState label="Loading items…" />;
  }
  if (seriesLists.some((q) => q.isLoading)) {
    return <LoadingState label="Loading series…" />;
  }
  if (episodePages.some((q) => q.isLoading)) {
    return <LoadingState label="Loading episodes…" />;
  }
  if (nextUp.length === 0) {
    return <EmptyState message="No upcoming episodes found." />;
  }

  return (
    <section aria-label="Next up" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Next up</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {nextUp.slice(0, NEXT_UP_LIMIT).map((entry) => (
          <NextUpCard key={entry.item.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

// NextUpCard — one suggestion: the series' display title, the SxxEyy chip and
// the episode's frame-grabber thumb (absent fact → no preview area — the same
// honest fallback as Continue). Play deep-links into the episode detail
// (inline streaming stays out of scope, D3).
function NextUpCard(props: { entry: NextUpEntry }): ReactElement {
  const { entry } = props;
  const hasThumb = hasFrameGrabberThumb(entry.item.document);
  const thumb = useItemMedia(
    hasThumb ? ENDPOINTS.itemMedia(entry.item.id, "thumb") : null,
  );

  return (
    <li>
      <Link
        to={`/items/${entry.item.id}`}
        aria-label={`Play ${entry.title} ${entry.label}`}
        className="flex h-full flex-col gap-2 rounded-md border p-3 hover:bg-accent"
      >
        {hasThumb ? <CardPreview src={thumb} /> : null}
        <span className="text-sm font-medium">{entry.title}</span>
        <span className="flex gap-1">
          <span className="chip">{entry.label}</span>
          <span className="chip">not started</span>
        </span>
        <span className="mt-auto flex items-center justify-end">
          <span className="chip">Play</span>
        </span>
      </Link>
    </li>
  );
}
