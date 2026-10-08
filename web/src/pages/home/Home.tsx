// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";

import {
  ENDPOINTS,
  hasFrameGrabberThumb,
  hasOriginalFile,
  type ApiError,
  type ItemDTO,
  type LibraryDTO,
  type ProgressDTO,
} from "@/lib/api";
import { getItem, listItems } from "@/lib/api";
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
//      positions) as Play cards deep-linking into /items/{id}, with a
//      percent-of-duration bar when the item's ffprobe duration is known;
//   3. the Next up row — per series touched by Continue, the lowest-numbered
//      episode AFTER the highest started one, derived client-side from the
//      items' parsed episode facts (episodeFacts/startedSeries/nextUpEntries
//      below — the derivation's pure core, unit-tested in Home.test.tsx).
//
// No root folders and no enrich-lifecycle pills ever render here, and the
// surface never guesses: an item document without parseable episode facts is
// OMITTED from Next up (honest empty state over a wrong suggestion). Play
// deep-links only — inline streaming is a deferred capability (design D3).

// Server pagination ceiling for the per-collection Next up scan
// (handlers.go parsePagination maxLimit) — one bounded page per touched
// collection; a series whose next episode falls beyond the page is omitted.
const SCAN_LIMIT = 200;

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

// EpisodeFacts — the parsed series identity the Next up derivation runs on.
// tv-parser stamps numeric `season`/`episode` plus the series `title` into
// the document's sources namespaces; the collection grouping key is
// (library, title).
export interface EpisodeFacts {
  libraryId: number;
  seriesKey: string;
  season: number;
  episode: number;
}

// numberField — an integer field out of a dynamic source namespace, or null.
function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

// episodeFacts — the item's (library, series, season, episode) facts, or null
// when the document carries no parseable episode facts (the caller omits the
// series from Next up rather than guessing).
export function episodeFacts(item: ItemDTO): EpisodeFacts | null {
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
    const title = namespace.title;
    if (
      season !== null &&
      episode !== null &&
      typeof title === "string" &&
      title !== ""
    ) {
      return { libraryId: item.library_id, seriesKey: title, season, episode };
    }
  }
  return null;
}

// tupleGt — (season, episode) ordering: a later season wins; within a season,
// the later episode.
function tupleGt(a: EpisodeFacts, b: EpisodeFacts): boolean {
  return a.season > b.season || (a.season === b.season && a.episode > b.episode);
}

// StartedSeries — one touched series: the HIGHEST started (season, episode)
// plus its newest progress record (recency order comes from the progress
// list, which the server returns newest-first).
export interface StartedSeries {
  libraryId: number;
  seriesKey: string;
  season: number;
  episode: number;
}

// startedSeries — groups the progress list into touched series. Records whose
// item has no parseable episode facts are skipped (the Next up fallback).
export function startedSeries(
  progress: ProgressDTO[],
  itemById: Map<string, ItemDTO>,
): StartedSeries[] {
  const byKey = new Map<string, StartedSeries>();
  for (const record of progress) {
    const item = itemById.get(record.item_id);
    if (!item) {
      continue;
    }
    const facts = episodeFacts(item);
    if (!facts) {
      continue;
    }
    const key = `${String(facts.libraryId)}|${facts.seriesKey}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, facts);
    } else if (tupleGt(facts, existing)) {
      byKey.set(key, facts);
    }
  }
  return [...byKey.values()];
}

// NextUpEntry — one Play-able suggestion: the collection item to deep-link
// into plus its display label ("S02E06").
export interface NextUpEntry {
  item: ItemDTO;
  seriesKey: string;
  label: string;
}

// episodeLabel — zero-padded "S02E06" display form.
function episodeLabel(facts: EpisodeFacts): string {
  return `S${String(facts.season).padStart(2, "0")}E${String(facts.episode).padStart(2, "0")}`;
}

// nextUpEntries — per touched series (progress recency order), the
// lowest-numbered episode strictly AFTER the highest started one, found in
// the touched collections' scanned items. A series with no such episode —
// none exists, or its items carry no parseable facts — is omitted.
export function nextUpEntries(
  started: StartedSeries[],
  collectionItems: ItemDTO[],
): NextUpEntry[] {
  const out: NextUpEntry[] = [];
  for (const s of started) {
    let best: EpisodeFacts | null = null;
    let bestItem: ItemDTO | null = null;
    for (const item of collectionItems) {
      if (item.library_id !== s.libraryId) {
        continue;
      }
      const facts = episodeFacts(item);
      if (!facts || facts.seriesKey !== s.seriesKey || !tupleGt(facts, s)) {
        continue;
      }
      if (!best || tupleGt(best, facts)) {
        best = facts;
        bestItem = item;
      }
    }
    if (best && bestItem) {
      out.push({ item: bestItem, seriesKey: s.seriesKey, label: episodeLabel(best) });
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
// per in-progress item: title, percent-of-duration label + bar when the
// item's ffprobe duration is known (position label always), source
// collection, updated stamp, and Play deep-linking into the item detail
// (real playback is out of scope — design D3).
function ContinueRow(props: { libraries: LibraryDTO[] }): ReactElement {
  const progress = useProgressList();
  const records: ProgressDTO[] = progress.data?.items ?? [];
  const docs = useProgressDocs(records);

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

  const cards = records.filter((r) => docs.has(r.item_id));
  if (cards.length === 0) {
    return <RowEmpty />;
  }

  return (
    <section aria-label="Continue" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Continue</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((r) => (
          <ContinueCard
            key={r.item_id}
            record={r}
            item={docs.get(r.item_id)!}
            libraryName={
              props.libraries.find((l) => l.id === docs.get(r.item_id)!.library_id)
                ?.display_name ?? ""
            }
          />
        ))}
      </ul>
    </section>
  );
}

// ContinueCard — one resume card. The bar renders only when the duration is
// known: an unfilled track would read as "not started", which would be a lie.
function ContinueCard(props: {
  record: ProgressDTO;
  item: ItemDTO;
  libraryName: string;
}): ReactElement {
  const { record, item } = props;
  const duration = durationSeconds(item.document);
  const percent =
    duration !== null
      ? Math.min(100, Math.round((record.position_seconds / duration) * 100))
      : null;

  return (
    <li>
      <Link
        to={`/items/${item.id}`}
        aria-label={`Play ${viewTitle(item.document)}`}
        className="flex h-full flex-col gap-2 rounded-md border p-3 hover:bg-accent"
      >
        <span className="text-sm font-medium">{viewTitle(item.document)}</span>
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

// NextUpRow — per series touched by Continue, the lowest-numbered episode
// strictly after the highest started one, derived client-side from the
// touched collections' item facts: one bounded scan (SCAN_LIMIT, the server
// pagination ceiling) per touched collection. A series with no parseable
// facts or no later episode is omitted; with no derivable episodes at all
// the row renders its empty state (honest, never a guess).
function NextUpRow(): ReactElement {
  const progress = useProgressList();
  const records = useMemo(() => progress.data?.items ?? [], [progress.data]);
  const docs = useProgressDocs(records);

  const started = useMemo(
    () => (docs ? startedSeries(records, docs) : []),
    [records, docs],
  );
  const libraryIds = [...new Set(started.map((s) => s.libraryId))];

  const scans = useQueries({
    queries: libraryIds.map((id) => ({
      queryKey: ["items", { library: id, limit: SCAN_LIMIT, offset: 0 }],
      queryFn: () => listItems({ library: id, limit: SCAN_LIMIT, offset: 0 }),
    })),
  });

  const scanItems: ItemDTO[] = [];
  for (const scan of scans) {
    if (scan.data) {
      scanItems.push(...scan.data.items);
    }
  }
  const nextUp = docs ? nextUpEntries(started, scanItems) : [];

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
  if (docs === null || scans.some((s) => s.isLoading)) {
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
          <li key={entry.item.id}>
            <Link
              to={`/items/${entry.item.id}`}
              aria-label={`Play ${entry.seriesKey} ${entry.label}`}
              className="flex h-full flex-col gap-2 rounded-md border p-3 hover:bg-accent"
            >
              <span className="text-sm font-medium">{entry.seriesKey}</span>
              <span className="flex gap-1">
                <span className="chip">{entry.label}</span>
                <span className="chip">not started</span>
              </span>
              <span className="mt-auto flex items-center justify-end">
                <span className="chip">Play</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
