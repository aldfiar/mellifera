# web-ui Specification

## Purpose

Mellifera's embedded UI capability: a single static Go binary serving a React SPA (built by Vite, embedded via `go:embed`), a code-generated OpenAPI contract (`/openapi.{yaml,json}`), Swagger UI (`/docs/`), and a role-gated `/api/v1/*` API — with a token-entry SPA shell and an admin panel for library management, scan triggering, and system status.

Seeded from `docs/web-ui` (Phase 1: Go UI foundation) + `docs/web-ui-phase-2` (Phase 2a: React SPA, on `feature/web-ui-phase-2`).

## Requirements

### Requirement: Role-gated API authentication

The API SHALL resolve a valid `MELLIFERA_ADMIN_TOKEN` bearer credential to `Principal{Role: RoleAdmin}`; a missing or wrong token SHALL be rejected with 401 unauthorized. Routes SHALL be gated by per-group role checks: browse routes (`GET /libraries`, `GET /items`, `GET /items/{id}`) accept admin+client read-only; admin routes (`POST /libraries`, `POST /libraries/{id}/scan`, `GET /admin/status`) accept admin only. Handlers SHALL NOT fork on role; `RoleClient` is gated but no resolver mints it.

#### Scenario: Admin token reaches both route groups
- **WHEN** the admin token calls a browse route and an admin-only route
- **THEN** every call succeeds

#### Scenario: Client role denied admin routes
- **WHEN** a client-role principal calls `GET /api/v1/admin/status` (or another admin-only route)
- **THEN** the request is rejected with 403

### Requirement: Single-binary embedded web surface

`internal/web.Handler` SHALL compose one top-level handler: `/api/*` to the API router, `/openapi.{yaml,json}` + `/docs/` to the embedded Swagger serving, and every other path to the SPA embedded via `//go:embed all:dist`. The binary SHALL serve all of this as a single static Go binary with no Node runtime at serve time.

#### Scenario: One binary serves API, contract, and UI
- **WHEN** the built binary (CGO disabled, no node/npm in the build path) serves requests to `/api/v1/*`, `/openapi.yaml`, `/docs/`, and `/`
- **THEN** each surface is served from the one binary; the SPA shell, `/openapi.*`, and `/docs/` are public (no auth); only `/api/v1/*` carries data behind role-gating

### Requirement: SPA static delivery and caching

The embedded SPA delivery SHALL serve hashed `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`, serve `index.html` with `Cache-Control: no-cache`, and fall back to `index.html` (200) for any non-`/api`/`/openapi`/`/docs`/`/assets` path so client-side routes work. A request for a missing asset SHALL return 404. `MELLIFERA_WEB_DEV=true` SHALL disable the immutable cache headers (no-cache everywhere) for the Vite dev-proxy workflow.

#### Scenario: Client-side route fallback and cache headers
- **WHEN** a browser requests `/` (or a client route like `/admin`), a hashed `/assets/*` file, and an unknown asset path
- **THEN** `/` and the client route return index.html (200, `no-cache`), the hashed asset returns `immutable`, and the missing asset returns 404

### Requirement: Code-generated OpenAPI contract and Swagger UI

The OpenAPI spec SHALL be code-generated from handler annotations (swag) — never hand-written — embedded, and served at `/openapi.yaml` and `/openapi.json` listing every actual endpoint. Swagger UI SHALL be served at `/docs/` (bundled via `swaggo/http-swagger`), unauthenticated.

#### Scenario: Served spec matches the real routes
- **WHEN** `GET /openapi.yaml` and `GET /docs/` are requested with no auth
- **THEN** the spec returns listing `/libraries`, `/items`, `/items/{id}`, `/libraries/{id}/scan`, and `/admin/status`, and `/docs/` returns 200 HTML (Swagger UI loads)

### Requirement: Library list endpoint

The API SHALL expose `GET /api/v1/libraries` (admin+client) returning every
library via `store.ListLibraries` as
`{items:[{id, module_id, root_path, display_name, description}]}` where
`description` is the library's human description (empty string when unset).

#### Scenario: Listing created libraries

- **WHEN** libraries exist and `GET /api/v1/libraries` is called
- **THEN** the response is 200 with one entry per library, each carrying its `description` (empty string when never set)

<!-- wf:probe id=10a04e7e23934383 -->
```bash
set -e
grep -q 'description' internal/api/handlers.go
go test ./internal/api -run TestLibraryListDescription
```
<!-- /wf:probe -->

### Requirement: Item detail endpoint

The API SHALL expose `GET /api/v1/items/{id}` (admin+client) returning the item's full document — `sources.<plugin>`, `_view`, `_provenance`, `_stages`, precision preserved — via `store.GetItem`.

#### Scenario: Full-document detail and not-found
- **WHEN** `GET /api/v1/items/{id}` is called for an existing item and for a non-existent id
- **THEN** the existing item returns 200 with the full document; the missing id returns the canonical 404 error body

### Requirement: Admin status endpoint via closure seam

The API SHALL expose `GET /api/v1/admin/status` (admin-only) returning plugin health and enrich-queue stats through a `Deps.Status` closure built in `cmd/mellifera` — `internal/api` SHALL NOT import `internal/plugin` or `internal/enrich`. A nil closure SHALL yield 503 `unavailable`; a closure error SHALL yield 500 `internal_error`.

#### Scenario: Status snapshot
- **WHEN** the admin token calls `GET /api/v1/admin/status` with the closure wired
- **THEN** the response is 200 with per-plugin health (state, restarts, checked_at) and enrich-queue stats (pending, in_flight, done, failed); with a nil closure it is 503

### Requirement: Node-free Go build gate

The Go build gate (`make build`/`check`/`lint`/`test`) SHALL stay green on a host without node by embedding committed artifacts only. `make web-build` (the swag + npm regen) SHALL be a dev-time target and SHALL NOT be a prerequisite of the gate. Changes SHALL be additive: no proto/sdk/scan/enrich contract changes.

#### Scenario: Gate green without node
- **WHEN** `make build && make check` runs on a node-less host
- **THEN** it exits 0 with no node/npm/swag invoked

### Requirement: SPA token authentication

The SPA SHALL store the admin token in localStorage under `mellifera.token`; `<RequireAuth>` SHALL guard protected routes by token presence, redirecting to `/login` when absent. Every `/api/v1/*` request SHALL carry `Authorization: Bearer <token>` via the fetch wrapper. A 401 from any API call SHALL clear the token and redirect to `/login`.

#### Scenario: Login flow and 401 rotation
- **WHEN** an operator without a token opens a protected route and submits the token on `/login`, and later an API call returns 401
- **THEN** the token is stored and the operator reaches the requested route; the 401 clears the token and redirects back to `/login`

### Requirement: Admin library management panel

The admin panel (`/admin`) SHALL be collections management: a collections table
rendering every library (name + description, pastel type badge, root folder in
monospace, item count and last-updated from
`GET /api/v1/libraries/{id}/summary`, per-row Scan and Edit actions, inline scan
results `{discovered, persisted, warnings?}`) whose header row stays sticky when
the table scrolls (the panel MUST stay correct at 20+ collections); an
add-collection form (type, name, description, root folder — network roots
documented as OS-mounted) POSTing `{module_id, root_path, display_name,
description}` to `POST /api/v1/libraries`; and an **edit overlay** per row —
opened by Edit, rendering Name (input), Type (read-only, fixed at creation),
Description (input), Root folder (read-only monospace with the identity warning
"moving the root re-identifies all items") — submitting
`PATCH /api/v1/libraries/{id}` with `{display_name, description}`. The overlay
SHALL surface canonical errors inline (400 for an immutable-field attempt, 404
unknown) without auto-retry. The panel SHALL NOT render a plugin/enrich status
section.

#### Scenario: Add a library
- **WHEN** the operator submits the add-collection form with a module type, a name, a description, and an absolute root path
- **THEN** the new collection appears in the table with its summary re-fetching; a 400/500 instead shows the canonical error inline

<!-- wf:probe id=43d0b2ce71a94805 -->
```bash
set -e
grep -q 'description' web/src/pages/admin/Collections.tsx
go test ./internal/api -run TestLibraryCreateDescription
```
<!-- /wf:probe -->

#### Scenario: Collections table with inline scan result

- **WHEN** the admin opens `/admin` with 20+ libraries and triggers Scan on one row
- **THEN** every library renders with its type badge, root folder, item count, and updated date, the table header stays visible while the rows scroll, and the scan result renders inline on the scanned row only

<!-- wf:probe id=107d8a9a99bec216 -->
```bash
set -e
grep -q 'sticky' web/src/pages/admin/Collections.tsx
grep -q 'Edit' web/src/pages/admin/Collections.tsx
go test ./internal/api -run TestScanInline
```
<!-- /wf:probe -->

#### Scenario: Edit overlay patches name and description

- **WHEN** the admin submits the edit overlay with a new name and description
- **THEN** the panel PATCHes `/api/v1/libraries/{id}` with `{display_name, description}`, re-fetches the table, and an immutable-field attempt surfaces the canonical 400 error inline

<!-- wf:probe id=fdc92080f01735e6 -->
```bash
set -e
grep -q 'PATCH' web/src/lib/api.ts
grep -q 'root_path' web/src/pages/admin/Collections.tsx
go test ./internal/api -run TestLibraryPatch
```
<!-- /wf:probe -->

#### Scenario: Status section is gone

- **WHEN** the admin panel source is inspected
- **THEN** no plugin-health or enrich-stats section renders anywhere in the SPA while `GET /api/v1/admin/status` remains available at the API layer

<!-- wf:probe id=bbfedb503f8ff6ff -->
```bash
set -e
test ! -e web/src/pages/admin/Status.tsx
! grep -rn "admin/status" web/src/pages/admin/
```
<!-- /wf:probe -->

### Requirement: Scan triggering from the admin panel

The admin panel SHALL offer a per-library scan trigger POSTing to `POST /api/v1/libraries/{id}/scan` and SHALL render the result `{library_id, discovered, persisted, warnings?}` inline, without auto-retry. The status view SHALL reflect the async enrich queue draining (pending → in_flight → done) as scanned items progress.

#### Scenario: Trigger a scan
- **WHEN** the operator clicks Scan on a library row
- **THEN** the scan response (discovered/persisted/warnings) is shown inline and the status page's enrich stats move toward `done`

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the versioned API — calling only
`GET /api/v1/libraries`, `POST /api/v1/libraries`, `PATCH
/api/v1/libraries/{id}`, `GET /api/v1/libraries/{id}/summary`,
`GET /api/v1/libraries/{id}/folders`, `POST /api/v1/libraries/{id}/scan`,
`GET /api/v1/items`, `GET /api/v1/items/{id}`, `PUT
/api/v1/items/{id}/parsers`, `DELETE /api/v1/items/{id}/parsers`,
`GET /api/v1/items/{id}/media`, `GET /api/v1/series`,
`GET /api/v1/series/{id}`, `GET /api/v1/series/{id}/episodes`, `GET
/api/v1/progress`, `PUT /api/v1/progress/{item_id}`, and `GET
/api/v1/admin/status` — with wire shapes mirrored verbatim. Media loads
SHALL go through the authenticated fetch wrapper into object URLs (an
`<img>` channel cannot carry the bearer header), keeping the media
endpoint's bearer gate intact. Every new SPA consumer SHALL keep the
byte-identical Go contract posture: no client-side shaping that the server
does not send.

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

### Requirement: Item detail view

The SPA SHALL offer an `/items/:id` route (wrapped in `<RequireAuth>`) that
fetches the pre-existing `GET /api/v1/items/{id}` and renders the §3.1
document in two visual tiers. The **Details** surface renders directly on
the page: Tier-1 `identifiers`, the core-managed item fields, and
`<ViewFields>` for `_view` entries (value + source + reason) — the
viewer-facing reading view. The **Technical details** section — one
`<SourceCard>` per `sources.<plugin>` namespace, a `<ProvenanceBadge>` per
`_provenance` entry, and `<StagesProgress>` for `_stages` entries (stage,
plugin_id, status, advanced_to, started_at, finished_at, error?) — SHALL be
collapsed (hidden) until the operator expands its disclosure, and SHALL
render those tiers exactly as before once expanded: verbatim values,
per-source namespaces never merged. The Details surface SHALL lead with the
item's own media image when one is resolvable — the frame-grabber thumb fact
(`sources["frame-grabber"].thumbnail_path`), else the original
(`parsed.absolute_path`) for an image-typed item — fetched through the
authenticated media channel at content-column width, aspect preserved; an
item whose media cannot render as an image (a video without the thumb fact,
a document with no media facts) SHALL render no hero image and no
broken-image state. A missing item (404 not_found) SHALL render a clear
not-found state, not a crash. The page SHALL follow the media-first ladder:
the media stage is the dominant surface (for video-typed items a two-column
arrangement — media stage with the play affordance LEFT, identity column
RIGHT; for image-typed items the photo IS the page, full-width) with the
identity block — element name, raw path, and the module's mandatory identity
badges per `identity_fields` — beside/below it, and the parser-ordered
metadata footer (`ParserFooter`, per the parser-display capability) between
the identity block and the Technical details disclosure.

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

#### Scenario: Media-first arrangement on a video item

- **WHEN** the operator opens a film or episode whose document carries the thumb fact
- **THEN** the page leads with the media stage carrying the play affordance, with the identity column (element name, raw path, mandatory identity badges, resume/progress row) beside it and the parser-ordered footer between the identity block and the Technical details disclosure

<!-- wf:probe id=0fbfc7bc48168bfb -->
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
grep -q 'media_type === "image"' web/src/pages/browse/ItemDetail.tsx
grep -q "ParserFooter" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

### Requirement: Metadata rendering fidelity

The SPA's document layer SHALL model the §3.1 document verbatim — `sources`, `_view`, `_provenance`, `_stages`, `identifiers`, `ffprobe`, plus dynamic JSON, never collapsing a namespace or field — and the rendering layer SHALL preserve fidelity: numeric values rendered exactly as delivered (no toFixed, no Math.round, no locale reformatting — arch §3.4/§11.2); per-source namespaces rendered separately and never merged; all document content rendered as text or structured children, never `dangerouslySetInnerHTML`; UTF-8/Cyrillic content passed through unmodified (arch §11.1).

#### Scenario: Document model mirrors the wire shape
- **WHEN** the SPA's document layer is inspected
- **THEN** it types sources, _view, _provenance, _stages (with per-stage error), identifiers, ffprobe, and dynamic JSON without collapsing any namespace or field

<!-- wf:probe id=b6badf161ec80d19 -->
```bash
set -e
test -f web/src/lib/document.ts
for m in sources _view _provenance _stages identifiers ffprobe; do
  grep -q -- "$m" web/src/lib/document.ts
done
for t in StageEntry ProvenanceEntry ViewEntry; do
  grep -q "$t" web/src/lib/document.ts
done
grep -q "advanced_to" web/src/lib/document.ts
```
<!-- /wf:probe -->

#### Scenario: Rendering fidelity holds
- **WHEN** the rendering layer (metadata components and pages) renders document values
- **THEN** numbers pass through verbatim with each `sources.<plugin>` namespace as its own card, and all document content renders as text or structured children with no `dangerouslySetInnerHTML` usage anywhere in the SPA source

<!-- wf:probe id=b973f85a13db4470 -->
```bash
set -e
! grep -rnE "toFixed|Math\.round|toLocaleString|Intl\.NumberFormat" web/src/components web/src/pages web/src/lib
! grep -rn "dangerouslySetInnerHTML" web/src
```
<!-- /wf:probe -->

### Requirement: Responsive UI states and theming

The admin and browse surfaces SHALL render shared empty, loading, and error states on the browse and detail views, surfacing the canonical `{error:{code,message,retryable}}` inline; SHALL remain usable at mobile widths via responsive breakpoints; SHALL offer a dark-mode toggle that persists the preference (localStorage) and applies it via the class strategy; and SHALL keep interactive controls keyboard-accessible.

#### Scenario: Empty, loading, and error states render
- **WHEN** the browse list or the item detail view is loading, returns no rows, or fails with a canonical error
- **THEN** a loading state, an empty state, or an inline error carrying the error code and message renders respectively

<!-- wf:probe id=6d844211492488f4 -->
```bash
set -e
test -f web/src/components/states.tsx
for c in LoadingState EmptyState ErrorState; do
  grep -q "$c" web/src/components/states.tsx
done
grep -q "code" web/src/components/states.tsx
grep -q "EmptyState" web/src/pages/browse/Browse.tsx
grep -q "ErrorState" web/src/pages/browse/Browse.tsx
grep -q "ErrorState" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

#### Scenario: Layouts stay usable at mobile width
- **WHEN** the browse surface renders at a mobile viewport width
- **THEN** the layout reflows via responsive breakpoints rather than overflowing

<!-- wf:probe id=9f35857314b49244 -->
```bash
set -e
grep -rqE "(sm|md|lg|xl):" web/src/pages/browse
```
<!-- /wf:probe -->

#### Scenario: Dark mode toggles and persists
- **WHEN** the operator toggles dark mode and reloads the SPA
- **THEN** the theme applies immediately on load from the persisted preference

<!-- wf:probe id=d3b16f91acb5cda2 -->
```bash
set -e
test -f web/src/components/ThemeToggle.tsx
grep -q "mellifera.theme" web/src/components/ThemeToggle.tsx
grep -q "classList" web/src/components/ThemeToggle.tsx
grep -q "ThemeToggle" web/src/components/AppNav.tsx
grep -qE "darkMode.*class" web/tailwind.config.ts
```
<!-- /wf:probe -->

#### Scenario: Keyboard accessibility
- **WHEN** the operator navigates the admin and browse surfaces with the keyboard only
- **THEN** every interactive control is reachable and operable in a visible focus order

UNPROBEABLE

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

### Requirement: Sidebar shell

The SPA SHALL render a left sidebar panel (brand, Home/Admin navigation with
icons, a pinned profile block showing the operator identity and role, and the
theme toggle) that is **hidden by default**: a floating menu button (fixed
top-left) opens it, the panel's chevron and the Escape key close it, and the
open/hidden choice persists in localStorage (`mellifera.side`). While hidden,
the content area uses the full width and the menu button MUST NOT overlap page
headings (the content reserves the button's zone). The role label SHALL be
probed via `GET /api/v1/admin/status` (success → `admin`, 403/failure →
`client`). While open, nav rows SHALL be full-width clickable (icon + label)
with the active page's row highlighted in its type accent, and detail pages
SHALL highlight their parent collection entry (series → Serials, film → Films,
photo → Photos).

#### Scenario: Hidden by default, opened from the floating button

- **WHEN** an authenticated operator loads the SPA and clicks the floating menu button
- **THEN** the content initially spans the full width with no sidebar, the button opens the 224px panel (brand, nav, profile, theme toggle) without overlapping headings, and the choice persists across reloads

<!-- wf:probe id=024d433d9435672e -->
```bash
set -e
grep -q 'menu-fab' web/src/components/Sidebar.tsx
grep -q 'side-open' web/src/components/Sidebar.tsx
grep -q 'mellifera.side' web/src/components/Sidebar.tsx
grep -qi 'translateX' web/src/styles/index.css
```
<!-- /wf:probe -->

#### Scenario: Profile shows the probed role

- **WHEN** the panel is opened with an admin token and then with a client token
- **THEN** the pinned profile block renders the operator identity with role `admin` when `GET /api/v1/admin/status` succeeds and `client` on 403/failure, and the profile stays pinned at the panel bottom regardless of navigation list length

<!-- wf:probe id=e11f23f0dc338749 -->
```bash
set -e
grep -q 'admin/status' web/src/components/Sidebar.tsx
grep -q 'pinned\|margin-top: auto\|mt-auto' web/src/components/Sidebar.tsx web/src/styles/index.css
```
<!-- /wf:probe -->

### Requirement: Sidebar collections list

The sidebar SHALL render a fast-navigation list of ALL collections from
`GET /api/v1/libraries`, each entry carrying the collection name and its item
count from `GET /api/v1/libraries/{id}/summary`, a pastel type dot
(serials/movies/photos/audiobooks accents), and navigation to that collection's
page. The list SHALL scroll independently while Home/Admin and the profile stay
pinned, so the panel remains correct with 20+ collections. Counts SHOULD be
fetched lazily per visible entry or cached per session — the panel MUST NOT
block opening on summary requests.

#### Scenario: Twenty-plus collections keep the panel correct

- **WHEN** 20+ libraries exist and the operator opens the sidebar
- **THEN** every collection renders as a colored-dot entry with its count, the list scrolls independently, Home/Admin and the profile never move, and opening the panel does not wait for the summary requests

<!-- wf:probe id=2e30440ea6eccd07 -->
```bash
set -e
grep -q 'side-colls' web/src/components/Sidebar.tsx
grep -q 'summary' web/src/components/Sidebar.tsx
grep -q 'min-height: 0\|min-h-0' web/src/components/Sidebar.tsx web/src/styles/index.css
```
<!-- /wf:probe -->

### Requirement: Home collections surface

The root route (`/`) SHALL render the collections surface: a type filter chip
row (All + one chip per type present, client-side filtering) and one card per
library — name, pastel type badge, description, item count, and updated date,
all from `GET /api/v1/libraries` + `GET /api/v1/libraries/{id}/summary` — laid
out in a responsive grid that stays correct at 20+ cards. Cards SHALL NOT render
root paths or enrich-lifecycle status pills. Collections with zero items SHALL
render an explicit empty card state ("not scanned yet"). Below the grid, the
surface SHALL render the Continue and Next up rows (next requirements) after
the collections grid.

#### Scenario: Collection cards render summary data without paths or pills

- **WHEN** the home surface renders with 20+ libraries
- **THEN** each card shows name, pastel type badge, description, item count, and updated date from the summary; no card contains a filesystem path or a lifecycle status pill; the type chips filter the grid client-side; and the layout reflows without overflow

<!-- wf:probe id=25c42c993ff9a6c8 -->
```bash
set -e
grep -q 'summary' web/src/pages/home/Home.tsx
grep -qE 'fchip|TypeChip|filter' web/src/pages/home/Home.tsx
test -z "$(grep -rn 'root_path\|/Volumes' web/src/pages/home/)"
test -z "$(grep -rn 'pill ok\|pill warn\|pill stale\|pill bad' web/src/pages/home/)"
grep -q 'collections/' web/src/App.tsx
grep -q 'summary' web/src/pages/collections/Collection.tsx
grep -q 'module_id' web/src/pages/collections/Collection.tsx
test -z "$(grep -rn 'root_path\|/Volumes' web/src/pages/collections/)"
test -z "$(grep -rn 'pill ok\|pill warn\|pill stale\|pill bad' web/src/pages/collections/)"
```
<!-- /wf:probe -->

### Requirement: Continue and Next up surfaces

The home surface SHALL render a **Continue** row from
`GET /api/v1/progress`: one card per item with `position_seconds > 0`, ordered
by recency, showing a progress bar, remaining-time or percent label, source
collection, and a Play affordance; and a **Next up** row deriving, per series
touched by Continue, the lowest-numbered episode that comes strictly AFTER the
highest-started one (the skip-aware reading of "no progress record": with
sequential viewing the two readings coincide — the derivation never suggests
an episode the viewer has already moved past) (season/episode and series
grouping read from the items' existing
document facts), each with a Play affordance. Until the playback capability
ships, Play SHALL deep-link to the item's detail page — the surfaces MUST NOT
attempt inline streaming. Both rows SHALL render shared empty states when the
progress list is empty.

#### Scenario: Continue renders in-progress items with progress

- **WHEN** the progress API returns three records with positive positions
- **THEN** the Continue row renders exactly those items ordered by recency with progress bars and Play affordances that navigate to the items' detail pages

<!-- wf:probe id=b95db436defdd04e -->
```bash
set -e
grep -q 'Continue' web/src/pages/home/Home.tsx
grep -q 'progress' web/src/pages/home/Home.tsx
grep -q 'deep-link\|/items/' web/src/pages/home/Home.tsx
```
<!-- /wf:probe -->

#### Scenario: Next up derives the next unstarted episode

- **WHEN** Continue contains an episode of a series with later-numbered episodes and no progress on them
- **THEN** the Next up row offers the lowest-numbered unstarted episode of that series with a Play affordance, and renders the empty state when no such episode exists

<!-- wf:probe id=d337c75bf42912ac -->
```bash
set -e
grep -q 'Next up' web/src/pages/home/Home.tsx
go test ./internal/api -run TestProgressList
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

### Requirement: Video playback in the SPA

The element page SHALL play video through the playback descriptor: a `direct`
item plays its minted play URL in a native media element; an `hls` item plays
the stream playlist through an HLS client library, attaching equally to a
partial (head-first) and a completed build, with a failed pack offering a
retry affordance wired to the play endpoint with `retry`. Sections from the
descriptor SHALL render as a section list; activating a section SHALL seek
the playing media to that section's start using standard media seeks, so TV
remote transport keys work unchanged. Playback position SHALL keep reporting
through the existing progress endpoint.

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

### Requirement: Element browsing

The element page SHALL offer previous/next browsing within the ordered
collection view the operator navigated from: `←/→` keys and on-screen
chevrons move to the previous/next element with wrap-around at the edges, a
position counter (n / N) shows the place in the view, and the keyboard hint
is rendered on the page. Every photo tile, film card, and episode row SHALL
navigate to its own item (not only the first), and the detail page SHALL
open at that item's position in the view. Browsing SHALL NOT refetch the
item beyond the ordinary single-item fetch; navigation is a view operation.
Series-level pages stay hierarchical — browsing lives in the episode list.

#### Scenario: Arrows browse with wrap-around

- **WHEN** the operator presses `→` on the last photo of the loaded view and then `→` again from the counter's wrap edge
- **THEN** the page advances to each next photo in view order, wraps from the last to the first, and the counter reflects every move

<!-- wf:probe id=f7828854518d4efe -->
```bash
set -e
grep -q "ArrowRight" web/src/pages/browse/ItemDetail.tsx
grep -q "ArrowLeft" web/src/pages/browse/ItemDetail.tsx
grep -qiE "wrap" web/src/pages/browse/ItemDetail.tsx
grep -qi "browse" web/src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Every tile opens its own item at its position

- **WHEN** the operator opens the third photo tile of a photo collection, then a film card, then an episode row
- **THEN** each opens that exact item as the detail page with the counter showing its position in the navigated view

<!-- wf:probe id=4fbcf412bcbaa05e -->
```bash
set -e
grep -qE "data-p|position|index" web/src/components/PhotoTile.tsx web/src/pages/collections/*.tsx 2>/dev/null || grep -qrnE "state.*position|navigate.*items/" web/src/pages web/src/components
grep -qiE "counter|position" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->

### Requirement: Photo slideshow

The photo detail page SHALL offer a slideshow affordance (button and the
`S` key) that auto-advances through the loaded view on a fixed interval
(~2.5s), toggling to a pause affordance while running. Manual previous/next
navigation SHALL reset the interval. `Esc` SHALL stop a running slideshow
first and only navigate back when it is not running; leaving the photo page
SHALL always stop it. Slideshow state SHALL NOT survive navigation —
returning to the page starts paused.

#### Scenario: Slideshow advances and pauses

- **WHEN** the operator starts the slideshow on a photo page and waits through more than one interval, then presses `S` again
- **THEN** the page advanced to the next photo (or wrapped) at roughly the interval, the affordance showed the running state, and the second `S` paused it with the current photo kept

<!-- wf:probe id=9bec8b9a5052df21 -->
```bash
set -e
grep -qiE "slideshow" web/src/pages/browse/ItemDetail.tsx
grep -qiE "slideshow" web/src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Manual navigation resets the interval; Esc stops first

- **WHEN** the operator navigates manually while the slideshow runs, and then presses `Esc` twice
- **THEN** the first `←/→` moved to the neighbor photo without losing the running state and reset the timer, the first `Esc` stopped the slideshow on the same photo, and the second `Esc` navigated back to the collection

<!-- wf:probe id=6dbafb440f895ee6 -->
```bash
set -e
grep -q "Escape" web/src/pages/browse/ItemDetail.tsx
grep -qiE "reset" web/src/pages/browse/ItemDetail.tsx
```
<!-- /wf:probe -->
