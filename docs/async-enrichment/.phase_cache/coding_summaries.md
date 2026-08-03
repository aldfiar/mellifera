# Coding Summaries — async-enrichment B1 (T01–T04)

One line per file changed. Foundation leaves only (T05 is the join, not started).

## T01 — state machine (S2)
- `internal/enrich/state.go` (MODIFY): +statusReady/statusStale literals, +evSettled/evStale/evRehydrate events, +10 transition rows (9 test_seed + ready--deleted per `* --deleted-->`); nextState body unchanged (pure table).
- `internal/enrich/enrich_test.go` (MODIFY): extended TestNextState (new states/events/rows + explicit ready--parsed illegal probe); TestEnrich/TestValidateNamespace untouched.

## T02 — store ledger (S1)
- `internal/store/ledger.go` (CREATE): FailureRow + RecordFailure (ON CONFLICT upsert) / ClearFailure (idempotent DELETE) / ListFailures; parameterized SQL; reason via sql.NullString; next_eligible_at round-trips via formatTime/parseTime. NO DDL (open.go untouched).
- `internal/store/ledger_test.go` (CREATE): round-trip + lossless next_eligible_at + PK upsert-update + idempotent clear + cooldown-distinguishability.

## T03 — retry/backoff (S3)
- `internal/enrich/retry.go` (CREATE): runSourceRetryable(maxAttempts, backoff) [spec-blessed split from QueueConfig — lands T05] + ledgerExhausted/ledgerNoData consts; bounded loop, ctx-aware backoff (select+time.After), sr defaults to outcomeFailed to avoid zero-value leak. NO store import.
- `internal/enrich/retry_test.go` (CREATE): 6 table cases + ctx-cancel-mid-backoff; scripted fake (reuses wrapNamespace/binding).

## T04 — lease map (S4 lease half)
- `internal/enrich/lease.go` (CREATE): lease/leaseMap/newLeaseMap + acquire/expired/release/renew; mutex-guarded (mirrors plugin.Manager.mu); package clock `now`; lazy expiry (no sweeper); NO DB.
- `internal/enrich/lease_test.go` (CREATE): acquire/block, lazy-reclaim, expired-boundary, release-idempotent, renew + N=10 concurrent-acquire (exactly 1 winner).

## T05 — the derived queue (S4 dispatch / S7 reconstruct / S8 AuthMode / S3 dispatch half) — THE load-bearing join
- `internal/enrich/queue.go` (CREATE, 476 LOC <500): QueueConfig (§4.4 zero-value defaults) / Stats / Queue / NewQueue + Start/Stop/Notify/Stats; bounded worker pool (`for itemID := range q.work`, Workers default 4); derivation (D-Q1 queueable = Enabled && AuthMode != CLIENT; namespace-done-skip; ledger cooldown-skip); workItem driver (acquire lease → driveSources → settle→ready / ctx→failed); Start/Stop re-entrant (restart-resume). storeWrite mutex serializes store writes (no busy_timeout in store.Open).
- `internal/enrich/worker.go` (CREATE, 271 LOC): per-item driver split (R-8) — driveSources (priority drain via runSourceRetryable T03, applyContribution, ledger), advanceForSource (mirror enrichDoc begin/parsed), applyOutcome (ClearFailure reset-on-success / RecordFailure terminal), allSourcesTerminal (settled check), reconstructBase/toStruct (S7 from doc['parsed'] via structpb), terminalCooldown (§4.4 doubling 7d→14d→28d cap 365d / no_data 30d flat), failureIndex/inCooldown/priorAttempts.
- `internal/enrich/enrich.go` (MODIFY): Enrich doc comment → worker-internal + preserved (AC-3); signature + body UNCHANGED.
- `internal/enrich/doc.go` (MODIFY): Public API 3→7 (Queue/QueueConfig/Stats/NewQueue) + async substrate section + INV-derived-not-stored/INV-rare-ledger-writes + ready/stale.
- `internal/enrich/queue_test.go` (CREATE): table + concurrency — D-Q1 derivation, namespace-done-skip, cooldown-skip+eligibility-rederive, drain-to-ready, retry→ledger (exhausted, attempts=MaxAttempts, nextEligible~=7d), reset-on-success, restart-resume, lease no-double (-race, Match calls==1), bounded pool drains 20 items (-race), reconstructBase + drives-Match (S7), terminalCooldown schedule.

## Budgets (post-T05)
- enrich exported: 3 → 7 (Deps, Result, Enrich, Queue, QueueConfig, Stats, NewQueue) — ≤8 GREEN.
- store exported: 5 (unchanged in T05).
- queue.go 476 < 500; worker.go 271; all files <500.

## Deviations flagged for reviewer (T05)
- D-T05-1: structpb import for S7 base reconstruction (protobuf well-known type, no new dep).
- D-T05-2: queue writeMu serializes store writes (store.Open has no busy_timeout; modifying store is out of scope). Load-bearing concurrency decision.
- D-T05-3: Start derives KNOWN libs (via Notify); no ListLibraries in store (out of scope). Restart-resume in-process.
- D-T05-4: ledger attempts = round marker (MaxAttempts round 1, +1/round) so the §4.4 doubling is recoverable.
- D-T05-5: queue.go/worker.go split (R-8 authorized).

## Deferred (NOT in T05 scope)
- Feature Acceptance test file — AC-lease/AC-ledger/AC-1-substrate covered by queue_test.go; full AC-1/AC-async e2e golden owned by T08 (needs T06-T08).
