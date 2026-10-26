// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  ENDPOINTS,
  getEnrichPreview,
  hasFrameGrabberThumb,
  hasOriginalFile,
  isServedArtPath,
  postLibraryRefresh,
  putProgress,
  type ApiError,
  type EnrichPreview,
  type ItemDTO,
  type LibraryDTO,
  type LibraryRefreshResult,
  type ListItemsParams,
  type ParserBinding,
  type ProgressDTO,
  type RefreshSourceBinding,
  type ScanResponse,
  type SeriesDTO,
} from "@/lib/api";
import {
  useArtworkObjectUrl,
  useItemMedia,
  useItems,
  useLibraries,
  useLibrary,
  useLibraryFolders,
  useLibrarySummary,
  useScanLibrary,
  useSeries,
  useSeriesEpisodes,
  useUpdateLibrary,
} from "@/lib/queries";
import { EditLibraryForm } from "@/pages/admin/Collections";
import { composeItemName, episodeFacts, seriesName } from "@/lib/naming";
import type { ItemDocument } from "@/lib/document";
import { cn } from "@/lib/utils";
import { formatPosition } from "@/pages/home/Home";
import type { BrowseHandoff } from "@/pages/browse/ItemDetail";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { DialogShell } from "@/components/DialogShell";
import {
  CardActions,
  IdentifyView,
  NO_REFRESH_SOURCES,
  RefreshView,
  RenameTitle,
  useTitleOverride,
} from "@/components/manage/ManageActions";
import { seriesIdentifyGate } from "@/components/manage/IdentifySeries";
import { Synopsis } from "@/components/metadata/Synopsis";
import { PosterFrame } from "@/components/Artwork";
import { PosterOverlay } from "@/components/manage/PosterOverlay";

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

// refreshSourcesOf — the detail DTO's module block as the refresh pickers'
// tri-state input: undefined = the module block is absent (unwired — the
// pickers are hidden/empty-stated, a wiring fact, never authorization); the
// array (possibly empty) = wired. `refresh_sources` is omitempty on the wire,
// so a wired module with no refreshable source serves an ABSENT field — the
// ?? [] restores the empty list.
function refreshSourcesOf(detail?: LibraryDTO): RefreshSourceBinding[] | undefined {
  return detail?.module ? (detail.module.refresh_sources ?? []) : undefined;
}

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
  // The module block (identity_fields + the ordered parser chain) rides ONLY
  // on GET /libraries/{id} — the list endpoint never carries it — so the
  // Identify menu's chain display and its wiring gate read from this
  // page-level detail query. A missing/failed module block means the module
  // is not wired, not that the operator is unauthorized: the gate HIDES the
  // Identify row (designed empty state), it never disables the page.
  const libraryDetail = useLibrary(libraryId);

  const lib: LibraryDTO | undefined = Number.isFinite(libraryId)
    ? libraries.data?.items.find((l) => l.id === libraryId)
    : undefined;

  // The Manage overlay (ui-management pass 3): opened from the header's gear
  // trigger, closed by its own shell mechanics. Overlay state is LOCAL, never
  // URL state — a route change unmounts the page and discards it.
  const gearRef = useRef<HTMLButtonElement>(null);
  const [manageOpen, setManageOpen] = useState(false);

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
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <CollectionHeader
        lib={lib}
        itemCount={summary.data?.items}
        updatedAt={summary.data?.updated_at}
        gearRef={gearRef}
        manageOpen={manageOpen}
        onManage={() => setManageOpen(true)}
      />
      <CollectionBody
        module_id={lib.module_id}
        libraryId={lib.id}
        chain={libraryDetail.data?.module?.parsers}
        refreshSources={refreshSourcesOf(libraryDetail.data)}
        summaryLoaded={!summary.isLoading}
        itemCount={summary.data?.items}
      />
      {manageOpen ? (
        <ManageOverlay
          lib={lib}
          detail={libraryDetail.data}
          gearRef={gearRef}
          onClose={() => setManageOpen(false)}
        />
      ) : null}
    </main>
  );
}

// CollectionHeader — name, pastel type badge (module_id), description, item
// count and updated stamp from the summary. The count shows once the summary
// lands; the header itself never waits on it.
//
// The quiet gear trigger (ui-management pass 3) opens the ONE Manage overlay:
// revealed on header hover/focus (the shared .cardact-trigger CSS inside the
// cardact-host row) and keyboard-reachable (a real button — tab focus reveals
// it via :focus-within). It carries the dialog a11y pair like every overlay
// trigger; the gear's ref is the Manage sheet's focus-return target.
function CollectionHeader(props: {
  lib: LibraryDTO;
  itemCount?: number;
  updatedAt?: string;
  gearRef: RefObject<HTMLButtonElement>;
  manageOpen: boolean;
  onManage: () => void;
}): ReactElement {
  const { lib } = props;

  return (
    <header className="flex flex-col gap-2">
      <div className="cardact-host relative flex items-center gap-3">
        <span className={dotClass(lib.module_id)} aria-hidden="true" />
        <h1 className="text-xl font-semibold">{lib.display_name}</h1>
        <span className="chip">{lib.module_id}</span>
        <button
          type="button"
          ref={props.gearRef}
          className="cardact-trigger"
          aria-label="Manage collection"
          aria-haspopup="dialog"
          aria-expanded={props.manageOpen}
          onClick={props.onManage}
        >
          ⚙
        </button>
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
// layout; unknown module ids keep the generic item grid. `chain` is the
// module block's declared parser chain (undefined when the block is absent) —
// threaded only to the menu-bearing card surfaces; the Identify gate consumes
// it there. `refreshSources` is the block's served refresh_sources list
// (refreshSourcesOf's tri-state) — threaded to the same surfaces for the
// per-item Refresh view.
function CollectionBody(props: {
  module_id: string;
  libraryId: number;
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
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
      return (
        <MoviesBody
          libraryId={props.libraryId}
          chain={props.chain}
          refreshSources={props.refreshSources}
        />
      );
    case "image":
      return <PhotosBody libraryId={props.libraryId} />;
    case "serial":
      return (
        <SerialsBody
          libraryId={props.libraryId}
          chain={props.chain}
          refreshSources={props.refreshSources}
        />
      );
    default:
      return <ItemGrid libraryId={props.libraryId} />;
  }
}

// ---- Manage overlay (ui-management pass 3) -----------------------------------

// ManageOverlay — the collection header gear's ONE wide Manage sheet, rendered
// through the shared lifted DialogShell (portal/fixed, scrim click-away,
// Escape, focus-return to the gear, focus trap, aria-modal, wide scrollable
// sheet). It renders FIVE sections — Rescan, Parser chain, Naming, Refresh
// metadata, Edit library — each an independent SAVE BOUNDARY: one request per
// section save, never one giant PATCH (the Go PATCH /libraries/{id} writes
// the row and the chain in two non-atomic store calls, so a mid-write failure
// on a combined save would leave row and chain divergent).
//
// `detail` is the GET /libraries/{id} DTO — the ONLY response that carries
// the additive module block (the served parser chain) and the two naming
// options; the PATCH response never carries the module block, so every
// section re-reads through this query after a save (the save/invalidation
// contract in queries.ts).
//
// Gate semantics (kept from the Identify row): the module block's ABSENCE
// signals module wiring, not authorization — sections that read it render
// their designed empty state, the sheet itself is never gated.
function ManageOverlay(props: {
  lib: LibraryDTO;
  detail?: LibraryDTO;
  gearRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
}): ReactElement {
  return (
    <DialogShell
      open
      label={`Manage ${props.lib.display_name}`}
      width="wide"
      returnFocusRef={props.gearRef}
      onClose={props.onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Manage collection</h3>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
        <ManageSection title="Rescan">
          <RescanSection libraryId={props.lib.id} />
        </ManageSection>
        <ManageSection title="Parser chain">
          <ParserChainSection
            libraryId={props.lib.id}
            chain={props.detail?.module?.parsers}
          />
        </ManageSection>
        <ManageSection title="Naming">
          <NamingSection
            libraryId={props.lib.id}
            groupStyle={props.detail?.naming_group_style}
            elementName={props.detail?.naming_element_name}
          />
        </ManageSection>
        <ManageSection title="Refresh metadata">
          <RefreshMetadataSection
            libraryId={props.lib.id}
            refreshSources={refreshSourcesOf(props.detail)}
          />
        </ManageSection>
        <ManageSection title="Edit library">
          {/* The SHARED form (admin/Collections.tsx). Success closes the whole
              Manage sheet — the edit landing IS this section's done signal
              (the box: "closes on success"); a canonical error renders inside
              the form and the sheet STAYS open. The sheet's own Close button
              is the cancel path, so the form renders without its inline
              Cancel (onCancel omitted). */}
          <EditLibraryForm lib={props.lib} onSaved={props.onClose} />
        </ManageSection>
      </div>
    </DialogShell>
  );
}

// ManageSection — one Manage sheet section: a bordered block with its
// heading. The section OWNS its save boundary — its controls and its own
// save request; a failed save surfaces the canonical error inline and leaves
// the sheet open.
function ManageSection(props: { title: string; children?: ReactNode }): ReactElement {
  return (
    <section className="flex flex-col gap-2 rounded-md border p-3">
      <h4 className="text-sm font-semibold">{props.title}</h4>
      {props.children}
    </section>
  );
}

// sectionSaveButton — the shared Save row of the section save boundaries:
// canonical errors inline (role="alert"), the awaited success flips the
// section's own Saved status — the sheet NEVER auto-closes on a section save
// (each boundary saves independently; closing would discard the others'
// drafts).
function sectionError(err: ApiError | null): ReactElement | null {
  return err ? (
    <p role="alert" className="text-xs text-destructive">
      {err.code}: {err.message}
    </p>
  ) : null;
}

// ParserChainSection — the Parser chain save boundary (ui-management pass 3):
// the SERVED-ORDER chain from the module block, editable as a local draft —
// up/down reorder, remove, add from the module's declared parsers — saved as
// ONE PATCH of ONLY `parsers` (a full replacement; order IS the footer group
// order and the enrichment queue priority). The UI MUST NOT submit an empty
// list: the Go PATCH 400s a present-and-empty `parsers` (the chain edit is a
// reorder, never a clear — the module seed chain is the floor), so Save is
// disabled on an emptied draft.
//
// The module block's ABSENCE signals wiring, not authorization: without it
// the section renders its designed empty state — the sheet is never gated.
function ParserChainSection(props: {
  libraryId: number;
  chain?: ParserBinding[];
}): ReactElement {
  const served = (props.chain ?? []).map((b) => b.id);
  const servedKey = served.join("\n");
  // The draft: null until the operator edits — i.e. the served order
  // verbatim; any edit pins the edited order (an EMPTY pinned draft is the
  // emptied chain — Save is disabled there, never a silent no-op).
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useUpdateLibrary();
  const order = draft ?? served;

  // A refetch that changed the served chain (this save's own invalidation,
  // or another operator's) resets the draft — the draft edits WHAT IS
  // SERVED, never a stale local fork.
  useEffect(() => {
    setDraft(null);
    setSaved(false);
  }, [servedKey]);

  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= order.length) {
      return;
    }
    const next = [...order];
    const [picked] = next.splice(index, 1);
    next.splice(target, 0, picked);
    setDraft(next);
  };

  const remove = (id: string): void => {
    setDraft(order.filter((a) => a !== id));
  };

  const saveDraft = (): void => {
    save.mutate(
      { id: props.libraryId, req: { parsers: order } },
      { onSuccess: () => setSaved(true) },
    );
  };

  if (props.chain === undefined) {
    return (
      <p className="text-xs text-muted-foreground">
        The module block is unavailable — the chain needs a wired module.
      </p>
    );
  }

  const addable = props.chain.filter((b) => !order.includes(b.id));

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1" aria-label="Parser chain order">
        {order.map((id, i) => (
          <li key={id} className="flex items-center justify-between gap-2">
            <span className="text-xs">
              {String(i + 1)}. {id}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                aria-label={`Move ${id} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                aria-label={`Move ${id} down`}
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                aria-label={`Remove ${id}`}
                onClick={() => remove(id)}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
      {addable.length > 0 ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Add parser">
          {addable.map((b) => (
            <button
              key={b.id}
              type="button"
              className="chip"
              aria-label={`Add ${b.id}`}
              onClick={() => setDraft([...order, b.id])}
            >
              + {b.id}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Order is enrichment priority</p>
      <button
        type="button"
        className="cardact-row rounded-md border text-xs"
        disabled={order.length === 0 || save.isPending}
        onClick={saveDraft}
      >
        Save
      </button>
      {order.length === 0 ? (
        <p className="text-xs text-destructive">
          The chain cannot be emptied — add a parser before saving.
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs text-muted-foreground">
          Saved.
        </p>
      ) : null}
      {sectionError(save.error)}
    </div>
  );
}

// NamingSection — the Naming save boundary (ui-management pass 3): the two
// display naming options — naming_group_style ("" = module default | clean |
// raw) and naming_element_name (the element template; its {...} groups are
// validated server-side to exactly {title}/{season}/{episode} — a refusal
// surfaces inline and the sheet stays open) — saved as ONE PATCH of ONLY the
// two fields. The live preview is composed CLIENT-side through the pinned
// mirror (lib/naming.ts): the sample row is the library's FIRST episode
// (GET /items?library={id}&limit=1), its episode facts joined to the series
// row its parsed anchor names — the same join the Go composer performs.
// names re-compose on save, no rescan.
function NamingSection(props: {
  libraryId: number;
  groupStyle?: string;
  elementName?: string;
}): ReactElement {
  const servedGroup = props.groupStyle ?? "";
  const servedTmpl = props.elementName ?? "";
  const servedKey = `${servedGroup}\n${servedTmpl}`;
  const [groupDraft, setGroupDraft] = useState<string | null>(null);
  const [tmplDraft, setTmplDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useUpdateLibrary();
  const group = groupDraft ?? servedGroup;
  const tmpl = tmplDraft ?? servedTmpl;

  // A refetch that changed the served options resets the drafts (same
  // posture as the chain draft — edits track WHAT IS SERVED).
  useEffect(() => {
    setGroupDraft(null);
    setTmplDraft(null);
    setSaved(false);
  }, [servedKey]);

  // The sample row: the library's first episode + the series its parsed
  // anchor names (tombstones skipped, like the Go join).
  const sample = useItems({ library: props.libraryId, limit: 1 });
  const series = useSeries(props.libraryId);
  const ep = sample.data?.items[0];
  const facts = ep ? episodeFacts(ep.document) : null;
  const seriesRow = facts
    ? (series.data?.items ?? []).find(
        (s) => s.relative_path === facts.path && s.status !== "deleted",
      )
    : undefined;
  const title = seriesRow ? seriesName(seriesRow, group) : null;
  const preview =
    facts && title !== null
      ? composeItemName(tmpl, { title, season: facts.season, episode: facts.episode })
      : null;

  const saveDraft = (): void => {
    save.mutate(
      {
        id: props.libraryId,
        req: { naming_group_style: group, naming_element_name: tmpl },
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Group style" className="flex flex-wrap gap-3">
        {(
          [
            ["", "Module default"],
            ["clean", "clean"],
            ["raw", "raw"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-1 text-xs">
            <input
              type="radio"
              name="naming-group-style"
              value={value}
              checked={group === value}
              onChange={() => setGroupDraft(value)}
            />
            {label}
          </label>
        ))}
      </div>
      <input
        aria-label="Element name template"
        className="w-full rounded-md border bg-transparent px-2 py-1 text-xs"
        value={tmpl}
        onChange={(e) => setTmplDraft(e.target.value)}
      />
      {sample.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading sample episode…</p>
      ) : preview !== null ? (
        <p aria-label="Name preview" className="text-xs">
          Preview: <span className="font-medium">{preview}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          No episodes scanned yet — the preview appears with the first episode.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Names re-compose on save, no rescan.
      </p>
      <button
        type="button"
        className="cardact-row rounded-md border text-xs"
        disabled={save.isPending}
        onClick={saveDraft}
      >
        Save
      </button>
      {saved ? (
        <p role="status" className="text-xs text-muted-foreground">
          Saved.
        </p>
      ) : null}
      {sectionError(save.error)}
    </div>
  );
}

// RescanSection — the Rescan save boundary (ui-management pass 3): one
// POST /libraries/{id}/scan (retry:0 — the operator re-clicks on failure),
// the ScanResponse rendered inline on this section: `discovered X ·
// persisted Y` (role="status") and the warnings list ONLY when the array is
// present and non-empty (absent/empty warnings are omitted — never a padded
// line). Unlike the admin table there is no per-row state to derive — the
// result belongs to THIS section's own mutation. A scan does not change the
// library row, so nothing is invalidated; the fresh counts follow the
// summary's own refetch windows.
function RescanSection(props: { libraryId: number }): ReactElement {
  const scan = useScanLibrary();
  const res: ScanResponse | undefined = scan.data;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="cardact-row rounded-md border text-xs"
        disabled={scan.isPending}
        onClick={() => scan.mutate(props.libraryId)}
      >
        {scan.isPending ? "Scanning…" : "Rescan"}
      </button>
      {res ? (
        <p role="status" className="text-xs text-muted-foreground">
          discovered {res.discovered} · persisted {res.persisted}
        </p>
      ) : null}
      {res && res.warnings && res.warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-xs text-muted-foreground">
          {res.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      {sectionError(scan.error)}
    </div>
  );
}

// RefreshMetadataSection — the Refresh metadata save boundary (ui-management
// pass 3, plugin-admin-surfaces): a dropdown of the served refresh_sources
// (the loaded, effectively-enabled title sources — chain parsers and
// scanners never appear; the refresh endpoint requires exactly one plugin_id
// per invocation); picking one (or the served-first preselection) fetches
// GET /libraries/{id}/enrich/preview for that plugin, whose drift picture
// (matches/pending/cooling + the `_provenance` version histogram) renders
// BEFORE the trigger enables — the preview IS the consent surface
// (enrichment D-7): no drift picture, no kickoff. The preview composition is
// slow by design (a whole-library namespace scan) — a loading line, never a
// spinner. The trigger POSTs the same postLibraryRefresh client with the
// picked plugin and NO row_ids — omitted row_ids is the whole-library sweep
// (Go `row_ids,omitempty`). 409 refresh_in_flight renders its own line; any
// other canonical error renders inline as code: message (retry:0 — no
// auto-retry). A 503 "unavailable" preview means the endpoint is UNWIRED —
// the section disables itself with explanatory copy. The module block's
// ABSENCE still signals wiring, not authorization: without it the section
// renders its designed empty state; a WIRED module with an empty
// refresh_sources list renders the empty state with explanatory copy and a
// disabled trigger — no refreshable source, no kickoff.
function RefreshMetadataSection(props: {
  libraryId: number;
  refreshSources?: RefreshSourceBinding[];
}): ReactElement {
  const sources = props.refreshSources;
  const [pluginId, setPluginId] = useState<string | null>(null);
  const picked = pluginId ?? sources?.[0]?.id ?? "";
  const preview = useQuery<EnrichPreview, ApiError>({
    queryKey: ["enrich-preview", props.libraryId, picked],
    queryFn: () => getEnrichPreview(props.libraryId, picked),
    enabled: sources !== undefined && picked !== "",
  });
  const refresh = useMutation<LibraryRefreshResult, ApiError, void>({
    mutationFn: () => postLibraryRefresh(props.libraryId, { plugin_id: picked }),
    retry: 0,
  });
  const res = refresh.data;

  if (sources === undefined) {
    return (
      <p className="text-xs text-muted-foreground">
        The module block is unavailable — refresh metadata needs a wired
        module.
      </p>
    );
  }

  return (
    <div
      className="flex flex-col gap-2"
      onKeyDown={(e) => {
        // While the POST is in flight the sheet's Esc walk is suppressed —
        // an unmounted section could never render the canonical inline
        // error (the per-item views' guard).
        if (e.key === "Escape" && refresh.isPending) {
          e.stopPropagation();
        }
      }}
    >
      {preview.error?.code === "unavailable" ? (
        // 503 unwired — a wiring fact, not an authorization one: the section
        // disables itself rather than offering a kickoff that cannot run.
        <p className="text-xs text-muted-foreground">
          The enrichment preview is unavailable — refresh metadata is disabled
          for this collection (the endpoint is not wired).
        </p>
      ) : sources.length === 0 ? (
        // Empty served list — the designed empty state: explanatory copy and
        // a disabled trigger (no refreshable source, no kickoff).
        <>
          <p className="text-xs text-muted-foreground">{NO_REFRESH_SOURCES}</p>
          <button
            type="button"
            className="cardact-row rounded-md border text-xs"
            disabled
          >
            Refresh metadata
          </button>
        </>
      ) : (
        <>
          <select
            aria-label="Refresh metadata source"
            className="rounded-md border bg-card px-2 py-1 text-xs"
            value={picked}
            onChange={(e) => setPluginId(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
          {preview.isLoading ? (
            <p role="status" className="text-xs text-muted-foreground">
              Computing preview… slow by design — a whole-library scan.
            </p>
          ) : preview.data ? (
            <div className="flex flex-col gap-1 text-xs">
              <p aria-label="Enrichment preview">
                matches {String(preview.data.matches)} · pending{" "}
                {String(preview.data.pending)} · cooling{" "}
                {String(preview.data.cooling)}
              </p>
              {Object.keys(preview.data.versions).length > 0 ? (
                <p className="text-muted-foreground">
                  versions:{" "}
                  {Object.entries(preview.data.versions)
                    .map(([v, n]) => `${v} (${String(n)})`)
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="cardact-row rounded-md border text-xs"
            disabled={!preview.data || refresh.isPending}
            onClick={() => refresh.mutate(undefined)}
          >
            {refresh.isPending ? "Refreshing…" : "Refresh metadata"}
          </button>
          {res ? (
            <p role="status" className="text-xs text-muted-foreground">
              {String(res.queued)} queued · {String(res.stripped)} stripped ·{" "}
              {String(res.deferred)} deferred
            </p>
          ) : null}
          {refresh.error ? (
            refresh.error.code === "refresh_in_flight" ? (
              <p role="alert" className="text-xs text-destructive">
                A refresh is already running
              </p>
            ) : (
              <p role="alert" className="text-xs text-destructive">
                {refresh.error.code}: {refresh.error.message}
              </p>
            )
          ) : null}
        </>
      )}
    </div>
  );
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
// GET /api/v1/items?library={id}. Each card's title is the SERVED
// display_name (display-naming: chain-served or composed; the pathStem
// fallback marks the card "Not identified"), and its meta line joins the
// parsed fact chips (year/resolution/capture date — from the document's
// source namespaces) with the ffprobe duration when known; cards deep-link
// into /items/{id} and carry the CardActions menu (rename/identify/refresh).
// No raw filename row, no season/episode token (display-naming took both off
// the card), no paths, no lifecycle pills (D5).
function MoviesBody(props: {
  libraryId: number;
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
}): ReactElement {
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
              chain={props.chain}
              refreshSources={props.refreshSources}
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
// defaults to the paged items list (["items"] prefix). `chain` gates and
// feeds the Identify menu row (absent/empty chain → the row is hidden — a
// wired-module concern, not an authorization one), and an unidentified card
// promotes Identify… to the menu's first row. `refreshSources` (the module
// block's served refresh_sources, refreshSourcesOf's tri-state) gates and
// feeds the Refresh view the same way: undefined = unwired → no row; a wired
// module always offers the row, the view carrying its own empty state.
function MovieCard(props: {
  item: ItemDTO;
  handoff: BrowseHandoff;
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
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
  const chain = props.chain ?? [];
  const identify =
    chain.length > 0
      ? ({ collapse, back }: { collapse: () => void; back: () => void }) => (
          <IdentifyView
            itemId={item.id}
            chain={chain}
            invalidate={props.invalidate ?? ["items"]}
            onCollapse={collapse}
            onBack={back}
          />
        )
      : undefined;
  const refresh =
    props.refreshSources !== undefined
      ? ({ back }: { collapse: () => void; back: () => void }) => (
          <RefreshView
            libraryId={item.library_id}
            rowId={item.id}
            sources={props.refreshSources ?? []}
            onBack={back}
          />
        )
      : undefined;

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
        identify={identify}
        identifyFirst={unidentified}
        refresh={refresh}
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
function SerialsBody(props: {
  libraryId: number;
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
}): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const seriesId = searchParams.get("series") ?? "";

  if (seriesId !== "") {
    return (
      <EpisodesView
        seriesId={seriesId}
        libraryId={props.libraryId}
        chain={props.chain}
        refreshSources={props.refreshSources}
        onBack={() => setSearchParams({})}
      />
    );
  }
  return (
    <SeriesGrid
      libraryId={props.libraryId}
      chain={props.chain}
      refreshSources={props.refreshSources}
    />
  );
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
// fetch is an honest "nothing scanned yet" state. `chain` threads through to
// the series menu's Refresh metadata… row (box 2.3).
function SeriesGrid(props: {
  libraryId: number;
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
}): ReactElement {
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
          <SeriesCard
            sr={sr}
            libraryId={props.libraryId}
            chain={props.chain}
            refreshSources={props.refreshSources}
          />
        </li>
      ))}
    </ul>
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


// SeriesCard — one series card: poster-ratio placeholder (media serving is a
// deferred capability), display title (the SERVED display_name, display-
// naming — title_override already rides inside it), and the fact chip — the
// season when the document carries one. The lifecycle status pill and the
// "file" backing marker are OFF the chip row (ui-management §1: no status
// pills on user screens; the backing fact re-lands as the series menu
// footer). Carries the CardActions ⋯ menu with the rename view (4.3) wired
// to the series title routes, and the Refresh metadata… row (box 2.3) when
// the module block is wired — the row passes the SERIES id (`row_ids:
// [sr.id]`; series rows live in the same row space as items). Links into
// the episode flow.
function SeriesCard(props: {
  sr: SeriesDTO;
  libraryId: number;
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
}): ReactElement {
  const { sr } = props;
  const season = seriesSeason(sr.document);
  const backing = seriesBacking(sr.document);
  // The card poster (artwork 3.3): ONLY the served artwork field, and only
  // its served proxy form rides the authenticated byte channel — a raw
  // remote URL (an unmaterialized winner's transient) floors to the
  // generated fallback. Zero external image requests, never a blank span.
  const artSrc = useArtworkObjectUrl(
    isServedArtPath(sr.artwork) ? sr.artwork : null,
  );
  // The poster management entry (artwork 3.4): a CardActions menu row
  // opening the overlay — the overlay state is LOCAL to the card, the ⋯
  // menu stays the one entry surface.
  const [posterOpen, setPosterOpen] = useState(false);
  const { set, clear } = useTitleOverride("series", sr.id, [
    "series",
    props.libraryId,
  ]);
  const pending = set.isPending || clear.isPending;
  const refresh =
    props.refreshSources !== undefined
      ? ({ back }: { collapse: () => void; back: () => void }) => (
          <RefreshView
            libraryId={props.libraryId}
            rowId={sr.id}
            sources={props.refreshSources ?? []}
            onBack={back}
          />
        )
      : undefined;

  return (
    <div className="scard cardact-host">
      <Link
        to={`?series=${encodeURIComponent(sr.id)}`}
        className="block"
        aria-label={`Open ${seriesTitle(sr)}`}
      >
        <PosterFrame
          src={artSrc}
          name={seriesTitle(sr)}
          className="scard-poster"
        />
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
        rows={
          <button
            type="button"
            className="cardact-row"
            onClick={() => setPosterOpen(true)}
          >
            Постер…
          </button>
        }
        // The Identify… row (identify-match-override): gated on the wired
        // module — the served chain (absent/empty → no row, the designed
        // empty state) and the refresh_sources vocabulary — opening the
        // three-step series identify overlay with the served about block as
        // the orientation match.
        identify={seriesIdentifyGate({
          chain: props.chain,
          refreshSources: props.refreshSources,
          libraryId: props.libraryId,
          seriesId: sr.id,
          displayTitle: seriesTitle(sr),
          about: sr.metadata?.about,
        })}
        refresh={refresh}
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
      <PosterOverlay
        open={posterOpen}
        kind="series"
        entityId={sr.id}
        name={seriesTitle(sr)}
        provenance={sr.document._provenance?.poster}
        invalidate={["series", props.libraryId]}
        onClose={() => setPosterOpen(false)}
      />
    </div>
  );
}

// EpisodesView — one series' episode flow: the back affordance into the grid,
// the series header (its display name and the scraped About panel — the
// Plex/Jellyfin idiom, user-locked 2026-10-21: the synopsis rides ON TOP of
// the episodes, out of the footer), then the episodes as movie-idiom cards
// (served title + muted meta line + the ⋯ menu, deep-linking into
// /items/{id}), fetched once per series.
function EpisodesView(props: {
  seriesId: string;
  libraryId: number;
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
  onBack: () => void;
}): ReactElement {
  const episodes = useSeriesEpisodes(props.seriesId);
  // The series row from the shared grid cache (["series", library] — already
  // warm: the grid fetched it before the flow opened). Absent (cache miss)
  // → the header degrades to the flow without it, never blocks the episodes.
  const seriesList = useSeries(props.libraryId);
  const series =
    (seriesList.data?.items ?? []).find((s) => s.id === props.seriesId) ??
    null;
  // The flow header's poster (artwork 3.3): the served artwork through the
  // authenticated channel; absence → the generated fallback, so the header
  // never collapses to a blank slot.
  const flowPoster = useArtworkObjectUrl(
    series !== null && isServedArtPath(series.artwork) ? series.artwork : null,
  );

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
      {series !== null ? (
        <header className="flex items-start gap-3">
          <PosterFrame
            src={flowPoster}
            name={seriesTitle(series)}
            className="w-24 shrink-0 rounded-md border object-cover"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="text-xl font-semibold">{seriesTitle(series)}</h2>
            <Synopsis about={series.metadata?.about} />
          </div>
        </header>
      ) : null}
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
                chain={props.chain}
                refreshSources={props.refreshSources}
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
  chain?: ParserBinding[];
  refreshSources?: RefreshSourceBinding[];
}): ReactElement {
  return (
    <MovieCard
      item={props.item}
      handoff={props.handoff}
      chain={props.chain}
      refreshSources={props.refreshSources}
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
