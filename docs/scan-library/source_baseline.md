# Source Baseline — scan-library

> **Greenfield feature.** No source exists under `mellifera/` yet. This file
> transcribes the *planned* public-API shape (design intent, grounded in the
> design docs + module map) and confirms the greenfield state. Per the grounding
> skill: claims about files the coder **will** create are stated as design
> intent, not existing facts.

## Greenfield confirmation (verified 2026-07-21)

`find mellifera -name '*.go' -not -path '*/docs/*'` returns only the build
skill's module-template (`mellifera/.claude/skills/mellifera-build/module-template/{doc,greet,greet_test}.go`).

- No `mellifera/go.mod` — **scan-library creates it.**
- No `mellifera/proto/`, `pkg/sdk/`, `internal/*/`, `plugins/`, `cmd/` source.
- No compiled proto bindings. No `mellifera` binary. No `base-scanner` binary.
- `find mellifera -name '*.proto'` → empty.

What DOES exist (read-only inputs, never modified by this feature):

- `mellifera/docs/{architecture,ai-architecture,prior-art,open-questions}.md` — authoritative design.
- `mellifera/.claude/skills/mellifera-build/` — NON-NEGOTIABLE build skill + `scripts/check.sh`.
- `mellifera/.golangci.yml` — lint config / complexity budget.
- `mellifera/docs/project_structure.md` — planner's primary grounding source.

## Planned modules + public-API shape (≤8 symbols target, 12 hard fail)

Each row is design intent. Symbol counts are the planner's target; the specifier
and coder own the final count and must keep every package under the 12-fail
ceiling. `doc.go` per package is mandatory and IS the contract.

| Package (path) | Owns | Exported symbols (planned) | Count | Notes |
|---|---|---|---|---|
| `github.com/mellifera/mellifera` (go.mod) | module root | — | — | Go 1.22+, no CGO |
| `proto/mellifera/{common,scanner,metadata,plugin}/v1` | gRPC contracts | generated `.pb.go` | **exempt** | Verbatim from arch §2. Generated code is vendor contract, not hand-written API — see R2 in architecture_review.md (check.sh must exclude `*.pb.go`). |
| `pkg/sdk` | plugin SDK (shared leaf) | `Serve`, `ScannerPlugin`, `Scanner`, `HandshakeConfig` | 4 | D15/Q2 thin SDK. `Scanner` interface has two impls: author's server side + core's subprocess client wrapper (justifies the interface — see R8). |
| `internal/store` | SQLite (all tables, all SQL) | `Store`, `Item`, `Library`, `Open`, `Close`, `CreateLibrary`, `GetLibrary`, `GetItem`, `PutItem`, `QueryItems` | 10 (WARN) | Owns schema per §9.1/§9.2 + generated columns. `playback_progress` table CREATED (reserved); its methods (`RecordProgress`/`GetResume`) DEFERRED. WARN documented — store is the richest package by nature (multiple entities); 10 < 12 fail ceiling. |
| `internal/plugin` | subprocess lifecycle + gRPC clients | `Manager`, `Deps`, `Health`, `Open`, `Load`, `Start`, `Stop`, `Status`, `Scanner` | 9 (WARN) | go-plugin handshake (arch §2.2.1) + minimal restart (§7.3). `Scanner(pluginID, capID)` is the typed capability accessor — the module map's `Call` realized as a typed accessor (no reflect). WARN documented. |
| `internal/module` | config-driven module registry | `Registry`, `Module`, `Open`, `Get`, `List` | 5 | Loads TV module config (arch §2.4). Depends on store (reads `modules` table). |
| `internal/scan` | scan orchestrator (NEW — analog of deferred `enrich`) | `Deps`, `Result`, `Run` | 3 | Resolves library's module → scanner capability → streams `Scan` → `Identify` → `store.PutItem`. Keeps `api/` pure-delegation (handler calls ONE function). See decision log. |
| `internal/api` | chi router — PURE DELEGATION | `Deps`, `Principal`, `New` | 3 | admin-token middleware (Principal=admin, Q15/D18). 3 handlers, unexported. DTOs unexported; struct conversion at store boundary. |
| `plugins/base-scanner` (package main) | scanner binary | `main` | 0 (main pkg) | Uses `pkg/sdk.Serve`. Scanner impl + path-guard + ffprobe arg-slice + TV filename parser, all unexported, table-tested in-package. |
| `cmd/mellifera` (package main) | flat wiring | `main` | 0 (main pkg) | No DI, no reflect. Constructor list only. |

WARN summary: `internal/store` (10) and `internal/plugin` (9) exceed the ≤8
target but stay well under the 12 hard-fail ceiling. Both are justified by
owning multiple entities / lifecycle phases; the planner flags them for the
specifier to either accept at WARN or split. No package approaches the 12-fail
gate.

## Test inventory (greenfield — none yet)

No tests exist. This feature CREATES the test layout. Convention (from
mellifera-build skill + module-template):

- One `<pkg>/<symbol>_test.go` per exported symbol, table-driven, in-package (`package <pkg>`).
- `internal/store` tests use a temp SQLite DB (`t.TempDir()` + `:memory:` or temp file) — no shared fixture.
- `internal/plugin` tests use an in-process fake plugin launched via `sdk.Serve` (no real subprocess needed for unit tests; the integration test uses the real `base-scanner` subprocess).
- `internal/scan` tests use a fake `sdk.Scanner` (second implementation — justifies the interface, R8).
- `plugins/base-scanner` tests: TV parser + path-guard + ffprobe JSON extraction are pure-function table tests; one subprocess smoke test launches the binary via `sdk.Serve` + dials it.
- `internal/api` tests use `httptest` against the chi router with stubbed domain deps.
- One integration test (acceptance): scans a small fixture directory into a temp SQLite DB end-to-end and asserts items persisted.
- `check.sh` fails on any exported symbol without a co-located test.

Test exclusions (what NOT to test this feature): metadata plugins (TMDB/Kinopoisk), streaming/playback, transcoding, janitor, enrichment queue — all DEFERRED.

## Cross-module dependency table (planned — downward only, no cycles)

Per arch §10 + ai-arch §4. Direction: `api → scan → {module, plugin} → store`. `proto/` and `pkg/sdk` are shared leaves.

| Symbol (consumer → provider) | Defined in | Consumed by | Evidence |
|---|---|---|---|
| `sdk.Scanner` (interface) | `pkg/sdk` | `internal/plugin` (client wrapper), `internal/scan` (calls Scan/Identify), `plugins/base-scanner` (author impl) | arch §2.1.2 service Scanner; ai-arch §4 pkg/sdk row |
| `sdk.Serve` | `pkg/sdk` | `plugins/base-scanner/main.go` | arch §10 pkg/sdk; Q2 |
| `sdk.ScannerPlugin` (plugin.GRPCPlugin) | `pkg/sdk` | both sides of the gRPC seam | arch §2.2.1; Q2 |
| `store.Item` | `internal/store` | `internal/scan` (writes), `internal/api` (serializes, via DTO conversion) | arch §9.1 items table |
| `store.Library` | `internal/store` | `internal/scan` (reads root_path + module_id) | arch §9.1 libraries table |
| `store.Open` | `internal/store` | `cmd/mellifera` (wiring) | module map |
| `plugin.Manager` + `Scanner` accessor | `internal/plugin` | `internal/scan` (gets scanner client), `cmd/mellifera` (wiring) | ai-arch §4 plugin row |
| `module.Registry` + `Get` | `internal/module` | `internal/scan` (resolves library's module → scanner capability binding) | arch §2.4.3 |
| `scan.Run` | `internal/scan` | `internal/api` (the ONE domain call the scan handler makes) | pure-delegation rule |
| `api.New` | `internal/api` | `cmd/mellifera` (wiring) | module map |
| `api.Principal` | `internal/api` | middleware resolves it; handlers read from context (Q15/D18 grounding) | arch §11.5 |
| proto messages (`scannerv1.ScanRequest`, `DiscoveredFile`, `IdentifyResult`, …) | `proto/mellifera/.../v1` | cross-cutting (sdk, scan, plugin, base-scanner) | arch §2.1.1 / §2.1.2 |

## Architectural invariants this feature MUST establish (load-bearing for every later feature)

1. **Plugins are subprocesses, not in-process code.** The base-scanner runs as
   a separate binary launched via go-plugin. This is THE differentiator vs
   Jellyfin/Emby (arch §0 principle 2, §1.2). If the integration test does not
   prove a real subprocess boundary, the slice has not proven the architecture.
2. **Core is an orchestrator.** No media-type strings (`"movie"`, `"tv"`,
   `"tmdb"`) hardcoded in core code — they live in module config (arch §0
   principle 1). The TV module is a `modules` table row, not a Go type.
3. **Dynamic JSON documents.** Items are persisted as a `document` TEXT column
   holding arbitrary JSON (arch §9.1); `json_extract` + generated columns
   (arch §9.2) for the few indexed fields. NOT 357 typed DTOs (D2).
4. **Pure-delegation API.** The scan handler does exactly: parse `{id}` → call
   `scan.Run(ctx, id)` → write response. The library-create handler does: parse
   body → `store.CreateLibrary(...)` → write. No branching (ai-arch §3).
5. **Downward-only dependency direction.** `api → scan → {module, plugin} → store`. No cycles. `proto/` + `pkg/sdk` shared leaves.

## Git state

Per planner protocol, git state is noise here — the orchestrator enforced the
branch at Phase 0. The feature branch is `feature/scan-library` (from
delegation block). No commits per phase (specifier commits all
planning+spec artifacts in one `docs(scan-library):` commit).
