# web-ui Delta — collections-first shell, home, collection pages, admin

Modifies the `web-ui` capability: the SPA becomes collections-first — a hidden
sidebar shell with a profile and a fast-navigation list of all collections, a
Home surface rendering one card per collection with Continue/Next up, per-
collection pages (`/collections/{id}`) keyed by module type, and an admin panel
re-scoped to collections management (table, add form, edit overlay). Root paths
and enrich-lifecycle status pills leave the user surfaces (paths are admin-only);
the plugin/enrich Status section is removed from the SPA while the
`GET /admin/status` contract stays untouched. `/browse` is replaced by Home +
collection pages.

## MODIFIED Requirements

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

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the versioned API — calling only
`GET /api/v1/libraries`, `POST /api/v1/libraries`, `PATCH
/api/v1/libraries/{id}`, `GET /api/v1/libraries/{id}/summary`,
`GET /api/v1/libraries/{id}/folders`, `POST /api/v1/libraries/{id}/scan`,
`GET /api/v1/items`, `GET /api/v1/items/{id}`, `GET /api/v1/series`,
`GET /api/v1/series/{id}`, `GET /api/v1/series/{id}/episodes`,
`GET /api/v1/progress`, `PUT /api/v1/progress/{item_id}`, and `GET
/api/v1/admin/status` — with wire shapes mirrored verbatim. Every new SPA
consumer SHALL keep the byte-identical Go contract posture: no client-side
shaping that the server does not send.

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

<!-- wf:probe id=ca3aae99a81533ed -->
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

### Requirement: Embedded build carries the phase UI

The committed embedded build (`internal/web/dist/`) SHALL be regenerated from
this phase's `web/src` via the dev-time `make web-build` and committed, so the
served SPA carries the `/collections` routes; the Go embed directive
(`//go:embed all:dist`) and the node-free Go build gate stay untouched.

#### Scenario: Committed dist carries the new routes

- **WHEN** the committed `internal/web/dist` bundle is inspected
- **THEN** `dist/index.html` and hashed `assets/*.js` exist and the bundle contains the `/collections` route literal from this phase's build

<!-- wf:probe id=fe5d7468a0e434f4 -->
```bash
set -e
test -f internal/web/dist/index.html
ls internal/web/dist/assets/*.js >/dev/null
grep -qrs "/collections" internal/web/dist/assets
```
<!-- /wf:probe -->

## REMOVED Requirements

### Requirement: Client browse panel

**Reason**: replaced by the Home collections surface and per-collection pages
(`/collections/{id}`) — a flat library-scoped item table with a library dropdown
no longer matches the collections-first IA; the pagination/status-filter
behavior it carried moves to the collection pages.

### Requirement: Admin status panel

**Reason**: the pipeline surface (plugin health, enrich stats) is dropped from
the SPA by product decision; the `GET /api/v1/admin/status` endpoint and its
role gating remain unchanged and stay documented via Swagger for operator
runbook use.

## ADDED Requirements

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
```
<!-- /wf:probe -->

### Requirement: Continue and Next up surfaces

The home surface SHALL render a **Continue** row from
`GET /api/v1/progress`: one card per item with `position_seconds > 0`, ordered
by recency, showing a progress bar, remaining-time or percent label, source
collection, and a Play affordance; and a **Next up** row deriving, per series
touched by Continue, the lowest-numbered episode of that series with no progress
record (season/episode and series grouping read from the items' existing
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
  limit/offset;
- `image` (photos) — a subfolder chip row from
  `GET /api/v1/libraries/{id}/folders` (client-side filtering) above a masonry
  grid of item tiles with capture-date footers;
- `serial` — a series grid from `GET /api/v1/series?library={id}` (the
  serials-library surface) whose cards open the series' episode flow.

The shared empty, loading, and error states, the pagination controls, and the
metadata-fidelity rules (verbatim values, per-source namespaces) SHALL apply to
every layout.

#### Scenario: Movies collection page

- **WHEN** the operator opens `/collections/{id}` for a `tv` library
- **THEN** the page renders the collection header and a paginated card grid of that library's items with parsed metadata chips and raw filenames, without paths or lifecycle pills

<!-- wf:probe id=b9c48ae1b98f0c79 -->
```bash
set -e
grep -q 'collections/' web/src/App.tsx
grep -q 'module_id' web/src/pages/collections/Collection.tsx
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

