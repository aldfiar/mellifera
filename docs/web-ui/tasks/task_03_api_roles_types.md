# Task 03 — api: `Role` type + `Principal{Role}` + `IsAdmin()`/`Admin()`; doc.go INV/symbol-count update

- **Type:** coder
- **Step:** 2 (Outline)
- **Seams:** S-roles (types side)
- **AC trace:** AC-1, AC-7
- **Project scope:** `.` (root; MODIFY `internal/api`)
- **Deps:** none
- **Estimated LOC:** ~25 (XS)

## behaviors

- **B1** `type Role string` is defined with constants `RoleAdmin Role = "admin"` and `RoleClient Role = "client"` (lower-snake to match existing status literals). | ac: AC-1 | kind: normal
- **B2** `Principal` widens from `{Admin bool}` to `{Role Role}` (arch §11.5 anticipated widening, arrived early). | ac: AC-1, AC-7 | kind: normal
- **B3** `Principal.IsAdmin() bool` returns `p.Role == RoleAdmin` — the new-canonical reader. | ac: AC-1 | kind: normal
- **B4** `Principal.Admin() bool` is retained as a `// Deprecated:` computed convenience mirroring `IsAdmin()` so the lone existing reader can transition. | ac: AC-1 | kind: normal
- **B5** `doc.go` symbol count updates 3→4 (adds `Role`), the INV3 note widens to mention `Role`, and the roles doc paragraph records that `RoleClient` is gated-but-not-minted-yet. | ac: AC-7 | kind: normal

## invariants

- **INV-role-is-type:** `Role` is a typed string (NOT a bool). arch §11.5: "No handler logic forks on is admin." Handlers never read `.Role` to branch; the route group (Task 08) is the only authz point. New roles add a `Role` constant + a `requireRole(...)` member (Task 04), not a handler fork.
- **INV-additive-renaming:** the struct field rename `Admin bool` → `Role Role` is the ONLY break. The writer (`middleware.go:38`, Task 04) and the one reader (`middleware_test.go:55`, Task 04) both move in this feature. `Admin()` is retained as a deprecated method so any external reader degrades gracefully.
- **INV4-unchanged:** no `store.Item`/`store.Library` over the wire (this task touches neither DTOs).

## precondition

`internal/api/router.go:30` defines `Principal{Admin bool}`. `internal/api/doc.go:16-34` documents 3 symbols (`Deps`,`Principal`,`New`) + INV1-INV5. `.Admin` is read by exactly one site (`middleware_test.go:55`) and written by `middleware.go:38` (source_baseline §Principal evolution; architecture_review R-6).
- evidence: `internal/api/router.go:30` (`type Principal struct { Admin bool }`); `internal/api/doc.go:16,22-34`; grep `.Admin` = `middleware_test.go:55` + `middleware.go:38` only.

## postcondition

`router.go` defines `Role`, `RoleAdmin`, `RoleClient`, `Principal{Role Role}`, `IsAdmin()`, `Admin()`. `doc.go` reads "4 symbols" + the widened INV3/roles note. The package does NOT compile end-to-end yet (the writer at `middleware.go:38` still sets `Principal{Admin:true}` — Task 04 fixes it); this task's `verify` is `go build ./internal/api` expecting the middleware-site error OR a transient local build — the coder MAY temporarily update `middleware.go:38`'s literal to `Principal{Role: RoleAdmin}` to keep `go build` green IF the one-liner is mechanical, but the full `authMiddleware`+`requireRole` work is Task 04. (See handoff note.)

## test_seed

A focused unit test `TestPrincipal_IsAdmin` (in `router_test.go` or a new `roles_test.go`): table over `{RoleAdmin→IsAdmin()==true, Admin()==true; RoleClient→IsAdmin()==false, Admin()==false; Role("")->IsAdmin()==false}`. Asserts B1-B4. (The middleware gating matrix is Task 04; the route-group matrix is Task 08.)

## callers_to_update

- `internal/api/middleware.go:38` — the writer sets `Principal{Admin: true}`; it MUST move to `Principal{Role: RoleAdmin}` for the package to compile. This is a one-liner that belongs to Task 04's rename, BUT because this task renames the field, the coder MUST update `:38` in lockstep (set `Principal{Role: RoleAdmin}`) to keep the build green. Note this in the task handoff so Task 04 does not re-do it.
- `internal/api/middleware_test.go:55` — `!principal.Admin` → `!principal.IsAdmin()` (Task 04 owns the full middleware_test update, but the field-rename break is acknowledged here).

## allowed_imports

- (already imported in `router.go`) `context`, `net/http`, `github.com/go-chi/chi/v5`, `internal/scan`, `internal/store`

## allowed_categories

- `stdlib`

## test_exclusions

- `Role` constants + `Principal` struct are data/type declarations — excluded.
- `IsAdmin()`/`Admin()` are trivial predicate accessors — exclude UNLESS added as a 4-row table (recommended, cheap).

## negative_examples

- DO NOT keep a separate `Admin bool` field alongside `Role` (the boolean-trap anti-pattern; arch §11.5).
- DO NOT fork handler logic on `p.Role` (authz lives in the route group via `requireRole`, Task 04/08).
- DO NOT delete the `Admin()` method yet (deprecated-retain for transition — contracts §Roles model).
- DO NOT mint `RoleClient` anywhere in a resolver (gated but unminted until Phase 2; test-only injection).

## existing_code_snapshot

```go
// internal/api/router.go:27-32
// Principal is the authenticated caller the middleware resolves from a valid
// admin token. For MVP Admin is always true; Phase 2 widens it with user_id,
// roles, and library ACLs behind the same middleware (architecture §11.5).
type Principal struct {
	Admin bool
}

// internal/api/doc.go:16-20 (symbol-count + listing)
// # Public API (3 symbols — under the 8-symbol target)
//
//   - Deps: the collaborators + admin token New wires into the router.
//   - Principal: the authenticated caller resolved by the middleware.
//   - New: builds the chi router with the admin middleware + 3 routes.

// internal/api/doc.go:29-30 (INV3)
//   - INV3: Principal is a TYPE (not a bool gate). Handlers read it via the
//     unexported context helper; Phase 2 enriches it without a signature change.
```

## contract_test_scope

- **joint (S-roles, types side):** `Principal{Role} + IsAdmin()` | assert: RoleAdmin→IsAdmin true; RoleClient/unknown→false; Admin() mirrors IsAdmin for transition. Covered by `TestPrincipal_IsAdmin`.

## scope_boundary

- MODIFY `internal/api/router.go` (`Role` type + constants; `Principal{Role}`; `IsAdmin()`/`Admin()` methods).
- MODIFY `internal/api/doc.go` (symbol count 3→4; INV3 widen; roles paragraph).
- MODIFY `internal/api/middleware.go:38` ONLY the one-liner `Principal{Admin:true}`→`Principal{Role:RoleAdmin}` (lockstep field-rename fix; full `authMiddleware`/`requireRole` is Task 04).

## out_of_scope

- `authMiddleware` rename + `requireRole` middleware (Task 04).
- The `middleware_test.go:55` `.Admin`→`.IsAdmin()` update (Task 04).
- Route-group gating (Task 08).

## line_budget

25 (flex 1.2)

## acceptance_criteria

- AC-1 (roles abstraction: `Principal{Role}` + `IsAdmin()` — the type foundation)
- AC-7 (api ≤8 exported symbols; after Phase 1 = 4: `Deps`,`Principal`,`New`,`Role`)

## refactoring_checklist

- `grep -nE 'type Role string|RoleAdmin|RoleClient|func \(p Principal\) IsAdmin' internal/api/router.go` → ≥4 hits.
- `grep -n 'Principal{Admin' internal/api/` → 0 hits (field renamed out).
- `grep -n '4 symbols' internal/api/doc.go` → 1 hit (symbol-count doc updated).
- `grep -c 'func [A-Z]' internal/api/*.go` (approx exported count) ≤ 8.
- `./.claude/skills/mellifera-build/scripts/check.sh` → `Role` counts as 1 exported type (4 total — under 8).

## source_anchor

MODIFY `internal/api/router.go:27-32` (Principal — widen to `{Role}` + methods; add `Role` type + constants above it). MODIFY `internal/api/doc.go:16-20,29-30` (symbol count + INV3). MODIFY `internal/api/middleware.go:38` (lockstep writer fix only). Contract: `contracts.md §Roles model`.

## skill_hint

`mellifera-build`, `grounding`, `coding-principles`
