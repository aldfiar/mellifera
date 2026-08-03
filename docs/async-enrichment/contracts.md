# Contracts — async-enrichment (Phase B1)

> Shared types + interface contracts for the async substrate. Scoped to B1
> (derived queue + workers + leases + ledger + serial→async migration +
> retry + ready/stale). Image-EXIF (B2) and TMDB/AuthContext (B3) types are
> listed under **Deferred** for forward-reference only — NOT built in this plan.
> All paths repo-relative under `mellifera/`.

## Target: `mellifera` (single project)

### Module Boundaries
- `internal/enrich` — the async dispatcher + per-item worker work. Depends on `internal/store` (items + ledger), `internal/plugin` (`Manager.MetadataSource`), `internal/module` (bindings), `pkg/sdk`, generated protos, stdlib. **CALLED BY** `internal/scan` (enqueue signal) and `cmd/mellifera` (construct + Start). INV-downward preserved: enrich NEVER imports `api` or `scan` (scan→enrich direction unchanged from Phase A).
- `internal/scan` — discovery + identify + persist; now ENQUEUES (no inline enrich). Depends on enrich (`Queue` notify), store, module, plugin, sdk.
- `internal/store` — adds `enrichment_failures` ledger METHODS (the table already exists, `open.go:98`). Stays value-agnostic (INV-value-agnostic-store): no new status literals owned here.
- `cmd/mellifera` — constructs `enrich.Queue` over `(store, plugins, modules)`, `Start`s the worker pool, `Stop`s on shutdown.
- `internal/api` — unchanged contract; `?status=` already passes any value through (`handlers.go:126`). New statuses (`ready`/`stale`) list automatically.

### Imports Map
#### `internal/enrich` (B1)
- `github.com/mellifera/mellifera/internal/store`        # items + ledger
- `github.com/mellifera/mellifera/internal/plugin`       # Manager.MetadataSource resolver
- `github.com/mellifera/mellifera/internal/module`       # Module + MetadataSourceBinding (AuthMode, Priority, Enabled)
- `github.com/mellifera/mellifera/pkg/sdk`               # MetadataSource interface
- `...proto/mellifera/{common,metadata,scanner}/v1`      # RPC types (generated, budget-exempt)
- stdlib: `context`, `sync`, `time`, `fmt`, `sort`

#### `internal/scan` (B1)
- `github.com/mellifera/mellifera/internal/enrich`       # Queue.Notify (replaces inline Enrich call)
- (unchanged: store, module, plugin, sdk, scanner/v1)

#### `internal/store` (B1)
- (unchanged; ledger methods use existing `database/sql` + parameterized placeholders)

#### `cmd/mellifera` (B1)
- `github.com/mellifera/mellifera/internal/enrich`       # construct Queue, Start/Stop
- (unchanged: store, module, plugin, sdk, api)

### Shared Types

#### `enrich.Queue` (NEW — the async dispatcher)
```go
// Queue is the in-process async enrichment dispatcher (arch §4.4). It derives
// pending (item,plugin) work from items + the document namespaces + the
// enrichment_failures ledger, feeds a bounded channel, and a worker pool drains
// it under per-item leases. Single-instance MVP (leases are in-memory).
type Queue struct { /* unexported: store, plugins, modules, leaseMap, pool cfg, now */ }
```

#### `enrich.QueueConfig` (NEW — knobs; zero-value = §4.4 defaults)
```go
type QueueConfig struct {
    Workers       int           // worker-pool size (default 4)
    MaxAttempts   int           // in-memory retries per source before terminal (default 3)
    LeaseTTL      time.Duration // lazy-expiry lease lifetime (default 60s, bounded by RPC timeouts §7.6)
    Backoff       time.Duration // initial exponential-backoff step (default 2s)
    ExhaustedCool time.Duration // terminal 'exhausted' cooldown (default 7*24h)
    NoDataCool    time.Duration // terminal 'no_data' cooldown (default 30*24h)
    CoolCap       time.Duration // doubling cap (default 365*24h)
}
```

#### `enrich.Stats` (NEW — observability)
```go
type Stats struct {
    Pending, InFlight, Done, Failed int
}
```

#### `store.FailureRow` (NEW — ledger row DTO)
```go
type FailureRow struct {
    ItemID, PluginID, Status, Reason string
    Attempts int
    FailedAt, NextEligibleAt time.Time
}
```

#### Lease (enrich-internal, unexported — documented as a contract)
```go
// lease is the in-memory per-item claim: at most ONE per item_id (arch §4.4).
// While held, no second worker is dispatched for that item (serialize within
// item, parallelize across items). Expires lazily on every dispatch tick.
type lease struct {
    itemID, owner string
    pluginID      string   // "" = item-level lease covering the chain
    expiresAt     time.Time
}
```

### Interface Contracts

#### `enrich.NewQueue(deps Deps, cfg QueueConfig) *Queue`
- Purpose: construct the dispatcher over the Phase A collaborators (`Deps` is reused: `enrich.go:34`).
- Precondition: `deps.Store/Plugins/Modules` non-nil; `cfg` zero-values filled with §4.4 defaults.
- Postcondition: returns a Queue NOT yet running (no goroutines).
- Source: extends `enrich.Deps` (`enrich.go:34-38`).

#### `(q *Queue) Start(ctx context.Context) error`
- Purpose: launch the worker pool; (re)derive pending work from `items` + ledger and drain.
- Precondition: `NewQueue` called; not already started.
- Postcondition: `Workers` goroutines running; on `ctx.Done()`/`Stop`, workers exit cleanly (in-flight leases expire lazily; pending work re-derived on next Start).
- Throws: none (errors logged + soft-failed per source; the pool never aborts on a single item).

#### `(q *Queue) Notify(ctx context.Context, libraryID int64)`
- Purpose: signal that a scan persisted new/changed items for a library — (re)derive the pending set for that library and feed the channel. Called by `scan` after the scan persists items `pending` (replaces the inline enrich call).
- Precondition: Queue started.
- Postcondition: newly-pending `(item,plugin)` tasks for the library are enqueued (idempotent — already-done/cooldown pairs are not re-added).

#### `(q *Queue) Stop()`
- Purpose: drain + stop the pool; release leases.
- Postcondition: no worker goroutines remain; in-memory queue/leases discarded (pending work survives in `items` + ledger — re-derived on next `Start`).

#### `(q *Queue) Stats() Stats`
- Purpose: observability (pending/in-flight/done/failed).

#### `enrich.Enrich(ctx, deps, mod, doc, base) (doc, status, Result, error)` (PRESERVED — now worker-internal)
- Contract UNCHANGED (`enrich.go:56`). The worker calls the per-item chain body (factored as `enrichDoc`); `Enrich` remains the public entry for backward-compat/sync + tests. Deprecate-don't-delete.

#### `(s *Store) RecordFailure(ctx, itemID, pluginID, status, reason string, attempts int, nextEligible time.Time) error`
- Purpose: upsert a terminal ledger row (`exhausted`/`no_data`). Written ONLY on terminal failure (rare) — never per-claim, never on success.
- Precondition: `status ∈ {exhausted, no_data}`; `nextEligible` = now + cooldown.
- Postcondition: row exists with PK `(item_id, plugin_id)`; `next_eligible_at` set.
- SQL: `INSERT INTO enrichment_failures(...) ON CONFLICT(item_id,plugin_id) DO UPDATE SET ...` (parameterized).
- Source: table DDL `store/open.go:98-107`.

#### `(s *Store) ClearFailure(ctx, itemID, pluginID string) error`
- Purpose: reset-on-success — delete a ledger row when a `(item,plugin)` that had one eventually succeeds (arch §4.4 reset-on-success). Hot path stays near-zero writes on success (doc write happens anyway + this one-row delete on recovery).
- Postcondition: row absent (idempotent — no error if absent).

#### `(s *Store) ListFailures(ctx context.Context) ([]FailureRow, error)`
- Purpose: admin observability/escape hatch (Q22) — list terminally-failed pairs. (Endpoint wiring is B1-light: the method exists; an admin route can fold in later. The §4.4 contract is just "clearing a row makes the pair derivable again".)
- Postcondition: returns all ledger rows.

### Derivation contract (enrich-internal, documented — the §4.4 single-source-of-truth)
```
pending(item, plugin) := EXISTS item row
   AND source applicable to item.module (module.MetadataSources[].PluginID == plugin)
   AND binding.Enabled
   AND binding.AuthMode != "CLIENT"          // D-Q1: queueable iff != CLIENT (tv-parser empty/local + SERVER)
   AND document.sources.<plugin> ABSENT       // not already done
   AND NOT ledger(item, plugin) within cooldown   // not terminally-failed-and-cooling
```
- Per-item lease serializes the item's queueable sources in `Priority` order (existing `orderedSources`, `enrich.go:111`).
- Outcomes map to the §4.4 table: success→namespace written (naturally drops from pending); `no_data`→terminal ledger (30d); failure→in-memory backoff→`max_attempts`→terminal `exhausted` (7d, doubling to cap); lease-expired→lazy reclaim.

### Constants
- Status literals (owned `internal/enrich/state.go`): `new,pending,parsed,enriched,failed,deleted` (existing) **+ `ready`, `stale` (B1 new)**.
- Ledger statuses: `exhausted`, `no_data` (§4.4).
- Defaults: see `QueueConfig` zero-values (all §4.4-derived; overridable via env in `cmd/mellifera`).

### Error Types
- **Soft-fail (existing pattern, `enrich.go:52`):** a source RPC error / namespace violation / unresolvable plugin → `Result.Warnings` + a `_stages` entry; the item advances to its furthest-valid state. NEVER a scan/queue abort (AC-6).
- **Hard-fail (existing):** cancelled context → `status=failed` + `_error{retryable:true}` (`enrich.go:190`); retried `failed→pending` by the queue (B1).
- **Terminal-fail (B1 new):** source exhausts `max_attempts` → ledger row (loop-safety); NOT an error return — recorded durably, derivation skips the pair.

## Deferred — B2 (image) / B3 (TMDB+auth) — NOT built in this plan
> Forward-reference only. These types are NOT in B1 tasks; listed so later phases
> extend the SAME queue without contract churn.
- **B2:** an image `metadata_source` plugin (`plugins/image-enricher/`) consuming the queue unchanged; image extensions added to `base-scanner/walk.go` `mediaMime` (`walk.go:25-38`, currently video-only); a pure-Go EXIF lib (no CGO; NONE present in `go.mod` today). EXIF fields: dimensions, camera make/model, date-taken, orientation (Unicode-safe).
- **B3:** a TMDB `metadata_source` plugin with real HTTP in `BuildRequest→Convert`; `required_secrets` declared at handshake (`plugin.proto:72`, unused today); `AuthContext{mode:SERVER, server_secrets}` injected at `BuildRequest` (`metadata.proto:348`, `enrich/chain.go:66` passes empty today); rate-limit + response cache + soft-fail. Fills the seeded `tmdb` SERVER slot (`registry.go:70-73`).
