# Task 05 — internal/enrich/queue.go + enrich.go driver + doc.go: the async derived-queue (THE load-bearing task)

- **Type:** coder
- **Step:** 5 + 6 (Outline) — `queue.go` CREATE + `enrich.go` MODIFY (factor the per-item driver) + `doc.go` MODIFY (document +4 exported)
- **Seams:** S4 (Queue/workers/lease — dispatch half), S7 (base reconstruct), S8 (AuthMode filter), S3 (dispatch wires retry)
- **AC trace:** AC-1, AC-lease, AC-ledger, AC-states, AC-2
- **Project scope:** `.` (root; MODIFY + CREATE in `internal/enrich`)
- **Deps:** Task 01 (`ready`/`stale`/`settled` transitions), Task 02 (`store.RecordFailure`/`ClearFailure`/`ListFailures`), Task 03 (`runSourceRetryable`), Task 04 (`leaseMap`)
- **Estimated LOC:** ~380 (M-L) — `queue.go` is the one to watch <500; derivation/dispatch/worker are split across `queue.go`+`lease.go`+`retry.go` (R-8)

## behaviors

- **B1** `type QueueConfig struct { Workers int; MaxAttempts int; LeaseTTL, Backoff, ExhaustedCool, NoDataCool, CoolCap time.Duration }` — zero-value = §4.4 defaults (Workers 4, MaxAttempts 3, LeaseTTL 60s, Backoff 2s, ExhaustedCool 7×24h, NoDataCool 30×24h, CoolCap 365×24h). | ac: AC-1, AC-ledger | kind: normal
- **B2** `type Stats struct { Pending, InFlight, Done, Failed int }` — observability. | ac: AC-2 | kind: normal
- **B3** `type Queue struct { /* unexported: store, plugins, modules, leaseMap, cfg, now, cancel, wg */ }` + `func NewQueue(deps Deps, cfg QueueConfig) *Queue` — construct over the Phase A collaborators (`Deps` reused, `enrich.go:34`). Fills zero-valued `cfg` fields with §4.4 defaults. Returns a Queue NOT yet running (no goroutines). | ac: AC-1 | kind: normal
- **B4** `(*Queue) Start(ctx context.Context) error` — launch `cfg.Workers` goroutines over a bounded channel; (re)derive the pending set across ALL libraries from `items` + the ledger and feed the channel. On `ctx.Done()`/`Stop` workers exit cleanly (in-flight leases expire lazily; pending work survives in `items` — re-derived on next `Start`). | ac: AC-ledger(c), AC-1 | kind: normal
- **B5** `(*Queue) Notify(ctx context.Context, libraryID int64)` — signal that a scan persisted new/changed items; (re)derive the pending set for that library and feed the channel. Idempotent: already-done / in-cooldown pairs are not re-added. Called by `scan` after it persists items `pending` (replaces the inline enrich call). | ac: AC-async, AC-1 | kind: normal
- **B6** `(*Queue) Stop()` — drain + stop the pool; release leases; no worker goroutines remain. In-memory queue/leases discarded (pending work survives in `items` + ledger). | ac: AC-1 | kind: normal
- **B7** `(*Queue) Stats() Stats` — return current counters. | ac: AC-2 | kind: normal
- **B8 (DERIVATION — the §4.4 single-source-of-truth)** a `(item, plugin)` task is pending iff: the item row EXISTS AND the source is applicable to `item.module` (`module.MetadataSources[].PluginID == plugin`) AND `binding.Enabled` AND **`binding.AuthMode != "CLIENT"`** (D-Q1 — empty/local like tv-parser + SERVER are queued; only CLIENT excluded) AND `document.sources.<plugin>` is ABSENT (not already done) AND NOT `ledger(item,plugin)` within cooldown. Derivation reads `items` (status set) + `ListFailures` (cooldown) + the document namespaces; it NEVER adds a queue/claim table. | ac: AC-1, AC-ledger | kind: normal
- **B9 (LEASE-BEFORE-WORK)** the dispatch claims the item's lease via `leaseMap.acquire` BEFORE pulling/processing work; while a lease is held NO second worker is dispatched for that item (serialize-within-item, parallelize-across-items). Expired leases are reclaimed lazily on the derive tick (`leaseMap.expired`). | ac: AC-lease | kind: normal
- **B10 (BASE RECONSTRUCT — D-Q2 / S7)** the worker reconstructs a minimal `*scannerv1.IdentifyResult` from the PERSISTED document (Parsed from `doc["parsed"]`, MediaType from the item row / module) — NO re-probe of the file. Sufficient for `tv-parser.Match` (reads parsed/filename). | ac: AC-1 | kind: normal
- **B11 (DRAIN by priority)** for each queueable source in `orderedSources` priority order, the worker calls `runSourceRetryable` (Task 03); on success it applies the namespace+provenance (existing `applyContribution`, `enrich.go:148`) + `store.ClearFailure` (reset-on-success); on terminal `ledgerStatus != ""` it calls `store.RecordFailure(status, reason, attempts, nextEligible)` (cooldown computed from the §4.4 doubling schedule). | ac: AC-ledger, AC-1 | kind: normal
- **B12 (ADVANCE state)** when an item's queueable sources all reach a terminal state (done or terminal-failure-in-cooldown — derivation finds no pending work for it), the worker advances `enriched --settled--> ready` via `nextState` and `PutItem`s the advanced status + document. A cancelled context yields `* --failed--> failed` (`enrich.go:190` `hardError`) and the queue later drives `failed --retry--> pending` (Task 01). | ac: AC-states, AC-1 | kind: normal
- **B13 (COOLDOWN schedule)** `nextEligible = now + cooldownFor(priorAttempts+1)` where the schedule doubles `ExhaustedCool` (7d→14d→28d…) capped at `CoolCap` (365d); `no_data` uses `NoDataCool` (30d) without doubling. Owned HERE (enrich), NOT in store (INV-value-agnostic-store). The prior `attempts` is read from the `ListFailures` snapshot. | ac: AC-ledger | kind: edge
- **B14 (SOFT-FAIL — AC-6 extended to the queue)** a source's terminal failure / an unresolvable plugin / a namespace violation NEVER aborts the queue or the item's other sources — it is recorded (ledger / warnings) and the item advances to its furthest-valid state. Only `ctx.Done()` is a hard abort. A crashing enricher subprocess is observed as a failed RPC; the worker soft-fails/requeues that source; the queue never restarts plugins (`plugin.Manager` owns that, `lifecycle.go:46,172`). | ac: AC-1 | kind: error
- **B15 (Enrich PRESERVED — deprecate-don't-delete)** `func Enrich(...)` (`enrich.go:56`) stays exported and UNCHANGED on its signature — now called by the worker (worker-internal) AND still available for sync/test use. The per-item chain body is factored so the worker reuses it. | ac: AC-3 | kind: normal
- **B16 `doc.go` documents +4 exported symbols** (enrich 3 → 7: `Queue`,`QueueConfig`,`Stats`,`NewQueue`) + the async model (derived queue, per-item leases, retry/backoff, ledger, ready/stale) + INV-downward (enrich STILL imports neither `api` nor `scan`). | ac: AC-2 | kind: normal

## invariants

- **INV-derived-not-stored:** a `(item,plugin)` task is pending iff the B8 predicate holds. There is NO queue/claim/lease table. `items` + document namespaces + `enrichment_failures` ARE the queue (§4.4 single-source-of-truth; conventions.md anti-pattern: a separate `enrichment_jobs` table is FORBIDDEN).
- **INV-one-lease-per-item:** at most one live lease per `item_id` (Task 04 primitive; the dispatch honors it — `acquire` before work, `release` after). Serialize-within-item, parallelize-across-items.
- **INV-bounded-pool:** `cfg.Workers` goroutines (default 4) over ONE bounded channel — `<-chan` + `for range` (mirror `scan`'s stream drain `run.go:117`). NEVER unbounded goroutine spawn per item.
- **INV-rare-ledger-writes:** `RecordFailure` is called ONLY on terminal failure (`exhausted`/`no_data`); `ClearFailure` ONLY on success-after-ledger. NEVER per-claim, NEVER per-success. The hot path is: the document `PutItem` (happens anyway) + a one-row `ClearFailure` delete on recovery.
- **INV-D-Q1:** queueable iff `AuthMode != "CLIENT"` (NOT `== "SERVER"` — §4.4 literal refined by D-Q1; tv-parser has empty AuthMode and MUST be queued). evidence: `internal/module/registry.go:60-63` (tv-parser seeded with no `auth_mode`), `:66` (kinopoisk CLIENT — excluded), `:70` (tmdb SERVER — queued).
- **INV-D-Q2:** the worker reconstructs the base from the persisted document — NO re-probe (a re-Identify is a B3 fallback). The persisted `doc["parsed"]` + the item row's `media_type` suffice for tv-parser.
- **INV-downward:** `internal/enrich` imports ONLY `store`,`plugin`,`module`,`pkg/sdk`, generated protos, stdlib. It NEVER imports `api` or `scan` (scan→enrich direction preserved). `Notify` is called BY scan (scan imports enrich), never the reverse.
- **INV-ctx-hard-abort:** `ctx.Done()` is the only hard failure path (`enrich.go:68,190`); workers honor `ctx.Done()` and exit cleanly on `Stop`.
- **INV-cooldown-owned-here:** the §4.4 doubling schedule lives in `internal/enrich` (a pure helper over `ListFailures`); `store` receives a computed `nextEligible`.
- **INV-furthest-valid:** under soft-fail the item advances to the furthest state its successful sources justify (carried from Phase A `enrichDoc`).
- **INV-symbol-budget:** enrich exported 3 → 7 (`Queue`,`QueueConfig`,`Stats`,`NewQueue` added). ≤8 WARN / ≤12 FAIL — GREEN. The derivation, dispatch loop, per-item worker driver, cooldown helper, base-reconstruction helper are UNEXPORTED.
- **INV-file-budget:** `queue.go` <500 lines. If derivation/dispatch/worker together approach 500, split the per-item worker body into a separate unexported file (the lease/retry concerns are already separate files — Tasks 03/04). `check.sh` + golangci funlen/gocognit gate it.

## precondition

Tasks 01-04 landed: `statusReady`/`statusStale`/`evSettled`/`evStale`/`evRehydrate` + the `enriched--settled-->ready` transition (T01); `store.FailureRow`/`RecordFailure`/`ClearFailure`/`ListFailures` (T02); `runSourceRetryable` (T03); `leaseMap`/`acquire`/`expired`/`release` (T04). Phase A `enrich.go` (`Enrich:56`,`enrichDoc:63`,`orderedSources:111`,`applyContribution:148`,`hardError:190`,`Deps:34`,`Result:42`,`metadataResolver:29`,`now:21`), `chain.go` (`runSource:49`), `state.go` (`nextState`,`advance`) exist. `store.PutItem`/`QueryItems`/`GetItem` exist. `plugin.Manager.MetadataSource` (`manager.go:215`) is the production resolver. `module.Registry.Get/List` (`registry.go:164,174`) resolve modules; `module.MetadataSourceBinding.{PluginID,CapabilityID,Priority,Enabled,AuthMode}` (`registry.go:113-120`) drive derivation.
- evidence: `internal/enrich/enrich.go:56,63,111,148,190,34,42,29,21`; `internal/enrich/chain.go:49`; `internal/enrich/state.go:74`; `internal/store/items.go:42,74,88`; `internal/plugin/manager.go:215`; `internal/module/registry.go:113-120,164,174`.
- evidence (derivation predicate): `contracts.md §Derivation contract`; `architecture.md:1011-1058`.

## postcondition

`internal/enrich/queue.go` exists (`Queue`,`QueueConfig`,`Stats`,`NewQueue` + unexported derivation/dispatch/worker/cooldown/base-reconstruct helpers); `enrich.go`'s per-item chain body is factored so the worker reuses it AND `Enrich` remains exported/unchanged; `doc.go` documents 7 exported symbols + the async model + INV-downward. `queue_test.go` is table + concurrency driven via in-package fakes (a fake resolver + a real temp `*store.Store`): derivation (queueable predicate incl. D-Q1 CLIENT-exclusion + cooldown-skip + namespace-done-skip), lease no-double + lazy reclaim, retry→ledger, restart re-derive-skips-cooldown, base reconstruction from a persisted doc, and a full drain-to-ready. `go test -race ./internal/enrich/...` green. enrich 3→7 exported (≤8).

## test_seed

In-package fakes (R8): a fake `metadataResolver` (`enrich.go:29` seam) returning a scripted `sdk.MetadataSource`, PLUS a real temp `*store.Store` (`store_test.go` harness) so the ledger/derivation read real rows. Cases:
- **derivation/D-Q1 (S8):** seed a `tv` module (tv-parser empty AuthMode, kinopoisk CLIENT, tmdb SERVER) + items with a base doc; call derive → tv-parser + tmdb pairs are pending, kinopoisk is NOT (CLIENT excluded). Assert the pending set.
- **namespace-done-skip:** an item whose `doc["sources"]["tv-parser"]` exists → tv-parser NOT re-derived for it.
- **cooldown-skip (S1 joint, AC-ledger(a)):** `RecordFailure` a row for `(item, tv-parser)` with `nextEligible=now+7d` → derive SKIPS that pair; advance the clock past eligibility (override `now`) → it re-derives.
- **lease no-double (S4 joint, AC-lease):** `Workers=2`, one item; both workers start; assert exactly one processes the item (the other is blocked by `leaseMap.acquire`); after the first releases + the item re-enters, the second may take it. Run under `-race`.
- **lazy reclaim:** acquire a lease; advance clock past TTL; `expired` returns true; a new acquire succeeds.
- **retry→ledger (S3 joint, AC-ledger(a)):** fake `tv-parser` RPC fails `MaxAttempts`× → dispatch calls `RecordFailure` with `status="exhausted"`, `attempts=MaxAttempts`, `nextEligible≈now+ExhaustedCool`; the pair is NOT re-derived (cooldown). Assert the row via `ListFailures`.
- **reset-on-success (AC-ledger(b)):** pre-seed a ledger row; fake succeeds on retry → `ClearFailure` deletes it; `ListFailures` returns 0 for the pair.
- **restart-resume (AC-ledger(c)):** `Start` derives pending + drains to ready; `Stop`; seed a fresh exhausted row within cooldown; `Start` again → pending re-derived from `items`, the cooldown pair SKIPPED (no loop).
- **base reconstruct (S7):** persist an item whose `doc["parsed"]` carries season/episode; the worker's reconstructed `*IdentifyResult` drives `tv-parser.Match` successfully (no re-probe / no file access).
- **drain-to-ready (AC-1 micro):** one item, tv-parser succeeds → status advances `pending → parsed → enriched → ready`; `sources.tv-parser` + `_provenance` present; `Stats().Done == 1`.

## callers_to_update

- `internal/enrich/doc.go` — MODIFY: document the 4 new exported symbols + async model + INV-downward (fold of Outline step 6). evidence: `internal/enrich/doc.go:1-47` (the `# Public API (3 symbols)` block at `:17` becomes 7).
- `internal/enrich/enrich.go` — MODIFY: factor the per-item chain body so the worker reuses it (e.g. the worker calls the factored `enrichDoc`/`runSourceRetryable`); keep `func Enrich(...)` (`enrich.go:56`) exported + signature-unchanged. The `Enrich` doc comment notes it is now "worker-internal + preserved for sync/tests". evidence: `internal/enrich/enrich.go:56-106`.
- (NO change to `chain.go`, `state.go`, `provenance.go` beyond what Task 01 already did — those are consumed.)

## allowed_imports

- `context`, `fmt`, `sort`, `sync`, `time` (stdlib)
- `github.com/mellifera/mellifera/internal/store`
- `github.com/mellifera/mellifera/internal/plugin`
- `github.com/mellifera/mellifera/internal/module`
- `github.com/mellifera/mellifera/pkg/sdk`
- `github.com/mellifera/mellifera/proto/mellifera/scanner/v1` (scannerv1 — `IdentifyResult` for base reconstruction)
- `github.com/mellifera/mellifera/proto/mellifera/metadata/v1` (metadatav1 — only if the worker needs RPC request types directly; prefer reusing `runSource` which already imports it)
- `github.com/mellifera/mellifera/proto/mellifera/common/v1` (commonv1 — only if constructing an `AuthContext` placeholder; Phase A passes empty — B1 does NOT inject secrets)

## allowed_categories

- `stdlib`

## test_exclusions

- `QueueConfig` and `Stats` are data structs — covered via the `Queue` tests (populated/consumed), no standalone test.
- `Queue`/`NewQueue`/`Start`/`Stop`/`Notify`/`Stats` ARE logic — table + concurrency tests required (check.sh mandates a co-located test per exported symbol: `Queue`,`QueueConfig`/`Stats`/`NewQueue` all exercised).
- The derivation, cooldown, base-reconstruct helpers ARE logic — covered via the `Queue` table tests above (they are unexported but behavior-bearing).

## negative_examples

- DO NOT create a `queue_items`/`enrichment_jobs`/`enrichment_leases` table (INV-derived-not-stored; conventions.md anti-pattern).
- DO NOT write the ledger per-claim or per-success (INV-rare-ledger-writes).
- DO NOT re-probe/re-Identify the file in the worker (INV-D-Q2 — reconstruct from the persisted doc).
- DO NOT queue `AuthMode == "CLIENT"` sources (INV-D-Q1).
- DO NOT import `api` or `scan` (INV-downward).
- DO NOT spawn unbounded goroutines (INV-bounded-pool — bounded channel + `cfg.Workers`).
- DO NOT restart plugins from the queue (`plugin.Manager` owns subprocess restart, `lifecycle.go:46,172`).
- DO NOT change `Enrich`'s signature or remove it (AC-3 — deprecate-don't-delete).
- DO NOT own the status set in `store` (enrich owns it; store is value-agnostic).
- DO NOT delete `runSource`/`enrichDoc`/`applyContribution`/`orderedSources` — the worker REUSES them.

## existing_code_snapshot

```go
// internal/enrich/enrich.go:34-46 (Deps + Result — REUSED as the Queue's collaborators)
type Deps struct { Store *store.Store; Plugins *plugin.Manager; Modules *module.Registry }
type Result struct { Stages, Succeeded int; Warnings []string }
// internal/enrich/enrich.go:56-58 (Enrich — PRESERVED, signature unchanged)
func Enrich(ctx context.Context, deps Deps, mod module.Module, doc map[string]any, base *scannerv1.IdentifyResult) (map[string]any, string, Result, error) {
	return enrichDoc(ctx, deps.Plugins.MetadataSource, mod, doc, base)
}
// internal/enrich/enrich.go:111 (orderedSources — REUSED for priority drain)
func orderedSources(bindings []module.MetadataSourceBinding) []module.MetadataSourceBinding
// internal/enrich/enrich.go:148 (applyContribution — REUSED to commit a source's namespace+provenance)
func applyContribution(doc map[string]any, sr sourceResult)
// internal/enrich/enrich.go:190 (hardError — the ctx-cancel hard-fail path)
func hardError(doc map[string]any, err error) error
// internal/enrich/doc.go:17 (# Public API (3 symbols) — becomes 7)
```
The forward contract for the new symbols is `contracts.md §Queue / QueueConfig / Stats / NewQueue / Start / Stop / Notify / Stats`.

## contract_test_scope

- **joint (S4):** `internal/enrich.Queue dispatch -> leaseMap` | assert: drain-to-ready; lease no-double (two workers, one item → exactly one processes); lazy expiry reclaims a dead lease. Verified in `queue_test.go`.
- **joint (S7):** `internal/enrich worker -> reconstructed *IdentifyResult` | assert: `tv-parser.Match` succeeds from the persisted `doc["parsed"]` (no re-probe). Verified in `queue_test.go` base-reconstruct case.
- **joint (S8):** `internal/enrich derivation -> module.MetadataSourceBinding.AuthMode` | assert: CLIENT excluded; empty (tv-parser) + SERVER (tmdb) queued. Verified in `queue_test.go` D-Q1 case.
- **joint (S3 dispatch half):** `internal/enrich dispatch -> runSourceRetryable -> store ledger` | assert: fail→exhausted→RecordFailure→derivation-skip; success→ClearFailure. Verified in `queue_test.go` retry/reset cases.

## scope_boundary

- CREATE `internal/enrich/queue.go` (`Queue`,`QueueConfig`,`Stats`,`NewQueue` + unexported derive/dispatch/worker/cooldown/base-reconstruct).
- MODIFY `internal/enrich/enrich.go` (factor the per-item chain body for worker reuse; preserve `Enrich`).
- MODIFY `internal/enrich/doc.go` (document 7 symbols + async model + INV-downward).
- CREATE `internal/enrich/queue_test.go` (table + concurrency, in-package fakes + real temp store).

## out_of_scope

- `internal/scan` enqueue (Task 06) and `cmd/mellifera` wiring (Task 07) — the Queue is constructed/Started there.
- `lease.go`/`retry.go`/`state.go`/`ledger.go` themselves (Tasks 01-04 — this task CONSUMES them).
- Real HTTP fetch / AuthContext secret injection (B3 — `AuthContext` stays empty in B1).
- An admin HTTP route for `Stats`/`ListFailures` (B1-light — the methods exist; route wiring deferred).
- Plugin process management (`plugin.Manager` owns launch/restart).

## line_budget

380 (flex 1.25 — the load-bearing task; watch `queue.go` <500 — split the worker body into an unexported file if it approaches the limit, R-8)

## acceptance_criteria

- AC-1 (the async pipeline substrate: derive→lease→drain→ready + provenance)
- AC-lease (one lease per item; lazy expiry; no double-processing)
- AC-ledger (loop-safety + reset-on-success + restart-resume, driven by the dispatch)
- AC-states (the queue emits `settled`/`retry`; items reach `ready`)
- AC-3 (Enrich preserved; additive — no contract break)
- AC-2 (enrich 3→7 ≤8; `queue.go` <500; race/gates green)

## refactoring_checklist

- `cd mellifera && go test -race ./internal/enrich/...` green.
- `grep -nE 'CREATE TABLE|enrichment_jobs|enrichment_leases|queue_items' internal/enrich/queue.go` → 0 hits (no queue table).
- `grep -nE '"github.com/mellifera/mellifera/internal/(api|scan)"' internal/enrich/` → 0 hits (INV-downward).
- `grep -nE 'func Enrich\(' internal/enrich/enrich.go` → ≥1 hit (AC-3 preserved).
- `grep -cE '== "SERVER"' internal/enrich/queue.go` → 0 hits (D-Q1 — queueable check must be `!= "CLIENT"`, NOT `== "SERVER"`); confirm `!= "CLIENT"` present.
- `awk 'END{print NR}' internal/enrich/queue.go` → <500 (R-8); if nearing, a worker-body file was split out.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK with `internal/enrich` at 7 exported symbols AND a co-located test for each of `Queue`/`QueueConfig`/`Stats`/`NewQueue`.

## source_anchor

CREATE `internal/enrich/queue.go`; MODIFY `internal/enrich/enrich.go:56-106` (factor per-item body; preserve `Enrich` at `:56`); MODIFY `internal/enrich/doc.go:17-47`. Collaborators: `internal/store` (T02 ledger + `items.go:42,74,88`), `internal/plugin/manager.go:215`, `internal/module/registry.go:113-120`. Contract: `contracts.md §Queue`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`, `software-design`, `golang-security`, `contracts`
