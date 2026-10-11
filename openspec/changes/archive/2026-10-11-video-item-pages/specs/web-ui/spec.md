## MODIFIED Requirements

### Requirement: Item detail view

The SPA SHALL offer an `/items/:id` route (wrapped in `<RequireAuth>`) that
fetches the pre-existing `GET /api/v1/items/{id}` and renders the §3.1
document in two visual tiers. Which arrangement an item's page uses SHALL
follow the item's media type structurally — the image family
(`media_type === "image"`) versus the video family (every non-image item; the
registry media types production stores are `tv` and `serial`) — through one
shared predicate, never a `media_type` value no scanner writes. The
**Details** surface renders directly on the page and follows the media-first
ladder: the media stage is the dominant surface (for a video item a
two-column arrangement — media stage with the play affordance LEFT, identity
column RIGHT; for image-typed items the photo IS the page, full-width) with
the identity block — element name, raw path, and the module's mandatory
identity badges per `identity_fields` — beside/below it, and the
parser-ordered metadata footer (`ParserFooter`, per the parser-display
capability) between the identity block and the Technical details disclosure —
together the always-visible reading view. The **Technical details** section —
the core-managed item fields (id, module_id, library_id, file_id,
relative_path, media_type, status, schema_version), Tier-1 `identifiers`,
`<ViewFields>` for `_view` entries (value + source + reason), one
`<SourceCard>` per `sources.<plugin>` namespace, a `<ProvenanceBadge>` per
`_provenance` entry, and `<StagesProgress>` for `_stages` entries (stage,
plugin_id, status, advanced_to, started_at, finished_at, error?) — SHALL be
collapsed (hidden) until the operator expands its disclosure, and SHALL
render those tiers exactly as delivered once expanded: verbatim values,
per-source namespaces never merged. The Details surface SHALL lead with the
item's own media image when one is resolvable — the frame-grabber thumb fact
(`sources["frame-grabber"].thumbnail_path`), else the original
(`parsed.absolute_path`) for an image-typed item — fetched through the
authenticated media channel at content-column width, aspect preserved; an
item whose media cannot render as an image (a video without the thumb fact,
a document with no media facts) SHALL render no hero image and no
broken-image state. A missing item (404 not_found) SHALL render a clear
not-found state, not a crash.

#### Scenario: All document tiers render

- **WHEN** the operator opens `/items/:id` for an enriched item carrying core fields, identifiers, sources, _view, _provenance, and _stages and expands the Technical details disclosure
- **THEN** the always-visible surface renders the media-first ladder, the identity block, and the parser-ordered footer, and the expanded disclosure renders the core item fields, identifiers, view fields, one card per source namespace, one badge per provenance entry, and the stage progress including any per-stage error

<!-- wf:probe id=947598386519921e -->
```bash
set -e
test -f web/src/pages/browse/ItemDetail.tsx
for c in SourceCard ProvenanceBadge ViewFields StagesProgress; do
  grep -q "$c" web/src/pages/browse/ItemDetail.tsx
done
grep -q "identifiers" web/src/pages/browse/ItemDetail.tsx
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.tsx
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Technical details collapsed by default

- **WHEN** the operator opens `/items/:id` for an enriched item
- **THEN** the media stage, identity block, and parser footer render immediately while the core item fields, identifiers, view fields, sources, provenance, and pipeline stages stay hidden until the Technical details disclosure is expanded

<!-- wf:probe id=d3297b2a2432e0ad -->
```bash
set -e
grep -q "Technical details" web/src/pages/browse/ItemDetail.tsx
awk '/<details/{d=1} d && /schema_version/{f=1} END{exit !(d&&f)}' web/src/pages/browse/ItemDetail.tsx
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Hero image leads the details surface

- **WHEN** the operator opens `/items/:id` for an item whose document carries the frame-grabber thumb fact or, for an image-typed item, the original-path fact
- **THEN** the Details surface leads with that image fetched through the authenticated media channel (thumb variant only for the thumb fact, original only for an image-typed item) at content-column width with its aspect preserved, while an item whose media cannot render as an image renders no hero image and fires no media request

<!-- wf:probe id=2aa5a0577ab7b73e -->
```bash
set -e
grep -q "useItemMedia" web/src/pages/browse/ItemDetail.tsx
grep -q "ENDPOINTS.itemMedia" web/src/pages/browse/ItemDetail.tsx
grep -q "hasFrameGrabberThumb" web/src/lib/api.ts
grep -q "hasOriginalFile" web/src/lib/api.ts
grep -q 'media_type === "image"' web/src/lib/api.ts
grep -qi "hero" web/src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Missing item renders not-found

- **WHEN** the operator opens `/items/:id` for an id that does not exist and the API answers 404 not_found
- **THEN** the page renders a not-found state instead of the detail view

<!-- wf:probe id=d21734da805ad6a7 -->
```bash
set -e
grep -q "404" web/src/pages/browse/ItemDetail.tsx
grep -qiE "not.?found" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Media-first arrangement on a video item

- **WHEN** the operator opens a film or episode — any non-image item — whose document carries the thumb fact
- **THEN** the page leads with the media stage carrying the play affordance, with the identity column (element name, raw path, mandatory identity badges, resume/progress row) beside it and the parser-ordered footer between the identity block and the Technical details disclosure

<!-- wf:probe id=bb6f8835fba86e36 -->
```bash
set -e
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.tsx
grep -qiE "play|resume" web/src/pages/browse/ItemDetail.tsx
grep -q "media-first\|mediaFirst\|element-stage" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Photo page is the photo

- **WHEN** the operator opens an image-typed item
- **THEN** the photo renders as the dominant full-width surface with the identity line and parser-ordered footer beneath it

<!-- wf:probe id=c831cad5cd9dbc55 -->
```bash
set -e
grep -q 'media_type === "image"' web/src/lib/api.ts
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Production media types select the lanes

- **WHEN** the operator opens an episode whose stored media_type is `serial` and a film whose stored media_type is `tv` — the values production actually writes
- **THEN** both pages render the video lane (media stage with the play affordance beside the identity column), and no `media_type === "video"` gate exists anywhere in the SPA source

<!-- wf:probe id=7a4e2f2915af9172 -->
```bash
set -e
! grep -rn 'media_type === "video"' web/src --include="*.ts" --include="*.tsx"
grep -q "isVideoItem" web/src/pages/browse/ItemDetail.tsx
grep -q "isVideoItem" web/src/lib/api.ts
grep -q 'media_type === "image"' web/src/lib/api.ts
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

### Requirement: Video playback in the SPA

The element page SHALL offer the playback surface for every video item,
derived structurally (any non-image item — never a media_type literal): the
page fetches the playback descriptor for each non-image item and mounts the
player from the descriptor, and the descriptor decides playability. A
`direct` item plays its minted play URL in a native media element; an `hls`
item plays the stream playlist through an HLS client library, attaching
equally to a partial (head-first) and a completed build, with a failed pack
offering a retry affordance wired to the play endpoint with `retry`. Sections
from the descriptor SHALL render as a section list; activating a section
SHALL seek the playing media to that section's start using standard media
seeks, so TV remote transport keys work unchanged. Playback position SHALL
keep reporting through the existing progress endpoint.

#### Scenario: Packaged item plays via the stream playlist and sections seek

- **WHEN** the operator presses play on a packaged episode whose descriptor carries sections, and activates one section while it plays
- **THEN** the player attaches to the stream playlist and the media element seeks to that section's start

<!-- wf:probe id=09c51040619755c7 -->
```bash
set -e
grep -rnqiE "hls" web/src/components/playback/ web/src/pages/browse/ItemDetail.tsx
grep -rnq "sections" web/src/components/playback/
grep -rnqiE "seek|currentTime" web/src/components/playback/
```
<!-- /wf:probe -->

#### Scenario: Direct item plays natively with progress reporting intact

- **WHEN** the operator presses play on a direct (browser-decodable) item and watches past the resume point
- **THEN** the native media element plays the minted play URL and the playback position keeps reporting through the existing progress endpoint

<!-- wf:probe id=387dd052d5bc3e83 -->
```bash
set -e
grep -rnqiE "<video|createElement\(.video" web/src/components/playback/
grep -rnq "progress" web/src/components/playback/
grep -rnqiE "retry" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: A ready serial episode mounts the player

- **WHEN** the operator opens an episode whose stored media_type is `serial` (the value production writes) with status ready and a descriptor answering an `hls` complete build
- **THEN** the page fetches the descriptor and mounts the player with the play affordance — the surface is reachable without any fixture value production never writes

<!-- wf:probe id=572a62bf23c6aeb0 -->
```bash
set -e
grep -q 'media_type: "serial"' web/src/pages/browse/ItemDetail.test.tsx
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Joint: a scanned serial episode yields a player-capable descriptor

- **WHEN** a hermetic fixture serial library is scanned through the real plugin subprocesses and the stored episode's playback descriptor is fetched through `GET /api/v1/items/{id}/playback`
- **THEN** the stored episode carries media_type `serial` (never `video`), the descriptor answers 200 with mode `direct` or `hls`, a packaging state, a non-empty token-carrying play_url, and sections and voiceovers arrays — the exact shape the SPA's player mounts

<!-- wf:probe id=dbec622421aa3de9 -->
```bash
set -e
go test ./internal/itest -run TestVideoItemPagesJointE2E
```
<!-- /wf:probe -->

#### Scenario: Fixtures carry production-shaped media types

- **WHEN** the SPA's test suites are inspected for the media_type values their fixtures carry
- **THEN** every fixture media_type is a value production writes (`tv`, `serial`, or `image` for image modules) and no `media_type: "video"` fixture remains anywhere in `web/src`

<!-- wf:probe id=f7e4e5f8f6fad844 -->
```bash
set -e
! grep -rn 'media_type: "video"' web/src --include="*.ts" --include="*.tsx"
grep -q 'media_type: "serial"' web/src/pages/browse/ItemDetail.test.tsx
cd web && npx vitest run src/lib/api.test.ts src/pages/home/Home.test.tsx src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

## ADDED Requirements

### Requirement: Embedded build carries the video item pages

The committed embedded build (`internal/web/dist/`) SHALL be regenerated from
this change's `web/src` via the dev-time `make web-build` path and committed;
the OpenAPI contract files (`internal/web/api/openapi.{json,yaml}`) SHALL come
out unchanged (this change edits no route or annotation), and the Go embed
directive and the node-free Go build gate stay untouched.

#### Scenario: Committed dist is the fresh build of this change's SPA

- **WHEN** the committed `internal/web/dist` bundle is compared against a fresh build of this change's `web/src`
- **THEN** `dist/index.html` and hashed `assets/*.js` exist, the bundle carries the Technical details surface, and the committed tree stays clean after a fresh `npm run build` — the committed dist IS the current build

<!-- wf:probe id=db2523330ec28b10 -->
```bash
set -e
test -f internal/web/dist/index.html
ls internal/web/dist/assets/*.js >/dev/null
grep -qrs "Technical details" internal/web/dist/assets
(cd web && npm run build >/dev/null 2>&1)
test -z "$(git status --porcelain internal/web/dist)"
```
<!-- /wf:probe -->
