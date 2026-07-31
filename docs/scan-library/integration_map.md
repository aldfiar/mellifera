# Integration Map — scan-library

> **Completeness artifact.** Grounding makes claims *correct*; this file makes
> sure none are *dropped*. It is the single view of every seam where new code
> meets the system + the before/after behavior at each. `check-plan-coverage.sh`
> enforces: every MODIFY/CREATE file in ≥1 seam; every seam has non-empty
> `After` + `Contract` + `evidence:`; unique seam IDs.

## Seams

| ID | Owner | Existing (before) | New / Changed | After (behavior at the seam) | Contract (the invariant held here) | Joint test | evidence |
|---|---|---|---|---|---|---|---|
| S1 | `internal/api` | (none — greenfield) | `api.scanHandler` (unexported) calls `scan.Run` | `POST /api/v1/libraries/{id}/scan` parses `{id}` → calls exactly ONE domain fn `deps.Scan(ctx, id)` → writes JSON `scanResponse`. No branching in the handler. | Pure-delegation: parse → ONE call → write (ai-arch §3). Handler funlen ≤60, gocognit ≤15. | `api/scan_test.go`: httptest POST with a stubbed `deps.Scan` returning a fixed `scan.Result`; assert 200 + body matches + the stub was called with the parsed id. | contracts.md §8; arch §3 (ai-arch) |
| S2 | `internal/scan` | (none) | `scan.Run` resolves the library's module via `module.Registry.Get` | Given a `libraryID`, `scan.Run` calls `store.GetLibrary` → `modules.Get(library.ModuleID)` → reads `ScannerBinding{plugin_id, capability_id, options}`. | The orchestrator never branches on media_type (arch §0 principle 1); module config is authoritative (§2.4.2). | `scan/run_test.go`: stub `module.Registry` with a fixed TV module; assert `scan.Run` resolves the scanner binding and passes the right `module_type` to `Scanner.Scan`. | contracts.md §6+§7; arch §2.4.3 |
| S3 | `internal/scan` | (none) | `scan.Run` obtains a scanner client via `plugin.Manager.Scanner` and calls `Scan` + `Identify` | `scan.Run` calls `plugins.Scanner(pluginID, capID)` → `sdk.Scanner`, then `Scan(ctx, req)` returns a `<-chan DiscoveredFile`; for each, `Identify(ctx, req)`. | Streaming contract (arch §2.1.2): Scan is `stream`; the orchestrator drains at store-write speed; ctx cancellation propagates to the subprocess. | `scan/run_test.go`: inject a fake `sdk.Scanner` (2nd impl — R8) emitting 2 fixed `DiscoveredFile`s + fixed `IdentifyResult`s; assert both items reach the store. | contracts.md §5+§7+§9; arch §2.1.2 |
| S4 | `internal/scan` ↔ `internal/store` | (none) | `scan.Run` calls `store.GetLibrary` once + `store.PutItem` per discovered file | Each `(DiscoveredFile, IdentifyResult)` pair is converted to a `store.Item` (struct conversion — contracts.md §3) and `PutItem`-ed. Re-scan is idempotent (upsert by `file_id`). | `Document` is opaque JSON to the store; scan owns document assembly (ffprobe blob + parsed fields + core-managed fields per arch §3.1). Parameterized SQL only. | `scan/run_test.go` (same test as S3): assert the temp store ends with exactly the items the fake scanner emitted, with the right `Document` shape. | contracts.md §4+§7; arch §3.1, §9.1 |
| S5 | `internal/plugin` ↔ `plugins/base-scanner` over gRPC (subprocess) | (none) | Core launches base-scanner binary via go-plugin; both sides use `sdk.ScannerPlugin` (GRPCPlugin dual-side) | Core sets `MELLIFERA_MAGIC_COOKIE` env → launches base-scanner binary → base-scanner's `sdk.Serve` validates cookie → go-plugin negotiates gRPC address → core dials → `Plugin.Handshake` → core registers capability stub → core calls `Scanner.Scan/Identify` over gRPC. | Magic-cookie handshake (arch §2.2.1); capability routing by `(plugin_id, cap_id, proto_service FQN)` (§7.2); this IS the subprocess-isolation differentiator (arch §0 principle 2). | (a) `plugin/manager_test.go`: launch a tiny in-process test plugin via `sdk.Serve`, dial it through `Manager`, call `Scan`, assert stream received. (b) integration test: same flow against the REAL `base-scanner` binary built from `plugins/base-scanner/`. | contracts.md §5+§9; arch §2.2.3, §7.1, §7.2 |
| S6 | `plugins/base-scanner` ↔ `ffprobe` subprocess | (none) | base-scanner invokes `ffprobe` via `exec.Command("ffprobe", args...)` per discovered file | For each file path: `exec.CommandContext(ctx, "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", absPath)` → capture stdout → store verbatim as `DiscoveredFile.ffprobe_json` (bytes). Timeout via ctx (Q11/D13 per-RPC budget). | **Arg slice, NEVER shell** (golang-security; kickoff hard rule). Timeout = ctx deadline. Missing `ffprobe` on PATH OR non-zero exit OR timeout → soft failure: empty `ffprobe_json` + a `warnings` entry; the item is still identified (Q6). | `plugins/base-scanner/ffprobe_test.go`: (a) table test the JSON-extraction helper over fixture ffprobe outputs; (b) subprocess test against a real small fixture file (SKIP with clear message if `ffprobe` not on PATH — do NOT fail CI if absent); (c) test that a deliberately bad path yields a warning, not a panic. | contracts.md §9 (Scanner impl); arch §1.2; open-questions Q6 |
| S7 | `plugins/base-scanner` path-guard | (none) | Every path the scanner considers is resolved + verified within the configured library root BEFORE ffprobe | For each candidate path: `filepath.Rel(root, candidate)` + `filepath.EvalSymlinks` → if the resolved absolute path is NOT under root, skip + warn. Checked twice (pre- and post-symlink-resolve) to close TOCTOU. | Path-traversal guard (kickoff hard rule; golang-security). NO file outside root is ffprobed, read, or persisted — including via symlinks or `..` segments. | `plugins/base-scanner/pathguard_test.go`: table test over escape cases (symlink out, `..` segment, absolute path, nested symlink, root itself). AC-4. | contracts.md §9; kickoff §Path-traversal guard |
| S8 | `internal/api` admin middleware → `Principal` | (none) | `Authorization: Bearer <admin_token>` resolved to `api.Principal{Admin:true}` in request context | Middleware extracts the bearer token, constant-time-compares to the configured admin token, on match puts `Principal{Admin:true}` in context + calls next; on miss → 401 `{"error":{...}}`. | Q15/D18: Principal abstraction (not a bool gate). Phase 2 adds a session resolver behind the same middleware; handler signatures unchanged (arch §11.5). | `api/middleware_test.go`: table test (no header / wrong scheme / wrong token / correct token) over a dummy next-handler; assert 401 vs 200 + Principal-in-context. AC-5. | contracts.md §2+§8; arch §11.5; Q15/D18 |
| S9 | `internal/store` ↔ SQLite | (none) | `store.Open` runs migrations (all §9.1 tables + §9.2 generated columns), sets WAL; CRUD methods use parameterized SQL + `json_extract` | `Open(dsn)` → `PRAGMA journal_mode=WAL` → run migrations idempotently → return `*Store`. `PutItem` upserts by `file_id`. `QueryItems` filters by `library_id` with LIMIT/OFFSET. | All §9.1 tables created (including reserved `playback_progress`, `drafts`, `enrichment_failures`) — additive. WAL + single-writer txn (§9.3). Generated columns for `display_title` etc. (§9.2). Parameterized SQL ONLY. | `store/store_test.go`: table test `Open/GetItem/PutItem/QueryItems/GetLibrary/CreateLibrary` over a temp SQLite DB; assert upsert idempotency (PutItem twice → one row) + generated-column query works. | contracts.md §4; arch §9.1, §9.2, §9.3 |
| S10 | `internal/module` ↔ `internal/store` | (none) | `module.Open` reads enabled rows from the `modules` table; `Get`/`List` serve from in-memory cache | `module.Open(ctx, store)` → `SELECT * FROM modules WHERE enabled=1` → parse `config_json` into `Module` structs → cache. `Get(id)` cache-only (pure). | Module is a config entity (arch §2.4); media_type is a string, not enum (§2.4.2). Core never hardcodes `"tv"`. | `module/registry_test.go`: seed the modules table via `store` with a TV config row; `module.Open`; assert `Get("tv")` returns the expected binding + `List()` includes it. | contracts.md §6; arch §2.4, §2.4.3 |
| S11 | `cmd/mellifera` ↔ all (wiring) | (none) | Flat `main.go` constructor list: config → `store.Open` → `module.Open` → `plugin.Open` + `Load(base-scanner)` + `Start` → `scan.Deps` assembled → `api.New` → `http.ListenAndServe` | One file, readable top-to-bottom. No DI container, no reflect, no init-time branching beyond reading config. | Flat main.go (ai-arch principle 5; mellifera-build skill). Depguard denies `reflect` + DI frameworks (`.golangci.yml`). | Integration test (AC-1) exercises the full wiring by starting the server on a random port + hitting the 3 endpoints; if wiring is wrong, AC-1 fails end-to-end. | contracts.md §10 (import map); ai-arch §2 principle 5 |
| S-integration | whole system | (none) | End-to-end scan of a fixture directory into a temp SQLite DB | `POST /libraries` → `POST /libraries/{id}/scan` → `GET /items?library={id}` returns items with parsed fields + ffprobe blob. | AC-1 (the golden test). Proves the architecture end-to-end including the subprocess boundary (S5). | `integration_test.go` (separate package or `_test` build tag): builds the base-scanner binary, starts the server on a temp DB + random port, scans a fixture dir, asserts items. | acceptance.md AC-1; kickoff §Verification |
| S-noop | `proto/*`, `go.mod`, `buf.yaml`, `buf.gen.yaml`, `LICENSE`, `NOTICE`, `.proto` files | (none) | Foundational artifacts; no runtime seam | — (no behavior; they enable compilation + licensing) | no_seam: these are build-time / contract artifacts, not runtime seams. Their fidelity is asserted by AC-2 (build green) + AC-3 (proto verbatim) + license lint. | — | — |

## Behavior-change impact on existing flows

**Greenfield — no existing flows.** Every seam above is a new connection, not a
change to existing behavior. The "Before" column is uniformly "(none)". This
section exists for completeness; the next feature that touches this code will
populate the "Before" rows from this feature's "After" rows.

## External boundary changes

| Boundary | Type | New behavior | Timeout | Retry | Idempotency |
|---|---|---|---|---|---|
| `ffprobe` subprocess (S6) | external binary via `exec.Command` | one invocation per discovered media file | per-file ctx deadline (default 30s; Q11/D13) | NONE in MVP (soft-fail: empty `ffprobe_json` + warning) | N/A (read-only probe; idempotent by nature) |
| base-scanner ↔ core gRPC (S5) | localhost TCP (go-plugin-negotiated address) | streaming `Scan` + unary `Identify` | Scan: 120s per-response stall budget (arch §7.6); Identify: 30s default | restart-with-backoff at the MANAGER level (arch §7.3), NOT per-RPC retry in the orchestrator | N/A (subprocess is stateless per arch §0 principle 2) |
| SQLite file (S9) | local file via `database/sql` | all reads/writes through `internal/store` | `context.Context` deadline on every query | NONE (SQLite WAL handles contention; single-writer) | `PutItem` upsert by `file_id` — idempotent re-scan |
| HTTP client ↔ API (S1, S8) | HTTP/JSON | 3 endpoints, admin-token gated | server-side read/write timeouts (configurable, sane MVP default 30s) | NONE (client's responsibility) | `POST /libraries` with same `(module_id, root_path)` → `UNIQUE` constraint → 409/422 (reviewer picks; documented at coder time) |

## Coverage Matrix (filled by specifier — every seam → owner task + joint test)

| Seam | Owner task | Joint test (task that proves both sides) | Verified By |
|---|---|---|---|
| S1 | T09 (internal/api scanHandler) | T09 contract_test_scope `api/scan_test.go`: httptest POST with stubbed deps.Scan → 200 + body + stub called with parsed id | (reviewer) |
| S2 | T07 (internal/scan Run resolves module) | T07 contract_test_scope `scan/run_test.go`: stub module.Registry with TV module → assert scanner binding + module_type passed | (reviewer) |
| S3 | T07 (internal/scan obtains + calls sdk.Scanner) | T07 contract_test_scope `scan/run_test.go`: fake sdk.Scanner (2nd impl, R8) emits 2 DiscoveredFiles + IdentifyResults → both reach the store | (reviewer) |
| S4 | T07 (internal/scan → store PutItem) | T07 contract_test_scope `scan/run_test.go`: assert temp store ends with exactly the fake's items, right Document shape | (reviewer) |
| S5 | T06 (internal/plugin Manager) + T08 (base-scanner) | T06 contract_test_scope `plugin/manager_test.go` (in-process fake via sdk.Serve) + T11 integration test (REAL base-scanner subprocess) | (reviewer) |
| S6 | T08 (base-scanner → ffprobe subprocess) | T08 contract_test_scope `ffprobe_test.go`: JSON-extraction table + subprocess test (SKIP if ffprobe absent) + bad-path→warning | (reviewer) |
| S7 | T08 (base-scanner withinRoot path-guard) | T08 contract_test_scope `pathguard_test.go`: escape-case table (symlink out, `..`, absolute, nested, root) — AC-4 | (reviewer) |
| S8 | T09 (admin middleware → Principal) | T09 contract_test_scope `middleware_test.go`: token matrix (no/wrong-scheme/wrong/correct) → 401 vs 200 + Principal-in-ctx — AC-5 | (reviewer) |
| S9 | T04 (internal/store ↔ SQLite) | T04 contract_test_scope `store/store_test.go`: Open/CRUD/upsert-idempotency/generated-column query over temp DB | (reviewer) |
| S10 | T05 (internal/module ↔ store) | T05 contract_test_scope `module/registry_test.go`: seed modules table → Open → Get("tv") returns binding + List includes it | (reviewer) |
| S11 | T10 (cmd/mellifera wiring) | T11 integration test (AC-1) exercises the full wiring by starting the server + hitting the endpoints | (reviewer) |
| S-integration | T11 (integration_test.go) | T11 itself — the golden AC-1 test; independent re-derivation in QA-1 | (reviewer) |
| S-noop | T01 + T02 (go.mod/LICENSE/NOTICE + buf + protos) | T12 gate (build green) + AC-3 (proto verbatim) + license lint | (reviewer) |

Every seam has exactly one owner task + one joint test. No seam row left as
`(after specifier)`. The `check-plan-coverage.sh` gate passes.

## File → seam coverage check (every CREATE/MODIFY file appears ≥1 seam)

| File (from File Map) | Appears in seam(s) |
|---|---|
| `go.mod`, `LICENSE`, `NOTICE` | S-noop |
| `buf.yaml`, `buf.gen.yaml` | S-noop |
| `proto/mellifera/{common,scanner,metadata,plugin}/v1/*.proto` + `.pb.go` | S-noop (fidelity via AC-3); consumed at S5 (scanner protos) |
| `pkg/sdk/doc.go`, `sdk.go`, `serve.go`, `scanner_plugin.go`, `*_test.go` | S5, S3 (Scanner interface) |
| `internal/store/doc.go`, `open.go`, `items.go`, `libraries.go`, `*_test.go` | S4, S9, S10 |
| `internal/module/doc.go`, `registry.go`, `*_test.go` | S2, S10 |
| `internal/plugin/doc.go`, `manager.go`, `*_test.go` | S3, S5, S11 |
| `internal/scan/doc.go`, `run.go`, `*_test.go` | S1 (consumed by), S2, S3, S4 |
| `internal/api/doc.go`, `router.go`, `middleware.go`, `handlers.go`, `*_test.go` | S1, S8, S11 |
| `plugins/base-scanner/doc.go`, `main.go`, `scanner.go`, `pathguard.go`, `ffprobe.go`, `tvparse.go`, `*_test.go` | S5, S6, S7 |
| `cmd/mellifera/main.go` | S11 |
| `integration_test.go` | S-integration |

Every File Map entry is covered. No orphans.
