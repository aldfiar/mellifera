# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
