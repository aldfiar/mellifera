# Health Check: async-enrichment (Phase B1)
Date: 2026-08-03 | Mode: health-check | Stack: go 1.25.3 / modernc-sqlite / hashicorp-plugin
Scope: B1 diff vs `6507277` (feature/async-enrichment) — changed source + test files only.
Reviewer status: PROCEED-WITH-FIXES (correctness); this audit is code-HEALTH only.

## Overall verdict: ISSUES-FOUND (PROCEED)
No P0. No `origin: feature` finding matching a negative AC intent. All six gates green, including `go test -race ./...` (no data races). The P1/P2 items below are cleanup-routable and do not block the pipeline. Recommend an optional `async-enrichment-cleanup` task for the P1 + the high-value P2s.

## Summary
Findings: P0: 0 | P1: 1 | P2: 4 | P3: 2
Lines deletable: ~90 (prodEnricher seam + writeMu + lease.renew + task alias + t.Skip scaffolding, if cleanup is taken)
Tests deletable: ~2 stub bodies (t.Skip retirements — optional, see P3-2)
Tests rewritable: 0 (new tests are substantive, behavior-asserting)

## Changed-files inventory
**CREATE (new source):** `internal/enrich/{queue.go,worker.go,lease.go,retry.go}`, `internal/store/ledger.go`
**CREATE (new tests):** `internal/enrich/{queue_test.go,worker_test.go,lease_test.go,retry_test.go}`, `internal/store/ledger_test.go`, `integration_async_test.go`, `cmd/mellifera/config_test.go`
**MODIFY (source):** `internal/enrich/{state.go,enrich.go,doc.go}`, `internal/store/open.go` (busy_timeout DSN), `internal/scan/{run.go,doc.go}`, `cmd/mellifera/main.go`
**MODIFY (tests):** `internal/enrich/enrich_test.go`, `internal/scan/run_test.go`, `internal/store/store_test.go`, `integration_test.go`, `qa_acceptance_test.go`
**TEST reconciliation (intentional retirements):** `integration_pipeline_test.go` + `qa_pipeline_acceptance_test.go` → cited `t.Skip` stubs superseded by `integration_async_test.go`

## Gate + -race re-run results (all read-only)
| Gate | Result |
|------|--------|
| `gofmt -l .` | CLEAN (only `.claude/skills/.../module-template/doc.go` — out of scope template) |
| `CGO_ENABLED=0 go build ./...` | PASS (exit 0) |
| `go test ./...` | PASS (all 11 pkgs ok; 10.2s) |
| `go test -race ./...` | PASS — NO DATA RACES (exit 0) |
| `golangci-lint run ./...` | PASS (exit 0; funlen/gocognit/gocyclo/lll/depguard/dupl clean) |
| `bash .claude/skills/mellifera-build/scripts/check.sh` | `check.sh: OK` (exported-symbol budgets ≤8 WARN/≤12 FAIL respected) |

## Per-package / per-file health
- **internal/enrich** (7 exported: Deps, Result, Enrich, QueueConfig, Stats, Queue, NewQueue — ≤8 ✓): healthy substrate. `queue.go` 476 lines (warn >300 / fail >500 — in WARN, under FAIL; split was intentional to stay <500). `state.go` is a pure table function (no I/O) — clean. `lease.go` mirrors `plugin.Manager.mu` correctly (mutex-guarded, short critical sections, never held across RPC/sleep). Concurrency correctness confirmed: lease mutual-exclusion asserted (`TestQueue_LeaseNoDouble`), `-race` clean, `feederWG` prevents send-on-closed, `running` CAS guards Start/Stop re-entrancy.
- **internal/store** (ledger.go + open.go): healthy. Parameterized SQL only (`?` placeholders in RecordFailure/ClearFailure/ListFailures); `withBusyTimeout` adds a pool-wide 5s `busy_timeout` via DSN (the correct root-cause fix for pooled connections). check.sh passed.
- **internal/scan** (run.go): the serial→async migration is clean (persist writes `pending`, post-drain `notify(ctx, libraryID)` hands off; no inline enrich). The retained `enrich enricher` seam is dead wiring — see P2-2.
- **Tests**: substantive across the board. `queue_test.go` (10 tests) covers the §4.4 derivation predicate, retry→ledger, reset-on-success, restart-resume, lease-no-double, bounded-pool, reconstruct-base, cooldown doubling. `ledger_test.go` / `retry_test.go` / `worker_test.go` are table-driven behavior assertions, not tautologies. No garbage/tautology detected.

## Conventions check
Apache-2.0 headers: present on every new `.go` file ✓. Parameterized SQL only ✓. No `reflect`, no DI framework (depguard clean) ✓. Interfaces only at the plugin seam (`sdk.MetadataSource`); the enrich/scan seams are unexported func types, not interfaces ✓. Core media-type-agnostic (no `media_type` branching) ✓. INV-downward imports (enrich never imports api/scan) ✓.

## P1 — types-correctness
| ID | File:Line | Pattern | origin | Description | Fix |
|----|-----------|---------|--------|-------------|-----|
| C-01 | enrich.go:148 (appendStage) + worker.go:291 (attemptedNoWork) | unchecked type-assertion on round-trip-mutated slice | feature | Two `doc["_stages"].([]map[string]any)` assertions (the `, _ :=` form discards `ok`). After a JSON store round-trip, `encoding/json` decodes a persisted `_stages` array as `[]any`, NOT `[]map[string]any`, so the assertion silently yields nil/false. Currently MASKED (within one `workItem` pass the in-memory doc holds `[]map[string]any`), but across a restart re-derive it manifests as: (a) `appendStage` overwrites prior `_stages` history (data loss / "precision preserved" breach), and (b) `attemptedNoWork` cannot observe prior-pass stages (could strand a non-ready item). Same root cause in two sites. | Normalize `_stages` to `[]map[string]any` inside `decodeDoc`, OR assert `[]any` and convert per element. Either fix closes both sites at once. |

## P2 — dead code / DRY-SOLID / stale doc
| ID | File:Line | Pattern | origin | Description | Fix |
|----|-----------|---------|--------|-------------|-----|
| D-01 | queue.go:466-471 (storeWrite) vs open.go:128-176 | stale/contradictory doc + redundant mechanism | feature | `storeWrite`'s comment claims store.Open has "no busy_timeout (default 0)" and defers a busy_timeout fix "to the store's scope" — but THIS SAME DIFF added a pool-wide 5s `busy_timeout` (`withBusyTimeout`, open.go:133/158/170). `open.go:167-169` even states busy_timeout is "the root-cause fix." The two comments contradict each other. Consequently `writeMu` is now redundant for correctness (reviewer-flagged optional cleanup); it survives only as mild intra-queue write-contention shedding. | Rewrite the `storeWrite` doc to reflect the now-present busy_timeout; then either drop `writeMu` (and the `q.writeMu` field + `storeWrite` wrapper, calling PutItem/RecordFailure/ClearFailure directly) or keep it with an honest "intra-queue contention shedding, not a correctness requirement" comment. |
| D-02 | scan/run.go:92 (prodEnricher), 113 (runScan `enrich` param), 36 (Deps.Enrich) | retained-but-uninvoked seam (dead production wiring) | feature | `runScan`'s `enrich enricher` parameter is never read in the production body (only `forbiddingEnricher` test-asserts it is NOT called). `prodEnricher` builds a closure that is dropped. `enrich.Enrich`/`enrichDoc` (enrich.go:63/70) are preserved per AC-3 (deprecate-don't-delete) but their ONLY production caller is this dead seam — the worker calls `runSource` via `runSourceRetryable`, NOT `Enrich`. So AC-3's prose "now called by the worker" (AC-3; enrich.go:58) is inaccurate. | Either (a) accept as documented retention, or (b) prune `prodEnricher` + the `runScan` `enrich` param + `Deps.Enrich` wiring (keep `enrich.Enrich` as the preserved public entry exercised by its own tests). Correct the "called by the worker" prose in AC-3 and enrich.go:58. |
| S-01 | enrich.go:88-105 (enrichDoc switch) vs worker.go:213-230 (advanceForSource) | DRY — duplicated per-source lifecycle advance | feature | Both sites encode the same advance rule: "first engaging source → begin; a later engaging source after parsed → begin; success → parsed." If the state-machine advance decision changes, both must be edited in lockstep. Below the dupl-100 threshold so the linter will not flag it. | Extract a shared per-source-advance helper. Note the sync vs async paths differ (async adds retry/ledger), so the shared kernel is only the advance decision — extraction may be partial. Defensible as two change-reasons if left as-is. |
| S-02 | lease.go:59 (expired), 78 (renew) | YAGNI / unused-in-production | feature | `renew` has zero production callers (no worker requests more time — pure speculation). `expired` has zero production callers; its doc claims it is "checked on every dispatch tick," which is FALSE (`acquire` does its own inline lazy reclaim at lease.go:49). Both are test-only; the `unused` linter passes because `lease_test.go` references them. | Delete `renew` (YAGNI). For `expired`: delete, or fix the misleading doc and either wire it into dispatch or mark it explicitly as a future-use probe. |

## P3 — cosmetic / dead alias
| ID | File:Line | Pattern | origin | Description | Fix |
|----|-----------|---------|--------|-------------|-----|
| D-03 | queue.go:286 | dead type alias | feature | `type task = queueTask` ("alias preserving the derivation's vocabulary") has zero callers anywhere in the repo. | delete |
| D-04 | integration_pipeline_test.go:33 + qa_pipeline_acceptance_test.go:32 | t.Skip retirement stubs | feature | The two retired sync tests remain as ~50-line cited `t.Skip` stubs. INTENTIONAL documented transition (superseded by `integration_async_test.go`) — acceptable as-is; flagged only because a full deletion would be cleaner once async coverage is confirmed stable. | optional: delete the stub bodies (keep the transition note in commit/AC history). |

## AC reconciliation
| AC | Probe / intent | Status |
|----|----------------|--------|
| AC-3 (structural/negative) | `grep -rn 'func Enrich(' internal/enrich/` → ≥1 hit (enrich.go:63) — Enrich preserved (deprecate-don't-delete); proto/SDK/plugins/API unbroken | SATISFIED. The dead-seam finding D-02 is `origin: feature` but its smell (unused production wiring) does NOT match AC-3's intent (which requires Enrich to exist/not be deleted, and it does). AC-3 has no negative AC requiring Enrich to be CALLED, so D-02 does NOT trigger the BLOCK rule. The inaccurate "called by the worker" prose is a doc issue (D-02), not an AC breach. |
| AC-lease / AC-ledger / AC-states / AC-async / AC-2 | Concurrency + loop-safety + gates | All structurally intact; verified by green gates + substantive joint tests. No finding matches any negative-AC intent. |

## Concurrency correctness (the feature's whole point)
- Lease mutual-exclusion: `leaseMap.acquire` (lease.go:46) is atomic under `mu`; `TestQueue_LeaseNoDouble` asserts exactly one processing pass per item (Match ran once). ✓
- No data race: `go test -race ./...` exit 0. ✓
- Channel lifecycle: `feederWG.Wait()` before `close(work)` prevents send-on-closed; workers `range` the bounded channel and exit cleanly. ✓
- Start/Stop re-entrancy: `running` CAS + `cancel()`; `Stop` waits for feeders then workers. ✓
- Write safety: queue `writeMu` serializes queue writes; pool-wide 5s `busy_timeout` (open.go) is the root-cause fix for cross-writer (scan/API) lock contention. ✓

## Deletable estimate
~90 lines if the optional cleanup is taken (prodEnricher seam + writeMu/storeWrite + lease.renew + task alias + optional t.Skip scaffolding). ~0 mandatory deletions — the codebase is healthy and all gates are green.

## Recommended next step
Optional `/build async-enrichment-cleanup` task covering C-01 (the P1 `_stages` type-assertion fix — highest value) + D-01/D-02 (writeMu + dead seam). S-01/S-02/P3 are low-value and can ride along or be deferred. Non-blocking for the pipeline.
