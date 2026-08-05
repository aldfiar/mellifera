# Architecture Review — web-ui (Phase 1)

> Risk register + grounding audit + complexity-budget rationale + Generation
> Self-Audit. Self-review of `implementation_plan.md` / `contracts.md` /
> `integration_map.md` against live source on `feature/web-ui`.

## Issues Found

> None blocking (no P0). The plan is at the 15-step and 7-AC caps — the
> **phasing** (Phase 1 scoped, Phases 2-4 outlined) is the proactive remedy;
> `feature_too_large` is NOT set. One P1 surfacing for plan-review (the
> no-visible-UI-in-Phase-1 tradeoff).

### R-1 (P1, plan-review decision) — Phase 1 delivers no visible React UI
- **Context:** Phase 1 is the Go-side foundation (roles + swagger + API ext + embed scaffold). The real React app + panels are Phase 2-4. AC-6 verifies the delivery mechanism with a placeholder `dist/`.
- **Risk:** a user expecting "the UI" in this feature may find a placeholder SPA underwhelming.
- **Mitigation / proposed_split:** documented as a plan-review decision point (implementation_plan §Right-sizing). Alternatives: (a) keep foundation-first (recommended — de-risks go:embed/swag/roles); (b) merge Phase 1+2 (minimal admin add-library page) — pushes steps >15 and ACs to 9+ (gate breach → would force a split anyway); (c) reorder. Surfaced to user; not auto-resolved.
- **Severity rationale:** P1 not P0 — does not block the pipeline; the user decides at plan-review.

### R-2 (P1) — public surface widens (SPA shell + contract no longer behind admin token)
- **Context:** S-compose puts `/`, `/docs`, `/openapi.*` outside `authMiddleware`. Today every route requires the admin token.
- **Risk:** an operator who assumed "all endpoints authenticated" now has a public landing page + public API contract.
- **Mitigation:** the public surface serves **no data** (static SPA shell + the OpenAPI contract; all data stays behind role-gated `/api`). This matches the §11.5 model (the SPA must load before a token is entered; auth = Bearer on `/api`). Documented in `conventions.md` + the operator runbook (Phase 2). The server still binds `127.0.0.1` by default (`main.go:198`).
- **Residual:** acceptable — standard for an embedded SPA.

### R-3 (P2) — SPA↔API contract drift (swagger vs handlers)
- **Context:** swag annotations are comments; if a developer changes a handler DTO without re-running `swag init`, the served spec drifts.
- **Mitigation:** `integration_web_test.go` asserts `/openapi.yaml` names all 6 routes (AC-2 verify probe) — a removed/renamed route fails the test. `make web-build` regenerates. Phase-2 adds DTO-shape assertions.
- **Residual:** low — the route-name probe catches the common drift.

### R-4 (P2) — role escalation via a future client resolver
- **Context:** `RoleClient` is gated but no resolver mints it yet. A buggy Phase-2 client resolver could over-issue admin.
- **Mitigation:** `requireRole(RoleAdmin)` is a positive check (default-deny); a principal with an unknown/empty role is denied admin routes. The test injects a synthetic client principal to prove 403 on admin routes (AC-1). Authorization is at the route group, not "is admin" forks in handlers (arch §11.5).
- **Residual:** low.

### R-5 (P2) — build-gate fragility (committed dist + generated spec)
- **Context:** the Go gate embeds committed `web/dist/` + `internal/web/api/openapi.*`. If these are missing/stale, `go:embed` fails at compile.
- **Mitigation:** Phase-1 commits a valid placeholder `dist/index.html` + a generated `openapi.yaml` (Foundational Setup; steps 13-14). `integration_web_test.go` runs `make build && make check` on the node-less host (AC-7). `make web-build` documents regen.
- **Residual:** low — compile-time failure is loud and immediate.

### R-6 (P2) — `adminMiddleware` rename breaks the one external test reader
- **Context:** `qa_auth_test.go:39` calls `api.New`; `middleware_test.go:55` reads `.Admin`. Renaming the middleware + field could break these.
- **Mitigation:** `api.New` signature is UNCHANGED (`qa_auth_test.go` unaffected). `.Admin` reader updated to `.IsAdmin()` (step 3). `Admin()` deprecated method retained for transition (contracts §Roles model).
- **Residual:** none (verified: only one reader, `middleware_test.go:55`).

## Grounding audit (G1/G2/G5 — every MODIFY target + key symbol verified)

| Claim | Verification |
|---|---|
| `api` exports 3 symbols; INV1-INV5; INV2 import allowlist | `internal/api/doc.go:16-34` ✓ |
| `Deps{AdminToken,Store,Scan}`; `Principal{Admin bool}`; `New(deps)` 3 routes + global admin mw | `internal/api/router.go:21,30,37-45` ✓ |
| `adminMiddleware` sets `Principal{Admin:true}` at `:38` | `internal/api/middleware.go:29-42` ✓ |
| `.Admin` read by exactly one site | grep: `middleware_test.go:55` only (no production reader) ✓ |
| `itemDTO` carries full `Document json.RawMessage` | `internal/api/handlers.go:63-73` ✓ |
| `store.GetItem(ctx,id)` exists, no API caller | `internal/store/items.go:74`; grep callers = scan/enrich/tests only ✓ |
| `store.Library`; `CreateLibrary`; `GetLibrary`; **no** `ListLibraries` | `internal/store/libraries.go:13,24,41`; grep `ListLibraries` empty ✓ |
| `enrich.Stats` + `Queue.Stats()`; `plugin.Health` + `Manager.Status(pluginID)` — zero API/cmd callers | `internal/enrich/queue.go:80,189`; `internal/plugin/manager.go:68`; `internal/plugin/lifecycle.go:102`; grep empty ✓ |
| `api.New` callers = `main.go:127` + `qa_auth_test.go:39` | grep ✓ |
| Sole top-level handler composed in main | `cmd/mellifera/main.go:127,135` ✓ |
| `make build`/`check` node-free; no `web-build` target | `Makefile:14,26`; check.sh ✓ |
| depguard denies reflect+DI only (INV2 is manual) | `.golangci.yml:32-39` ✓ |
| arch §11.5 Principal widening anticipated; §3.1 document tiers | `docs/architecture.md:1599-1614,805-839` ✓ |
| No existing `go:embed` in code; no `web/`/`dist/`/`package.json` | grep `go:embed` + find → empty ✓ |

**No `UNVERIFIED:` tokens.** Every MODIFY target verified to exist now; every new
caller-of-existing-symbol confirmed absent today (so the "first API caller"
claims hold). The two consumed-but-unedited packages (`enrich`, `plugin`) are
reached via a closure, satisfying INV2.

## Complexity-budget rationale (software-design §Complexity Budget)

Is there a meaningfully simpler design meeting every AC and extending an
existing pattern? Considered:

- **Roles:** simpler alternative = keep `Admin bool`, add a separate `client`
  bool. Rejected — two bools is the "boolean trap" anti-pattern (software-design)
  and does not ground D18. The chosen `Role` enum + `requireRole` is one small
  type + one middleware — extends the existing middleware pattern
  (`middleware.go:29`), not a novel abstraction. **Justified.**
- **Swagger:** simpler = hand-write `openapi.yaml`. Rejected by the user-confirmed
  decision (code-generated) and R-3 (drift). swag is the least-friction codegen
  for chi. **Justified.**
- **Admin status:** simpler = import `plugin`/`enrich` directly in api. Rejected
  (violates INV2, the load-bearing api-isolation invariant). The func-field
  closure **mirrors the existing `Deps.Scan`** (`router.go:24`) — an established
  pattern, not new. **Justified.**
- **SPA composition:** simpler = mount SPA inside `api.New`. Rejected —
  `api.New`'s contract is the `/api/v1` edge; a separate `internal/web`
  composer keeps api focused and lets the SPA/swagger be tested independently.
  **Justified.**

No over-engineering: every component extends an existing pattern (middleware,
func-field DI, `go:embed` as documented for plugins) or is forced by an AC.

## Generation Self-Audit

- [x] Every MODIFY file in the File Map appears in ≥1 seam with non-empty `After` + `Contract` + `evidence:` (integration_map S-roles…S-placeholder-dist).
- [x] Every seam has an owner-task placeholder + a joint-test description (Coverage Matrix — specifier fills the task IDs).
- [x] Every Phase-1 step traces to ≥1 AC (Step Outline `(AC-N)` tags); every File Map entry has steps; no orphaned steps.
- [x] Every `## Foundational Setup` item emits a task or an explicit `fold→precondition` (swag CLI install, Swagger UI vendor, placeholder dist, generated openapi, NOTICE).
- [x] **No `UNVERIFIED:` token remains** in the plan (grounding audit above).
- [x] api import allowlist (INV2) preserved — admin status via closure, no plugin/enrich import.
- [x] Symbol budgets within ≤8 (api 4, web ≤3, store method excluded).
- [x] `go.mod`/`go.sum` unchanged; no runtime node/CGO dependency (AC-7).
- [x] Additive claim verifiable: `git diff 58a1130 --stat` over proto/sdk/scan/enrich/plugin/module empty (AC-7 probe).
- [x] Step Outline at 15 (cap) — phasing applied as remedy; not over. AC count 7 (< 8 cap).

**issues_found: 6** (1 P1 plan-review surfacing [R-1, R-2 each P1; R-3..R-6 P2]). No P0. Plan is internally consistent and ready for plan-review.
