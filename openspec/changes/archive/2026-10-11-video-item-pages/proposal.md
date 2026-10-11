# Proposal: video-item-pages — playback that mounts for real media types, and the collapsed-technical presentation on every item page

## Why

The SPA gates every playback surface on `media_type === "video"`, but no
scanner ever writes `"video"`: both scanners stamp the module's media type
(`plugins/base-scanner/scanner.go:68`, `plugins/serial-scanner/scanner.go:115`,
passed through `internal/scan/run.go:130`), and the module registry seeds
exactly `tv`, `image`, `serial` (`internal/module/registry.go`). A ready
episode therefore never fetches its playback descriptor and never mounts the
Player — playback is unreachable from every film and episode page despite a
fully functional backend. The user's own episode shows it live: status `ready`,
media_type `serial`, `GET /items/{id}/playback` answers 200 with a playable
hls playlist, and the page still renders no playback surface at all. The vitest
fixtures carried synthetic `media_type: "video"`, so the suites stayed green
over dead gates.

Second, the item page renders its "Item" core-field list, "Identifiers", and
"View" sections inline on every item. On a densely enriched film or episode
that reads as a wall of technical data always visible, while the presentation
the user holds up as correct keeps only identity fields visible and technical
data under the collapsed "Technical details" disclosure.

## What Changes

- **Structural video-ness (SPA):** the item page derives video-ness
  structurally — non-image items (`tv`, `serial` today) versus image items —
  through shared predicates (`isVideoItem`/`isPhotoItem` in
  `web/src/lib/api.ts`, beside the existing document-fact helpers), and every
  `"video"`-literal gate swaps to the predicate: the descriptor query, the
  Player mount, the watch controls, the media-first two-column lane, and the
  resume row. The backend is untouched on purpose: `GET /items/{id}/playback`
  already answers every item (unknown id → 404; an image would get a valid
  `direct` descriptor with the original as its play URL — which is exactly why
  the Player mount must stay structurally gated, not descriptor-gated).
- **Collapsed-technical parity (SPA):** the flat "Item" core-field list,
  "Identifiers", and "View" sections move inside the existing collapsed
  "Technical details" disclosure — on every item page, image included: the
  media-first ladder (media stage + play affordance for video items, the photo
  itself for images), the identity block, and the parser-ordered footer stay
  always visible; everything technical (core fields, identifiers, view fields,
  sources, provenance, pipeline stages) lives under the one disclosure. Photo
  and video tails become structurally identical — one shared layout, no
  media-type fork in the page skeleton.
- **Production-shaped fixtures (tests):** the vitest fixtures stop carrying
  synthetic `media_type: "video"` (a value production never stores) —
  `api.test.ts`, `ItemDetail.test.tsx`, `Home.test.tsx`,
  `Collection.test.tsx` fixtures use `tv`/`serial`/`image`, and the ItemDetail
  tests assert the player mounts and the video lane renders for a `serial`
  episode — closing the vacuous-fixture class that shipped this bug.
- **Delivery:** the committed embedded build (`internal/web/dist`) regenerates
  via the dev-time `make web-build` path and is committed; no OpenAPI change
  (no route or annotation edits).

Explicitly out of scope: any backend change — no scanner re-stamp, no stored
`media_type` migration, no descriptor contract change, no new endpoints; the
series page's episode rows and the movie/photo grid cards (list tiles — the
photo counterpart carries no collapsed technical either, so list-tier parity
already holds); the Player component's internals (it already handles every
descriptor state — this change only makes the surface reachable); and
`Home.tsx`'s `media_type === "image"` preview pick (image items do carry
`"image"`; that comparison is correct as written).

## Capabilities

### New Capabilities

None — every delta extends an existing capability.

### Modified Capabilities

- **`web-ui`** — the **Item detail view** requirement is amended: which lane
  an item's page uses follows the structural image/non-image split (never a
  `media_type` value no scanner writes), and the two tiers move — the Details
  surface keeps the media-first ladder, the identity block, and the
  parser-ordered footer always visible, while the core item fields,
  identifiers, view fields, sources, provenance, and pipeline stages all
  collapse under the Technical details disclosure. The **Video playback in the
  SPA** requirement gains the structural descriptor-fetch obligation (fetch
  for every non-image item; the descriptor decides playability) and a
  ready-serial-episode-mounts scenario. A delivery requirement pins the
  rebuilt embedded build.

## Impact

- `web/src/lib/api.ts` — two predicate helpers (`isVideoItem`/`isPhotoItem`)
  and the `ItemDTO.media_type` doc comment corrected to the production
  vocabulary (`"tv" | "image" | "serial"` — `"video"` never occurs).
- `web/src/pages/browse/ItemDetail.tsx` — the five `"video"`-literal gates
  swap to the predicate; the flat tail sections fold under the disclosure.
- `web/src` test fixtures — four test files move to production-shaped
  media_type values; ItemDetail tests gain the serial-episode playback-mount
  assertions.
- `internal/web/dist` — rebuilt + committed. No Go changes, no wire changes,
  no data migration, no new Go or npm dependencies.
