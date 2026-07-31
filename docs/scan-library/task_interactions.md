# Task Interactions — scan-library

> Cross-task dependency map for the 17 tasks. Drives build order + conflict
> detection. Greenfield feature → no existing-code interactions; all
> dependencies are between new tasks. Derived from contracts.md §10 (import map)
> + integration_map.md (seams) + source_baseline.md (cross-module dependency table).

## Symbol Ownership

Symbols defined in one task's scope and consumed by another. Shared types from
contracts.md referenced by 2+ tasks. (Greenfield: owner task = the task that
CREATEs the symbol.)

| Symbol | Owner Task | Consumer Tasks | Shared Type? | Evidence |
|---|---|---|---|---|
| `scannerv1.ScanRequest/DiscoveredFile/IdentifyRequest/IdentifyResult` (+ commonv1, pluginv1, metadata*) | T02 (generated) | T03, T06, T07, T08 | yes (generated contract) | contracts.md §1; arch §2 |
| `sdk.Scanner` (interface) | T03 | T06 (client wrapper), T07 (calls Scan/Identify), T08 (author impl) | yes — the ONE interface (R8: ≥2 impls) | contracts.md §3, §9 |
| `sdk.Serve` / `sdk.ScannerPlugin` / `sdk.HandshakeConfig` / `sdk.Capability` | T03 | T08 (Serve+ScannerPlugin), T06 (Capability for Load), T10 (Capability for Load wiring) | yes | contracts.md §9 |
| `store.Item` | T04 | T07 (constructs + PutItem), T09 (serializes via itemDTO conversion) | yes (struct crosses; converted at api boundary) | contracts.md §3, §4 |
| `store.Library` | T04 | T07 (reads root_path + module_id) | yes (read-only consumer) | contracts.md §4 |
| `store.Open` / `store.Store` | T04 | T05 (module.Open), T10 (wiring) | yes | contracts.md §4 |
| `store.CreateLibrary` / `GetLibrary` / `QueryItems` / `PutItem` | T04 | T09 (CreateLibrary/QueryItems), T07 (GetLibrary/PutItem) | yes | contracts.md §4 |
| `module.Registry` / `module.Open` / `module.Get` / `module.Module` / `module.ScannerBinding` | T05 | T07 (resolves scanner binding), T10 (wiring) | yes | contracts.md §6 |
| `plugin.Manager` / `plugin.Open` / `plugin.Load` / `plugin.Start` / `plugin.Stop` / `plugin.Status` / `plugin.Scanner` / `plugin.Deps` / `plugin.Health` | T06 | T07 (Manager.Scanner), T10 (wiring) | yes | contracts.md §5 |
| `scan.Run` / `scan.Deps` / `scan.Result` | T07 | T09 (api.Deps.Scan = scan.Run), T10 (wiring) | yes | contracts.md §7 |
| `api.New` / `api.Deps` / `api.Principal` | T09 | T10 (wiring) | yes (api.New) / api-internal (Principal) | contracts.md §8 |
| base-scanner binary (`plugins/base-scanner`) | T08 | T06 (Manager launches it), T10 (path config), T11 (integration test builds + runs it) | yes (the subprocess) | integration_map S5 |

## Order Dependencies

Task N depends on Task M (M must complete before N starts). Reason = the symbol
or artifact N consumes that M produces. Dependency direction is downward-only
(`api → scan → {module, plugin} → store` with proto + pkg/sdk as shared leaves).

| Task | Must Complete Before | Reason |
|---|---|---|
| T02 | T01 | needs go.mod (module path) |
| T03 | T02 | imports generated `scannerv1.*`/`pluginv1.*` |
| T04 | T01 | needs go.mod; adds `modernc.org/sqlite` (no proto dep — store is the bottom) |
| T05 | T04 | imports `internal/store` (reads modules table) |
| T06 | T03, T02 | imports `pkg/sdk` (ScannerPlugin/Capability) + proto (pluginv1/scannerv1) |
| T07 | T04, T05, T06, T03 | imports store + module + plugin + sdk (the orchestrator) |
| T08 | T03, T02 | imports `pkg/sdk` (Serve/ScannerPlugin/Scanner) + scannerv1 |
| T09 | T04, T07 | imports store + scan (Result via deps.Scan) |
| T10 | T04, T05, T06, T07, T09, T03 | wires every package (composition root) |
| T11 | T08, T10 | builds + runs the server + base-scanner binaries end-to-end |
| T13 | T02 | the `.pb.go` exclusion is exercised against generated proto files |
| T12 | T01-T11, T13 | runs the gates over the finished module (incl. the R2 exclusion) |
| QA-1 | T11 | writes an INDEPENDENT acceptance test (not a copy of the coder's golden) |
| QA-2 | QA-1 | shares the test harness; resilience/matrix after the happy path is proven |
| DOCS-1 | T07 | syncs the module map to include `internal/scan` (must exist) |
| DOCS-2 | T09, T10 | documents endpoints + config that must be realized |

Parallelizable: T04 (store) is independent of T02/T03 (proto/sdk) — they share
only T01. T05 depends only on T04. T06 depends on T02+T03. A coder running in
dependency order with parallelism could do {T02, T04} after T01, then {T03, T05}
after their deps, etc. The linear numbering is the safe serial order.

## Potential Conflicts

| Tasks | Shared File | Risk | Mitigation |
|---|---|---|---|
| T01, T02, T03, T04, T06, T09 | `mellifera/go.mod` (each adds a dep) | merge conflicts on `go.mod`/`go.sum` if tasks run concurrently | run in dependency order; each task runs `go mod tidy` at its end; T01 establishes the module, later tasks only ADD deps (no removals) |
| T02, T12, T13 | `mellifera/.claude/skills/mellifera-build/scripts/check.sh` is READ by T12; MODIFIED only by T13 | T12 must not edit check.sh (T13 owns it) | scope_boundary in T12 excludes check.sh logic changes; T13 is the single writer |
| T08, T11 | base-scanner binary + testdata fixtures | T11 builds + runs T08's binary; fixture ownership | T11 owns `integration_test.go` + fixtures; T08 owns the binary source. T11 must build from T08's committed source, not a stale binary. |

## Circular Dependencies

None found. The dependency graph is a DAG matching the downward-only import
direction (`api → scan → {module, plugin} → store`; proto + pkg/sdk shared
leaves). Verified: no task imports a consumer of its own output.

## Cross-Project Tasks

N/A — single Go module this feature (`base-scanner` is part of the main module
per R7, not a separate subproject). No `cross_project_callers`.

## Archetype / Canonical-Task-Skeleton mapping

The resolved archetypes per coder task (from `software-design` Application
Archetypes): web-async (T09 api), data (T04 store, T05 module), external-services
(T03 sdk, T06 plugin, T07 scan, T08 base-scanner, T02 protos, T11 integration),
cli (T01, T10, T12, T13). Every applicable family in each archetype maps to an
emitted task; no families skipped without a documented reason.

## Notes for the coder

1. **R2 grounding alert (G2 drift).** The plan's architecture_review.md R2
   assumed `check.sh` counts `.pb.go`. The LIVE `check.sh` (read this turn,
   line 30) ALREADY excludes `*.pb.go` via the find filter. T13 is therefore a
   VERIFY + defensive-harden task, not a blind edit. Read check.sh before
   editing it.
2. **buf MISSING in environment.** state.json phase_log notes `buf` is not
   installed (protoc 29.3 is). T02 documents the protoc fallback (identical
   output). Use whichever is available; COMMIT the generated `.pb.go`.
3. **golangci-lint NOT installed** (state.json phase_log). T12 will BLOCK on
   this for AC-2 — surface it; do not fake a green gate.
4. **WARN packages are pre-justified** (R10): store=10, plugin=9. Do not block
   on the symbol count; do not add more symbols to those packages.
5. **`.claude/` is gitignored** at the repo root (state.json repo_gitignore_note).
   T13's check.sh edit + the skill files themselves are untracked — surface the
   force-add-vs-leave question at commit time (do not silently force-add).
6. **`internal/scan` + the plugin naming deviations** (Call→Scanner,
   Health→Status) are documented decisions; DOCS-1 syncs the module map.
