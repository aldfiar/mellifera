# playback-progress Delta — minimal playback-position store and API

New capability: a minimal playback-position record per item — a SQLite table, an
authenticated write endpoint, and read endpoints — so the SPA's Continue/Next up
surfaces have real data before any streaming or in-browser playback exists.
Positions are plain integers (seconds); nothing in this capability serves media
bytes.

## ADDED Requirements

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
`not_found`. The endpoint SHALL NOT be retried automatically.

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
