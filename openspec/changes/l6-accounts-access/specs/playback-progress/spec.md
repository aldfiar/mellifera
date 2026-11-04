# Spec Delta

## MODIFIED Requirements

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
