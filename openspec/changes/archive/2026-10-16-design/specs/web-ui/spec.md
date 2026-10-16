# web-ui Delta

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
/api/v1/series/{id}/title`, `PUT /api/v1/items/{id}/title`, and `DELETE
/api/v1/items/{id}/title` — with wire shapes mirrored verbatim. Media loads
(originals, thumbs, and `?variant=sidecar` subtitle bytes) SHALL go through
the authenticated fetch wrapper into object URLs (an `<img>`/`<track>`
channel cannot carry the bearer header), keeping the media endpoint's
bearer gate intact. Every new SPA consumer SHALL keep the byte-identical Go
contract posture: no client-side shaping that the server does not send.

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
without auto-retry.

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

## ADDED Requirements

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

Series-card menu rows: Rename… (curing a polluted composed name on every
episode at once through read-time recomposition) and Refresh metadata… (the
series id as the refresh row — series rows live in the refresh row space).
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
- **THEN** both cards carry no status pill and no "file" chip, both menus offer Rename and Refresh metadata rows, and the file-backed card's menu carries the "File-backed series" footer while the directory-backed card's carries none

<!-- wf:probe id=159a8e89cb36c3c3 -->
```bash
set -e
cd web && npx vitest run src/pages/collections/Collection.test.tsx
```
<!-- /wf:probe -->

#### Scenario: Coarse pointers see the menu without hover

- **WHEN** the collection surface renders on a coarse-pointer device (touch/TV)
- **THEN** the CardActions trigger is persistently visible with a muted glyph and a hit target of at least 40px, with no hover and no learned gesture required

UNPROBEABLE

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

The Refresh view SHALL offer one radio per parser in the library's chain (the
endpoint requires exactly one `plugin_id` per invocation) and POST
`/libraries/{id}/refresh` with `{plugin_id, row_ids: [id]}` — the item's own
row for an item card, the series id for a series card (series rows live in
the same refresh row space); the per-row call bypasses the whole-library 409
guard. A 202 SHALL render the response inline — the queued/stripped counts
(the synchronous strip pass makes them real) and, for a deferred row, the
copy "kept its data — try again shortly" (the row is busy). A 409 SHALL
render "A refresh is already running" inline. Canonical errors surface inline
without auto-retry.

#### Scenario: Refresh posts one parser per invocation and renders the counts inline

- **WHEN** the operator picks a chain parser and triggers the refresh on one item row
- **THEN** the SPA POSTs `/libraries/{id}/refresh` with that `plugin_id` and `row_ids` of exactly the one id, and the 202 body renders inline including the deferred copy when the row was deferred

<!-- wf:probe id=b16291d041f36f74 -->
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
- **Refresh metadata**: a chain-parser picker fetching
  `GET /libraries/{id}/enrich/preview?plugin_id=` on selection with a loading
  line (the preview is per-plugin and slow — a whole-library computation on
  demand); the preview renders BEFORE the trigger; a 409 renders "A refresh
  is already running"; an unwired endpoint (503) renders the section disabled
  with explanatory copy.
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

- **WHEN** the operator picks a chain parser in the refresh metadata section
- **THEN** the preview loads for that plugin with a loading line and renders before the trigger, a 409 renders "A refresh is already running", and an unwired endpoint renders the section disabled with explanatory copy

<!-- wf:probe id=6ce396cbbc0e19e2 -->
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
