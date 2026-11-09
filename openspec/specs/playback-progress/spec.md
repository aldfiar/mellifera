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
CALLER'S rows with `position_seconds > 0` joined to existing, VISIBLE,
NON-DELETED items, ordered by `rec_score` descending then `updated_at`
descending by default, with `sort=recent` restoring pure `updated_at`
descending order, limited by `limit` (default 20, max 100, non-integer → 400)
— and `GET /api/v1/progress/{item_id}` returning the caller's single record
or 404 `not_found` when absent (or the item is gone, tombstoned, or
invisible). Every read SHALL be viewer-scoped (the caller's own slot) AND
visibility-conjunct in SQL BEFORE the limit window (no short pages).
`rec_score` SHALL be the entity's recommendation score (recommendation-sorting
capability) carried additively, omitted when scoring is not computable. Reads
SHALL NOT require or imply playback capability. A tombstoned item's rows SHALL
drop from the served reads while REMAINING stored — retained for identity
adoption and audit, never deleted; while tombstoned, the progress feeds no
served read and no scoring input (the shipped non-deleted joins), and adoption
re-keys the state onto a live identity match within one rescan.

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

#### Scenario: A tombstoned item's progress stops serving but survives

- **WHEN** an item's row advances to `deleted` while its positive progress row remains stored, and the caller fetches the listing and the single-item route
- **THEN** the row is absent from the served listing while the stored row remains untouched in storage — retained for identity adoption and audit; while tombstoned it feeds no served read and no scoring input, and adoption re-keys it onto a live identity match within one rescan — and the single-item route answers 404 `not_found`

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

### Requirement: Identity adoption of stranded watch state

When a live item's parsed identity matches a tombstoned item that carries playback progress or watched-ledger rows, the system SHALL migrate that state onto the live item and leave no copies on the dead row. The identity key SHALL be the served identity every surface composes — the library, the item's identity floors, and its season/episode facts read through the parser namespaces' fixed order. Episodes SHALL discriminate SERIES through a series-identity bridge: the live item's series row and the candidate's series row (each resolved from its document's parsed series anchor; the dead series row and document survive the tombstone byte-intact) SHALL carry EQUAL and NON-EMPTY parser-composed series titles — the single serial-parser parser-composed series title, the same leg the series display name resolves through the parser namespaces' fixed order — before the (season, episode) legs decide; a legs collision across DIFFERENT series identities SHALL never carry. Films (absent legs on both sides) SHALL match on the item's display title floor alone — equal and NON-EMPTY on both sides. An empty identity floor on EITHER side SHALL never match: no identity facts, no adoption — a plugin-unenriched stranded class keeps its state keyed to the dead id rather than risking an empty-keyed carry across unrelated rows. Migration SHALL be a per-viewer MOVE, not a duplication: a progress row moves into a target slot ONLY when the live item holds no row for that viewer — the live item's own rows ALWAYS win, an explicit zero-position (unwatched reset) slot included, so a viewer's reset is never resurrected; watched-ledger rows move with `completed_at` and `applied_at` preserved verbatim (an already-applied completion never re-learns; an unapplied one learns exactly once, from the new item) and the row's series anchor re-points to the live item's series when one resolves. The dead item SHALL retain no migrated rows afterwards — no ghost stock for the boot backfill or ledger janitor to re-consume. The migration SHALL fire when the live item's served identity becomes known — at the enrichment pass that writes it — so ONE rescan lands the stranded state, and it SHALL fire ONLY for a live row's settle: a tombstoned row neither adopts nor is re-derived (the enrichment derivation never dispatches a deleted row — its self-heal re-includes it the moment the re-scan upsert advances its status), and a move whose source equals its target SHALL be a no-op that moves nothing and deletes nothing. The migration SHALL be idempotent (a re-fire moves nothing) and log-and-skip beside the row's enrichment: a migration failure never fails the row. When no dead candidate matches, the migration SHALL be a no-op and the stranded state stays keyed to the tombstoned id — join-dropped from every surface, harmless.

#### Scenario: A renamed directory's progress lands on the live item

- **WHEN** a serial directory is renamed between scans, the library is re-scanned to a clean drain, the enrichment queue settles the fresh items, and the old episode item tombstoned carrying 88% progress
- **THEN** the two sides' series rows carry the same parser-composed series title (the rename left the series identity intact), the (season, episode) legs agree, and that position reads on the NEW item's slot for the same viewer, the dead row holds no progress rows, and the rail resumes the new item honestly

#### Scenario: Equal episode legs across different series never carry

- **WHEN** a library holds two series with different parser-composed titles and a tombstoned episode of one series shares its (season, episode) legs with a live episode of the other, the dead row carrying stranded progress
- **THEN** nothing moves — the series-identity bridge refuses the match, the dead row keeps its retained state, and the live item gains nothing

#### Scenario: An empty identity floor never matches

- **WHEN** a settled live item and a tombstoned candidate carry no identity facts on their shared floor (both titles empty on the film shape, or both series parser titles absent on the episode shape)
- **THEN** nothing moves — adoption requires a non-empty floor on both sides, and the stranded state stays keyed to the dead id

#### Scenario: A live row always wins the slot

- **WHEN** the dead item's progress migrates onto a live item that already holds its own row in the same viewer slot — a positive row, or an explicit zero-position unwatched reset
- **THEN** the live row is unchanged — the reset is never resurrected — and the dead copy is deleted

#### Scenario: Ledger moves with its learning state

- **WHEN** a dead item's watched-ledger rows migrate — one already applied, one not
- **THEN** the applied row keeps its `applied_at` verbatim (the janitor re-learns nothing), the unapplied row learns exactly once from the new item, both carry their `completed_at` verbatim, and their series anchors re-point to the live item's series

#### Scenario: A tombstoned row neither adopts nor re-enriches

- **WHEN** the queue derivation runs over a library holding a tombstoned row whose sources still derive pending work, and any settled dead row reaches the adoption hook
- **THEN** no task is derived or dispatched for the dead row, the hook does not fire for it, and no move names it as both source and target — its retained stock is untouched

#### Scenario: No match is a no-op

- **WHEN** a settled live item's identity matches no tombstoned candidate
- **THEN** nothing moves, nothing fails, and the enrichment run's outcome is unaffected
