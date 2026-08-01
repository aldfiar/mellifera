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
> scan-library wire contract is unchanged (deprecate-don't-delete). Phase B
> (external TMDB enricher + `AuthContext` + async queue) and Phase C (post-action)
> remain **deferred/outlined**. Feature record: `docs/plugin-pipeline/`.

## Overview

Mellifera is a modular, plugin-based, self-hostable media server (Jellyfin/Plex class in scope, deliberately not a clone) shipped as a **single Go binary**. Storage is embedded SQLite with JSON columns (`json_extract`, generated columns). The only external core runtime dependency is `ffmpeg`/`ffprobe`, invoked via `os/exec`. Plugins are `hashicorp/go-plugin` gRPC subprocesses — crash-isolated and cross-language-capable — embedded into the core binary via `go:embed` and extracted to a data directory on first run (D11 / Q20). Media documents are **dynamic JSON** (`google.protobuf.Struct` / `json.RawMessage`), explicitly not 357 typed DTOs (D2).

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
| Linter | `golangci-lint` v1.64.8 | `.golangci.yml` |
| Build | `go build` | conventions |
| Test | `go test` (table-driven per exported symbol) | mellifera-build skill |

CGO is avoided (pure-Go SQLite chosen to fit single-binary + cross-compile). No DI framework. No `reflect` (depguard-denied).

## Module layout (foundational slice `scan-library` + `plugin-pipeline` Phase A)

Directory tree as realized by the foundational slice PLUS the additive Phase A
layer (grounded in `docs/ai-architecture.md` §4 module map + `docs/architecture.md`
§10; symbol counts are exported symbols, `WARN` = >8 but ≤12):

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
│   ├── store/                      # SQLite: documents + control tables + reserved tables (11 WARN; +items.status column, not symbols)
│   ├── plugin/                     # subprocess lifecycle + gRPC clients + capability routing (10 WARN; +MetadataSource accessor)
│   ├── module/                     # config-driven module registry (7; +MetadataSourceBinding, tv-parser seed)
│   ├── scan/                       # scan-side orchestrator: Run/Deps/Result (3; Deps.Enrich drives enrich)
│   ├── api/                        # chi router — PURE DELEGATION, zero logic (3; itemDTO.Status + ?status=)
│   ├── enrich/                     # metadata-side serial orchestrator: Enrich/Deps/Result (3) — REALIZED in Phase A
│   ├── stream/                     # DEFERRED
│   └── janitor/                    # DEFERRED
├── plugins/
│   ├── base-scanner/               # scanner subprocess: walk + ffprobe + withinRoot (media-type-agnostic; parseTV extracted)
│   └── tv-parser/                  # metadata_source subprocess: parseTV moved here verbatim; serves metadata.v1.MetadataSource
├── cmd/
│   └── mellifera/                  # flat main.go — constructor wiring (loads base-scanner + tv-parser; builds enrich.Deps)
├── integration_test.go             # scan-library AC-1 golden end-to-end scan (stdlib-only black-box)
├── integration_pipeline_test.go    # Phase A AC-1 golden end-to-end enrich pipeline (stdlib-only black-box)
└── qa_*_test.go                    # independent acceptance + regression (scan-library + Phase A)
```

Dependency direction points **down only**: `api → scan → enrich → {module, plugin} → store` (enrich sits between scan and {module, plugin}; scan calls enrich between Identify and PutItem). `proto/` and `pkg/sdk` are shared leaves. No cycles (ai-arch §4).

## Entry points

| Binary | Path | Role |
|---|---|---|
| Server | `cmd/mellifera/main.go` | Flat constructor wiring (no DI, no reflect). Reads config, opens store, loads **both** plugins (base-scanner + tv-parser), constructs `enrich.Deps`, wires module registry, starts HTTP server. |
| Scanner plugin | `plugins/base-scanner/main.go` | Separate subprocess binary using `pkg/sdk.Serve(...)`. **Media-type-agnostic** (Phase A): walks configured library root, runs `ffprobe` via arg slice, emits ONLY base fields (`relative_path`/`extension` + the verbatim ffprobe blob). TV parsing no longer lives here (extracted to tv-parser). Path-traversal guard (`withinRoot`) on every discovered path. |
| Metadata-source plugin | `plugins/tv-parser/main.go` | Phase A. Separate subprocess binary; the first `metadata_source` capability plugin. Houses `parseTV` (moved verbatim from base-scanner) and serves `metadata.v1.MetadataSource` (Match→BuildRequest→Convert→Merge) on one shared gRPC server via `pkg/sdk.Serve`. |

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

## What exists now (after `scan-library` + `plugin-pipeline` Phase A)

The foundational slice plus the additive Phase A layer are implemented and all
verification gates + `go vet` are green (reviewer PROCEED, health-check HEALTHY,
QA green — 13/13 tasks; `completed_count=13` pre-docs):

- `go.mod` (`github.com/mellifera/mellifera`, Go 1.25.0) + `go.sum` (**unchanged** in Phase A — additive, no new deps).
- Source under `mellifera/`: `cmd/`, `internal/{store,module,plugin,scan,api,enrich}/`, `pkg/sdk/`, `plugins/{base-scanner,tv-parser}/`, compiled `proto/mellifera/*/v1/*.pb.go` (**proto tree unchanged** — `metadata.v1` now exercised).
- `mellifera` binary (server) + `base-scanner` + `tv-parser` binaries via `make build` / `make build-plugin`.
- `integration_test.go` (scan-library AC-1 golden e2e) + `integration_pipeline_test.go` (Phase A AC-1 golden enrich pipeline) + `qa_*_test.go` (independent acceptance + regression for both slices).
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

#### Lifecycle + document schema (V5 hybrid)

Every persisted `Item` carries an indexed `status` in `{new, pending, parsed, enriched, failed, deleted}`
(core-managed like `file_id`; media-type-agnostic pipeline-stage names — arch §0 #1 holds). The
orchestrator advances `new→pending→parsed→pending→enriched` on success, `→failed` on hard error
(`→pending` on retry), `→deleted` on soft-delete; `enriched` requires ≥1 source succeeded ∧ 0 failed
(a partial run stays at the furthest-valid state). The `document` gains (arch §3.1):
`sources.<plugin_id>` (lossless per-source namespace), `_provenance.<field_path>` (per-field source
audit), `_view.<field>` (recomputable view; Phase-A last-writer), and `_stages[]` (per-stage progress,
`stage:"metadata_source"`). **Full state machine, status meanings, and provenance-reading** ->
[`docs/plugin-pipeline/api_reference.md`](plugin-pipeline/api_reference.md); state set/machine source
of truth: `docs/plugin-pipeline/acceptance.md` AC-7.

### Capability model

Two capability types now ship (the open-set the core knows): `scanner` (base-scanner) and
`metadata_source` (tv-parser + future enrichers). Phase A MAPS the user's parser/enricher categories
onto these two capabilities with **zero new protos** (decision D-1): tv-parser and any enricher
implement `metadata.v1.MetadataSource`. Plugin selection is driven strictly by `module.MetadataSources[]`
(config), never by `if mediaType == "tv"` (AC-4 — media-type literals appear only in `internal/module` seed config).

**Still NOT built** (deferred): `internal/stream` (range-request file serving), `internal/janitor`
(cleanup cron); **Phase B** — external enrichers (`tmdb`/`kinopoisk`), `AuthContext` population, async
enrichment queue, `_view` arbitration, `ready`/`stale` lifecycle states; **Phase C** — post-actions
(needs arch design). Also: `go:embed` first-run plugin extraction (dev-mode filesystem-path loading is
used instead — D11/Q20); session-based multi-user auth (single admin token for MVP — D18/Q15); store
methods for reserved tables (`RecordProgress`/`GetResume` — tables exist, methods deferred).

The `scan-library` enhanced objective lives at `mellifera/docs/scan-library/.phase_cache/enhanced_objective.md`;
the Phase A feature record lives at `mellifera/docs/plugin-pipeline/` (plan, contracts, acceptance, reviews, audit).

## Open questions the planner must resolve

From the enhanced objective (nice-to-have unless marked blocking):

1. Whether to split the slice into a thinner first vertical if the full slice is too large for one clean pass (explicitly authorized).
2. SQLite driver — `modernc.org/sqlite` (recommended; planner confirms).
3. Module path — `github.com/mellifera/mellifera` (confirm or flag).
4. (Blocking at completion only) Whether `.claude/` (gitignored repo-wide) gets force-added on commit.
5. (Blocking at completion only) Whether `docs/` design docs get committed with the feature or separately.
