# Task 08 — api/router: regroup routes into `requireRole` groups (browse: admin+client; admin: admin-only)

- **Type:** coder
- **Step:** 5 (Outline) — executes AFTER steps 2,3,4,6,7 per the outline's `->` deps
- **Seams:** S-routing, S-roles (router side)
- **AC trace:** AC-1, AC-3, AC-4, AC-5
- **Project scope:** `.` (root; MODIFY `internal/api`)
- **Deps:** Task 03 (Role/RoleAdmin/RoleClient), Task 04 (authMiddleware + requireRole), Task 05 (`r.Get("/libraries")` mounted), Task 06 (`r.Get("/items/{id}")` mounted), Task 07 (`r.Get("/admin/status")` mounted + Deps.Status)
- **Estimated LOC:** ~25 (XS) + ~50 test (S)

## behaviors

- **B1** The single `r.Use(authMiddleware(deps.AdminToken))` (Task 04 renamed it) stays at the router level — EVERY `/api/v1/*` route still requires a valid admin token (authN unchanged). | ac: AC-1 | kind: normal
- **B2** Inside `r.Route("/api/v1", ...)`, routes are split into TWO `r.Group(...)` blocks: a **browse** group with `r.Use(requireRole(RoleAdmin, RoleClient))` and an **admin** group with `r.Use(requireRole(RoleAdmin))`. | ac: AC-1 | kind: normal
- **B3** Browse group mounts: `GET /libraries` (listLibraries), `GET /items` (listItems), `GET /items/{id}` (getItem). Admin+client both admitted. | ac: AC-1, AC-3, AC-4 | kind: normal
- **B4** Admin group mounts: `POST /libraries` (createLibrary), `POST /libraries/{id}/scan` (scanLibrary), `GET /admin/status` (adminStatus). Admin-only. | ac: AC-1, AC-5 | kind: normal
- **B5** A synthetic `client`-role principal injected into the context reaches browse routes (200) and is denied admin routes (403 `forbidden`) — proven by a test that injects `Principal{Role: RoleClient}` and hits both groups. | ac: AC-1 | kind: edge
- **B6** Existing 3 routes keep method+path+DTO+auth intact (only the gate widens for browse — S-routing "Existing 3 routes keep method+path+DTO; only the gate widens for browse"). | ac: AC-1, AC-7 | kind: normal

## invariants

- **INV-authn-precedes-authz:** `authMiddleware` (router-level `r.Use`) resolves the Principal on EVERY `/api/v1/*` request BEFORE any `requireRole` group middleware runs. A bad token → 401 (never reaches `requireRole`). A good token + wrong role → 403.
- **INV-default-deny-admin:** the admin group is `requireRole(RoleAdmin)` — a 1-element allowlist. An unknown/empty role is denied (R-4). Adding a future admin-tier role = adding it to the `requireRole(...)` arg list, NOT handler logic.
- **INV-public-surface-stays-public:** this task touches ONLY `/api/v1/*`. The SPA/swagger routes (Task 12/13) sit OUTSIDE this router and are intentionally unauthenticated — do NOT wrap them in `authMiddleware`.
- **INV-no-handler-change:** no handler body changes. The regrouping is purely route-table + middleware composition.

## precondition

Tasks 03-07 landed: `authMiddleware`+`requireRole` exist (`middleware.go`); `Role`/`RoleAdmin`/`RoleClient` exist (`router.go`); all 6 routes are mounted in the flat `r.Route("/api/v1", ...)` block (`router.go:41-44` + the 3 new mounts from T05/T06/T07). `router.go:40` is `r.Use(authMiddleware(deps.AdminToken))` (Task 04 renamed it).
- evidence: `internal/api/router.go:37-47` (current `New` after T04-T07); `internal/api/middleware.go` (`requireRole` after T04); `docs/web-ui/integration_map.md S-routing` (Before/After).

## postcondition

`router.go` `New` builds: `r.Use(authMiddleware(...))` + `r.Route("/api/v1", browse-group{requireRole(Admin,Client): GET /libraries, GET /items, GET /items/{id}} + admin-group{requireRole(Admin): POST /libraries, POST /libraries/{id}/scan, GET /admin/status})`. `go build ./internal/api && go test ./internal/api` green. The role-gating matrix test (B5) passes.

## test_seed

`TestNew_RoleGating` (new test in `router_test.go` or `roles_test.go`): a table of `{role Principal, method+path, wantStatus}` covering: admin-token → all 6 routes 200/2xx; synthetic `Principal{Role:RoleClient}` → browse routes 200, admin routes 403. Inject the client principal by wrapping `api.New(...)` in a test-only middleware that OVERWRITES the context Principal (e.g. `func(next) http.Handler { return http.HandlerFunc(func(w,r){ ctx := context.WithValue(r.Context(), principalKey{}, Principal{Role:RoleClient}); next.ServeHTTP(w, r.WithContext(ctx)) }) }`) — this is the "test-only synthetic principal" of AC-1 (no resolver mints `RoleClient` yet). Assert the canonical 403 body (`Error.Code=="forbidden"`) on admin routes.

## callers_to_update

- `internal/api/router.go:37-47` — restructure the `r.Route("/api/v1", ...)` body into the two groups. The `r.Use(authMiddleware(...))` at `:40` stays.

## allowed_imports

- (already imported in `router.go`) `context`, `net/http`, `chi`, `internal/scan`, `internal/store`
- (test file may add `context` for the synthetic-principal injection — stdlib)

## allowed_categories

- `stdlib`

## test_exclusions

- (the route-table composition is structural — covered by the gating matrix; no unit-excluded category.)

## negative_examples

- DO NOT fork authz into handlers (the group is the only gate — INV-no-handler-fork, arch §11.5).
- DO NOT remove `authMiddleware` from the router level (every `/api/v1/*` route still requires a valid token — INV-authn-precedes-authz).
- DO NOT put the SPA or swagger routes inside `authMiddleware` (INV-public-surface — those are mounted in `web.Handler`, Task 11/12, outside this router).
- DO NOT widen the admin group to `requireRole(RoleAdmin, RoleClient)` (admin-only is the point — B4).
- DO NOT change any handler body (INV-no-handler-change).

## existing_code_snapshot

```go
// internal/api/router.go:37-47 (New — AFTER T04 rename + T05/T06/T07 mounts; this task regroups)
func New(deps Deps) http.Handler {
	h := &app{deps: deps}
	r := chi.NewRouter()
	r.Use(authMiddleware(deps.AdminToken))
	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/libraries", h.createLibrary)
		r.Post("/libraries/{id}/scan", h.scanLibrary)
		r.Get("/items", h.listItems)
		r.Get("/libraries", h.listLibraries)      // T05
		r.Get("/items/{id}", h.getItem)           // T06
		r.Get("/admin/status", h.adminStatus)     // T07
	})
	return r
}
```

## contract_test_scope

- **joint (S-routing + S-roles router side):** `router groups -> requireRole browse(admin+client) / admin(admin)` | assert: admin token → all 6 routes succeed; synthetic client principal → browse 200, admin 403 forbidden; existing 3 routes keep method+path+DTO. Covered by `TestNew_RoleGating`.

## scope_boundary

- MODIFY `internal/api/router.go:37-47` (regroup the route block into two `r.Group` + `requireRole`).
- MODIFY/ADD `internal/api/router_test.go` (or new `roles_test.go`) — `TestNew_RoleGating`.

## out_of_scope

- The handler implementations (Tasks 05/06/07).
- The middleware primitives `authMiddleware`/`requireRole` (Task 04).
- The SPA/swagger composition (Tasks 11/12/13 — those sit outside `/api/v1`).
- swag annotations (Task 09 — comments only, no structural change here).

## line_budget

25 (flex 1.3) + 50 test

## acceptance_criteria

- AC-1 (role-gating works — the route-group wiring is the gate)
- AC-3, AC-4, AC-5 (the new routes are reachable under the correct gate)

## refactoring_checklist

- `grep -nE 'r\.Group|requireRole' internal/api/router.go` → ≥4 hits (2 groups + 2 requireRole calls).
- `grep -nE 'r\.Get\("/libraries"|r\.Get\("//items"|r\.Get\("/items/\{id\}"' internal/api/router.go` → in the browse group.
- `grep -nE 'r\.Post\("/libraries"|r\.Post\("/libraries/\{id\}/scan"|r\.Get\("/admin/status"' internal/api/router.go` → in the admin group.
- `cd mellifera && go test ./internal/api -run TestNew_RoleGating -v` green (admin OK both groups; client 200 browse / 403 admin).
- Confirm `r.Use(authMiddleware(...))` is STILL present at the router level (INV-authn-precedes-authz).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (no new exported symbol).

## source_anchor

MODIFY `internal/api/router.go:37-47` (the `New` body — regroup into two `r.Group`+`requireRole`). Contract: `contracts.md §New endpoints` (the role column) + `integration_map.md S-routing`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
