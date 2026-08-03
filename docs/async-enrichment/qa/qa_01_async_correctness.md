# QA 01 — async-correctness acceptance re-derivation (AC-1, AC-async, AC-lease, AC-ledger, AC-states)

> **STATUS: DONE (2026-08-03).** Delivered as `mellifera/qa_async_acceptance_test.go`
> (`TestQA_AsyncAcceptance`, pkg `mellifera_test`) — independent e2e re-derivation
> with DIFFERENT fixtures (Mandalorian.S02E03.720p.WEB-DL.mkv,
> Чёрное зеркало S03E01.480p.mkv, broken-qa.mkv) and an independent regexp-based
> title derivation (vs the coder golden's byte-scanner). Every AC-1/async/lease/
> ledger/states behavior independently re-derived; `uncovered_behaviors` empty.
> The in-package joints (lease-no-double, retry→ledger, restart-resume, etc.) were
> already proven by coder `queue_test.go` and verified green under `-race`
> (REDUNDANCY gate — not duplicated). See `qa/.joint_coverage.md`.

- **Type:** qa (independent acceptance / integration / property)
- **Phase:** after coder (T01-T09) + reviewer PASS
- **AC trace (independently re-derived from acceptance.md):** AC-1, AC-async, AC-lease, AC-ledger, AC-states
- **Validates tasks:** T01 (state), T02 (ledger), T03 (retry), T04 (lease), T05 (queue), T06 (scan), T08 (integration)
- **Project scope:** `.` (root)

## purpose

Independently re-derive the FULL async-correctness behavior set from `acceptance.md` (not from the coder tasks) and assert every behavior has a test — the safety net against forgotten functionality. The async ACs are load-bearing (R-1 lease race, R-2 loop-safety, R-3 restart-resume); QA MUST NOT trust the coder's `behaviors` at face value — it reconstructs the behavior index and flags any gap.

## behavior_coverage (independent re-derivation from acceptance.md)

For each acceptance clause, QA independently derives the behaviors and maps each to a test (coder unit test, QA integration/property test, or the golden). Any B-id with NO test → `uncovered_behaviors` (GAP).

| AC clause | Independently-derived behaviors (must each have a test) | Covered by |
|---|---|---|
| **AC-1** (golden e2e async) | scan persists items `pending` (no inline enrich); worker derives `(item,tv-parser)`; claims lease; drains Match→BuildRequest→Convert→Merge; writes `sources.tv-parser` + `_provenance` + `_view` + `_stages`; advances to `ready`; `?status=ready` lists; tmdb SERVER-but-unloaded → unavailable → no namespace (item still ready); kinopoisk CLIENT → not queued | T08 (golden), T05 (queue_test), T06 (scan test) |
| **AC-async** (non-blocking) | scan returns BEFORE items `ready`; ≥1 item `pending` at return; workers continue in background; `scan.Result` shape unchanged; items reach `ready` over time | T08 (AC-async assertion), T06 (result-shape test) |
| **AC-lease** (no double-processing) | at-most-one lease per `item_id`; two workers one item → exactly one processes; lazy expiry reclaims dead lease; NO DB writes for acquire/refresh/expire; ledger NOT written per-claim | T04 (lease_test race), T05 (queue_test no-double) |
| **AC-ledger(a)** (loop-safety) | transient fail → in-memory backoff up to MaxAttempts → terminal `exhausted` → `RecordFailure(next_eligible=now+7d)` → derivation SKIPS pair until eligibility; doubling 7d→14d→28d cap 365d | T03 (retry_test exhausted), T02 (ledger upsert), T05 (queue_test cooldown-skip) |
| **AC-ledger(b)** (reset-on-success) | a pair with a ledger row that later succeeds → row DELETED (`ClearFailure`, idempotent) | T02 (clear-idempotent), T05 (queue_test reset) |
| **AC-ledger(c)** (restart-resume) | restart → in-memory queue/leases gone → pending RE-DERIVED from `items` → exhausted pairs NOT re-derived into a loop (only per-session retry counters reset) | T05 (queue_test restart) |
| **AC-states(a)** (retry exercised) | `failed --retry--> pending` now exercised by the queue (was defined-but-unused in Phase A) | T01 (nextState table), T05 (queue drives retry) |
| **AC-states(b)** (settled→ready) | queueable sources all terminal → `enriched --settled--> ready` | T01 (nextState), T05/T08 |
| **AC-states(c)** (stale on re-scan) | re-scan detects file changed → `* --stale--> stale` then `stale --rehydrate--> pending` | T01 (nextState), T06 (stale-on-rescan test) |
| **AC-states (illegal)** | `nextState` rejects illegal transitions (e.g. `ready--parsed-->`) | T01 (nextState illegal table) |

### uncovered_behaviors (GAP flags — populate after reading the coder's tests)

- (QA fills after auditing T01-T08 tests. Any B-id above with no corresponding test → list here as a GAP and surface to the orchestrator. Initial pass: NONE expected — every behavior maps to a coder test. If a gap is found, QA ADDS the test rather than leaving it uncovered.)

## joints_targeted

The async-correctness module joints (from implementation_plan data flow + integration_map seams):
- **lease ↔ dispatch** (S4): mutual exclusion + lazy expiry — the §4.4 dispatch invariant (R-1).
- **retry ↔ ledger** (S3→S1): fail→backoff→exhausted→RecordFailure→derivation-skip (R-2).
- **derivation ↔ items + ledger** (S4→S1): pending re-derivation + cooldown-skip (R-3 restart-resume).
- **worker ↔ reconstructed base** (S7): Match from the persisted doc, no re-probe (R-7).
- **scan ↔ queue.Notify** (S5): non-blocking handoff (R-5).
- **state machine** (S2): ready/stale/retry transitions (AC-states).

## mock_boundaries

- Mock/external: NONE for B1 (no external HTTP — tv-parser is a local subprocess). REAL go-plugin subprocesses (base-scanner + tv-parser) + REAL ffprobe in the integration golden (T08).
- Internal modules: REAL instances. The `metadataResolver` / `Notify` / `enricher` unexported seams (R8 second-impl) are the only fakes — they are in-package test doubles, NOT mocks of real internals.
- The ledger/derivation tests use a REAL temp `*store.Store` (no store mock) — the SQL round-trip is part of what's being verified.

## test_plan (QA-authored; max 4 joint + 2 boundary + 1 property per the QA format)

QA ADDS tests that the coder unit tests do not cover (independent angle). All in `package enrich_test` (in-package via the unexported seams) + `package mellifera_test` (black-box):

1. **joint (AC-lease, the §4.4 invariant under load):** `TestQueue_LeaseNoDoubleUnderConcurrency` — `Workers=4`, a small batch of items, a fake `tv-parser` that sleeps briefly; assert (a) no item is processed by two workers concurrently (per-item serialization — record `acquire` winners via the lease map / a counter), (b) every item reaches `ready`, (c) `ListFailures` is empty (no terminal failures). Run under `-race`. (S4 joint, R-1.)
2. **joint (AC-ledger(a) end-to-end):** `TestQueue_FailingSourceExhaustsToLedger` — a fake `tv-parser` that RPC-fails `MaxAttempts`×; assert the dispatch writes exactly one `RecordFailure(item, tv-parser, status="exhausted", attempts=MaxAttempts)` row; `next_eligible_at` is `now+ExhaustedCool`; a subsequent derive SKIPS the pair; advance the clock past eligibility → it re-derives. (S3→S1 joint, R-2.)
3. **joint (AC-ledger(c) restart-resume):** `TestQueue_RestartRederivesPendingSkipsCooldown` — seed items + one exhausted ledger row within cooldown; `Start` → assert pending re-derived from `items` AND the cooldown pair is NOT re-derived (no loop); `Stop`; `Start` again → same invariant (idempotent resume). (R-3.)
4. **joint (AC-1 + AC-async black-box):** `TestIntegrationAsyncPipeline` (T08's golden) — QA REVIEWS it covers AC-async (≥1 pending at return) + the ready+provenance assertions; if T08 under-asserts the timing, QA STRENGTHENS it (the scan response must return before items reach ready). (S-integration, S5.)
5. **boundary (AC-states illegal):** `TestNextState_RejectsReadyParsed` (boundary of the state machine) — already in T01's extended table; QA CONFIRMS the specific illegal cases `ready--parsed-->`, `ready--begin-->`, `stale--parsed-->` are enumerated (not just generic "some illegal"). If T01's table is generic, QA ADDS named cases.
6. **boundary (AC-3 additive within async scope):** `TestEnrich_PreservedAndWorkerCallable` — assert `func Enrich(` still exists (compile-time + a call) AND the worker path (`enrichDoc`/`runSourceRetryable`) is exercised — the serial path is not dead code (deprecate-don't-delete). (AC-3.)
7. **property (AC-ledger bounded decay):** `TestCooldown_BoundedAndDecaying` — a table over `priorAttempts ∈ {0,1,2,5,10,100}` → `nextEligible` is monotonic non-decreasing AND never exceeds `CoolCap` (365d) AND each step roughly doubles (7→14→28…). This pins the §4.4 schedule as a property, not just point cases. (R-2.)

## refactoring_validation

- `grep -rn 'func Enrich(' internal/enrich/` → ≥1 (preserved).
- `grep -cE '== "SERVER"' internal/enrich/queue.go` → 0 (D-Q1 is `!= "CLIENT"`); `grep -cE '!= "CLIENT"' internal/enrich/queue.go` → ≥1.
- `grep -rnE 'enrichment_jobs|enrichment_leases' internal/` → 0 (no queue table).
- `git diff --stat -- internal/store/open.go` → empty (NO DDL).
- `git diff --stat -- proto/ pkg/sdk/metadata.go plugins/tv-parser/ plugins/base-scanner/` → empty (AC-3 additive).

## precondition

Coder T01-T09 landed + reviewer PASS. `contracts.md`, `acceptance.md`, `integration_map.md` read. The in-package seams (`enrich.metadataResolver`, `scan.enricher`/`scan.Notify`, the `now` clock) are available for fakes.

## postcondition

Every async-correctness behavior (AC-1, AC-async, AC-lease, AC-ledger, AC-states) has a passing test (coder unit + QA joint/property); `uncovered_behaviors` is empty (or each gap has a QA-added test). `go test -race ./...` green. The async-correctness invariants (lease mutual exclusion, loop-safety, restart-resume) are independently verified — not just coder-asserted.

## acceptance_criteria

- AC-1, AC-async, AC-lease, AC-ledger, AC-states — each independently verified by ≥1 test.
- Every behavior in the table has a test (zero uncovered).

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`, `golang-security`
