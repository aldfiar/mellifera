# Spec Delta — web-ui

## MODIFIED Requirements

### Requirement: Watched element states

Every browsable element SHALL render a tri-state watch presentation derived
ONLY from served data: `watched` (the DTO's `watched: true`) renders a small
✓ mark in the library's pastel accent plus a dimmed title (~0.55 opacity)
and NO progress bar; an in-progress element (a positive served position on
an unwatched item) renders the progress bar as today; a new element renders
today's clean state. The SPA SHALL NOT derive watched client-side (a zero
`rec_score` is not a watched signal). The ✓ is a color-change mark — no
pill or badge chrome. Sites: per-series episode table rows, series cards in
the collection series grid (SeriesCard; the series DTO's `watched`), cards
in the collection item grid (ItemGrid — TV mode is the same grids under the
html.tv CSS layer), and the element page heading beside the served display
name. Continue-rail rows render no mark — watched rows are withdrawn from
the rail by default.

On exactly three mounted surfaces — the collection item-grid episode cards
(ItemGrid; tv mode is the same grids under the html.tv CSS layer), the
per-series episode table rows (the series flow), and the element page
heading beside the served display name — the video element's ✓ SHALL be a
`WatchedToggle` button — a real `<button>`, hence a focus-walker target in
tv mode — occupying the mark's top-left slot (the ⋯ trigger keeps the
top-right): a watched element renders the filled accent ✓ clickable at rest
and one click writes `{"state": "unwatched"}`; an unwatched element renders
a quiet outline ✓ and one click writes `{"state": "watched"}`. The
unwatched outline SHALL follow the card-action disclosure law — revealed on
hover/focus only on fine pointers, persistently visible under
`pointer: coarse` and tv mode (the ⋯ trigger's law) — while the watched
fill SHALL stay visible at rest everywhere. The toggle SHALL NOT trigger
the card's navigation (the click never reaches the card) and SHALL refresh
the served state by invalidating the items/series/progress queries. The
in-progress presentation is unchanged: the progress bar stays, with the
outline toggle beside it. Series cards keep the PASSIVE filled mark — the
one-press all-episodes bulk toggle is deferred (v1.1). The player's own
completion signal (PUT /progress with `completed: true` at the
ended/credits edges) is untouched by the toggle.

#### Scenario: A finished episode renders watched

- **WHEN** an episode row's served DTO carries `watched: true`
- **THEN** the row renders the ✓ pastel mark, the dimmed title, and no
  progress bar, while an in-progress sibling keeps its bar

#### Scenario: The Continue rail hides served-watched rows

- **WHEN** Home fetches progress with `include=watched` and the response
  carries rows both with and without `watched: true`
- **THEN** the Continue rail renders only the unwatched rows, and the
  Next-up derivation still anchors from every served row (a fully-watched
  series still surfaces its next unwatched episode)

#### Scenario: One click toggles the state without navigating

- **WHEN** the operator clicks the ✓ on a watched episode card and then on
  an unwatched sibling
- **THEN** the first click fires the item state write with `unwatched`, the
  second with `watched`, neither click navigates the card or row, and both
  surfaces re-render from the invalidated items/series/progress queries

#### Scenario: The unwatched affordance is persistent without hover on TV

- **WHEN** tv mode (or any `pointer: coarse` device) renders an unwatched
  card — bare or carrying an in-progress bar
- **THEN** the quiet outline ✓ is visible at rest before any hover or
  focus, and on a fine-pointer desktop it stays hover/focus-revealed as
  shipped for the ⋯ trigger

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
the first row when the card is unidentified). The watched state is NOT a
menu row: the card's WatchedToggle ✓ owns it (see Watched element states) —
the manual `position=duration` mark path is retired.

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

- **WHEN** the manual watched path is sought in any item card's menu — the
  item's duration known or unknown
- **THEN** no Mark watched row exists at any duration: the retired
  `position=duration` gate no longer applies because the row is gone — the
  state route needs no duration and the card's WatchedToggle ✓ is the only
  manual path

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

## ADDED Requirements

### Requirement: Title clamp law

Titles on user surfaces SHALL clamp at 2 lines with an ellipsis; the full
name SHALL ride the native `title` attribute on the same element; chrome
(size, layout, hit targets) SHALL never shrink to fit a title — a long name
consumes at most its clamped box and never pushes content down. The law
applies to: the series flow header heading, card titles (the poster-card
`.scard-title` rule in CSS — one point for every card carrying it — and the
inline Tailwind title spans on item cards and episode rows), the element
page heading, and the series flow header's Synopsis description (capped at
2 lines the same way so the header can never tower regardless). Text
smaller than 2 lines renders unchanged; the clamp is pure CSS
(`line-clamp`) with no JS measurement and no font step-down.

#### Scenario: A long series name clamps in the flow header

- **WHEN** a series whose served display name wraps more than two lines is
  opened in the series flow
- **THEN** the header heading renders exactly the clamped 2-line box with an
  ellipsis, the full name sits on the element's native `title` attribute,
  and the episode table below keeps its position

#### Scenario: Card titles never break the card budget

- **WHEN** a grid card's display name is long enough to wrap past two lines
- **THEN** the title clamps at 2 lines with an ellipsis inside the card's
  fixed body box — the card grows no taller and the grid's row rhythm holds

#### Scenario: The flow-header Synopsis caps at the same box

- **WHEN** a series carries a long scraped synopsis in the series flow
  header
- **THEN** the description clamps at 2 lines with an ellipsis and the full
  text rides the native `title` attribute, whatever the header's other
  content does
