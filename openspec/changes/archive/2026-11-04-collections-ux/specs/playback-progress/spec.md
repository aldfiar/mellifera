# Spec Delta — playback-progress

## ADDED Requirements

### Requirement: Item state write endpoint

The API SHALL expose `PUT /api/v1/items/{id}/state` (the browse role group,
registered beside the progress write) accepting `{"state": "watched" |
"unwatched"}` — a playback-STATE endpoint named for state so the closed set
can grow. The wire value SHALL be a JSON string validated against the closed
set; an unknown string SHALL be 400 `bad_request` (the strict parse posture
the sort/include grammar serves). A `watched` write SHALL insert the
completion-ledger row exactly like the detector path — idempotent item_id
PRIMARY KEY, `completed_at` stamped by the write — and SHALL NOT touch the
item's playback position; the recs janitor consumes the row through its
normal pass, so learning is unchanged. An `unwatched` write SHALL delete the
ledger row AND reset the item's playback position to 0 in one store
transaction: reads and the boot backfill scan positive positions only, so a
zeroed row can never re-ledger across a boot, and the zero reset is the
rewatch story (the manual `position=duration` path retires). An
image-module (photo) item SHALL be 400 `bad_request` — photos carry no
watched concept; an unknown item SHALL be 404 `not_found`. PUT /progress's
own `completed` intent stays the player's completion signal, additive to
this route. The response SHALL echo the settled state plus the derived
facts the SPA needs to seed its caches: `{item_id, state, position_seconds,
completed_at?}` — `completed_at` present only when watched. The position
fact comes from the post-write progress read; an item holding NO progress
record (a never-started item marked watched directly) SHALL read
`position_seconds: 0` — the missing row maps to zero, never an error. An
`unwatched` write SHALL NOT roll back tag weights the janitor already
applied (a completion is consumed exactly once); a still-unapplied row
simply never learns.

#### Scenario: Marking watched ledgers without touching the resume point

- **WHEN** `{"state": "watched"}` is written for an item holding a mid-media
  playback position
- **THEN** the response is 200 echoing `watched` with the unchanged
  `position_seconds`, the item's progress record is unchanged, the ledger
  carries the row (the rail's `?include=watched` restores it), and a repeat
  write is a no-op on the ledger

#### Scenario: A watched write on a never-started item reads position zero

- **WHEN** `{"state": "watched"}` is written for an item that holds no
  playback-progress record at all
- **THEN** the response is 200 with `position_seconds: 0` — the missing row
  maps to zero, never an error — the ledger row is inserted, and the item
  stays absent from the default progress listing (its position is not
  positive)

#### Scenario: Unwatching clears the state and the resume point

- **WHEN** `{"state": "unwatched"}` is written for an item that is ledgered
  watched and holds a positive position
- **THEN** the ledger row is gone, the item's playback position reads 0 so
  the default progress listing omits it, and the response echoes
  `unwatched` with `position_seconds: 0` and no `completed_at`

#### Scenario: An unwatched item never re-ledgers across a boot

- **WHEN** the server holding an unwatched item (ledger row deleted,
  position zeroed) boots and the recs backfill rescans the progress stock
- **THEN** the backfill inserts no ledger row for that item — its position
  is 0 and the scan is positive-positions-only — and a later genuine
  completion (detector floor or the player's completed intent) inserts fresh

#### Scenario: Strict parse, photo gate, and unknown item

- **WHEN** the body carries an unknown state string, or the target item
  belongs to an image-module (photo) library, or the item id is unknown
- **THEN** the unknown state string and the photo item are 400
  `bad_request`, the unknown item is 404 `not_found`, and no ledger or
  progress row is touched in any of the three cases
