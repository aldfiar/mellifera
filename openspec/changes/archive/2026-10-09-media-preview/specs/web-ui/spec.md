## MODIFIED Requirements

### Requirement: Item detail view

The SPA SHALL offer an `/items/:id` route (wrapped in `<RequireAuth>`) that
fetches the pre-existing `GET /api/v1/items/{id}` and renders the §3.1
document in two visual tiers. The **Details** surface renders directly on the
page: Tier-1 `identifiers`, the core-managed item fields, and `<ViewFields>`
for `_view` entries (value + source + reason) — the viewer-facing reading
view. The **Technical details** section — one `<SourceCard>` per
`sources.<plugin>` namespace, a `<ProvenanceBadge>` per `_provenance` entry,
and `<StagesProgress>` for `_stages` entries (stage, plugin_id, status,
advanced_to, started_at, finished_at, error?) — SHALL be collapsed (hidden)
until the operator expands its disclosure, and SHALL render those tiers
exactly as before once expanded: verbatim values, per-source namespaces never
merged. The Details surface SHALL lead with the item's own media image when
one is resolvable — the frame-grabber thumb fact
(`sources["frame-grabber"].thumbnail_path`), else the original
(`parsed.absolute_path`) for an image-typed item — fetched through the
authenticated media channel at content-column width, aspect preserved; an
item whose media cannot render as an image (a video without the thumb fact,
a document with no media facts) SHALL render no hero image and no
broken-image state. A missing item (404 not_found) SHALL render a clear
not-found state, not a crash.

#### Scenario: All document tiers render
- **WHEN** the operator opens `/items/:id` for an enriched item carrying identifiers, sources, _view, _provenance, and _stages and expands the Technical details disclosure
- **THEN** the Details surface renders the core fields, identifiers, and view fields, and the expanded disclosure renders one card per source namespace, one badge per provenance entry, and the stage progress including any per-stage error

<!-- wf:probe id=baed5580f9176115 -->
```bash
set -e
test -f web/src/pages/browse/ItemDetail.tsx
for c in SourceCard JsonValue ProvenanceBadge ViewFields StagesProgress; do
  test -f "web/src/components/metadata/$c.tsx"
done
for c in SourceCard ProvenanceBadge ViewFields StagesProgress; do
  grep -q "$c" web/src/pages/browse/ItemDetail.tsx
done
grep -q "identifiers" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Technical details collapsed by default
- **WHEN** the operator opens `/items/:id` for an enriched item
- **THEN** the core fields, identifiers, and view fields render immediately while sources, provenance, and pipeline stages stay hidden until the Technical details disclosure is expanded

<!-- wf:probe id=280103bdebbb44df -->
```bash
set -e
grep -qiE '<details|technical' web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Hero image leads the details surface
- **WHEN** the operator opens `/items/:id` for an item whose document carries the frame-grabber thumb fact or, for an image-typed item, the original-path fact
- **THEN** the Details surface leads with that image fetched through the authenticated media channel (thumb variant only for the thumb fact, original only for an image-typed item) at content-column width with its aspect preserved, while an item whose media cannot render as an image renders no hero image and fires no media request

<!-- wf:probe id=d209cc37dda978ea -->
```bash
set -e
grep -q "useItemMedia" web/src/pages/browse/ItemDetail.tsx
grep -q "ENDPOINTS.itemMedia" web/src/pages/browse/ItemDetail.tsx
grep -q "hasFrameGrabberThumb" web/src/pages/browse/ItemDetail.tsx
grep -q "hasOriginalFile" web/src/pages/browse/ItemDetail.tsx
grep -q 'media_type === "image"' web/src/pages/browse/ItemDetail.tsx
grep -qi "hero" web/src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Missing item renders not-found
- **WHEN** the operator opens `/items/:id` for an id that does not exist and the API answers 404 not_found
- **THEN** the page renders a not-found state instead of the detail view

<!-- wf:probe id=d0dcdd62531c5b69 -->
```bash
set -e
grep -q "404" web/src/pages/browse/ItemDetail.tsx
grep -qiE "not.?found" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the versioned API — calling only
`GET /api/v1/libraries`, `POST /api/v1/libraries`, `PATCH
/api/v1/libraries/{id}`, `GET /api/v1/libraries/{id}/summary`,
`GET /api/v1/libraries/{id}/folders`, `POST /api/v1/libraries/{id}/scan`,
`GET /api/v1/items`, `GET /api/v1/items/{id}`, `GET /api/v1/items/{id}/media`,
`GET /api/v1/series`, `GET /api/v1/series/{id}`, `GET
/api/v1/series/{id}/episodes`, `GET /api/v1/progress`, `PUT
/api/v1/progress/{item_id}`, and `GET /api/v1/admin/status` — with wire shapes
mirrored verbatim. Media loads SHALL go through the authenticated fetch
wrapper into object URLs (an `<img>` channel cannot carry the bearer header),
keeping the media endpoint's bearer gate intact. Every new SPA consumer SHALL
keep the byte-identical Go contract posture: no client-side shaping that the
server does not send.

#### Scenario: No off-contract calls

- **WHEN** the SPA's network calls are audited and the Go tree is built
- **THEN** every app call targets one of the allowlisted `/api/v1` routes and `go build ./...` succeeds

<!-- wf:probe id=6c03f9c2829e0509 -->
```bash
set -e
go build ./...
violations=$(grep -rnE "fetch\(|['\"]/api/" web/src --include="*.ts" --include="*.tsx" \
  | grep -v "\.test\." \
  | grep -vE "/(items|libraries|series|progress|admin/status)" \
  | grep -vE "fetch\(path") || true
test -z "$violations"
```
<!-- /wf:probe -->

#### Scenario: Items client mirrors the wire contract
- **WHEN** the SPA's API client is inspected for the items endpoints
- **THEN** listItems and getItem target the pre-existing `/api/v1/items` routes and the ItemDTO fields match the Go JSON tags verbatim

<!-- wf:probe id=b60a9bba64675000 -->
```bash
set -e
grep -q "listItems" web/src/lib/api.ts
grep -q "getItem" web/src/lib/api.ts
grep -q "schema_version" web/src/lib/api.ts
grep -q "relative_path" web/src/lib/api.ts
grep -q "media_type" web/src/lib/api.ts
```
<!-- /wf:probe -->

### Requirement: Collection pages

The SPA SHALL serve `/collections/{id}` (auth-wrapped) as the per-collection
page: a header from `GET /api/v1/libraries` + `GET
/api/v1/libraries/{id}/summary` (name, pastel type badge, description, item
count, updated date — no root path, no status pills; an explicit empty state for
zero-item collections) and a body keyed by the library's `module_id`:

- `tv` (movies) — a card grid over `GET /api/v1/items?library={id}` (parsed
  title, year/resolution chips, duration, raw filename), paginated
  limit/offset; each card renders the item's frame-grabber thumbnail from the
  media endpoint (thumb variant) when the document carries one, over the
  placeholder fallback;
- `image` (photos) — a subfolder chip row from
  `GET /api/v1/libraries/{id}/folders` (client-side filtering) above a masonry
  grid of item tiles with capture-date footers; each tile renders the item's
  media from the media endpoint — thumb variant when the document carries the
  frame-grabber fact, else the original — over the ratio-correct placeholder
  fallback;
- `serial` — a series grid from `GET /api/v1/series?library={id}` (the
  serials-library surface) whose cards open the series' episode flow; episode
  cards render the episode's frame-grabber thumbnail when the document carries
  one, over the placeholder fallback.

Items whose documents carry no resolvable media fact keep their placeholders —
never a broken-image state. The shared empty, loading, and error states, the
pagination controls, and the metadata-fidelity rules (verbatim values,
per-source namespaces) SHALL apply to every layout.

#### Scenario: Movies collection page

- **WHEN** the operator opens `/collections/{id}` for a `tv` library
- **THEN** the page renders the collection header and a paginated card grid of that library's items with parsed metadata chips and raw filenames, without paths or lifecycle pills

<!-- wf:probe id=b9c48ae1b98f0c79 -->
```bash
set -e
grep -q 'collections/' web/src/App.tsx
grep -q 'module_id' web/src/pages/collections/Collection.tsx
grep -qE 'limit|offset' web/src/pages/collections/Collection.tsx
grep -qiE 'chip' web/src/pages/collections/Collection.tsx
grep -qE 'relative_path|file_name|filename' web/src/pages/collections/Collection.tsx
```
<!-- /wf:probe -->

#### Scenario: Photos collection page with subfolder chips

- **WHEN** the operator opens a photos collection and picks a subfolder chip
- **THEN** the masonry grid filters to that folder client-side and the chip row renders from `GET /api/v1/libraries/{id}/folders`

<!-- wf:probe id=b44fac0b43f4f086 -->
```bash
set -e
grep -q 'folders' web/src/pages/collections/Collection.tsx
grep -q 'masonry' web/src/pages/collections/Collection.tsx
```
<!-- /wf:probe -->

#### Scenario: Serial collection page lists series

- **WHEN** the operator opens a serial collection
- **THEN** the page renders one card per series from `GET /api/v1/series?library={id}` linking into the series' episode flow

<!-- wf:probe id=df3ca14e8db184a5 -->
```bash
set -e
grep -q 'series' web/src/pages/collections/Collection.tsx
```
<!-- /wf:probe -->

#### Scenario: Tiles and cards render real media with a placeholder fallback
- **WHEN** a photos masonry, a movies grid, and a serial episode flow render items whose documents carry resolvable media facts alongside items that carry none
- **THEN** tiles with a resolvable fact render an image loaded through the authenticated media fetch and items without one keep the ratio-correct placeholder — never a broken-image state

<!-- wf:probe id=5c27ecc8715cde3b -->
```bash
set -e
grep -qE 'itemMedia|/media' web/src/lib/api.ts
grep -q '<img' web/src/pages/collections/Collection.tsx
grep -qE 'itemMedia|/media' web/src/pages/collections/Collection.tsx
```
<!-- /wf:probe -->

### Requirement: Embedded build carries the phase UI

The committed embedded build (`internal/web/dist/`) SHALL be regenerated from
this phase's `web/src` via the dev-time `make web-build` and committed, so the
served SPA carries the `/collections` routes and the media surface; the Go
embed directive (`//go:embed all:dist`) and the node-free Go build gate stay
untouched. The regenerated OpenAPI contract (`internal/web/api/openapi.{json,yaml}`)
SHALL list the media route.

#### Scenario: Committed dist carries the new routes

- **WHEN** the committed `internal/web/dist` bundle is inspected
- **THEN** `dist/index.html` and hashed `assets/*.js` exist and the bundle contains the `/collections` route literal from this phase's build

<!-- wf:probe id=fe5d7468a0e434f4 -->
```bash
set -e
test -f internal/web/dist/index.html
ls internal/web/dist/assets/*.js >/dev/null
grep -qrs "/collections" internal/web/dist/assets
for f in internal/web/api/openapi.json internal/web/api/openapi.yaml; do
  grep -qF '/libraries/{id}/summary' "$f"
  grep -qF '/libraries/{id}/folders' "$f"
done
grep -qF '"/libraries/{id}":' internal/web/api/openapi.json
grep -qF '"/progress/{item_id}":' internal/web/api/openapi.json
grep -qF '"description": {' internal/web/api/openapi.json
grep -A6 'api.libraryDTO:' internal/web/api/openapi.yaml | grep -q 'description:'
```
<!-- /wf:probe -->

#### Scenario: Committed dist carries the media surface
- **WHEN** the committed `internal/web/dist` bundle and the OpenAPI contract are inspected
- **THEN** the bundle contains the media endpoint literal from this phase's build and both `internal/web/api/openapi.{json,yaml}` list `/items/{id}/media`

<!-- wf:probe id=df34ab4dbc6e3d38 -->
```bash
set -e
test -f internal/web/dist/index.html
grep -qrs "/media" internal/web/dist/assets
for f in internal/web/api/openapi.json internal/web/api/openapi.yaml; do
  grep -qF '/items/{id}/media' "$f"
done
```
<!-- /wf:probe -->

#### Scenario: Delivery bar and visual walkthrough
- **WHEN** the full delivery gate runs — `make build && make check && make test` node-free, `cd web && npm test` green, and a manual walkthrough of the served SPA
- **THEN** every gate is green, the committed dist is the freshly rebuilt bundle, and the walkthrough shows photo tiles, episode thumbnails, collection card previews, and the collapsed Technical details disclosure

UNPROBEABLE

## ADDED Requirements

### Requirement: Collection card previews

Home collection cards SHALL carry a preview image above the badge row: for a
collection with items, the card SHALL attempt a representative item's media
through the media endpoint (thumb variant when the item's document carries the
frame-grabber fact, else the original), loaded through the authenticated
media fetch. When no item's media resolves, or the load fails, the card SHALL
keep the existing badge-only layout — never a broken-image state. Zero-item
collections SHALL render the explicit "not scanned yet" card without a
preview area. Cards continue to show name, pastel type badge, description,
item count, and updated date, and MUST NOT render root paths or lifecycle
pills.

#### Scenario: Collection card previews render with a fallback
- **WHEN** the home grid renders collections — one whose representative item resolves media, one with no resolvable media, and one with zero items
- **THEN** the first card renders a preview image from the media endpoint, the second keeps the badge-only card, and the empty collection renders the explicit "not scanned yet" state without a preview area

<!-- wf:probe id=bd1f5bcea31d67d8 -->
```bash
set -e
grep -qE 'itemMedia|/media' web/src/pages/home/Home.tsx
```
<!-- /wf:probe -->
