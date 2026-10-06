# web-ui Delta — Phase 2b (client browse + item detail + metadata rendering) + 2c (polish)

Delta for the existing `web-ui` capability (`openspec/specs/web-ui/spec.md`). Phase 2a (SPA scaffold + auth + admin panel) is baseline — no requirement in this delta re-states it.

## ADDED Requirements

### Requirement: Client browse panel

The SPA SHALL offer a `/browse` route (wrapped in `<RequireAuth>`) listing items from the pre-existing `GET /api/v1/items?library=&status=&limit=&offset=` (browse role group, admin+client — internal/api/router.go:92-95). Because the wire requires an integer `library` (internal/api/handlers.go:222-228; `store.QueryItems` is library-scoped — internal/store/items.go:99-108), the browse view SHALL scope every query to a library selected in the UI, defaulting to the first library from `GET /api/v1/libraries`; it SHALL offer a status filter over the enrich lifecycle statuses (new, pending, parsed, enriched, failed, ready, stale — internal/enrich/state.go:13-21; empty = all) and limit/offset pagination (server default page size 50, max 200). The root path `/` (and the SPA wildcard) SHALL redirect to `/browse`, and the app navigation SHALL link the admin and browse panels.

#### Scenario: Browse list with library, status, and pagination
- **WHEN** the operator opens `/browse`, selects a library and a status filter, and pages through results
- **THEN** each page renders items from `GET /api/v1/items` scoped to the selected library with the chosen status filter and limit/offset pagination

<!-- wf:probe id=2ae516b0a9b2e959 -->
```bash
set -e
grep -q "useItems" web/src/lib/queries.ts
grep -q "useItems" web/src/pages/browse/Browse.tsx
grep -q "listItems" web/src/lib/api.ts
grep -q "offset" web/src/lib/api.ts
grep -q "offset" web/src/pages/browse/Browse.tsx
grep -q "status" web/src/pages/browse/Browse.tsx
```
<!-- /wf:probe -->

#### Scenario: Root redirect and panel navigation
- **WHEN** an authenticated operator opens `/` and uses the app navigation
- **THEN** `/` lands on `/browse` and the navigation reaches both `/browse` and `/admin`

<!-- wf:probe id=c2f94b26c5460662 -->
```bash
set -e
grep -q 'Navigate to="/browse"' web/src/App.tsx
! grep -q 'Navigate to="/admin"' web/src/App.tsx
grep -q '"/browse"' web/src/components/AppNav.tsx
grep -q '"/admin"' web/src/components/AppNav.tsx
```
<!-- /wf:probe -->

### Requirement: Item detail view

The SPA SHALL offer an `/items/:id` route (wrapped in `<RequireAuth>`) that fetches the pre-existing `GET /api/v1/items/{id}` and renders the full §3.1 document: Tier-1 `identifiers` and core-managed fields; one `<SourceCard>` per `sources.<plugin>` namespace; a `<ProvenanceBadge>` per `_provenance` entry; `<ViewFields>` for `_view` entries (value + source + reason); and `<StagesProgress>` for `_stages` entries (stage, plugin_id, status, advanced_to, started_at, finished_at, error? — internal/enrich/enrich.go:137-149). A missing item (404 not_found) SHALL render a clear not-found state, not a crash.

#### Scenario: All document tiers render
- **WHEN** the operator opens `/items/:id` for an enriched item carrying identifiers, sources, _view, _provenance, and _stages
- **THEN** the page renders the identifiers, one card per source namespace, the view fields, one badge per provenance entry, and the stage progress including any per-stage error

<!-- wf:probe id=b79d00b806de225d -->
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

The committed embedded build (`internal/web/dist/`) SHALL be regenerated from this phase's `web/src` via the dev-time `make web-build` and committed, so the served SPA carries the browse/detail routes; the Go embed directive (`//go:embed all:dist`, internal/web/web.go:20) and the node-free Go gate stay untouched.

#### Scenario: Committed dist carries the new routes
- **WHEN** the committed `internal/web/dist` bundle is inspected
- **THEN** `dist/index.html` and a hashed `assets/*.js` bundle exist and the bundle contains the `/browse` route literal from this phase's build

<!-- wf:probe id=9dd1b65255bacdf4 -->
```bash
set -e
test -f internal/web/dist/index.html
ls internal/web/dist/assets/*.js >/dev/null
grep -qrs "/browse" internal/web/dist/assets
```
<!-- /wf:probe -->

## MODIFIED Requirements

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the Phase-1 API — zero new endpoints — calling only `GET /api/v1/libraries`, `POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`, `GET /api/v1/admin/status`, `GET /api/v1/items?library=&status=&limit=&offset=`, and `GET /api/v1/items/{id}`, with the items client mirroring the Go wire shapes verbatim (`id, module_id, library_id, file_id, relative_path, media_type, document, schema_version, status`) and the Go side byte-identical: no new endpoints, symbols, or package imports; only the regenerated embedded `internal/web/dist/` bytes change.

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

#### Scenario: No off-contract calls
- **WHEN** the SPA's network calls are audited and the Go tree is built
- **THEN** every app call targets one of the six pre-existing `/api/v1` routes and `go build ./...` succeeds with no new Go endpoints or package imports

<!-- wf:probe id=288ac5d45de8c35e -->
```bash
set -e
violations=$(grep -rnE "fetch\(|['\"]/api/" web/src --include="*.ts" --include="*.tsx" \
  | grep -v "\.test\." \
  | grep -vE "/(items|libraries|admin/status)" \
  | grep -vE "fetch\(path") || true
test -z "$violations"
go build ./...
```
<!-- /wf:probe -->
