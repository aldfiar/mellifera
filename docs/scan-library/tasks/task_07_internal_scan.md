- [x] Task 07 (coder): Implement internal/scan (scan orchestrator — NEW package) — DONE 2026-07-30
  target: mellifera/internal/scan/doc.go, mellifera/internal/scan/run.go, mellifera/internal/scan/*_test.go | action: CREATE
  archetype: external-services
  skill_hint: stack-patterns
  feature_goal: (see T01)
  why: This package exists to keep `api/` pure-delegation (ai-arch §3 hard rule). The scan handler does ONE thing: call `scan.Run`. Run coordinates store + module + plugin (resolve library's module → scanner capability → stream Scan → per-file Identify → assemble Document → PutItem). It is the scan-side analog of the deferred `enrich` package (decision log). Without it, orchestration would leak into api/.
  data_flow: enters from: T09 api scanHandler (calls Run) → transforms: store.GetLibrary → module.Get → plugin.Scanner → drain scanner.Scan channel → scanner.Identify per file → assemble store.Item.Document (ffprobe bytes + parsed Struct + core-managed fields per arch §3.1) → store.PutItem → emits to: T04 store (PutItem), T09 api (Result serialized to scanResponse).
  related: producers T04 (store), T05 (module), T06 (plugin); consumer T09 (api); seams S2 (resolve module), S3 (Scanner stream), S4 (scan→store PutItem).
  imports:
    - github.com/mellifera/mellifera/internal/store  # GetLibrary, PutItem, Item
    - github.com/mellifera/mellifera/internal/module  # Registry.Get → ScannerBinding
    - github.com/mellifera/mellifera/internal/plugin  # Manager.Scanner → sdk.Scanner
    - github.com/mellifera/mellifera/pkg/sdk  # Scanner interface
    - github.com/mellifera/mellifera/proto/mellifera/scanner/v1  # ScanRequest/DiscoveredFile/IdentifyRequest/IdentifyResult
    - context
    - encoding/json  # assemble Document
    - time  # Result timestamps
    - fmt
  allowed_imports:
    - github.com/mellifera/mellifera/internal/store
    - github.com/mellifera/mellifera/internal/module
    - github.com/mellifera/mellifera/internal/plugin
    - github.com/mellifera/mellifera/pkg/sdk
    - github.com/mellifera/mellifera/proto/mellifera/scanner/v1
    - context
    - encoding/json
    - time
    - fmt
  allowed_categories:
    - stdlib
  precondition: |
    `internal/store`, `internal/module`, `internal/plugin`, `pkg/sdk` all compile (T04/T05/T06/T03 done). No `internal/scan/` exists (greenfield — source_baseline.md:14).
  behaviors:
    - B1: `Run(ctx, Deps, libraryID)` calls `store.GetLibrary(libraryID)` once → `modules.Get(library.ModuleID)` → `plugins.Scanner(binding.PluginID, binding.CapabilityID)` → `sdk.Scanner` | ac: AC-1 | kind: normal
    - B2: builds `ScanRequest{library_path: lib.RootPath, module_type: mod.MediaType, options: binding.Options}` and calls `scanner.Scan` → drains the `<-chan DiscoveredFile` at store-write speed (backpressure via bounded channel, R9) | ac: AC-1 | kind: normal
    - B3: for each DiscoveredFile: `scanner.Identify(IdentifyRequest{file, module_type})` → assemble `store.Item.Document` (ffprobe bytes + parsed fields + core-managed fields per arch §3.1) → `store.PutItem` (upsert by file_id) | ac: AC-1 | kind: normal
    - B4: aggregates counts (Discovered, Persisted) + warnings into `Result`; returns Result | ac: AC-1 | kind: normal
    - B5: scanner warnings (e.g. path-traversal skip, ffprobe soft-fail) propagate into Result.Warnings; the scan continues (does not abort on a soft per-file failure) | ac: AC-6 | kind: edge
    - B6: ctx cancellation aborts the drain cleanly — the stream is cancelled, partial items already PutItem-ed remain (idempotent re-scan will resume), Run returns a ctx error | ac: AC-1 | kind: error
  invariants:
    - INV1: `Run` is the ONLY function the api scan handler calls (pure-delegation rule). It owns the store→module→plugin→store orchestration.
    - INV2: The orchestrator NEVER branches on media_type (arch §0 principle 1). `module_type` flows from the module config into ScanRequest as an opaque string.
    - INV3: Document assembly is owned by scan (ffprobe bytes verbatim + parsed Struct + core-managed fields). The store treats Document as opaque (INV3 of T04).
    - INV4: Drain at store-write speed — do NOT buffer the whole stream in memory (R9). The sdk channel is bounded; consume → Identify → PutItem in lockstep.
    - INV5: `scan` MAY NOT import `internal/api` (contracts.md §10).
    - INV6: Exported symbol count = 3 (Deps, Result, Run). Under 8.
  postcondition: |
    (AC-1/AC-6) `internal/scan` ships Run + Deps + Result (3 symbols); a fake sdk.Scanner + temp store test asserts the persisted items match the fake's emission, warnings propagate, ctx cancellation aborts cleanly.
  test_seed: |
    # arrange: temp store w/ a library + TV module seeded; a fake sdk.Scanner emitting 2 fixed DiscoveredFiles (one with ffprobe bytes, one with empty ffprobe + warning) + fixed IdentifyResults. act: scan.Run(ctx, deps, libraryID). assert: store has exactly 2 items; the unprobeable item has empty ffprobe + a warning; Result.Discovered==2, Persisted==2; cancel mid-stream → Run returns ctx error.
  spec: |
    Signatures (contracts.md §7 — copy verbatim):
    type Deps struct { Store *store.Store; Plugins *plugin.Manager; Modules *module.Registry }
    type Result struct { LibraryID int64; Discovered int; Persisted int; Warnings []string; StartedAt, FinishedAt time.Time }
    func Run(ctx context.Context, deps Deps, libraryID int64) (Result, error)

    Steps:
    1. Write `doc.go`: responsibility (scan-side orchestrator, keeps api pure-delegation; analog of deferred enrich), public API (3), invariants (no media_type branching, drain at store-write speed, Document assembly owned here). Apache header.
    2. `run.go`: `Run` flow = GetLibrary → modules.Get → plugins.Scanner → scanner.Scan (drain) → per-file Identify → assemble Document → PutItem → aggregate Result. Unexported `assembleDocument(file DiscoveredFile, id IdentifyResult) json.RawMessage` (ffprobe bytes + parsed + core-managed per arch §3.1).
    3. Table test (`run_test.go`): fake sdk.Scanner (the 2nd real impl — R8) + temp store. Assert (a) items persisted == fake emission w/ correct Document shape (S2/S3/S4); (b) unprobeable file → empty ffprobe + warning, item still present (AC-6); (c) ctx cancellation aborts cleanly.
  test_exclusions:
    - "Deps / Result — plain data structs, exercised via the Run table test"
  error_handling:
    - "libraryID not found (GetLibrary)": return wrapped error; api maps to 404 (T09).
    - "module not found / scanner capability unavailable": return wrapped error identifying which resolution step failed.
    - "scanner.Scan stream error / Identify error": record a warning, continue (soft-fail per AC-6 philosophy); only hard-fail Run if ctx is cancelled or GetLibrary failed.
  callers_to_update: []
  contract_test_scope:
    - joint: internal/scan -> internal/store + internal/module + internal/plugin | assert: Run resolves module → scanner → drains stream → PutItem matches fake emission (S2+S3+S4 in one test)
  negative_examples:
    - "DO NOT put any orchestration in api/ — it lives here."
    - "DO NOT branch on media_type (it is an opaque string from module config)."
    - "DO NOT buffer the whole stream in memory (drain at store-write speed — R9)."
    - "DO NOT parse Document inside the store (Document assembled here, opaque there)."
    - "DO NOT import internal/api."
  existing_code_snapshot: |
    (GREENFIELD — internal/scan/ does not exist. evidence: source_baseline.md:14.)
  source_anchor: contracts.md:199-238 (§7 scan orchestrator interface + flow); File Map implementation_plan.md:130-134 (scan rows); arch §4.1/§3.1 (flow + document assembly)
  scope_boundary: "This task ONLY creates files under mellifera/internal/scan/. No other files."
  out_of_scope:
    - mellifera/internal/api/  # T09 (the pure-delegation caller)
    - enrichment / metadata-side orchestration (DEFERRED — `internal/enrich`)
  line_budget: 450
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-1 | given: a library + working scanner | when: Run | then: items persisted match the scanner emission
    - scenario: AC-6 | given: one unprobeable file | when: Run | then: item still persisted with empty ffprobe + warning
    - scenario: AC-2 | given: feature branch | when: check.sh + go test ./internal/scan/ | then: green + 3 symbols
  verify: cd mellifera && go test ./internal/scan/...
