# Implementation Plan — scan-library

> The foundational vertical slice of Mellifera. Proves the modular + plugin-based
> architecture end-to-end: API → module → plugin manager → base-scanner subprocess
> → store → list. See `acceptance.md` for the golden scenarios and
> `architecture_review.md` for risks.

## Architecture overview

Mellifera is a single Go binary orchestrating stateless plugin **subprocesses**
over gRPC (go-plugin). For `POST /api/v1/libraries/{id}/scan`, the API handler
does exactly one thing — call `scan.Run(ctx, id)`. The scan orchestrator
resolves the library's module configuration (which names the scanner capability
binding), obtains a typed `sdk.Scanner` client from the plugin manager, and
streams `DiscoveredFile`s back from the base-scanner subprocess. For each file
it calls `Identify`, assembles a dynamic-JSON document (ffprobe blob + parsed
title/season/episode + core-managed fields per arch §3.1), and `PutItem`s it
into SQLite. `GET /api/v1/items?library={id}` lists them. The core never
hardcodes media-type strings (`"tv"` lives in the module config row, not in Go
code — arch §0 principle 1), and a plugin crash never takes down the server
(subprocess isolation — arch §0 principle 2).

The slice ships **four proto packages** (extracted verbatim from arch §2; only
`common` + `scanner` are exercised, `metadata` + `plugin` are generated for
contract completeness), a thin **`pkg/sdk`** (the `Serve` entrypoint +
`ScannerPlugin` base type satisfying go-plugin's `GRPCPlugin`, so a plugin's
`main.go` is ~20 lines — D15/Q2), the **`internal/store`** (SQLite + JSON
columns + generated indexes per §9.1/§9.2, parameterized SQL only), the
**`internal/plugin`** manager (subprocess lifecycle + minimal restart per §7.3),
the **`internal/module`** registry (config-driven, TV module per §2.4 example),
a new **`internal/scan`** orchestrator (the scan-side analog of the deferred
`internal/enrich`; keeps `api/` pure-delegation), the **`plugins/base-scanner`**
binary (filesystem walk + `ffprobe` via `exec.Command` arg-slice + TV filename
parse + path-traversal guard), the **`internal/api`** chi router with
admin-token middleware (Principal=admin per Q15/D18), and flat **`cmd/mellifera`**
wiring (no DI, no reflect).

```mermaid
flowchart TD
    Client["HTTP client"] -->|POST /api/v1/libraries/:id/scan Bearer T| API["internal/api<br/>admin middleware → Principal{Admin:true}<br/>scanHandler: parse {id} → deps.Scan(id) → write"]
    API -->|one domain call| SCAN["internal/scan<br/>Run(ctx, deps, libraryID)"]
    SCAN -->|GetLibrary| STORE["internal/store<br/>SQLite + JSON cols (§9.1/§9.2)<br/>parameterized SQL only"]
    SCAN -->|Get moduleID → ScannerBinding| MOD["internal/module<br/>Registry.Get (config from modules table)"]
    SCAN -->|Scanner pluginID, capID| PLG["internal/plugin<br/>Manager.Scanner — typed accessor"]
    PLG -.->|gRPC over subprocess| BASE["plugins/base-scanner (separate binary)<br/>sdk.Serve + ScannerPlugin"]
    BASE -->|walk + path-guard| FS[("library root on disk")]
    BASE -->|exec.Command arg-slice<br/>NEVER shell| FF["ffprobe"]
    BASE -->|stream DiscoveredFile| PLG
    PLG -->|sdk.Scanner stream| SCAN
    SCAN -->|Scan → Identify → assemble Document| STORE
    STORE -->|PutItem (upsert by file_id)| DB[("SQLite WAL")]
    Client -->|GET /api/v1/items?library=id Bearer T| API
    API -->|QueryItems| STORE
    STORE -->|[]Item| API
    style BASE fill:#eef,stroke:#446
    style DB fill:#fef,stroke:#446
```

Dependency direction is downward only: `api → scan → {module, plugin} → store`,
with `proto/` + `pkg/sdk` as shared leaves (contracts.md §10). No cycles.

## Stack Patterns Applied

| Concern | Pattern | Source | Existing Convention |
|---|---|---|---|
| HTTP routing | chi v5 router, pure-delegation handlers (≤60 lines funlen, ≤15 gocognit) | ai-arch §3; mellifera-build skill | `mellifera-build` module-template (handler = one domain call) |
| Plugin transport | hashicorp/go-plugin (gRPC subprocess), magic-cookie handshake | arch §2.2.1; D1 | (new — this feature establishes it) |
| Subprocess exec | `exec.CommandContext("ffprobe", args...)` arg-slice, ctx deadline | arch §1.2; Q6; golang-security | (new — established here, reused by every scanner plugin) |
| Storage | SQLite via `modernc.org/sqlite` (pure-Go), `database/sql`, JSON columns + generated indexes | arch §9.1/§9.2; Navidrome pattern | (new — established here) |
| Concurrency on the stream | channel + for-select drain at store-write speed, ctx cancellation | Go idiom; arch §2.1.2 streaming Scan | (new) |
| Auth | Single admin token → `Principal` in context (Phase 2: session resolver behind same middleware) | arch §11.5; Q15/D18 | (new — grounds Phase 2) |
| Module registry | config entity in a table, NOT a Go type-per-media-type | arch §0 principle 1, §2.4 | (new — the differentiator) |
| Doc/test layout | `doc.go` (contract-first) + table-driven `<symbol>_test.go` per exported symbol | mellifera-build skill; module-template | `.claude/skills/mellifera-build/module-template/{doc,greet,greet_test}.go` |
| Error shape | gRPC codes → HTTP status (transport); canonical `{"error":{code,message,retryable}}` body | arch §11.6; Q19/D17 | (new) |
| License headers | Apache-2.0 SPDX header on every `.go` file | D12/Q18 | (new — enforced by CI/lint) |

## File Map

> Every file the coder creates. `doc.go` per package is mandatory. Symbol counts
> are targets from `source_baseline.md`; the 12-fail ceiling (`check.sh`) is the
> hard gate. Files grouped by package.

### Root / build / contracts
| Path | Package | Role | Key exported symbols (≤3) |
|---|---|---|---|
| `mellifera/go.mod` | (module root) | `github.com/mellifera/mellifera`, Go 1.22+, no CGO; deps: chi v5, go-plugin, grpc, protobuf, modernc.org/sqlite | — |
| `mellifera/LICENSE` | — | Apache-2.0 full text (D12) | — |
| `mellifera/NOTICE` | — | NOTICE file (D12) | — |
| `mellifera/buf.yaml` | — | buf module config (lint + breaking, roots = proto/) | — |
| `mellifera/buf.gen.yaml` | — | buf codegen: protoc-gen-go + protoc-gen-go-grpc → `proto/mellifera/.../v1/*.pb.go` | — |
| `mellifera/Makefile` | — | targets: `proto` (buf generate), `build`, `test`, `lint`, `check` (calls check.sh), `build-plugin` (builds base-scanner) | — |

### `proto/` (generated — vendor contract; R2 exempts from ≤8)
| Path | Package | Role | Key symbols |
|---|---|---|---|
| `proto/mellifera/common/v1/common.proto` | `mellifera.common.v1` | verbatim from arch §2.1.1 | `MediaDocument`, `Provenance`, `LocalizedString` |
| `proto/mellifera/scanner/v1/scanner.proto` | `mellifera.scanner.v1` | verbatim from arch §2.1.2 | `Scanner` svc, `ScanRequest`, `DiscoveredFile`, `IdentifyRequest`, `IdentifyResult` |
| `proto/mellifera/metadata/v1/metadata.proto` | `mellifera.metadata.v1` | verbatim from arch §2.1.3 | `MetadataSource` svc (NOT exercised) |
| `proto/mellifera/metadata/v1/request_spec.proto` | `mellifera.metadata.v1` | verbatim from arch §2.1.4 | `RequestSpec`, `VariableValue` |
| `proto/mellifera/plugin/v1/plugin.proto` | `mellifera.plugin.v1` | verbatim from arch §2.2.2 | `Plugin` svc, `HandshakeRequest/Response`, `HealthResponse` |
| `proto/mellifera/.../v1/*.pb.go` (+ `_grpc.pb.go`) | generated | Go bindings; committed so CI doesn't need buf installed | generated |

### `pkg/sdk/` (plugin SDK — shared leaf, importable by external plugins)
| Path | Package | Role | Key exported symbols |
|---|---|---|---|
| `pkg/sdk/doc.go` | `sdk` | contract: SDK responsibility + public API | — |
| `pkg/sdk/serve.go` | `sdk` | `Serve` entrypoint: handshake + gRPC server + signal handling | `Serve`, `HandshakeConfig` |
| `pkg/sdk/scanner.go` | `sdk` | `Scanner` interface + `ScannerPlugin` (GRPCPlugin dual-side) + `Capability` | `Scanner`, `ScannerPlugin`, `Capability` |

### `internal/store/` (SQLite — sole owner of `*sql.DB`)
| Path | Package | Role | Key exported symbols |
|---|---|---|---|
| `internal/store/doc.go` | `store` | contract + invariants (parameterized SQL, WAL, §9.1/§9.2) | — |
| `internal/store/open.go` | `store` | `Open` (migrations + WAL), `Close`, schema constants | `Store`, `Open` |
| `internal/store/items.go` | `store` | `GetItem`, `PutItem` (upsert by `file_id`), `QueryItems`, `Item` type | `Item`, `GetItem`, `PutItem`, `QueryItems` |
| `internal/store/libraries.go` | `store` | `CreateLibrary`, `GetLibrary`, `Library` type | `Library`, `CreateLibrary`, `GetLibrary` |

### `internal/module/` (registry — config-driven, depends on store)
| Path | Package | Role | Key exported symbols |
|---|---|---|---|
| `internal/module/doc.go` | `module` | contract: module is a config entity, not a Go type per media_type | — |
| `internal/module/registry.go` | `module` | `Open` (loads from store), `Get`, `List`, `Module`/`ScannerBinding` types | `Registry`, `Module`, `Open`, `Get`, `List` |

### `internal/plugin/` (subprocess lifecycle — depends on proto + sdk)
| Path | Package | Role | Key exported symbols |
|---|---|---|---|
| `internal/plugin/doc.go` | `plugin` | contract + minimal restart/backoff (§7.3) | — |
| `internal/plugin/manager.go` | `plugin` | `Manager` + `Open` + `Load`/`Start`/`Stop`/`Status`/`Scanner` + `Deps`/`Health` types | `Manager`, `Open`, `Scanner` |

### `internal/scan/` (NEW — scan orchestrator, analog of deferred `enrich`)
| Path | Package | Role | Key exported symbols |
|---|---|---|---|
| `internal/scan/doc.go` | `scan` | contract: WHY this package exists (keeps api pure-delegation) | — |
| `internal/scan/run.go` | `scan` | `Run` orchestrator + `Deps`/`Result` types | `Run`, `Deps`, `Result` |

### `internal/api/` (chi router — PURE DELEGATION)
| Path | Package | Role | Key exported symbols |
|---|---|---|---|
| `internal/api/doc.go` | `api` | contract: handlers = parse → ONE call → write; Principal grounding | — |
| `internal/api/router.go` | `api` | `New(Deps) http.Handler`; routes; `Deps`/`Principal` types | `New`, `Deps`, `Principal` |
| `internal/api/middleware.go` | `api` | admin-token middleware (unexported) | — |
| `internal/api/handlers.go` | `api` | 3 unexported handlers + unexported DTOs | — |

### `plugins/base-scanner/` (separate binary, package main)
| Path | Package | Role | Key exported symbols |
|---|---|---|---|
| `plugins/base-scanner/doc.go` | `main` | contract: scanner responsibility + invariants (path-guard, arg-slice ffprobe) | — |
| `plugins/base-scanner/main.go` | `main` | `main()`: build Scanner impl, `sdk.Serve(...)` (~20 lines) | `main` |
| `plugins/base-scanner/scanner.go` | `main` | unexported `scannerImpl` satisfying `sdk.Scanner` | — |
| `plugins/base-scanner/walk.go` | `main` | unexported `walk` (filepath.WalkDir + path-guard) | — |
| `plugins/base-scanner/pathguard.go` | `main` | unexported `withinRoot` (resolve + EvalSymlinks + verify) | — |
| `plugins/base-scanner/ffprobe.go` | `main` | unexported `probe` (`exec.CommandContext` arg-slice + timeout + missing-binary handling) | — |
| `plugins/base-scanner/tvparse.go` | `main` | unexported `parseTV` (SxxExx + title; strip resolution/group) — pure | — |

### `cmd/mellifera/` (flat wiring, package main)
| Path | Package | Role | Key exported symbols |
|---|---|---|---|
| `cmd/mellifera/main.go` | `main` | flat constructor list: config → store → module → plugin (+Load+Start) → scan.Deps → api.New → ListenAndServe | `main` |

### Tests (co-located, table-driven per exported symbol)
| Path | Covers |
|---|---|
| `pkg/sdk/*_test.go` | `Serve` wiring helpers, `ScannerPlugin` (in-process) |
| `internal/store/*_test.go` | `Open`, `GetItem`, `PutItem` (upsert idempotency), `QueryItems`, `CreateLibrary`, `GetLibrary` over temp DB |
| `internal/module/*_test.go` | `Open`, `Get`, `List` with seeded modules table |
| `internal/plugin/*_test.go` | `Open`, `Load`, `Start`, `Stop`, `Status`, `Scanner` with in-process fake plugin |
| `internal/scan/*_test.go` | `Run` with fake `sdk.Scanner` + temp store (asserts S2/S3/S4) |
| `internal/api/*_test.go` | `New` router + admin middleware table (S1/S8) via httptest |
| `plugins/base-scanner/*_test.go` | `parseTV`, `withinRoot`, ffprobe JSON extraction (table); one subprocess smoke test |
| `integration_test.go` (or `cmd/mellifera/integration_test.go`) | AC-1 end-to-end |

## Step Outline

> Numbered, dependency order. Each step references File Map entries + traces to
> acceptance scenarios. ≤15 steps (gate); this plan ships 12. Each step is one
> atomic change (a package or a tight group). `(AC-N)` = traces to
> acceptance.md.

1. **Init module + licensing.** Create `go.mod` (module `github.com/mellifera/mellifera`, Go 1.22+, no CGO env), `LICENSE` (Apache-2.0 full text), `NOTICE`, and a `.license-header.txt` template used by every subsequent `.go` file (D12). Commit the header-template + a Makefile target `add-headers` (optional helper, not a gate). -> File Map: `go.mod`, `LICENSE`, `NOTICE`. (AC-2)
2. **Extract protos verbatim + generate bindings.** Copy the four proto blocks from `docs/architecture.md §2` (§2.1.1 common, §2.1.2 scanner, §2.1.3 metadata, §2.1.4 request_spec, §2.2.2 plugin) character-for-character into `proto/mellifera/{common,scanner,metadata,plugin}/v1/*.proto`. Add `buf.yaml` (roots = `proto/`, lint clean) + `buf.gen.yaml` (Go + Go-grpc plugins, output alongside `.proto`). Run `buf generate`. Commit the generated `.pb.go`. `buf lint` + `go build ./proto/...` must pass. -> File Map: `proto/...`, `buf.yaml`, `buf.gen.yaml`. (AC-3, AC-2)
3. **Implement `pkg/sdk`.** Write `doc.go` (contract + invariants: `Scanner` has ≥2 impls — subprocess client + test fake, justifying the interface). Implement `HandshakeConfig`, `Capability`, `Scanner` interface (channel-based `Scan`, unary `Identify`), `ScannerPlugin` satisfying `plugin.GRPCPlugin` (dual-side: server adapts author's `Scanner` to the gRPC stream; client wraps the gRPC stub). Implement `Serve` (validate magic cookie, register gRPC services, signal handling). Table tests: in-process `Serve` + dial-through proves the wiring. -> File Map: `pkg/sdk/*`. (AC-1, AC-2)
4. **Implement `internal/store`.** Write `doc.go`. Implement `Open` (`PRAGMA journal_mode=WAL` + idempotent migrations creating ALL §9.1 tables including reserved `playback_progress`/`drafts`/`enrichment_failures`/`scan_jobs` + §9.2 generated columns `display_title`/`display_rating`/`tmdb_id`/`kinopoisk_id` + indexes) + `Close`. Implement `CreateLibrary`/`GetLibrary` + `Item`/`Library` types. Implement `GetItem`/`PutItem` (upsert by `file_id`)/`QueryItems` (filters by `library_id`, LIMIT/OFFSET). Parameterized SQL ONLY. Table tests over `t.TempDir()` SQLite: Open/Close, CRUD, upsert idempotency (PutItem twice = one row), generated-column query. -> File Map: `internal/store/*`. (AC-1, AC-2)
5. **Implement `internal/module`.** Write `doc.go` (module is a config entity; media_type is a string; core never branches on it). Implement `Registry`/`Open(ctx, *store.Store)`/`Get`/`List` + `Module`/`ScannerBinding` types. Seed a TV module config row (arch §2.4.1 example) in a migration or a seed file (decide at coder time — a seed avoids runtime config file deps). Table tests: seed modules table via store, Open, assert Get/List. -> File Map: `internal/module/*`. (AC-1, AC-2)
6. **Implement `internal/plugin`.** Write `doc.go` (minimal restart/backoff per §7.3). Implement `Manager`/`Open(Deps)`/`Load`/`Start`/`Stop`/`Status`/`Scanner` + `Deps`/`Health` types. `Start` launches the subprocess via go-plugin with the magic cookie, runs `Plugin.Handshake`, registers capability stubs. `Scanner(pluginID, capID)` returns the typed `sdk.Scanner` client (no reflect). `Status` exposes health + restart count. Minimal restart: on unexpected exit, exponential backoff (1s, factor 2, cap 60s, jittered); 3 fails → `failed` state. Table tests: in-process fake plugin via `sdk.Serve`, dial through `Manager`, call `Scan`, assert stream + Status transitions. -> File Map: `internal/plugin/*`. (AC-1, AC-2)
7. **Implement `internal/scan`.** Write `doc.go` (WHY this package exists — keeps api pure-delegation; analog of deferred `enrich`). Implement `Run(ctx, Deps, libraryID) (Result, error)` + `Deps`/`Result` types. Flow: `store.GetLibrary` → `modules.Get` → `plugins.Scanner` → `scanner.Scan` (drain channel) → per file `scanner.Identify` → assemble `store.Item.Document` (ffprobe bytes + parsed + core-managed fields per arch §3.1) → `store.PutItem`. Aggregate counts + warnings into `Result`. Table tests with a fake `sdk.Scanner` (2nd impl) + temp store: assert items persisted match the fake's emission, warnings propagate, ctx cancellation aborts cleanly. -> File Map: `internal/scan/*`. (AC-1, AC-2)
8. **Implement `plugins/base-scanner`.** Write `doc.go`. Implement `main()` (~20 lines: build scannerImpl, `sdk.Serve`). Implement unexported `scannerImpl` (satisfies `sdk.Scanner`), `walk` (filepath.WalkDir filtering media extensions + path-guard), `withinRoot` (resolve + `EvalSymlinks` + verify under root, checked pre/post symlink — S7), `probe` (`exec.CommandContext("ffprobe", arg-slice...)` + ctx timeout + missing-binary/non-zero-exit → soft warning + empty ffprobe_json per Q6), `parseTV` (pure: extract SxxExx + show title; strip resolution/group tags; emit `IdentifyResult.parsed` Struct). Table tests: `parseTV` over many filename shapes; `withinRoot` over escape cases (symlink out, `..`, absolute, nested symlink — AC-4); ffprobe JSON extraction over fixture outputs; one subprocess smoke test (build binary, dial via sdk.Serve, scan a tiny fixture — SKIP cleanly if ffprobe absent). -> File Map: `plugins/base-scanner/*`. (AC-1, AC-4, AC-6)
9. **Implement `internal/api`.** Write `doc.go` (pure-delegation rule; Principal grounding). Implement `New(Deps) http.Handler` + `Deps`/`Principal` types. Implement admin-token middleware (constant-time compare; missing/wrong → 401; correct → `Principal{Admin:true}` in context). Implement 3 unexported handlers: `createLibrary` (parse → `store.CreateLibrary` → write), `scanLibrary` (parse `{id}` → `deps.Scan(ctx, id)` → write), `listItems` (parse `{id}`+pagination → `store.QueryItems` → write). Unexported DTOs with struct conversion at the store boundary. Canonical error body. Table tests via httptest: each handler happy path + error path; middleware table (no/wrong/correct token) — AC-5. -> File Map: `internal/api/*`. (AC-1, AC-5, AC-2)
10. **Implement `cmd/mellifera`.** Flat `main.go`: read config (data dir + admin token from env/config), `store.Open` → `module.Open` → `plugin.Open` → `plugin.Load("base-scanner", path, caps)` + `plugin.Start` → assemble `scan.Deps` → `api.New` → `http.ListenAndServe`. No DI, no reflect, no init branching. -> File Map: `cmd/mellifera/main.go`. (AC-1, AC-2)
11. **Integration test (AC-1 golden).** Build the base-scanner binary + the server binary. Start the server on a temp SQLite DB + random port. Seed the TV module. `POST /libraries` (root_path = a small fixture dir with TV-named files). `POST /libraries/{id}/scan`. Poll or block until scan done. `GET /items?library={id}`. Assert items persisted with parsed title/season/episode + non-empty ffprobe blob. Cover one path-traversal escape fixture (assert skipped + warned). Cover one unprobeable file (assert empty ffprobe + warning, item still present). -> File Map: `integration_test.go`. (AC-1, AC-4, AC-6)
12. **Green all five gates.** Run `go build ./...`, `go test ./...`, `golangci-lint run ./...`, `gofmt -l .`, `bash .claude/skills/mellifera-build/scripts/check.sh`. Fix any failure. Verify per-package: ≤8 symbols (WARN at 9-12 only where documented — store, plugin), `doc.go` present, Apache headers present, zero `reflect`, zero DI imports, table test per exported symbol. If check.sh fails on generated `.pb.go` (R2), apply the one-line `--exclude='*.pb.go'` fix to `check.sh` (intent-preserving — the rule targets hand-written API surface) and re-run. -> all packages. (AC-2)

**Cross-cutting (apply throughout, not a separate step):** Apache-2.0 headers
on every `.go` file (D12); parameterized SQL only (S9); `exec.Command`
arg-slice only (S6); no `reflect`, no DI framework imports (depguard-enforced);
doc.go per package; table test per exported symbol.

## Decision log

### D-Q2 SQLite driver — `modernc.org/sqlite` (CONFIRMED)
Pure-Go, no CGO. Fits the single-binary + cross-compile constraints (arch §1.2,
project_context.json). CGO would tie the build to a host C toolchain and break
the "single static binary" property. The `database/sql` interface is unchanged;
`modernc.org/sqlite` registers as a `database/sql` driver under the `sqlite`
DSN prefix. WAL mode + JSON columns (`json_extract`, generated columns) work
identically to CGO sqlite.

### D-Q3 Module path — `github.com/mellifera/mellifera` (CONFIRMED)
Matches `project_structure.md`, the kickoff brief, and arch §10. No change.

### D-Q1 Right-sizing — full slice in ONE pass, WITH a documented phasing fallback (NOT activated)
**Decision: plan the full 10-deliverable slice.** The user's "Done" definition
explicitly requires the complete path (API → module → plugin manager →
base-scanner subprocess → store → list); thinning would under-deliver on Done.
The slice fits one clean pass because: (a) greenfield — no integration with
existing code; (b) each package has a tiny surface (≤8 target, 12 ceiling);
(c) complexity is **horizontal** (many small packages) not vertical (deep
chains); (d) the proto extraction is verbatim (low risk, R3); (e) the
mellifera-build skill is specifically designed to make this navigable.

**Phasing fallback (documented, NOT activated):** if R1 (go-plugin gRPC
handshake correctness) becomes a blocker at code time, the natural thinner
first vertical is **protos + store + module + base-scanner exercised in-process
via `pkg/sdk` (skipping `internal/plugin` subprocess manager + `internal/api` +
`cmd/mellifera`)**, with the subprocess manager + API in the immediate next
pass. This still proves proto fidelity (AC-3), store correctness (AC-2 partial),
module registry, and the base-scanner's walk/ffprobe/path-guard/parse logic
(AC-4, AC-6), and ships green. It does NOT prove the subprocess isolation
differentiator (arch §0 principle 2) — that's the cost of the fallback. The
specifier/coder/reviewer may invoke this fallback only if R1 blocks; it must be
surfaced to the user before activation. AC count (6) and Step count (12) are
both under gates; `feature_too_large` is NOT set.

### Proto extraction approach — `buf` (with generated `.pb.go` committed)
**Decision: buf** (`buf.yaml` + `buf.gen.yaml`) over raw `protoc`. Rationale:
(a) `buf lint` protects the "deprecate don't delete" proto evolution rule
(arch §11.3) by catching reserved-field / naming issues; (b) `buf breaking`
(available later) protects wire compatibility; (c) reproducible generation via
two small config files vs a Makefile of `protoc` invocations; (d) the
generated Go code is identical (both use `protoc-gen-go` + `protoc-gen-go-grpc`).
The generated `.pb.go` files are COMMITTED so CI/build/test do not depend on a
buf install at every step — only regeneration does. `buf` is a dev-only toolchain
dep, not a runtime dep.

### Scanner interface — `Call` realized as typed accessor `Scanner(pluginID, capID)` (deviation from module-map naming, justified)
The module map lists `plugin` API as `Load, Start, Stop, Health, Call`. A
generic `Call(method, request)` requires `protobuf.Any` or `reflect` — both
forbidden. The honest realization is a per-capability **typed** accessor;
`Scanner(pluginID, capID) (sdk.Scanner, error)` is the one for this feature.
Future capabilities (MetadataSource, etc.) add their own typed accessors.
This keeps type safety + no reflect + ≤8 budget. The module map's `Call` and
`Health` names are realized as `Scanner` (typed accessor) and `Status`
(returns `Health` type, avoids the name collision with the type). Flagged for
the module-map sync-up (decision below).

### New package `internal/scan` (deviation from module map, justified)
The module map lists `enrich` (deferred) but not its scan-side analog. The scan
orchestration (`store.GetLibrary` + `module.Get` + `plugin.Scanner` + stream
drain + `store.PutItem`) cannot live in `api/` (pure-delegation rule). It lives
in a new `internal/scan` package (same dependency level as `enrich`: `scan →
{module, plugin, store}`). Per the mellifera-build skill's "Adding a new module"
step 6, this package must be added to the module map + ai-arch §4 — a docs
follow-up tracked for the wf-docs phase.

### `internal/store` at 10 symbols + `internal/plugin` at 9 (WARN, justified)
Both exceed the ≤8 target but stay well under the 12 hard-fail ceiling. Store
owns multiple entities (items + libraries) and is the sole SQLite owner;
splitting fragments schema ownership + opens the same `*sql.DB` from two
packages (WAL contention). Plugin owns lifecycle phases (Load/Start/Stop) +
typed accessor + health. WARN is the design's honest position; FAIL is not
reached. Documented in conventions.md + architecture_review.md for the
specifier/coder to either accept at WARN or propose a split.

### base-scanner as part of the main Go module (deviation from arch §10, justified for MVP)
Arch §10 says "plugins are separate Go modules." For THIS feature, base-scanner
is part of the main module (`plugins/base-scanner/` is a `package main` built
via `go build ./plugins/base-scanner`). Justified because base-scanner has no
extra deps (only `pkg/sdk` + proto + stdlib + `os/exec`), and dev-mode
simplicity (one `go.mod`, one `go build ./...`) outweighs the separation. The
arch's rationale (divergent dep trees) does not apply yet. Phase 2 splits
plugins into separate modules when TMDB/Kinopoisk plugins with their own SDKs
land. Surface in architecture_review.md.

## Estimates (calibrated against module-template + conventions)

| Step | Package | Estimated effort | Basis |
|---|---|---|---|
| 1 | root/licensing | XS (~30 min) | boilerplate |
| 2 | protos | S (~2 hr) | verbatim copy + buf config + generate |
| 3 | pkg/sdk | M (~1 day) | go-plugin handshake + dual-side adapter is the trickiest pure-Go piece |
| 4 | internal/store | M (~1 day) | schema + 4 methods + generated cols + upsert + table tests |
| 5 | internal/module | XS (~2 hr) | small registry, table-driven |
| 6 | internal/plugin | L (~1.5 day) | subprocess lifecycle + restart/backoff + the typed accessor over gRPC |
| 7 | internal/scan | S (~half day) | orchestrator is a straight drain loop |
| 8 | plugins/base-scanner | M (~1 day) | ffprobe + TV parse + path-guard + subprocess smoke test |
| 9 | internal/api | S (~half day) | 3 handlers + middleware, pure delegation |
| 10 | cmd/mellifera | XS (~1 hr) | flat wiring |
| 11 | integration test | M (~1 day) | AC-1 golden + path-guard + resilience fixtures |
| 12 | gates green | S (~half day) | lint/test/gofmt/check.sh iteration |

Total: ~7-8 focused days. Fits one pipeline pass (plan → spec → code → review → qa → docs).
