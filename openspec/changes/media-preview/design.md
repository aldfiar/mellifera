# Design — media-preview

## Context

The wire today carries facts, not bytes. Scan stamps the file's absolute path
into the item document (`internal/scan/run.go:531`,
`parsed.absolute_path = filepath.Join(rootPath, rel)`) and frame-grabber
writes real JPEGs under `<dataDir>/thumbs/`, stamping the path into its
namespace (`plugins/frame-grabber/grabber.go:131`,
`sources["frame-grabber"].thumbnail_path`) — but no endpoint reads either
back over HTTP, so the SPA knowingly renders placeholders (`PhotoTile`
comment: "media serving is a deferred capability"). The items table has no
path column (`internal/store/open.go` — `relative_path` only); both path
facts live in the document JSON, which `store.GetItem` already returns
opaquely.

The item detail page renders all six document sections unconditionally
(`web/src/pages/browse/ItemDetail.tsx`), so with one populated source the
View duplicates Sources and audit plumbing (Provenance, Pipeline stages)
sits at the same visual level as viewer-facing fields. The operator decided
both fixes (AskUserQuestion, 2026-10-08): a bytes-MVP media endpoint and a
collapsible-disclosure restructure — no client-role minting, no server-side
redaction (that rides B3/D18).

## Goals

- One gated endpoint that turns the two existing document facts into bytes —
  photos and existing thumbnails render, with zero new persistence.
- The SPA stops shipping placeholder-only surfaces: photo masonry, movie/episode
  cards, and Home collection cards render real media with honest fallbacks.
- The detail page leads with what a viewer reads; audit plumbing stays
  one click away, byte-for-byte unchanged in content.

## Non-goals (explicit deferrals)

- Streaming: no range-seeking UI, no transcode, no HLS/DASH — `internal/stream`
  stays deferred (docs/backlog.md). Video bytes download (`attachment`).
- Client-role minting and server-side redaction of technical sections (B3/D18).
- Series-poster images: series documents carry no media fact (frame-grabber
  thumbs live on episode items); the series grid keeps its poster placeholder.
- A video download button in the SPA: the endpoint's `attachment` posture is
  the contract; a UI affordance can follow once playback lands.

## Interfaces

### API (under `/api/v1`, behind the existing bearer middleware)

| Endpoint | Group | Contract |
|---|---|---|
| `GET /items/{id}/media[?variant=thumb]` | browse (admin+client) | original: document `parsed.absolute_path` bytes; thumb: `sources["frame-grabber"].thumbnail_path` JPEG; Content-Type by extension, strong ETag, `Cache-Control: private, immutable`, 304/HEAD; non-image → `Content-Disposition: attachment`; 404 unknown id / no fact / missing file; 400 unknown variant |

Registered in `mountV1Routes`' browse group (`internal/api/router.go`) next to
`GET /items/{id}`; handler in `internal/api/handlers.go` following the
`getItem` pattern (`chi.URLParam` → `store.GetItem` → serve instead of
`writeJSON`). OpenAPI regenerated via swag annotations (dev-time `make
web-build`), committed.

### SPA consumption (`web/src/lib/api.ts` + consumers)

`itemMedia(id, variant?)` URL builder plus an authenticated media fetch:
`fetch` through the existing Bearer wrapper → `blob` → `URL.createObjectURL`,
revoked on unmount. Consumers: `PhotoTile` (Collection.tsx), `MovieCard`
(movies grid + serial episode flow), `CollectionCard` (Home.tsx). The variant
is chosen client-side from the document already in hand (frame-grabber
namespace present → thumb), so the thumb-404 path stays cold.

### Cross-group seam

Group 1 owns the endpoint (handlers + router + tests + openapi); group 2 owns
the SPA consumers of exactly that URL grammar; group 3 (detail restructure) is
independent of both; group 4 delivers openapi/dist/qa depth.

## Decisions

- **D1 — separate `media-serving` capability.** Byte serving is API behavior
  consumable beyond this SPA (future streaming, TMDB art); folding it into
  `web-ui` would bury an endpoint contract in a UI spec. SPA consumption
  deltas stay in `web-ui`, matching how `playback-progress` split from it.
- **D2 — document-only resolution, no schema change.** Both path facts
  already live in the document JSON; the handler parses
  `parsed.absolute_path` / `sources["frame-grabber"].thumbnail_path` from
  `store.GetItem`'s opaque document. No DDL, no migration, no
  client-supplied path ever consulted. Alternative (a `media_path` column +
  resolver) rejected: duplicate state, migration cost, zero behavioral gain.
- **D3 — `http.ServeContent` + strong ETag + `private, immutable`.** The
  operator's named primitive: stdlib Content-Type/conditional handling for
  free. ETag = `"<size>-<mtimeNano>"` (strong — no content hashing of
  potentially multi-GB videos). `private` because the content is
  bearer-authed (no shared-cache leakage). Alternative (hand-rolled
  `io.Copy`, no Range) rejected: loses 304/HEAD for free. ServeContent's
  Range support remains as stdlib resumable-download mechanics — it is not
  the deferred streaming capability (no player, no seek UI, no transcode).
- **D4 — non-image → `Content-Disposition: attachment`.** Encodes "video
  files download but do NOT stream" at the HTTP layer and closes the
  inline-serving XSS vector (a stored `.html`/`.svg` is never rendered
  inline under our origin). Images stay `inline` (the `<img>` use case).
- **D5 — SPA media via authenticated blob fetch.** An `<img src>` request
  cannot carry the `Authorization` header, and the endpoint must stay gated
  (browse group). Alternatives rejected: token-as-query-param (credential
  leaks into logs/history), unauthenticated media route (weakens the entire
  auth posture for one feature), cookie auth (new machinery for an MVP).
  Cost: object URLs per tile — acceptable at personal-library scale.
- **D6 — thumb miss is a 404, SPA-side pre-selection.** `?variant=thumb`
  without a `thumbnail_path` fact → 404 `not_found` (strict contract). The
  SPA reads the frame-grabber namespace from the document it already holds
  and only requests the thumb variant when the fact exists, falling back to
  the original (photos) or placeholder otherwise. Server-side fallback
  (thumb→original) rejected: hides the distinction from every consumer.
- **D7 — disclosure restructure keeps the components.** `<details>`-style
  disclosure wraps the existing `SourceCard`/`ProvenanceBadge`/
  `StagesProgress` renders; the Metadata rendering fidelity requirement is
  untouched (visibility changes, content does not). Alternative (separate
  `/admin`-style audit page) rejected: hides the plumbing the operator
  explicitly wants one click away.
- **D8 — card preview = single representative tile.** The card fetches the
  collection's first items (`GET /items?library={id}&limit=…` already
  supported) and previews the first item whose media resolves. A 4-tile
  collage is a look upgrade, not a contract change — deferred; the spec pins
  "a representative item's media", not the tile count.
- **D9 — additive posture.** No proto/`+pkg`/sdk edits (byte-identity guard
  tests), enrichment chain untouched, node-free Go gate intact; committed
  dist rebuilt once in the delivery group.

## Risks / Trade-offs

- [Large originals fetched as blobs for masonry tiles] → prefer the thumb
  variant whenever the frame-grabber fact exists (photo pipelines can add one
  later); object URLs revoked on unmount; full originals only when no thumb
  fact exists.
- [Stale `absolute_path` after a root move/library remount] → 404 → the SPA
  falls back to the placeholder; the admin identity warning already documents
  the hazard; no new failure mode beyond today's blank tile.
- [ETag from size+mtime, not content] → write-once scan/enrich files make
  collisions practically impossible; a re-scan that rewrites bytes also
  refreshes mtime.
- [Blob fetch doubles memory for video downloads] → downloads are explicit,
  infrequent, and untracked by the SPA; the streaming capability owns the
  real fix.
- [Greps are weaker than behavior] → the qa group adds hermetic itest depth
  (real server, seeded document, bytes on disk); the reviewer confirms the
  UNPROBEABLE walkthrough; vitest covers tile/fallback branches dev-time.

## Migration Plan

Purely additive: deploy = rebuild + restart (single binary). Committed
artifacts regenerate in the delivery group: swag → `openapi.{json,yaml}`,
`make web-build` → committed `internal/web/dist`. Rollback = revert; no data,
schema, or contract migration exists to undo.

## Open Questions

- Card preview tile count (single tile now; collage later) — visual review at
  the gate may upgrade D8 without touching specs.
- Whether ItemDetail should also surface the item's own media hero image —
  not requested; deferred so the disclosure change stays reviewable alone.
