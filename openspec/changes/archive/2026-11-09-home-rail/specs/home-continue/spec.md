# Spec Delta

## MODIFIED Requirements

### Requirement: Home continue endpoint

The API SHALL expose `GET /api/v1/home` (browse group, admin+client) returning
`{"continue":[ContinueRow…]}` — at most 50 rows, one per served continue
entity (a card: a touched series or a per-item film entity), bounded
server-side from the progress rows at entity grain. Each ContinueRow SHALL
carry `series_id`, `series_display_name`, `library_id`, `library_name`,
optional `artwork`, optional `current` (`item_id`, `display_name`, optional
`season`/`episode`/`episode_title`, `position_seconds`, optional
`duration_seconds`) — present exactly when the entity's resume pick resolves,
which is the series' highest-started IN-PROGRESS episode's resume facts (an
anchor card omits `current` on the wire entirely) — and optional `next`
(`item_id`, `label`). Rows SHALL be ordered by the recommendation score
descending with `updated_at` descending as the tiebreak (the
recommendation-sorting contract, inherited). `duration_seconds` SHALL be
omitted when the item's document stores no duration — the honest absence a
client renders as a bar-less row. Names and artwork SHALL be composed at
request time over the bounded card set (never from a cache of display bytes).
Rows SHALL be the calling viewer's ledger consumption — viewer-scoped AND
visibility-conjunct: progress rows for libraries outside the caller's visible
set SHALL NOT leak existence through the rail (the recommendation-sorting
visibility mandate, carried onto this route), and names SHALL mute through
the caller's `ChainMutes` exactly as every other browse-group route mutes
them. The index behind the route stays shared/full (`access.System()` at
rebuild) — the scoping is serve-side only.

#### Scenario: One request replaces the fan-out

- **WHEN** the home surface loads with several started series
- **THEN** exactly one `GET /api/v1/home` request is made and its response
  alone suffices to render every continue row — no per-series episode fetches

#### Scenario: Ordering follows the inherited contract

- **WHEN** one row's series is partially watched with weighted tags and
  another was started more recently but scores lower
- **THEN** the higher-scored row is served first, ties falling to the more
  recently updated row

#### Scenario: Honest duration

- **WHEN** a continue row's current item carries no stored duration fact
- **THEN** the row omits `duration_seconds` rather than guessing a value

#### Scenario: Invisible libraries never leak through the rail

- **WHEN** a viewer's visible set excludes a library that holds started
  progress rows, and that viewer calls `GET /api/v1/home`
- **THEN** the served rail carries no rows from it — no ids, no names, no
  counts — while the same request from a viewer holding the grant serves
  them

### Requirement: Next-episode pick contract

A row's `next` SHALL be present only when the series has a later episode: the
lowest `(season, episode)` pair strictly after the series' started-max — the
highest-started pair across ALL of the series' touched progress rows, ledgered
rows included, so a watched episode never becomes the offered next — the same
tuple rule the watch page's client derivation applies (parity pinned by
test). A film or tv item row SHALL never carry `next` (it is an episode
concept). When no later episode exists — none at all, or the remaining items
carry no parseable episode facts — `next` SHALL be omitted.

#### Scenario: The pick skips what the viewer moved past

- **WHEN** a viewer's highest-started episode of a series is S02E03 and the
  series holds S02E04 and S02E05 unstarted
- **THEN** the row's `next` offers S02E04 — never an episode at or before the
  highest-started one, and never the ledgered episode the viewer already
  finished when a strictly-later one exists

#### Scenario: Films carry no next

- **WHEN** a continue row's current item is a tv-module film
- **THEN** the row carries no `next` entry

#### Scenario: Nothing later means no next

- **WHEN** a series' highest-started episode is also its last
- **THEN** the row omits `next` instead of offering a rewatch — and when
  EVERY of the series' touched progress rows is ledgered, the entity drops
  from the rail entirely (the caught-up law of the per-series grain), while
  a series with an in-progress frontier row keeps that row with `next`
  omitted

## ADDED Requirements

### Requirement: Per-series entity grain

The rail SHALL serve at ENTITY grain. A serial series touched by one or more
of the caller's positive-progress rows SHALL surface at most ONE card,
present exactly when the series carries an in-progress episode (positive
progress, not ledgered-watched) or a next episode exists strictly after its
started-max; the resume card's body SHALL be the series' highest-started
IN-PROGRESS episode's resume facts (a ledgered row NEVER renders as the
resume body). A series whose every touched row is ledgered AND that has no
later episode SHALL serve no card. A ledgered film or tv item SHALL serve no
card — its position is spent and it has no next concept. Progress rows whose
documents carry no parseable episode facts SHALL stay per-item film entities
(series fields honestly empty, never a fabricated owner). A series whose row
is missing or tombstoned SHALL floor to the per-item honest entity (series
fields empty, no next) — resolution failure never fabricates a series card.
Raw progress facts SHALL reach the wire only as the resume card's body — no
watched flag, ever.

#### Scenario: One card per touched series

- **WHEN** one series holds several touched progress rows — some in-progress,
  some ledgered-watched
- **THEN** the rail serves exactly ONE card for the series, its body the
  highest-started in-progress episode's resume facts, and the watched rows
  appear on no card as resume points

#### Scenario: Anchor card carries no resume body

- **WHEN** a series' every touched progress row is ledgered-watched and a
  later episode exists
- **THEN** the card serves with `current` absent on the wire — series name,
  artwork, and the next offer only; no position, no percent, no
  Play-into-current body

#### Scenario: Caught-up without next serves nothing

- **WHEN** a series' every touched progress row is ledgered-watched and the
  series holds no later episode
- **THEN** the rail serves no card for the series — never an empty anchor,
  never a rewatch offer

#### Scenario: Skip-ahead resume stays honest

- **WHEN** an episode holds positive progress and a LATER sibling episode is
  ledgered-watched
- **THEN** the card serves the resume facts of the in-progress episode and
  offers the next pick strictly after the series' started-max (which spans
  the ledgered sibling)

#### Scenario: Resume cards outrank anchor cards

- **WHEN** a resume card and an anchor card score in the same space
- **THEN** the resume card serves above the anchor card — the resume tier's
  1000 floor exceeds the anchor's achievable range, with the entity-grain
  score/recency/id ordering pinning the served order
