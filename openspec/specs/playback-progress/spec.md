# playback-progress Specification

## Purpose
Remember where playback left off: items carry one positive position record per
item id, refreshed on every save and served newest-first, so the home surface
can offer a Continue row that resumes exactly where the operator stopped, and
a Next up row can derive what to watch after it.

## Requirements

### Requirement: Progress store

The store SHALL persist playback positions in an idempotent
`CREATE TABLE IF NOT EXISTS playback_progress` table — `item_id TEXT PRIMARY
KEY`, `position_seconds INTEGER NOT NULL CHECK (position_seconds >= 0)`,
`updated_at` — with an upsert that overwrites the position and refreshes
`updated_at`. Rows are keyed by the item's string id; rows whose item no longer
exists SHALL be ignored by reads (no join hit) and MAY be swept later — the
store SHALL NOT fail on orphans. No generated columns; the existing migration
runner SHALL carry the DDL once.

#### Scenario: Upsert persists and overwrites

- **WHEN** a position is written for an item twice with different values
- **THEN** the table holds exactly one row for that item with the latest position and a refreshed `updated_at`

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
against a known item upserts the row and returns 200
`{item_id, position_seconds, updated_at}`; a negative or non-integer value or a
non-canonical body SHALL be 400 `bad_request`; an unknown item SHALL be 404
`not_found`. The endpoint SHALL NOT be retried automatically. After a
successful `PutProgress` — after the response-relevant store call, before the
response is written — the handler SHALL invoke a nil-safe
`Deps.OnProgress(ctx, itemID, positionSeconds)` closure (an anti-corruption
seam mirroring `Deps.Scan`/`Status`/`Play`; `internal/api` SHALL NOT import
`internal/plugin` or `internal/enrich`); a nil closure SHALL be a no-op and
existing responses SHALL be unchanged.

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
- **THEN** the wired closure receives exactly the saved write's item id and position — after the store upsert, before the response — both requests return the same 200 body, and the nil closure is a silent no-op

<!-- wf:probe id=1608b918d4ca992a -->
```bash
set -e
go test ./internal/api -run TestProgressOnProgress
```
<!-- /wf:probe -->

### Requirement: Progress read endpoints

The API SHALL expose `GET /api/v1/progress` (browse role group) returning
`{items:[{item_id, position_seconds, updated_at}]}` — rows with
`position_seconds > 0` joined to existing items, ordered by `updated_at`
descending, limited by `limit` (default 20, max 100, non-integer → 400) — and
`GET /api/v1/progress/{item_id}` returning the single record or 404 `not_found`
when absent (or the item is gone). Reads SHALL NOT require or imply playback
capability.

#### Scenario: Recent progress list

- **WHEN** three items hold positive positions and `GET /api/v1/progress` is called
- **THEN** the response lists exactly those items newest-first, an item without a record is absent from the list and yields 404 on its single-item route, and `limit=abc` is 400

<!-- wf:probe id=7e018bd69bc80a50 -->
```bash
set -e
grep -q '"/progress"' internal/api/router.go
go test ./internal/api -run TestProgressListEndpoint
```
<!-- /wf:probe -->

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
