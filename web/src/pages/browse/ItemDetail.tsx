// SPDX-License-Identifier: Apache-2.0
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError, ItemDTO, ModulePresentation, VoiceoverDTO } from "@/lib/api";
import {
  ENDPOINTS,
  fetchSidecarText,
  getPlayback,
  hasFrameGrabberThumb,
  hasOriginalFile,
  isPhotoItem,
  isVideoItem,
  playItem,
} from "@/lib/api";
import { useItem, useItemMedia, useLibrary, useProgressList } from "@/lib/queries";
import {
  convertToVtt,
  subtitleSidecars,
  type SubtitleSidecar,
} from "@/lib/subtitles";
import type { ItemDocument } from "@/lib/document";
import Player from "@/components/playback/Player";
import {
  provenanceEntries,
  sourcesOf,
  stageEntries,
  viewEntries,
} from "@/lib/document";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import {
  ParserFooter,
  SlotNote,
  humanizeField,
  type ParserFooterGroup,
} from "@/components/metadata/ParserFooter";
import { JsonValue } from "@/components/metadata/JsonValue";
import { ProvenanceBadge } from "@/components/metadata/ProvenanceBadge";
import { SourceCard } from "@/components/metadata/SourceCard";
import { StagesProgress } from "@/components/metadata/StagesProgress";
import { ViewFields } from "@/components/metadata/ViewFields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// ItemDetail — the full §3.1 document for one item (/items/:id), rendered
// VERBATIM (INV-no-rounding, INV-no-merge) following the media-first ladder
// (element-pages D-5):
//   media stage  the item's own media (frame-grabber thumb, else the original
//                for image-typed items) via the authenticated media channel —
//                video: the dominant LEFT column with the play affordance
//                (the Player) beside the identity column RIGHT; image: the
//                photo IS the page, full-width, identity beneath
//   identity     element name (h1), raw path, and the module's mandatory
//                identity badges per `identity_fields` (missing → slot state)
//   footer       <ParserFooter> — the parser-ordered metadata footer between
//                the identity block and the Technical details disclosure
//   Technical details (collapsed until expanded — everything technical):
//     core    the "Item" core-field dl, Tier-1 identifiers, Tier-3 _view
//             (<ViewFields>) — the former always-visible sections, folded
//     Tier 2  sources.<plugin>   — one <SourceCard> per sourcesOf(doc) entry,
//                                  never merged across plugins
//     audit   _provenance        — one <ProvenanceBadge> per provenance entry
//     trail   _stages            — <StagesProgress> (per-stage error when present)
//
// INV-no-direct-fetch: the page touches the API only through its client-layer
// seams — useItem for the document, useLibrary for the additive module
// presentation (its failure degrades the badges/footer, never the page), plus
// the packaged-playback pair (getPlayback via useQuery; playItem via
// useMutation — the retry affordance, D-7's only playback mutation). Error
// edges: ApiError code "not_found" (HTTP 404) → a clear not-found state,
// never a crash; any other failure → the canonical error (code + message)
// surfaced inline.

// present — a value a viewer can read (identity + footer share the posture:
// undefined/null/"" are absence; everything else renders verbatim).
function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

// SLIDESHOW_INTERVAL_MS — the fixed auto-advance cadence (element-pages 6.3,
// "~2.5s"): manual navigation resets the timer by tearing this interval down
// and re-arming it (6.4).
const SLIDESHOW_INTERVAL_MS = 2500;

// BrowseHandoff — the ordered-view state every grid surface hands into the
// detail page (element-pages 6.2): `items` is the loaded view's item ids in
// their served order, `position` the clicked item's index within it, `backTo`
// the collection to return to on Esc. Prev/next browse within exactly THIS
// view — a view operation, never a refetch beyond the ordinary single-item
// fetch per step.
export interface BrowseHandoff {
  items: string[];
  position: number;
  backTo: string;
}

// readBrowseHandoff — validates the router location state against the handoff
// shape. Absent/malformed state (a deep link, a stale history entry, a hand
// edited URL) yields null — the page renders without the browse bar and the
// keyboard stays inert, never a crash and never a fabricated position.
function readBrowseHandoff(state: unknown): BrowseHandoff | null {
  if (state === null || typeof state !== "object") {
    return null;
  }
  const candidate = state as Partial<BrowseHandoff>;
  if (
    typeof candidate.backTo !== "string" ||
    typeof candidate.position !== "number" ||
    !Number.isInteger(candidate.position) ||
    !Array.isArray(candidate.items) ||
    candidate.items.length === 0 ||
    !candidate.items.every((id): id is string => typeof id === "string") ||
    candidate.position < 0 ||
    candidate.position >= candidate.items.length
  ) {
    return null;
  }
  return {
    items: candidate.items,
    position: candidate.position,
    backTo: candidate.backTo,
  };
}

// resolveIdentityValue — one identity field against the document: `_view`
// first (the computed display tier), then across the sources namespaces in
// insertion order; the first present value wins. Absent → undefined — the
// caller renders the slot state (never a blank, never a fabricated value).
function resolveIdentityValue(doc: ItemDocument, field: string): unknown {
  const view = doc._view?.[field];
  if (view && present(view.value)) {
    return view.value;
  }
  for (const namespace of Object.values(doc.sources ?? {})) {
    if (namespace && present(namespace[field])) {
      return namespace[field];
    }
  }
  return undefined;
}

export default function ItemDetail(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useItem(id ?? "");
  const item = data?.item;

  // Browse view (element-pages 6.1/6.2) + slideshow (6.3/6.4) live HERE —
  // ABOVE the loading gate — so a step's ordinary single-item fetch (which
  // swaps the body below for a spinner while pending) never unmounts this
  // component and never drops the running slideshow (6.4: manual navigation
  // must not lose the running state). Deep links carry no handoff state —
  // the page renders without the browse bar instead of inventing a view.
  const navigate = useNavigate();
  const location = useLocation();
  const view = useMemo(
    () => readBrowseHandoff(location.state),
    [location.state],
  );

  const [slideshowRunning, setSlideshowRunning] = useState(false);

  // step — move within the handed-off view with wrap-around at both edges
  // (last → first, first → last) and re-hand the state with the new position.
  // Each step is the ordinary single-item fetch (useItem keys per id); the
  // media + presentation fetches ride the new id like any navigation.
  const step = useCallback(
    (delta: 1 | -1): void => {
      if (!view) {
        return;
      }
      const count = view.items.length;
      const position = (view.position + delta + count) % count;
      const next: BrowseHandoff = { ...view, position };
      navigate(`/items/${view.items[position]}`, { state: next });
    },
    [view, navigate],
  );

  // Slideshow (element-pages 6.3): local state only — it never survives
  // leaving the page (returning starts paused). The interval re-arms on every
  // position change, so a manual ←/→ (or chevron) resets the timer (6.4);
  // unmount cleanup always stops a running slideshow.
  useEffect(() => {
    if (!slideshowRunning || !view || view.items.length < 2) {
      return;
    }
    const timer = window.setInterval(() => step(1), SLIDESHOW_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [slideshowRunning, view, step]);

  // Keyboard — ←/→ browse; S toggles the slideshow (photos); Esc stops a
  // RUNNING slideshow first and only navigates back when it is not running
  // (6.4). No handoff state → no listeners at all.
  const isPhoto = item !== undefined && isPhotoItem(item);
  useEffect(() => {
    if (!view) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "Escape") {
        if (slideshowRunning) {
          setSlideshowRunning(false);
        } else {
          navigate(view.backTo);
        }
      } else if (isPhoto && (event.key === "s" || event.key === "S")) {
        setSlideshowRunning((running) => !running);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, step, slideshowRunning, isPhoto, navigate]);

  if (isLoading) {
    return <LoadingState label="Loading item…" />;
  }

  if (error) {
    const err = error as ApiError;
    // 404 / not_found: the item does not exist (deleted id, stale link) —
    // a clear, calm state rather than an error surface or a crash.
    if (err.code === "not_found" || err.status === 404) {
      return (
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <EmptyState
            message={`Item not found: no item with id ${id ?? "(missing)"}.`}
          />
        </main>
      );
    }
    // Any other failure — canonical error body surfaced inline (code + message).
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <ErrorState error={err} onRetry={refetch} />
      </main>
    );
  }

  if (!item) {
    // Defensive: success without a payload should not happen (server always
    // returns {item}); fail calm instead of crashing on undefined access.
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <EmptyState message="Item not found." />
      </main>
    );
  }

  return (
    <ItemLoadedView
      // Keyed per item (serial-watch-flow 5.3): the subtitle/voiceover
      // selections are per-visit component state and NEVER survive
      // navigation — a step (cached hit included) remounts the body and
      // drops them instead of carrying a selection onto another episode.
      key={item.id}
      item={item}
      view={view}
      step={step}
      slideshowRunning={slideshowRunning}
      onToggleSlideshow={() => setSlideshowRunning((running) => !running)}
    />
  );
}

// ItemLoadedView — the loaded item's page body, mounted only with a loaded
// item (components receive parsed data as props; none fetch the document
// themselves — useLibrary/useProgressList fetch their own wire shapes). All
// browse/slideshow state lives in the parent above, so a step's loading gap
// swaps only THIS subtree.
function ItemLoadedView(props: {
  item: ItemDTO;
  view: BrowseHandoff | null;
  step: (delta: 1 | -1) => void;
  slideshowRunning: boolean;
  onToggleSlideshow: () => void;
}): ReactElement {
  const { item, view, step, slideshowRunning, onToggleSlideshow } = props;
  const doc = item.document;
  const isPhoto = isPhotoItem(item);
  const identifiers = Object.entries(doc.identifiers ?? {});
  const sources = sourcesOf(doc);
  const provenance = provenanceEntries(doc);
  const viewRecord = Object.fromEntries(
    viewEntries(doc).map((e) => [e.fieldPath, e.entry]),
  );

  // Module presentation (element-pages 3.4): identity_fields + the ordered
  // parser chain, served additively on GET /api/v1/libraries/{id}. A fetch
  // failure (unknown library, route not carrying the block yet) degrades
  // gracefully — no identity badges, chain-less footer — never a page error.
  const library = useLibrary(item.library_id);
  const presentation = library.data?.module;

  // Hero media URL — the same client-side pre-selection the collection tiles
  // use (media-preview D6): the frame-grabber thumb when the document names
  // one, else the original only for image-typed items (a video original
  // downloads rather than renders in an <img>). null → no hero section and no
  // request at all; a fetch failure nulls the URL inside useItemMedia, so the
  // page just falls back to the identity column — never a broken-image.
  const heroUrl = hasFrameGrabberThumb(doc)
    ? ENDPOINTS.itemMedia(item.id, "thumb")
    : isPhotoItem(item) && hasOriginalFile(doc)
      ? ENDPOINTS.itemMedia(item.id)
      : null;
  const hero = useItemMedia(heroUrl);

  // Playback (packaged-playback): the descriptor for video items — mode hls
  // plays the packaged stream, mode direct the original floor. A descriptor
  // failure never breaks the page: the play affordance is simply not rendered
  // (playback is an augmentation, not the identity).
  const playback = useQuery({
    queryKey: ["playback", item.id],
    queryFn: () => getPlayback(item.id),
    enabled: isVideoItem(item),
  });
  // Retry affordance (D-7): POST /play {retry:true} re-enqueues a failed
  // packaging run, then the descriptor refetches so the player state flips.
  const queryClient = useQueryClient();
  const playRetry = useMutation({
    mutationFn: () => playItem(item.id, { retry: true }),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["playback", item.id] });
    },
  });

  // Watch controls (serial-watch-flow 5.1–5.3). Subtitles: the document's
  // subtitle sidecars, one selectable entry (off + each sidecar, language-
  // then-folder-then-file labels, .sub listed not-renderable); a selection
  // fetches its bytes through the authenticated channel and renders them via
  // useSubtitleTrack. Voiceovers: the descriptor's audio sidecars plus the
  // embedded audio, mapped document order → hls audioTrack (0 = embedded,
  // k+1 = voiceovers[k], the pack lane's pinned build order); a direct build
  // has no audio renditions to switch, so the control is disabled with the
  // named reason. Both are per-visit component state — the key on
  // ItemLoadedView drops them on navigation.
  const sidecars = useMemo(() => subtitleSidecars(doc), [doc]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null);
  const subtitleTrack = useSubtitleTrack(item.id, sidecars, selectedSubtitle);

  const voiceovers: VoiceoverDTO[] = playback.data?.voiceovers ?? [];
  const [voiceover, setVoiceover] = useState(0); // 0 = embedded audio

  // Footer groups — the parser-ordered metadata footer (element-pages 5.3):
  // the collection chain in its configured order (module presentation), then
  // the element-attached parsers (extra_parsers) marked element-only. A chain
  // parser whose namespace the document does not carry (seeded-but-unloaded)
  // still renders — as an empty slot group in its chain position.
  const chainParsers = presentation?.parsers ?? [];
  const footerGroups: ParserFooterGroup[] = [
    ...chainParsers.map((binding) => ({
      pluginId: binding.id,
      displayFields: binding.display_fields,
      namespace: doc.sources?.[binding.id] ?? {},
    })),
    ...(item.extra_parsers ?? [])
      .filter((id) => !chainParsers.some((binding) => binding.id === id))
      .map((id) => ({
        pluginId: id,
        displayFields: [],
        namespace: doc.sources?.[id] ?? {},
        elementOnly: true,
      })),
  ];

  const mediaStage = hero !== null ? (
    <HeroImage src={hero} alt={item.relative_path} />
  ) : null;
  const player = isVideoItem(item) && playback.data ? (
    <Player
      itemId={item.id}
      descriptor={playback.data}
      onRetry={() => playRetry.mutate()}
      retrying={playRetry.isPending}
      subtitleTrackUrl={subtitleTrack.url}
      voiceoverTrack={voiceover}
    />
  ) : null;
  const watchControls =
    isVideoItem(item) && playback.data ? (
      <TrackControls
        sidecars={sidecars}
        selectedSubtitle={selectedSubtitle}
        onSubtitleSelect={setSelectedSubtitle}
        subtitleFailed={subtitleTrack.failed}
        voiceovers={voiceovers}
        hlsMode={playback.data.mode === "hls"}
        voiceover={voiceover}
        onVoiceoverSelect={setVoiceover}
      />
    ) : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      {view ? (
        // Browse bar (element-pages 6.1/6.3): chevrons + position counter
        // within the loaded ordered view, the slideshow toggle (photos), and
        // the keys hint. Rendered only when a view was handed off.
        <nav
          aria-label="Browse view"
          className="flex flex-wrap items-center gap-3"
        >
          <button
            type="button"
            aria-label="Previous item"
            className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => step(-1)}
          >
            ‹
          </button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Position {view.position + 1} / {view.items.length}
          </span>
          <button
            type="button"
            aria-label="Next item"
            className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => step(1)}
          >
            ›
          </button>
          {isPhoto ? (
            <button
              type="button"
              aria-pressed={slideshowRunning}
              className="rounded-md border px-3 py-1.5 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={onToggleSlideshow}
            >
              {slideshowRunning ? "Pause slideshow" : "Start slideshow"}
            </button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {`←/→ browse${isPhoto ? " · S slideshow" : ""} · Esc ${
              isPhoto ? "stop / back" : "back"
            }`}
          </span>
        </nav>
      ) : null}
      {isVideoItem(item) ? (
        // Media-first, video lane: the media stage (hero + play affordance)
        // is the dominant LEFT surface; the identity column sits RIGHT.
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-label="Media stage" className="flex min-w-0 flex-col gap-3">
            {mediaStage}
            {player}
            {watchControls}
          </section>
          <IdentityBlock item={item} doc={doc} presentation={presentation} />
        </div>
      ) : (
        // Media-first, photo lane: the photo IS the page — full width, the
        // identity block beneath it.
        <>
          {mediaStage !== null ? (
            <section aria-label="Media stage">{mediaStage}</section>
          ) : null}
          <IdentityBlock item={item} doc={doc} presentation={presentation} />
        </>
      )}

      {/* Parser-ordered footer — between the identity block and the Technical
          details disclosure (element-pages 5.3). */}
      {footerGroups.length > 0 && (
        <section aria-label="Metadata footer">
          <ParserFooter groups={footerGroups} />
        </section>
      )}

      {/* Technical details — everything technical collapsed until expanded
          (D7): the former always-visible "Item"/Identifiers/View sections
          folded in ahead of the audit plumbing. Native <details>/<summary>:
          the simplest accessible disclosure. The wrapped renders are
          byte-identical to their former always-visible selves; only their
          visibility changed. */}
      <details className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
          Technical details
        </summary>
        <div className="flex flex-col gap-6 px-4 pb-4">
          <section>
            <h2 className="mb-3 text-base font-semibold">Item</h2>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-xs text-muted-foreground">id</dt>
                <dd className="font-mono text-sm">{item.id}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-xs text-muted-foreground">module_id</dt>
                <dd className="font-mono text-sm">{item.module_id}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-xs text-muted-foreground">library_id</dt>
                <dd className="font-mono text-sm">{item.library_id}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-xs text-muted-foreground">file_id</dt>
                <dd className="font-mono text-sm">{item.file_id}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-xs text-muted-foreground">relative_path</dt>
                <dd className="break-all font-mono text-sm">{item.relative_path}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-xs text-muted-foreground">media_type</dt>
                <dd className="text-sm">{item.media_type}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-xs text-muted-foreground">status</dt>
                <dd className="text-sm">{item.status}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-xs text-muted-foreground">schema_version</dt>
                <dd className="font-mono text-sm">{item.schema_version}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Identifiers</h3>
            {identifiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No identifiers</p>
            ) : (
              <dl className="flex flex-wrap gap-x-6 gap-y-1">
                {identifiers.map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
                    <dd className="font-mono text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">View</h3>
            <Card>
              <CardContent className="pt-6">
                <ViewFields entries={viewRecord} />
              </CardContent>
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Sources</h3>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No source namespaces</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {sources.map((source) => (
                  <SourceCard
                    key={source.pluginId}
                    pluginId={source.pluginId}
                    namespace={source.namespace}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Provenance</h3>
            {provenance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No provenance entries</p>
            ) : (
              <ul className="space-y-2">
                {provenance.map((prov) => (
                  <ProvenanceBadge
                    key={prov.fieldPath}
                    fieldPath={prov.fieldPath}
                    entry={prov.entry}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Pipeline stages</h3>
            <StagesProgress stages={stageEntries(doc)} />
          </section>
        </div>
      </details>
    </main>
  );
}

// useSubtitleTrack — the subtitle selection's fetch-and-convert lifecycle
// (serial-watch-flow 5.1, the file-local twin of queries.ts useItemMedia):
// fetches the selected sidecar's bytes through the authenticated channel
// (ENDPOINTS.itemSidecar — the document index IS the n=), converts them with
// lib/subtitles, and hands back ONE blob object URL for the Player's <track>.
// Deliberately not cached: the URL is revoked on selection change/unmount, so
// the lifecycle IS the state here. No selection, an unrenderable entry, or a
// failed fetch/convert → null URL (subtitles off); a fetch failure — never an
// abort — also raises `failed` for the inline note.
function useSubtitleTrack(
  itemId: string,
  sidecars: SubtitleSidecar[],
  selectedIndex: number | null,
): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    const sidecar = sidecars.find((entry) => entry.index === selectedIndex);
    if (selectedIndex === null || !sidecar || !sidecar.renderable) {
      return;
    }
    let disposed = false;
    let created: string | null = null;
    const controller = new AbortController();
    fetchSidecarText(
      ENDPOINTS.itemSidecar(itemId, selectedIndex),
      controller.signal,
    )
      .then((content) => {
        const vtt = convertToVtt(sidecar.path, content);
        if (vtt === null || disposed) {
          return;
        }
        created = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
        setUrl(created);
      })
      .catch(() => {
        if (!disposed && !controller.signal.aborted) {
          setFailed(true);
        }
      });
    return () => {
      disposed = true;
      controller.abort();
      if (created !== null) {
        URL.revokeObjectURL(created);
      }
    };
  }, [itemId, selectedIndex, sidecars]);

  return { url, failed };
}

// TrackControls — the watch controls row beside the play affordance
// (serial-watch-flow 5.1–5.3): the subtitle select (off + one entry per
// subtitle sidecar, language-then-folder-then-file labels; an unrenderable
// sidecar such as .sub renders as an explicit not-renderable DISABLED entry —
// listed, never a selectable entry that does nothing) and the voiceover
// select (embedded audio + the descriptor's voiceovers; on a direct build the
// control is disabled with the visible packaged-build-required reason, since
// only the hls lane carries alternate audio renditions to switch).
// Presentational — the selection state and the fetch lifecycle live in the
// page above.
function TrackControls(props: {
  sidecars: SubtitleSidecar[];
  selectedSubtitle: number | null;
  onSubtitleSelect: (index: number | null) => void;
  subtitleFailed: boolean;
  voiceovers: VoiceoverDTO[];
  hlsMode: boolean;
  voiceover: number;
  onVoiceoverSelect: (track: number) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      {props.sidecars.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="subtitle-select" className="text-sm font-medium">
            Subtitles
          </label>
          <select
            id="subtitle-select"
            className="rounded-md border bg-card px-2 py-1.5 text-sm"
            value={
              props.selectedSubtitle === null
                ? ""
                : String(props.selectedSubtitle)
            }
            onChange={(event) =>
              props.onSubtitleSelect(
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
          >
            <option value="">Off</option>
            {props.sidecars.map((sidecar) =>
              sidecar.renderable ? (
                <option key={sidecar.index} value={String(sidecar.index)}>
                  {sidecar.label}
                </option>
              ) : (
                <option
                  key={sidecar.index}
                  value={String(sidecar.index)}
                  disabled
                >
                  {sidecar.label} — not renderable
                </option>
              ),
            )}
          </select>
          {props.subtitleFailed ? (
            <span className="text-xs text-destructive" role="alert">
              Subtitle could not be loaded.
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="voiceover-select" className="text-sm font-medium">
          Voiceover
        </label>
        <select
          id="voiceover-select"
          className="rounded-md border bg-card px-2 py-1.5 text-sm disabled:opacity-50"
          value={String(props.voiceover)}
          disabled={!props.hlsMode}
          onChange={(event) =>
            props.onVoiceoverSelect(Number(event.target.value))
          }
        >
          <option value="0">Embedded audio</option>
          {props.voiceovers.map((entry, k) => (
            // Document order → rendition k+1 (0 is the embedded audio) — the
            // pack lane's pinned build order (D-2).
            <option key={entry.index} value={String(k + 1)}>
              {entry.label}
            </option>
          ))}
        </select>
        {!props.hlsMode ? (
          <span className="text-xs text-muted-foreground">
            Audio selection requires the packaged build — this episode plays
            direct.
          </span>
        ) : null}
      </div>
    </div>
  );
}

// IdentityBlock — the identity column: the element's name as the primary
// identity, its raw path, and the module's mandatory identity badges
// (module config `identity_fields` via the presentation block, resolved
// _view-first then across namespaces — D-1). A mandatory field with no value
// renders the slot state — naming the missing field and its remedy — never a
// blank and never a fabricated value (the episode-name case until a naming
// source lands). Carries the resume/progress row for video items.
function IdentityBlock(props: {
  item: ItemDTO;
  doc: ItemDocument;
  presentation?: ModulePresentation;
}): ReactElement {
  const { item, doc, presentation } = props;
  const identityFields = presentation?.identity_fields ?? [];

  // Season/episode eyebrow — config-driven: derived only when the module
  // declares BOTH fields and the document resolves both.
  const season = identityFields.includes("season")
    ? resolveIdentityValue(doc, "season")
    : undefined;
  const episode = identityFields.includes("episode")
    ? resolveIdentityValue(doc, "episode")
    : undefined;
  const eyebrow =
    present(season) && present(episode)
      ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
      : null;

  // The element name: the computed title facts first; the derived eyebrow
  // stands in as the episode number when no naming source wrote a name (the
  // episode-name slot below); the raw path is the last resort.
  const nameValue = [
    resolveIdentityValue(doc, "title"),
    resolveIdentityValue(doc, "display_title"),
  ].find(present);
  const heading =
    nameValue !== undefined
      ? String(nameValue)
      : eyebrow ?? item.relative_path;

  // Resume/progress row (video): the stored playback position, when one
  // exists — whole-minute wording; the player owns the actual resume.
  const progress = useProgressList();
  const position = progress.data?.items.find(
    (entry) => entry.item_id === item.id,
  )?.position_seconds;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {eyebrow ? (
        <p className="font-mono text-sm text-muted-foreground">{eyebrow}</p>
      ) : null}
      <h1 className="break-words text-2xl font-semibold">{heading}</h1>
      <p className="break-all font-mono text-xs text-muted-foreground">
        {item.relative_path}
      </p>

      {identityFields.length > 0 ? (
        <div className="flex flex-col gap-2">
          {identityFields.map((field) => {
            const value = resolveIdentityValue(doc, field);
            const label = humanizeField(field);
            return present(value) ? (
              <div key={field} className="flex flex-wrap items-baseline gap-2">
                <Badge variant="secondary" className="gap-1">
                  {label}: <JsonValue value={value} />
                </Badge>
              </div>
            ) : (
              <SlotNote
                key={field}
                label={`${label} — not identified`}
                note="No attached parser wrote this field yet — run or attach the parser that provides it."
              />
            );
          })}
        </div>
      ) : null}

      {/* The episode-name case: no naming source wrote a name, the derived
          episode number stands in as the heading, and the slot names what is
          missing (never a blank heading). */}
      {nameValue === undefined && eyebrow ? (
        <SlotNote
          label="Episode name — not identified"
          note="No attached parser wrote a name for this episode yet — the derived episode number stands in."
        />
      ) : null}

      {isVideoItem(item) ? (
        <p className="text-sm text-muted-foreground">
          {typeof position !== "number"
            ? "Play from the start."
            : position >= 60
              ? `Resume — ${Math.floor(position / 60)} min in.`
              : "Resume — less than a minute in."}
        </p>
      ) : null}
    </div>
  );
}

// HeroImage — the media stage's lead image, filling its column with its
// aspect preserved (object-contain; 80vh caps tall photos so the identity
// stays reachable). Same error contract as the collection tiles' <img>: a
// decode failure hides the element (fetch failures already null the URL
// inside useItemMedia) — never a broken-image glyph.
function HeroImage(props: { src: string; alt: string }): ReactElement | null {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  return (
    <img
      src={props.src}
      alt={props.alt}
      className="max-h-[80vh] w-full rounded-lg border bg-card object-contain"
      onError={() => setFailed(true)}
    />
  );
}
