# Proposal: media-preview — real media bytes and a viewer-first detail page

## Why

Nothing serves media bytes anywhere: photos render ratio-correct placeholder
tiles, collection cards carry no preview image, and the operator sees blank
surfaces after a successful scan — because the scan stamps
`parsed.absolute_path` into the item document and frame-grabber writes real
JPEGs under `<dataDir>/thumbs/` (stamped as `thumbnail_path` into its source
namespace) but no endpoint reads either back over HTTP. Separately, the item
detail page renders all six document sections unconditionally, so with one
populated source the View duplicates Sources and the audit plumbing
(Provenance, Pipeline stages) drowns the viewer-facing fields.

## What Changes

- **Media serving (bytes MVP):** one new endpoint `GET
  /api/v1/items/{id}/media` in the browse role group (admin+client, behind the
  existing bearer authentication) serving the item's file — photo originals
  from the document's `parsed.absolute_path`, and with `?variant=thumb` the
  frame-grabber JPEG from the document's `sources["frame-grabber"].thumbnail_path`
  when present. `http.ServeContent` bytes with Content-Type by extension, a
  strong ETag + `Cache-Control: private, immutable`, and HEAD/304 support.
  Paths resolve only from the stored document — never from a client-supplied
  value; missing facts or files answer 404. Non-image bytes (video) carry
  `Content-Disposition: attachment` — **video files download, they do not
  stream**: no range-seeking UI, no transcode, `internal/stream` stays
  deferred (docs/backlog.md).
- **SPA renders real media:** photo masonry tiles render `<img>` from the
  media endpoint (thumb variant when the document carries the frame-grabber
  fact, else the original) with the ratio-correct placeholder as fallback;
  movie cards and serial episode cards render the frame-grabber thumbnail when
  present; Home collection cards gain a preview image from a representative
  item with a badge-only fallback. The SPA consumes media through its
  authenticated fetch wrapper into object URLs (an `<img>` channel cannot
  carry the bearer header), so the endpoint stays fully gated.
- **Item detail restructure (collapsible disclosure):** the page leads with a
  **Details** surface — core item fields, `identifiers`, and the merged
  `_view` — while `sources.<plugin>` (SourceCard per namespace), `_provenance`
  (ProvenanceBadge), and `_stages` (StagesProgress) collapse into one
  **Technical details** section hidden unless expanded. Fidelity invariants
  are untouched: verbatim values, no namespace merging, no
  `dangerouslySetInnerHTML`, Cyrillic passthrough.
- **Deferred (explicit non-goals):** no client-role minting, no server-side
  redaction of technical sections (rides B3/D18), no series-poster images
  (series documents carry no media fact; episodes do), no in-browser playback.

No breaking changes: the endpoint is additive; every SPA delta renders data
the server already sends; the items table gains no column (both path facts
already live in the document JSON).

## Capabilities

### New Capabilities

- **`media-serving`** — static byte serving for item media: the
  `/api/v1/items/{id}/media` endpoint (variants, caching headers, error
  contract, document-only path resolution, the video-downloads-not-streams
  boundary). API behavior, independently consumable by future surfaces
  (streaming, TMDB poster work).

### Modified Capabilities

- **`web-ui`** — the Item detail view requirement is amended: Details becomes
  the primary surface and Sources/Provenance/Pipeline stages move into a
  collapsed Technical details disclosure (content fidelity requirements stay
  intact — visibility changes, content does not). The Collection pages
  requirement is amended so photo tiles, movie cards, and episode cards render
  real media from the endpoint with placeholder fallbacks. The SPA endpoint
  allowlist gains the media route. The embedded-build requirement now also
  carries the media surface (dist + regenerated OpenAPI). New requirement:
  collection card previews on Home.

## Impact

- `internal/api` — new `itemMedia` handler + route in the browse group
  (router.go `mountV1Routes`), unit tests beside the handler; swag annotations
  regenerate the committed `internal/web/api/openapi.{json,yaml}`.
- `web/src` — `lib/api.ts` (media URL + authenticated blob helper),
  `pages/collections/Collection.tsx` (PhotoTile, MovieCard), `pages/home/Home.tsx`
  (CollectionCard), `pages/browse/ItemDetail.tsx` (disclosure) + vitest suites.
- `internal/web/dist/` — rebuilt and committed (the Go gate stays node-free;
  embed directive untouched).
- No DB migration (the items DDL is untouched — path facts live in the
  document), no proto/`+pkg`/sdk edits (byte-identity guards), no changes to
  the enrichment chain or the scan pipeline.
