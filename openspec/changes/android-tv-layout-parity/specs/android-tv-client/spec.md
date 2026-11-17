# Spec Delta

## Purpose

Extends the Android TV client with the layout-parity contract: the TV app
renders the same layouts as the web UI (same information architecture, same
field-driven blocks), navigated by the dpad laws the browse surface
established. Covers the text-visibility default, card anatomy, the Home
surface, the series-detail surface, module-keyed collection bodies, and
watch-flow affordances.

## ADDED Requirements

### Requirement: Text visibility default

The app SHALL wrap its whole tree in a dark MaterialTheme so every
default-styled text is readable against the black window background; loading
and error one-liners SHALL be visible without any per-call color.

#### Scenario: Default text is readable

- **WHEN** any screen renders a default-styled Text (title, loading row, error row)
- **THEN** it is legible on the black background — never black-on-black

#### Scenario: Invisible text regression

- **WHEN** a surface renders titles/meta that the a11y tree carries but the screenshot does not show
- **THEN** that is a defect of this requirement, not a rendering nuance

### Requirement: Card state-signal scale on TV

A per-item watched hint SHALL be exactly one ✓ glyph in the type accent at
meta-line scale, placed as a corner mark over the art block (the SPA
watched-signal corner placement); unwatched SHALL render absence — no mark,
no space. Word chips («Просмотрено»/«Не просмотрено») and badges SHALL NOT
appear on cards.

#### Scenario: Watched glyph

- **WHEN** a card with watched=true renders
- **THEN** it carries one ✓ glyph as a corner mark over the art at meta scale and no watched word or badge

#### Scenario: Unwatched is absence

- **WHEN** a card with watched=false renders
- **THEN** it carries no watched glyph, word, or badge

### Requirement: Home surface mirrors the web UI

The browse screen's top SHALL mirror the SPA Home order: Continue row (last
played with progress bars; OK resumes) and Next-up row (next episodes; OK
plays) under the collections rail idiom, both rendered from the ONE served
/home response — rows carrying `current` are resume cards, rows without it
are anchor cards whose served `next` offer is the play affordance — verbatim
in the served order. Rows navigate by the cursor-in-state
dpad law; an arrow the law cannot satisfy is left unconsumed; Back restores
the exact prior cursor; LEFT at row-0 x=0 opens the collections rail.

#### Scenario: Continue row resume

- **WHEN** the home surface renders with progress history and OK presses a focused continue card
- **THEN** playback starts from the stored position

#### Scenario: Empty history renders nothing

- **WHEN** there is no progress history
- **THEN** no continue row renders (field-driven absence, never a placeholder row)

#### Scenario: Rail opens from home

- **WHEN** LEFT is pressed at row-0 x=0 on the home surface
- **THEN** the collections rail opens with focus on the current collection

#### Scenario: Next-up anchor card plays

- **WHEN** a served home row carries no `current` and a `next` offer
- **THEN** it renders in the Next-up row and OK starts playback of the offered next episode (the served label renders verbatim)

#### Scenario: Failed home fetch renders the error line

- **WHEN** the /home fetch fails and no rows render
- **THEN** the surface shows the served error message as a visible one-liner; with rows present the line never renders

### Requirement: Series detail mirrors the web UI

The series page SHALL render a hero zone (poster, title, facts line and
Synopsis block from the served metadata.about projection — the
server-resolved convention block, absent → absent) above the episode list;
episode rows SHALL carry the composed name,
a field-driven meta line, the card law's tri-state (an in-progress bar when
a stored position exists and the row is not watched; watched → the ✓ glyph
and NO bar), and the state
glyph per the card law. OK on an episode SHALL start playback. The hero
SHALL take no dpad focus — the episode list holds the initial focus.

#### Scenario: Synopsis is field-driven

- **WHEN** a series carries no description-bearing namespace
- **THEN** no Synopsis block renders — never a placeholder

#### Scenario: Episode OK plays

- **WHEN** OK presses a focused episode row
- **THEN** the player overlay starts for that episode (the 2026-11-12 dead-OK defect stays fixed)

#### Scenario: Progress bar on the row

- **WHEN** an episode has stored playback progress and is not watched
- **THEN** its row renders a progress bar; OK resumes from the stored position

#### Scenario: Hero never takes focus

- **WHEN** the series page opens
- **THEN** the episode list holds the initial focus and the hero zone takes no dpad focus

#### Scenario: Overflowing titles clamp with an ellipsis

- **WHEN** an episode-row title exceeds its one-line slot or a card title exceeds two lines
- **THEN** the text clamps with an ellipsis — never a mid-glyph clip

### Requirement: Module-keyed collection bodies

The collection body SHALL be keyed by the served module_id exactly as the SPA
keys it: serial → series poster grid; tv → episode file cards in the same
grid; image → photo grid with a dpad-walkable folder-chips row whose counts
come from the same stream that pages the grid; an unknown module renders its
own module label and an honest empty state — never a hardcoded type list and
never an error. The serial grid additionally carries the SPA's facet lane —
the served /libraries/{id}/facets rendered as chips in every body state,
whose selection conjuncts across facet keys and drives the /series query.

#### Scenario: Unknown module is honest

- **WHEN** a collection arrives with a module_id the client has never seen
- **THEN** the body renders the module's own id as label and an empty state

#### Scenario: Photo folder chips

- **WHEN** an image collection with subfolders renders
- **THEN** a chips row lists the folders; OK on a chip filters the grid; counts match the paged stream

#### Scenario: Serial facet lane renders in every body state

- **WHEN** a serial collection body renders in any state — loading, error, empty, or grid
- **THEN** the facet lane renders above the body content (the control driving the /series query), never only on a populated grid

#### Scenario: Facet toggle conjuncts across keys and clears

- **WHEN** OK presses a facet value chip
- **THEN** the grid refetches with that value ANDed across facet keys (one value per key); pressing the active value again clears that key's filter

#### Scenario: Photo viewer rulings and status line

- **WHEN** the photo viewer is open over a loaded photo row
- **THEN** OK closes it, Up/Down stay consumed with no act, and a «<i>/<n>» status line renders plus the served capture date when the document carries one (absent → absent)

### Requirement: Watch-flow affordances on TV

The player overlay's controls layer SHALL mirror the SPA's shipped
affordances: OK-revealed info blocks (episode title/description, cast, series
About — the served metadata projection only, absent → absent), a skip chip
(intro or credits) while the playhead is inside a served classified range,
and an auto-next card on an episode's ended edge whose countdown seconds come
from the served watch-defaults — no usable served value means no countdown
and never autoplay. No TV-specific wire shapes. The passive overlays
(preparing/polling/dead) exit on Back — never a trap — and a served
voiceovers list is cyclable by the audio-track key within the plan's pick
space.

#### Scenario: Skip chip appears in range

- **WHEN** playback is inside a parsed skip section and controls are revealed
- **THEN** a «Пропустить вступление» chip renders and seeks past the range on OK

#### Scenario: Info blocks are field-driven

- **WHEN** the controls layer renders for an episode with no description field
- **THEN** the description block is absent, the other blocks render from their fields

#### Scenario: No served countdown never autoplays

- **WHEN** the auto-next card opens and the watch-defaults shape has not answered or is malformed
- **THEN** the card renders without a countdown and never autoplays — the manual play path stays available

#### Scenario: Back exits the preparing or dead overlay

- **WHEN** the player overlay shows the preparing/polling banner or the dead banner and Back is pressed
- **THEN** the overlay exits to the prior surface — the passive states are never a trap

#### Scenario: Voiceover cycle within the served plan

- **WHEN** the playback plan serves voiceovers and the audio-track key is pressed on the Active overlay
- **THEN** the pick advances and wraps within the plan's pick space (the k+1 track mapping rides); a plan with no voiceover picks never acts

#### Scenario: Cast renders one row per served entry

- **WHEN** the controls layer renders the cast block
- **THEN** each served cast entry renders as its own row (name + role; a 24dp portrait tile only when the entry serves a portrait URL) — the joined single line never renders
