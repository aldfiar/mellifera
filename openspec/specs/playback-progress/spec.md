# playback-progress Specification

## Purpose
Remember where playback left off: items carry one positive position record per
item id, refreshed on every save and served newest-first, so the home surface
can offer a Continue row that resumes exactly where the operator stopped, and
a Next up row can derive what to watch after it.

## Requirements

### Requirement: Progress store

The store SHALL persist playback positions in a `playback_progress` table
keyed `PRIMARY KEY (user_id, item_id)` — `user_id INTEGER NOT NULL DEFAULT
0` (the legacy slot the env-admin and legacy-device viewers read and write),
`position_seconds INTEGER NOT NULL CHECK (position_seconds >= 0)`,
`updated_at` — with an upsert that overwrites the position for the CALLING
VIEWER's slot and refreshes `updated_at`. The table SHALL be created by the
repo's FIRST table-rebuild migration (SQLite cannot ALTER a PK):
create-new → INSERT SELECT of every legacy row into the `user_id=0` slot →
drop → rename, ONE transaction, `PRAGMA table_info`-guarded, idempotent —
pre-accounts rows survive with zero row loss. A secondary index on
`(completed_at)`-class ledger columns keeps time-ordered queries off table
scans. Rows are keyed by the item's string id; rows whose item no longer
exists SHALL be ignored by reads (no join hit) and MAY be swept later — the
store SHALL NOT fail on orphans. No generated columns; the migration runner
SHALL carry the rebuild.

#### Scenario: Upsert persists and overwrites

- **WHEN** a position is written for an item twice with different values
- **THEN** the table holds exactly one row for that viewer's (user_id, item_id) slot with the latest position and a refreshed `updated_at`

#### Scenario: The rebuild preserves every legacy row

- **WHEN** a pre-accounts database holding N positive progress rows opens under the new schema, and the migration runs a second time (idempotence)
- **THEN** all N rows are readable in the `user_id=0` slot with their positions and stamps intact, and the second run is a no-op — zero row loss

<!-- wf:probe id=8696d785bab6006b -->
```bash
set -e
grep -q 'playback_progress' internal/store/open.go
go test ./internal/store -run TestProgressUpsert
```
<!-- /wf:probe -->

### Requirement: Progress write endpoint

The API SHALL expose `PUT /api/v1/progress/{item_id}` (browse role group —
admin+client) accepting `{"position_seconds": <integer >= 0>}`: a valid body
against a known, VISIBLE item upserts the row into the CALLER'S slot and
returns 200 `{item_id, position_seconds, updated_at}`; a negative or
non-integer value or a non-canonical body SHALL be 400 `bad_request`; an
unknown OR INVISIBLE item SHALL be 404 `not_found` (hidden ≡ unknown). The
endpoint SHALL NOT be retried automatically. After a successful
`PutProgress` — after the response-relevant store call, before the response
is written — the handler SHALL invoke a nil-safe
`Deps.OnProgress(ctx, itemID, position, completed)` closure (the LIVE
4-arg signature incl. the watched-states `completed` flag; an
anti-corruption seam mirroring `Deps.Scan`/`Status`/`Play`;
`internal/api` SHALL NOT import `internal/plugin` or `internal/enrich`);
a nil closure SHALL be a no-op and existing responses SHALL be unchanged.
The request context SHALL carry the caller's Viewer (resolved ONCE per
request; the viewer-carrier pair `WithViewer`/`FromContext` lives in the
access package, and the api layer is the only production stasher), so the
cmd-side closure legs — the completion detector included — receive the
writing viewer with NO signature change. The handler SHALL pass the caller's
Viewer — the write lands in the caller's own slot, never another user's.

#### Scenario: Write position for a known item

- **WHEN** `PUT /api/v1/progress/{item_id}` is called with `{"position_seconds": 3720}` for an existing item
- **THEN** the response is 200 with the stored position and stamp; a follow-up write of `-5` is 400 and leaves the stored value untouched

<!-- wf:probe id=25e5e695d3472138 -->
```bash
set -e
grep -q '/progress/' internal/api/router.go
go test ./internal/api -run TestProgressPut
```
<!-- /wf:probe -->

#### Scenario: The OnProgress seam fires after a saved write and is nil-safe

- **WHEN** a valid `PUT /api/v1/progress/{item_id}` lands with the `OnProgress` closure wired, and again with the closure left nil
- **THEN** the wired closure receives exactly the saved write's item id, position, and completed flag — after the store upsert, before the response — both requests return the same 200 body, and the nil closure is a silent no-op

<!-- wf:probe id=1608b918d4ca992a -->
```bash
set -e
go test ./internal/api -run TestProgressOnProgress
```
<!-- /wf:probe -->

#### Scenario: The write lands in the caller's own slot

- **WHEN** user A and user B PUT different positions for the same item, then each GETs the item's progress
- **THEN** each reads back exactly the position they wrote — one item, two independent slots, neither viewer observing the other's row

#### Scenario: An invisible item answers unknown

- **WHEN** a scoped user PUTs progress for an item inside a library their groups do not carry
- **THEN** the answer is 404 `not_found` — identical to the unknown-item answer, with no row written

### Requirement: Progress read endpoints

The API SHALL expose `GET /api/v1/progress` (browse role group) returning
`{items:[{item_id, position_seconds, updated_at, rec_score?}]}` — THE
CALLER'S rows with `position_seconds > 0` joined to existing, VISIBLE items,
ordered by `rec_score` descending then `updated_at` descending by default,
with `sort=recent` restoring pure `updated_at` descending order, limited by
`limit` (default 20, max 100, non-integer → 400) — and
`GET /api/v1/progress/{item_id}` returning the caller's single record or 404
`not_found` when absent (or the item is gone or invisible). Every read SHALL
be viewer-scoped (the caller's own slot) AND visibility-conjunct in SQL
BEFORE the limit window (no short pages). `rec_score` SHALL be the entity's
recommendation score (recommendation-sorting capability) carried additively,
omitted when scoring is not computable. Reads SHALL NOT require or imply
playback capability.

#### Scenario: Recent progress list

- **WHEN** three items hold positive positions and `GET /api/v1/progress` is called
- **THEN** the response lists exactly those items scored-first with recency
  as the tiebreak, `sort=recent` lists them newest-first, an item without a
  record is absent from the list and yields 404 on its single-item route,
  and `limit=abc` is 400

#### Scenario: Continue rows follow the viewer

- **WHEN** user A holds an in-progress row on item X and user B has never touched X, and B calls `GET /api/v1/progress`
- **THEN** B's listing omits X entirely — A's position never surfaces in B's Continue rows, and B's own in-progress items still list

#### Scenario: Visibility filters before the limit window

- **WHEN** a scoped user holds many progress rows, several inside libraries their groups do not carry, and requests `GET /api/v1/progress?limit=5`
- **THEN** the served page holds 5 VISIBLE rows — the invisible rows are filtered in SQL before the limit is applied, never as a post-page shave

### Requirement: Stop-frame re-grab on progress writes

The composition root SHALL wire `Deps.OnProgress` to a debounced re-grab
executor that refreshes an item's frame-grabber thumbnail to the viewer's stop
frame: it resolves the item's STORED document, calls the loaded `frame-grabber`
plugin's Match with that document, injects `seek_seconds` = the saved position
into the returned query (clamped inside `Convert` by the probe duration), and
calls Convert — the JPEG lands on the SAME deterministic thumbnail path, so the
re-grab overwrites the bytes and performs NO document write and NO enrich
round-trip (`_provenance.grabbed_at` is left stale by design — the fact's value
is the path, which never changes). The executor SHALL run detached from the
request (`context.WithoutCancel` plus a timeout — the request context dies with
the response; the grab outlives it) and SHALL debounce per item: a re-grab is
accepted only when the incoming position differs from the item's last grabbed
position by ≥ 60 seconds (the player flushes progress every few seconds of
playhead drift). Every executor failure SHALL be log-and-skip — a progress
write is never load-bearing, and no failure SHALL surface in the PUT response
or change the stored document.

#### Scenario: A stop at least 60 seconds past the last grab re-grabs at the stop position

- **WHEN** a progress write lands for an item whose last grabbed position is more than 60 seconds earlier
- **THEN** the executor runs the frame-grabber Convert with `seek_seconds` set to the saved position, the JPEG bytes at the item's deterministic thumbnail path are replaced, and the stored document is unchanged

<!-- wf:probe id=21c9e50c6730b077 -->
```bash
set -e
out=$(go test ./cmd/mellifera -run TestThumbRegrabAtStopPosition -count=1 -v 2>&1)
echo "$out" | grep -q "^=== RUN   TestThumbRegrabAtStopPosition$"
echo "$out" | grep -q "^--- PASS: TestThumbRegrabAtStopPosition"
```
<!-- /wf:probe -->

#### Scenario: Writes within 60 seconds of the last grab debounce to one re-grab

- **WHEN** the player flushes several progress writes for the same item a few seconds apart, none crossing a 60-second delta from the last grabbed position
- **THEN** exactly one re-grab runs for that item across those writes, and a later write that crosses the 60-second delta re-grabs again

<!-- wf:probe id=9557f22fc28f8162 -->
```bash
set -e
out=$(go test ./cmd/mellifera -run TestThumbRegrabDebounce -count=1 -v 2>&1)
echo "$out" | grep -q "^=== RUN   TestThumbRegrabDebounce$"
echo "$out" | grep -q "^--- PASS: TestThumbRegrabDebounce"
```
<!-- /wf:probe -->

#### Scenario: A failed re-grab is logged and skipped

- **WHEN** the frame-grabber plugin is unavailable or its Convert fails while a re-grab is accepted
- **THEN** the executor logs the failure and skips, the PUT that triggered it still returns its normal 200 response, and the stored document is unchanged

<!-- wf:probe id=c2d9d3756bdb6a34 -->
```bash
set -e
out=$(go test ./cmd/mellifera -run TestThumbRegrabFailureSkipped -count=1 -v 2>&1)
echo "$out" | grep -q "^=== RUN   TestThumbRegrabFailureSkipped$"
echo "$out" | grep -q "^--- PASS: TestThumbRegrabFailureSkipped"
```
<!-- /wf:probe -->

#### Scenario: Shadow e2e shows the stop frame reaching the served thumb

- **WHEN** the shadow e2e from the proposal's Verification runs — the data directory copied, the new binary serving on :8081, a `PUT /progress/{id}` at a position more than 60 seconds past the last grab, and the thumb polled on :8081
- **THEN** the thumb's ETag and bytes change to the stop-position frame, `GET /progress` is unchanged, and the original media variant still serves `Cache-Control: private, immutable`

UNPROBEABLE

### Requirement: Progress writes feed completion detection

The composition root SHALL fan the existing `Deps.OnProgress` closure out to
a watch detector beside the thumb re-grab executor: after a successful
`PutProgress`, the detector reads the WRITING VIEWER via `access.FromContext`
(the access-owned carrier stashed once per request by api's viewerFor — the
closure legs already receive `r.Context()`), loads the item, reads the stored
`ffprobe.format.duration`, and when the written position reaches ≥ 90% of
that duration inserts one idempotent `watched_items` row STAMPED WITH THE
WRITING VIEWER's user slot (see the recommendation-sorting capability for
the ledger contract) and pokes the recs janitor task's wake channel. The
detector SHALL be log-and-skip on every failure, SHALL NOT change any PUT
response, and a nil fan-out SHALL be a silent no-op (the existing seam
contract unchanged).

#### Scenario: The detector fires beside the re-grab and is nil-safe

- **WHEN** a valid PUT lands at ≥ 90% of duration with the fan-out wired,
  and again with it nil
- **THEN** the wired run inserts exactly one watched row (in the writing viewer's slot) and pokes the wake
  channel, the nil run is a silent no-op, and both PUTs return the same 200

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
