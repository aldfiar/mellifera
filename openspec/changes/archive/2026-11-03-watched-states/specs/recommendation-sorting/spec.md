# Spec Delta — recommendation-sorting

## MODIFIED Requirements

### Requirement: Completion ledger and detection

The store SHALL persist a `watched_items` ledger — `item_id` PRIMARY KEY,
`library_id`, nullable `series_relative_path`, `completed_at`, nullable
`applied_at` — inserted exactly once per item by a progress-write detector:
a write whose position reaches ≥ 90% of the item's stored
`ffprobe.format.duration` inserts one idempotent row (repeat writes and
rewatches are PK no-ops), and a write carrying `completed: true` inserts the
row regardless of the position floor — the explicit client intent leg (the
video ended; the credits tail was skipped). An item with no stored duration
SHALL never auto-complete through the floor, but a `completed: true` write
completes it (intent needs no duration). Detection SHALL ride the existing
`Deps.OnProgress` seam fanned out beside the thumb re-grab, run after the
stored upsert, and every failure SHALL be log-and-skip — a progress write is
never load-bearing. The insertion SHALL poke the recs janitor task's wake
channel. Because the detector fires only on new writes, progress stock that
predates it SHALL be reconciled into the ledger exactly once per boot (the
recs backfill): every positive progress row not yet ledgered whose position
meets the same completion predicate inserts its idempotent row — stamped
with the progress write's own `updated_at`, never restamping an existing
ledger row — and pokes the wake, so the stock learns through the same
janitor pass a live completion takes. The backfill SHALL run boot-only
before the janitor's boot pass (never per tick) and SHALL stay
log-and-skip.

#### Scenario: Crossing 90% records the completion once

- **WHEN** progress writes advance an item past 90% of its duration twice,
  then a rewatch crosses it again
- **THEN** exactly one watched row exists for the item and the later writes
  are no-ops

#### Scenario: An explicit completed write finishes the episode

- **WHEN** the player fires the progress write with `completed: true` at the
  ended edge or on skipping the credits tail, with the saved position still
  below the floor
- **THEN** the item is ledgered exactly once (the same idempotent insert),
  the janitor wake fires, and the element leaves the recommendation surfaces

#### Scenario: Pre-detector stock reconciles at boot

- **WHEN** the server boots holding a positive progress row at ≥ 90% of its
  stored duration with no watched_items row (a watch that finished before
  the detector deployed)
- **THEN** the boot's backfill ledger row carries the progress write's own
  stamp, a rerun boot is a no-op, and the item stops scoring the InProgress
  resume bonus

#### Scenario: A detection failure never surfaces in the PUT

- **WHEN** the watch detector fails (store error, malformed probe blob)
- **THEN** the triggering PUT still returns its normal 200 and the failure
  is logged and skipped

### Requirement: Served ordering on collections and continue surfaces

`GET /api/v1/series?library=N` and the library item listing SHALL default to
recommendation order — score descending, ties by served display name then
id — with `sort=path` restoring today's path order; every watched entry
SHALL sort after every unwatched entry (each partition keeps the score-desc
→ name → id order), so a completed element never outranks an unstarted one
through tag affinity. `GET /api/v1/progress` SHALL withdraw rows whose item
is ledgered watched by default and restore them under
`?include=watched` (unknown values are a 400, the strict-parse precedent);
served rows SHALL carry an additive `rec_score` per row and order score
descending then `updated_at` descending, with `sort=recent` restoring pure
recency. Series, item, and progress DTOs SHALL carry `rec_score,omitempty`
so the ordering is observable, and item/series/progress DTOs SHALL carry
`watched,omitempty` (true-only) derived read-time from the ledger — the
served element state the UI renders, never a client derivation. The
per-series episode table SHALL keep its narrative order, and image
libraries SHALL keep path order regardless of any computed score — a
library served by a photo-scanner module SHALL always serve path order,
whatever the score model computes (the carve-out holds by mechanism, not by
tie-break accident), and recommendation ordering applies to collection
grids, the continue rail, and next up only.

#### Scenario: A started serial with a new episode tops the grid

- **WHEN** a serial library holds an unstarted back-catalog and one series
  the operator watches gained an episode this week
- **THEN** the served series order places the started series above every
  unstarted one and `sort=path` restores the alphabetical order

#### Scenario: The continue rail withdraws watched rows

- **WHEN** an item ledgered watched still holds its positive progress row
  and the continue rail fetches the default listing
- **THEN** the row is absent from the served rail, `?include=watched`
  restores it (carrying `watched: true`), and an in-progress row never
  moves

#### Scenario: Watched entries sink below unstarted ones on the grid

- **WHEN** a watched episode carries heavy accumulated tag affinity and an
  unstarted sibling carries none
- **THEN** the served grid order places the unstarted entry above the
  watched one, and the watched entries keep their scored order among
  themselves

#### Scenario: The continue rail serves scored order

- **WHEN** the continue rail fetches progress rows for a mid-episode series
  with weighted tags and a barely-started film with none
- **THEN** the served order places the series' row first by rec_score and
  the tie case falls back to recency

#### Scenario: Photo libraries keep path order regardless of score

- **WHEN** a photo-scanner-module library is listed under the scored
  default, whatever scores its items carry
- **THEN** the served order is path order — no computed score, tie-break,
  or default sort ever reorders a photo library's grid
