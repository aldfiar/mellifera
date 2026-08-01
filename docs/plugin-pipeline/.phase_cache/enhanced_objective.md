# Enhanced Objective — plugin-pipeline

> Status: pre-approved by user (2026-07-30/31). Builds on the shipped `scan-library`
> foundation. This is the realization of the `enrich` engine that `architecture.md`
> and `scan-library` **deferred**. Planner uses this as the approved objective.

## Intent

Generalize `scan-library`'s **single-plugin** model (one base-scanner) into a
**multi-stage, config-driven plugin pipeline**: categorized plugins run in
ordered stages, an orchestrator selects which plugins run per library/content
type from user config, and every piece of metadata is tagged with its source
plugin (provenance). The core stays an **orchestrator, not a domain engine** —
it knows plugin *categories/types*, never media-type strings (`"tv"`, `"tmdb"`
live in config, not core code — arch §0 principle 1, unchanged).

## The three plugin categories (DECIDED by user)

1. **Parser / discovery plugins** — initial parse + search. Gather *base info*
   (filename, extension, date, folder, path) and do type-specific parsing.
   - **`parseTV` is extracted out of `plugins/base-scanner` into a dedicated
     `tv-parser` plugin** (DECIDED). base-scanner becomes **discovery + base-info
   only** (walk + ffprobe + base fields). "All parsers are plugins" — no
   hardcoded media logic in the scanner.
2. **Enricher plugins** — consume parser output, add richer data.
   - A **TV enricher** adds show/season/episode/title from the parsed result.
   - An **external enricher** (e.g. TMDB, Kinopoisk) uses the parsed title to
     query an external library and merge richer metadata.
3. **Post-action plugins** (optional 3rd group) — run after enrichment
   (notifications, file organization, thumbnail generation, etc.).

## Orchestrator + config

- A pipeline orchestrator reads the **user's per-library config** to select which
  plugins run for each content type and **chains them** through the stages.
- **Bundled default plugins** cover common content types out-of-the-box (a fresh
  install can scan TV without external plugins); users **add external enrichers
  via config**.

## Item provenance (DECIDED direction)

The Item document records **which plugin contributed each piece of metadata**
(per-field source tagging). This is arch **principle 4 (precision / per-source
namespacing)** applied to plugin contributions. (Provenance is trivial in
`scan-library`'s single-plugin world; it becomes meaningful only with the
multi-plugin pipeline, so it lives HERE, not as a scan-library reopening.)

## Foundation (what scan-library already provides — reuse, don't rebuild)

- Go module + toolchain, `pkg/sdk` (Serve/Scanner/ScannerPlugin), the go-plugin
  subprocess substrate + Manager (lifecycle/§7.3 restart), `internal/store`
  (SQLite + JSON columns), `internal/api` (chi pure-delegation + admin auth),
  `internal/module` (config-driven registry), `cmd/mellifera` (flat wiring),
  the 4 proto packages, the build gate (`check.sh`/`.golangci.yml`).
- scan-library's `internal/scan` is the **scan-side** orchestrator analog; this
  feature adds the **enrich-side** multi-stage pipeline (the deferred
  `internal/enrich`).

## Open questions for the planner to resolve (decisions, then plan-review)

1. **Pipeline model**: fixed sequential stages (parser → enricher → post-action)
   or a configurable DAG? (User said "categories" + "orchestrator selects" —
   lean sequential stages first, DAG as a named revisit trigger.)
2. **Proto service shapes per category**: one gRPC service per category
   (Parser/Enricher/PostAction) vs. a single generic plugin service with a
   category field? Keep additive (deprecate-don't-delete) vs. the existing
   `scanner.v1.Scanner`/`plugin.v1.Plugin`.
3. **Provenance schema**: how to record per-field source on the dynamic-JSON
   document (namespaced sub-objects? a parallel provenance map? generated
   columns?). Must preserve precision (principle 4) and stay queryable.
4. **parseTV extraction boundary**: exact split between base-scanner (discovery
   + base-info) and the new tv-parser plugin; how Identify/DiscoveredFile
   evolve (additive — don't break scan-library's contract).
5. **Default plugin bundling**: are bundled defaults separate subprocess
  plugins (like base-scanner) or in-process? Dev-mode filesystem loading (as
  scan-library does) vs. `go:embed` first-run extraction (D11/Q20, still
  deferred)?
6. **External enricher auth/secrets**: the `AuthContext`/`required_secrets`
  machinery already exists in the metadata proto (§2.1.3) — reuse it for
  external enrichers (API keys for TMDB/Kinopoisk).

## Acceptance criteria (sketch — planner refines)

- AC-1: A TV library scan runs the full pipeline end-to-end: discovery plugin →
  tv-parser plugin → (optional) external enricher → persisted Item with
  per-plugin provenance, listable via the API. Real subprocesses + real ffprobe.
- AC-2: all 5 build gates green (build/test/golangci-lint v1/gofmt/check.sh) +
  go vet; ≤8 symbols/pkg; no reflect; no DI; parameterized SQL; exec arg-slice.
- AC-3: plugin category contracts (protos) extracted verbatim-from/faithful-to
  the design (additive to scan-library's protos).
- AC-4: the orchestrator selects plugins strictly from config (no media-type
  branching in core code — INV from scan-library holds).
- AC-5: provenance — each metadata field's source plugin is recorded + queryable.
- AC-6: a failing/missing enricher soft-fails (the scan still succeeds with what
  upstream stages produced) — extension of scan-library's AC-6 soft-fail.

## Out of scope (DEFERRED)

- Metadata plugin repository UI; multi-user auth beyond admin token; streaming/
  playback; transcoding; janitor cron. `go:embed` first-run extraction stays
  deferred (D11/Q20) — dev-mode filesystem plugin loading, as scan-library does.

## Approach hint

Additive + deprecate-don't-delete: extend the plugin substrate with category
types and a pipeline orchestrator; extract parseTV to a plugin; reuse the
existing `AuthContext`/`required_secrets` for external enrichers. Keep the core
media-type-agnostic. Right-size: if the full slice is too large for one pass,
the planner MAY propose phasing (e.g. Phase A: parser-category + parseTV
extraction + provenance; Phase B: enricher category + external enricher; Phase
C: post-action category) — surface it explicitly.
