// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  ENDPOINTS,
  deleteItemTitle,
  deleteSeriesTitle,
  hasFrameGrabberThumb,
  hasOriginalFile,
  putProgress,
  setItemTitle,
  setSeriesTitle,
  type ApiError,
  type ItemDTO,
  type LibraryDTO,
  type ListItemsParams,
  type ProgressDTO,
  type SeriesDTO,
  type TitleOverrideDTO,
} from "@/lib/api";
import {
  useItemMedia,
  useItems,
  useLibraries,
  useLibraryFolders,
  useLibrarySummary,
  useSeries,
  useSeriesEpisodes,
} from "@/lib/queries";
import type { ItemDocument } from "@/lib/document";
import { cn } from "@/lib/utils";
import { formatPosition } from "@/pages/home/Home";
import type { BrowseHandoff } from "@/pages/browse/ItemDetail";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

// Collection — the per-collection page at /collections/:id (web-ui-phase-3
// group 5, boxes 5.1–5.3). The header comes from GET /api/v1/libraries +
// GET /api/v1/libraries/{id}/summary: name, pastel type badge, description,
// item count, updated stamp — never a root path, never a lifecycle pill (D5).
//
// The body is keyed by the library's module_id (D6):
//   tv     → MoviesBody: paginated parsed-chip file cards (box 5.2)
//   image  → PhotosBody: subfolder chips from the folders endpoint over a
//            masonry grid with capture-date footers (box 5.3)
//   serial → SerialsBody: one poster card per series from
//            GET /api/v1/series?library={id}; a picked series navigates to
//            its episode flow via the ?series=<ser_id> deep-linkable query
//            state (box 5.4)
//
// Metadata fidelity: every rendered value is read verbatim out of the served
// fields (display_name) or the item document's source namespaces — a fact
// that is absent is omitted, never guessed (INV-no-rounding, arch §3.4).
//
// INV-no-filenames: raw filenames never render on this page — the title is
// the served display_name (floored to the extension-less stem when it is
// empty or IS the filename), and the filename itself lives only in the item
// detail's Technical details (ui-management design §1).

const PAGE_SIZE = 50;

// EXT_RE — a filename extension: 2–4 alphanumerics anchored at the end. The
// bound is what keeps "Part.2"-style suffixes alive (a single-char tail never
// matches); only a real extension strips.
const EXT_RE = /\.[A-Za-z0-9]{2,4}$/;

// lastSegment — a relative path's final segment (the filename for file rows,
// the directory name for directory-backed series rows).
function lastSegment(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

// pathStem — the extension-less final segment: the title floor for
// unidentified rows.
function pathStem(relativePath: string): string {
  return lastSegment(relativePath).replace(EXT_RE, "");
}

// itemTitle — an item card's title: the SERVED display_name (display-naming —
// the chain strictly dominates the old `_view`-only read), floored when it is
// empty or IS the filename to the extension-less stem. The `unidentified`
// flag marks the floor so menu-bearing surfaces can badge it; markerless
// surfaces use only the title.
function itemTitle(item: ItemDTO): { title: string; unidentified: boolean } {
  const name = item.display_name ?? "";
  if (name === "" || name === lastSegment(item.relative_path)) {
    return { title: pathStem(item.relative_path), unidentified: true };
  }
  return { title: name, unidentified: false };
}

// namespaces — the document's sources namespaces as plain records (insertion
// order). Missing/non-object namespaces are skipped, mirroring sourcesOf's
// normalization while keeping raw field access (the fields are plugin-defined).
function namespaces(doc: ItemDocument): Record<string, unknown>[] {
  const sources = doc.sources;
  if (!sources || typeof sources !== "object") {
    return [];
  }
  return Object.values(sources).filter(
    (ns): ns is Record<string, unknown> => !!ns && typeof ns === "object",
  );
}

// numberField — an integer field out of a dynamic source namespace, or null
// (same contract as Home's local copy).
function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

// stringField — a non-empty string field out of a dynamic source namespace.
function stringField(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// parsedChips — the parsed facts for a movie file card's meta line, read
// generically across the document's source namespaces: the release year and
// the resolution. (The SxxExx token is deliberately NOT here — it duplicated
// the served display_name's own suffix.) Any fact that is absent is omitted —
// never a guess. Exported pure for tests.
export function parsedChips(doc: ItemDocument): string[] {
  const chips: string[] = [];
  for (const ns of namespaces(doc)) {
    const year = numberField(ns.year);
    if (year !== null) {
      chips.push(String(year));
    }
    const resolution = stringField(ns.resolution);
    if (resolution !== null) {
      chips.push(resolution);
    }
    if (chips.length > 0) {
      break; // one parser's facts are enough — never mix across namespaces
    }
  }
  return chips;
}

// metaLine — the card's ONE muted dot-separated fact line ("2019 · 1080p ·
// 23:50"): the parsed facts plus the ffprobe duration when known. Empty when
// no fact exists — the line is omitted, never padded. Exported pure for
// tests.
export function metaLine(doc: ItemDocument): string {
  const facts = [...parsedChips(doc)];
  const duration = durationSeconds(doc);
  if (duration !== null) {
    facts.push(formatPosition(duration));
  }
  return facts.join(" · ");
}

// captureDate — the item's capture date, read from the enricher's `date_taken`
// fact (image-enricher stamps the EXIF DateTimeOriginal, RFC3339 when
// parseable, else the verbatim machine string). Null when no namespace carries
// one — the caller omits the footer, never fakes a date. Exported pure for
// tests.
export function captureDate(doc: ItemDocument): string | null {
  for (const ns of namespaces(doc)) {
    const date = stringField(ns.date_taken);
    if (date !== null) {
      return date;
    }
  }
  return null;
}

// aspectRatio — the tile's real aspect ratio from the enricher's width/height
// facts, or null when either is absent (the tile then uses the CSS default).
function aspectRatio(doc: ItemDocument): string | null {
  for (const ns of namespaces(doc)) {
    const width = numberField(ns.width);
    const height = numberField(ns.height);
    if (width !== null && height !== null && width > 0 && height > 0) {
      return `${String(width)} / ${String(height)}`;
    }
  }
  return null;
}

// formatDatePart — the display form of a stored date stamp: the YYYY-MM-DD
// prefix of an RFC3339 stamp, or the raw string verbatim (unparseable EXIF
// values pass through image-enricher untouched — never re-encode them here).
function formatDatePart(stamp: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(stamp) ? stamp.slice(0, 10) : stamp;
}

// MediaImg — an object-URL <img> over the caller's placeholder: renders the
// image once the media fetch resolves and hides itself on any load/decode
// failure — never a broken-image state (the surrounding placeholder box stays).
// Shared by the movie cards and the photo masonry tiles.
function MediaImg(props: { src: string | null }): ReactElement | null {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [props.src]);

  if (props.src === null || failed) {
    return null;
  }
  return (
    <img
      src={props.src}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

// dotClass — mirrors the sidebar's pastel type dots (same module_id keys;
// same rationale as Home's local copy).
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

// browseState — the position handoff every grid surface passes into the item
// detail (element-pages 6.2): the loaded view's ids in served order, the
// clicked tile/card/row's position (index) within that view, and the
// collection to Esc back to. The detail page browses (prev/next, wrap-around)
// within exactly this view — the clicked position opens the clicked item, not
// the first one.
function browseState(
  ids: string[],
  position: number,
  libraryId: number,
): BrowseHandoff {
  return {
    items: ids,
    position,
    backTo: `/collections/${String(libraryId)}`,
  };
}

export default function Collection(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const libraryId = Number(id);

  const libraries = useLibraries();
  const summary = useLibrarySummary(libraryId);

  const lib: LibraryDTO | undefined = Number.isFinite(libraryId)
    ? libraries.data?.items.find((l) => l.id === libraryId)
    : undefined;

  if (libraries.isLoading) {
    return <LoadingState label="Loading collections…" />;
  }
  if (libraries.error) {
    return (
      <ErrorState error={libraries.error as ApiError} onRetry={libraries.refetch} />
    );
  }
  if (!lib) {
    return (
      <EmptyState
        message={`Collection not found: no library with id ${id ?? "(missing)"}.`}
      />
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <CollectionHeader
        lib={lib}
        itemCount={summary.data?.items}
        updatedAt={summary.data?.updated_at}
      />
      <CollectionBody module_id={lib.module_id} libraryId={lib.id} summaryLoaded={!summary.isLoading} itemCount={summary.data?.items} />
    </main>
  );
}

// CollectionHeader — name, pastel type badge (module_id), description, item
// count and updated stamp from the summary. The count shows once the summary
// lands; the header itself never waits on it.
function CollectionHeader(props: {
  lib: LibraryDTO;
  itemCount?: number;
  updatedAt?: string;
}): ReactElement {
  const { lib } = props;

  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className={dotClass(lib.module_id)} aria-hidden="true" />
        <h1 className="text-xl font-semibold">{lib.display_name}</h1>
        <span className="chip">{lib.module_id}</span>
      </div>
      {lib.description ? (
        <p className="text-sm text-muted-foreground">{lib.description}</p>
      ) : null}
      {typeof props.itemCount === "number" ? (
        <p className="text-xs text-muted-foreground">
          {props.itemCount} items
          {props.updatedAt ? ` · updated ${formatDatePart(props.updatedAt)}` : ""}
        </p>
      ) : null}
    </header>
  );
}

// CollectionBody — the module_id-keyed arm (D6). Every type gets its honest
// layout; unknown module ids keep the generic item grid.
function CollectionBody(props: {
  module_id: string;
  libraryId: number;
  summaryLoaded: boolean;
  itemCount: number | undefined;
}): ReactElement {
  // The zero-item "not scanned yet" state is summary-driven and type-
  // independent (the explicit empty card state from the spec).
  if (props.summaryLoaded && props.itemCount === 0) {
    return <EmptyState message="Not scanned yet — run a scan from Admin." />;
  }
  switch (props.module_id) {
    case "tv":
      return <MoviesBody libraryId={props.libraryId} />;
    case "image":
      return <PhotosBody libraryId={props.libraryId} />;
    case "serial":
      return <SerialsBody libraryId={props.libraryId} />;
    default:
      return <ItemGrid libraryId={props.libraryId} />;
  }
}

// ---- Shared pagination ------------------------------------------------------

// Pagination — the shared limit/offset controls (Previous/Next + the rendered
// range), used by every body layout. Next is enabled only on a FULL page —
// the server says "maybe more" the only way it can.
function Pagination(props: {
  offset: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}): ReactElement {
  const full = props.count === PAGE_SIZE;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        onClick={props.onPrev}
        disabled={props.offset === 0}
      >
        Previous
      </button>
      <button
        type="button"
        className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        onClick={props.onNext}
        disabled={!full}
      >
        Next
      </button>
      <span className="text-sm text-muted-foreground">
        items {props.count === 0 ? props.offset : props.offset + 1}–
        {props.offset + props.count}
      </span>
    </div>
  );
}

// usePagedItems — the shared paged items query (limit/offset at PAGE_SIZE) +
// the page-turn/reset callbacks every body reuses.
function usePagedItems(libraryId: number) {
  const [offset, setOffset] = useState(0);
  const params: ListItemsParams = {
    library: libraryId,
    limit: PAGE_SIZE,
    offset,
  };
  const query = useItems(params);
  return {
    query,
    items: query.data?.items ?? [],
    offset,
    prev: () => setOffset(Math.max(0, offset - PAGE_SIZE)),
    next: () => setOffset(offset + PAGE_SIZE),
    reset: () => setOffset(0),
  };
}

// ---- tv (movies) — box 5.2 --------------------------------------------------

// MoviesBody — the movies layout: a paginated card grid over
// GET /api/v1/items?library={id}. Each card shows the parsed title (verbatim
// from `_view`), the parsed fact chips (season/episode token, year,
// resolution — from the document's source namespaces), the ffprobe duration
// when known, and the raw filename; cards deep-link into /items/{id}. No
// paths, no lifecycle pills (D5).
function MoviesBody(props: { libraryId: number }): ReactElement {
  const { query, items, offset, prev, next } = usePagedItems(props.libraryId);

  if (query.isLoading) {
    return <LoadingState label="Loading items…" />;
  }
  if (query.error) {
    return <ErrorState error={query.error as ApiError} onRetry={query.refetch} />;
  }
  if (items.length === 0 && offset === 0) {
    return <EmptyState message="No items in this collection." />;
  }

  return (
    <section className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <MovieCard
              item={item}
              handoff={browseState(
                items.map((i) => i.id),
                index,
                props.libraryId,
              )}
            />
          </li>
        ))}
      </ul>
      <Pagination offset={offset} count={items.length} onPrev={prev} onNext={next} />
    </section>
  );
}

// MovieCard — one movie file card: the frame-grabber thumb (via the
// authenticated media fetch, D5) over a quiet placeholder box when the
// document carries the frame-grabber fact, then the served title (floored
// with a muted "Not identified" line when unidentified), and ONE muted meta
// line of parsed facts + duration. No filename row — the file lives in the
// item detail's Technical details (INV-no-filenames). A document without the
// thumb fact renders exactly the text card — never a broken-image state (D6:
// the thumb variant is requested only when the fact exists). Carries the
// CardActions ⋯ menu (EpisodeCard inherits it by rendering this card); the
// rename view wires the item title routes with the card's invalidation keys
// — episodes override them (["series-episodes", seriesId]); the tv grid
// defaults to the paged items list (["items"] prefix).
function MovieCard(props: {
  item: ItemDTO;
  handoff: BrowseHandoff;
  invalidate?: readonly unknown[];
}): ReactElement {
  const { item, handoff } = props;
  const { title, unidentified } = itemTitle(item);
  const meta = metaLine(item.document);
  const hasThumb = hasFrameGrabberThumb(item.document);
  const thumb = useItemMedia(hasThumb ? ENDPOINTS.itemMedia(item.id, "thumb") : null);
  const { set, clear } = useTitleOverride(
    "item",
    item.id,
    props.invalidate ?? ["items"],
  );
  const pending = set.isPending || clear.isPending;
  // Mark watched is gated on a KNOWN duration: photos and unprobed rows
  // never see the row — never a guessed duration.
  const duration = durationSeconds(item.document);

  return (
    <div className="cardact-host relative flex h-full flex-col gap-2">
      <Link
        to={`/items/${item.id}`}
        state={handoff}
        className="flex h-full flex-col gap-2 rounded-md border p-3 hover:bg-accent"
      >
        {hasThumb ? (
          <span
            className="block aspect-video w-full overflow-hidden rounded-md bg-muted"
            aria-hidden="true"
          >
            <MediaImg src={thumb} />
          </span>
        ) : null}
        <span className="text-sm font-medium">{title}</span>
        {unidentified ? (
          <span className="text-xs text-muted-foreground">Not identified</span>
        ) : null}
        {meta !== "" ? (
          <span className="text-xs text-muted-foreground">{meta}</span>
        ) : null}
      </Link>
      <CardActions
        triggerLabel={`Actions for ${title}`}
        pending={pending}
        rows={
          duration !== null ? (
            <MarkWatchedRow itemId={item.id} duration={duration} />
          ) : undefined
        }
        rename={({ collapse, back }) => (
          <RenameTitle
            entityLabel={title}
            initial={item.title_override ?? ""}
            set={set}
            clear={clear}
            onCollapse={collapse}
            onBack={back}
          />
        )}
      />
    </div>
  );
}

// durationSeconds — the item's total whole-second duration, read from the
// verbatim ffprobe blob (ffprobe writes format.duration as a decimal-seconds
// STRING). Anything missing/unparseable → null: the card then renders without
// the duration chip, never a guessed value (same contract as Home's copy).
function durationSeconds(doc: ItemDocument): number | null {
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

// ---- image (photos) — box 5.3 -----------------------------------------------

// PhotosBody — the photos layout: the subfolder chip row from
// GET /api/v1/libraries/{id}/folders (client-side filtering — a picked chip
// narrows the grid to that folder's relative_path prefix, All resets), above
// a CSS-columns masonry grid of item tiles with capture-date footers. Paging
// stays limit/offset; a folder switch restarts at offset 0 (a filtered
// continuation page of the unfiltered list would skip items).
//
// `folder` is the selected prefix: null = All, "" = top-level files (the
// folders endpoint reports them with path ""), otherwise the depth-1 prefix.
function PhotosBody(props: { libraryId: number }): ReactElement {
  const { query, items, offset, prev, next, reset } = usePagedItems(props.libraryId);
  const folders = useLibraryFolders(props.libraryId);
  const [folder, setFolder] = useState<string | null>(null);

  if (query.isLoading) {
    return <LoadingState label="Loading items…" />;
  }
  if (query.error) {
    return <ErrorState error={query.error as ApiError} onRetry={query.refetch} />;
  }

  const visible =
    folder === null
      ? items
      : folder === ""
        ? items.filter((i) => !i.relative_path.includes("/"))
        : items.filter((i) => i.relative_path.startsWith(`${folder}/`));

  const pickFolder = (path: string | null): void => {
    setFolder(path);
    reset();
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by folder">
        <FolderChip
          label="All"
          active={folder === null}
          onClick={() => pickFolder(null)}
        />
        {(folders.data?.folders ?? []).map((f) => (
          <FolderChip
            key={f.path}
            label={f.path === "" ? "Top level" : f.path}
            count={f.items}
            active={folder === f.path}
            onClick={() => pickFolder(f.path)}
          />
        ))}
      </div>

      {visible.length === 0 && offset === 0 ? (
        <EmptyState message="No items in this collection." />
      ) : (
        <ul className="masonry">
          {visible.map((item, index) => (
            <li key={item.id}>
              <PhotoTile
                item={item}
                handoff={browseState(
                  visible.map((i) => i.id),
                  index,
                  props.libraryId,
                )}
              />
            </li>
          ))}
        </ul>
      )}
      <Pagination offset={offset} count={visible.length} onPrev={prev} onNext={next} />
    </section>
  );
}

// FolderChip — one subfolder filter chip (client-side; the folders endpoint
// only names the prefixes). The count rides along as a tabular figure.
function FolderChip(props: {
  label: string;
  count?: number;
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
      {props.label}
      {props.count !== undefined ? (
        <span className="tabular-nums">{String(props.count)}</span>
      ) : null}
    </button>
  );
}

// PhotoTile — one masonry tile: the real-ratio block (aspect from the
// enricher's width/height facts) carrying the item's media — the frame-grabber
// thumb when the document carries that fact, else the original — over the
// quiet gradient placeholder, plus the capture-date footer from the
// document's date_taken fact. No title row at all — photo identity is the
// thumbnail (INV-no-filenames: the accessible name comes from the stem, never
// the raw filename). A document without a date renders no footer — never a
// faked one; a document with no resolvable media fact (or whose media fetch
// 404s — a stale absolute_path after a root move) keeps the pure placeholder
// — never a broken-image state (D6: the thumb variant is requested only when
// the fact exists). Deep-links into /items/{id}.
function PhotoTile(props: { item: ItemDTO; handoff: BrowseHandoff }): ReactElement {
  const { item, handoff } = props;
  const ratio = aspectRatio(item.document);
  const date = captureDate(item.document);
  const hasThumb = hasFrameGrabberThumb(item.document);
  const src = useItemMedia(
    hasThumb || hasOriginalFile(item.document)
      ? ENDPOINTS.itemMedia(item.id, hasThumb ? "thumb" : undefined)
      : null,
  );

  return (
    <Link
      to={`/items/${item.id}`}
      state={handoff}
      aria-label={`Open ${pathStem(item.relative_path)}`}
      className="ptile"
    >
      <span
        className="ph"
        style={ratio ? { aspectRatio: ratio } : undefined}
        aria-hidden="true"
      >
        <MediaImg src={src} />
      </span>
      {date !== null ? (
        <footer>
          <span>{formatDatePart(date)}</span>
        </footer>
      ) : null}
    </Link>
  );
}

// ---- serial — box 5.4 --------------------------------------------------------

// SerialsBody — the serials layout. Two states, one deep-linkable surface:
// no ?series param → the series grid (one poster card per row of
// GET /api/v1/series?library={id}); a ?series=<ser_id> param → that series'
// episode flow (GET /api/v1/series/{id}/episodes, fetched once per series —
// episode documents are NEVER fetched eagerly per series row). The param is
// real URL state, so an episode view deep-links and /collections/{id} alone
// still lands on the grid.
function SerialsBody(props: { libraryId: number }): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const seriesId = searchParams.get("series") ?? "";

  if (seriesId !== "") {
    return (
      <EpisodesView
        seriesId={seriesId}
        libraryId={props.libraryId}
        onBack={() => setSearchParams({})}
      />
    );
  }
  return <SeriesGrid libraryId={props.libraryId} />;
}

// seriesTitle — the series card's display title: the SERVED `display_name`
// verbatim (display-naming — the server resolves override > composed chain
// > ""). Directory-backed rows render verbatim ALWAYS — their served name is
// naturally the directory's own name, so a filename floor would fire on every
// card and scene dirs like "Show.S01" would corrupt into "Show". File-backed
// rows floor an empty or own-filename name to the extension-less stem —
// silently, no marker (the series menu offers no Identify).
function seriesTitle(sr: SeriesDTO): string {
  const name = sr.display_name ?? "";
  if (seriesBacking(sr.document) !== "file") {
    return name;
  }
  if (name === "" || name === lastSegment(sr.relative_path)) {
    return pathStem(sr.relative_path);
  }
  return name;
}

// seriesSeason — the series' season number out of the document's source
// namespaces, or null when none carries one (the chip is then omitted, never
// guessed).
function seriesSeason(doc: SeriesDTO["document"]): number | null {
  for (const ns of namespaces(doc)) {
    const season = numberField(ns.season);
    if (season !== null) {
      return season;
    }
  }
  return null;
}

// seriesBacking — the `backing` marker fact the serial-scanner stamps into
// the document's `parsed` namespace ("directory" | "file"). Null when absent.
function seriesBacking(doc: SeriesDTO["document"]): string | null {
  const parsed = doc.parsed;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return stringField((parsed as Record<string, unknown>).backing);
}

// SeriesGrid — one poster card per series row. Deleted rows are skipped (the
// janitor's tombstones are not a browse surface); an empty list after the
// fetch is an honest "nothing scanned yet" state.
function SeriesGrid(props: { libraryId: number }): ReactElement {
  const series = useSeries(props.libraryId);

  if (series.isLoading) {
    return <LoadingState label="Loading series…" />;
  }
  if (series.error) {
    return <ErrorState error={series.error as ApiError} onRetry={series.refetch} />;
  }

  const rows = (series.data?.items ?? []).filter((s) => s.status !== "deleted");
  if (rows.length === 0) {
    return <EmptyState message="No series scanned yet." />;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((sr) => (
        <li key={sr.id}>
          <SeriesCard sr={sr} libraryId={props.libraryId} />
        </li>
      ))}
    </ul>
  );
}

// useTitleOverride — the rename mutations for ONE entity (serial-watch-flow
// 4.3): kind picks the id space ("series" → setSeriesTitle/deleteSeriesTitle,
// "item" → setItemTitle/deleteItemTitle). Both run retry:0
// (INV-no-mutation-retry — a 400/404 surfaces inline, never auto-retried) and
// invalidate the entity's read on success so the display follows the stored
// row. Declared file-local rather than in lib/queries because only the serial
// surface consumes the title routes and the invalidation keys are this page's.
function useTitleOverride(
  kind: "series" | "item",
  entityId: string,
  invalidate: readonly unknown[],
): {
  set: UseMutationResult<TitleOverrideDTO, ApiError, string>;
  clear: UseMutationResult<void, ApiError, void>;
} {
  const qc = useQueryClient();
  const invalidateRead = (): void => {
    void qc.invalidateQueries({ queryKey: [...invalidate] });
  };
  const set = useMutation<TitleOverrideDTO, ApiError, string>({
    mutationFn: (title: string) =>
      kind === "series"
        ? setSeriesTitle(entityId, title)
        : setItemTitle(entityId, title),
    retry: 0,
    onSuccess: invalidateRead,
  });
  const clear = useMutation<void, ApiError, void>({
    mutationFn: () =>
      kind === "series"
        ? deleteSeriesTitle(entityId)
        : deleteItemTitle(entityId),
    retry: 0,
    onSuccess: invalidateRead,
  });
  return { set, clear };
}

// CardActions — the per-card management unit (ui-management §2): a quiet ⋯
// trigger top-right of the card, revealed on card hover/focus on fine
// pointers (the coarse-pointer persistent reveal is box 1.4's CSS), opening
// ONE portaled dialog overlay whose views are `menu` and `rename`. The
// trigger carries aria-haspopup="dialog" + aria-expanded; the open state
// persists via data-open because the overlay is portaled (`.scard` is
// overflow:hidden — in-card positioning would clip) and :focus-within goes
// false once focus enters the panel. Esc matrix: rename view → menu, menu →
// close all, IGNORED while a mutation is pending (an unmounted view could
// never render the canonical inline error). Focus is trapped (two-sentinel
// Tab loop) and returns to the trigger on close. Overlay state is LOCAL
// (closed|menu|rename), never URL state: a route change unmounts the card
// and discards it.
type OverlayState = "closed" | "menu" | "rename";

const FOCUSABLE_SEL =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter(
    (el) => !el.classList.contains("cardact-sentinel"),
  );
}

function CardActions(props: {
  triggerLabel: string;
  pending: boolean;
  rows?: ReactElement;
  footer?: ReactElement;
  rename: (ctl: { collapse: () => void; back: () => void }) => ReactElement;
}): ReactElement {
  const [overlay, setOverlay] = useState<OverlayState>("closed");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevOverlay = useRef<OverlayState>("closed");

  const closeAll = (): void => setOverlay("closed");

  // Focus routing: into the panel's first focusable on every open/view flip,
  // back to the trigger on close (not on initial mount).
  useEffect(() => {
    const wasOpen = prevOverlay.current !== "closed";
    prevOverlay.current = overlay;
    if (overlay === "closed") {
      if (wasOpen) {
        triggerRef.current?.focus();
      }
      return;
    }
    const panel = panelRef.current;
    if (panel) {
      focusables(panel)[0]?.focus();
    }
  }, [overlay]);

  // The two-sentinel Tab loop: focusing a sentinel wraps focus to the
  // opposite edge of the panel's real focusables.
  const wrapFocus = (edge: "top" | "bottom"): void => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const els = focusables(panel);
    (edge === "top" ? els[els.length - 1] : els[0])?.focus();
  };

  const open = overlay !== "closed";
  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      className="cardact-trigger"
      aria-label={props.triggerLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-open={open ? "" : undefined}
      onClick={() => setOverlay(open ? "closed" : "menu")}
    >
      ⋯
    </button>
  );

  if (!open) {
    return trigger;
  }

  return (
    <>
      {trigger}
      {createPortal(
        <div
          className="overlay-backdrop"
          onClick={closeAll}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={props.triggerLabel}
            className="cardact-panel"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Escape" || props.pending) {
                return;
              }
              if (overlay === "rename") {
                setOverlay("menu");
              } else {
                closeAll();
              }
            }}
          >
            <span
              aria-hidden="true"
              tabIndex={0}
              className="cardact-sentinel"
              onFocus={() => wrapFocus("top")}
            />
            {overlay === "menu" ? (
              <>
                <button
                  type="button"
                  className="cardact-row"
                  onClick={() => setOverlay("rename")}
                >
                  Rename…
                </button>
                {props.rows ?? null}
                {props.footer ?? null}
              </>
            ) : (
              props.rename({
                collapse: closeAll,
                back: () => setOverlay("menu"),
              })
            )}
            <span
              aria-hidden="true"
              tabIndex={0}
              className="cardact-sentinel"
              onFocus={() => wrapFocus("bottom")}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// MarkWatchedRow — the item menu's "Mark watched" action row (ui-management
// §2): PUTs the item's FULL duration as the playback position through the
// player's existing putProgress channel (retry:0 — a failure surfaces, never
// auto-retries). No view flip — the row is an ACTION, not a view: the menu
// stays open on success (no collapse) and on failure (a row-local transient
// error line renders under the row, cleared on the next attempt).
// Known semantics, accepted default (design open question 1): the server has
// no watched concept — position=duration does NOT leave the item on the
// Continue rail (GET /progress is newest-first positive positions); for a
// series it genuinely advances Next-up. Backlog: "watched flag /
// Continue-rail filtering (Go)".
function MarkWatchedRow(props: { itemId: string; duration: number }): ReactElement {
  const [error, setError] = useState<ApiError | null>(null);
  const mark = useMutation<ProgressDTO, ApiError, void>({
    mutationFn: () => putProgress(props.itemId, props.duration),
    retry: 0,
  });

  return (
    <div>
      <button
        type="button"
        className="cardact-row"
        onClick={() => {
          setError(null);
          mark.mutate(undefined, { onError: setError });
        }}
      >
        Mark watched
      </button>
      {error ? (
        <p role="alert" className="cardact-foot text-destructive">
          {error.code}: {error.message}
        </p>
      ) : null}
    </div>
  );
}

// RenameTitle — the rename form (serial-watch-flow 4.3), hosted as the
// CardActions rename view: a prefilled input with Save (PUT the override) and
// Clear (DELETE it). The old always-visible toggle is gone — the view only
// exists inside the overlay. Canonical errors surface INLINE from the
// mutation state — no auto-retry, no navigation; the overlay stays open so
// the operator can correct the value. A landed set or clear collapses the
// overlay — awaited on the exact mutation the operator just ran (NOT an
// isSuccess effect: a stale success from the other mutation would flip when
// the next mutate starts and slam the view shut mid-submission); the display
// behind it follows the invalidated read (the override on set, the chain
// value on clear).
function RenameTitle(props: {
  entityLabel: string;
  initial: string;
  set: UseMutationResult<TitleOverrideDTO, ApiError, string>;
  clear: UseMutationResult<void, ApiError, void>;
  onCollapse: () => void;
  onBack: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(props.initial);
  const error = props.set.error ?? props.clear.error;
  const busy = props.set.isPending || props.clear.isPending;

  return (
    <form
      className="flex flex-col gap-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        props.set
          .mutateAsync(draft)
          .then(props.onCollapse)
          .catch(() => {}); // the canonical error renders inline below
      }}
    >
      <input
        aria-label={`New title for ${props.entityLabel}`}
        className="w-full rounded-md border bg-transparent px-2 py-1 text-xs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
          onClick={() => {
            props.clear
              .mutateAsync()
              .then(props.onCollapse)
              .catch(() => {}); // the canonical error renders inline below
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
          onClick={props.onBack}
        >
          Back
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error.code}: {error.message}
        </p>
      ) : null}
    </form>
  );
}

// SeriesCard — one series card: poster-ratio placeholder (media serving is a
// deferred capability), display title (the SERVED display_name, display-
// naming — title_override already rides inside it), and the fact chip — the
// season when the document carries one. The lifecycle status pill and the
// "file" backing marker are OFF the chip row (ui-management §1: no status
// pills on user screens; the backing fact re-lands as the series menu
// footer). Carries the CardActions ⋯ menu with the rename view (4.3) wired
// to the series title routes. Links into the episode flow.
function SeriesCard(props: { sr: SeriesDTO; libraryId: number }): ReactElement {
  const { sr } = props;
  const season = seriesSeason(sr.document);
  const backing = seriesBacking(sr.document);
  const { set, clear } = useTitleOverride("series", sr.id, [
    "series",
    props.libraryId,
  ]);
  const pending = set.isPending || clear.isPending;

  return (
    <div className="scard cardact-host">
      <Link
        to={`?series=${encodeURIComponent(sr.id)}`}
        className="block"
        aria-label={`Open ${seriesTitle(sr)}`}
      >
        <span className="scard-poster" aria-hidden="true" />
        <span className="scard-body">
          <span className="scard-title">{seriesTitle(sr)}</span>
          {season !== null ? (
            <span className="flex flex-wrap gap-1">
              <span className="chip">Season {String(season)}</span>
            </span>
          ) : null}
        </span>
      </Link>
      <CardActions
        triggerLabel={`Actions for ${seriesTitle(sr)}`}
        pending={pending}
        footer={
          backing === "file" ? (
            <p className="cardact-foot">File-backed series</p>
          ) : undefined
        }
        rename={({ collapse, back }) => (
          <RenameTitle
            entityLabel={seriesTitle(sr)}
            initial={sr.title_override ?? ""}
            set={set}
            clear={clear}
            onCollapse={collapse}
            onBack={back}
          />
        )}
      />
    </div>
  );
}

// EpisodesView — one series' episode flow: the back affordance into the grid,
// then the episodes as movie-idiom cards (served title + muted meta line +
// the ⋯ menu, deep-linking into /items/{id}), fetched once per series.
function EpisodesView(props: {
  seriesId: string;
  libraryId: number;
  onBack: () => void;
}): ReactElement {
  const episodes = useSeriesEpisodes(props.seriesId);

  if (episodes.isLoading) {
    return <LoadingState label="Loading episodes…" />;
  }
  if (episodes.error) {
    return (
      <ErrorState
        error={episodes.error as ApiError}
        onRetry={episodes.refetch}
      />
    );
  }

  const items = episodes.data?.items ?? [];
  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        className="w-fit rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={props.onBack}
      >
        ← All series
      </button>
      {items.length === 0 ? (
        <EmptyState message="No episodes found for this series." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.id}>
              <EpisodeCard
                item={item}
                seriesId={props.seriesId}
                handoff={browseState(
                  items.map((i) => i.id),
                  index,
                  props.libraryId,
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// EpisodeCard — one episode flow row: the movie card idiom with the rename
// view's invalidation keys overridden to the EPISODE list (["series-
// episodes", seriesId]) — a set or clear invalidates the episode list so the
// display follows the stored row. Everything else (title floor, meta line,
// the ⋯ menu shell) is inherited from MovieCard.
function EpisodeCard(props: {
  item: ItemDTO;
  seriesId: string;
  handoff: BrowseHandoff;
}): ReactElement {
  return (
    <MovieCard
      item={props.item}
      handoff={props.handoff}
      invalidate={["series-episodes", props.seriesId]}
    />
  );
}

// ---- unknown module_id — the generic fallthrough -----------------------------

// ItemGrid — the generic paginated body: one card per item with its title
// (the served display_name floored to the extension-less stem — no marker:
// this surface has no menu) and type/status chips, deep-linking into the
// item detail. No filename row (INV-no-filenames). Unknown module ids land
// here; serial collections now use the series grid above.
function ItemGrid(props: { libraryId: number }): ReactElement {
  const { query, items, offset, prev, next } = usePagedItems(props.libraryId);

  if (query.isLoading) {
    return <LoadingState label="Loading items…" />;
  }
  if (query.error) {
    return <ErrorState error={query.error as ApiError} onRetry={query.refetch} />;
  }
  if (items.length === 0 && offset === 0) {
    return <EmptyState message="No items in this collection." />;
  }

  return (
    <section className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <Link
              to={`/items/${item.id}`}
              state={browseState(
                items.map((i) => i.id),
                index,
                props.libraryId,
              )}
              className="flex h-full flex-col gap-2 rounded-md border p-3 hover:bg-accent"
            >
              <span className="text-sm font-medium">{itemTitle(item).title}</span>
              <span className="flex gap-1">
                <span className="chip">{item.media_type}</span>
                <span className="chip">{item.status}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination offset={offset} count={items.length} onPrev={prev} onNext={next} />
    </section>
  );
}
