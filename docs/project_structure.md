# Mellifera — Project Structure

> **Foundational slice shipped.** The `scan-library` feature implemented the
> initial vertical: Go module, protos, `pkg/sdk`, `internal/{store,module,plugin,
> scan,api}`, `plugins/base-scanner`, `cmd/mellifera`, and the integration test.
> The module map in `docs/ai-architecture.md` §4 is now grounded in real code.
> Design-doc parents: `docs/architecture.md`, `docs/ai-architecture.md`,
> `docs/prior-art.md`, `docs/open-questions.md`.
>
> **Phase A (`plugin-pipeline`) layered on top — additive.** Realizes
> `internal/enrich` (the metadata-side serial orchestrator), adds the
> `plugins/tv-parser` `metadata_source` subprocess, makes `base-scanner`
> media-type-agnostic (parseTV extracted into tv-parser), and adds the
> `items.status` lifecycle column. Zero new protos — tv-parser and the enrich
> chain implement the already-generated `metadata.v1.MetadataSource`. The
> scan-library wire contract is unchanged (deprecate-don't-delete). Feature record:
> `docs/plugin-pipeline/`.
>
> **Phase B1 (`async-enrichment`) layered on top — additive.** Enrichment is now
> ASYNC (architecture §4.4): `internal/enrich` gains a derived in-process
> `Queue` + bounded worker pool that drains pending `(item, plugin)` work derived
> from `items` + document namespaces + the `enrichment_failures` ledger (**no**
> queue/claim/lease table) under per-item in-memory leases with retry/backoff.
> `POST /scan` returns once items are persisted `pending`; workers drain to
> `enriched`/`ready` in the background. Additive: zero new protos, `go.mod`
> unchanged, plugin contract + API surface + `scan.Result` unchanged
> (deprecate-don't-delete). enrich 3→7, store 4→5 (both green ≤8). B2 (image+EXIF)
> + B3 (TMDB + `AuthContext`) remain **outlined** (consumers of the B1 queue).
> Feature record: `docs/async-enrichment/`; operator runbook:
> [`docs/async-enrichment/api_reference.md`](async-enrichment/api_reference.md).
>
> **Phase B2 (`image-enrichment`) layered on top — additive.** Lands the image
> media type + EXIF enrichment as the SECOND consumer of the B1 queue: a new
> `plugins/image-enricher` `metadata_source` subprocess (structural mirror of
> tv-parser; reads EXIF via the system `exiftool` binary — `os/exec` arg-slice,
> NO new Go dep), module-type-gated image discovery in `plugins/base-scanner`
> (`image.go`), an `absolute_path` stamp in `internal/scan`, and an `image`
> module seed in `internal/module`. Additive: zero new protos, `go.mod` unchanged,
> plugin contract + API surface + `scan.Result` + the B1 queue unchanged
> (deprecate-don't-delete). `metadata_source` now ships tv-parser + image-enricher
> (still ZERO new capability types — `image_provider` stays reserved). `exiftool`
> is a RUNTIME dep (like ffmpeg/ffprobe); a missing exiftool soft-fails image
> enrichment per-source (the scan always succeeds). B3 (TMDB + `AuthContext`)
> + Phase C (post-action) remain **outlined**. Feature record:
> `docs/image-enrichment/`; operator runbook:
> [`docs/image-enrichment/operator_runbook.md`](image-enrichment/operator_runbook.md).

## Overview

Mellifera is a modular, plugin-based, self-hostable media server (Jellyfin/Plex class in scope, deliberately not a clone) shipped as a **single Go binary**. Storage is embedded SQLite with JSON columns (`json_extract`, generated columns). The only external CORE runtime dependency is `ffmpeg`/`ffprobe`, invoked via `os/exec`; the image-enricher plugin additionally requires `exiftool` (both invoked via `os/exec` arg-slice, never a shell). A missing `exiftool` soft-fails image enrichment per-source — the scan always succeeds (see the operator runbook). Plugins are `hashicorp/go-plugin` gRPC subprocesses — crash-isolated and cross-language-capable — embedded into the core binary via `go:embed` and extracted to a data directory on first run (D11 / Q20). Media documents are **dynamic JSON** (`google.protobuf.Struct` / `json.RawMessage`), explicitly not 357 typed DTOs (D2).

The differentiator versus the Jellyfin/Emby lineage is **subprocess plugin isolation**: a plugin crash never takes down the server, and the plugin contract is open to any gRPC-capable language (Q1, prior-art.md §3). The core is an **orchestrator, not a domain engine**: it knows capability *types* (gRPC service interfaces), never specific media types or plugin names. The strings `"movie"`, `"tv"`, `"tmdb"` appear in **config**, not in core code (architecture §0, design principle 1).

## Stack

| Layer | Choice | Source |
|---|---|---|
| Language | Go 1.25.0 (toolchain `go1.25.3`) | `go.mod`; enhanced_objective.md §2 |
| Storage | SQLite via `modernc.org/sqlite` (pure-Go, no CGO) + JSON columns | arch §1.2; enhanced_obj §4 (recommended; planner confirms) |
| HTTP router | `chi` v5 | ai-arch §3, module map |
| Plugin transport | `hashicorp/go-plugin` v1.8.0 (gRPC subprocess) | arch §1.2, §2; D1 |
| RPC | `google.golang.org/grpc` + `google.golang.org/protobuf` | arch §2 |
| Codegen | `protoc` 29.3 (generated `*.pb.go` committed; `buf` not installed — protoc fallback) | arch §2; enhanced_obj §1 |
| Media probe | `ffmpeg`/`ffprobe` 7.1.1 via `os/exec` (arg slice, never shell) | arch §1.2; enhanced_obj §7 |
| Image metadata | `exiftool` via `os/exec` (arg slice, never shell) — RUNTIME dep (plugin-scoped); install: `brew install exiftool` / `apt install libimage-exiftool-perl` | image-enricher plugin (Phase B2); arch §1.2; operator runbook |
| Linter | `golangci-lint` v1.64.8 | `.golangci.yml` |
| Build | `go build` | conventions |
| Test | `go test` (table-driven per exported symbol) | mellifera-build skill |

CGO is avoided (pure-Go SQLite chosen to fit single-binary + cross-compile). No DI framework. No `reflect` (depguard-denied).

## Module layout (`scan-library` + `plugin-pipeline` Phase A + `async-enrichment` Phase B1 + `image-enrichment` Phase B2)

Directory tree as realized by the foundational slice PLUS the additive Phase A,
Phase B1, and Phase B2 layers (grounded in `docs/ai-architecture.md` §4 module map +
`docs/architecture.md` §10). Symbol counts are exported symbols per
`scripts/check.sh`, which counts **top-level** `func/type/var/const` decls only
(method receivers excluded); `WARN` = >8 but ≤12:

```
mellifera/
├── go.mod                          # module github.com/mellifera/mellifera, Go 1.25.0
├── .golangci.yml                   # complexity-budget gate (funlen/gocognit/gocyclo/lll/dupl/depguard)
├── docs/                           # design docs (read-only inputs; user-authored)
├── .claude/skills/mellifera-build/ # project-local build skill + scripts/check.sh (NON-NEGOTIABLE)
├── proto/mellifera/                # generated *.pb.go + *_grpc.pb.go committed
│   ├── common/v1/                  # MediaDocument, AuthContext, Provenance, ... (arch §2.1.1)
│   ├── scanner/v1/                 # Scanner service: Scan(stream), Identify (arch §2.1.2)
│   ├── metadata/v1/                # MetadataSource (generated; EXERCISED in Phase A by tv-parser + sdk + enrich)
│   └── plugin/v1/                  # Plugin service: Handshake, Health, Shutdown (arch §2.2.2)
├── pkg/sdk/                        # plugin SDK (7): + MetadataSource + MetadataSourcePlugin in Phase A
├── internal/
│   ├── store/                      # SQLite: docs + control + reserved tables (5 top-level; +ledger.go FailureRow + busy_timeout in B1; methods excluded by check.sh)
│   ├── plugin/                     # subprocess lifecycle + gRPC clients + capability routing (10 WARN; +MetadataSource accessor)
│   ├── module/                     # config-driven module registry (7; +MetadataSourceBinding; tv-parser seed [A] + image-enricher image-module seed [B2])
│   ├── scan/                       # scan-side orchestrator: Run/Deps/Result (3; B1: persists pending + Notify(libraryID), drops inline enrich, re-scan→stale; B2: stamps absolute_path into parsed for all items)
│   ├── api/                        # chi router — PURE DELEGATION, zero logic (3; itemDTO.Status + ?status=)
│   ├── enrich/                     # metadata-side orchestrator + async derived-queue: Enrich/Deps/Result + Queue/QueueConfig/Stats/NewQueue (7; B1: queue.go/worker.go/lease.go/retry.go) — UNCHANGED in B2
│   ├── stream/                     # DEFERRED
│   └── janitor/                    # DEFERRED
├── plugins/
│   ├── base-scanner/               # scanner subprocess: walk + ffprobe + withinRoot (media-type-agnostic; parseTV extracted); B2: image.go — module-type-gated image discovery + stdlib base info (jpeg/png dims; webp/heic soft-fail)
│   ├── tv-parser/                  # metadata_source subprocess: parseTV moved here verbatim; serves metadata.v1.MetadataSource
│   └── image-enricher/             # metadata_source subprocess [B2]: EXIF via the system exiftool (os/exec arg-slice); structural mirror of tv-parser; serves metadata.v1.MetadataSource
├── cmd/
│   └── mellifera/                  # flat main.go — constructor wiring (loads base-scanner + tv-parser + image-enricher [B2]; builds enrich.Deps; B1: enrich.NewQueue + Start/Stop + Notify + MELLIFERA_ENRICH_* knobs; B2: MELLIFERA_IMAGE_ENRICHER env)
├── integration_test.go             # scan-library AC-1 golden end-to-end scan (stdlib-only black-box)
├── integration_pipeline_test.go    # Phase A AC-1 golden end-to-end enrich pipeline (stdlib-only black-box)
├── integration_async_test.go       # Phase B1 AC-1 golden: scan→pending→async drain→ready (stdlib-only black-box)
├── integration_image_test.go       # Phase B2 AC-1 golden: image scan→pending→async drain→ready + real-EXIF provenance (stdlib-only black-box)
└── qa_*_test.go                    # independent acceptance + regression (scan-library + Phase A + Phase B1 + Phase B2)
```

Dependency direction points **down only**: `api → scan → enrich → {module, plugin} → store`. Phase B1: scan no longer calls enrich inline — after persisting items `pending` it hands the library to the `enrich.Queue` via `Deps.Notify` (wired in `cmd/mellifera`); enrich still never imports scan. The worker pool is a process-lifetime component (started before serving, stopped on shutdown). `proto/` and `pkg/sdk` are shared leaves. No cycles (ai-arch §4).

## Entry points

| Binary | Path | Role |
|---|---|---|
| Server | `cmd/mellifera/main.go` | Flat constructor wiring (no DI, no reflect). Reads config, opens store, loads **all three** plugins (base-scanner + tv-parser + image-enricher), constructs `enrich.Deps`, constructs + starts the async `enrich.Queue` (before serving) and wires `scan.Deps.Notify` → `queue.Notify` (process ctx); stops pool → plugins → store on shutdown. Reads `MELLIFERA_ENRICH_*` knobs (and `MELLIFERA_IMAGE_ENRICHER` — Phase B2). |
| Scanner plugin | `plugins/base-scanner/main.go` | Separate subprocess binary using `pkg/sdk.Serve(...)`. **Media-type-agnostic** (Phase A): walks configured library root, runs `ffprobe` via arg slice, emits ONLY base fields (`relative_path`/`extension` + the verbatim ffprobe blob). TV parsing no longer lives here (extracted to tv-parser). Path-traversal guard (`withinRoot`) on every discovered path. |
| Metadata-source plugin | `plugins/tv-parser/main.go` | Phase A. Separate subprocess binary; the first `metadata_source` capability plugin. Houses `parseTV` (moved verbatim from base-scanner) and serves `metadata.v1.MetadataSource` (Match→BuildRequest→Convert→Merge) on one shared gRPC server via `pkg/sdk.Serve`. |
| Metadata-source plugin (image) | `plugins/image-enricher/main.go` | Phase B2. Separate subprocess binary; the second `metadata_source` capability plugin. A structural mirror of tv-parser (only the capability body differs: EXIF extraction via the system `exiftool` binary — `os/exec` arg-slice, never a shell — vs filename parse). `Match` applies for `module_type=="image"` or an image extension; `Convert` runs exiftool on `absolute_path` (carried by `Match`); `Merge` writes `sources["image-enricher"]` only. A missing/failing exiftool is a per-source SOFT-FAIL. |

## Conventions snapshot (enforced by `.claude/skills/mellifera-build/` + `.golangci.yml`)

- **≤8 exported symbols per package** (12 hard fail) — `scripts/check.sh` counts; ai-arch §5.
- **`doc.go` per package** — the entire public API in one file (contract-first).
- **Pure core, thin shell** — logic = pure functions; I/O only at `store/plugin/stream/api/janitor` edges.
- **`api/` is pure delegation** — a handler does exactly three things: parse request → call ONE domain function → write response. No branching, no orchestration (ai-arch §3).
- **No DI framework, no `reflect`** — depguard denies both in `.golangci.yml`.
- **Flat `main.go`** — the entire app graph readable in one file.
- **Data-type boundaries, not interfaces** — structs cross packages; interfaces ONLY at the plugin seam with ≥2 implementations.
- **No shared mutable types across packages** — cross-package data crosses a struct conversion.
- **Table-driven test for every exported symbol** — tests are the spec AND the acceptance gate.
- **Parameterized SQL only** — no string-built queries (golang-security skill).
- **Apache-2.0 license headers** on every `.go` file (D12, Q18).
- **Precision over collapse** — per-source values namespaced and preserved exactly (design principle 4).
- **Deprecate, don't delete** — reserved fields, additive changes, deprecation markers (design principle 6).
- **Russian-language data is first-class** — no English-only assumptions (arch §1.2).

Complexity budget (`.golangci.yml` + `check.sh`):

| Metric | Warn | Fail |
|---|---|---|
| Exported symbols / package | >8 | >12 |
| Outgoing intra-core deps / package | >4 | >6 |
| File length | >300 lines | >500 |
| Function cognitive complexity | >10 | >15 (`gocognit`, `gocyclo`) |
| Function length (funlen) | — | 60 lines / 40 statements |
| Line length (lll) | — | 120 |
| Duplicate code (dupl) | — | threshold 100 |
| Exported symbol without table test | — | any |

A failed check means **redesign**, not relax (skill: "a fail means redesign").

## Key architectural decisions (immutable — D1–D20)

All DECIDED or DEFAULTED in `docs/open-questions.md`; none OPEN. Load-bearing for the planner:

- **D1** gRPC (not net/rpc) for plugin transport.
- **D2** Dynamic JSON documents, no typed DTOs.
- **D3** Namespaced per-source document + recomputable view.
- **D11 / Q20** Single-file delivery via `go:embed` + first-run extraction (D10 sibling-files superseded). First-run *extraction* itself is **deferred** for scan-library — the feature loads base-scanner from a filesystem path (dev mode).
- **D12** Apache-2.0 (core + SDK + bundled plugins); DCO, no CLA.
- **D15 / Q2** Proto-first thin SDK now; full SDK before Phase 2.
- **D18 / Q15** Auth: single admin token for MVP; `Principal` abstraction grounds Phase 2 multi-user.
- **D20** Playback progress & resume: `playback_progress` table + `GET /items/{id}/resume` + `POST /items/{id}/progress`.

Q1–Q28 carry reversible defaults with named revisit triggers (see `docs/open-questions.md`). Risk register R1–R14 lives there too.

## What exists now (`scan-library` + `plugin-pipeline` Phase A + `async-enrichment` Phase B1 + `image-enrichment` Phase B2)

The foundational slice plus the additive Phase A, Phase B1, and Phase B2 layers are
implemented and all verification gates are green — `gofmt`/`build`/`vet`/`test`/
`-race`/`lint`/`check.sh` all PASS (no data races; reviewer PROCEED, health-check
HEALTHY PROCEED (P0/P1: 0), QA green; B1 `completed_count=13`; B2 `completed_count=11`
= 7 coder + 2 QA + 2 docs):

- `go.mod` (`github.com/mellifera/mellifera`, Go 1.25.0) + `go.sum` (**unchanged** across Phase A, B1, and B2 — additive, no new deps; `exiftool` is a runtime dep, not a Go dep).
- Source under `mellifera/`: `cmd/`, `internal/{store,module,plugin,scan,api,enrich}/`, `pkg/sdk/`, `plugins/{base-scanner,tv-parser,image-enricher}/`, compiled `proto/mellifera/*/v1/*.pb.go` (**proto tree unchanged**).
- `mellifera` binary (server) + `base-scanner` + `tv-parser` + `image-enricher` binaries via `make build` / `make build-plugin` (3 plugin binaries).
- `integration_test.go` (scan-library) + `integration_pipeline_test.go` (Phase A) + `integration_async_test.go` (Phase B1 AC-1 async golden) + `integration_image_test.go` (Phase B2 AC-1 async image golden) + `qa_*_test.go` (independent acceptance + regression for all four slices).
- Inputs, still read-only: `docs/{architecture,ai-architecture,prior-art,open-questions}.md`, `.claude/skills/mellifera-build/`, `.golangci.yml`.

### Phase A additions (additive — `plugin-pipeline`)

Phase A realizes the metadata-side pipeline WITHOUT touching the scan-library
wire contract (AC-3: zero proto edits; `scanner.v1`/`plugin.v1`/`sdk.Scanner`/`sdk.Serve`
byte-identical; base-scanner launch path byte-identical). Key additions:

- **`internal/enrich` (3 symbols: `Enrich`, `Deps`, `Result`).** The metadata-side analog of `internal/scan`. An inline, serial orchestrator that, per configured `metadata_source`, runs the 4-RPC chain **Match→BuildRequest→Convert→Merge** over `metadata.v1.MetadataSource` (RPCs stubbed fetch; `AuthContext` empty — Phase B). Owns a pure `nextState` transition function (every legal + illegal transition encoded + unit-tested) that advances the `items.status` lifecycle, and authoritative per-field `_provenance` + recomputable `_view` assembly. Plugin sees only an empty document and writes its `sources.<id>` namespace (namespace isolation enforced — a foreign write is rejected+reverted; arch §3.2 L2, §3.3).
- **`plugins/tv-parser` (subprocess; no exported symbols).** The first `metadata_source` plugin. `parseTV`/`cleanTitle`/`parentDir`/`atoi` + 4 regexes moved **verbatim** from `plugins/base-scanner/tvparse.go`; base-scanner Identify now stamps only base fields (media-type-agnostic). Serves `metadata.v1.MetadataSource` on one shared gRPC server via `sdk.Serve` + `sdk.MetadataSourcePlugin`.
- **`pkg/sdk` (5→7: `MetadataSource` interface + `MetadataSourcePlugin` dispense).** The capability-2 adapter, mirroring `Scanner`/`ScannerPlugin`.
- **`internal/plugin` (9→10 WARN: `Manager.MetadataSource(pluginID, capabilityID)` accessor).** Plugin launch is now **capability-driven** — the client-plugin set is built from each plugin's declared `[]sdk.Capability` (base-scanner's set is byte-identical to scan-library's hardcoded set; AC-3 preserved).
- **`internal/module` (6→7: `MetadataSourceBinding` + `Module.MetadataSources[]`).** The `metadata_sources` enrichment chain is modeled in config order; the `tv` module seeds `tv-parser` (priority 1).
- **`internal/store` (stays 11; `items.status` is a column, not symbols).** New indexed `status` column (default `"new"`); `QueryItems` gained an additive `status` filter param (`""` ⇒ all statuses); `Item.Status` field.
- **`internal/scan` (stays 3: `Run`/`Deps`/`Result`).** New `Deps.Enrich enrich.Deps` field — scan calls enrich **between Identify and PutItem** (an exported field, not a 4th symbol).
- **`internal/api` (stays 3).** Additive `itemDTO.Status` (`json:"status"`) response field + optional `?status=` query filter.
- **`cmd/mellifera`.** Loads tv-parser alongside base-scanner and constructs `enrich.Deps` (env `MELLIFERA_TV_PARSER`, default `bin/tv-parser`).

### Phase B1 additions (additive — `async-enrichment`)

Phase B1 realizes the async enrichment substrate (architecture §4.4) WITHOUT
touching the plugin contract, the API surface, or the `scan.Result` shape (AC-3:
proto/SDK/plugins/API diff empty vs `6507277`; `func Enrich(` preserved). Key
additions:

- **`internal/enrich` (3→7: + `Queue`, `QueueConfig`, `Stats`, `NewQueue`).** The async derived-queue dispatcher (arch §4.4). `Queue` derives pending `(item, plugin)` work from `items` + the document `sources` namespaces + the `enrichment_failures` ledger (no queue/claim/lease table — INV-derived-not-stored), feeds a bounded channel (`Workers*4`), and a worker pool drains it under per-item in-memory leases (serialize-within-item, parallelize-across-items). Per-source in-memory retry/backoff (`retry.go`); terminal failure writes a ledger row + cooldown (loop-safety), a later success clears it (reset-on-success). New files: `queue.go`, `worker.go`, `lease.go`, `retry.go`. `Enrich` (sync per-item chain) is preserved (deprecate-don't-delete, AC-3); the worker shares its helpers (`runSource`/`nextState`/`applyContribution`/`appendStage`) but does not call `Enrich` directly.
- **`internal/store` (4→5 top-level: + `FailureRow`).** New `ledger.go` with `FailureRow` + `RecordFailure`/`ClearFailure`/`ListFailures` (the `enrichment_failures` ledger escape hatch — no DDL; the table existed from Phase A). New pool-wide **5s `busy_timeout`** PRAGMA in `Open`'s DSN (`withBusyTimeout`) — the root-cause fix for pooled-connection write-lock errors under the async pool. (The methods are excluded from the ≤8 budget by `check.sh`; the Phase-A "11" narrative counted them.)
- **`internal/scan` (stays 3).** Drops inline enrich: persists each item `pending` and, once the scanner stream drains, calls `Notify(ctx, libraryID)` once (new `Deps.Notify` func field, nil-safe). A re-scan whose base identity (`parsed`+`ffprobe`) changed → `stale`; an unchanged re-scan preserves the prior status (a `ready` item is not regressed). `scan.Result` shape is unchanged — only timing (scan returns before enrichment drains).
- **`internal/api` (stays 3).** Unchanged surface; `?status=` now meaningfully filters the new `pending`/`ready`/`stale` states (passes any value through; empty = all).
- **`cmd/mellifera`.** Constructs `enrich.NewQueue`, `Start`s it before the server serves (so the first scan's `Notify` lands in a running pool), wires `scan.Deps.Notify` → `queue.Notify` over the **process** ctx (not the per-request ctx), and `Stop`s on shutdown (HTTP → pool → plugins → store). Reads `MELLIFERA_ENRICH_*` knobs (defaults: workers 4, max-attempts 3, lease-TTL 60s, backoff 2s, exhausted-cool 7d, no-data-cool 30d, cool-cap 365d).
- **`integration_async_test.go`.** The B1 AC-1 async golden: scan → items `pending` → bounded poll until the async drain settles TV items to `ready` (tv-parser namespace + tmdb attempted-but-unavailable ⇒ `allSourcesTerminal` ⇒ settled), Cyrillic preserved, `?status=ready` filter asserted.

**D-Q1 (load-bearing deviation):** a source is queueable iff `AuthMode != "CLIENT"` (not the §4.4-literal `== SERVER`). The seeded `tv` module reflects this: `tv-parser` (empty `auth_mode`, queued), `tmdb` (`SERVER`, queued but unloaded in B1 → runs-but-unavailable ⇒ terminal-at-settle), `kinopoisk` (`CLIENT`, excluded from the background queue — Mode-B-only).

#### Lifecycle + document schema (V5 hybrid)

Every persisted `Item` carries an indexed `status` in `{new, pending, parsed, enriched, failed, deleted, ready, stale}`
(core-managed like `file_id`; media-type-agnostic pipeline-stage names — arch §0 #1 holds). The
orchestrator advances `new→pending→parsed→pending→enriched` on success, `→failed` on hard error
(`→pending` on retry), `→deleted` on soft-delete; `enriched` requires ≥1 source succeeded ∧ 0 failed
(a partial run stays at the furthest-valid state). **Phase B1** adds `enriched --settled--> ready`
(all queueable sources terminal: done, in-ledger-cooldown, or ran-but-produced-no-work) and the re-scan
transitions `* --stale--> stale`, `stale --rehydrate--> pending`; `failed --retry--> pending` is now
exercised by the queue (defined-but-unused in Phase A). The `document` gains (arch §3.1):
`sources.<plugin_id>` (lossless per-source namespace), `_provenance.<field_path>` (per-field source
audit), `_view.<field>` (recomputable view; Phase-A last-writer), and `_stages[]` (per-stage progress,
`stage:"metadata_source"`). **Full state machine, status meanings, and provenance-reading** ->
[`docs/plugin-pipeline/api_reference.md`](plugin-pipeline/api_reference.md); **async lifecycle, env
knobs, and the non-blocking-scan runbook** -> [`docs/async-enrichment/api_reference.md`](async-enrichment/api_reference.md);
state set/machine source of truth: `docs/plugin-pipeline/acceptance.md` AC-7 (+ B1 `ready`/`stale` in
`docs/async-enrichment/acceptance.md`).

### Phase B2 additions (additive — `image-enrichment`)

Phase B2 lands the image media type + EXIF enrichment WITHOUT touching the plugin
contract, the API surface, the B1 queue, or `scan.Result` (AC-3: `proto/`/
`internal/api/`/`internal/enrich/`/`pkg/sdk/`/`go.mod` diff empty vs `e2a7562`). Key
additions:

- **`plugins/image-enricher` (subprocess; 0 exported symbols).** The second `metadata_source` plugin — a structural mirror of `plugins/tv-parser` (only the capability body differs). `Convert` reads EXIF by invoking the **system `exiftool`** binary via `os/exec` arg-slice (`-j -n <selected tags> <absPath>`, never a shell — mirrors `ffprobe.go`); maps `{ImageWidth→width, ImageHeight→height, FileType→format, Make→make, Model→model, DateTimeOriginal→date_taken, Orientation→orientation, GPSLatitude→gps_lat, GPSLongitude→gps_lon}`. `Match` applies for `module_type=="image"` or an image extension and carries `absolute_path`; `Merge` writes `sources["image-enricher"]` only. Every exiftool failure is a per-source SOFT-FAIL → empty namespace → B1 `no_data` → settle (AC-6). **NO new Go dep** — `exiftool` is a runtime dep (see the operator runbook).
- **`plugins/base-scanner` (+`image.go`).** Module-type-**gated** discovery (not a union): `walk` selects `imageMime` (jpg/jpeg/png/webp/heic/heif) only when `module_type=="image"`, else the video `mediaMime` (a union filter would discover TV cover-art jpgs — R-I4). `probeImage` decodes jpeg/png dims via stdlib `image.DecodeConfig`; webp/heic/heif/RAW base-info soft-fails (no stdlib decoder — exiftool supplies their data at enrichment). ffprobe is NEVER invoked for images.
- **`internal/scan` (stays 3).** `assembleBaseDoc` stamps `absolute_path = filepath.Join(root, rel)` into `doc["parsed"]` for EVERY item (media-type-agnostic — INV2; no `module_type` branch). This is the only file-location channel into the enricher chain (the B1 chain passes an empty Merge doc). Additive — tv-parser ignores it (TV goldens pass).
- **`internal/module` (stays 7).** Second idempotent seed: an `image` module config row binding base-scanner + image-enricher (priority 1, local/no `auth_mode`, no `filename_format`). `imageConfigJSON` is an unexported const → no new exported symbol.
- **`cmd/mellifera`.** Loads + starts + stops the image-enricher subprocess (3rd plugin), started before the server serves (INV-start-before-serve). `config.imageEnricherPath = envOr("MELLIFERA_IMAGE_ENRICHER", "bin/image-enricher")`. No new import.
- **`Makefile`.** `build-plugin` now builds 3 binaries (base-scanner, tv-parser, image-enricher); a runtime-deps comment documents ffmpeg/ffprobe + exiftool.
- **`integration_image_test.go`.** The B2 AC-1 golden: real server + 3 plugin subprocesses + REAL exiftool over stdlib-encoded image fixtures (jpeg/png + exiftool-stamped EXIF + ffmpeg webp + sips heic); scan non-blocking → items `pending` → bounded poll until settled `ready`; `sources."image-enricher"` carries real EXIF + `_provenance`/`_view`/`_stages`; soft-fail + Cyrillic + HEIC + stray-`.mkv`-gated-out asserted.

**Image lifecycle = the B1 lifecycle, unchanged.** Image items consume the SAME async queue as TV: scan persists each item `pending` (non-blocking) → the worker pool drains `(item, image-enricher)` → `enriched --settled--> ready`. EXIF provenance, soft-fail, and runtime-dep posture: **[`docs/image-enrichment/operator_runbook.md`](image-enrichment/operator_runbook.md)**; state machine: `docs/image-enrichment/acceptance.md`.

### Capability model

Two capability types now ship (the open-set the core knows): `scanner` (base-scanner) and
`metadata_source` (tv-parser + image-enricher — two shipping plugins, still ZERO new capability types;
`image_provider` stays reserved). Phase A MAPS the user's parser/enricher categories
onto these two capabilities with **zero new protos** (decision D-1): tv-parser, image-enricher, and any enricher
implement `metadata.v1.MetadataSource`. Plugin selection is driven strictly by `module.MetadataSources[]`
(config), never by `if mediaType == "..."` (AC-4 — media-type literals appear only in `internal/module` seed config).

**Still NOT built** (deferred): `internal/stream` (range-request file serving), `internal/janitor`
(cleanup cron); **Phase B3** — external enrichers (`tmdb`/`kinopoisk` real fetch + `AuthContext`
population, `_view` arbitration); **Phase C** — post-actions (needs arch design). Also: `go:embed`
first-run plugin extraction (dev-mode filesystem-path loading is used instead — D11/Q20); session-based
multi-user auth (single admin token for MVP — D18/Q15); store methods for reserved tables
(`RecordProgress`/`GetResume` — tables exist, methods deferred); an admin HTTP route over
`store.ListFailures` (the method ships in B1; the route is deferred — B1-light). Realized in B1 (no
longer deferred): the **async enrichment queue** + worker pool + per-item leases + the
`enrichment_failures` ledger + `failed→pending` retry + the `ready`/`stale` lifecycle states + the
pool-wide `busy_timeout`. **Realized in B2 (no longer deferred):** image+EXIF enrichment (image media
type + the `image-enricher` `metadata_source` subprocess + module-type-gated image discovery); RAW image
discovery (`.cr2/.nef/.arw/.dng`) remains deferred (exiftool reads RAW natively — cheap to add to `imageMime` later).

The `scan-library` enhanced objective lives at `mellifera/docs/scan-library/.phase_cache/enhanced_objective.md`;
the Phase A feature record lives at `mellifera/docs/plugin-pipeline/`; the Phase B1 feature record
lives at `mellifera/docs/async-enrichment/`; the Phase B2 feature record lives at
`mellifera/docs/image-enrichment/` (plan, contracts, acceptance, reviews, audit, qa, operator runbook).

## Open questions the planner must resolve

From the enhanced objective (nice-to-have unless marked blocking):

1. Whether to split the slice into a thinner first vertical if the full slice is too large for one clean pass (explicitly authorized).
2. SQLite driver — `modernc.org/sqlite` (recommended; planner confirms).
3. Module path — `github.com/mellifera/mellifera` (confirm or flag).
4. (Blocking at completion only) Whether `.claude/` (gitignored repo-wide) gets force-added on commit.
5. (Blocking at completion only) Whether `docs/` design docs get committed with the feature or separately.
