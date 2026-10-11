# Design: video-item-pages

## Context

Stored `media_type` values are the module registry's vocabulary — `tv`,
`image`, `serial` (`internal/module/registry.go:53,111,150`); both scanners
stamp the module's type onto every item
(`plugins/base-scanner/scanner.go:68`, `plugins/serial-scanner/scanner.go:115`,
via `internal/scan/run.go:130`). The SPA nonetheless gates every playback
surface on `media_type === "video"`
(`web/src/pages/browse/ItemDetail.tsx:324,379,390,449,838`) — a value no
scanner writes — so no real item ever fetches its playback descriptor or
mounts the Player, and every film/episode page also falls into the photo lane
arrangement. The backend needs nothing: `GET /items/{id}/playback` answers
every item (`internal/api/playback.go` — unknown id → 404, else 200), and
`stream.Service.Describe` keeps the unconditional direct floor
(`internal/stream/describe.go:71`) — an image item would receive a valid
`{mode:"direct", play_url:"/media/<id>/original"}` descriptor. The vitest
suites stayed green because their fixtures carry the synthetic `"video"`
(`ItemDetail.test.tsx:41`, `Home.test.tsx:75`, `Collection.test.tsx:74`,
`api.test.ts:140,171`).

On presentation, the page tail is already shared: the collapsed "Technical
details" disclosure (`ItemDetail.tsx:546-590`) renders for every item — what
differs is that the flat "Item"/"Identifiers"/"View" sections
(`ItemDetail.tsx:479-540`) sit ABOVE it always-visible, and on enriched video
pages they are densely populated while on photos they are near-empty. The
user's reference ("some fields show every time, technical data under a
collapsed element") is the photo page's perceived shape; the fix is to make
the tail honor it structurally.

## Goals / Non-Goals

Goals: a ready film or episode page fetches the descriptor and mounts the
Player; every item page shows identity essentials always and all technical
data under the one disclosure; the test suites use production-shaped media
types so the gate can never rot back silently.

Non-Goals:

- No backend change of any kind — no re-stamp, no migration, no descriptor
  contract change, no new routes (the SPA endpoint allowlist is untouched).
- No Player redesign — hls/direct lanes, partial attach, failed retry are
  already correct; only the gate in front of them changes.
- No list-tier restructure — episode rows (EpisodeCard/MovieCard) and grid
  cards keep their chips; the photo-tile counterpart has no collapsed
  technical either, so parity at the list tier already holds.
- No `Home.tsx:286` change — `media_type === "image"` there is correct (image
  items carry `"image"`).

## D-1 — Video-ness is structural, not a literal

One shared predicate pair in `web/src/lib/api.ts` beside the existing
document-fact helpers (`hasFrameGrabberThumb`, `hasOriginalFile` — the house
pattern for this layer): `isPhotoItem(item)` = `media_type === "image"`;
`isVideoItem(item)` = `!isPhotoItem(item)`. The item page swaps all five
`"video"`-literal gates to the predicate; the `ItemDTO.media_type` doc comment
corrects to the production vocabulary.

Alternatives rejected:

- *Fetch the descriptor unconditionally* — the direct floor means an image
  item gets a valid descriptor pointing at the original file; the Player would
  mount a `<video>` on every photo page. The fetch gate and the mount gate
  must both be structural. (Verified against `internal/stream/describe.go:61` —
  designed against real behavior, not assumption.)
- *Allowlist `=== "tv" || === "serial"`* — a future video-ish module would
  silently lose playback; `!== "image"` is forward-permissive. The trade-off
  (a hypothetical non-image, non-video module would mount a direct player on
  its original) is named in Risks; no such module exists in the registry.

## D-2 — One shared tail; the flat sections fold under the disclosure

The always-visible tier becomes: the media-first ladder (media stage + play
affordance for video items; the photo full-width for images), the identity
block, and the parser-ordered `ParserFooter`. The collapsed "Technical
details" disclosure gains the flat "Item" core-field list, "Identifiers", and
"View" sections ahead of Sources/Provenance/Pipeline stages — one disclosure,
one order, identical structure for photo and video items. Alternative
rejected: restructure only non-image pages (keep photos byte-identical) — it
forks the tail on the very predicate this change introduces to REMOVE forks,
and the folded photo page still matches the user's description (identity
always, technical collapsed).

Existing behavior preserved inside the move: the disclosure stays a native
uncontrolled `<details>`; renders are byte-identical to the former
always-visible sections; the media-first ladder, hero rules, and not-found
state are untouched.

## D-3 — Fixtures carry production-shaped media types

The four fixture sites move to the values production stores (`tv`, `serial`;
`image` only for image modules), and ItemDetail tests assert the
production-shaped behavior: a `media_type: "serial"` ready episode renders the
video lane and mounts the Player when its (mocked) descriptor arrives. This is
the vacuous-fixture class that shipped the bug — the suites must fail if
someone reintroduces a literal no scanner writes. Probe greps pin the
negative: `media_type === "video"` must not exist anywhere in `web/src`
non-test source or fixtures (the ffprobe `codec_type: "video"` stream fact in
`document.test.ts` is a different datum and stays).

## D-4 — Additivity posture

Zero Go changes, zero wire changes, zero new dependencies, zero env knobs. The
committed `internal/web/dist` regenerates through the dev-time `make
web-build` path; the OpenAPI files must come out byte-identical (no
annotation edits — on drift, STOP and surface). Rollback = revert.

## Interfaces (cross-group)

- **Shared predicates:** `isPhotoItem(item: ItemDTO): boolean` and
  `isVideoItem(item: ItemDTO): boolean` exported from `web/src/lib/api.ts`
  (beside `hasFrameGrabberThumb`/`hasOriginalFile`); `isVideoItem` is defined
  as `!isPhotoItem(item)` — the single definition site of the image/non-image
  split. `ItemDetail.tsx` imports them; no other consumer in this change.
- **Media type vocabulary (existing, read-only):** `ItemDTO.media_type`
  carries the module registry values — `"tv" | "image" | "serial"` today; the
  SPA treats `image` as the photo family and everything else as the video
  family. No wire change.
- **Embedded build:** `make web-build` (swag + `cd web && npm ci && npm run
  build`; vite `outDir` is `../internal/web/dist`) — same delivery path as
  prior changes; `internal/web/api/openapi.{json,yaml}` expected unchanged.

## Risks / Trade-offs

- [A future non-image, non-video module would get a direct player on its
  original file] → no such module exists; when one lands, the predicate
  refines there (or the descriptor grows a capability flag) — a one-line
  change at the single definition site.
- [Folding the flat sections under the collapse changes the photo page too]
  → deliberate (D-2): one shared tail, and the photo page still matches the
  user's stated reference shape; the proposal states this for GATE 1.
- [Probes grep comments/vocabulary (`media-first`, `Technical details`) that
  a careless refactor could drop] → same brittle-but-honest house style as
  the living specs; the vitest assertions carry the behavioral weight.
- [Delivery probe rebuilds the bundle (`npm run build`) — slow for a probe]
  → one box, once per gate; it buys a real freshness guarantee (committed
  dist == fresh build), which bundle-literal greps cannot provide for a
  logic-only rebuild.

## Migration Plan

None — revert is the rollback; no data or contract migration in either
direction.

## Open Questions

None — the scope decisions (episode rows out; photo page folds too; no
backend change) are stated in the proposal for GATE 1 approval.
