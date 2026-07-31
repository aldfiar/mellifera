- [x] Task 09 (coder): Implement internal/api (chi router — PURE DELEGATION)
  target: mellifera/internal/api/{doc.go,router.go,middleware.go,handlers.go,*_test.go} | action: CREATE
  archetype: web-async
  skill_hint: stack-patterns
  feature_goal: (see T01)
  why: The HTTP edge. Every handler does exactly parse → ONE domain call → write (ai-arch §3 hard rule; mellifera-build skill). The admin-token middleware resolves `Principal{Admin:true}` into context (Q15/D18 — grounds Phase 2 multi-user). DTOs are unexported with struct conversion at the store boundary (no store.Item over the wire). AC-5 gates auth.
  data_flow: enters from: HTTP client (POST /libraries, POST /libraries/{id}/scan, GET /items) → transforms: admin middleware → Principal in ctx; handler parses → ONE domain call (store.CreateLibrary / deps.Scan / store.QueryItems) → write DTO + canonical error body → emits to: T04 store (CreateLibrary/QueryItems), T07 scan (Run via injected deps.Scan).
  related: producers T04 (store), T07 (scan); consumer T10 (cmd wiring); seams S1 (scanHandler→deps.Scan), S8 (admin middleware→Principal), S11 (wiring).
  imports:
    - github.com/go-chi/chi/v5  # router
    - github.com/mellifera/mellifera/internal/store  # CreateLibrary/QueryItems + types
    - github.com/mellifera/mellifera/internal/scan  # scan.Result (via deps.Scan func type)
    - net/http
    - context
    - encoding/json
    - strconv  # parse {id} + pagination
    - crypto/subtle  # constant-time token compare
  allowed_imports:
    - github.com/go-chi/chi/v5
    - github.com/mellifera/mellifera/internal/store
    - github.com/mellifera/mellifera/internal/scan
    - net/http
    - context
    - encoding/json
    - strconv
    - crypto/subtle
  allowed_categories:
    - stdlib
  precondition: |
    `internal/store` (T04) + `internal/scan` (T07) compile. No `internal/api/` exists (greenfield — source_baseline.md:14).
  behaviors:
    - B1: `New(Deps) http.Handler` returns a chi router with admin-token middleware + 3 routes | ac: AC-1 | kind: normal
    - B2: `POST /api/v1/libraries` → parse `createLibraryRequest{module_id, root_path, display_name}` → `store.CreateLibrary(...)` → write `libraryResponse` (ONE domain call) | ac: AC-1 | kind: normal
    - B3: `POST /api/v1/libraries/{id}/scan` → parse `{id}` → `deps.Scan(ctx, id)` → write `scanResponse` (ONE domain call — pure delegation, S1) | ac: AC-1 | kind: normal
    - B4: `GET /api/v1/items?library={id}` → parse `{id}` + pagination → `store.QueryItems(...)` → write `itemsResponse` (ONE domain call) | ac: AC-1 | kind: normal
    - B5: admin-token middleware: `Authorization: Bearer <token>` constant-time-compared to the configured admin token → `Principal{Admin:true}` in context; missing/wrong scheme/wrong token → 401 canonical body, no side effect (AC-5) | ac: AC-5 | kind: error
    - B6: DTOs (`createLibraryRequest`, `libraryResponse`, `scanResponse`, `itemsResponse`, `itemDTO`) are UNEXPORTED; struct conversion at the store boundary — no `store.Item` serialized over the wire | ac: AC-2 | kind: normal
    - B7: canonical error body `{"error":{"code","message","retryable"}}` on 4xx/5xx (arch §11.6) | ac: AC-2 | kind: error
  invariants:
    - INV1: PURE DELEGATION. Each handler: parse → ONE domain call → write. No branching, no orchestration. funlen ≤60, gocognit ≤15 (golangci-lint enforced).
    - INV2: `api` MAY import `internal/store`, `internal/scan`, `pkg/sdk` (Principal only); MAY NOT import `internal/plugin`, `internal/module` (api talks to them only via scan.Run — contracts.md §10).
    - INV3: `Principal` is a TYPE (not a bool gate) — Q15/D18. Phase 2 adds a session resolver behind the same middleware; handler signatures unchanged (arch §11.5).
    - INV4: No `store.Item` over the wire — `itemDTO` conversion at the boundary (no shared mutable types; ai-arch §2 corollary).
    - INV5: Exported symbol count = 3 (Deps, Principal, New). Under 8. (Handlers + DTOs + middleware are unexported.)
  postcondition: |
    (AC-1/AC-5/AC-2) `internal/api` ships New + Deps + Principal (3 symbols); 3 pure-delegation handlers; admin-token middleware (constant-time); httptest table covers each handler happy/error + the middleware matrix (no/wrong/correct token) — AC-5.
  test_seed: |
    # arrange: httptest server via New(Deps{Store: tempStore, Scan: stub}); admin token "T". act: (a) POST /libraries w/ Bearer T → 2xx + library created; (b) POST /libraries w/ no header / wrong token → 401 + no library; (c) POST /libraries/{id}/scan w/ Bearer T → stub called w/ parsed id; (d) GET /items?library={id} → items. assert via httptest.
  spec: |
    Signatures (contracts.md §8 — copy verbatim):
    type Deps struct { Store *store.Store; Scan func(ctx context.Context, libraryID int64) (scan.Result, error) }
    type Principal struct { Admin bool }
    func New(deps Deps) http.Handler

    Steps:
    1. Write `doc.go`: responsibility (HTTP edge, pure-delegation), public API (3), invariants (one domain call/handler, Principal grounding, no internal/plugin/module import). Apache header.
    2. `router.go`: `New(Deps)` builds chi router; mounts admin middleware; 3 routes → unexported handlers. `Deps` + `Principal` types.
    3. `middleware.go`: unexported admin-token middleware — extract Bearer, `subtle.ConstantTimeCompare` to configured token, on match put `Principal{Admin:true}` in ctx + next; on miss → 401 canonical body.
    4. `handlers.go`: 3 unexported handlers (`createLibrary`, `scanLibrary`, `listItems`) + unexported DTOs (`createLibraryRequest`, `libraryResponse`, `scanResponse`, `itemsResponse`, `itemDTO`). Each: parse → ONE domain call → write. Canonical error writer.
    5. Table tests via httptest (`router_test.go`, `middleware_test.go`): each handler happy + error path; middleware matrix (no header / wrong scheme / wrong token / correct token — S8/AC-5).
  test_exclusions:
    - "Deps / Principal — plain data structs, exercised via New + middleware table tests"
  error_handling:
    - "bad JSON body / missing field": 400 canonical body.
    - "bad {id} (non-numeric)": 404 or 400 canonical body (chi route + parse).
    - "admin token missing/wrong": 401 canonical body, no side effect (B5/AC-5).
    - "domain call returns error (e.g. library not found)": map to 4xx/5xx + canonical body (MVP simple mapping; Mode B richness deferred).
  callers_to_update: []
  contract_test_scope:
    - joint: internal/api scanHandler -> deps.Scan | assert: parse {id} → exactly ONE deps.Scan call w/ the parsed id → write scanResponse (S1)
    - joint: internal/api middleware -> Principal | assert: correct token → Principal{Admin:true} in ctx; wrong/missing → 401 (S8/AC-5)
  negative_examples:
    - "DO NOT put logic/orchestration in a handler — parse → ONE call → write."
    - "DO NOT import internal/plugin or internal/module (talk to them only via scan.Run)."
    - "DO NOT serialize store.Item over the wire — convert to itemDTO at the boundary."
    - "DO NOT use non-constant-time token comparison."
    - "DO NOT exceed funlen 60 / gocognit 15."
  existing_code_snapshot: |
    (GREENFIELD — internal/api/ does not exist. evidence: source_baseline.md:14.)
  source_anchor: contracts.md:240-266 (§8 api interface + invariants); File Map implementation_plan.md:136-142 (api rows); integration_map.md S1/S8
  scope_boundary: "This task ONLY creates files under mellifera/internal/api/ + edits go.mod (add chi). No other files."
  out_of_scope:
    - mellifera/internal/scan/  # T07 (api calls it, does not modify)
    - Mode B domain-error richness / session resolver (DEFERRED — Phase 2)
  line_budget: 650
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-1 | given: server up | when: POST /libraries + POST /scan + GET /items | then: end-to-end flow works
    - scenario: AC-5 | given: admin token T | when: no/wrong/correct Bearer | then: 401/401/2xx
    - scenario: AC-2 | given: feature branch | when: check.sh + go test ./internal/api/ | then: green + 3 symbols
  verify: cd mellifera && go test ./internal/api/... && grep -rn '"internal/plugin"\|"internal/module"' mellifera/internal/api/ ; test $? -eq 1
