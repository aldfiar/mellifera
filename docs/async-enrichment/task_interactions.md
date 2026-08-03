# Task Interactions — async-enrichment (Phase B1)

> Cross-task dependency map: symbol ownership, order dependencies, shared-file conflicts,
> circular deps, foundational folds. Grounded — every symbol/file cited is G2-verified against
> live Phase A source.

## Symbol Ownership

| Symbol / file | Owner task | Consumer tasks | Shared type? |
|---|---|---|---|
| `statusReady`, `statusStale`, `evSettled`, `evStale`, `evRehydrate` + new `nextState` rows | T01 | T05 (emits `settled`), T06 (emits `stale` on re-scan) | yes (state literals — cross-task) |
| `store.FailureRow`, `RecordFailure`, `ClearFailure`, `ListFailures` | T02 | T05 (derivation + dispatch call them) | yes (ledger API — cross-task) |
| `runSourceRetryable` (unexported) | T03 | T05 (dispatch calls it) | no (same package, unexported) |
| `leaseMap`, `lease`, `acquire`, `expired`, `release`, `renew` (unexported) | T04 | T05 (dispatch claims/releases leases) | no (same package, unexported) |
| `enrich.Queue`, `QueueConfig`, `Stats`, `NewQueue`, `Start`, `Stop`, `Notify` | T05 | T06 (`scan.Deps.Notify` field type), T07 (constructs + wires) | yes (Notify signature — cross-package) |
| `enrich.Enrich` (PRESERVED), `enrichDoc`, `orderedSources`, `applyContribution`, `hardError` | Phase A (`enrich.go`) — reused | T05 (worker reuses the per-item body) | no (existing, unchanged) |
| `enrich.runSource`, `sourceResult`, `outcomeKind` | Phase A (`chain.go`) — reused | T03 (wraps `runSource`) | no (existing) |
| `store.PutItem`, `GetItem`, `QueryItems` | Phase A (`items.go`) — reused | T05 (persist advanced status/doc), T06 (persist `pending`), T08 (assert via `?status=`) | no (existing) |
| `scan.Deps.Notify` (NEW field) | T06 (defines the field) | T07 (fills it with `q.Notify`) | yes (struct field — cross-package) |
| `module.MetadataSourceBinding.AuthMode` | Phase A (`registry.go:118`) — reused (READ only) | T05 (derivation reads it: `!= CLIENT`) | no (existing, read-only) |
| `plugin.Manager.MetadataSource` | Phase A (`manager.go:215`) — reused | T05 (production resolver for the worker) | no (existing) |

## Order Dependencies

| Task | Must complete before | Reason |
|---|---|---|
| T01 (state) | T05, T06 | T05 emits `settled`; T06 emits `stale` — both need the new transitions |
| T02 (ledger) | T05 | T05 dispatch calls `RecordFailure`/`ClearFailure` + derivation reads `ListFailures` |
| T03 (retry) | T05 | T05 dispatch calls `runSourceRetryable` |
| T04 (lease) | T05 | T05 dispatch claims/releases via `leaseMap` |
| T05 (queue) | T06, T07, T08 | T06 fills `scan.Deps.Notify`; T07 constructs + wires the queue; T08 drives it end-to-end |
| T06 (scan) | T07, T08 | T07 wires `Notify` into `scan.Deps`; T08 asserts the non-blocking handoff |
| T07 (cmd) | T08 | T08's golden needs the wired server binary |
| T08 (integration) | T09 | T09 runs the full gate incl. integration |
| T01-T04 | (mutually independent — may run in any order; all are leaves) | none depend on each other |
| All coder (T01-T09) | QA-01, QA-02, DOCS-01, DOCS-02 | QA re-derives acceptance over the implemented code; docs sync to it |

**Linear run order (coder):** T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09.
(T01-T04 are independent leaves — a parallel runner may fan them out; T05 is the join.)

## Potential Conflicts (shared files)

| Tasks | Shared file | Risk | Mitigation |
|---|---|---|---|
| T01, T05 | `internal/enrich/enrich_test.go` | T01 extends `TestNextState`; T05 adds queue tests to a SEPARATE file (`queue_test.go`) | T01 touches ONLY `TestNextState`; T05 creates `queue_test.go` (no overlap). T05's `enrich.go` factor preserves `Enrich`. |
| T05 | `internal/enrich/enrich.go` (factor) + `doc.go` (document) | T05 is the SOLE editor of both in B1 | single-owner — no conflict |
| T05, T03, T04 | `internal/enrich/` package (new files) | three new files in one package | distinct concerns (retry vs lease vs queue); compile as one package — T05 is the integrator |
| T06, T05 | `scan.Deps` (T06 adds `Notify`), `enrich.Queue.Notify` (T05 defines) | signature must match | contracts.md §Queue.Notify pins the signature; T06 codes to the contract, T05 implements it |
| T02, T05 | `internal/store` (T02 adds `ledger.go`), `internal/enrich` (T05 calls it) | cross-package API | contracts.md §RecordFailure/ClearFailure/ListFailures pins the API |
| T08 | `integration_test.go` (existing harness) | T08 REUSES helpers, does not edit them | read-only reuse — no conflict |

## Circular Dependencies

**None found.** The dependency graph is a DAG:
- Leaves: T01 (state), T02 (ledger), T03 (retry), T04 (lease) — depend only on Phase A code.
- Join: T05 (queue) — depends on T01-T04.
- Sequence: T05 → T06 → T07 → T08 → T09 (linear).
- Downward invariant holds: `enrich` imports `store` (T05→T02 API), but `store` does NOT import `enrich` (the ledger is value-agnostic). `scan` imports `enrich` (Notify); `enrich` never imports `scan`. No cycle.

## Cross-Project Tasks

**N/A.** Mellifera is a single-project repo (`project_scope == "."`, module `github.com/mellifera/mellifera`). No subprojects; no cross-project task dependencies. The B2/B3 phases will CONSUME the B1 queue unchanged (same repo, future tasks) — no current cross-project coupling.

## Archetype / Canonical-Task-Skeleton coverage

B1's dominant archetype is **`data`** (a derived work-queue over persistent items + a terminal-failure ledger) with a secondary **`external-services`** shape deferred to B3 (no external HTTP in B1). The relevant task families and their mapping:
- queue/worker pool → T05 (queue.go)
- lease/mutual-exclusion → T04 (lease.go)
- retry/backoff → T03 (retry.go)
- durable failure ledger → T02 (ledger.go)
- state-machine extension → T01 (state.go)
- ingress migration (serial→async) → T06 (scan)
- composition-root wiring → T07 (cmd)
- end-to-end golden → T08
- gate → T09
Every applicable family maps to an emitted task. No skip gaps.

## Foundational Setup folds (recorded — none silently dropped)

- `enrichment_failures` table → EXISTS (Phase A, `open.go:98`); fold → T02 precondition (NO migration).
- `items.status` column + index → EXISTS (Phase A, `open.go:72,161`); fold → T05/T06 precondition.
- `MELLIFERA_ENRICH_*` env vars → fold → T07 (read in `loadConfig` with §4.4 defaults).
- `go.mod` → NO new deps (stdlib only); non-item (T09 asserts `git diff go.mod` empty).
- `Makefile` → NO new plugin binary (B1 reuses tv-parser); non-item.
- `stale` change-detection basis → fold → T06 (minimal "base changed" comparison; full mtime/size = R-stale refine, surfaced at plan-review).
