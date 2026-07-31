- [x] Task 10 (coder): Implement cmd/mellifera (flat wiring, package main)
  target: mellifera/cmd/mellifera/main.go | action: CREATE
  archetype: cli
  skill_hint: mellifera-build
  feature_goal: (see T01)
  why: The composition root. A flat, readable constructor list top-to-bottom: config → store.Open → module.Open → plugin.Open + Load(base-scanner) + Start → scan.Deps assembled → api.New → http.ListenAndServe. No DI container, no reflect, no init-time branching beyond reading config (ai-arch §2 principle 5; mellifera-build skill; depguard denies reflect + DI). The integration test (T11) exercises this wiring end-to-end (AC-1).
  data_flow: enters from: env/config (data dir, admin token, base-scanner binary path) → transforms: construct the whole app graph in one file → emits to: a running HTTP server (api.New handler) backed by store + module + plugin(+base-scanner subprocess) + scan.
  related: producers T04,T05,T06,T07,T09; seam S11 (wiring — the joint that proves all packages compose).
  imports:
    - github.com/mellifera/mellifera/internal/store
    - github.com/mellifera/mellifera/internal/module
    - github.com/mellifera/mellifera/internal/plugin
    - github.com/mellifera/mellifera/internal/scan
    - github.com/mellifera/mellifera/internal/api
    - github.com/mellifera/mellifera/pkg/sdk  # Capability struct for Load
    - net/http
    - os
    - context
    - log/slog
  allowed_imports:
    - github.com/mellifera/mellifera/internal/store
    - github.com/mellifera/mellifera/internal/module
    - github.com/mellifera/mellifera/internal/plugin
    - github.com/mellifera/mellifera/internal/scan
    - github.com/mellifera/mellifera/internal/api
    - github.com/mellifera/mellifera/pkg/sdk
    - net/http
    - os
    - context
    - log/slog
    - fmt
  allowed_categories:
    - stdlib
  precondition: |
    `internal/{store,module,plugin,scan,api}` + `pkg/sdk` all compile (T04,T05,T06,T07,T09,T03 done). No `cmd/mellifera/` exists (greenfield — source_baseline.md:14).
  behaviors:
    - B1: `main()` reads config (data dir + admin token + base-scanner binary path from env/config) with sane MVP defaults | ac: AC-1 | kind: normal
    - B2: constructs the graph in order: `store.Open` → `module.Open` → `plugin.Open` → `plugin.Load("base-scanner", path, []sdk.Capability{...})` → `plugin.Start` → `scan.Deps{...}` → `api.New(api.Deps{Store, Scan: scan.Run wired})` → `http.ListenAndServe` | ac: AC-1 | kind: normal
    - B3: NO DI framework, NO reflect, NO init-time branching beyond reading config (depguard-enforced; ai-arch principle 5) | ac: AC-2 | kind: normal
    - B4: the wiring is readable top-to-bottom in one file (the entire app graph visible) | ac: AC-2 | kind: normal
    - B5: graceful shutdown on SIGINT/SIGTERM: cancel ctx → api server shutdown → plugin.Stop (base-scanner) → store.Close | ac: AC-2 | kind: edge
  invariants:
    - INV1: FLAT main.go. A constructor list. No DI container, no reflect, no init branching. (ai-arch §2 principle 5; mellifera-build skill; depguard.)
    - INV2: `cmd/mellifera` MAY import everything (read-only wiring); nothing imports it (contracts.md §10).
    - INV3: `scan.Run` is wired into `api.Deps.Scan` so the api scan handler's ONE domain call reaches the orchestrator.
    - INV4: base-scanner binary path is dev-mode (filesystem path) per enhanced_objective (go:embed first-run extraction DEFERRED).
  postcondition: |
    (AC-1/AC-2) `cmd/mellifera/main.go` builds a runnable server binary; `go build ./cmd/mellifera` succeeds; the integration test (T11) starts this server + drives AC-1 end-to-end.
  test_seed: |
    # arrange: all packages compile. act: go build ./cmd/mellifera → produces the server binary. assert: the binary starts (integration test T11 launches it on a temp DB + random port); wiring is a flat constructor list (no reflect import).
  spec: |
    Signatures:
    func main()  // the whole app graph in one function

    Steps:
    1. Read config: data dir (default ./data), admin token (env MELLIFERA_ADMIN_TOKEN), base-scanner binary path (env/config, dev mode), listen address (default 127.0.0.1:8080).
    2. Construct in order: ctx (signal-cancellable); store.Open(ctx, dsn); module.Open(ctx, store); plugin.Open(plugin.Deps{MagicCookie..., CoreVersion...}); plugin.Load("base-scanner", path, []sdk.Capability{{Type:"scanner",ID:"default",ProtoService:"mellifera.scanner.v1.Scanner"}}); plugin.Start(ctx, "base-scanner"); assemble scan.Deps{Store, Plugins, Modules}; api.New(api.Deps{Store, Scan: func(ctx,id) (scan.Result,error){ return scan.Run(ctx, scanDeps, id) }}); http.ListenAndServe.
    3. Graceful shutdown: signal trap → ctx cancel → server.Shutdown → plugin.Stop("base-scanner") → store.Close.
    4. No test file required (main wiring; exercised by T11 integration test). Add a build smoke: `go build ./cmd/mellifera` in T12.
  test_exclusions:
    - "main() — wiring only; no logic to unit-test. Exercised end-to-end by the integration test (T11) and the build gate (T12)."
  error_handling:
    - "config missing required value (e.g. admin token unset)": log + exit non-zero at startup (fail-fast). Do NOT serve with an empty token.
    - "store.Open / module.Open / plugin.Start failure at startup": log + exit non-zero. Fail-fast composition.
    - "plugin.Start(base-scanner) fails": log + exit non-zero (MVP: base-scanner is required; Phase 2 may degrade).
  callers_to_update: []
  negative_examples:
    - "DO NOT use `reflect` or any DI framework (depguard denies both)."
    - "DO NOT add init-time branching beyond reading config."
    - "DO NOT hide wiring behind helpers/interfaces — keep it a flat, readable list."
    - "DO NOT serve with an empty admin token."
  existing_code_snapshot: |
    (GREENFIELD — cmd/mellifera/ does not exist. evidence: source_baseline.md:14.)
  source_anchor: contracts.md:305-319 (§10 import map — cmd/mellifera imports everything); File Map implementation_plan.md:155-158 (cmd row); ai-arch §2 principle 5 (flat main.go)
  scope_boundary: "This task ONLY creates mellifera/cmd/mellifera/main.go. No other files."
  out_of_scope:
    - go:embed first-run binary extraction (DEFERRED — release packaging, D11/Q20)
    - config-file format design (env + sane defaults only this feature)
  line_budget: 200
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-1 | given: server built | when: integration test starts it | then: AC-1 end-to-end passes (wiring correct)
    - scenario: AC-2 | given: feature branch | when: go build ./cmd/mellifera + grep reflect/DI | then: builds; zero reflect; zero DI imports
  verify: cd mellifera && go build ./cmd/mellifera && grep -rn '"reflect"\|github.com/!w!a!g!o!n' mellifera/cmd/mellifera/ ; test $? -eq 1
