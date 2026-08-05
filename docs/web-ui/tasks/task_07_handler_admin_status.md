# Task 07 — api: `Deps.Status` field + `adminStatus` handler + `AdminStatus`/`statusResponse`/`pluginHealthDTO`/`enrichStatsDTO`; mount `GET /admin/status`

- **Type:** coder
- **Step:** 7 (Outline)
- **Seams:** S-admin-status (api side)
- **AC trace:** AC-5
- **Project scope:** `.` (root; MODIFY `internal/api`)
- **Deps:** none new (the closure body is Task 13 in `cmd/mellifera`; this task defines the api-side types + the nil-safe handler)
- **Estimated LOC:** ~55 (S)

## behaviors

- **B1** `Deps` gains an additive `Status func(ctx context.Context) (AdminStatus, error)` field (mirrors the existing `Deps.Scan` func-field pattern at `router.go:24`). | ac: AC-5 | kind: normal
- **B2** `(*app).adminStatus(w, r)` is mounted at `GET /api/v1/admin/status`; it calls `a.deps.Status(r.Context())` and writes `200 statusResponse{Plugins []pluginHealthDTO, Enrich enrichStatsDTO}`. | ac: AC-5 | kind: normal
- **B3** `Deps.Status == nil` → `503 unavailable` via `writeError` ("status endpoint disabled" — the api package never imports plugin/enrich, so a nil closure is the disabled state). | ac: AC-5 | kind: error
- **B4** A non-nil `Deps.Status` returning an error → `500 internal_error` via `writeError`. | ac: AC-5 | kind: error
- **B5** `AdminStatus` is the api-local aggregate the closure returns: `{Plugins []pluginHealthDTO, Enrich enrichStatsDTO}`. `pluginHealthDTO{ID, State, Restarts, CheckedAt}` and `enrichStatsDTO{Pending, InFlight, Done, Failed}` are the wire shapes (INV4 — no `plugin.Health`/`enrich.Stats` over the wire; `CheckedAt` is RFC3339 string to keep `time` out of the DTO). | ac: AC-5 | kind: normal

## invariants

- **INV2-pure-delegation-closure:** the `api` package defines `AdminStatus`/`pluginHealthDTO`/`enrichStatsDTO` LOCALLY and does NOT import `internal/plugin` or `internal/enrich`. The `Deps.Status` closure is built in `cmd/mellifera` (Task 13) and returns the api-local `AdminStatus` — the SAME anti-corruption pattern as `Deps.Scan` (`router.go:24`). Reviewers enforce INV2 (depguard denies only reflect/DI; `.golangci.yml:32-39`).
- **INV-nil-safe:** because `Deps.Status` is additive, existing callers (`qa_auth_test.go:39`, `cmd/mellifera/main.go:127` pre-Task-13) that do not set it get the 503 path, NOT a nil-pointer panic. The handler checks `a.deps.Status == nil` BEFORE calling.
- **INV1-pure-delegation:** `adminStatus` is `nil-check → ONE closure call → write`. No branching beyond nil/error mapping. `funlen≤60`, `gocognit≤15`.
- **INV4-boundary-types:** `pluginHealthDTO.CheckedAt` is a `string` (RFC3339), NOT `time.Time` — keeps the api package free of a `time` import in the DTO (mirrors `itemDTO` time-omission, `handlers.go:60-62`). The closure (Task 13) does the `time.Time→string` formatting with `time.RFC3339`.

## precondition

`internal/api/router.go:21-25` defines `Deps{AdminToken, Store, Scan}` — the `Scan` func-field (`:24`) is the precedent. `internal/api/handlers.go:193` defines `writeError`. `internal/plugin/manager.go:68` defines `Health{State,Message,Restarts int,LastCheckedAt time.Time}`; `internal/plugin/lifecycle.go:102` `Manager.Status(pluginID)`. `internal/enrich/queue.go:80` defines `Stats{Pending,InFlight,Done,Failed}`; `:189` `Queue.Stats()`. None of these are imported by `api` today (INV2).
- evidence: `internal/api/router.go:21-25`; `internal/api/handlers.go:186-195`; `internal/plugin/manager.go:68-73`; `internal/plugin/lifecycle.go:102-116`; `internal/enrich/queue.go:80-85,189-196`; `docs/web-ui/source_baseline.md §internal/enrich + §internal/plugin` (zero api/cmd callers today).

## postcondition

`router.go` `Deps` has the new `Status` field. `handlers.go` defines `AdminStatus`, `statusResponse`, `pluginHealthDTO`, `enrichStatsDTO`, `(*app).adminStatus`. `router.go` mounts `r.Get("/admin/status", h.adminStatus)`. `go build ./internal/api && go test ./internal/api` green. `api` imports NEITHER `internal/plugin` NOR `internal/enrich` (INV2 — reviewer/grep-enforced).

## test_seed

Add an `admin_status` set of subtests (in `router_test.go` or a new `admin_status_test.go`): (a) `admin_status_nil_returns_503` — `api.New(api.Deps{AdminToken, Store, Scan})` with NO `Status` → `GET /api/v1/admin/status` (admin token) → 503 + `Error.Code=="unavailable"`. (b) `admin_status_happy` — `api.New` with `Status: func(ctx) (AdminStatus, error) { return AdminStatus{Plugins: []pluginHealthDTO{{ID:"base-scanner",State:"serving",Restarts:0,CheckedAt:"2026-08-05T00:00:00Z"}}, Enrich: enrichStatsDTO{Pending:2,InFlight:1,Done:5,Failed:0}}, nil }` → 200 + decode `statusResponse` + assert fields round-trip. (c) `admin_status_error_returns_500` — `Status` returns `errors.New("boom")` → 500 + `Error.Code=="internal_error"`. The route-level client-role→403 assertion is Task 08.

## callers_to_update

- `internal/api/router.go:21-25` — add `Status func(ctx context.Context) (AdminStatus, error)` to `Deps` (additive; existing callers that omit it compile — nil-safe).
- `internal/api/router.go:41-44` — add `r.Get("/admin/status", h.adminStatus)` inside `/api/v1`. (Task 08 moves it into the admin group.)
- `cmd/mellifera/main.go:127-133` — the `api.New(api.Deps{...})` literal does NOT set `Status` yet (Task 13 wires the closure). The literal compiles because `Status` is additive; the endpoint returns 503 until Task 13.

## allowed_imports

- (already imported in `router.go`) `context`, `net/http`, `chi`, `internal/scan`, `internal/store`
- (already imported in `handlers.go`) `encoding/json`, `net/http`, `strconv`, `chi`, `internal/store`
- (NEW, for the error-mapping test only — `errors` if a test returns an error; allowed stdlib)
- **FORBIDDEN:** `internal/plugin`, `internal/enrich`, `internal/module`, `internal/web` (INV2 — api import allowlist).

## allowed_categories

- `stdlib`

## test_exclusions

- `AdminStatus`/`statusResponse`/`pluginHealthDTO`/`enrichStatsDTO` are DTO/aggregate structs — excluded.
- `adminStatus` IS logic (nil-check + one closure call + error map) → covered by the 3 subtests.

## negative_examples

- DO NOT import `internal/plugin` or `internal/enrich` in `internal/api` (INV2 — the whole point of the closure).
- DO NOT panic on `Deps.Status == nil` (INV-nil-safe — return 503).
- DO NOT compute plugin/enrich health inside the handler (the closure does it in `cmd/mellifera`, Task 13).
- DO NOT use `time.Time` in the DTOs (`CheckedAt` is a string — INV4/INV-time-out).
- DO NOT add `/admin/config` (deferred — out of Phase 1).

## existing_code_snapshot

```go
// internal/api/router.go:21-25 (Deps — gains the Status func-field, mirroring Scan)
type Deps struct {
	AdminToken string
	Store      *store.Store
	Scan       func(ctx context.Context, libraryID int64) (scan.Result, error)
}

// internal/api/handlers.go:174-195 (apiError/errorBody/writeJSON/writeError — reused)
func writeError(w http.ResponseWriter, status int, code, message string, retryable bool) {
	writeJSON(w, status, errorBody{Error: apiError{Code: code, Message: message, Retryable: retryable}})
}

// internal/plugin/manager.go:68-73 (Health — CONSUMED by the Task-13 closure, NOT imported here)
type Health struct {
	State         string
	Message       string
	Restarts      int
	LastCheckedAt time.Time
}

// internal/enrich/queue.go:80-85 (Stats — CONSUMED by the Task-13 closure, NOT imported here)
type Stats struct {
	Pending  int
	InFlight int
	Done     int
	Failed   int
}
```

## contract_test_scope

- **joint (S-admin-status, api side):** `GET /admin/status -> deps.Status -> statusResponse` | assert: nil Status→503 unavailable; ok→200 with plugins+enrich round-trip; closure error→500. Covered by the 3 subtests. (The cmd-side closure wiring + the admin-only role gate are Task 13 + Task 08 respectively.)

## scope_boundary

- MODIFY `internal/api/router.go:21-25` (add `Status` field to `Deps`) + `:41-44` (mount `r.Get("/admin/status", h.adminStatus)`).
- MODIFY `internal/api/handlers.go` (`AdminStatus`, `statusResponse`, `pluginHealthDTO`, `enrichStatsDTO`, `(*app).adminStatus`).
- MODIFY `internal/api/router_test.go` (or new `admin_status_test.go`) — the 3 subtests.

## out_of_scope

- The `Deps.Status` closure BODY in `cmd/mellifera/main.go` (Task 13 — iterates plugin IDs, calls `mgr.Status` + `enrichQueue.Stats`, formats time→RFC3339, returns `AdminStatus`).
- The admin-only route-group classification (Task 08).
- swag annotations on `adminStatus` (Task 09).

## line_budget

55 (flex 1.2)

## acceptance_criteria

- AC-5 (an admin can see system status — the handler + types; closure wiring is Task 13)

## refactoring_checklist

- `grep -n 'Status func(ctx context.Context) (AdminStatus' internal/api/router.go` → 1 hit.
- `grep -n 'func (a \*app) adminStatus\|type AdminStatus\|type pluginHealthDTO\|type enrichStatsDTO\|type statusResponse' internal/api/handlers.go` → 5 hits.
- `grep -rn 'internal/plugin\|internal/enrich' internal/api/*.go` → 0 hits (INV2 holds — CRITICAL gate).
- `grep -n '"time"' internal/api/handlers.go` → 0 hits (CheckedAt is a string; time stays out of the api DTOs).
- `cd mellifera && go test ./internal/api -run admin_status -v` green.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (`AdminStatus`/DTOs are unexported; `Deps` already counted).

## source_anchor

MODIFY `internal/api/router.go:21-25` (`Deps` + field), `:41-44` (mount). MODIFY `internal/api/handlers.go` append near the other DTOs + append `adminStatus` after the other handlers. Contract: `contracts.md §api.Deps` + `§DTOs` + `§adminStatus`.

## skill_hint

`mellifera-build`, `grounding`, `coding-principles`
