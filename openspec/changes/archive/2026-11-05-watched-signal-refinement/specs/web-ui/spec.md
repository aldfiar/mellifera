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
pill or badge chrome. Sites: the per-series episode cards and the collection
item-flow cards (MovieCard-hosted), series cards in the collection series
grid (SeriesCard; the series DTO's `watched`), the film/tv item grid's cards
(ItemGrid — TV mode is the same grids under the html.tv CSS layer), and the
element page heading beside the served display name. Continue-rail rows
render no mark — watched rows are withdrawn from the rail by default.

On exactly three mounted surfaces — the collection's item cards
(MovieCard-hosted movie and episode cards in the item flow and the
per-series flow), the film/tv item grid's cards (ItemGrid; TV mode is the
same grids under the html.tv CSS layer), and the element page heading beside
the served display name — the video element's watched affordance SHALL be a
`WatchedToggle` button — a real `<button>`, hence a focus-walker target in
tv mode — rendering a single ✓ glyph. One glyph, never a word: the string
`watched` never renders on a user surface; the state-distinct aria names
"Watched"/"Unwatched" and the progress bar's "<n>% watched" announcement are
the pinned accessibility seam and are untouched. On the two card surfaces
the toggle is a flow child of the card's meta row — a flex row BELOW the
link, inside the card's border box, carrying the meta text and the
in-progress bar with the toggle right-aligned at the row's end (an empty
meta renders the toggle alone at the same slot) — and it sits OUTSIDE the
link (a button never nests inside an anchor); the ⋯ trigger keeps the
top-right corner, its own slot, and its card-action disclosure law
untouched. On the element page heading the toggle stays the inline flow
variant beside the display name. The watched ✓ SHALL be visible at rest on
every pointer class; the unwatched ✓ SHALL be hidden at rest on fine
pointers — revealed by the card's hover/focus-within and by its own keyboard
focus, with pointer events disabled at rest so the invisible slot never
swallows a click — and persistently visible on coarse pointers and in tv
mode; the element page heading is exempt from the hide-at-rest: its ✓ stays
visible at rest in BOTH states — the pastel accent when watched, the muted
ghost when unwatched (today's heading behavior; the `.watched-mark`
precedent). A watched element renders the ✓ in the library's pastel accent,
clickable at rest, and one click writes `{"state": "unwatched"}`; an
unwatched element renders the ✓ as a muted ghost with no pill, badge, or
ring chrome and one click writes `{"state": "watched"}`. The hit twins the
label chip's inline sizing defeated are restored: the toggle measures at
least 28px on fine pointers, at least 40px on coarse pointers, and the tv
clamp twin governs in tv mode. The toggle SHALL NOT trigger the card's
navigation (the click never reaches the card) and SHALL refresh the served
state by invalidating the items/series/progress queries. The in-progress
presentation is unchanged: the progress bar stays, now seated on the card's
meta row beside the toggle. Series cards keep the PASSIVE filled ✓ mark —
the one-press all-episodes bulk toggle is deferred (v1.1). The player's own
completion signal (PUT /progress with `completed: true` at the ended/credits
edges) is untouched by the toggle.

#### Scenario: A finished episode renders watched

- **WHEN** an episode card's served DTO carries `watched: true`
- **THEN** the card renders the pastel-accent ✓ right-aligned on its meta
  row outside the link, the dimmed title, and no progress bar, while an
  in-progress sibling keeps its bar

#### Scenario: The Continue rail hides served-watched rows

- **WHEN** Home fetches progress with `include=watched` and the response
  carries rows both with and without `watched: true`
- **THEN** the Continue rail renders only the unwatched rows, and the
  Next-up derivation still anchors from every served row (a fully-watched
  series still surfaces its next unwatched episode)

#### Scenario: One click toggles the state without navigating

- **WHEN** the operator clicks the ✓ toggle on a watched episode card and
  then on an unwatched sibling
- **THEN** the first click fires the item state write with `unwatched`, the
  second with `watched`, neither click navigates the card, and both surfaces
  re-render from the invalidated items/series/progress queries

#### Scenario: The unwatched affordance is persistent without hover on TV

- **WHEN** tv mode (or any `pointer: coarse` device) renders an unwatched
  card — bare or carrying an in-progress bar — and equally on a fine-pointer
  desktop before any hover or focus
- **THEN** on coarse pointers and in tv mode the ghost ✓ is persistently
  visible with its restored hit twin (at least 40px coarse, the tv clamp in
  tv mode), no hover and no learned gesture required, while on a
  fine-pointer desktop the same card hides the ✓ at rest and reveals it on
  card hover/focus-within or keyboard focus — the disclosure law governs the
  unwatched affordance on fine pointers only, and the ⋯ trigger keeps that
  law for itself on every pointer class

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
the ✓ rides the card's meta row, no longer the top-right corner — and the
manual `position=duration` mark path is retired.

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
