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
heading beside the served display name — the video element's watched
affordance SHALL be a `WatchedToggle` button — a real `<button>`, hence a
focus-walker target in tv mode — rendering the text label `watched`
(lowercase) as a small chip. On the two card/row surfaces the toggle
occupies the top-right slot LEFT of the ⋯ trigger (the trigger keeps its
own slot and its card-action disclosure law untouched — the label's right
edge sits one 6px gutter past the trigger's left edge); on the element page
heading it stays the inline flow variant beside the display name. The label
SHALL be visible at rest in BOTH states on every pointer class, fine
pointers included: the card-action disclosure law is retired for this
control and remains the ⋯ trigger's law alone. A watched element renders
the label in the library's pastel accent, clickable at rest, and one click
writes `{"state": "unwatched"}`; an unwatched element renders the label as
a muted ghost with a quiet 1px ring and one click writes
`{"state": "watched"}`. The toggle SHALL NOT trigger the card's navigation
(the click never reaches the card) and SHALL refresh the served state by
invalidating the items/series/progress queries. The in-progress
presentation is unchanged: the progress bar stays, with the ghost-label
toggle beside it. Series cards keep the PASSIVE filled ✓ mark — the
one-press all-episodes bulk toggle is deferred (v1.1). The player's own
completion signal (PUT /progress with `completed: true` at the
ended/credits edges) is untouched by the toggle.

#### Scenario: A finished episode renders watched

- **WHEN** an episode row's served DTO carries `watched: true`
- **THEN** the row renders the pastel-accent `watched` label at the toggle's
  top-right slot, the dimmed title, and no progress bar, while an
  in-progress sibling keeps its bar

#### Scenario: The Continue rail hides served-watched rows

- **WHEN** Home fetches progress with `include=watched` and the response
  carries rows both with and without `watched: true`
- **THEN** the Continue rail renders only the unwatched rows, and the
  Next-up derivation still anchors from every served row (a fully-watched
  series still surfaces its next unwatched episode)

#### Scenario: One click toggles the state without navigating

- **WHEN** the operator clicks the `watched` label on a watched episode card
  and then on an unwatched sibling
- **THEN** the first click fires the item state write with `unwatched`, the
  second with `watched`, neither click navigates the card or row, and both
  surfaces re-render from the invalidated items/series/progress queries

#### Scenario: The unwatched affordance is persistent without hover on TV

- **WHEN** tv mode (or any `pointer: coarse` device) renders an unwatched
  card — bare or carrying an in-progress bar — and equally on a
  fine-pointer desktop before any hover or focus
- **THEN** the ghost `watched` label with its quiet ring is visible at rest
  on every pointer class — the label never rides the card-action disclosure
  law (the ⋯ trigger keeps that law for itself)
