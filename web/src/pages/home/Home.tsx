// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import {
  ENDPOINTS,
  hasFrameGrabberThumb,
  hasOriginalFile,
  isServedArtPath,
  type ApiError,
  type ContinueRow,
  type ItemDTO,
  type LibraryDTO,
} from "@/lib/api";
import {
  useArtworkObjectUrl,
  useHome,
  useItemMedia,
  useItems,
  useLibraries,
  useLibrarySummary,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

// Home — the root route's collections surface:
//
//   1. the collections grid — one card per library (pastel type badge, name,
//      description, item count + updated stamp from the summary) with the
//      type chips as a client-side filter; zero-item collections render the
//      explicit "Not scanned yet" card state;
//   2. the Continue rail — ONE GET /api/v1/home round-trip (browse-scale
//      D5/D7): the server composes ≤50 per-series rows — the resume point's
//      SERVED display_name, the parsed episode identity's own title, the
//      position, the honest ffprobe duration, the query-time artwork and the
//      next-episode pick — and the rail renders the served fields verbatim in
//      the served order (rec_score desc, recency tiebreak; never a client
//      re-sort). The 1+N fan-out this surface used to run (the /progress
//      listing, a per-item document fetch per row, per-series /series +
//      /series/{id}/episodes fetches, the started-series grouping and the
//      module_id gate) is GONE: the client derives nothing — no name
//      composition, no next pick, no duration guess, no watched withdrawal
//      (the rail's rows are the calling viewer's visibility-conjunct ledger
//      consumption server-side). The progress bar renders ONLY when the row
//      carries duration_seconds (honest absence — no duration, no bar; an
//      unfilled track would read as "not started", a lie); a served `next`
//      renders the served label verbatim deep-linking into next.item_id,
//      and its absence renders no affordance. Films surface as rows without
//      a next offer (an episode concept).
//
// No root folders and no enrich-lifecycle pills ever render here. Play
// deep-links only — inline streaming is a deferred capability (D3).

// Bounded first page the collection cards scan for a representative preview
// item (media-preview D8 — the card fetches the collection's first items; one
// small page per card, cached under the shared ["items", params] key space).
const CARD_PREVIEW_LIMIT = 12;

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
// only: the served position is rendered, never rewritten.
export function formatPosition(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0
    ? `${String(h)}:${String(m).padStart(2, "0")}:${ss}`
    : `${String(m).padStart(2, "0")}:${ss}`;
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

      <ContinueRail />
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

// ---- Continue rail -----------------------------------------------------------

// ROW_EMPTY_MESSAGE — the shared empty state: an empty served rail means the
// Continue section has nothing to show.
const ROW_EMPTY_MESSAGE =
  "Nothing in progress yet — open an item and it will show up here.";

function RowEmpty(): ReactElement {
  return <EmptyState message={ROW_EMPTY_MESSAGE} />;
}

// ContinueRail — the served /home rows, verbatim: the rail renders the
// response's `continue` array in the served order (rec_score desc, recency
// tiebreak — the ordering contract is inherited server-side; never a client
// re-sort), from the ONE request useHome fires. No rows → the shared empty
// state; a failed request → the canonical error with retry (retry:0 — no
// auto-retry, the user's retry is the affordance).
function ContinueRail(): ReactElement {
  const home = useHome();

  if (home.isLoading) {
    return <LoadingState label="Loading progress…" />;
  }
  if (home.error) {
    return <ErrorState error={home.error as ApiError} onRetry={home.refetch} />;
  }
  const rows: ContinueRow[] = home.data?.continue ?? [];
  if (rows.length === 0) {
    return <RowEmpty />;
  }

  return (
    <section aria-label="Continue" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Continue</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <ContinueCard key={row.series_id || row.current?.item_id} row={row} />
        ))}
      </ul>
    </section>
  );
}

// ContinueCard — one served row, BRANCHED on the wire's `current` (D9 — the
// client derives nothing; both branches render the served fields verbatim).
// RESUME CARD (current present): the artwork preview when the row serves the
// poster's PROXY form (isServedArtPath — a raw remote URL, an unmaterialized
// winner's transient, is never fetched; absent artwork keeps the badge-only
// card, never a broken image), the served series name + the served current
// display_name verbatim (no client-side name composition), the served episode
// title when present, the position label always, and the percent bar ONLY
// when the row carries duration_seconds. A served `next` renders the served
// label verbatim as the row's next-episode affordance deep-linking into
// next.item_id — the client composed neither label nor pick; its absence
// renders no affordance. Play deep-links into the current item detail.
// ANCHOR CARD (current absent — the omitempty field is GONE from the wire,
// never null): the position is spent, so no position label, no percent bar,
// no Play-into-current — the served series display_name promotes to the
// title slot and the served Next chip IS the card's primary play affordance,
// deep-linking next.item_id, over the same isServedArtPath artwork rule and
// the served library label.
function ContinueCard(props: { row: ContinueRow }): ReactElement {
  const { row } = props;
  const cur = row.current;
  const artSrc = useArtworkObjectUrl(
    isServedArtPath(row.artwork) ? row.artwork : null,
  );

  // The anchor branch. The wire never serves this shape without a next
  // offer (homeEntities drops a caught-up entity with nothing strictly
  // after its frontier), but the honest render of the type's honest
  // absence is the bare series card — never a fabricated link.
  if (!cur) {
    return (
      <li className="flex h-full flex-col gap-2 rounded-md border p-3">
        {row.next ? (
          <Link
            to={`/items/${row.next.item_id}`}
            aria-label={`Play ${row.series_display_name}`}
            className="flex flex-1 flex-col gap-2 rounded-md hover:bg-accent"
          >
            {isServedArtPath(row.artwork) ? <CardPreview src={artSrc} /> : null}
            <span className="text-sm font-medium">
              {row.series_display_name}
            </span>
            <span className="mt-auto flex items-center justify-end">
              <span className="chip">Next {row.next.label}</span>
            </span>
          </Link>
        ) : (
          <span className="flex flex-1 flex-col gap-2">
            {isServedArtPath(row.artwork) ? <CardPreview src={artSrc} /> : null}
            <span className="text-sm font-medium">
              {row.series_display_name}
            </span>
          </span>
        )}
        {row.library_name ? (
          <span className="text-xs text-muted-foreground">
            {row.library_name}
          </span>
        ) : null}
      </li>
    );
  }

  // The resume branch — today's card verbatim: nothing about a
  // current-carrying row's render changes.
  const title = cur.display_name;
  const percent =
    cur.duration_seconds !== undefined
      ? Math.min(
          100,
          Math.round((cur.position_seconds / cur.duration_seconds) * 100),
        )
      : null;

  return (
    <li className="flex h-full flex-col gap-2 rounded-md border p-3">
      <Link
        to={`/items/${cur.item_id}`}
        aria-label={`Play ${title}`}
        className="flex flex-1 flex-col gap-2 rounded-md hover:bg-accent"
      >
        {isServedArtPath(row.artwork) ? <CardPreview src={artSrc} /> : null}
        {row.series_display_name ? (
          <span className="text-xs text-muted-foreground">
            {row.series_display_name}
          </span>
        ) : null}
        <span className="text-sm font-medium">{title}</span>
        {cur.episode_title ? (
          <span className="text-xs text-muted-foreground">{cur.episode_title}</span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {percent !== null ? `${String(percent)}% · ` : ""}
          {formatPosition(cur.position_seconds)}
          {row.library_name ? ` · ${row.library_name}` : ""}
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
        <span className="mt-auto flex items-center justify-end">
          <span className="chip">Play</span>
        </span>
      </Link>
      {row.next ? (
        <Link
          to={`/items/${row.next.item_id}`}
          aria-label={`Next ${row.next.label}`}
          className="chip self-start"
        >
          Next {row.next.label}
        </Link>
      ) : null}
    </li>
  );
}
