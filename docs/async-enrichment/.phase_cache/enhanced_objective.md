# Enhanced Objective — async-enrichment

> Pre-approved by user (2026-08-03). Continues plugin-pipeline (Phase B) + adds image
> support. Builds on the shipped Phase A (scan-library + plugin-pipeline Phase A), both
> on `main` @ `6507277`. Planner uses this as the approved objective.

## Intent — two thrusts

1. **Async enrichment for EVERY enrichment.** Replace Phase A's *serial inline*
   orchestrator with an **async derived-queue (arch §4.4)**. Scan discovers +
   identifies synchronously, then **enqueues** each item for async enrichment;
   workers drain the queue with **per-item leases**, record failures to an
   **`enrichment_failures` ledger**, retry `failed→pending`, and advance
   `stale`/`ready` states. This is the load-bearing architectural change.
2. **Image media type + image-metadata enricher.** A new content type (images)
   plus a `metadata_source` plugin that extracts basic image metadata (EXIF:
   dimensions, camera make/model, date-taken, orientation; Russian/Unicode-safe).

Plus the rest of Phase B:
- **External enricher (TMDB)** — real HTTP fetch in BuildRequest→Convert.
- **`AuthContext`/`required_secrets`** — inject secrets at BuildRequest (external
  enrichers declare required API keys at handshake).
- **`failed→pending` retry**, **`stale`/`ready` lifecycle states**, **leases +
  `enrichment_failures` ledger** (§4.4).

## Foundation (Phase A, on main — reuse; refactor serial→async)
- `internal/enrich` (Phase A serial orchestrator) is refactored: the Match→
  BuildRequest→Convert→Merge chain + provenance (§3.1) + `nextState` become the
  per-item WORK a queue worker performs. Only DISPATCH changes (serial-inline →
  async-queue); the plugin contract (metadata_source RPCs) is unchanged.
- Reused/extended: pkg/sdk MetadataSource, plugins/tv-parser, internal/plugin
  caps-driven launch, store (status column + provenance/_view), api (?status=),
  cmd wiring.
- Additive where possible. The serial→async change refactors `enrich`'s entry
  point (Enrich → enqueue + worker), not a plugin/API contract break.

## Open questions for the planner (decide + justify; surface any needing the user)
1. **Async model (§4.4 derived-queue):** is the queue DERIVED from item status
   (items with status pending/failed ARE the queue) or a separate work table?
   Per-item leases (claim + timeout/reclaim)? Worker pool size + lifecycle
   (in-process goroutines, bounded)? How does `POST /scan` hand off — return
   immediately with items `pending` (async) or wait?
2. **Serial→async boundary:** what stays synchronous (discovery + base Identify
   via base-scanner) vs async (enrichment)? Backward-compat for the scan endpoint.
3. **Image discovery:** does base-scanner walk + probe images (ffprobe reads some
   image metadata) or a separate image-discovery path? Media-extension filter for
   images (jpg/png/webp/heic/...).
4. **Image enricher (EXIF):** pure-Go EXIF library (no CGO — e.g. dsoprea/go-exif
   or rwcarlsen/goexif) vs ffprobe image metadata. Which fields; Unicode-safe.
5. **External enricher (TMDB):** real HTTP client, API key via AuthContext/
   required_secrets, rate-limiting, response caching, soft-fail on errors/limits.
6. **Concurrency + isolation:** parallel enrichments (bounded worker pool; one
   enricher-subprocess shared or per-worker?); a crashing enricher stays isolated
  (Phase A go-plugin isolation holds).

## Acceptance sketch (planner refines)
- **AC-1:** image library scan → items discovered (base info) → enqueued → async
  enrichment (image EXIF enricher + optional external TMDB) → items reach
  enriched/ready with per-plugin provenance; listable via ?status=. REAL
  subprocesses + real image files + real HTTP (external).
- **AC-async:** enrichment is async — POST /scan does NOT block on enrichment;
  workers drain the queue; a failing enricher → failed→pending retry; leases
  prevent double-processing; restart resumes pending work.
- **AC-image:** image media type discovered; image enricher attaches EXIF to
  `sources.image-enricher` (+ _provenance/_view).
- **AC-external:** TMDB enricher fetches real data via AuthContext/secrets; soft-fails.
- **AC-states:** stale (file changed since last good scan) + ready (all configured
  stages done) lifecycle states work via nextState.
- **AC-2:** 5 gates green + go vet; ≤8 symbols/pkg; no reflect/DI; parameterized
  SQL; exec.Command arg-slice only.

## Out of scope (DEFERRED)
- Phase C (post-action capability) — still needs architecture design (no contract).
- go:embed first-run extraction (D11/Q20) — dev-mode filesystem plugin loading.
- Multi-user auth beyond admin token; streaming/playback; transcoding; janitor cron.

## Right-sizing (CRITICAL)
This is a LARGE feature (async refactor + image + external + auth + retry +
states). The objective EXPLICITLY authorizes phasing. Evaluate honestly against
the complexity budget (≤8 symbols/pkg, files <500, ≤15 steps, ≤8 ACs). Likely
phasing: (A) async-queue infra + serial→async migration + leases/ledger/retry/
stale-ready states; (B) image media type + image EXIF enricher; (C) external TMDB
enricher + AuthContext/secrets. Or a different grouping — planner decides and
documents; if phasing, scope THIS plan to Phase A and outline the rest.
