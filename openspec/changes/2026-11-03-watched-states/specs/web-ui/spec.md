# Spec Delta — web-ui

## ADDED Requirements

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
html.tv CSS layer), the element page heading beside the served display
name, and Continue rail rows.

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

### Requirement: Completion intent writes

The player SHALL set `completed: true` on the progress write at exactly two
edges: the video `ended` edge (beside the auto-next card) and the SkipChip
credits activation (skipping the credits tail jumps to the end and finishes
the episode). No other write path sets the flag.

#### Scenario: Ending the video completes the episode

- **WHEN** playback reaches the native ended edge
- **THEN** the fired progress write carries `completed: true` with the final
  position, whatever fraction the position holds

#### Scenario: Skipping the credits completes the episode

- **WHEN** the credits SkipChip is activated and the playhead jumps past the
  classified credits range to the end
- **THEN** the fired progress write carries `completed: true`
