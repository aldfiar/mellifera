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
log-and-skip. The item state write endpoint's `unwatched` state (the
playback-progress capability) SHALL delete the ledger row and zero the
item's playback position in ONE store transaction; because the backfill
scans positive positions only, the unwatched state can never re-ledger
across a boot, and a later genuine completion (detector floor or explicit
intent) inserts a fresh row with its own lifecycle. Unlearning SHALL NOT
roll back tag weights the janitor already applied — a completion is consumed
exactly once; a still-unapplied (never-stamped) row that is deleted simply
never learns.

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

#### Scenario: An unwatched item never re-ledgers across a boot

- **WHEN** an item is unwatched (its ledger row deleted and its position
  zeroed in one transaction) and the server later boots and runs the recs
  backfill over the progress stock
- **THEN** the backfill inserts no row for that item — the zero position
  never meets the positive-only scan — and the item's tags carry no
  re-learning from the deleted row

#### Scenario: A completion after unwatch learns fresh, exactly once

- **WHEN** the operator unwatched an item whose tags were already learned,
  then genuinely completes it again (re-mark watched or a rewatch past the
  floor)
- **THEN** a fresh unstamped ledger row is inserted (the previous row's
  applied weights stay untouched), the next janitor pass raises the tags
  exactly once from the new row, and repeat writes on the new row are PK
  no-ops
