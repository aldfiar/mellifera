## ADDED Requirements

### Requirement: Manual title overrides

The store SHALL persist per-entity display-title overrides in an idempotent
`CREATE TABLE IF NOT EXISTS title_overrides` table — `entity_id TEXT PRIMARY
KEY`, `title TEXT NOT NULL`, `updated_at` — keyed by the series row id or the
item id (the two id spaces never collide: series ids carry the `ser_` prefix).
The API SHALL expose, in the admin role group, `PUT /api/v1/series/{id}/title`
and `PUT /api/v1/items/{id}/title` accepting `{"title": "<non-empty>"}` — a
whitespace-only or non-string title SHALL be `400 bad_request`, an unknown id
SHALL be `404 not_found` with nothing written — returning 200 with the stored
record, plus `DELETE` on the same routes clearing the override (204,
idempotent when none is set). An override SHALL be control state beside the
document: writing or clearing one SHALL NOT modify any document namespace.
The series list/detail and items list/detail wire shapes SHALL gain an
additive `title_override` string field (empty string when unset).

#### Scenario: Override rows persist, clear, and leave documents untouched

- **WHEN** an override is set for a series id and for an item id, read back, cleared, and read again
- **THEN** the stored title reads back set and then cleared, clearing an absent override is a no-op, and the series and item documents are byte-identical throughout

<!-- wf:probe id=f4a3a5492d753301 -->
```bash
set -e
go test ./internal/store -run TestTitleOverrides
```
<!-- /wf:probe -->

#### Scenario: Title verbs round trip and ride the wire

- **WHEN** a title is PUT for a series and for one of its episodes, the series and item reads follow, and then the episode's override is DELETEd and the reads repeat
- **THEN** both PUTs return 200 with the stored record, the reads carry `title_override` set and then empty, and the delete answers 204

<!-- wf:probe id=6961d970019daaa4 -->
```bash
set -e
go test ./internal/api -run TestTitleOverrideVerbs
```
<!-- /wf:probe -->

#### Scenario: Validation and unknown ids write nothing

- **WHEN** the title routes receive a whitespace-only title, a non-string title, or target an unknown series id and an unknown item id
- **THEN** the invalid bodies answer `400 bad_request`, the unknown ids answer `404 not_found` with the canonical error body, and no row is written in any of the four cases

<!-- wf:probe id=c546021b243faf9b -->
```bash
set -e
go test ./internal/api -run TestTitleOverrideVerbs
```
<!-- /wf:probe -->

#### Scenario: Title routes sit in the admin group

- **WHEN** the title routes are called with no token and then with a client-role principal
- **THEN** the unauthenticated calls are rejected `401` and the client-role calls `403`, each with no side effect

<!-- wf:probe id=bbcf3f0cf04d2616 -->
```bash
set -e
go test ./internal/api -run TestTitleOverrideVerbs
go test ./internal/api -run TestSeriesRoutesBrowseGated
```
<!-- /wf:probe -->

### Requirement: Serial watch-flow joint E2E

The itest suite SHALL carry a hermetic joint test over the real graph —
server + serial plugin subprocesses over a fixture serial library whose
serial directories carry sidecar subfolders (voiceover audio and subtitle
files, including one voiceover file absent on disk) — that scans the
library, asserts the episode documents carry the sidecar facts, serves a
subtitle sidecar through the media variant, lists the voiceovers on the
playback descriptor, and round-trips a title override through the API.

#### Scenario: The serial watch-flow joint E2E joins the itest harness

- **WHEN** the serial watch-flow joint E2E runs against the existing harness (real store, real queue, real plugin subprocesses)
- **THEN** it passes node-free: episode documents carry episode-linked subtitle and voiceover sidecar facts, the sidecar media variant serves the indexed subtitle bytes, the descriptor lists the resolvable voiceovers, and the title override round-trips

<!-- wf:probe id=e6ec721c5b6b1da0 -->
```bash
set -e
out=$(go test ./internal/itest -run 'TestSerialWatchFlowJointE2E' -count=1 -v 2>&1)
echo "$out" | grep -q "^=== RUN   TestSerialWatchFlowJointE2E$"
echo "$out" | grep -q "^--- PASS: TestSerialWatchFlowJointE2E"
```
<!-- /wf:probe -->
