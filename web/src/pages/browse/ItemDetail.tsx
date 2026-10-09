// SPDX-License-Identifier: Apache-2.0
import { useState, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError, ItemDTO } from "@/lib/api";
import {
  ENDPOINTS,
  getPlayback,
  hasFrameGrabberThumb,
  hasOriginalFile,
  playItem,
} from "@/lib/api";
import { useItem, useItemMedia } from "@/lib/queries";
import Player from "@/components/playback/Player";
import {
  provenanceEntries,
  sourcesOf,
  stageEntries,
  viewEntries,
} from "@/lib/document";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ProvenanceBadge } from "@/components/metadata/ProvenanceBadge";
import { SourceCard } from "@/components/metadata/SourceCard";
import { StagesProgress } from "@/components/metadata/StagesProgress";
import { ViewFields } from "@/components/metadata/ViewFields";
import { Card, CardContent } from "@/components/ui/card";

// ItemDetail — the full §3.1 document for one item (/items/:id), rendered
// VERBATIM (INV-no-rounding, INV-no-merge) in two visual tiers:
//   Details surface (always visible — the viewer-facing reading view):
//     hero    media image       — the item's own media (walkthrough feedback:
//                               an item page without its image reads broken)
//                               via the same authenticated channel as the
//                               collection tiles
//     core    item-managed fields — id/module/library/path/type/status/version
//     Tier 1  identifiers        — plain list
//     Tier 3  _view              — <ViewFields> (values verbatim via JsonValue)
//   Technical details (collapsed until expanded — audit plumbing, content
//   byte-identical to the former always-visible renders):
//     Tier 2  sources.<plugin>   — one <SourceCard> per sourcesOf(doc) entry,
//                                  never merged across plugins
//     audit   _provenance        — one <ProvenanceBadge> per provenance entry
//     trail   _stages            — <StagesProgress> (per-stage error when present)
//
// INV-no-direct-fetch: the page touches the API only through its client-layer
// seams — useItem (queries.ts) for the document, plus the packaged-playback
// pair (getPlayback via useQuery; playItem via useMutation — the retry
// affordance, D-7's only playback mutation). Error edges: ApiError code
// "not_found" (HTTP 404) → a clear not-found state, never a crash; any other
// failure → the canonical error (code + message) surfaced inline.

export default function ItemDetail(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useItem(id ?? "");

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

  const item = data?.item;
  if (!item) {
    // Defensive: success without a payload should not happen (server always
    // returns {item}); fail calm instead of crashing on undefined access.
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <EmptyState message="Item not found." />
      </main>
    );
  }

  return <ItemDetailView item={item} />;
}

// ItemDetailView — mounted only with a loaded item, so the document accessors
// run against real data (components receive parsed data as props; none fetch).
function ItemDetailView(props: { item: ItemDTO }): ReactElement {
  const { item } = props;
  const doc = item.document;
  const identifiers = Object.entries(doc.identifiers ?? {});
  const sources = sourcesOf(doc);
  const provenance = provenanceEntries(doc);
  const viewRecord = Object.fromEntries(
    viewEntries(doc).map((e) => [e.fieldPath, e.entry]),
  );

  // Hero media URL — the same client-side pre-selection the collection tiles
  // use (media-preview D6): the frame-grabber thumb when the document names
  // one, else the original only for image-typed items (a video original
  // downloads rather than renders in an <img>). null → no hero section and no
  // request at all; a fetch failure nulls the URL inside useItemMedia, so the
  // page just falls back to the fields-only layout — never a broken-image.
  const heroUrl = hasFrameGrabberThumb(doc)
    ? ENDPOINTS.itemMedia(item.id, "thumb")
    : item.media_type === "image" && hasOriginalFile(doc)
      ? ENDPOINTS.itemMedia(item.id)
      : null;
  const hero = useItemMedia(heroUrl);

  // Playback (packaged-playback): the descriptor for video items — mode hls
  // plays the packaged stream, mode direct the original floor. A descriptor
  // failure never breaks the page: the fields below stay, the player is
  // simply not rendered (playback is an augmentation, not the identity).
  const playback = useQuery({
    queryKey: ["playback", item.id],
    queryFn: () => getPlayback(item.id),
    enabled: item.media_type === "video",
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

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      {hero !== null ? (
        <section aria-label="Media">
          <HeroImage src={hero} alt={item.relative_path} />
        </section>
      ) : null}

      {item.media_type === "video" && playback.data ? (
        <Player
          itemId={item.id}
          descriptor={playback.data}
          onRetry={() => playRetry.mutate()}
          retrying={playRetry.isPending}
        />
      ) : null}

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

      {/* Technical details — audit plumbing collapsed until expanded (D7).
          Native <details>/<summary>: the simplest accessible disclosure. The
          wrapped renders are byte-identical to the former always-visible
          sections; only their visibility changed. */}
      <details className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
          Technical details
        </summary>
        <div className="flex flex-col gap-6 px-4 pb-4">
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

// HeroImage — the Details surface's lead image, filling the content column
// with its aspect preserved (object-contain; 80vh caps tall photos so the
// fields stay reachable). Same error contract as the collection tiles'
// <img>: a decode failure hides the element (fetch failures already null the
// URL inside useItemMedia) — never a broken-image glyph.
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
