# recommendation-sorting Specification

## Purpose
Rank what the operator likely wants next: the server derives, at read time and
never persists, one recommendation score per entity — a strong in-progress
bonus, a new-episode bonus for fresh entries of a started series, and a
capped tag-interest term learned from completed watches — and serves listings
ordered by it (rec_score on the wire, score-desc default with explicit
opt-outs), so grids, the progress surface, and the SPA's continue/next-up
rows all present the same best-first order without a client-side model.

## Requirements

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

The store SHALL persist a `watched_items` ledger — PRIMARY KEY
`(user_id, item_id)` with `user_id INTEGER NOT NULL DEFAULT 0` (the legacy
slot), `library_id`, nullable `series_relative_path`, `completed_at`,
nullable `applied_at` — inserted exactly once per (viewer, item) by a
progress-write detector: a write whose position reaches ≥ 90% of the item's
stored `ffprobe.format.duration` inserts one idempotent row STAMPED WITH THE
WRITING VIEWER's user slot (repeat writes and rewatches are PK no-ops), and
a write carrying `completed: true` inserts the row regardless of the
position floor — the explicit client intent leg (the video ended; the
credits tail was skipped). The table SHALL be rebuilt to that key by the
same guarded table-rebuild migration as `playback_progress` (legacy rows
into the `user_id=0` slot, zero row loss, idempotent), with secondary
indexes `(completed_at)` and `(applied_at)` so ledger queries
(`ORDER BY completed_at`, `WHERE applied_at IS NULL`) never become table
scans. An item with no stored duration SHALL never auto-complete through
the floor, but a `completed: true` write completes it (intent needs no
duration). Detection SHALL ride the existing `Deps.OnProgress` seam fanned
out beside the thumb re-grab, run after the stored upsert, and every
failure SHALL be log-and-skip — a progress write is never load-bearing. The
insertion SHALL poke the recs janitor task's wake channel. Because the
detector fires only on new writes, progress stock that predates it SHALL be
reconciled into the ledger exactly once per boot (the recs backfill): every
positive progress row not yet ledgered whose position meets the same
completion predicate inserts its idempotent row — stamped with the progress
write's own `updated_at`, never restamping an existing ledger row — and
pokes the wake, so the stock learns through the same janitor pass a live
completion takes. The backfill SHALL run boot-only before the janitor's
boot pass (never per tick), SHALL stay log-and-skip, and SHALL read as
System (all slots — backfill reconciles every viewer's stock). The item
state write endpoint's `unwatched` state (the playback-progress capability)
SHALL delete the CALLING VIEWER's ledger row and zero the position in the
viewer's OWN `(user_id, item_id)` progress slot in ONE store transaction —
another viewer's slot is never touched; because the backfill scans positive
positions only, the unwatched state can never re-ledger across a boot, and
a later genuine completion (detector floor or explicit intent) inserts a
fresh row with its own lifecycle. Unlearning SHALL NOT roll back tag
weights the janitor already applied — a completion is consumed exactly
once; a still-unapplied (never-stamped) row that is deleted simply never
learns.

#### Scenario: Crossing 90% records the completion once

- **WHEN** progress writes advance an item past 90% of its duration twice,
  then a rewatch crosses it again
- **THEN** exactly one watched row exists for that viewer and item and the later writes
  are no-ops

#### Scenario: An explicit completed write finishes the episode

- **WHEN** the player fires the progress write with `completed: true` at the
  ended edge or on skipping the credits tail, with the saved position still
  below the floor
- **THEN** the item is ledgered exactly once for the writing viewer (the same idempotent insert),
  the janitor wake fires, and the element leaves that viewer's recommendation surfaces

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

#### Scenario: Two viewers ledger the same item independently

- **WHEN** user A and user B both complete the same item
- **THEN** the ledger holds exactly two rows — one per (user_id, item_id) — and the migrated legacy rows still read from the `user_id=0` slot

#### Scenario: An unwatched item never re-ledgers across a boot

- **WHEN** a viewer unwatched an item (their ledger row deleted and their
  slot's position zeroed in one transaction) and the server later boots and
  runs the recs backfill over the progress stock
- **THEN** the backfill inserts no row for that item — the zero position
  never meets the positive-only scan — and the item's tags carry no
  re-learning from the deleted row

#### Scenario: A completion after unwatch learns fresh, exactly once

- **WHEN** the viewer unwatched an item whose tags were already learned,
  then genuinely completes it again (re-mark watched or a rewatch past the
  floor)
- **THEN** a fresh unstamped ledger row is inserted in that viewer's slot
  (the previous row's applied weights stay untouched), the next janitor pass
  raises the tags exactly once from the new row, and repeat writes on the
  new row are PK no-ops

### Requirement: Tag-weight learning as a janitor task

A janitor task `recs` (the named registry beside `streams` and `art`) SHALL
learn tag weights from completed watches in the background: boot-run, a 60 s
interval tick, and an immediate wake on every completion insert. Each pass
SHALL select watched rows with `applied_at IS NULL`, resolve each entity's
tags, increment each tag's weight by 1 in one transaction, and stamp
`applied_at` — the derived-queue posture (no jobs table: unstamped rows ARE
the pending work). Weights SHALL persist in a `tag_weights` table (tag
PRIMARY KEY normalized per the tag rule, weight, updated_at) with no user or
profile column — the l6-accounts rebuild put the per-user slots on
`watched_items`; `tag_weights` stays profile-free because learning is
global. The pass SHALL be idempotent and restart-safe. The learning
passes SHALL read ALL viewers' rows — per-user ledger keying SHALL NOT fork
tag learning or the shared score model (GLOBAL semantics, documented so
nobody "fixes" it); the janitor's ledger reads stay System.

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

#### Scenario: Learning stays global across viewers

- **WHEN** two different users complete episodes carrying the same tag and the janitor pass runs
- **THEN** both users' rows feed ONE weight increment set (the tag weight rises once per applied row, from every viewer's ledger), and no per-user score fork exists — every viewer shares the single score model

### Requirement: Served ordering on collections and continue surfaces

`GET /api/v1/series?library=N` and the library item listing SHALL default to
recommendation order — score descending, ties by served display name then
id — with `sort=path` restoring today's path order; every watched entry
SHALL sort after every unwatched entry (each partition keeps the score-desc
→ name → id order), so a completed element never outranks an unstarted one
through tag affinity. `GET /api/v1/progress` SHALL withdraw rows whose item
is ledgered watched BY THE CALLING VIEWER by default and restore them under
`?include=watched` (unknown values are a 400, the strict-parse precedent);
served rows SHALL carry an additive `rec_score` per row and order score
descending then `updated_at` descending, with `sort=recent` restoring pure
recency. Series, item, and progress DTOs SHALL carry `rec_score,omitempty`
so the ordering is observable, and item/series/progress DTOs SHALL carry
`watched,omitempty` (true-only) derived read-time from the CALLER's ledger —
the served element state the UI renders, never a client derivation. All
ledger consumption on serving paths SHALL be viewer-scoped AND
visibility-conjunct — rows for libraries outside the caller's visible set
SHALL NOT leak existence through badges, watched flags, or the continue
rail. The per-series episode table SHALL keep its narrative order, and image
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

#### Scenario: Revoked grants never leak through the rail

- **WHEN** a user's ledger holds rows in a library their groups no longer carry and they fetch the continue rail
- **THEN** those rows are absent — visibility-conjunct reads keep the revoked library's rows out of the served page, the watched stamps, and the next-up derivation alike

### Requirement: Home continue rail serves scored, server-composed rows

The home continue rail SHALL be served by `GET /api/v1/home` — rows composed
server-side in one round-trip and ordered recommendation score descending
then `updated_at` descending — the same comparator the `/progress` listing
applies, computed at ENTITY grain: a touched series scores ONCE through the
series scorer (its grouped episode facts unioned with the series' touched
progress rows), film and tv items score through the item scorer, and one
card serves per entity (the per-series grain the home-continue spec owns).
This supersedes the home surface's client-side derivation over the
`/progress` listing (the watch page's `nextEpisodeAfter` derivation is
untouched). The `/progress` route itself keeps its contract unchanged
(additive `rec_score`, scored order, `sort=recent` opt-out); this requirement
adds only the home rail's serving shape.

#### Scenario: The home rail serves composed rows in scored order

- **WHEN** the home surface loads
- **THEN** one `GET /api/v1/home` round-trip returns the continue rows
  composed server-side in score-descending order with the recency tiebreak,
  and the SPA renders them with no client-side re-sorting or derivation

#### Scenario: The progress contract is untouched

- **WHEN** a client fetches `GET /api/v1/progress` after this change
- **THEN** the response still carries `rec_score` per row in score-descending
  order with the recency tiebreak, and `sort=recent` still restores pure
  recency — the home rail's existence changed no `/progress` behavior
