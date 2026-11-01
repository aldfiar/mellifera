# recommendation-sorting Delta

## ADDED Requirements

### Requirement: Recommendation score model

The server SHALL derive, at read time and never persisted, one recommendation
score per browsable video entity (series, episode item, film/tv item):
`1000·inProgress + 500·newEpisode + min(Σ tag weights, 400)`. `inProgress`
SHALL hold when a positive progress row exists on the entity (the item
itself, or any episode of a series) and the entity has NOT completed;
`newEpisode` SHALL hold for a STARTED series (any episode carries a progress
or watched row) that has at least one episode item with no progress and no
watched row, discovered (item `created_at`) within a 30-day window. A
completed entity SHALL receive no inProgress bonus — watched-to-the-end
items do not float ("if full or till ending — skip"). Tag weights SHALL be
`1 + interest(tag)` with interest starting at zero, so every parsed tag
carries an equal base score; the tag sum's cap (400) SHALL sit strictly
below the new-episode bonus (500), which SHALL sit strictly below the
in-progress bonus (1000) — context always dominates affinity, and bonuses
stack. Equal scores SHALL tie-break by the served `display_name` ascending,
then by id — the alphabetical floor is preserved as the deterministic
fallback.

#### Scenario: Context tiers dominate tag affinity

- **WHEN** one entity is partially watched, one started series has a fresh
  unwatched episode, and one unstarted entity carries heavily-weighted tags
- **THEN** the served order is partially-watched first, new-episode second,
  and the tagged unstarted entity below both, regardless of tag weights

#### Scenario: Completed items skip the resume bonus

- **WHEN** an item's progress position has reached ≥ 90% of its stored
  duration (or a watched row exists) and another item sits mid-media
- **THEN** the completed item scores no inProgress bonus while the mid-media
  one does, and the completed item still ranks by its tag component

#### Scenario: Zero interest degrades to alphabetical

- **WHEN** no watched rows exist and all tag weights sit at base
- **THEN** every entity's tag component is the plain count of its tags and
  the surface order equals today's alphabetical/path order modulo those
  equal-tag-count differences

### Requirement: Tag source is the convention genres field

An entity's tags SHALL be the `genres` array of the first effectively-enabled
source namespace carrying the synopsis group on the entity's winning
document — the series document for episodes and series, the item document
for films and tv items. Tag keys SHALL normalize (trim + Unicode casefold)
before any weight read or write, and an entity whose winning namespace
carries no genres SHALL score with an empty tag set (honest absence, never
fabricated tags). No new plugin field, namespace, or capability SHALL be
introduced.

#### Scenario: Episode tags come from the series document

- **WHEN** a completed episode's series document carries shikimori genres
  and the episode document carries none
- **THEN** the learning loop increments exactly the series document's genre
  weights

#### Scenario: Absent genres score honestly

- **WHEN** an item's document carries no genres in any effectively-enabled
  namespace
- **THEN** its score is the context bonuses alone and no tag weight is
  touched by its watches

### Requirement: Completion ledger and detection

The store SHALL persist a `watched_items` ledger — `item_id` PRIMARY KEY,
`library_id`, nullable `series_relative_path`, `completed_at`, nullable
`applied_at` — inserted exactly once per item by a progress-write detector:
a write whose position reaches ≥ 90% of the item's stored
`ffprobe.format.duration` inserts one idempotent row (repeat writes and
rewatches are PK no-ops). An item with no stored duration SHALL never
auto-complete. Detection SHALL ride the existing `Deps.OnProgress` seam
fanned out beside the thumb re-grab, run after the stored upsert, and every
failure SHALL be log-and-skip — a progress write is never load-bearing. The
insertion SHALL poke the recs janitor task's wake channel.

#### Scenario: Crossing 90% records the completion once

- **WHEN** progress writes advance an item past 90% of its duration twice,
  then a rewatch crosses it again
- **THEN** exactly one watched row exists for the item and the later writes
  are no-ops

#### Scenario: A detection failure never surfaces in the PUT

- **WHEN** the watch detector fails (store error, malformed probe blob)
- **THEN** the triggering PUT still returns its normal 200 and the failure
  is logged and skipped

### Requirement: Tag-weight learning as a janitor task

A janitor task `recs` (the named registry beside `streams` and `art`) SHALL
learn tag weights from completed watches in the background: boot-run, a 60 s
interval tick, and an immediate wake on every completion insert. Each pass
SHALL select watched rows with `applied_at IS NULL`, resolve each entity's
tags, increment each tag's weight by 1 in one transaction, and stamp
`applied_at` — the derived-queue posture (no jobs table: unstamped rows ARE
the pending work). Weights SHALL persist in a `tag_weights` table (tag
PRIMARY KEY normalized per the tag rule, weight, updated_at) with no user or
profile column (single implicit profile; the roles change owns that
migration). The pass SHALL be idempotent and restart-safe.

#### Scenario: A completed watch raises its tags

- **WHEN** an action-and-thriller episode completes and the film tag weights
  are base
- **THEN** the next recs pass raises action and thriller weights by 1 each,
  stamps the row applied, and a restarted server resumes from unstamped rows
  without re-applying stamped ones

#### Scenario: Intersecting tags accumulate across entities

- **WHEN** the operator completes several episodes of an action/thriller
  series and then browses a film carrying thriller, comedy, and action tags
- **THEN** the film's tag component outranks an equal-count unstarted
  entity whose tags carry no accumulated interest

### Requirement: Served ordering on collections and continue surfaces

`GET /api/v1/series?library=N` and the library item listing SHALL default to
recommendation order — score descending, ties by served display name then
id — with `sort=path` restoring today's path order. `GET /api/v1/progress`
SHALL serve an additive `rec_score` per row and order score descending then
`updated_at` descending, with `sort=recent` restoring pure recency. Series,
item, and progress DTOs SHALL carry `rec_score,omitempty` so the ordering is
observable. The per-series episode table SHALL keep its narrative order, and
image libraries SHALL keep path order — recommendation ordering applies to
collection grids, the continue rail, and next up only.

#### Scenario: A started serial with a new episode tops the grid

- **WHEN** a serial library holds an unstarted back-catalog and one series
  the operator watches gained an episode this week
- **THEN** the served series order places the started series above every
  unstarted one and `sort=path` restores the alphabetical order

#### Scenario: The continue rail serves scored order

- **WHEN** the continue rail fetches progress rows for a mid-episode series
  with weighted tags and a barely-started film with none
- **THEN** the served order places the series' row first by rec_score and
  the tie case falls back to recency
