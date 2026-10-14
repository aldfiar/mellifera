# async-enrichment Delta

## MODIFIED Requirements

### Requirement: Lifecycle states ready and stale
The lifecycle state machine SHALL accept `enriched --settled--> ready` (all of the item's queueable sources terminal), `* --stale--> stale`, `stale --rehydrate--> pending`, and SHALL exercise `failed --retry--> pending`. A re-scan SHALL drive `* --stale--> stale` only when the row's parsed identity changed since its last good scan; a re-scan whose parsed identity is unchanged — ffprobe-only drift included — SHALL preserve the prior status and the row's derived namespaces, so an enriched library keeps its anchors across rescans and re-enriches only on real identity change (the streams lane still drops streams on ffprobe drift per packaged-playback). An explicit source re-enrichment SHALL additionally accept `ready --refresh--> pending` and `enriched --refresh--> pending`, applied to exactly the rows whose namespaces the sweep stripped, so `pending` stays a truthful will-fetch signal (today a refresh can never move a status). Illegal transitions (e.g. `ready --parsed-->`) SHALL be rejected; new statuses SHALL list via the unchanged `GET /api/v1/items?status=` passthrough.

#### Scenario: Item settles to ready after drain
- **WHEN** every queueable source of an enriched item reaches a terminal outcome (namespace written, in cooldown, or ran-but-produced-no-work)
- **THEN** the item advances to `ready` and is listable via `?status=ready`

#### Scenario: Changed file re-scan marks stale
- **WHEN** a re-scan detects a file's parsed identity changed since its last good scan
- **THEN** the item advances `stale → pending` for re-enrichment, while a re-scan whose parsed identity is unchanged — including ffprobe-only drift — preserves the prior status and the derived namespaces (a `ready` item is not regressed)

<!-- wf:probe id=940053d5086eaac8 -->
```bash
set -e
grep -q 'func TestFfprobeDriftKeepsEnrichmentDropsStreams(' internal/scan/carry_test.go
go test ./internal/scan -run 'TestRunScan_StaleOnRescan|TestFfprobeDriftKeepsEnrichmentDropsStreams' -count=1
```
<!-- /wf:probe -->

#### Scenario: Failed item retried
- **WHEN** an item is `failed` (e.g. cancelled context) and the next derive pass runs
- **THEN** the item transitions `failed → pending` and is re-enqueued

#### Scenario: Explicit re-enrich flips stripped rows to pending

- **WHEN** a re-enrichment sweep strips a `ready` (or `enriched`) row's `shikimori` namespace and the derivation re-runs for it
- **THEN** the stripped row's status is `pending` while its work drains, and rows the sweep did not strip keep their prior status

<!-- wf:probe id=a1bc96f6b9fef173 -->
```bash
set -e
go test ./internal/enrich -run TestReenrichStatusFlip
```
<!-- /wf:probe -->
