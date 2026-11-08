# Spec Delta

## Purpose

Serve the home continue rail as one bounded server round-trip: per-series rows
with honest progress facts and the next-episode pick the client previously had
to derive itself.

## ADDED Requirements

### Requirement: Home continue endpoint

The API SHALL expose `GET /api/v1/home` (browse group, admin+client) returning
`{"continue":[ContinueRow…]}` — at most 50 rows, bounded server-side from the
progress rows. Each ContinueRow SHALL carry `series_id`,
`series_display_name`, `library_id`, `library_name`, optional `artwork`,
`current` (`item_id`, `display_name`, optional `season`/`episode`/
`episode_title`, `position_seconds`, optional `duration_seconds`), and
optional `next` (`item_id`, `label`). Rows SHALL be ordered by the
recommendation score descending with `updated_at` descending as the tiebreak
(the recommendation-sorting contract, inherited). `duration_seconds` SHALL be
omitted when the item's document stores no duration — the honest absence a
client renders as a bar-less row. Names and artwork SHALL be composed at
request time over the bounded row set (never from a cache of display bytes).
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
lowest `(season, episode)` pair strictly after the highest-started one — the
same tuple rule the watch page's client derivation applies (parity pinned by
test). A film or tv item row SHALL never carry `next` (it is an episode
concept). When no later episode exists — none at all, or the remaining items
carry no parseable episode facts — `next` SHALL be omitted.

#### Scenario: The pick skips what the viewer moved past

- **WHEN** a viewer's highest-started episode of a series is S02E03 and the
  series holds S02E04 and S02E05 unstarted
- **THEN** the row's `next` offers S02E04 — never an episode at or before the
  highest-started one

#### Scenario: Films carry no next

- **WHEN** a continue row's current item is a tv-module film
- **THEN** the row carries no `next` entry

#### Scenario: Nothing later means no next

- **WHEN** a series' highest-started episode is also its last
- **THEN** the row omits `next` instead of offering a rewatch
