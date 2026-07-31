- [x] Task 05 (coder): Implement internal/module (config-driven registry)
  target: mellifera/internal/module/doc.go, mellifera/internal/module/registry.go, mellifera/internal/module/*_test.go | action: CREATE
  archetype: data
  skill_hint: stack-patterns
  feature_goal: (see T01)
  why: The module registry is THE architectural differentiator (arch §0 principle 1): the core never branches on media_type. `"tv"` lives in a `modules` table row, not a Go type. `Registry.Get` returns the scanner capability binding (`plugin_id`, `capability_id`, `options`) that the scan orchestrator (T07) uses. This is where "config-driven, not type-per-media" becomes real.
  data_flow: enters from: T04 store (reads `modules` table) → transforms: parse `config_json` rows into in-memory `Module` cache (Open), serve cache-only Get/List → emits to: T07 scan (resolves library's module → ScannerBinding), T10 cmd (module.Open wiring).
  related: producer T04 (store); consumers T07, T10; seam S10 (module↔store), S2 (scan resolves module).
  imports:
    - github.com/mellifera/mellifera/internal/store  # reads modules table
    - encoding/json  # parse config_json into ScannerBinding.Options
    - context  # Open ctx
    - fmt  # error wrapping
  allowed_imports:
    - github.com/mellifera/mellifera/internal/store
    - encoding/json
    - context
    - fmt
  allowed_categories:
    - stdlib
  precondition: |
    `internal/store` exists with the `modules` table created by T04 migrations (T04 done). evidence: contracts.md §6 (module depends on store); arch §2.4 (module config). No `internal/module/` exists (greenfield).
  behaviors:
    - B1: `Open(ctx, *store.Store)` runs `SELECT * FROM modules WHERE enabled=1`, parses each row's `config_json` into `Module` (incl. `ScannerBinding`), caches in memory | ac: AC-1 | kind: normal
    - B2: `Get(moduleID)` returns the cached `Module` (cache-only — pure, no I/O after Open) | ac: AC-1 | kind: normal
    - B3: `List()` returns all enabled modules | ac: AC-2 | kind: normal
    - B4: a TV module config row (arch §2.4.1 example) is seeded so `Get("tv")` returns `Module{ID:"tv", MediaType:"tv", Scanner: ScannerBinding{PluginID:"base-scanner", CapabilityID:"default", Options: ...}}` | ac: AC-1 | kind: normal
    - B5: `Get` on an unknown moduleID returns a clear not-found error (no nil-deref) | ac: AC-2 | kind: edge
    - INV-style: the core never branches on media_type — media_type is a string carried in Module, never a switch in Go code | ac: AC-1 | kind: normal
  invariants:
    - INV1: `Module` is a CONFIG ENTITY, not a Go interface with per-type impls. There is no `MovieModule`/`TVModule` type hierarchy (arch §2.4.2 — media_type is a string).
    - INV2: `Get`/`List` are cache-only (pure) after `Open`. No DB read on the hot path.
    - INV3: `module` MAY import `internal/store` + proto ONLY; MAY NOT import `internal/plugin`, `internal/scan`, `internal/api` (contracts.md §10).
    - INV4: Exported symbol count = 5 (Registry, Module, ScannerBinding, Open, Get, List — note: Registry type + Open/Get/List funcs + Module/ScannerBinding types). Under 8.
  postcondition: |
    (AC-1/AC-2) `internal/module` ships `Registry`/`Module`/`ScannerBinding`/`Open`/`Get`/`List` (≤8); TV module seeded; Get("tv") returns the scanner binding; `go test ./internal/module/` green.
  test_seed: |
    # arrange: temp store with T04; INSERT a TV module config row (arch §2.4.1 shape). act: module.Open(store); Get("tv"); List(). assert: ScannerBinding.PluginID=="base-scanner"; MediaType=="tv"; List includes the TV row.
  spec: |
    Signatures (contracts.md §6 — copy verbatim):
    type Registry struct { /* in-memory cache of module configs */ }
    type Module struct { ID string; MediaType string; SchemaVersion int; Scanner ScannerBinding }
    type ScannerBinding struct { PluginID string; CapabilityID string; Options json.RawMessage }
    func Open(ctx context.Context, s *store.Store) (*Registry, error)
    func (r *Registry) Get(moduleID string) (Module, error)
    func (r *Registry) List() ([]Module, error)

    Steps:
    1. Write `doc.go`: responsibility (config entity, not type-per-media), public API (5), invariants (cache-only Get, media_type is a string, core never branches on it). Apache header.
    2. `registry.go`: `Open` queries the `modules` table via `*store.Store`'s `*sql.DB` (the store exposes the DB or module runs its own parameterized SELECT through the shared `*sql.DB` — decide at coder time: store.Open returns *Store which can expose a `DB()` accessor OR module receives `*sql.DB`; pick the option that keeps store the SOLE `*sql.DB` opener — module must NOT call sql.Open). Parse `config_json` into `Module`. `Get`/`List` from cache.
    3. Seed the TV module: add a seed/migration row for the TV module (arch §2.4.1) so Get("tv") works without a runtime config file. Prefer a seed SQL constant applied at first Open (idempotent INSERT OR IGNORE) to avoid a config-file dependency (planner's "decide at coder time — a seed avoids runtime config file deps").
    4. Table test (`registry_test.go`): seed modules table; Open; Get("tv") returns expected binding; Get unknown → error; List includes TV.
  test_exclusions:
    - "Module / ScannerBinding — plain data structs, exercised via Get/List table tests"
  error_handling:
    - "moduleID not found": return a wrapped `fmt.Errorf("module %q: %w", id, ErrNotFound)`-style error (define a sentinel or use sql.ErrNoRows wrapping).
    - "malformed config_json": Open returns error naming the offending module row.
  callers_to_update: []
  contract_test_scope:
    - joint: internal/module -> internal/store | assert: Open reads enabled modules; Get is cache-only (no second DB hit)
  negative_examples:
    - "DO NOT create per-media-type Go types (no TVModule struct). media_type is a string."
    - "DO NOT call sql.Open in module — store is the sole *sql.DB owner."
    - "DO NOT branch on media_type in core code (this package just carries it)."
    - "DO NOT import internal/plugin/scan/api."
  existing_code_snapshot: |
    (GREENFIELD — internal/module/ does not exist. evidence: source_baseline.md:14.)
  source_anchor: contracts.md:170-197 (§6 module interface); File Map implementation_plan.md:118-122 (module rows); arch §2.4/§2.4.1 (TV module config, cited source_baseline.md:77)
  scope_boundary: "This task ONLY creates files under mellifera/internal/module/. No other files."
  out_of_scope:
    - mellifera/internal/store/  # T04 (module consumes it, does not modify)
    - any seed for non-TV modules (metadata-source config DEFERRED)
  line_budget: 350
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-1 | given: TV module seeded | when: scan resolves the library's module | then: Get("tv") returns the base-scanner binding
    - scenario: AC-2 | given: feature branch | when: check.sh + go test ./internal/module/ | then: green + ≤8 symbols
  verify: cd mellifera && go test ./internal/module/... && grep -rn 'switch.*[Mm]ediaType\|case "tv"' mellifera/internal/module/ ; test $? -eq 1
