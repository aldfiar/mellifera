# Spec Delta

## MODIFIED Requirements

### Requirement: Continue and Next up surfaces

The home surface SHALL render the Continue rail from `GET /api/v1/home` in a
single request: one row per served continue entry, showing the series' served
`display_name`, its source collection name, a progress bar for the row's
current item rendered ONLY when the row carries `duration_seconds` (honest
absence — no duration, no bar), a remaining-time or percent label, and the
item's frame-grabber thumb preview loaded through the authenticated media
fetch (the same pattern as the collection card's preview); an item whose
document carries no thumb fact SHALL keep the honest badge-only row — never a
broken-image state. When a row carries a served `next` entry, the row SHALL
render its next-episode affordance — the served `label` (e.g. `S02E06`)
verbatim — navigating to `next.item_id`; when `next` is absent, no such
affordance SHALL render. The client MUST NOT re-derive next-up, re-implement
name composition, or carry per-surface copies of either chain: the home
surface's per-series episode fan-out (`GET /series/{id}/episodes` per started
series), the client started-series grouping, and the `module_id === "tv"`
gate are removed from it — films surface as continue rows without a next
offer. A row carrying `current` keeps a Play affordance for its current item
with the same navigation the Continue cards use today; a row WITHOUT
`current` — the caught-up series' anchor card — renders NO position, percent
bar, or Play-into-current affordance: the series' served `display_name`
promotes to the title slot and the served next affordance IS the card's
primary play affordance, navigating to `next.item_id`. The home surface SHALL
render the shared empty state when the `/home` response carries no rows. The
watch page's next-episode derivation is a different surface and is untouched
by this requirement.

#### Scenario: Continue renders in-progress items with progress

- **WHEN** the home response carries continue rows whose current items have
  positive positions
- **THEN** the Continue rail renders exactly those rows in the served order
  with progress bars and Play affordances, from the single `/home` request

#### Scenario: Next up derives the next unstarted episode

- **WHEN** a continue row's series holds later unstarted episodes
- **THEN** the row itself carries the server-served next offering the
  lowest-numbered unstarted episode with a Play affordance, a row whose series
  has nothing later renders no next affordance, and the shared empty state
  still renders when the whole rail is empty

#### Scenario: Continue cards carry the stop-frame thumb and the series-named title

- **WHEN** the home surface renders an in-progress serial episode whose
  document carries the thumb fact, alongside an episode with no thumb fact
  and a tv-module film
- **THEN** the serial episode row shows the thumb preview and its served
  `display_name` (the composed `<series title> · SxxEyy`), the no-thumb item
  keeps the honest badge-only row, and the film renders as a continue row
  without a next offer

#### Scenario: Next up derives from series records and their episode lists

- **WHEN** the server composes a row's next pick
- **THEN** it offers the lowest `(season, episode)` strictly after the
  highest-started one — the same reading the client derivation used to apply
  over series records and their episode lists — while the SPA performs no
  episode-list fetches, no started-series grouping, and no `module_id`
  gating itself

#### Scenario: Single-request home render

- **WHEN** the home surface mounts with several started series
- **THEN** exactly one `GET /api/v1/home` request fires — no `/progress`
  listing and no per-series episode fetches — and the rows render the served
  fields verbatim

#### Scenario: Honest progress bar

- **WHEN** a continue row arrives without `duration_seconds`
- **THEN** that row renders without a progress bar, its label and thumb
  otherwise intact

#### Scenario: Next affordance comes from the server

- **WHEN** one row carries `next` and another does not
- **THEN** the first row shows the served label navigating to `next.item_id`
  and the second renders no next affordance — the client composed neither
  label nor pick

#### Scenario: Anchor card renders the series as the primary affordance

- **WHEN** the home response carries an anchor card — a caught-up series
  whose row omits `current` — beside resume rows that carry `current`
- **THEN** the anchor card shows the series' served `display_name` in the
  title slot, its artwork, and the served next label as the card's primary
  play affordance navigating to `next.item_id`, with no position, percent
  bar, or Play-into-current affordance, while the resume rows render exactly
  as before

#### Scenario: Empty home is a shared empty state

- **WHEN** `GET /api/v1/home` returns no continue rows
- **THEN** the home surface renders the shared empty state in place of the
  rail

### Requirement: Watched element states

Every browsable element SHALL render a tri-state watch presentation derived
ONLY from served data, scoped TO THE VIEWER: `watched` (the DTO's
`watched: true`) renders a small ✓ mark in the library's pastel accent plus a
dimmed title (~0.55 opacity) and NO progress bar; an in-progress element (a
positive served position on an unwatched item) renders the progress bar as
today; a new element renders today's clean state. Each viewer's served rows
carry that viewer's own state — another user's watch never marks an element.
The SPA SHALL NOT derive watched client-side (a zero `rec_score` is not a
watched signal). The ✓ is a color-change mark — no pill or badge chrome.
Sites: the per-series episode cards and the collection item-flow cards
(MovieCard-hosted), series cards in the collection series grid (SeriesCard;
the series DTO's `watched`), the film/tv item grid's cards (ItemGrid — TV
mode is the same grids under the html.tv CSS layer), and the element page
heading beside the served display name. Continue-rail rows render no mark —
the rail composes at entity grain server-side and never renders a raw watched
progress row: watched elements reach the rail only through that composition
(a caught-up series' anchor card offering its next unwatched episode), and
another user's watch never changes a viewer's rail.

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

- **WHEN** the `/home` response composes a caught-up series — every touched
  progress row ledgered-watched — beside in-progress rows
- **THEN** the Continue rail renders no watched progress row as a resume
  point: the caught-up series surfaces ONE anchor card (series name, artwork,
  its next unwatched episode) with no resume body — a fully-watched series
  still surfaces its next unwatched episode

#### Scenario: Watch state follows the viewer

- **WHEN** user A completes an episode while user B has not started it, and B's browser lists the same series
- **THEN** B's served rows carry no watched flag and no A-position progress bar — the states are per-viewer, never global

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
