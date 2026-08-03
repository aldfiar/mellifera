# Conventions — async-enrichment (Phase B1)

> **Inherits** `docs/plugin-pipeline/conventions.md` + `docs/scan-library/conventions.md`
> in full (Apache-2.0 headers; `doc.go` per package; parameterized SQL `?` placeholders;
> `exec.Command` arg-slice only; deprecate-don't-delete; no `reflect`; no DI framework;
> soft-fail AC-6; INV-downward import direction; pure-Go no-CGO; `check.sh` gate).
> Below are the **async-specific deltas**.

## Naming
- Lifecycle status literals are unexported string consts owned in `internal/enrich/state.go` (`new,pending,parsed,enriched,failed,deleted` + `ready`,`stale`). The store is value-agnostic (owns only the column + DEFAULT `'new'`).
- Ledger statuses: lowercase `exhausted`, `no_data` (arch §4.4 / §9.1).
- Async entry points: `Queue`, `NewQueue`, `QueueConfig`, `Stats` (enrich); `FailureRow`, `RecordFailure`, `ClearFailure`, `ListFailures` (store). Unexported: `lease`, `leaseMap`, `runSourceRetryable`, the per-item worker driver.

## Async correctness (NON-NEGOTIABLE)
- **One lease per `item_id`.** Serialize-within-item, parallelize-across-items. While a lease is held, NO second worker is dispatched for that item. Leases expire LAZILY (checked on every dispatch tick) — never write to the DB for acquire/refresh/expire.
- **Derived, never stored as a queue.** A `(item,plugin)` task is pending iff applicable + enabled + `AuthMode != "CLIENT"` + namespace absent + not in ledger cooldown. Do NOT add a queue/claim/lease table. `items` + document namespaces + `enrichment_failures` ARE the queue (arch §4.4 single-source-of-truth).
- **Ledger writes are RARE.** Write `enrichment_failures` ONLY on terminal failure (`exhausted`/`no_data`) — never per-claim, never on success. Reset-on-success = `DELETE` the row. The hot path stays near-zero queue writes (only the document `PutItem`, which happens anyway, + a one-row delete on recovery).
- **Bounded + decaying.** In-memory retry ≤ `MaxAttempts` (default 3) per session; terminal cooldown doubling 7d→14d→28d, cap 365d. No infinite loop.
- **Plugin isolation holds.** A crashing enricher is a failed RPC → the worker soft-fails/requeues that source; the queue never aborts on one plugin/item (AC-6 philosophy extended to the queue). The `plugin.Manager` monitor owns subprocess restart (`lifecycle.go:46,172`) — the queue does NOT restart plugins.

## State machine discipline
- `nextState` stays a PURE table function (no I/O). Every legal transition is a map row; every illegal transition is the map-miss that returns an error. Add `ready`/`stale`/`settled`/`stale`-rehydrate as ROWS, not `switch` arms.
- Never persist an illegal transition — the caller checks the error.
- `retry` (`failed→pending`) is now exercised by the queue (was defined-but-unused in Phase A).

## SQL
- Parameterized placeholders (`?`) ONLY — status is NEVER interpolated (`store/items.go:87,99-108` is the model). Ledger upsert mirrors `PutItem`'s `INSERT…ON CONFLICT…DO UPDATE`.
- No new DDL migration in B1 (`enrichment_failures` + `items.status` already exist from Phase A). If a future phase adds a column, use the `ensureItemsStatus` PRAGMA-guarded additive pattern (`open.go:161`).

## Concurrency
- Mutex-guarded maps (mirror `plugin.Manager.mu` `manager.go:79`): the lease map, the queue's internal counters.
- Worker pool = `<-chan` + `for range` goroutines (mirror `scan`'s stream drain `run.go:117`). Bounded channel; never unbounded goroutine spawn per item.
- `context.Context` cancellation is the only hard failure path (`enrich.go:68,190`); workers honor `ctx.Done()` and exit cleanly on `Stop`.

## Boundary rules (scope)
- `internal/enrich` imports ONLY `store`,`plugin`,`module`,`pkg/sdk`, protos, stdlib. It is CALLED BY `scan` + `cmd`. It NEVER imports `api` or `scan` (INV-downward — scan→enrich direction preserved).
- Core stays media-type-agnostic (INV2): no branching on `media_type`. Image/TMDB are plugins (B2/B3), not core code.
- ADDITIVE: the refactor moves DISPATCH (serial-inline → async-queue). The plugin contract (`metadata.v1` RPCs, `sdk.MetadataSource`), the API endpoints, and the serial `enrich.Enrich` entry are UNCHANGED/preserved (AC-3, deprecate-don't-delete).

## Anti-patterns (forbidden in B1)
- A separate `enrichment_jobs`/`enrichment_leases` table (violates §4.4 single-source-of-truth).
- Writing the ledger per-claim or per-success (write-amplification).
- Re-probing the file in the worker (B1 reconstructs the base from the persisted document — S7; re-Identify is a B3 fallback).
- An external broker (Redis/NATS) or CGO (single-binary + pure-Go constraints).
- Blocking `POST /scan` on enrichment (defeats AC-async).
- Per-worker plugin subprocesses (the subprocess is stateless + shared via one cached client, `manager.go:215-231`).
