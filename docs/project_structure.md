# Mellifera — Project Structure

> **Foundational slice shipped.** The `scan-library` feature implemented the
> initial vertical: Go module, protos, `pkg/sdk`, `internal/{store,module,plugin,
> scan,api}`, `plugins/base-scanner`, `cmd/mellifera`, and the integration test.
> The module map in `docs/ai-architecture.md` §4 is now grounded in real code.
> Deferred packages (`internal/enrich`, `internal/stream`, `internal/janitor`)
> are marked below. Design-doc parents: `docs/architecture.md`,
> `docs/ai-architecture.md`, `docs/prior-art.md`, `docs/open-questions.md`.

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

## Module layout (implemented by `scan-library`)

Directory tree as realized by the foundational slice (grounded in `docs/ai-architecture.md` §4 module map + `docs/architecture.md` §10):

```
mellifera/
├── go.mod                          # module github.com/mellifera/mellifera, Go 1.25.0
├── .golangci.yml                   # complexity-budget gate (funlen/gocognit/gocyclo/lll/dupl/depguard)
├── docs/                           # design docs (read-only inputs; user-authored)
├── .claude/skills/mellifera-build/ # project-local build skill + scripts/check.sh (NON-NEGOTIABLE)
├── proto/mellifera/                # generated *.pb.go + *_grpc.pb.go committed
│   ├── common/v1/                  # MediaDocument, AuthContext, Provenance, ... (arch §2.1.1)
│   ├── scanner/v1/                 # Scanner service: Scan(stream), Identify (arch §2.1.2)
│   ├── metadata/v1/                # MetadataSource (generated; NOT exercised this feature)
│   └── plugin/v1/                  # Plugin service: Handshake, Health, Shutdown (arch §2.2.2)
├── pkg/sdk/                        # plugin SDK: Serve + Scanner + ScannerPlugin + Capability + HandshakeConfig (5)
├── internal/
│   ├── store/                      # SQLite: documents + control tables + reserved tables (11 WARN)
│   ├── plugin/                     # subprocess lifecycle + gRPC clients + capability routing (9 WARN)
│   ├── module/                     # config-driven module registry (6)
│   ├── scan/                       # scan-side orchestrator: Run/Deps/Result (3) — NEW
│   ├── api/                        # chi router — PURE DELEGATION, zero logic (3)
│   ├── enrich/                     # DEFERRED (not built this feature)
│   ├── stream/                     # DEFERRED
│   └── janitor/                    # DEFERRED
├── plugins/
│   └── base-scanner/               # subprocess binary (MAIN module for MVP): walk + ffprobe + TV parse + withinRoot
├── cmd/
│   └── mellifera/                  # flat main.go — constructor wiring only
├── integration_test.go             # AC-1 golden end-to-end scan (stdlib-only black-box)
└── qa_*_test.go                    # QA-1/QA-2 independent acceptance + regression
```

Dependency direction points **down only**: `api → scan → {module, plugin} → store` (scan inserted between api and {module, plugin}). `proto/` and `pkg/sdk` are shared leaves. No cycles (ai-arch §4).

## Entry points

| Binary | Path | Role |
|---|---|---|
| Server | `cmd/mellifera/main.go` | Flat constructor wiring (no DI, no reflect). Reads config, opens store, loads plugins, wires module registry, starts HTTP server. |
| Scanner plugin | `plugins/base-scanner/main.go` | Separate subprocess binary using `pkg/sdk.Serve(...)`. Walks configured library root, runs `ffprobe` via arg slice, parses TV filenames (`SxxExx` + show title; strips resolution/group tags), emits `DiscoveredFile`/`IdentifiedItem`. Path-traversal guard on every discovered path. |

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

## What exists now (after `scan-library`)

The foundational slice is implemented and all five verification gates + `go vet` are green (reviewer/health-check/QA all PROCEED):

- `go.mod` (`github.com/mellifera/mellifera`, Go 1.25.0) + `go.sum`.
- Source under `mellifera/`: `cmd/`, `internal/{store,module,plugin,scan,api}/`, `pkg/sdk/`, `plugins/base-scanner/`, compiled `proto/mellifera/*/v1/*.pb.go`.
- `mellifera` binary (server) + `base-scanner` binary via `make build` / `make build-plugin`.
- `integration_test.go` (AC-1 golden e2e) + `qa_*_test.go` (independent acceptance + regression).
- Inputs, still read-only: `docs/{architecture,ai-architecture,prior-art,open-questions}.md`, `.claude/skills/mellifera-build/`, `.golangci.yml`.

**Still NOT built** (deferred past this slice): `internal/enrich` (metadata-side queue/dispatch), `internal/stream` (range-request file serving), `internal/janitor` (cleanup cron); metadata plugins (`tmdb`, `kinopoisk`); `go:embed` first-run plugin extraction (dev-mode filesystem-path loading is used instead — D11/Q20); session-based multi-user auth (single admin token for MVP — D18/Q15); store methods for reserved tables (`RecordProgress`/`GetResume` — tables exist, methods deferred).

The `scan-library` enhanced objective lives at `mellifera/docs/scan-library/.phase_cache/enhanced_objective.md`.

## Open questions the planner must resolve

From the enhanced objective (nice-to-have unless marked blocking):

1. Whether to split the slice into a thinner first vertical if the full slice is too large for one clean pass (explicitly authorized).
2. SQLite driver — `modernc.org/sqlite` (recommended; planner confirms).
3. Module path — `github.com/mellifera/mellifera` (confirm or flag).
4. (Blocking at completion only) Whether `.claude/` (gitignored repo-wide) gets force-added on commit.
5. (Blocking at completion only) Whether `docs/` design docs get committed with the feature or separately.
