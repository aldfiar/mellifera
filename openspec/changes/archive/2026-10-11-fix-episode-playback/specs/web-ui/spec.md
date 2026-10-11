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
ladder: the media stage is the dominant surface (for a video item the media
stage IS the player — a two-column arrangement with the player LEFT and the
identity column RIGHT, and no separate thumbnail or hero image rendered
beside or above the player; for image-typed items the photo IS the page,
full-width) with the identity block — element name, raw path, and the
module's mandatory identity badges per `identity_fields` — beside/below it,
and the parser-ordered metadata footer (`ParserFooter`, per the parser-display
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
per-source namespaces never merged. An image-typed item's Details surface
SHALL lead with the item's own photo when the original is resolvable
(`parsed.absolute_path`) — fetched through the authenticated media channel at
content-column width, aspect preserved. A video item SHALL render no separate
media image: its frame-grabber thumb fact
(`sources["frame-grabber"].thumbnail_path`), when present, SHALL render as
the player's poster — the preview frame inside the video element until
playback starts — fetched through the same authenticated media channel, and a
video without the thumb fact SHALL play with no poster. An item whose media
cannot render as an image SHALL render no hero image and no broken-image
state. Episode thumbnails on surfaces outside the item page — episode mini
cards and collection tiles — are untouched. A missing item (404 not_found)
SHALL render a clear not-found state, not a crash.

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

- **WHEN** the operator opens an image-typed item whose document carries the original-path fact
- **THEN** the Details surface leads with the photo fetched through the authenticated media channel (the original variant) at content-column width with its aspect preserved, while an item with no resolvable media renders no hero image and fires no media request

<!-- wf:probe id=6b18c335ec91f4b4 -->
```bash
set -e
grep -q "useItemMedia" web/src/pages/browse/ItemDetail.tsx
grep -q "ENDPOINTS.itemMedia" web/src/pages/browse/ItemDetail.tsx
grep -q "hasOriginalFile" web/src/lib/api.ts
grep -q 'media_type === "image"' web/src/lib/api.ts
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Episode page shows only the player with the thumb as poster

- **WHEN** the operator opens a film or episode — any video item whose document carries the frame-grabber thumb fact
- **THEN** the media stage is the player alone — no separate thumbnail or hero image section above or beside it — and the thumb renders as the video element's poster until playback starts, while episode mini cards and collection tiles keep their thumbnails

<!-- wf:probe id=48fbdae3c2e491ca -->
```bash
set -e
grep -q "poster" web/src/components/playback/Player.tsx
cd web && npx vitest run src/components/playback/Player.test.tsx src/pages/browse/ItemDetail.test.tsx
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
- **THEN** the page leads with the player as the media stage (the thumb as its poster until playback starts), with the identity column (element name, raw path, mandatory identity badges, resume/progress row) beside it and the parser-ordered footer between the identity block and the Technical details disclosure

<!-- wf:probe id=3ed3895c59c23adf -->
```bash
set -e
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.tsx
grep -qiE "play|resume" web/src/pages/browse/ItemDetail.tsx
grep -q "media-first\|mediaFirst\|element-stage" web/src/pages/browse/ItemDetail.tsx
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
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

## ADDED Requirements

### Requirement: Embedded build carries the poster-only episode page

The committed embedded build (`internal/web/dist/`) SHALL be regenerated from
this change's `web/src` via the dev-time `make web-build` path and committed;
the OpenAPI contract files (`internal/web/api/openapi.{json,yaml}`) SHALL come
out unchanged (this change edits no route or annotation), and the Go embed
directive and the node-free Go build gate stay untouched.

#### Scenario: Committed dist is the fresh build of this change's SPA

- **WHEN** the committed `internal/web/dist` bundle is compared against a fresh build of this change's `web/src`
- **THEN** `dist/index.html` and hashed `assets/*.js` exist, the bundle carries the player poster wiring, and the committed tree stays clean after a fresh `npm run build` — the committed dist IS the current build

<!-- wf:probe id=e18c0ff5aece57c0 -->
```bash
set -e
test -f internal/web/dist/index.html
ls internal/web/dist/assets/*.js >/dev/null
grep -qs "poster" internal/web/dist/assets/*.js
(cd web && npm run build >/dev/null 2>&1)
test -z "$(git status --porcelain internal/web/dist)"
```
<!-- /wf:probe -->
