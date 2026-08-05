# DOCS 01 — Sync module map (`docs/ai-architecture.md §4`) for internal/web + api roles + new endpoints

- **Type:** docs
- **audience:** developer (technical internals — module map + symbol budget)
- **AC trace:** AC-7 (additive; symbol budgets); supports the "keep module map in sync" invariant (`ai-architecture.md §4` header: "authoritative — keep in sync with the skill")
- **related_tasks:** T03 (Role/Principal; api 3→4 symbols), T05/T06/T07 (3 new GET handlers + DTOs), T11/T12 (`internal/web` net-new), T02 (store.ListLibraries — store method, excluded from count but the row's "Consumes" notes the new caller)
- **Deps:** none (docs; references the implemented source post-coder)

## what changes

Update `docs/ai-architecture.md §4 Module map`:

1. **`internal/api` row** — update the description + symbol list:
   - description: add "**[web-ui]** role-aware auth (`Principal{Role}`, `authMiddleware`+`requireRole`) + 3 additive GETs (`/libraries`, `/items/{id}`, `/admin/status` via a `Deps.Status` closure — INV2 preserved). swag annotations on all 6 handlers (comment-only; INV1 preserved)."
   - symbols: `New`, `Deps`, `Principal`, **`Role`** — **4** (was 3). Note `IsAdmin()`/`Admin()` are methods (excluded from the check.sh count).
   - consumes: `scan, store` (UNCHANGED — INV2: still no plugin/enrich import).

2. **NEW `internal/web` row** (insert after `internal/api`):
   - description: "embedding + composition layer — **[web-ui]** `Handler(apiHandler, Options)` composes `/api/*` (chi router) + `/openapi.{yaml,json}` + `/docs/` (embedded Swagger UI + code-generated spec) + `/` (embedded SPA via `//go:embed all:dist`) with immutable `/assets/*` cache, `no-cache` index, SPA client-route fallback. First real `go:embed` in the codebase. Public surface (`/`, `/assets/*`, `/openapi.*`, `/docs`) is intentionally unauthenticated; `/api/v1/*` carries its own role-gating."
   - symbols: `Handler`, `Options` — **2** (target ≤3).
   - consumes: `api` (the composed handler), stdlib `embed`/`io/fs`/`net/http`. Does NOT import plugin/enrich/module/scan/store (no domain logic).

3. **`cmd/mellifera` row** (if present; else add a one-line note) — update: "**[web-ui]** composes `web.Handler(api.New(deps), opts)` as the sole top-level handler; builds the `Deps.Status` closure over `mgr.Status`+`enrichQueue.Stats` (the anti-corruption seam keeping api free of plugin/enrich imports — INV2). Reads `MELLIFERA_WEB_DEV`."

4. **Header note** — append to the §4 header a one-line `[web-ui]` marker so the phase attribution is visible (mirrors the `[A]`/`[B1]`/`[B2]` convention already in use).

## context

- **feature_goal:** web-ui Phase 1 = Go-side foundation (roles + swagger + 3 API extensions + embed scaffold). The module map is the canonical "where does a change land" index (`§6` locality guarantee); it MUST reflect `internal/web` + the api roles widening so the next contributor routes work correctly.
- **data_flow:** `cmd/mellifera` → `web.Handler` → {`/api/*`→`api.New`(role-gated) | `/openapi.*`,`/docs`→embedded swagger | `/`→embedded SPA}. The api row stays pure-delegation; the web row owns only static serving + composition.
- **rationale:** the module-map header explicitly says "authoritative — keep in sync with the skill." A net-new package (`internal/web`) + a symbol-count change (`api` 3→4) are exactly the events that trigger a sync. Drift here misroutes the next bug/feature to the wrong package.

## scope_boundary

- MODIFY `docs/ai-architecture.md` (§4 Module map: the `internal/api` row; INSERT the `internal/web` row; UPDATE the `cmd/mellifera` row/note; append the `[web-ui]` marker to the §4 header).
- (Optionally) `docs/architecture.md` §11.5/§1.2 IF they enumerate modules — verify and patch the same facts. Do NOT rewrite prose; sync the table rows only.

## out_of_scope

- The operator runbook (DOCS2).
- The React/TS module map (Phase 2 — `web/` is not yet a Go module).
- A new `docs/web-ui/*.md` design doc (the plan + contracts already live there).

## verify

- `grep -c 'internal/web' docs/ai-architecture.md` ≥ 1 (the new row present).
- `grep -n 'New.*Deps.*Principal.*Role' docs/ai-architecture.md` ≥ 1 (the api symbol list updated to 4).
- `grep -n '\[web-ui\]' docs/ai-architecture.md` ≥ 1 (the phase marker).
- The §4 table still parses (markdown table format intact; column count consistent).

## source_anchor

MODIFY `docs/ai-architecture.md:82-86` (the module-map rows — api row + insert web row). Source of truth for the facts: the implemented `internal/api/router.go` (4 symbols) + `internal/web/web.go` (2 symbols) post-coder.

## refactoring_docs

- `internal/api` symbol count: 3 → 4 (docs say 3 today; `Role` added — `ai-architecture.md:85`).
- `internal/web`: net-new (no prior row to rename — INSERT).
- No symbol renames in this phase that would break doc cross-references (`Principal.Admin` field → `Principal.Role` is documented in the row update; the deprecated `Admin()` method is noted).

## acceptance_criteria

- AC-7 (additive; module map in sync with the new package + symbol count)

## line_budget

30 (flex 1.3 — table-row verbosity)

## skill_hint

`mellifera-build`, `grounding`
