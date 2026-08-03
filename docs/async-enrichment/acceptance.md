# Acceptance Criteria — async-enrichment (Phase B1: async substrate)

> **Scope:** this plan delivers the async enrichment SUBSTRATE (arch §4.4 derived
> queue + worker pool + per-item leases + in-memory retry/backoff +
> `enrichment_failures` ledger for loop-safety + serial→async migration +
> `failed→pending` retry + `ready`/`stale` states). It proves the async path
> end-to-end with the EXISTING `tv-parser` (local, no auth) — **no new plugin, no
> external HTTP, no new dependency.** Image media type (B2) and external TMDB +
> AuthContext/secrets (B3) are OUTLINED, not built (see implementation_plan §Right-sizing).

## Source
User request (enhanced objective, `.phase_cache/enhanced_objective.md`):
"Async enrichment for EVERY enrichment. Replace Phase A's serial inline
orchestrator with an async derived-queue (arch §4.4). Scan discovers +
identifies synchronously, then enqueues each item for async enrichment;
workers drain the queue with per-item leases, record failures to an
enrichment_failures ledger, retry failed→pending, and advance stale/ready
states." — decided items: async-for-every-enrichment, image type + EXIF, all
Phase B features. **Right-sizing split this into B1 (this plan) / B2 (image) /
B3 (TMDB+auth)** — the image/EXIF/TMDB ACs from the sketch are deferred to B2/B3.

## Lifecycle state machine (extended — load-bearing for AC-states)

```
                                   (worker drains all queueable sources to terminal)
   new ──begin──> pending ──parsed──> parsed ──…──> enriched ──settled──> ready
     │              │        │           │             │
     │              └────────┴───────────┴─────────────┴──failed──>  (hard/terminal-fail)
     │                                          failed ──retry──> pending   (Phase B, NOW exercised)
     │                                          (re-scan detects file change)
     │                                          * ──stale──> pending         (NEW: re-scan change → pending)
     └────────────────────────────────────────── * ──deleted──> deleted      (soft-delete, unchanged)
```
- Existing (Phase A): `new,pending,parsed,enriched,failed,deleted` (`internal/enrich/state.go:11-18`).
- **NEW (B1):** `ready` (async settlement — all queueable sources terminal: done or
  terminal-failure-in-cooldown, derivation finds no pending work for the item);
  `stale` (re-scan detected the file changed since last good scan → re-enrich).
- `retry` (`failed→pending`, `state.go:65`) is defined but unexercised in Phase A — **B1 exercises it.**

## Scenarios

### AC-1: Async pipeline end-to-end with provenance + ready state (golden)
- **Given**: a TV library fixture (SxxExx filenames) + the shipped `tv-parser` plugin loaded.
- **When**: `POST /api/v1/libraries/{id}/scan` is called.
- **Then**: scan discovers + base-identifies each file and persists items with `status='pending'` (base §3.1 document, NO enrichment inline). A bounded worker pool derives the pending `(item, tv-parser)` tasks, claims per-item leases, drains the `tv-parser` chain (Match→BuildRequest→Convert→Merge) async, writes `sources.tv-parser.{...}` + `_provenance` + `_view` + `_stages`, and advances each item to `ready`. Items are listable via `GET /api/v1/items?status=ready` (and `?status=pending` mid-drain). REAL subprocesses + real files; no inline enrich call remains in `scan.persist`.
- **User intent**: enrichment happens in the background after scan returns; every item still reaches its enriched/ready state with full provenance.
- **Verify probe (e2e)**: `./mellifera-integration-async` golden binary → exit 0 AND asserts each item has `sources.tv-parser`, a `_provenance` entry naming `tv-parser`, and `status='ready'` (no item left `pending` once the pool drains).
- **Covers tasks**: T05 (queue), T06 (scan enqueue), T07 (cmd wiring), T08 (integration golden)

### AC-2: All build gates green
- **Given**: the implemented B1 code.
- **When**: the mellifera build gate runs.
- **Then**: `go vet ./...`, `go build ./...`, `go test ./...`, `golangci-lint` (funlen/gocognit/gocyclo/lll/depguard/dupl), and `check.sh` (≤8 exported symbols/pkg WARN, ≤12 FAIL; files <500 lines; no generated-symbol budget breach) all pass.
- **User intent**: the change stays within the project's navigability budget.
- **Verify probe**: `bash .claude/skills/mellifera-build/scripts/check.sh` → `check.sh: OK`; `go test ./...` → PASS.
- **Covers tasks**: [all]

### AC-3: Additive — plugin contract + API surface unbroken (structural/negative)
- **Given**: the B1 refactor (serial→async dispatch).
- **When**: the plugin contract and API are inspected.
- **Then**: `metadata.v1.MetadataSource` RPCs, `pkg/sdk.MetadataSource`, `plugins/tv-parser`, and the API endpoints (`POST /libraries/{id}/scan`, `GET /items?status=`) are UNCHANGED on the wire — only DISPATCH moved (serial-inline → async-queue). The serial `enrich.Enrich` per-item function is preserved (now called by the worker) — deprecate-don't-delete. No new proto, no new SDK symbol.
- **User intent**: the refactor is internal; plugins and clients keep working.
- **Verify probe (negative)**: `git diff -- 'proto/**' 'pkg/sdk/metadata.go' 'plugins/tv-parser/**'` → empty (no contract edits); `grep -rn 'func Enrich(' internal/enrich/` → ≥1 hit (preserved).
- **Covers tasks**: [T-enrich-queue, T-scan-migrate]

### AC-async: POST /scan does NOT block on enrichment
- **Given**: a library with N items and a worker pool.
- **When**: `POST /scan` is called and returns.
- **Then**: the HTTP response returns promptly after discovery + identify + persist (items at `status='pending'`); enrichment is NOT awaited inline. Workers continue draining in the background. `scan.Result` reports `Discovered`/`Persisted`; enrichment progress is observable via `?status=` (items move pending→ready over time).
- **User intent**: scan feels instant; a large library doesn't block the HTTP request on enrichment.
- **Verify probe**: integration test asserts the scan handler returns BEFORE items reach `ready` (≥1 item `pending` at return time); after the pool drains, all items `ready`.
- **Covers tasks**: [T-scan-migrate, T-wiring]

### AC-lease: per-item lease prevents double-processing
- **Given**: the worker pool (≥1 worker) and an in-memory lease map `item_id → {plugin_id, owner, expires_at}` (arch §4.4 — at most ONE lease per `item_id`).
- **When**: an item is in-flight (lease held by worker A) and a second dispatch tick considers it.
- **Then**: the item is NOT dispatched to worker B (or a second A-worker) while the lease is held. We parallelize ACROSS items, SERIALIZE WITHIN an item. A lease whose holder died expires lazily (checked on every dispatch tick) and the item is re-dispatched — no DB writes for acquire/refresh/expire.
- **User intent**: no duplicate enrichment / double-writes for the same item.
- **Verify probe**: unit test drives two workers, asserts exactly one holds a given item's lease at a time; a killed-worker lease is reclaimed after expiry; `enrichment_failures` is NOT written per-claim (only on terminal failure).
- **Covers tasks**: [T-enrich-queue]

### AC-ledger: loop-safety + reset-on-success + restart-resume (the §4.4 guarantee)
- **Given**: the `enrichment_failures` ledger (`internal/store/open.go:98`, already in the schema) + in-memory exponential backoff (`max_attempts` default 3, terminal cooldown default 7d `exhausted` / 30d `no_data`, cap 365d).
- **When**:
  (a) a source fails transiently → it is requeued in-memory with backoff up to `max_attempts`, then on exhaustion a terminal `enrichment_failures(item,plugin,status='exhausted', next_eligible_at=now+7d)` row is written and derivation SKIPS the pair until eligibility — no infinite loop;
  (b) a pair that had a ledger row later succeeds → the row is DELETED (reset-on-success);
  (c) the core restarts → the in-memory queue + leases are gone, pending work is RE-DERIVED from `items`, and already-exhausted pairs are NOT re-derived into a loop (only per-session in-memory retry counters reset).
- **Then**: a chronically-failing entity is retried on a bounded, decaying schedule, never forever; the hot path stays at zero queue writes on success (only the document write + a one-row delete on recovery); "what was not processed" is always answerable (pending / done / terminally-failed).
- **User intent**: the system can't get stuck retrying a broken source forever, and a restart loses no work.
- **Verify probe**: unit tests assert (a) failure→backoff→exhausted→ledger row→derivation-skip; (b) success-after-ledger→row deleted; (c) restart re-derives pending but skips a row within cooldown.
- **Covers tasks**: [T-store-ledger, T-enrich-queue]

### AC-states: failed→pending retry + ready/stale advanced via nextState
- **Given**: the extended state machine (`ready`, `stale` added; `retry` exercised).
- **When**:
  (a) an item is `failed` and becomes eligible for retry → `failed --retry--> pending` (now exercised, was defined-but-unused in Phase A `state.go:65`);
  (b) an item's queueable sources all reach terminal state → `--settled--> ready`;
  (c) a re-scan detects a file changed since its last good scan → `--stale--> pending` (re-enrich).
- **Then**: `nextState` (the PURE table function, `internal/enrich/state.go:74`) accepts the new legal transitions and rejects illegal ones; the store persists the advanced status; `?status=ready|stale|pending` lists them.
- **User intent**: the lifecycle reflects async reality — items settle to `ready`, recover from `failed`, and re-enrich when the file changed.
- **Verify probe**: `nextState` table test covers every new legal transition + rejects an illegal one (e.g. `ready --parsed-->` is illegal); integration asserts an item reaches `ready` post-drain.
- **Covers tasks**: [T-state-machine, T-tests]

## Coverage Matrix
| Scenario | Tasks | Verified By |
|---|---|---|
| AC-1 (golden e2e async) | T05 (queue), T06 (scan enqueue), T07 (wiring), T08 (integration golden) | QA-01 (joint) + reviewer |
| AC-2 (gates) | T01-T09 (all) | QA-02 (gate re-run) + reviewer |
| AC-3 (additive/structural) | T05 (Enrich preserved), T06 (Result shape), T09 (negative probes) | QA-02 (structural) + reviewer |
| AC-async (non-blocking scan) | T06 (scan migrate), T07 (wiring), T08 (timing assertion) | QA-01 + reviewer |
| AC-lease (no double-processing) | T04 (lease), T05 (dispatch no-double) | QA-01 (race joint) + reviewer |
| AC-ledger (loop-safety + restart) | T02 (ledger), T03 (retry), T05 (dispatch + derivation) | QA-01 (ledger joints) + reviewer |
| AC-states (retry + ready/stale) | T01 (nextState), T05 (settled/retry), T06 (stale), T08 (?status=) | QA-01 (boundary) + reviewer |

> 7 scenarios — under the 8-gate. The image/EXIF (AC-image) and external-TMDB
> (AC-external) scenarios from the objective sketch are deferred to Phase B2/B3.
