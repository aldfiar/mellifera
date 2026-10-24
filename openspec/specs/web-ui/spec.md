# web-ui Specification

## Purpose

Mellifera's embedded UI capability: a single static Go binary serving a React SPA (built by Vite, embedded via `go:embed`), a code-generated OpenAPI contract (`/openapi.{yaml,json}`), Swagger UI (`/docs/`), and a role-gated `/api/v1/*` API — with a token-entry SPA shell and an admin panel for library management, scan triggering, and system status.

Seeded from `docs/web-ui` (Phase 1: Go UI foundation) + `docs/web-ui-phase-2` (Phase 2a: React SPA, on `feature/web-ui-phase-2`).

## Requirements

### Requirement: Role-gated API authentication

The API SHALL resolve a valid `MELLIFERA_ADMIN_TOKEN` bearer credential to `Principal{Role: RoleAdmin}`; a missing or wrong token SHALL be rejected with 401 unauthorized. A bearer credential that misses the admin compare SHALL additionally be resolved against the device-token store (device-pairing): a hit SHALL mint `Principal{Role: RoleClient}`. Routes SHALL be gated by per-group role checks: browse routes (`GET /libraries`, `GET /items`, `GET /items/{id}`, playback and progress verbs) accept admin+client; admin routes (`POST /libraries`, `POST /libraries/{id}/scan`, `GET /admin/status`, pairing/device administration) accept admin only; the pairing endpoints (`POST /pair`, `GET /pair/{id}/wait`) are the ONLY unauthenticated API surface. Handlers SHALL NOT fork on role; `RoleClient` is minted by device tokens minted through pairing, never by the admin token.

#### Scenario: Admin token reaches both route groups
- **WHEN** the admin token calls a browse route and an admin-only route
- **THEN** every call succeeds

#### Scenario: Client role denied admin routes
- **WHEN** a client-role principal calls `GET /api/v1/admin/status` (or another admin-only route)
- **THEN** the request is rejected with 403

#### Scenario: Pairing endpoints are unauthenticated
- **WHEN** a device calls `POST /api/v1/pair` or `GET /api/v1/pair/{id}/wait` with no Authorization header
- **THEN** the calls reach their handlers (no 401), while every other API path without a valid token still 401s

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

<!-- wf:probe id=b0341cf7e1b1f06e -->
```bash
set -e
make build check
```
<!-- /wf:probe -->

#### Scenario: The change's full Go gate stays green

- **WHEN** the change's Go gate runs from the repo root — `make build check test lint`
- **THEN** it exits 0 node-free

<!-- wf:probe id=ebd254ceacffd32c -->
```bash
set -e
make build check test lint
```
<!-- /wf:probe -->

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
`POST /api/v1/libraries/{id}/refresh`, `GET
/api/v1/libraries/{id}/enrich/preview`, `GET /api/v1/items`, `GET
/api/v1/items/{id}`, `PUT /api/v1/items/{id}/parsers`, `DELETE
/api/v1/items/{id}/parsers`, `GET /api/v1/items/{id}/media`, `GET
/api/v1/series`, `GET /api/v1/series/{id}`, `GET /api/v1/series/{id}/episodes`,
`GET /api/v1/progress`, `PUT /api/v1/progress/{item_id}`, `GET
/api/v1/admin/status`, `GET /api/v1/items/{id}/playback`, `POST
/api/v1/items/{id}/play`, `PUT /api/v1/series/{id}/title`, `DELETE
/api/v1/series/{id}/title`, `PUT /api/v1/items/{id}/title`, `DELETE
/api/v1/items/{id}/title`, `GET /api/v1/admin/sources`, `PATCH
/api/v1/admin/sources/{plugin_id}`, `POST /api/v1/admin/sources/preview`, `PUT
/api/v1/libraries/{id}/sources/{plugin_id}`, `DELETE
/api/v1/libraries/{id}/sources/{plugin_id}`, `GET /api/v1/admin/plugins`, and
`GET /api/v1/admin/plugins/{plugin_id}/logs` — with wire shapes mirrored
verbatim. Media loads (originals, thumbs, and `?variant=sidecar` subtitle
bytes) SHALL go through the authenticated fetch wrapper into object URLs (an
`<img>`/`<track>` channel cannot carry the bearer header), keeping the media
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
  | grep -vE "/(items|libraries|series|progress|admin/(status|sources|plugins))" \
  | grep -vE "fetch\(path") || true
test -z "$violations"
cd web && npx vitest run && npx tsc --noEmit
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

The SPA SHALL render a left sidebar panel (brand, Home/Admin/Plugins
navigation with icons — Plugins linking `/admin/plugins` —, a pinned profile
block showing the operator identity and role, and the
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
- **THEN** the content initially spans the full width with no sidebar, the button opens the 224px panel (brand, the Home/Admin/Plugins nav, profile, theme toggle) without overlapping headings, and the choice persists across reloads

<!-- wf:probe id=256315bd3250806b -->
```bash
set -e
grep -q 'menu-fab' web/src/components/Sidebar.tsx
grep -q 'side-open' web/src/components/Sidebar.tsx
grep -q 'mellifera.side' web/src/components/Sidebar.tsx
grep -q '/admin/plugins' web/src/components/Sidebar.tsx
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
collection, and a Play affordance — plus the item's frame-grabber thumb preview
(loaded through the authenticated media fetch, the same pattern as the
collection card's preview) and a real name taken from the item's served
`display_name` — the server-composed chain (override → composed
`<series title> · SxxEyy` → `_view.title` floor). The client MUST NOT
re-implement the composition and SHALL carry no per-surface copies of the
chain. An item whose document carries no thumb fact SHALL keep the honest
badge-only card — never a broken-image state. The **Next up** row SHALL key on
SERIES RECORDS instead of episode-carried titles: each progress item maps
through its library and `parsed.series_relative_path` to its series row, the
series' episodes load once per started series (`GET /series/{id}/episodes`,
cached), and the offered episode is the lowest `(season, episode)` strictly
after the highest-started one — the skip-aware reading of "no progress
record": with sequential viewing the two readings coincide, and the derivation
never suggests an episode the viewer has already moved past. Next-up cards
SHALL render the series' served `display_name`, an `SxxEyy` chip rendered from
the episode's raw facts (which stay on the wire in item documents), and the
episode's thumb; tv-module films never enter Next up (it is an episode concept
— films surface via Continue). Each card carries a Play affordance; until the
playback capability ships, Play SHALL deep-link to the item's detail page —
the surfaces MUST NOT attempt inline streaming. Both rows SHALL render shared
empty states when the progress list is empty.

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

#### Scenario: Continue cards carry the stop-frame thumb and the series-named title

- **WHEN** the home surface renders an in-progress serial episode whose document carries the thumb fact, alongside an episode with no thumb fact and a tv-module film
- **THEN** the serial episode card shows the thumb preview and its served `display_name` (the composed `<series title> · SxxEyy`), the no-thumb item keeps the honest badge-only card, and the film keeps its `_view.title`-floored `display_name`

<!-- wf:probe id=9b462ec5474bd157 -->
```bash
set -e
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

#### Scenario: Next up derives from series records and their episode lists

- **WHEN** Continue touches episodes of a series whose episode list holds later-numbered episodes
- **THEN** Next up offers the lowest `(season, episode)` strictly after the highest-started one, rendered with the series' served `display_name`, the `SxxEyy` chip from the raw facts, and the episode thumb — a film item never enters Next up, and the empty state renders when nothing follows

<!-- wf:probe id=d157549511f54714 -->
```bash
set -e
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

### Requirement: Collection pages

The SPA SHALL serve `/collections/{id}` (auth-wrapped) as the per-collection
page: a header from `GET /api/v1/libraries` + `GET
/api/v1/libraries/{id}/summary` (name, pastel type badge, description, item
count, updated date — no root path, no status pills; an explicit empty state for
zero-item collections) and a body keyed by the library's `module_id`:

- `tv` (movies) — a card grid over `GET /api/v1/items?library={id}`,
  paginated limit/offset; each card renders the item's frame-grabber
  thumbnail from the media endpoint (thumb variant) when the document carries
  one, over the placeholder fallback, the served `display_name` as its title,
  and ONE muted dot-separated meta line from the parsed facts (resolution ·
  duration — the season/episode token is never rendered as a chip, the
  display name already carries it);
- `image` (photos) — a subfolder chip row from
  `GET /api/v1/libraries/{id}/folders` (client-side filtering) above a masonry
  grid of item tiles with capture-date footers; each tile renders the item's
  media from the media endpoint — thumb variant when the document carries the
  frame-grabber fact, else the original — over the ratio-correct placeholder
  fallback; a tile renders NO filename row and NO title row (the thumbnail is
  the photo's identity);
- `serial` — a series grid from `GET /api/v1/series?library={id}` (the
  serials-library surface) whose cards open the series' episode flow; episode
  cards render the episode's frame-grabber thumbnail when the document carries
  one, over the placeholder fallback, and follow the Serial title fallback
  chains requirement;
- unknown module ids — the generic item grid, one card per item with the
  served `display_name` as its title.

No collection card surface SHALL render the raw system filename — the
filename stays reachable in the item's Technical details. Card titles follow
the surface-scoped floor rule of the Serial title fallback chains
requirement: a card hosting the management menu floors an empty-or-filename
`display_name` to the extension-less stem plus a muted "Not identified"
marker; a card without the menu (the generic grid) floors to the stem with NO
marker; photo tiles render no title at all. No menu-bearing card (the
rename/identify/refresh menu hosts) and no series or episode card renders a
lifecycle status pill. Items whose documents carry no resolvable media fact
keep their placeholders — never a broken-image state. The shared empty,
loading, and error states, the pagination controls, and the metadata-fidelity
rules (verbatim values, per-source namespaces) SHALL apply to every layout.

#### Scenario: Movies collection page

- **WHEN** the operator opens `/collections/{id}` for a `tv` library
- **THEN** the page renders the collection header and a paginated card grid whose cards show the served `display_name` and ONE muted dot-separated meta line (resolution · duration), and no card carries the raw filename, an `SxxExx` chip, or a lifecycle status pill — the filename stays reachable in the item's Technical details

<!-- wf:probe id=1f07de8991d99bb5 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Photo tiles render no filename row

- **WHEN** the photos masonry renders tiles for items with and without a capture date
- **THEN** every tile renders no filename row and no title row, the capture-date footer appears only when a date exists, and the tile's accessible name no longer carries the raw filename

<!-- wf:probe id=7c2cd6378fdab521 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Episode cards collapse the chip row into the meta line

- **WHEN** the episode flow renders cards whose documents carry season/episode facts, a resolution, and a duration
- **THEN** each card shows ONE muted dot-separated meta line (resolution · duration) with no `SxxExx` chip — the display name already carries the season and episode — and no status pill

<!-- wf:probe id=9cc379d7c17f9ed1 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Generic grid floors an unnamed item to the stem

- **WHEN** the generic item grid renders an item whose served `display_name` is empty or equals the item's relative_path final segment, beside an item with a real `display_name`
- **THEN** the unnamed card's title renders the extension-less stem with NO "Not identified" marker — the surface hosts no menu — and the named card renders its `display_name` verbatim

<!-- wf:probe id=ba089b33b54631fd -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
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

### Requirement: Serial title fallback chains

The serial collection surface SHALL render the server-composed `display_name`
on every series card and episode row — the fallback chain (the stored manual
override first, else the best plugin-provided title carried by the document,
else the raw directory name / the document floor) SHALL be resolved by the api
alone; the client MUST NOT re-implement it and SHALL NOT carry per-surface
copies of the chain. The client MAY floor only as specified: on the
menu-bearing item cards (episode rows, movie cards) a served `display_name`
that is empty or equals the item's relative_path final segment renders the
extension-less filename stem in the normal title style plus a muted
"Not identified" line (superseding the earlier "floor-empty renders empty,
never a client-side fallback" contract); a file-backed series whose
`display_name` is its own filename renders the stem WITHOUT the marker (no
menu is offered on series identity); a directory-backed series card renders
its `display_name` verbatim — a directory name is never stemmed. An operator
override that happens to equal the filename wears the marker (accepted,
self-inflicted, not special-cased). Rename affordances SHALL be offered from
the series card's menu and from each episode row's menu: submitting a name
PUTs the title route, clearing the custom name DELETEs it and the display
returns to the served chain value, and canonical errors surface inline
without auto-retry. The ONE sanctioned exception is the Sources admin
preview mirror: a client `naming.ts` walk fed by server-served inputs and
pinned to the shared golden fixture MAY resolve the plugin-title walk for
preview rendering only — a mirror of the composer, not a second chain, and
it MUST stay fixture-pinned.

#### Scenario: Series title falls back through the chain

- **WHEN** the series grid renders a series carrying a manual override, a series whose document carries only the parser title, and a series whose document carries neither
- **THEN** the three cards display the served `display_name` values — the override, the parser title, and the raw directory name — without the client resolving any chain itself

<!-- wf:probe id=b4b7bfc14f02a737 -->
```bash
set -e
go test ./internal/api -run TestSeriesDisplayName -count=1
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Rename sets and clears an override

- **WHEN** the operator renames a series from its card and then clears the custom name, and separately submits an invalid name
- **THEN** the card PUTs the series title route and the displayed title follows it, clearing DELETEs the override and the display returns to the chain value, and the invalid submission surfaces the canonical error inline without auto-retry

<!-- wf:probe id=4f52eb9b1c948be9 -->
```bash
set -e
grep -q "setSeriesTitle\|setItemTitle" web/src/lib/api.ts
grep -q "deleteSeriesTitle\|deleteItemTitle" web/src/lib/api.ts
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Episode rows title through the same chain

- **WHEN** the episode flow renders one overridden episode, one episode whose facts and series compose a name, and one episode carrying neither facts nor a title
- **THEN** the rows display the served `display_name` — the override and the composed name verbatim as served, and the empty floor as the extension-less stem plus the muted "Not identified" marker — per the floor rule, never a client-resolved chain

<!-- wf:probe id=a03a93181a216e6a -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: File-backed series floor to the stem without a marker

- **WHEN** the series grid renders a file-backed series whose served `display_name` is its own filename beside a directory-backed series whose `display_name` is the raw directory name
- **THEN** the file-backed card renders the extension-less stem with no marker and the directory-backed card renders its `display_name` verbatim — never a stemmed directory name

<!-- wf:probe id=96de26cc2dc61a10 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

### Requirement: Episode watch-page track controls

The episode element page SHALL carry, beside the play affordance, a
voiceover-selection button and a subtitle-selection button. The voiceover
control SHALL list the descriptor's `voiceovers` alongside the embedded
audio; on a packaged (`hls`) build selecting a voiceover SHALL switch the
player's audio rendition without restarting the video; on a direct item the
control SHALL render disabled with a visible state naming that voiceover
switching requires the packaged build. The subtitle control SHALL list the
episode document's subtitle sidecars — labeled by the language fact, else
the containing folder name, else the file name — plus an off entry;
selecting one SHALL fetch its bytes through the authenticated media channel
(`variant=sidecar`) and render them as timed text over the playing video:
`.vtt`/`.srt` verbatim-convertible, `.ass`/`.ssa` as dialogue with timing
(styling MAY degrade), and a sidecar format the SPA cannot render (`.sub`)
listed with an explicit not-renderable state. Track selections are
per-visit state and SHALL NOT survive navigation.

#### Scenario: Subtitle sidecar renders as timed text

- **WHEN** the operator selects an `.srt` subtitle sidecar while an episode plays, lets playback pass a cue time, and then selects the off entry
- **THEN** the page fetched the sidecar through the authenticated channel, the converted timed cues render over the video at their times, and the off entry removes the rendered text

<!-- wf:probe id=67c6610f8728cd27 -->
```bash
set -e
grep -q "variant=sidecar\|variantSidecar\|sidecar" web/src/lib/api.ts
cd web && npx vitest run src/lib/subtitles.test.ts
```
<!-- /wf:probe -->

#### Scenario: Unrenderable subtitle states explicitly

- **WHEN** the operator opens the subtitle control on an episode whose sidecar facts include a `.sub` file
- **THEN** the `.sub` entry renders with an explicit not-renderable state instead of being selectable into silence

<!-- wf:probe id=b1d397901df1cf19 -->
```bash
set -e
cd web && npx vitest run src/lib/subtitles.test.ts
grep -qE "not.?renderable|unsupported" src/lib/subtitles.ts
```
<!-- /wf:probe -->

#### Scenario: Voiceover switches the audio rendition on a packaged build

- **WHEN** the operator picks the second listed voiceover on an episode playing an `hls` build, and separately opens a direct item whose document carries voiceover facts
- **THEN** the player switches to that audio rendition without restarting the video, and on the direct item the control renders disabled with a visible state naming the packaged-build requirement

<!-- wf:probe id=034765eab6e162aa -->
```bash
set -e
grep -rq "audioTrack" web/src/components/playback/
grep -q "voiceover" web/src/pages/browse/ItemDetail.tsx
cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx
```
<!-- /wf:probe -->

### Requirement: Embedded build carries the serial watch surface

The committed embedded build (`internal/web/dist/`) SHALL be regenerated
from this change's `web/src` via the dev-time `make web-build` path and
committed, and the committed OpenAPI contract
(`internal/web/api/openapi.{json,yaml}`) SHALL list the four title routes —
the Go embed directive and the node-free Go build gate stay untouched.

#### Scenario: Committed dist and OpenAPI carry the watch surface

- **WHEN** the committed `internal/web/dist` bundle and the OpenAPI contract are inspected
- **THEN** `dist/index.html` and hashed `assets/*.js` exist, the bundle carries the voiceover/subtitle control and title-route literals from this build, and both OpenAPI files list `/series/{id}/title` and `/items/{id}/title`

<!-- wf:probe id=89a70056cfbff67c -->
```bash
set -e
test -f internal/web/dist/index.html
ls internal/web/dist/assets/*.js >/dev/null
grep -qrsi "voiceover" internal/web/dist/assets
grep -qrsi "subtitle" internal/web/dist/assets
for f in internal/web/api/openapi.json internal/web/api/openapi.yaml; do
  grep -qF '/series/{id}/title' "$f"
  grep -qF '/items/{id}/title' "$f"
done
```
<!-- /wf:probe -->

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

### Requirement: CardActions element menu

Every item card (movie cards, episode flow rows) and every series card SHALL
carry a quiet CardActions trigger (a ⋯ glyph at the card's top-right) that
reveals on card hover/focus and opens ONE dialog overlay: `role="dialog"`,
`aria-modal`, `aria-haspopup="dialog"` on the trigger, `aria-expanded`
tracking the open state. The overlay is portaled/fixed-position (never
clipped by the card's overflow), carries a scrim with click-away, traps focus
while open (a Tab loop), and returns focus to the trigger on close; the
trigger's open state persists while focus is inside the overlay
(`data-open`). On coarse pointers (`pointer: coarse`) the trigger SHALL be
persistently visible with a muted glyph and a hit target of at least 40px —
touch/TV need no pointer and no learned gesture. Escape SHALL back out of a
view to the menu, close everything from the menu, and be IGNORED while a
mutation is pending (an error never renders into an unmounted view). The
overlay hosts views — menu → rename | identify | refresh — as local state,
never URL state: a route change discards it, and an awaited mid-flight
mutation completes with its result simply not shown. A successful mutation
closes its view via the awaited-mutation collapse; a canonical error renders
inline and the overlay stays open.

Item-card menu rows: Rename… (the rename view), Identify… and Refresh
metadata… (offered when the library's module block is present AND its parser
chain is non-empty — the gate signals module wiring, not authorization; today
every minted token is admin so the two coincide — and Identify is promoted to
the first row when the card is unidentified), and Mark watched — offered only
when the item's duration is known (`durationSeconds ≠ null`; never a guessed
duration): it PUTs `PUT /api/v1/progress/{item_id}` with
`position=durationSeconds`, keeps the menu open, and surfaces a row-local
transient error line on failure. The server has no watched concept —
`position=duration` does not leave an item on the Continue rail (for series
it genuinely advances Next up); "watched flag / Continue-rail filtering" is a
named Go backlog line.

Series-card menu rows: Identify… (the three-step series identify overlay,
offered under the same module-wired gate as the item rows — the row is
absent when the module block is missing or its chain empty), Rename… (curing
a polluted composed name on every episode at once through read-time
recomposition), and Refresh metadata… (the series id as the refresh row —
series rows live in the refresh row space).
The series card's lifecycle status pill and its "file" chip leave the chip
row; the backing fact re-lands as a menu footer ("File-backed series")
rendered only when the document's backing marker is `file`.

The rename view SHALL reuse the existing rename form semantics untouched —
the `useTitleOverride` mutations (retry:0, awaited-collapse, `role="alert"`
inline error, the same invalidation keys) with the closed-button branch
removed; the always-visible per-card rename affordance dies, and MovieCard's
`rename` prop slot dies with it.

#### Scenario: The menu opens with accessible state and closes through the shell

- **WHEN** the operator opens a card's menu, tabs through it, and closes it — by Escape and by a scrim click
- **THEN** the trigger carries `aria-haspopup="dialog"` with `aria-expanded` tracking the open state and the open state persists while focus is inside the portaled overlay, focus stays trapped while open, each close affordance works, and focus returns to the trigger on close
<!-- wf:probe id=f96cbb81e18b86b9 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: The Escape matrix backs out of views and respects pending mutations

- **WHEN** the operator presses Escape inside an open view, then inside the menu, and once more while a mutation is pending
- **THEN** the first Escape returns to the menu, the second closes the overlay entirely, and the pending-mutation Escape is ignored — no error renders into an unmounted view
<!-- wf:probe id=8bf67e2f3056a1f9 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Success closes via the awaited mutation; an error stays open

- **WHEN** the operator submits a rename that succeeds and, separately, one that answers a canonical error
- **THEN** the success collapses the overlay once the awaited mutation resolves — never via a flag that fires before the close — and the error renders inline with the overlay still open
<!-- wf:probe id=2f40c64b4dc63f01 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Mark watched is gated on a known duration

- **WHEN** the card menu opens for an item whose duration is known and for one whose duration is unknown, and the operator activates Mark watched on the first
- **THEN** the row is absent for the unknown-duration item, the activation PUTs `/api/v1/progress/{item_id}` with `position=durationSeconds`, the menu stays open, and a failed PUT renders a row-local error line
<!-- wf:probe id=917fd52941b38d07 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Series cards manage from the menu with the file-backed footer

- **WHEN** the operator opens a directory-backed series card's menu and a file-backed series card's menu
- **THEN** both cards carry no status pill and no "file" chip, both menus offer Identify, Rename, and Refresh metadata rows — the Identify row opening the series identify overlay, and the file-backed card's menu carries the "File-backed series" footer while the directory-backed card's carries none
<!-- wf:probe id=5f877a45c887f1cc -->
```bash
set -e
grep -q 'identify={seriesIdentifyGate' web/src/pages/collections/Collection.tsx
```
<!-- /wf:probe -->

#### Scenario: Coarse pointers see the menu without hover

- **WHEN** the collection surface renders on a coarse-pointer device (touch/TV)
- **THEN** the CardActions trigger is persistently visible with a muted glyph and a hit target of at least 40px, with no hover and no learned gesture required

### Requirement: Identify view (item parser attachment)

Opening the Identify view SHALL fetch `GET /items/{id}` first — MANDATORY,
because `extra_parsers` (the item's attached parser ids) is populated only by
the detail endpoint; computing attachable from list rows would show attached
parsers as attachable and a full-replacement PUT would silently drop existing
attachments. The view SHALL offer as attachable exactly the library module's
declared parsers minus the item's `extra_parsers` (an absent field → empty),
show the attached chain from the page-level library module block, and offer
up/down reorder (keyboard-native; drag is a later refinement). Saving SHALL
`PUT /api/v1/items/{id}/parsers` with the complete ordered parser-id list —
FULL replacement, and an empty list IS allowed on items (the never-clear
rejection is the library PATCH rule only); a 400 (unknown or mismatched
parser) renders inline and the overlay stays open. After a save the view
SHALL invalidate the item/episode reads and state the staleness honestly,
verbatim: "Enrichment runs in the background; the name updates when it lands.
A recently failed row waits out its cooldown before retrying." The Identify
and Refresh rows stay hidden — a designed empty state, never spinners —
whenever the module block is absent or its chain is empty.

#### Scenario: Identify opens with the detail fetch and computes attachable correctly

- **WHEN** the operator opens Identify on an item whose detail document carries `extra_parsers` of one attached parser while the module declares three, and on an item whose detail document carries no `extra_parsers` field
- **THEN** the view fetches `GET /api/v1/items/{id}` before rendering the parser list, the first item shows its parser attached and the other two as attachable, and the second item shows every declared parser as attachable

<!-- wf:probe id=dc7b05e9ebc81327 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Tapping an add chip appends the parser to the draft

- **WHEN** the operator taps an attachable parser's add chip in the Identify view, and separately removes a parser from the draft
- **THEN** the tapped parser joins the draft at the end and its add chip disappears, and removing a parser returns it to the attachable chips

<!-- wf:probe id=84a36128157ac9fd -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Identify save sends the full ordered replacement and handles errors inline

- **WHEN** the operator reorders the parsers and saves, and separately empties the list and saves
- **THEN** the SPA PUTs `/api/v1/items/{id}/parsers` with the complete ordered id list (an emptied list saves as empty — allowed on items), invalidates the episode reads, closes on success, renders a 400 inline with the overlay open, and shows the staleness copy verbatim

<!-- wf:probe id=8ab43daf57f1a8d9 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Identify hides without a wired module chain

- **WHEN** the library's module block is absent or its parser chain is empty
- **THEN** the Identify and Refresh rows do not render for that library's cards — a designed empty state, never spinners

<!-- wf:probe id=5a37f0052f9f04b5 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

### Requirement: Per-item metadata refresh

The Refresh view SHALL offer a dropdown of the module block's served
`refresh_sources` — the loaded, effectively-enabled title sources (one option
per entry; the endpoint requires exactly one `plugin_id` per invocation) — and
POST `/libraries/{id}/refresh` with `{plugin_id, row_ids: [id]}` — the item's
own row for an item card, the series id for a series card (series rows live in
the same refresh row space); the per-row call bypasses the whole-library 409
guard. An empty list SHALL render the view's empty state with explanatory copy
and a disabled trigger — no refreshable source, no kickoff. A 202 SHALL render
the response inline — the queued/stripped counts (the synchronous strip pass
makes them real) and, for a deferred row, the copy "kept its data — try again
shortly" (the row is busy). A 409 SHALL render "A refresh is already running"
inline. Canonical errors surface inline without auto-retry.

#### Scenario: Refresh posts one parser per invocation and renders the counts inline

- **WHEN** the operator picks a refresh source in the view's dropdown and triggers the refresh on one item row
- **THEN** the SPA POSTs `/libraries/{id}/refresh` with that `plugin_id` and `row_ids` of exactly the one id, and the 202 body renders inline including the deferred copy when the row was deferred

<!-- wf:probe id=d9b16926fa78011a -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: A running whole-library refresh says so

- **WHEN** the refresh answers 409 `refresh_in_flight`
- **THEN** the view renders "A refresh is already running" inline without auto-retry

<!-- wf:probe id=4237edd856cd7c71 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

### Requirement: Library Manage overlay

The collection header SHALL carry a quiet gear trigger (hover/focus reveal,
keyboard-reachable) opening ONE wide Manage overlay rendered through the
shared lifted dialog shell — portal + fixed positioning, scrim with
click-away, Escape, focus-return, focus trap, `aria-modal` — with a width
variant and a scrollable sheet. The overlay renders five sections — Rescan,
Parser chain, Naming, Refresh metadata, Edit library — and each section is an
independent SAVE BOUNDARY: one request per section save, never one giant
PATCH (the library PATCH writes the row and the chain in two non-atomic store
calls).

- **Rescan**: `POST /libraries/{id}/scan` rendering
  `{discovered, persisted, warnings}` inline, warnings omitted when empty.
- **Parser chain**: the served-order chain from the module block; up/down
  reorder, add from the module's declared parsers, remove; a save PATCHes
  `parsers` and MUST NEVER submit an empty list (present-and-empty is a 400);
  hint copy "Order is enrichment priority".
- **Naming**: `naming_group_style` (one of `""`, `clean`, `raw`) and
  `naming_element_name` (groups exactly `{title}`, `{season}`, `{episode}`),
  PATCHed on save; a live preview composed CLIENT-side through a mirror that
  MUST match the Go composer byte-for-byte, pinned by golden-vector tests
  (including `{episode}` inside the title, 3-digit episodes rendered in full,
  an absent token rendering as empty, Cyrillic verbatim); the sample row is
  the library's first episode; copy "names re-compose on save, no rescan".
- **Refresh metadata**: a dropdown of the served `refresh_sources` (the
  loaded, effectively-enabled title sources — chain parsers and scanners never
  appear) fetching `GET /libraries/{id}/enrich/preview?plugin_id=` on
  selection with a loading line (the preview is per-plugin and slow — a
  whole-library computation on demand); the preview renders BEFORE the
  trigger; a module with no refreshable source renders the section's empty
  state with explanatory copy; a 409 renders "A refresh is already running";
  an unwired endpoint (503) renders the section disabled with explanatory
  copy.
- **Edit library**: the admin EditOverlay's form extracted and shared (name
  and description editable; type and root folder read-only) — the overlay
  stays open on error and closes on success.

Save/invalidation contract: the SPA's `UpdateLibraryRequest` type gains
`parsers`, `naming_group_style`, `naming_element_name` (the Go PATCH already
accepts them); a section save's success SHALL invalidate `["libraries"]` AND
`["library", id]` and re-read the module block from `GET /libraries/{id}` —
NEVER from the PATCH body (PATCH responses never carry the module block).
The module-block-absence gate signals module wiring, not authorization; a
write refusal surfaces through the existing canonical inline-error path.

#### Scenario: Manage opens as a lifted dialog with trapped focus

- **WHEN** the operator opens the Manage overlay from the collection header gear, tabs through it, and presses Escape
- **THEN** the overlay renders through the shared lifted shell (portal/fixed, scrim with click-away, `aria-modal`), focus stays trapped inside while open, Escape closes it, and focus returns to the gear

<!-- wf:probe id=9612bc09a5e48060 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Each section saves alone and the chain never submits empty

- **WHEN** the operator saves the parser chain after removing a parser, and separately saves the naming section
- **THEN** each save PATCHes `/api/v1/libraries/{id}` with ONLY its own section's fields, the chain save is blocked from submitting an empty list, and a failed save leaves the overlay open with the canonical error inline

<!-- wf:probe id=df3543034eaa8b4a -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Save re-reads the chain from the server, never the PATCH body

- **WHEN** a section save succeeds
- **THEN** the SPA invalidates `["libraries"]` and `["library", id]` and the chain re-renders from the `GET /libraries/{id}` module block — never from the PATCH request body

<!-- wf:probe id=abf0ee6f018eba9f -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Naming preview mirrors the server composer

- **WHEN** the operator edits the naming fields and the live preview is compared against the golden vectors
- **THEN** the client-composed preview matches the Go composer byte-for-byte on every golden vector — `{episode}` inside the title, 3-digit episodes in full, an absent token rendering as empty, Cyrillic verbatim — with the sample row drawn from the library's first episode

<!-- wf:probe id=09fc44e9bf09620b -->
```bash
set -e
cd web && npx vitest run src/lib/naming.test.ts
```
<!-- /wf:probe -->

#### Scenario: Refresh metadata previews per plugin before triggering

- **WHEN** the operator picks a refresh source in the section's dropdown
- **THEN** the preview loads for that plugin with a loading line and renders before the trigger, a module without refreshable sources renders the section's empty state with explanatory copy, a 409 renders "A refresh is already running", and an unwired endpoint renders the section disabled with explanatory copy

<!-- wf:probe id=8731478ff8246028 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Rescan reports inline in its section

- **WHEN** the operator triggers a rescan from the Manage overlay
- **THEN** the section renders `{discovered, persisted}` inline with warnings omitted when the list is empty

<!-- wf:probe id=ccad8133226714a8 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

### Requirement: Embedded build carries the management UI

The committed embedded build (`internal/web/dist/`) SHALL be regenerated from
this change's `web/src` via the dev-time `make web-build` path and committed;
the OpenAPI contract files (`internal/web/api/openapi.{json,yaml}`) SHALL
come out unchanged (this change edits no route or annotation), and the Go
embed directive and the node-free Go build gate stay untouched.

#### Scenario: Committed dist is the fresh build of this change's SPA

- **WHEN** the committed dist bundle is compared against a fresh build of this change's `web/src` and the full Go gate runs
- **THEN** `dist/index.html` and hashed `assets/*.js` exist, the bundle carries the management-surface literals, the OpenAPI files list `/libraries/{id}/refresh` and `/items/{id}/parsers` unchanged, the full Go gate exits 0 node-free, and the committed tree stays clean after the fresh build — the committed dist IS the current build

<!-- wf:probe id=6e519fd6cc1c27e0 -->
```bash
set -e
test -f internal/web/dist/index.html
ls internal/web/dist/assets/*.js >/dev/null
grep -qrs "Not identified" internal/web/dist/assets
grep -qF '"/libraries/{id}/refresh":' internal/web/api/openapi.json
grep -qF '"/items/{id}/parsers":' internal/web/api/openapi.json
(cd web && npm run build >/dev/null 2>&1)
make build check test lint
test -z "$(git status --porcelain internal/web/dist)"
```
<!-- /wf:probe -->

### Requirement: Sources admin surface

The SPA SHALL offer a Sources admin surface beside the Collections panel:
one row per loaded plugin showing its display name, health chip, serial-chain
position, and per-module effective-enabled state, each togglable — a module
toggle PATCHes `/admin/sources/{plugin_id}` and a Collection-scope toggle
PUTs/DELETEs the library gate route. A toggle response's queued count SHALL
render inline ("re-enriching N items") and canonical errors SHALL surface
inline without auto-retry. The surface SHALL offer a composition preview that
POSTs the hypothetical gate vector and renders the before/after name pairs
symmetrically, marking `no_data` rows. The surface SHALL consume the served
`title_sources` presentation pairs for chain display — it MUST NOT resolve
gates client-side.

#### Scenario: Toggling a source surfaces the queued count and errors

- **WHEN** the operator disables a source module-wide, re-enables it, and separately a toggle is refused by the server
- **THEN** the disable renders its queued count of 0 without a wake notice, the enable renders its queued count inline, and the refused toggle surfaces the canonical error inline without auto-retry

<!-- wf:probe id=28499782454703ae -->
```bash
set -e
cd web && npx vitest run src/pages/admin/Sources.test.tsx && npx tsc --noEmit
```
<!-- /wf:probe -->

#### Scenario: Preview renders before and after symmetrically

- **WHEN** the operator requests a preview for a hypothetical disable from the Sources surface
- **THEN** the response renders each row's before and after names side by side with `no_data` rows marked, and the surface sends no gate write in doing so

<!-- wf:probe id=68706750c7ddedd3 -->
```bash
set -e
cd web && npx vitest run src/pages/admin/Sources.test.tsx && npx tsc --noEmit
```
<!-- /wf:probe -->

### Requirement: The Go gate runs node-free

The Go gate SHALL stay green node-free: committed artifacts embedded, no
node/npm/swag step in the gate; `make web-build` SHALL stay dev-time (OpenAPI
and web dist regenerate at LANDING, never in a probe).

#### Scenario: The change's full Go gate stays green

- **WHEN** the change's Go gate runs from the repo root — `make build check test lint`
- **THEN** it exits 0 node-free

<!-- wf:probe id=ebd254ceacffd32c -->
```bash
make build check test lint
```
<!-- /wf:probe -->

### Requirement: Plugins admin surface

The SPA SHALL offer a Plugins admin surface beside Collections and Sources
(route `/admin/plugins`, reachable from the sidebar and from the admin pages'
tab row): one row per loaded plugin with its display name and description,
capability chips, state chips — the served health state rendered working for
`serving`, errored for `failed`/`not_serving` with the served message inline,
the served word otherwise, plus a disabled chip per module whose served
effective verdict mutes the plugin — and its config bindings rendered
read-only (module, kind, priority, enabled, auth mode, display fields, options
JSON verbatim). Per plugin the surface SHALL offer a last-logs view fetching
`GET /admin/plugins/{plugin_id}/logs` on demand and rendering the bounded tail
oldest-first. The surface consumes the SERVED verdicts and never resolves
gates client-side; it writes nothing; canonical errors surface inline without
auto-retry.

#### Scenario: The surface renders state and config per plugin

- **WHEN** the operator opens `/admin/plugins` with the aggregate answering
- **THEN** each loaded plugin renders its name, state chips (the served health state; a disabled chip per served module verdict muting it), capability chips, and its config bindings with the options JSON verbatim, and the page issues no write

<!-- wf:probe id=85b1963591d79139 -->
```bash
set -e
cd web && npx vitest run src/pages/admin/Plugins.test.tsx && npx tsc --noEmit
```
<!-- /wf:probe -->

#### Scenario: Last logs render on demand

- **WHEN** the operator opens a plugin's last-logs view and the endpoint answers with the plugin's captured tail
- **THEN** the lines render oldest-first inline and a canonical error renders inline without auto-retry

<!-- wf:probe id=254e34ec3a058ca6 -->
```bash
set -e
cd web && npx vitest run src/pages/admin/Plugins.test.tsx && npx tsc --noEmit
```
<!-- /wf:probe -->

### Requirement: Series identify overlay

The series card's Identify… row SHALL open ONE overlay with three steps:
search (the input pre-filled from the current display name), candidates (the
source's served order rendered verbatim), and confirm (stating plainly what
replaces what). The search step SHALL show the current match for
orientation — the served metadata identity (title, kind, year, score) when
the served about block carries them, the honest none-state when the row
carries no match. A search in flight SHALL render as a quiet text line,
never a spinner. Zero candidates SHALL render the honest empty state
suggesting the original title or the source id. A failed search SHALL
render the canonical inline error with retry disabled, the overlay staying
open. The candidates step SHALL offer a source picker built from the served
`refresh_sources` bindings when more than one is served, defaulting to the
first. The confirm step SHALL name the picked title and state that
description, genres, and facts re-pull from the source while the display
name stays. Confirm SHALL `PUT /api/v1/series/{id}/identify` with the picked
`{source_id, external_id}`, invalidate the series reads on the 202, state
the background-refresh staleness honestly, and collapse via the
awaited-mutation idiom; a canonical error renders inline with the overlay
open. The overlay SHALL obey the CardActions shell idioms (the Escape
matrix, awaited collapse, inline errors). A candidate's poster SHALL render
from the served URL when the source carries one and be honestly absent when
it does not.

#### Scenario: Search opens pre-filled with the current match for orientation

- **WHEN** the operator opens the series identify overlay on a series whose
display name is "Aria" and whose served metadata names «Проснись, Ария!»
- **THEN** the search input is pre-filled with "Aria" and the current-match
line names the served match with its kind, year, and score
<!-- wf:probe id=4f17167b11654553 -->
```bash
set -e
test -f web/src/components/manage/IdentifySeries.tsx
grep -q 'data-testid="identify-search-input"' web/src/components/manage/IdentifySeries.tsx
grep -q 'data-testid="identify-current-match"' web/src/components/manage/IdentifySeries.tsx
```
<!-- /wf:probe -->

#### Scenario: Candidates render the served order verbatim

- **WHEN** the search answers three candidates carrying titles, years,
kinds, episode counts, and posters
- **THEN** the list renders them in the served order with the served fields,
the optional poster rendering from its served URL when present, and no
client-side re-scoring or re-sorting exists in the component
<!-- wf:probe id=696a6aa22b39159b -->
```bash
set -e
grep -q 'data-testid="identify-candidate"' web/src/components/manage/IdentifySeries.tsx
if grep -qE '\.sort\(' web/src/components/manage/IdentifySeries.tsx; then exit 1; fi
```
<!-- /wf:probe -->

#### Scenario: The search states render honestly

- **WHEN** the search is in flight, answers zero candidates, and separately
fails
- **THEN** the in-flight state is a quiet text line (no spinner), zero
candidates render the suggest-original-title-or-source-id empty state, and
the failure renders the canonical inline error with retry disabled while
the overlay stays open
<!-- wf:probe id=7081cde90fb10bf5 -->
```bash
set -e
grep -q 'data-testid="identify-searching"' web/src/components/manage/IdentifySeries.tsx
grep -q 'data-testid="identify-empty"' web/src/components/manage/IdentifySeries.tsx
grep -q 'data-testid="identify-error"' web/src/components/manage/IdentifySeries.tsx
```
<!-- /wf:probe -->

#### Scenario: Confirm states the replacement plainly and PUTs the override

- **WHEN** the operator picks a candidate and confirms the replacement
- **THEN** the confirm step names the picked title and states that
description, genres, and facts re-pull while the display name stays, the SPA
PUTs `/api/v1/series/{id}/identify` with the picked source_id and
external_id, and the 202 invalidates the series reads with the staleness
copy
<!-- wf:probe id=1bdd78db58439891 -->
```bash
set -e
grep -q '/identify' web/src/lib/api.ts
grep -q 'data-testid="identify-confirm"' web/src/components/manage/IdentifySeries.tsx
```
<!-- /wf:probe -->

#### Scenario: The row gates on the wired chain

- **WHEN** a library's module block is absent or its chain is empty
- **THEN** the series card's menu offers no Identify… row — the designed
empty state, never spinners
<!-- wf:probe id=bb7791e40f40101e -->
```bash
set -e
grep -q 'identify={seriesIdentifyGate' web/src/pages/collections/Collection.tsx
```
<!-- /wf:probe -->

### Requirement: Poster art rendering through the binary

The SPA SHALL render poster artwork from the served document's `artwork` field only — it SHALL never read `sources.*.poster` and SHALL issue zero external image requests on library surfaces. A `PosterFrame` component SHALL show the art through the authenticated art-object byte channel (object-URL `<img>`, the existing media-fetch idiom) when `artwork` resolves, and otherwise SHALL render the deterministic generated fallback: a pure function of the display name hashing to two pastel HSL stops with the first grapheme as the initial (Cyrillic verbatim) — never today's blank span, never a broken-image glyph, never a known missing-art placeholder asset. The three surfaces SHALL adopt it: collection series cards (the `scard-poster` slot), the series-flow header poster beside the About panel (the header never collapsing), and the item page's identity-column lead image (`item.artwork` when served, else the existing frame-grab hero fallback; the player's poster behavior untouched). A module-scope LRU of object URLs (~64 entries) SHALL own revocation (on eviction and URL change) so grid remounts consult the cache instead of re-fetching.

#### Scenario: Real art renders through the binary, absence renders the fallback
- **WHEN** the collection grid renders a series whose document carries `artwork` and a series whose document omits it
- **THEN** the first card shows the poster bytes fetched through the authenticated art-object channel, and the second shows the generated fallback card derived from its display name — same name, same gradient, no broken-image state

#### Scenario: Grid remount does not re-fetch art
- **WHEN** the operator navigates away from the collection grid and remounts it
- **THEN** the art objects come from the module-scope LRU and the network carries no additional art-object requests beyond the first load

#### Scenario: Item page lead image prefers served artwork
- **WHEN** an item page renders for an item whose served document carries `artwork` and for one that omits it but carries the frame-grabber thumb fact
- **THEN** the first renders the served artwork as the identity-column lead image, and the second falls back to the existing hero thumb — the player's poster behavior unchanged in both

### Requirement: Poster management overlay

The SPA SHALL offer a poster management overlay («Постер…») entered from the series card's CardActions menu and the item page's ⋯ menu, in the existing dialog-shell idiom (scrim, focus trap, escape matrix, awaited-mutation collapse, inline canonical errors with the overlay staying open). The overlay SHALL list one candidate card per served candidate (namespace poster, uploaded «user», item «thumb»), the active selection marked «Текущий» and the rest offering «Сделать главным»; staged candidates SHALL render their served proxy URLs while unstaged candidates render the raw remote URL hotlinked only inside this admin-only overlay (lazy load, hidden on error — the contractual exception to the zero-external-requests rule). Selecting a candidate SHALL PUT the selection and re-poll the candidates read until `current` flips, during which browse surfaces keep the previous artwork (no flash); the provenance footer SHALL read the served document's `_provenance.poster`. The overlay SHALL offer an upload path (drag-and-drop + file picker with a client-side pre-check mirroring the server guard for fast feedback — the server stays authoritative), an in-flight quiet line, and «Сбросить к источнику» (DELETE, resetting to the chain).

#### Scenario: Single-source series shows current and reset
- **WHEN** the overlay opens on a series whose only candidate is the served chain poster and no override is pinned
- **THEN** that candidate is marked «Текущий», «Сбросить к источнику» is the only action, and activating it answers success without error while composition stays on the chain value

#### Scenario: Rejected upload keeps the overlay open with an inline error
- **WHEN** the operator drops a file that fails the pre-check, or the server rejects an upload with a canonical error
- **THEN** the overlay renders the inline error line without closing, and no candidate or selection state changes

#### Scenario: Select polls until current flips without flashing browse
- **WHEN** the operator activates «Сделать главным» on an unstaged candidate
- **THEN** the selection is PUT, the overlay polls the candidates read until `current` marks the new selection, and the grid card keeps showing the previous artwork until the flip completes
