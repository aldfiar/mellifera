# Task 11 — internal/web: `Handler` + `Options` + `//go:embed all:dist` + SPA fallback + cache headers + `doc.go`

- **Type:** coder
- **Step:** 9 (Outline)
- **Seams:** S-web-embed
- **AC trace:** AC-6
- **Project scope:** `.` (root; CREATE `internal/web`)
- **Deps:** Task 01 (placeholder `internal/web/dist/*` — `//go:embed` needs committed files to compile)
- **Estimated LOC:** ~90 (M)

## behaviors

- **B1** `web.Handler(apiHandler, opts)` returns an `http.Handler` composing: `/api/*` → `apiHandler`; everything else → the embedded SPA (with client-route fallback). A nil `apiHandler` is valid (tests serve SPA alone — the `/api/*` mount is skipped when nil). | ac: AC-6 | kind: normal
- **B2** `//go:embed all:dist` embeds `internal/web/dist/` (the Task-01 placeholder now; the real React build in Phase 2). | ac: AC-6 | kind: normal
- **B3** `GET /` → `200 text/html` serving the embedded `dist/index.html`. | ac: AC-6 | kind: normal
- **B4** `/assets/*` responses carry `Cache-Control: public, max-age=31536000, immutable` (hashed filenames — Vite emits content-hashed asset names). | ac: AC-6 | kind: normal
- **B5** `index.html` carries `Cache-Control: no-cache` (revalidate on every request). | ac: AC-6 | kind: normal
- **B6** SPA fallback: any path NOT under `/api/`, `/openapi`, or `/docs` AND not a real embedded asset → serves `index.html` with `200` (client-side routing). | ac: AC-6 | kind: normal
- **B7** A real asset miss (e.g. `/assets/nonexistent.js`) → `404` (no fallback — broken hashed URLs fail fast). | ac: AC-6 | kind: edge
- **B8** `Options.DevMode == true` relaxes cache headers (sends `Cache-Control: no-cache` everywhere; disables the immutable asset header) — for running the Go server alongside the Vite dev proxy. | ac: AC-6 | kind: edge
- **B9** `doc.go` states the package contract: ≤3 exported symbols (`Handler`, `Options`, at most one more), the embedding/fallback rule, and the public-vs-authenticated surface invariant. | ac: AC-6, AC-7 | kind: normal

## invariants

- **INV-embeds-placeholder-or-real:** `//go:embed all:dist` is over `internal/web/dist/`. Whether the content is the Task-01 placeholder or the Phase-2 React build is transparent to this package — it serves whatever bytes are embedded. The embed directive REQUIRES at least one file present (Task 01 satisfies this).
- **INV-public-surface:** `/`, `/assets/*` are UNAUTHENTICATED. The api handler (`apiHandler`) carries its OWN `authMiddleware` on `/api/*` (Task 04). `web.Handler` does NOT add auth to the SPA surface. Do not put `/` or `/assets/*` behind any middleware here.
- **INV-no-domain-logic:** `internal/web` routes and serves static bytes ONLY. It does not parse bodies, call the store, or branch on media type. The apiHandler is an opaque `http.Handler`.
- **INV-fallback-rule:** fallback serves `index.html` ONLY for paths outside `/api/`, `/openapi`, `/docs` (Task 12 owns the last two). Real asset misses (`/assets/<missing>`) return 404, NOT fallback — so a broken hashed URL fails fast (conventions §SPA fallback rule).
- **INV-cache-by-extension:** the immutable header is keyed on the `/assets/` prefix (Vite convention); `index.html` is always `no-cache`. `DevMode` overrides both to `no-cache`.
- **INV-symbol-budget:** `internal/web` exports ≤3 (`Handler`, `Options`, + at most one helper). Under the 8-symbol gate (conventions §4).

## precondition

Task 01 landed: `internal/web/dist/index.html` + `internal/web/dist/assets/app.js` exist (committed) so `//go:embed all:dist` compiles. No `internal/web/*.go` exists (greenfield — source_baseline §internal web). The build gate is green.
- evidence: `internal/web/dist/*` (Task 01); `docs/web-ui/source_baseline.md §internal/web (CREATE)`; `docs/web-ui/contracts.md §internal/web`.

## postcondition

`internal/web/doc.go` + `internal/web/web.go` + `internal/web/web_test.go` exist. `web.Handler(apiHandler, Options)` composes `/api/*` + SPA with cache headers + fallback. `go build ./internal/web && go test ./internal/web` green. The package exports ≤3 symbols. (`/openapi.*` + `/docs` are NOT yet routed — they fall through to SPA fallback temporarily; Task 12 inserts the swagger handler ahead of the fallback.)

## test_seed

`web_test.go` table test `TestHandler_SPAAndCache` over: `{GET / → 200 text/html + Cache-Control: no-cache; GET /assets/app.js → 200 + Cache-Control contains immutable; GET /some/client/route → 200 text/html (fallback to index.html); GET /assets/missing.js → 404 (no fallback); nil apiHandler + GET / → 200 (SPA alone)}`. PLUS `TestHandler_DevMode` asserting `Options{DevMode:true}` drops the immutable header on `/assets/*` (Cache-Control: no-cache). Use `httptest.NewRecorder` + a nil apiHandler (the SPA path needs no api). Assert response body contains the placeholder `<script src="/assets/app.js">` for the `/` + fallback cases (proves the embedded index.html is served).

## callers_to_update

- (none yet — Task 13 wires `web.Handler` into `cmd/mellifera/main.go`. Task 12 adds the swagger routes into the mux built here.)

## allowed_imports

- `embed`, `io/fs`, `net/http`, `path`, `strings`, `time` (all stdlib)
- `github.com/go-chi/chi/v5` (IF the mux uses chi for consistency with `internal/api`; ELSE stdlib `http.ServeMux` — pick chi to match the codebase convention)

## allowed_categories

- `stdlib`

## test_exclusions

- `Options` is a config struct — excluded.
- `Handler` is the composition root — covered by the table test (B1-B8).

## negative_examples

- DO NOT add auth middleware to `/` or `/assets/*` (INV-public-surface — the SPA shell loads before any token).
- DO NOT call the store / parse bodies / branch on media type in `internal/web` (INV-no-domain-logic).
- DO NOT fallback on `/assets/<missing>` (INV-fallback-rule — 404, fail fast).
- DO NOT fallback on `/api/`, `/openapi`, `/docs` paths (those are owned by apiHandler / Task 12).
- DO NOT export more than 3 symbols (INV-symbol-budget — `Handler`, `Options`, at most one helper).
- DO NOT add a `time.Time`/`store` import — static serving only.

## existing_code_snapshot

```go
// (greenfield — no internal/web/*.go exists. Nearest pattern: none — first go:embed.)
// Task 01 produced:
//   internal/web/dist/index.html        (placeholder shell: <html>...<script src="/assets/app.js">...)
//   internal/web/dist/assets/app.js     (placeholder asset for the cache-header probe)
```

## contract_test_scope

- **joint (S-web-embed):** `web.Handler -> embedded dist + cache headers + SPA fallback` | assert: `/` 200 + no-cache; `/assets/*` immutable; `/client/route` fallback 200; `/assets/missing` 404; nil apiHandler OK; DevMode relaxes cache. Covered by `TestHandler_SPAAndCache` + `TestHandler_DevMode`.

## scope_boundary

- CREATE `internal/web/doc.go` (package contract + INV).
- CREATE `internal/web/web.go` (`Handler`, `Options`, `//go:embed all:dist`, SPA fallback, cache headers).
- CREATE `internal/web/web_test.go` (the table tests).

## out_of_scope

- The swagger serve handler (`/openapi.*` + `/docs`) — Task 12.
- The `cmd/mellifera` composition — Task 13.
- The real React build (Phase 2 replaces the placeholder dist).
- The `make web-build` target (Task 14).

## line_budget

90 (flex 1.2)

## acceptance_criteria

- AC-6 (SPA served from the Go binary; cache headers; fallback)

## refactoring_checklist

- `grep -n 'go:embed all:dist\|func Handler\|type Options' internal/web/web.go internal/web/doc.go` → ≥3 hits.
- `grep -c 'Cache-Control' internal/web/web.go` → ≥2 (immutable + no-cache).
- `cd mellifera && go build ./internal/web && go test ./internal/web -v` green.
- `grep -c 'func [A-Z]\|type [A-Z]\|var [A-Z]' internal/web/web.go internal/web/doc.go` → ≤3 (symbol budget — `Handler`, `Options`, ≤1 helper).
- Confirm `/assets/<missing>` returns 404 (no fallback) in the test.
- Confirm nil apiHandler + `GET /` returns 200.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (≤3 exported — well under 8).
- Apache-2.0 header on both new `.go` files.

## source_anchor

CREATE `internal/web/doc.go` + `internal/web/web.go` + `internal/web/web_test.go`. Contract: `contracts.md §internal/web` + `integration_map.md S-web-embed`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
