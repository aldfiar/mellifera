# Task 04 — api/middleware: rename `adminMiddleware`→`authMiddleware` (token→`RoleAdmin`) + add `requireRole(roles ...Role)`; update `middleware_test.go`

- **Type:** coder
- **Step:** 3 (Outline)
- **Seams:** S-roles (middleware side)
- **AC trace:** AC-1
- **Project scope:** `.` (root; MODIFY `internal/api`)
- **Deps:** Task 03 (`Role`, `RoleAdmin`, `RoleClient`, `Principal{Role}`)
- **Estimated LOC:** ~45 (S)

## behaviors

- **B1** `authMiddleware(token)` (renamed from `adminMiddleware`) resolves an `Authorization: Bearer <token>` header and on match records `Principal{Role: RoleAdmin}` in the context; on any miss it writes the 401 `unauthenticated` canonical body and does NOT call next (behavior unchanged from `adminMiddleware`). | ac: AC-1 | kind: normal
- **B2** `requireRole(roles ...Role)` returns a chi-style middleware that reads the resolved `Principal` from context; if `p.Role` is NOT in `roles` it writes 403 `forbidden` ("role <r> not permitted") and does NOT call next; otherwise calls next. | ac: AC-1 | kind: normal
- **B3** A principal with an empty/unknown Role (e.g. `Role("")`) is denied by `requireRole(RoleAdmin)` (default-deny — R-4 mitigation). | ac: AC-1 | kind: edge
- **B4** `middleware_test.go` updates `.Admin`→`.IsAdmin()` at `:55` and adds a `TestRequireRole` table: `{RoleAdmin admitted by requireRole(RoleAdmin); RoleClient denied by requireRole(RoleAdmin)→403; RoleAdmin admitted by requireRole(RoleAdmin,RoleClient); RoleClient admitted by requireRole(RoleAdmin,RoleClient); unknown Role denied}`. | ac: AC-1 | kind: normal

## invariants

- **INV-authn-then-authz:** `authMiddleware` runs FIRST (resolves Principal — authN), `requireRole` runs SECOND inside the route group (checks Role — authZ). A request with no/invalid token never reaches `requireRole` (the 401 short-circuits first). Order is fixed by the router (Task 08): `r.Use(authMiddleware(...))` at the router level; `r.Group(r.Use(requireRole(...)))` per route group.
- **INV-default-deny:** `requireRole` is a positive-membership check. An empty/unknown role is denied admin routes (R-4). This is why a buggy future client resolver cannot accidentally escalade.
- **INV-no-handler-fork:** handlers never call `requireRole` and never read `.Role`. The gate is at the route group only (arch §11.5).
- **INV-canonical-error-bodies:** 401 uses `writeError(w, 401, "unauthenticated", "...", false)` (existing); 403 uses `writeError(w, 403, "forbidden", "...", false)` — both reuse `writeError` (`handlers.go:193`).

## precondition

Task 03 landed: `Role`/`RoleAdmin`/`RoleClient`/`Principal{Role}`/`IsAdmin()` defined in `router.go`; `middleware.go:38` already writes `Principal{Role: RoleAdmin}` (lockstep fix in Task 03). `internal/api/middleware.go:29` defines `adminMiddleware` (constant-time Bearer compare + 401-on-miss + `bearerCredentials` helper at `:49`); `principalFromContext` at `:19`. `middleware_test.go:55` is the lone `.Admin` reader.
- evidence: `internal/api/middleware.go:29-42,49-58`; `internal/api/middleware.go:19-22`; `internal/api/middleware_test.go:39,55`.

## postcondition

`middleware.go` defines `authMiddleware(token)` (renamed) + `requireRole(roles ...Role)`. `adminMiddleware` no longer exists (the router reference `router.go:40` is updated in Task 08; this task MAY leave a temporary `adminMiddleware = authMiddleware` alias if needed to keep `router.go:40` compiling — documented in handoff). `middleware_test.go` updated (`.IsAdmin()` + `TestRequireRole`). `go build ./internal/api && go test ./internal/api` green.

## test_seed

The existing `TestAdminMiddleware_TokenMatrix` (`middleware_test.go:17`) stays green after rename (rename the call site `:39` `adminMiddleware`→`authMiddleware`; update `:55` `.Admin`→`.IsAdmin()`; the matrix itself is unchanged — same 4 cases, same 401 short-circuit). ADD `TestRequireRole`: a table (B3 + the 5-row matrix in B4) using a dummy next handler + a request whose context carries a synthetic `Principal{Role: <tc.role>}` (set via `context.WithValue(r.Context(), principalKey{}, Principal{Role: tc.role})`). Assert status (200 admitted / 403 denied) + next-called flag. The client-principal-on-browse vs admin-principal-on-admin route-level matrix is Task 08.

## callers_to_update

- `internal/api/middleware.go:29` — rename `adminMiddleware`→`authMiddleware` (signature/body identical except the Principal literal now `Principal{Role: RoleAdmin}`, already done in Task 03).
- `internal/api/middleware_test.go:39,55` — call-site rename + `.Admin`→`.IsAdmin()`.
- `internal/api/router.go:40` — `r.Use(adminMiddleware(deps.AdminToken))` references the old name. This task SHOULD NOT restructure the route groups (Task 08 owns that), so either: (a) keep a one-line `adminMiddleware = authMiddleware` alias until Task 08, OR (b) update `router.go:40` to `authMiddleware(...)` in lockstep (a one-token rename, no structural change). Pick (b) — it is mechanical and keeps the build green without an alias. Note it in the handoff so Task 08 sees the rename is done.

## allowed_imports

- (already imported in `middleware.go`) `context`, `crypto/subtle`, `net/http`

## allowed_categories

- `stdlib`

## test_exclusions

- `bearerCredentials` is already covered by `TestBearerCredentials` (`middleware_test.go:72`) — do not duplicate.

## negative_examples

- DO NOT fork authz into handlers (the route group is the only gate — INV-no-handler-fork).
- DO NOT mint `RoleClient` in `authMiddleware` (today every valid token is `RoleAdmin`; `RoleClient` is test-only until a Phase-2 resolver).
- DO NOT make `requireRole` a no-op when `roles` is empty (default-DENY on empty — fail closed).
- DO NOT change the 401 path (constant-time compare + canonical body is unchanged — S-roles "auth behavior for a valid admin token is unchanged").

## existing_code_snapshot

```go
// internal/api/middleware.go:29-42 (adminMiddleware — rename to authMiddleware)
func adminMiddleware(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			creds := bearerCredentials(r.Header.Get("Authorization"))
			if creds == "" || subtle.ConstantTimeCompare([]byte(creds), []byte(token)) != 1 {
				writeError(w, http.StatusUnauthorized, "unauthenticated",
					"missing or invalid admin token", false)
				return
			}
			ctx := context.WithValue(r.Context(), principalKey{}, Principal{Admin: true})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// internal/api/middleware.go:19-22 (principalFromContext — unchanged, consumed by requireRole's reader)
func principalFromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}

// internal/api/middleware_test.go:54-57 (the .Admin reader — update to .IsAdmin())
if tc.wantCalled {
	if !hasPrincipal || !principal.Admin {
		t.Fatalf("expected Principal{Admin:true} in context; got %+v (present=%v)", principal, hasPrincipal)
	}

// internal/api/router.go:40 (the sole adminMiddleware call site — rename to authMiddleware)
r.Use(adminMiddleware(deps.AdminToken))
```

## contract_test_scope

- **joint (S-roles, middleware side):** `authMiddleware -> Principal{RoleAdmin}; requireRole -> 200 admit / 403 deny` | assert: valid token→Principal{RoleAdmin}+next called; invalid→401+next NOT called; requireRole(RoleAdmin) admits RoleAdmin, denies RoleClient/unknown (403). Covered by `TestAdminMiddleware_TokenMatrix` (renamed) + `TestRequireRole`.

## scope_boundary

- MODIFY `internal/api/middleware.go` (rename `adminMiddleware`→`authMiddleware`; add `requireRole`).
- MODIFY `internal/api/middleware_test.go` (rename call site `:39`; `.Admin`→`.IsAdmin()` `:55`; add `TestRequireRole`).
- MODIFY `internal/api/router.go:40` (one-token rename `adminMiddleware`→`authMiddleware`; NO structural route change — Task 08 owns the groups).

## out_of_scope

- The route-group restructuring into browse/admin groups (Task 08).
- The new route mounts for `/libraries` GET, `/items/{id}`, `/admin/status` (Tasks 05/06/07 + 08).

## line_budget

45 (flex 1.3 — `requireRole` + the 5-row table)

## acceptance_criteria

- AC-1 (role-gating works — the middleware primitives `authMiddleware` + `requireRole`)

## refactoring_checklist

- `grep -n 'func authMiddleware\|func requireRole' internal/api/middleware.go` → 2 hits.
- `grep -n 'adminMiddleware' internal/api/` → 0 hits (fully renamed, no alias left).
- `grep -n '\.Admin' internal/api/middleware_test.go` → 0 hits (replaced by `.IsAdmin()`).
- `cd mellifera && go test ./internal/api -run 'TestAdminMiddleware_TokenMatrix|TestRequireRole' -v` green (rename keeps the matrix green).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (no new exported symbol — both middleware + helpers are unexported).

## source_anchor

MODIFY `internal/api/middleware.go:29-42` (rename + the Principal literal already fixed in T03), append `requireRole` after `authMiddleware`. MODIFY `internal/api/middleware_test.go:39,54-57` + add `TestRequireRole`. MODIFY `internal/api/router.go:40` (one-token rename). Contract: `contracts.md §Roles model` + `§Refactoring map`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
