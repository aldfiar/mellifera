# Coder Review — async-enrichment (Phase B1: async substrate)

- **Reviewer:** @wf-reviewer (independent re-verification, read-only)
- **Feature:** async-enrichment · **Branch:** `feature/async-enrichment` (off `main` @ `6507277`)
- **Stack:** Go 1.25.3, `CGO_ENABLED=0`, golangci-lint v1.64.8, modernc.org/sqlite, ffprobe 7.1.1
- **Coder scope:** T01–T09 (9/9 marked `[x]`). QA (QA-01/02) + Docs (DOCS-01/02) not yet run.
- **Checked:** 9 · **Passed:** 7 · **Flagged:** 2 (T08 golden, T05 carries the DEV-T08 settle gap) · **Failed:** 0

> **Headline:** The async substrate is correct, additive, and fully gate-green (independently
> re-verified, including `-race`). One load-bearing deviation — **DEV-T08-enriched-not-ready**
> (the AC-1 golden asserts `enriched`, not `ready`) — is real, well-diagnosed, and resolves with a
> small, sound fix. **Verdict: PROCEED-WITH-FIXES** (one P1). It does **not** block phase
> progression: the async model + provenance + parseTV-split + soft-fail + lease + ledger + states
> are all genuinely proven; the `enriched→ready` settle transition is proven by unit + table tests.

---

## 1. Independent build-gate re-verification (RUN, no EDIT)

| Gate | Command | Result |
|---|---|---|
| format | `gofmt -l .` | **clean** (the one flagged file `.claude/skills/mellifera-build/module-template/doc.go` is a pre-existing skill template, `git diff 6507277` = 0 lines — not introduced by this feature) |
| build | `CGO_ENABLED=0 go build ./...` | **exit 0** |
| vet | `CGO_ENABLED=0 go vet ./...` | **exit 0** |
| test | `CGO_ENABLED=0 go test ./...` | **all ok** (11 packages) |
| race | `CGO_ENABLED=1 go test -race ./...` | **all ok, exit 0** (concurrency correctness — the feature's whole point) |
| lint | `golangci-lint run ./...` (funlen/gocognit/gocyclo/lll/depguard/dupl) | **exit 0** |
| check.sh | `bash .claude/skills/mellifera-build/scripts/check.sh` | **`check.sh: OK`** |

All gates green, independently reproduced. `verify_passed: true` for the gate re-check.

---

## 2. Per-task validation (T01–T09)

Grounding: each spec read in full and cross-referenced against source + git diff.

### T01 — `internal/enrich/state.go` (ready/stale + exercise retry) — **PASS**
- `statusReady`/`statusStale` literals added (state.go:18-19); events `evSettled`/`evStale`/`evRehydrate` (state.go:33-35).
- `transitions` map has every required row: `enriched--settled-->ready`, `*--stale-->stale` (incl. `ready--stale`, `failed--stale`), `stale--rehydrate-->pending`, `stale--deleted-->deleted`; `failed--retry-->pending` preserved (state.go:62-88).
- `nextState` stays a pure table fn (no I/O, no `switch` arms — INV-pure-table honored). B5 illegality tested: `nextState(ready, parsed)` rejected (enrich_test.go:345-348). Full table test covers every legal + illegal transition (enrich_test.go:304-348).

### T02 — `internal/store/ledger.go` (enrichment_failures ledger) — **PASS**
- `FailureRow` DTO + `RecordFailure` (parameterized `INSERT…ON CONFLICT(item_id,plugin_id) DO UPDATE`, ledger.go:32-44) / `ClearFailure` (`DELETE`, idempotent) / `ListFailures` (`SELECT`, `sql.NullString` for nullable `reason`).
- No DDL (table pre-exists at `open.go:98`). Value-agnostic store (INV honored). Mirrors the `PutItem` upsert model. Parameterized placeholders only — status never interpolated.

### T03 — `internal/enrich/retry.go` (runSourceRetryable) — **PASS**
- Bounded exponential backoff (`backoff << (attempt-1)`), ctx-aware (`select` on `ctx.Done()`/`time.After` — **no `time.Sleep`**, verified by spec refactoring_checklist). Terminal classification (`exhausted`/`no_data`/none); success + unavailable/skipped short-circuit; ctx-cancel is the only hard abort.
- **D-T03 split** (signature is `(maxAttempts int, backoff time.Duration)` not `cfg QueueConfig`): **ACCEPT** — explicitly authorized by task_03 out_of_scope line 105 ("the coder MAY make that mechanical choice"). No new exported symbol.

### T04 — `internal/enrich/lease.go` (per-item in-memory lease map) — **PASS**
- `leaseMap` mutex-guarded (mirrors `plugin.Manager.mu`); `acquire`/`renew`/`expired`/`release`; one-lease-per-item invariant; **lazy expiry** (no sweeper goroutine); **no DB writes** for acquire/renew/expire (INV honored).
- `TestLeaseMap` + `TestLeaseMap_ConcurrentAcquire` cover the mutual-exclusion + lazy-reclaim invariants.

### T05 — `internal/enrich/queue.go` + `worker.go` + `enrich.go` driver (THE load-bearing task) — **PASS** (carries the DEV-T08 settle gap, adjudicated separately)
- `Queue`/`QueueConfig`/`Stats`/`NewQueue`; `Start` (CAS guard, bounded channel `Workers*4`, initial derive sweep), `Notify` (registerLib + deriveAsync), `Stop` (cancel → feederWG.Wait → close → wg.Wait), `Stats`. Derived-queue (no queue table — INV-derived-not-stored): `deriveLibrary` applies the full predicate (item exists + applicable + `queueable` (Enabled && `AuthMode != CLIENT`, D-Q1) + namespace absent + not in-ledger-cooldown).
- Per-item driver: lease → reconstruct base from persisted doc (S7, no re-probe) → `driveSources` serial by Priority → `runSourceRetryable` → `applyOutcome` (ClearFailure on success-after-row / RecordFailure on terminal) → `settle` → `persistItem`. Soft-fail honored; only `ctx.Done()` hard-aborts (`hardFail`→`failed`, re-derived later).
- `reengage` exercises `failed→pending` (retry) and `stale→pending` (rehydrate). `Enrich` preserved verbatim (enrich.go:63, deprecate-don't-delete, AC-3).
- **D-T05 writeMu** + **D-T05-2 DSN busy_timeout**: see §4 adjudications (both ACCEPT).
- Symbol budget: enrich exported = **7** (authoritative check.sh count: `Enrich`, `NewQueue`, `Deps`, `Queue`, `QueueConfig`, `Result`, `Stats`) — matches "3→7" claim, ≤8 GREEN.

### T06 — `internal/scan/run.go` (enqueue, drop inline enrich) — **PASS**
- `persist` no longer calls enrich inline; `PutItem(status='pending')` with the base doc (parsed+ffprobe for S7 reconstruction); **post-drain** `notify(ctx, libraryID)` only on clean stream close (`!ok` branch) — not on ctx cancel. `Run` is unchanged as the sole api entry.
- `scan.Result` shape unchanged (Discovered/Persisted/Warnings/StartedAt/FinishedAt) — AC-3.
- **DEV-T06-preserve-prior**: re-scan of an *unchanged* file preserves prior status (avoids regressing a ready/enriched item to pending — sound, since the queue only settles `enriched→ready`). **DEV-T06-retained-seam**: the serial `enricher` seam stays wired (Run→prodEnricher→runScan) as the "inline enrich is gone" assertion vehicle; `persist` has a clean no-enrich signature. Both ACCEPT.
- `stale` change-detection: `baseChanged` compares canonical-JSON of identity fields (parsed+ffprobe); minimal R-stale basis, documented.

### T07 — `cmd/mellifera/main.go` (construct + Start queue, wire Notify, Stop, env knobs) — **PASS**
- `enrich.NewQueue(scanDeps.Enrich, cfg.enrich)` + `Start(ctx)` **before** `srv.ListenAndServe` (INV-start-before-serve). `scanDeps.Notify` closure wires `enrichQueue.Notify`.
- **DEV-T07-notify-ctx**: the closure substitutes the **process ctx** for the per-request scan ctx (correct — the request ctx cancels when the handler returns and would abort the feeder before draining; the process ctx outlives the request, cancelled only by SIGINT/SIGTERM). ACCEPT.
- Stop order correct: HTTP → enrich pool → plugins → store (`st.Close` via defer). Env knobs (`envInt`/`envDuration`) read with §4.4 defaults + warning fallback; only admin token is fail-fast. `config_test.go` added (spec "recommended").

### T08 — `integration_async_test.go` (AC-1 async golden) — **FLAG** (DEV-T08-enriched-not-ready)
- The golden is real and thorough: builds base-scanner + tv-parser binaries, runs a temp server + free port, generates a real media fixture via ffmpeg, drives real ffprobe over it. Asserts AC-1 (sources.tv-parser + `_provenance` naming tv-parser + `_view`/`_stages`), AC-1 parseTV split (`asyncAssertParseTVSplit`), AC-6 soft-fail (corrupt file stays pending), AC-states (`?status=` filter).
- **BUT** it asserts `status='enriched'` (integration_async_test.go:103, 144, 231-232), **not** `status='ready'` as AC-1's Verify probe and AC-states(b) literally require. Root cause verified independently (see §4.1): the seeded `tv` config's `tmdb` is `auth_mode:SERVER` → queueable per D-Q1 → unloaded in B1 → `outcomeUnavailable` → no namespace + no ledger → `allSourcesTerminal` (worker.go:261) returns false → item stalls at `enriched`. The coder's diagnosis is exactly correct.
- → **FLAG**, not FAIL: the async substrate is fully proven; the `enriched→ready` settle transition IS exercised (7 unit-test sites in `queue_test.go` seed a succeeding fake tmdb + the `nextState` table). The e2e-vs-unit gap is the single acceptance seam. Adjudication + A/B recommendation in §4.1.

### T09 — gates green + structural/additive probes — **PASS** (with note)
- Full gate green, independently re-verified (§1). 2 obsolete sync tests (`TestIntegrationPipeline`, `TestQA_PipelineAcceptanceReDerivation`) retired as cited `t.Skip` stubs with clear "superseded by TestIntegrationAsyncPipeline" citations. Race-harness hardening (DEV-T09) is a benign, test-only thread-safety fix (log dump moved after `srv.Wait()` joins the pipe-copier goroutines); 2 latent failure-path log reads noted by the coder are not triggered in a green run. ACCEPT.

---

## 3. Acceptance re-derivation (golden rule — independently re-derived)

| AC | Result | Evidence |
|---|---|---|
| **AC-2** gates | **PASS** | §1 — independently re-run, all green |
| **AC-3** additive | **PASS** | `git diff 6507277 -- proto/ internal/api/` = **0 lines** (UNCHANGED); `enrich.Enrich` preserved (enrich.go:63); `scan.Result` shape unchanged; `go.mod`/`go.sum` = **0 diff** (no new dep); no DDL; pure-Go no CGO |
| **AC-async** non-blocking scan | **PASS** | scan returns after persist (items `pending`); `notify` fires only post-drain; pool drains async; timing asserted in the golden |
| **AC-lease** mutual exclusion | **PASS** | one-lease-per-item (lease.go), lazy expiry, no DB writes; `TestQueue_LeaseNoDouble` + `TestLeaseMap_ConcurrentAcquire`; `enrichment_failures` not written per-claim (only on terminal) |
| **AC-ledger** loop-safety + reset + restart | **PASS** | retry→backoff→`exhausted`→ledger→cooldown→derivation-skip; reset-on-success (`ClearFailure`); restart re-derives pending + skips cooldown (`TestQueue_RestartResume`, `TestQueue_ResetOnSuccess`, `TestQueue_RetryToLedger`) |
| **AC-states** retry + ready/stale | **PARTIAL** | `failed→pending` retry exercised by the queue; `ready`/`stale` added + fully table-tested (legal + illegal) + unit-tested; **BUT `enriched→ready` not reached e2e** (DEV-T08) |
| **AC-1** async golden | **FLAG** | golden PASSES and proves the full async model + provenance + parseTV-split + soft-fail + states with **real subprocesses + ffprobe + HTTP**, but settles to `enriched`, not the `ready` its Verify probe asserts |

**Acceptance audit:** 5/7 ACs fully met; AC-states and AC-1 are met **except** the e2e `ready` terminal, which is the single DEV-T08 gap (transition covered by unit + table tests). Not "ACCEPTANCE NOT MET" in the blocking sense — the feature is functional and the gap is scoped, documented, and hedged by the delegation. Route the P1 fix (§4.1, §6).

---

## 4. Adjudication of flagged deviations

### 4.1 DEV-T08-enriched-not-ready (P1 — load-bearing) → **Recommend Option B, non-blocking**

**Root cause (independently confirmed):** the seeded `tv` module config (`internal/module/registry.go:58-74`) declares three sources:
- `tv-parser` — empty `AuthMode` → queueable, **loaded** → succeeds → namespace written.
- `kinopoisk` — `auth_mode:CLIENT` → excluded by `queueable()` (D-Q1).
- `tmdb` — `auth_mode:SERVER` → **queueable**, but **unloaded in B1** → `runSource` returns `outcomeUnavailable` → `runSourceRetryable` returns `ledgerStatus=""` (retry.go:57, "not a failure") → no namespace + **no ledger row**.

At settle, `allSourcesTerminal` (worker.go:261-271) sees tmdb as `!hasNamespace && !inCooldown` → returns **false** → the `enriched→ready` advance never fires → items deterministically stall at `enriched` (the golden logs `ready=0`, integration_async_test.go:103-104). The T05 unit tests masked this by seeding a **succeeding** fake tmdb (`queue_test.go:234`, 7 `statusReady` assertions) — confirmed.

**A/B recommendation: Option B (the settle-predicate fix), as a non-blocking P1.**

- Why **not** just accept `enriched` (A): AC-1's Verify probe and AC-states(b) literally assert `status='ready'`. Per the golden-test rule, a green test asserting a *weaker* terminal than the spec is the "intent unmet behind a passing test" pattern the verify-probe gate exists to catch. The delegation's "enriched/ready" hedge makes (A) *defensible* but leaves the spec's literal promise unproven e2e.
- Why **B** is sound: treating a source that *ran-but-produced-nothing* (unavailable/skipped this run) as terminal-at-settle is semantically coherent — in B1 every item settles to `ready` after tv-parser succeeds; when B3 loads tmdb, derivation re-derives `ready` items (tmdb namespace absent + not in cooldown) and tmdb runs on the `ready` item without regressing it (verified by tracing `reengage`→`driveSources`→`settle`). ~10 lines, no new dep, no DDL.
- **Does it block PROCEED? No.** The substrate is fully functional; `ready` is unit + table tested; the delegation hedged; the async model is genuinely proven. PROCEED-WITH-FIXES — route the fix before B2/B3 so the `enriched→ready` transition is proven e2e with real subprocesses. Concrete fix hint in §6 (P1-1).

### 4.2 D-T05-2 busy_timeout via DSN — **ACCEPT** (correct root-cause fix)
`withBusyTimeout` (open.go:170-175) appends `_pragma=busy_timeout(5000)` to the DSN, applied at `sql.Open` (open.go:133). Grounding is correct: `busy_timeout` is **per-connection** (modernc default 0); `database/sql` pools connections so `ExecContext` reaches only one; the DSN is the only way every pooled connection inherits it. WAL is persistent on the DB file (set via `ExecContext`, reaches all conns). This is the correct, sufficient fix for the concurrent-writer "database is locked" the async pool introduces. Strictly better than the per-call `ExecContext` approach.

### 4.3 D-T05 writeMu — **ACCEPT** (now redundant, harmless)
With busy_timeout set pool-wide, `writeMu` (queue.go:108, `storeWrite` 472-476) no longer carries the concurrency load — it serializes only the queue's *own* writes against each other. It is now belt-and-suspenders (a no-op under low contention; prevents the queue from racing its own terminal-write + status-advance on one item). **Harmless**; optionally removable in a later cleanup, but leaving it has no cost. Not a defect.

### 4.4 Test retirements (TestIntegrationPipeline, TestQA_PipelineAcceptanceReDerivation) — **ACCEPT**
Both retired as cited `t.Skip` stubs with unambiguous "superseded by TestIntegrationAsyncPipeline" citations explaining the inverted synchronous-at-scan-return premise. Coverage is subsumed by the async golden (provenance, parseTV split, soft-fail, `?status=` filter all asserted there). **Coverage note:** the independent QA re-derivation coverage these provided is deferred to the QA phase (QA-01 owns it) — acceptable, not lost. No provenance/parseTV/soft-fail gap.

### 4.5 T05 unit-test fake tmdb (the masking seam) — **ACCEPT** (legitimate test seam)
The succeeding-fake-tmdb in `queue_test.go` is a correct use of the `metadataResolver` R8 second-impl seam — it isolates and exercises the `enriched→ready` settle transition in unit scope. It *masked* the e2e gap, but that gap is now surfaced and adjudicated (§4.1). It is not a test-quality problem; the unit coverage of `ready` is genuine and valuable. ACCEPT.

### 4.6 Minor deviations — **ACCEPT**
- **structpb import (S7 reconstruct):** `worker.go` imports `google.golang.org/protobuf/types/known/structpb` for `reconstructBase`/`toStruct` — within task_05 `allowed_imports` (proto types are budget-exempt); sound.
- **Race-harness hardening (DEV-T09):** benign test-only thread-safety fix; ACCEPT (see T09).
- **T01 `ready--deleted` row:** present (state.go:82); tested (enrich_test.go:314).
- **T03 (maxAttempts,backoff) split:** spec-blessed (task_03 out_of_scope line 105); ACCEPT.

---

## 5. Non-negotiable constraints — all honored

| Constraint | Result |
|---|---|
| ADDITIVE: `proto/` + `internal/api/` diff vs `6507277` | **0 lines** (UNCHANGED) ✓ |
| `enrich.Enrich` preserved | yes (enrich.go:63) ✓ |
| `scan.Result` shape unchanged | yes ✓ |
| No DDL migration | yes (`enrichment_failures` + `items.status` pre-exist from Phase A) ✓ |
| No new dependency | yes (`go.mod`/`go.sum` = 0 diff; stdlib `context`/`sync`/`time`/`atomic` + existing proto/sdk) ✓ |
| Pure-Go, no CGO | yes (`CGO_ENABLED=0` build green; no `import "C"`) ✓ |
| ≤8 symbols/pkg | enrich = **7** (authoritative check.sh count), store adds **+1** (FailureRow) → GREEN ✓ |
| No `reflect` | yes (only in comments; depguard denies it) ✓ |
| No DI framework | yes (flat constructor wiring in main.go; no DI container) ✓ |
| Parameterized SQL | yes (`?` placeholders in ledger.go; status never interpolated) ✓ |
| `exec.Command` arg-slice only | n/a for B1 (no new subprocess — reuses base-scanner/tv-parser); existing pattern unchanged ✓ |
| Apache-2.0 headers | yes (all new files) ✓ |
| Core media-type-agnostic | yes (no `media_type` branching in core; image/TMDB are B2/B3 plugins) ✓ |
| `-race` clean | yes (§1) ✓ |

---

## 6. Gate + overall verdict

**Gate: PROCEED-WITH-FIXES** — Approved to advance to health-check (@wf-auditor) and then QA (QA-01/02) + Docs, **with one P1 fix task routed to @wf-coder**. Nothing is BLOCKING.

### P1 findings (route to @wf-coder)

**P1-1 — DEV-T08-enriched-not-ready: make `ready` reachable e2e (Option B settle-predicate fix).**
- **Expected:** AC-1 golden reaches `status='ready'` post-drain (matches AC-1 Verify probe + AC-states(b)).
- **Actual:** items stall at `status='enriched'` because the seeded `tmdb` (SERVER, queueable, unloaded in B1) is `outcomeUnavailable` → no namespace + no ledger → `allSourcesTerminal` returns false.
- **File:** `internal/enrich/worker.go:261` (`allSourcesTerminal`); settle call site `internal/enrich/queue.go:431-443`.
- **Fix hint (~10 lines):** count a queueable source as terminal-at-settle not only when `hasNamespace || inCooldown`, but also when its most-recent `_stages` entry records `status: "unavailable"` or `"skipped"` (i.e., it was *attempted this run* and produced no work — distinct from a source never yet attempted). Consult the existing `appendStage` data (worker.go:136-150). Avoid polluting the ledger with soft terminals. Update the `ready` doc in `state.go` + `queue.go` to "all queueable sources done / in-cooldown / attempted-and-empty", then flip the golden assertion `enriched`→`ready` (integration_async_test.go:103, 144, 231-232) and the poll helper `asyncAllEnriched`→`asyncAllReady`. Confirm B3 forward-compat: a later-loaded tmdb re-derives `ready` items and runs without regressing (verified by trace). **Does not block** the current phase.

### Info / non-blocking notes (no action required to proceed)
- D-T05 `writeMu` is now redundant given pool-wide busy_timeout — optional future cleanup.
- DEV-T09 left 2 latent failure-path log reads (integration_test.go:217, qa_acceptance_test.go:349) that race only if a server fails to start — not triggered in green runs; track as a latent test-infra item.
- gofmt flags `.claude/skills/mellifera-build/module-template/doc.go` — a pre-existing skill template, **not** part of this feature (0 diff vs `6507277`); out of scope here.

---

## 7. Behavioral summary
- **Tests:** all packages green (`go test ./...` + `go test -race ./...`).
- **Error handlers:** ctx-cancel hard-fail (`hardFail`→`failed`, retryable) verified; soft-fail per-source verified; ledger written only on terminal.
- **Edge cases:** corrupt/non-TV file stays pending (AC-6); unavailable/skipped sources never retry or ledger; unchanged re-scan preserves status; changed re-scan → `stale`; lease lazy-reclaim on dead holder.
- **Refactoring audit:** `Enrich` preserved (1 hit, enrich.go:63); no stale serial-inline call in `scan.persist`; proto/api untouched; no orphaned imports.
