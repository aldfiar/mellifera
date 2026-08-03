# async-enrichment (Phase B1) — API Reference & Operator Runbook

> Audience: **operator** (env knobs, non-blocking scan, lifecycle, restart) + **developer**
> (the async model). Grounded in `internal/enrich/{queue,worker,lease,retry,state,enrich}.go`,
> `internal/store/{ledger,open}.go`, `internal/scan/run.go`, `cmd/mellifera/main.go`,
> `internal/api/handlers.go`. The authoritative design is `docs/architecture.md` §4.4;
> this file documents what B1 **shipped** (the spec is read-only; this is the realization).

## 1. The one user-visible change: `POST /scan` is now non-blocking

Before B1, scan drove the metadata chain inline and an item was `enriched` by the
time the scan response returned. **B1 decouples discovery from enrichment:**

1. `POST /scan` runs discovery → identify → **persist each item at `status:"pending"`**
   (`internal/scan/run.go` `persist`).
2. When the scanner stream drains, scan calls `Notify(ctx, libraryID)` **once** and
   **returns immediately** (`runScan` post-drain handoff). Enrichment is **not awaited**.
3. The `enrich.Queue` (a process-lifetime worker pool) derives the library's pending
   `(item, plugin)` work and drains it in the background to `enriched`/`ready`.

The **response shape is unchanged** — `scan.Result{ LibraryID, Discovered, Persisted,
Warnings, StartedAt, FinishedAt }` (`api/handlers.go` serializes `discovered`/`persisted`).
**Only timing changed**: the response arrives with items `pending`, and enrichment
completes asynchronously. This is the point of the feature (AC-async).

Observe progress by polling the item list filtered by status:

```
GET /items?status=pending    # discovered, awaiting enrichment
GET /items?status=enriched   # enriched, settlement in progress (or a source still has work)
GET /items?status=ready      # async-settled: all queueable sources terminal
GET /items?status=stale      # a re-scan detected the file changed → re-enriching
GET /items?status=failed     # a cancelled-context hard-fail (retries to pending)
```

`?status=` passes any value straight through to `store.QueryItems` (no API-side
validation); an empty/absent `?status=` returns **all** statuses.

## 2. The async model (how the queue works)

There is **no queue/claim/lease table** (arch §4.4 — INV-derived-not-stored). Pending
work is **derived** from existing data on every `Start`/`Notify`:

> A `(item, plugin)` task is pending **iff**: the item row exists, the source is
> `Enabled` **and** `AuthMode != "CLIENT"` (D-Q1), the source's `sources.<plugin_id>`
> namespace is **absent** (not done), and the pair is **not** in ledger cooldown.

The pipeline (`internal/enrich/queue.go` + `worker.go`):

1. **Derive** — `deriveLibrary` reads items (all statuses) + the ledger once, applies
   the predicate, and emits the unique item set (a lease is per-item, so an item with
   several pending sources is dispatched once and its chain drains them serially).
2. **Feed** — derived items go onto a bounded channel (`Workers*4` wide — backpressure
   on slow drains). `Notify`/`Start` each spawn a feeder goroutine.
3. **Lease** — a worker `acquire`s the item's in-memory lease (one per `item_id`):
   serialize-within-item, parallelize-across-items. A held/expired lease blocks a second
   worker (`lease.go`; lazy-expiry, no sweeper goroutine).
4. **Drive** — the worker runs the item's queueable sources serially in `Priority` order,
   each wrapped in `runSourceRetryable` (bounded in-memory retry/backoff).
5. **Settle** — when every queueable source is terminal (namespace written, in-cooldown,
   or ran-but-produced-no-work), `enriched → ready` (`allSourcesTerminal`).

**Soft-fail invariant:** a source RPC error, namespace violation, terminal failure, or
unloaded plugin is recorded (ledger / `_stages` / warnings) and the item advances to the
furthest state its successful sources justify. **Only a cancelled context is a hard
failure** (`→ failed`; the queue later drives `failed --retry--> pending`).

### D-Q1 — who gets queued (load-bearing)

Queueable iff `AuthMode != "CLIENT"`. Empty/local and `SERVER` sources are
server-runnable → queued; `CLIENT` needs user credentials → Mode-B-only, excluded.
The seeded `tv` module (`internal/module/registry.go`) reflects this:

| source | priority | auth_mode | B1 disposition |
|---|---|---|---|
| `tv-parser` | 1 | _(empty)_ | loaded, queued → writes `sources.tv-parser` |
| `kinopoisk` | 2 | `CLIENT` | **excluded** from the background queue (Mode-B) |
| `tmdb` | 3 | `SERVER` | queued, but **not loaded in B1** → runs-but-`unavailable` ⇒ terminal-at-settle |

Because the unloaded `tmdb` records an `unavailable` `_stages` entry each pass, a
tv-parser item still settles `enriched → ready` end-to-end (verified by
`integration_async_test.go`). A later TMDB load (B3) re-derives `ready` items —
namespace absent + not in cooldown — and runs without regressing `ready`.

## 3. Status lifecycle

Statuses are owned by `internal/enrich/state.go` (the store is value-agnostic):
`new, pending, parsed, enriched, failed, deleted, ready, stale`.

```
new      --begin----> pending        pending --parsed---> parsed
parsed   --begin----> pending        pending|parsed --enriched--> enriched
*        --failed---> failed         failed --retry----> pending   (B1, exercised)
enriched --settled--> ready   (B1)   * --stale-----> stale         (B1, re-scan change)
stale    --rehydrate> pending  (B1)  * --deleted---> deleted       (scan soft-delete)
```

- **scan** writes: `pending` (first scan), `stale` (re-scan whose `parsed`+`ffprobe`
  base identity changed), or the **prior status preserved** (unchanged re-scan — a
  `ready`/`enriched` item is **not** regressed).
- **worker** writes: `pending → parsed → enriched → ready`; `→ failed` on ctx cancel;
  `failed → pending` on the next derive pass (retry).
- `enriched` requires ≥1 source succeeded ∧ 0 failed; `ready` requires **all** queueable
  sources terminal.

The state machine is the source of truth: `docs/async-enrichment/acceptance.md`
(AC-states); the Phase-A base machine: `docs/plugin-pipeline/api_reference.md`.

## 4. Worker configuration (env)

All knobs live in `cmd/mellifera/main.go` `loadConfig`; defaults are the arch-§4.4
zero-values applied by `enrich.NewQueue`. **A missing/empty/malformed value falls back
to the default and logs a warning** (startup never aborts on an enrich knob — only
`MELLIFERA_ADMIN_TOKEN` is fail-fast).

| Env var | Default | Meaning |
|---|---|---|
| `MELLIFERA_ENRICH_WORKERS` | `4` | worker-pool size (goroutines draining the channel) |
| `MELLIFERA_ENRICH_MAX_ATTEMPTS` | `3` | in-memory retries per source before terminal `exhausted` |
| `MELLIFERA_ENRICH_LEASE_TTL` | `60s` | per-item in-memory lease lifetime (lazy-expiry) |
| `MELLIFERA_ENRICH_BACKOFF` | `2s` | initial exponential-backoff step (`base<<(attempt-1)`) |
| `MELLIFERA_ENRICH_EXHAUSTED_COOL` | `7d` | terminal `exhausted` cooldown (**doubling**: 7→14→28… d) |
| `MELLIFERA_ENRICH_NODATA_COOL` | `30d` | terminal `no_data` cooldown (flat, no doubling) |
| `MELLIFERA_ENRICH_COOL_CAP` | `365d` | cap on the `exhausted` doubling schedule |

Durations use `time.ParseDuration` syntax (`30s`, `2m`, `7d` is invalid — use `168h`).
Ints use `strconv.Atoi`. The `Stats()` snapshot (`Pending`/`InFlight`/`Done`/`Failed`) is
best-effort liveness, not billing.

## 5. Loop-safety (the failure ledger)

Terminal source outcomes write the `enrichment_failures` ledger
(`internal/store/ledger.go`: `RecordFailure`/`ClearFailure`/`ListFailures`). The store is
value-agnostic; the two statuses are owned by the enrich producer:

| ledger status | when | cooldown |
|---|---|---|
| `exhausted` | a source spent all `MAX_ATTEMPTS` retries | `EXHAUSTED_COOL`, **doubling** per round, capped at `COOL_CAP` |
| `no_data` | a source ran clean but produced no metadata | `NODATA_COOL`, flat |

- **Derivation skips** any `(item, plugin)` pair whose `next_eligible_at` is in the
  future (cooldown). When the cooldown elapses, the pair is re-derived automatically.
- **Reset-on-success:** a success after a prior ledger row deletes it (`ClearFailure`) —
  the hot path stays near-zero ledger writes on success.
- Ledger writes are **rare** (terminal only; never per-claim or per-success).

An admin HTTP route over `store.ListFailures` is **deferred** (B1-light) — the method
ships, the route does not. Until then, inspect the ledger directly:

```
sqlite3 "$MELLIFERA_DATA_DIR/mellifera.db" \
  "SELECT item_id, plugin_id, status, attempts, next_eligible_at FROM enrichment_failures;"
```

## 6. Restart & resume

- **Pending work is durable.** It lives in `items` (status) + the document namespaces +
  the ledger — **not** in the queue. On every `Start`, the pool re-derives pending work
  across all known libraries and drains it.
- **Leases are in-memory** and vanish on restart (single-instance MVP; multi-instance
  coordination is Phase 2). A dead holder's lease is reclaimed lazily on the next
  `acquire`/`expired` probe.
- **`Start` is re-entrant after `Stop`** (a `running` CAS guards it). `Notify` registers
  a library; `Start` sweeps the registered set.
- **Shutdown order** (`cmd/mellifera/main.go`): stop accepting HTTP → `enrichQueue.Stop()`
  (cancel workers + wait; in-flight leases release/expire) → stop plugin subprocesses →
  `store.Close`. `Stop` drains the bounded channel before workers exit.
- The `Notify` closure is wired over the **process** context (not the per-request scan
  context), so the queue's feeder outlives the HTTP request — otherwise enrichment would
  abort the moment the scan handler returned.

## 7. Reading provenance & `_stages`

Every enriched item's opaque `document` (arch §3.1) carries:

| path | meaning |
|---|---|
| `sources.<plugin_id>` | the lossless per-source namespace (only what that plugin wrote) |
| `_provenance.<field_path>` | per-field source audit — which plugin produced each field (+ version) |
| `_view.<field>` | the recomputable view (Phase-A last-writer; B3 adds arbitration) |
| `_stages[]` | per-stage progress entries |

A `_stages` entry (`internal/enrich/enrich.go` `appendStage`):

```json
{
  "stage": "metadata_source",
  "plugin_id": "tv-parser",
  "status": "ok",                 // ok | failed | unavailable | skipped
  "advanced_to": "ready",
  "started_at": "2026-08-03T12:00:00Z",
  "finished_at": "2026-08-03T12:00:00.12Z",
  "error": ""                     // present only on failed/unavailable
}
```

`status` values: `ok` (namespace written), `failed` (transient; retried, may go terminal),
`unavailable` (plugin not loaded — e.g. B1's `tmdb`), `skipped` (disabled / not applicable).

> **`_stages` survives store round-trips.** `decodeDoc` (`worker.go`) normalizes the
> persisted array (`[]any` from `encoding/json`) back to the in-memory `[]map[string]any`
> form the readers consume — the C-01 fix. Without it, a re-derive would silently drop
> prior `_stages` history.

## 8. Concurrency guarantees (the feature's whole point)

- **Lease mutual-exclusion** — at most one worker processes an item at a time
  (`TestQueue_LeaseNoDouble`); `acquire` is atomic under a mutex.
- **No data races** — `go test -race ./...` is green; counters are atomic; the channel
  lifecycle (`feederWG.Wait()` before `close(work)`) prevents send-on-closed.
- **Write safety** — the pool-wide 5s `busy_timeout` (in `store.Open`'s DSN) is the
  root-cause fix for cross-writer (scan `PutItem` + API reads + queue writes) lock
  contention; the queue additionally serializes its own writes.

## 9. What is NOT in B1 (outlined, not built)

B1 realized **only the substrate**. Still deferred:
- **B2** — image + EXIF enrichment (consumes the B1 queue unchanged).
- **B3** — real `tmdb`/`kinopoisk` fetch + `AuthContext` population + `_view` arbitration.
- An admin HTTP route over `ListFailures`; multi-instance lease coordination (Phase 2);
  `internal/stream` (file serving) and `internal/janitor` (cleanup cron).

Plugin contract, API surface, and `scan.Result` are **unchanged** by B1
(deprecate-don't-delete; `func Enrich(` preserved).
