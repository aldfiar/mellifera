# Spec Delta

## MODIFIED Requirements

### Requirement: Enrichment-failures ledger (loop-safety)

The store SHALL persist terminal source outcomes to the `enrichment_failures`
ledger via `RecordFailure` (upsert on `(item_id, plugin_id)`), `ClearFailure`,
and `ListFailures`. Writes SHALL occur on terminal failure — `exhausted`
(retries spent, doubling cooldown capped at a max), `no_data` (flat cooldown),
or `pack_failed` (a failed packaging run on the `__streams__` lane, flat
cooldown with no doubling) — and at a client-relay handoff: `relayed` (a flat
cooldown, default 10 minutes, no doubling — the pair stays quiet while the
relay job lives). A `relayed` row SHALL clear when the relay job completes so
the pair re-derives, and SHALL become terminal `exhausted` with the standard
doubling schedule after the relay's give-up budget (three relay rounds). No
per-claim or on-success writes occur beyond these.

#### Scenario: Exhausted source terminally fails to ledger
- **WHEN** a source fails through all `MaxAttempts` backoff rounds
- **THEN** an `exhausted` ledger row is recorded with a future `next_eligible_at`, derivation skips the pair until eligibility, and no infinite retry loop occurs

<!-- wf:probe id=4bcdfd9bb8cf9188 -->
```bash
set -e
go test ./internal/enrich -run TestQueue_RetryToLedger
```
<!-- /wf:probe -->

#### Scenario: Reset on success
- **WHEN** a `(item, plugin)` pair with an existing ledger row eventually succeeds
- **THEN** the row is deleted and the pair becomes derivable again

<!-- wf:probe id=c28a961b6d43b2c8 -->
```bash
set -e
go test ./internal/enrich -run TestQueue_ResetOnSuccess
```
<!-- /wf:probe -->

#### Scenario: Failed pack cools down flat

- **WHEN** a packaging run fails terminally, then fails again shortly after an explicit play-time retry
- **THEN** each failure records a `pack_failed` ledger row under `__streams__` with a flat 30-day cooldown — no doubling across repeated failures — and the item is not re-enqueued for packaging until the cooldown elapses or play requests retry again

<!-- wf:probe id=951501b58d2cba69 -->
```bash
set -e
go test ./internal/enrich -run TestStreamsLane
```
<!-- /wf:probe -->

#### Scenario: A relay handoff cools flat and clears on completion

- **WHEN** a queueable source's fetch fails with a network-class error and the
  request plan hands off to the relay queue, then the claimed client posts a
  successful result
- **THEN** the ledger row for the pair reads `relayed` with a flat ~10-minute
  eligibility while the job lives — derivation skips the pair — and after the
  result lands the row is cleared so the pair re-derives and consumes the
  stored response

<!-- wf:probe id=7c1e4d20a95b3f16 -->
```bash
set -e
go test ./internal/enrich -run 'TestRelayEnqueue|TestRelayIngest' -count=1
```
<!-- /wf:probe -->

#### Scenario: Three failed relay rounds land terminal exhausted

- **WHEN** three consecutive relay jobs for a pair end without a usable
  result
- **THEN** the ledger row becomes terminal `exhausted` with the standard
  doubling schedule — the pair cools long and derivation stays quiet until
  eligibility or an explicit re-enrichment

<!-- wf:probe id=3f9b82c6de104a77 -->
```bash
set -e
go test ./internal/enrich -run TestRelayIngest -count=1
```
<!-- /wf:probe -->

## ADDED Requirements

### Requirement: Per-plugin failure drill-down

The failures listing (`GET /api/v1/enrich/failures`) SHALL accept OPTIONAL
query parameters `plugin_id`, `limit`, and `offset`: a `plugin_id` filter
scopes the listing to one plugin; `limit` (default 50, capped at 200) bounds
the window served newest-first by `failed_at`; `offset` advances the window.
A request without parameters SHALL be answered exactly as today — the full,
unfiltered ledger with the same row shape (the never-filtered guarantee is
untouched). Invalid numeric parameters SHALL be rejected with 400. All
parameterized reads only; the existing unpaginated store read stays
untouched.

#### Scenario: No parameters answer the full list unchanged

- **WHEN** the endpoint is called with no query parameters over a ledger
  holding rows for several plugins
- **THEN** every row is served in today's shape — the full unfiltered list,
  including gone-entity rows — the same answer the endpoint gave before this
  change

#### Scenario: The drill-down window is plugin-scoped and limited

- **WHEN** the endpoint is called with `plugin_id=shikimori` and `limit=50`
  over a ledger holding 120 rows for that plugin plus rows for other plugins
- **THEN** exactly the 50 newest rows (by `failed_at`) for shikimori are
  served — no other plugin's rows and no older shikimori rows in this window
