# Task 04 — internal/enrich/lease.go: per-item in-memory lease map (lazy expiry)

- **Type:** coder
- **Step:** 4 (Outline)
- **Seams:** S4 (Queue/workers/lease — the lease half)
- **AC trace:** AC-lease, AC-2
- **Project scope:** `.` (root; CREATE in `internal/enrich`)
- **Deps:** none (leaf — pure in-memory concurrency primitive)
- **Estimated LOC:** ~80 (S)

## behaviors

- **B1** `type lease struct { itemID, owner string; pluginID string; expiresAt time.Time }` — the in-memory per-item claim. `pluginID == ""` means an item-level lease covering the whole chain (serialize-within-item). At most ONE per `item_id` (arch §4.4). | ac: AC-lease | kind: normal
- **B2** `type leaseMap struct { ... }` — a mutex-guarded `map[string]*lease` keyed by `itemID`. `newLeaseMap() *leaseMap` constructs it. | ac: AC-lease | kind: normal
- **B3** `(*leaseMap) acquire(itemID, owner string, ttl time.Duration) bool` — atomically (under the mutex) claim the item's lease. Returns `true` iff NO live lease exists for `itemID` OR the existing lease has expired (lazy reclaim); on `true` it installs a new lease with `expiresAt = now + ttl`. Returns `false` iff a live lease is held by another owner. | ac: AC-lease | kind: normal
- **B4** `(*leaseMap) expired(itemID string, now time.Time) bool` — lazy check: true if no lease exists OR the held lease's `expiresAt` is at/before `now`. This is the dispatch-tick reclamation probe (checked on every derive cycle). | ac: AC-lease | kind: normal
- **B5** `(*leaseMap) release(itemID)` — explicit release on worker completion (good practice; the lazy expiry is the backstop if a worker dies mid-work). Idempotent (no-op if no lease / not found). | ac: AC-lease | kind: normal
- **B6** `(*leaseMap) renew(itemID string, ttl time.Duration) bool` — extend a live lease's `expiresAt` (used by a long-running worker that needs more time than the default TTL, bounded by the §7.6 RPC timeouts). Returns `false` if no live lease exists. | ac: AC-lease | kind: edge
- **B7** NO database writes for acquire / release / renew / expired (conventions.md §Async correctness: "never write to the DB for acquire/refresh/expire"). The map is the sole state. | ac: AC-lease | kind: normal

## invariants

- **INV-one-lease-per-item:** at most ONE live lease per `item_id`. `acquire` is atomic under the mutex — two concurrent `acquire` calls for the same `itemID` result in exactly one `true`. This is the §4.4 dispatch invariant (serialize-within-item, parallelize-across-items).
- **INV-lazy-expiry:** a lease whose holder died is NOT actively evicted — it is reclaimed the next time `acquire`/`expired` observes `expiresAt <= now`. No timer, no goroutine sweeping. (R-1 mitigation.)
- **INV-no-DB:** the lease map is pure in-memory. It vanishes on restart (pending work is re-derived from `items` — Task 05/AC-ledger(c)); durability is NOT the lease's job.
- **INV-mutex-discipline:** every read/write of the inner map is under `leaseMap.mu` (mirror `plugin.Manager.mu` `manager.go:79`). The mutex is held only for the map access (short critical section — never across an RPC or a `time.Sleep`).
- **INV-owner-is-logical:** `owner` is an opaque worker identifier (e.g. goroutine id / a generated token). `acquire` does NOT compare owners for re-entrancy in B1 (the simplest correct rule: any live lease blocks any other acquire until expiry) — renewal is by `itemID`, not owner-compare. (Keeps the primitive simple; the dispatch owns the "is this mine" bookkeeping.)

## precondition

Phase A `internal/plugin/manager.go` is the mutex-guarded-map pattern to mirror (`manager.go:79` `Manager.mu`). The package clock `var now = time.Now` exists (`enrich.go:21`) — use it for `expiresAt` so tests can override it deterministically.
- evidence: `internal/plugin/manager.go:79` (mutex-map model); `internal/enrich/enrich.go:21` (`var now = time.Now` — the package clock).
- evidence (arch): `architecture.md:1015-1020` (per-item lease, lazy expiry).

## postcondition

`internal/enrich/lease.go` exists with `lease`/`leaseMap`/`newLeaseMap` + `acquire`/`expired`/`release`/`renew`; `lease_test.go` is table-driven + concurrency-checked (two goroutines racing `acquire` for one item → exactly one wins). `go test ./internal/enrich/...` green. No new exported symbol (all unexported — enrich's exported count is unchanged here).

## test_seed

In-package, deterministic via the package clock (`now = func() time.Time{return fixedT}`). Cases:
- acquire-when-free → `true`; a second acquire for the same item → `false` (live lease blocks).
- acquire-after-expiry → `true`: acquire at `t0` with `ttl=1s`; advance clock past `t0+1s`; acquire again → `true` (lazy reclaim), and the new lease has the new `expiresAt`.
- `expired(item, now)` true for no-lease and for past-expiry; false for live.
- `release(item)` then `acquire` → `true` (explicit release works, not just expiry); `release` on no-lease → no-op (no panic).
- `renew(item, ttl)` extends `expiresAt`; `renew` on no-lease → `false`.
- Concurrency: spawn N=10 goroutines each calling `acquire(sameItem, owner=i, ttl)`; assert exactly ONE returns `true` (use a `sync/atomic` counter or a `sync.WaitGroup` + counting winners). This is the AC-lease mutual-exclusion unit.
- No-DB: (static) `grep` the file — there is no `store`/`sql` import (the test need not assert this at runtime; the refactoring_checklist grep does).

## callers_to_update

(none yet — NEW file, unexported. The consumer is Task 05's dispatch: `leaseMap.acquire` before pulling an item's work; `release` on completion; `expired` on the derive tick.)

## allowed_imports

- `sync`, `time` (stdlib)
- (NO `store`, NO `plugin`, NO protos — this is a pure in-memory primitive. The package clock `now` (`enrich.go:21`) is same-package, not an import.)

## allowed_categories

- `stdlib`

## test_exclusions

- `leaseMap` IS logic (mutual exclusion + lazy expiry) — NOT excluded; table + concurrency test required (AC-lease is load-bearing — R-1).
- `lease` is a data struct — covered via the `acquire`/`renew` tests (populated/inspected), no standalone test.

## negative_examples

- DO NOT write to the DB for acquire/release/renew/expired (INV-no-DB — conventions.md §Async correctness).
- DO NOT hold the mutex across an RPC or `time.Sleep` — short critical sections only.
- DO NOT spawn a sweeper goroutine / timer — expiry is LAZY (INV-lazy-expiry).
- DO NOT persist leases — they are in-memory and vanish on restart (durability is the `items` row + ledger).
- DO NOT compare `owner` strings inside `acquire` to allow re-entrancy — any live lease blocks until expiry/release (INV-owner-is-logical; the dispatch tracks ownership).
- DO NOT add a per-plugin lease (one lease per `item_id`, not per `(item,plugin)` — serialize-within-item).

## existing_code_snapshot

```go
// internal/enrich/enrich.go:21 (the package clock — use for deterministic expiresAt)
var now = time.Now
// internal/plugin/manager.go:79 (the mutex-map pattern to mirror — shape, not import)
// mu sync.Mutex  +  map under the lock; short critical sections.
```
There is no existing `lease.go` (NEW). The struct shape is fixed by contracts.md §Lease:
```go
type lease struct { itemID, owner string; pluginID string; expiresAt time.Time }
```

## contract_test_scope

- **joint (S4 — lease half):** `internal/enrich.leaseMap.acquire` | assert: two concurrent acquires for one item → exactly one `true`; a live lease blocks; an expired lease is lazily reclaimed on the next acquire/expired tick; no DB writes. Verified in `lease_test.go` (incl. the N-goroutine race). (The dispatch wiring — "while lease held, no second worker dispatched" — is the S4 joint verified in Task 05's queue_test.)

## scope_boundary

- CREATE `internal/enrich/lease.go` (`lease`, `leaseMap`, `newLeaseMap`, `acquire`, `expired`, `release`, `renew` — all unexported).
- CREATE `internal/enrich/lease_test.go` (table + concurrency).

## out_of_scope

- The dispatch loop that calls `acquire`/`release` (Task 05 — the worker claims a lease before draining an item's sources).
- The TTL/timeout knob wiring from `QueueConfig` (Task 05 passes `cfg.LeaseTTL` to `acquire`).
- A durable lease table (forbidden — conventions.md anti-pattern; §4.4 single-source-of-truth).

## line_budget

80 (flex 1.2)

## acceptance_criteria

- AC-lease (one lease per item; lazy expiry; mutual exclusion; no DB writes)
- AC-2 (file <500; race detector clean — `go test -race ./internal/enrich/...`; no new exported symbol)

## refactoring_checklist

- `cd mellifera && go test -race ./internal/enrich/...` green (the concurrency case MUST be run under `-race`).
- `grep -nE '"github.com/mellifera/mellifera/internal/store"|"database/sql"' internal/enrich/lease.go` → 0 hits (INV-no-DB).
- `grep -nE 'time\.NewTimer|time\.AfterFunc|go func' internal/enrich/lease.go` → 0 hits (no sweeper goroutine — lazy expiry).
- `grep -nE 'mu\.Lock|mu\.Unlock|sync\.Mutex' internal/enrich/lease.go` → ≥2 hits (mutex discipline).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK.

## source_anchor

CREATE `internal/enrich/lease.go` (package `enrich`). Pattern model: `internal/plugin/manager.go:79`. Package clock: `internal/enrich/enrich.go:21`. Contract: `contracts.md §Lease`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`, `golang-security`
