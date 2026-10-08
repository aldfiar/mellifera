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
> scan-library wire contract is unchanged (deprecate-don't-delete). Behavior:
> `openspec/specs/plugin-pipeline/spec.md`.
>
> **Phase B1 (`async-enrichment`) layered on top — additive.** Enrichment is now
> ASYNC (architecture §4.4): `internal/enrich` gains a derived in-process
> `Queue` + bounded worker pool that drains pending `(item, plugin)` work derived
> from `items` + document namespaces + the `enrichment_failures` ledger (**no**
> queue/claim/lease table) under per-item in-memory leases with retry/backoff.
> `POST /scan` returns once items are persisted `pending`; workers drain to
> `enriched`/`ready` in the background. Additive: zero new protos, `go.mod`
> unchanged, plugin contract + API surface + `scan.Result` unchanged
> (deprecate-don't-delete). enrich 3→7, store 4→5 (both green ≤8). B3 (TMDB +
> `AuthContext`) remains **deferred** ([`docs/backlog.md`](backlog.md)).
> Operator runbook: [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/async-enrichment/spec.md`.
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
> enrichment per-source (the scan always succeeds). B3b (external image enrichers
> + RAW) and Phase C (post-action) remain **deferred**
> ([`docs/backlog.md`](backlog.md)). Operator runbook:
> [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/image-enrichment/spec.md`.
>
> **web-ui Phase 1 layered on top — additive.** Lands the Go-side UI foundation:
> a NEW `internal/web` package (`Handler`+`Options`) composes the chi `/api/*`
> router with the embedded SPA (`//go:embed all:dist` — the first real `go:embed`
> here), the code-generated OpenAPI spec (`/openapi.{yaml,json}`, embedded committed
> bytes), and Swagger UI (`/docs/` via `github.com/swaggo/http-swagger` — the first
> new Go runtime dep; NOTICE-documented; `swag` stays a dev/CI CLI like `protoc`).
> `internal/api` widens to role-aware auth (`Principal{Role}` + `Role` + two
> `requireRole` groups) + 3 additive GETs (`/libraries`, `/items/{id}`,
> `/admin/status` via a `Deps.Status` closure built in `cmd/mellifera` — INV2
> preserved). Additive: proto/sdk/scan/enrich/plugin/module byte-identical vs
> `58a1130`. api 3→7 (≤8); `internal/web` = 2. The Go gate (`make build`/`check`/
> `test`/`lint`) is **node-free**; `make web-build` is the only node/swag target
> (dev/CI-only). The public surface widens (R-2): `/`, `/assets/*`, `/openapi.*`,
> `/docs` are unauthenticated static (no data); all data stays role-gated. React
> app + client panels + B3 (TMDB) + Phase C (post-action) remain **deferred**
> (Phase 2+; [`docs/backlog.md`](backlog.md)). Operator runbook:
> [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/web-ui/spec.md`.
>
> **web-ui Phase 2a/2b/2c layered on top — additive (web-only).** Lands the
> React app itself: a NEW `web/` npm project (Vite 5 + React 18 + TypeScript
> strict + `react-router-dom` v6 + TanStack Query v5 + Tailwind CSS +
> shadcn/ui copy-in primitives) with the token-entry auth layer
> (`localStorage` `mellifera.token` + `<RequireAuth>` presence-only guard) and
> the **admin panel** (libraries list/add-library/per-row scan + a Status page
> with plugin health + enrich-queue stats). The committed
> `internal/web/dist/*` now holds the REAL hashed Vite build — the Phase-1
> placeholder `app.js` is gone. `make web-build` is corrected + uncommented
> (`cd web && npm ci && npm run build`; `web/` is the npm root, Vite `outDir`
> = `internal/web/dist`). Additive: ZERO Go source changes beyond test-only
> hash-agnostic adjustments (`internal/web/web_test.go`,
> `integration_web_test.go`) — `go.mod`, `internal/api` (7), `internal/web`
> (2 symbols), `cmd/`, protos, SDK, and every endpoint are byte-identical vs
> `47f276e`; zero new API endpoints. node/npm are dev/CI-only. Phase 2b
> (browse + item detail + metadata rendering) and 2c (theme toggle, empty/error
> states, route polish) shipped in the same openspec change (`web-ui-phase-2`,
> archived 2026-10-06 — one additive Go integration test
> `integration_web_items_test.go` is the only Go diff beyond test-only
> adjustments). Behavior: `openspec/specs/web-ui/spec.md`.

## Overview

Mellifera is a modular, plugin-based, self-hostable media server (Jellyfin/Plex class in scope, deliberately not a clone) shipped as a **single Go binary**. Storage is embedded SQLite with JSON columns (`json_extract`, generated columns). The only external CORE runtime dependency is `ffmpeg`/`ffprobe`, invoked via `os/exec`; the image-enricher plugin additionally requires `exiftool` (both invoked via `os/exec` arg-slice, never a shell). A missing `exiftool` soft-fails image enrichment per-source — the scan always succeeds (see the operator runbook). Plugins are `hashicorp/go-plugin` gRPC subprocesses — crash-isolated and cross-language-capable — embedded into the core binary via `go:embed` and extracted to a data directory on first run (D11 / Q20). Media documents are **dynamic JSON** (`google.protobuf.Struct` / `json.RawMessage`), explicitly not 357 typed DTOs (D2).

The differentiator versus the Jellyfin/Emby lineage is **subprocess plugin isolation**: a plugin crash never takes down the server, and the plugin contract is open to any gRPC-capable language (Q1, prior-art.md §3). The core is an **orchestrator, not a domain engine**: it knows capability *types* (gRPC service interfaces), never specific media types or plugin names. The strings `"movie"`, `"tv"`, `"tmdb"` appear in **config**, not in core code (architecture §0, design principle 1).

## Stack

| Layer | Choice | Source |
|---|---|---|
| Language | Go 1.25.0 (toolchain `go1.25.3`) | `go.mod`; enhanced_objective.md §2 |
| Storage | SQLite via `modernc.org/sqlite` (pure-Go, no CGO) + JSON columns | arch §1.2; enhanced_obj §4 (recommended; planner confirms) |
| HTTP router | `chi` v5 | ai-arch §3, module map |
| Web composition | `github.com/swaggo/http-swagger` v1.3.4 (Swagger UI at `/docs/`) — first runtime dep added by web-ui Phase 1; NOTICE-documented | ai-arch §4 `[web-ui]` row |
| OpenAPI codegen | `swaggo/swag` CLI (dev/CI only — like `protoc`; NOT a `go.mod` runtime dep) | Makefile `web-build`; operator runbook |
| Web UI (SPA) | React 18 SPA in `web/`: Vite 5 + TypeScript (strict) + `react-router-dom` v6 + TanStack Query v5 + Tailwind CSS v3 + shadcn/ui copy-in primitives (8) + Radix (label/select/slot only) | `web/package.json` (web-ui Phase 2a) |
| Frontend toolchain | `node` v24 / `npm` 11 — **dev/CI-only** (the only node target is `make web-build`); NOT `go.mod` or runtime deps — the binary embeds the committed Vite build | Makefile; `web/README.md` |
| Plugin transport | `hashicorp/go-plugin` v1.8.0 (gRPC subprocess) | arch §1.2, §2; D1 |
| RPC | `google.golang.org/grpc` + `google.golang.org/protobuf` | arch §2 |
| Codegen | `protoc` 29.3 (generated `*.pb.go` committed; `buf` not installed — protoc fallback) | arch §2; enhanced_obj §1 |
| Media probe | `ffmpeg`/`ffprobe` 7.1.1 via `os/exec` (arg slice, never shell) | arch §1.2; enhanced_obj §7 |
| Image metadata | `exiftool` via `os/exec` (arg slice, never shell) — RUNTIME dep (plugin-scoped); install: `brew install exiftool` / `apt install libimage-exiftool-perl` | image-enricher plugin (Phase B2); arch §1.2; operator runbook |
| Linter | `golangci-lint` v1.64.8 | `.golangci.yml` |
| Build | `go build` | conventions |
| Test | `go test` (table-driven per exported symbol) | mellifera-build skill |

CGO is avoided (pure-Go SQLite chosen to fit single-binary + cross-compile). No DI framework. No `reflect` (depguard-denied).

## Module layout (`scan-library` + `plugin-pipeline` Phase A + `async-enrichment` Phase B1 + `image-enrichment` Phase B2 + `web-ui` Phase 1 + `web-ui` Phase 2a)

Directory tree as realized by the foundational slice PLUS the additive Phase A,
Phase B1, Phase B2, web-ui Phase 1, and web-ui Phase 2a layers (grounded in
`docs/ai-architecture.md` §4 module map + `docs/architecture.md` §10). Symbol
counts are exported symbols per
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
│   ├── api/                        # chi router — PURE DELEGATION, zero logic (7 [web-ui]: +Role +AdminStatus/PluginHealth/EnrichStats; role-aware auth Principal{Role}+requireRole; 3 GETs /libraries /items/{id} /admin/status via Deps.Status closure; swag annotations)
│   ├── web/                        # [web-ui] embedding + composition layer (2: Handler+Options) — //go:embed all:dist (SPA) + embedded openapi.{yaml,json} + /docs (Swagger UI via swaggo/http-swagger); SPA fallback + immutable /assets cache; public surface (/, /assets, /openapi, /docs) unauthenticated; [2a] dist/* = the REAL hashed Vite build (placeholder app.js removed; embed target + 2 symbols unchanged)
│   ├── enrich/                     # metadata-side orchestrator + async derived-queue: Enrich/Deps/Result + Queue/QueueConfig/Stats/NewQueue (7; B1: queue.go/worker.go/lease.go/retry.go) — UNCHANGED in B2/web-ui
│   ├── itest/                      # [all features] black-box integration + QA suite (18 files, package `itest`) — external test package at internal/itest, NOT beside code: integration_* = per-feature AC-1 goldens (scan/pipeline/async/image) + web keystone; qa_* = independent acceptance + regression + pinned-baseline guards (git-diff additivity vs merge-bases, node-free build-gate dry-run). The server+plugin subprocess harness (startServer/qaStartServer/…, moduleRoot/buildBinary) is HERMETIC: every plugin is built into t.TempDir and pinned via MELLIFERA_* absolute paths, and make/git calls run with Dir=moduleRoot — the suite passes from any cwd (incl. a fresh checkout with no bin/ artifacts)
│   ├── stream/                     # DEFERRED
│   └── janitor/                    # DEFERRED
├── plugins/
│   ├── base-scanner/               # scanner subprocess: walk + ffprobe + withinRoot (media-type-agnostic; parseTV extracted); B2: image.go — module-type-gated image discovery + stdlib base info (jpeg/png dims; webp/heic soft-fail)
│   ├── tv-parser/                  # metadata_source subprocess: parseTV moved here verbatim; serves metadata.v1.MetadataSource
│   └── image-enricher/             # metadata_source subprocess [B2]: EXIF via the system exiftool (os/exec arg-slice); structural mirror of tv-parser; serves metadata.v1.MetadataSource
├── cmd/
│   └── mellifera/                  # flat main.go — constructor wiring (loads base-scanner + tv-parser + image-enricher [B2]; builds enrich.Deps; B1: enrich.NewQueue + Start/Stop + Notify + MELLIFERA_ENRICH_* knobs; B2: MELLIFERA_IMAGE_ENRICHER env; [web-ui]: composes web.Handler(api.New(deps),opts) as sole handler + builds Deps.Status closure + MELLIFERA_WEB_DEV; UNCHANGED in 2a)
└── web/                            # [web-ui 2a] React SPA (npm project root; node/npm DEV-ONLY): Vite 5 + React 18 + TS strict + react-router-dom + TanStack Query + Tailwind/shadcn (8 copy-in primitives); src/lib api.ts (typed DTOs + Bearer fetch wrapper; 4 pre-existing routes ONLY), auth.ts (localStorage token), queries.ts (4 hooks); pages Login + admin/{Admin,Libraries,Status}; Vitest 16 cases
```

Dependency direction points **down only**: `web → api → scan → enrich → {module, plugin} → store` (web-ui Phase 1: `internal/web` composes `internal/api`; api does not import web). Phase B1: scan no longer calls enrich inline — after persisting items `pending` it hands the library to the `enrich.Queue` via `Deps.Notify` (wired in `cmd/mellifera`); enrich still never imports scan. The worker pool is a process-lifetime component (started before serving, stopped on shutdown). `proto/` and `pkg/sdk` are shared leaves. No cycles (ai-arch §4). web-ui Phase 2a adds ZERO Go import edges — the SPA in `web/` is a same-origin HTTP client of `/api/v1/*` (Bearer header; no CORS), not an importer.

## Entry points

| Binary | Path | Role |
|---|---|---|
| Server | `cmd/mellifera/main.go` | Flat constructor wiring (no DI, no reflect). Reads config, opens store, loads **all three** plugins (base-scanner + tv-parser + image-enricher), constructs `enrich.Deps`, constructs + starts the async `enrich.Queue` (before serving) and wires `scan.Deps.Notify` → `queue.Notify` (process ctx); stops pool → plugins → store on shutdown. Reads `MELLIFERA_ENRICH_*` knobs (and `MELLIFERA_IMAGE_ENRICHER` — Phase B2). **web-ui Phase 1:** composes `web.Handler(api.New(deps), opts)` as the sole top-level handler; builds the `Deps.Status` closure over `mgr.Status` + `enrichQueue.Stats` (INV2 seam); reads `MELLIFERA_WEB_DEV`. |
| Scanner plugin | `plugins/base-scanner/main.go` | Separate subprocess binary using `pkg/sdk.Serve(...)`. **Media-type-agnostic** (Phase A): walks configured library root, runs `ffprobe` via arg slice, emits ONLY base fields (`relative_path`/`extension` + the verbatim ffprobe blob). TV parsing no longer lives here (extracted to tv-parser). Path-traversal guard (`withinRoot`) on every discovered path. |
| Metadata-source plugin | `plugins/tv-parser/main.go` | Phase A. Separate subprocess binary; the first `metadata_source` capability plugin. Houses `parseTV` (moved verbatim from base-scanner) and serves `metadata.v1.MetadataSource` (Match→BuildRequest→Convert→Merge) on one shared gRPC server via `pkg/sdk.Serve`. |
| Metadata-source plugin (image) | `plugins/image-enricher/main.go` | Phase B2. Separate subprocess binary; the second `metadata_source` capability plugin. A structural mirror of tv-parser (only the capability body differs: EXIF extraction via the system `exiftool` binary — `os/exec` arg-slice, never a shell — vs filename parse). `Match` applies for `module_type=="image"` or an image extension; `Convert` runs exiftool on `absolute_path` (carried by `Match`); `Merge` writes `sources["image-enricher"]` only. A missing/failing exiftool is a per-source SOFT-FAIL. |
| Web SPA | `web/src/main.tsx` | web-ui Phase 2a. NOT a separate process — the React root (`StrictMode` > `QueryClientProvider` > `BrowserRouter`); Vite builds it into the committed `internal/web/dist/`, which `internal/web` embeds into the single Go binary. Dev iteration runs `npm run dev` (Vite proxies `/api`, `/openapi.*`, `/docs` to `:8080`). |

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

## What exists now (`scan-library` + `plugin-pipeline` Phase A + `async-enrichment` Phase B1 + `image-enrichment` Phase B2 + `web-ui` Phase 1 + `web-ui` Phase 2a)

The foundational slice plus the additive Phase A, Phase B1, Phase B2, web-ui
Phase 1, and web-ui Phase 2a layers are implemented. For the five committed
layers all verification gates are green — `gofmt`/`build`/`vet`/`test`/`-race`/
`lint`/`check.sh` all PASS (no data races; reviewer PROCEED, health-check
HEALTHY PROCEED (P0/P1: 0), QA green; B1 `completed_count=13`; B2
`completed_count=11`; web-ui `completed_count=21`). **web-ui Phase 2a is NOT
yet committed**: it lives uncommitted on `feature/web-ui-phase-2` (HEAD =
`47f276e`), pipeline at **reviewer** — coder T01–T12 done
(`completed_count=11/16`; the T12 blocker was resolved by reviewer-accepted
test-only adjustments), `reviews/review_coder.md` verdict **PROCEED to commit +
merge**; the independent QA pass + docs tasks are still PENDING. Gates on the
working tree: `make build`/`check`/`lint` green, `go test ./internal/web/`
passes against the real Vite build, and the web/ Vitest suite is 16/16; the
`swag init` step of `make web-build` has a PRE-EXISTING `json.RawMessage` parse
issue (Phase-1-era; the committed `openapi.{json,yaml}` stay valid).

- `go.mod` (`github.com/mellifera/mellifera`, Go 1.25.0). **Unchanged** across Phase A/B1/B2/2a (additive). web-ui Phase 1 adds the first new Go runtime dep — `github.com/swaggo/http-swagger v1.3.4` (+ transitives) for the Swagger UI at `/docs/`; NOTICE-documented. `swag`/`swagfmt` stay dev/CI CLIs (not in `go.mod` as runtime). Phase 2a adds ZERO Go deps (the React toolchain lives in `web/package.json`, dev-only).
- Source under `mellifera/`: `cmd/`, `internal/{store,module,plugin,scan,api,enrich,web}/`, `pkg/sdk/`, `plugins/{base-scanner,tv-parser,image-enricher}/`, compiled `proto/mellifera/*/v1/*.pb.go` (**proto tree unchanged**), and (Phase 2a) the `web/` React SPA.
- `mellifera` binary (server) + `base-scanner` + `tv-parser` + `image-enricher` binaries via `make build` / `make build-plugin` (3 plugin binaries). The server serves the embedded React SPA (Phase 2a real build).
- `internal/itest/` — the black-box integration + QA suite, 18 files in package `itest` (moved off the repo root into Go-idiomatic layout; unit tests stay beside the code they test): `integration_test.go` (scan-library) + `integration_pipeline_test.go` (Phase A) + `integration_async_test.go` (Phase B1 AC-1 async golden) + `integration_image_test.go` (Phase B2 AC-1 async image golden) + `integration_web_test.go` (web-ui keystone) + `integration_web_items_test.go` (2a items contract) + `qa_*_test.go` (independent acceptance + regression for all slices) + `web/src/**/*.test.{ts,tsx}` (Vitest — Phase 2a+).
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
[`docs/api-reference.md`](api-reference.md) §4–§5; **async queue, env knobs, and the
non-blocking-scan runbook** -> [`docs/operator-runbook.md`](operator-runbook.md) §5;
behavioral requirements: `openspec/specs/{plugin-pipeline,async-enrichment}/spec.md`.

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

**Image lifecycle = the B1 lifecycle, unchanged.** Image items consume the SAME async queue as TV: scan persists each item `pending` (non-blocking) → the worker pool drains `(item, image-enricher)` → `enriched --settled--> ready`. EXIF provenance, soft-fail, and runtime-dep posture: **[`docs/operator-runbook.md`](operator-runbook.md)** §1/§4/§5; behavior: `openspec/specs/image-enrichment/spec.md`.

### web-ui Phase 1 additions (additive — `web-ui`)

web-ui Phase 1 lands the Go-side UI foundation WITHOUT touching the plugin contract,
the enrich queue, `scan.Result`, or proto/sdk (additive: `proto/`/`pkg/sdk`/
`internal/{scan,enrich,plugin,module}` byte-identical vs `58a1130`). Key additions:

- **`internal/web` (NEW; 2 symbols: `Handler`, `Options`).** The embedding + composition layer. `Handler(apiHandler, Options)` builds one chi router mounting `/api/*` → the passed-in api handler (nil-safe — tests serve SPA/swagger alone), `/openapi.{yaml,json}` → the embedded committed spec bytes, `/docs/*` → Swagger UI (`github.com/swaggo/http-swagger`), and `/` + `/assets/*` + SPA-fallback → the embedded SPA (`//go:embed all:dist` — the first real `go:embed` in the codebase). `/assets/*` (hashed filenames) → `Cache-Control: public, max-age=31536000, immutable`; `index.html` → `no-cache`; broken hashed assets 404 (fail fast). `Options.DevMode` collapses both to `no-cache` (for the Vite dev proxy). The public surface is intentionally unauthenticated; `/api/v1/*` carries its own role-gating. Owns NO domain logic — does not import plugin/enrich/module/scan/store.
- **`internal/api` (3→7: +`Role`, +`AdminStatus`, +`PluginHealth`, +`EnrichStats`).** Role-aware auth arrives as a TYPE not a bool: `Role` (`RoleAdmin` minted, `RoleClient` gated — the Phase-2 swap point), `Principal{Role}` with `IsAdmin()`, and two `requireRole` route groups (browse = admin+client read-only; admin = admin-only mutating + liveness). Handlers never fork on `Role` — the group is the only authZ gate (arch §11.5). 3 additive GETs ship (`/libraries`, `/items/{id}`, `/admin/status`); `/admin/status` reads a `Deps.Status` closure (built in `cmd/mellifera` over `mgr.Status`+`enrichQueue.Stats`) — the INV2 anti-corruption seam that keeps api free of plugin/enrich imports (mirrors `Deps.Scan`). `AdminStatus`/`PluginHealth`/`EnrichStats` are the exported seam-input wire types (INV4). swag annotations on all 6 handlers (comment-only metadata; INV1 preserved). `IsAdmin()` is a method → excluded from the `check.sh` count; 7 ≤ 8 green.
- **`internal/store` (stays 5; +`ListLibraries` method).** `ListLibraries(ctx) ([]Library, error)` — parameterized SQL (`?`-bound, `ORDER BY id ASC`); a method, excluded from the symbol budget.
- **`cmd/mellifera`.** Composes `web.Handler(api.New(deps), web.Options{DevMode: cfg.webDev})` as the SOLE top-level `http.Handler` (no second `http.Server`). Builds the `Deps.Status` closure (iterates the canonical `pluginIDs` set, maps `plugin.Health`→`api.PluginHealth` RFC3339-at-the-edge, reads `enrichQueue.Stats()`→`api.EnrichStats`; best-effort — a per-plugin error omits one entry, does not fail the snapshot). Reads `MELLIFERA_WEB_DEV` (`envBool`, default `false`).
- **`Makefile`.** New `web-build` target — DEV/CI-only (`swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml`; a commented Phase-2 `npm ci && npm run build`). NOT a prerequisite of `build`/`check`/`lint`/`test` (INV-node-free-gate).
- **`NOTICE`.** Records the bundled Swagger UI (Apache-2.0) served via `github.com/swaggo/http-swagger` + the code-generated OpenAPI spec.
- **`integration_web_test.go` + `qa_*_test.go`.** AC-1..AC-7 keystone (roles, swagger, list, item, admin-status, embed/delivery, build-gate node-free) + independent QA (browse-group default-deny, DTO-accuracy drift catcher, INV4 library wire key-set, empty-name asset guard, AC-7 node-free dry-run). Health-check P0/P1: 0; the two P2 cleanups (dead `Principal.Admin()` removed; byte-identical `libraryResponse`/`libraryDTO` collapsed) and two P3 doc-reconciliation notes (A-01/A-02) are recorded in the feature's review records (git history).

**Build-gate story (AC-7).** The Go gate (`make build`/`check`/`lint`/`test`) NEVER invokes `node`/`npm`/`swag` — it embeds COMMITTED artifacts (`internal/web/dist/*` — placeholder at Phase-1 time, real Vite build since 2a; `internal/web/api/openapi.{json,yaml}`). `make web-build` is the only node/swag-touching target (dev/CI). **Public-surface widens (R-2):** `/`, `/assets/*`, `/openapi.*`, `/docs` are now unauthenticated (static only — no data); all data stays behind role-gated `/api/v1/*`. Build-gate + R-2 posture + env knobs: **[`docs/operator-runbook.md`](operator-runbook.md)**.

### web-ui Phase 2a additions (additive — `web-ui-phase-2`)

Phase 2a lands the React app (scaffold + auth + admin library-management) WITHOUT
touching the Go side: `internal/api` (7 symbols), `internal/web` (2 symbols),
`cmd/mellifera`, `pkg/sdk/`, `proto/`, `plugins/`, and `go.mod` are byte-identical
vs `47f276e`; ZERO new API endpoints (the SPA consumes the 4 pre-existing routes:
`GET/POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`,
`GET /api/v1/admin/status`). Scoped by right-sizing: 2b (browse + item detail +
metadata rendering) + 2c (polish) are outlined for separate plans. Key additions:

- **`web/` (NEW npm project; node/npm dev-only).** Vite 5 + React 18 + TypeScript (strict) + `react-router-dom` v6 + TanStack Query v5 + Tailwind CSS v3. `vite.config.ts` sets `build.outDir = ../internal/web/dist` (the `//go:embed all:dist` target at `internal/web/web.go:20`), `emptyOutDir`, an `@/*` alias, and a dev proxy (`/api`, `/openapi.{yaml,json}`, `/docs` → `:8080`). `/web/dist/` and `node_modules/` are gitignored — the build output is committed at `internal/web/dist/`.
- **Auth layer (`web/src/lib/auth.ts` + `web/src/components/RequireAuth.tsx`).** Token-entry model (no Go login endpoint exists): `localStorage` under the fixed key `mellifera.token` (`useToken`/`getToken`/`setToken`/`clearToken`, try/catch-wrapped); `<RequireAuth>` is a presence-only guard (no format/claim validation — Go enforces authZ) that redirects to `/login` carrying `state.from`. XSS-in-localStorage is accepted for the 127.0.0.1-bound personal server (arch §11.5; revisit at D18).
- **API client (`web/src/lib/api.ts`).** DTO interfaces mirroring `internal/api/handlers.go` verbatim (`CreateLibraryRequest`, `LibraryDTO`, `LibrariesResponse`, `ScanResponse`, `PluginHealth`, `EnrichStats`, `AdminStatus`); `ApiError` (status/code/retryable); generic `apiRequest<T>` fetch wrapper — `Bearer` header whenever a token is present, `Accept: json`, JSON body stringify; 2xx → lossless `JSON.parse` (no rounding); 401 → `clearToken` + redirect to `/login`; non-2xx canonical-body → `ApiError`. `ENDPOINTS` lists ONLY the 4 pre-existing routes (AC-7).
- **Query hooks + provider root (`web/src/lib/queries.ts` + `main.tsx`).** `queryClient` singleton (mutations `retry: 0`), `useLibraries`, `useCreateLibrary` (invalidates `['libraries']` on success), `useScanLibrary` (no list invalidation — a scan does not change the row), `useAdminStatus` (`refetchInterval: 5000`). `main.tsx` = `StrictMode` > `QueryClientProvider` > `BrowserRouter`.
- **Admin panel pages.** `Login.tsx` (token-entry form, inline validation, already-authed → redirect); `admin/Admin.tsx` (shell + nav); `admin/Libraries.tsx` (list + add-library form with the NFS-mount note + per-row **Scan** button with inline `ScanResponse` and per-row error keyed by library, disabled while pending); `admin/Status.tsx` (plugin-health table + enrich-stats grid on a 5s poll; 503 → "Status unavailable"). Routing in `App.tsx`: `/login` public, `/admin/*` behind `<RequireAuth>`, `/` → `/admin` (becomes `/browse` in 2b).
- **shadcn/ui primitives (`web/src/components/ui/` — 8 files).** Copy-in `alert`, `badge`, `button`, `card`, `input`, `label`, `select`, `table` (cva variants, `forwardRef`, Apache-2.0 headers; Radix only behind `label`/`select`/`slot`). `lib/utils.ts` exports `cn()` (clsx + tailwind-merge). No shadcn runtime package.
- **`internal/web/dist/*` (REGENERATED bytes).** The real Vite build replaces the Phase-1 placeholder: `index.html` (`<div id="root">`, references the hashed assets) + `assets/index-*.js|css` (Vite-hashed names — rebuilt on every `npm run build`); `assets/app.js` placeholder deleted. The embed target, `web.Handler`, and `Options` are unchanged.
- **`Makefile` (`web-build` corrected + uncommented — R1).** `swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml` + `cd web && npm ci && npm run build` (the Phase-1 comment wrongly said `cd internal/web`); a comment block records the resolved paths. Still NOT a prerequisite of `build`/`check`/`lint`/`test` (node-free gate). Known dev-tooling limitation: the `swag init` step fails on a PRE-EXISTING `json.RawMessage` parse issue (Phase-1-era, out of 2a scope) — regen the SPA via `cd web && npm run build`; the committed `openapi.{json,yaml}` remain valid.
- **`.golangci.yml`.** + `issues.exclude-dirs: [node_modules]` — a stray `.go` example file inside an npm dep's tree tripped `golangci-lint run ./...` (and thus `check.sh`) on dev hosts. `node_modules/` is gitignored, so the node-less gate host is unaffected (reviewer-accepted deviation). The complexity-budget table is unchanged.
- **Test-only Go adjustments (`internal/web/web_test.go` + `integration_web_test.go`).** The Phase-1 tests hard-coded placeholder bytes (`/assets/app.js`, "Mellifera SPA placeholder"). Both now discover the first `.js` file in `dist/assets` at test time (hash-agnostic) and assert the `<div id="root">` mount point. This resolved the T12 blocker — no production Go source changed (reviewer-accepted deviation).
- **Tests.** `web/` Vitest (api wrapper incl. 401-clearToken+redirect and lossless number round-trip; query hooks incl. cache invalidation; Libraries list/add; scan trigger; Status; document accessors). Go: `integration_web_test.go` (AC-1..AC-7 keystone) updated as above.

### web-ui Phase 2b+2c additions (additive — same openspec change, archived 2026-10-06)

Phase 2b+2c complete the user-facing SPA on top of the 2a scaffold, still with a
byte-identical Go production tree (the only Go diff is the additive
`integration_web_items_test.go` items-contract test: library-required envelopes,
pagination constants 50/200, full-document byte-fidelity, 404 shape):

- **Browse (`web/src/pages/browse/Browse.tsx`).** Library-scoped item browsing: `useItems` (`["items", params]` TanStack Query hook, `?library=&limit=&offset=`) with pagination and per-library selection; routes live under `<RequireAuth>` (`/browse`, `/items/:id`; `/` and `*` → `/browse`).
- **Item detail + metadata rendering (`ItemDetail.tsx` + `web/src/components/metadata/`).** `useItem` (`["item", id]`) + the §3.1 document renderer: `SourceCard` (per-source namespaces), recursive `JsonValue`, `ProvenanceBadge` (per-field `_provenance`), `ViewFields` (`_view`), `StagesProgress` (`_stages`). Accessors live in `web/src/lib/document.ts` (`sourcesOf`/`viewEntries`/`provenanceEntries`/`stageEntries`) — components stay presentational; `lib/api.ts` gained `ItemDTO` (field names mirror the Go json tags verbatim) + `listItems`/`getItem`.
- **Polish (2c).** `ThemeToggle` (light/dark, persisted in `localStorage` `mellifera.theme`), shared loading/error/empty states (`components/states.tsx`), `AppNav` navigation, and SPA route polish.
- **`internal/web/dist/*` regenerated** for the new build. Client roles, `RoleClient` minting, and the recent-items widget remain deferred ([`backlog.md`](backlog.md)); behavior: `openspec/specs/web-ui/spec.md`.

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
**Realized in web-ui Phase 1 (no longer deferred):** the Go-side UI foundation — `internal/web` (SPA +
Swagger composition via `go:embed`) + role-aware auth (`Principal{Role}`/`requireRole`) + 3 additive
GETs + the `Deps.Status` liveness closure + the `make web-build` regen path (the `Principal` abstraction
grounds the deferred session-based multi-user auth, D18/Q15). **Realized in web-ui Phase 2a+2b+2c (no longer
deferred):** the real React app — `web/` (`package.json` + `vite.config.ts` + `web/src/`), the
token-entry auth layer (`localStorage` + `<RequireAuth>`), the admin panel (libraries list/add/scan +
status), the client **browse** panel + item detail with §3.1 metadata rendering, and the polish layer
(theme toggle, shared states) — embedded as the REAL Vite build at `internal/web/dist/` (the Phase-1
placeholder shell is gone). **Still deferred:** client panels for non-admin roles + the
`RoleClient` resolver (type exists, no minter yet), B3 (TMDB + `AuthContext`), Phase C
(post-action) — see [`backlog.md`](backlog.md).

The per-feature wf records (plans, contracts, reviews, qa, state) were removed on
2026-10-06 — behavior lives in `openspec/specs/` (scan-library, plugin-pipeline,
async-enrichment, image-enrichment, web-ui), the gate records in
`openspec/changes/archive/`, and the full records in git history.

## Open questions the planner must resolve

From the enhanced objective (nice-to-have unless marked blocking):

1. Whether to split the slice into a thinner first vertical if the full slice is too large for one clean pass (explicitly authorized).
2. SQLite driver — `modernc.org/sqlite` (recommended; planner confirms).
3. Module path — `github.com/mellifera/mellifera` (confirm or flag).
4. (Blocking at completion only) Whether `.claude/` (gitignored repo-wide) gets force-added on commit.
5. (Blocking at completion only) Whether `docs/` design docs get committed with the feature or separately.
