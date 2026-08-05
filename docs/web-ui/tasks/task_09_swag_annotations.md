# Task 09 — api: swag annotations on all 6 handlers + general-info block in `doc.go`

- **Type:** coder
- **Step:** 8 (Outline)
- **Seams:** S-swag (annotation side)
- **AC trace:** AC-2, AC-7
- **Project scope:** `.` (root; MODIFY `internal/api`)
- **Deps:** Task 05 (listLibraries), Task 06 (getItem), Task 07 (adminStatus) — annotations reference the final handler signatures + DTOs
- **Estimated LOC:** ~70 (comments only; zero logic)

## behaviors

- **B1** A swag general-info block is added to `internal/api/doc.go` (comment-only): `@title Mellifera API`, `@version 1.0`, `@BasePath /api/v1`, `@license.name Apache-2.0`, `@host` (localhost:8080 dev note). | ac: AC-2 | kind: normal
- **B2** Each of the 6 handlers gets a swag annotation comment block directly above the `func`: `@Summary`, `@Tags` (`libraries`/`items`/`admin`), `@ID`, `@Router <path> [METHOD]`, `@Param`, `@Success`, `@Failure`. | ac: AC-2 | kind: normal
- **B3** The annotations are COMMENT-ONLY — no handler body, signature, or import changes (INV1 preserved; `funlen`/`gocognit` unchanged). | ac: AC-2, AC-7 | kind: normal
- **B4** The annotation set is COMPLETE: `swag init` (Task 10) emits a spec naming all 6 routes (`POST /libraries`, `GET /libraries`, `GET /items`, `GET /items/{id}`, `POST /libraries/{id}/scan`, `GET /admin/status`) — verifiable by the AC-2 verify probe (`grep -cE '(/libraries|/items|/admin/status)' openapi.yaml ≥ 6`). | ac: AC-2 | kind: normal

## invariants

- **INV-comments-only:** swag annotations are Go comments (`// @Tag ...`). They add ZERO executable statements. The parse→call→write body of every handler is untouched (INV1). `go build`/`golangci-lint` output unchanged.
- **INV-no-new-deps:** `swag`/`swagfmt` are CLI tools (like `protoc`). NO `go.mod` change. The annotations are not a generated package import; the generated `openapi.*` (Task 10) is embedded bytes.
- **INV-spec-output-dir:** the generated spec lives at `internal/web/api/` (set by Task 10's `swag init -o`), NOT the repo-root `docs/` (which holds design docs). This task only WRITES annotations; it does not run `swag init`.

## precondition

Tasks 05-07 landed: all 6 handlers exist with final signatures + DTOs. `internal/api/doc.go` is the package doc. `swaggo/swag` annotation syntax is the standard `@Router/@Summary/@Param/@Success/@Failure` format. `go.mod` has NO swag entry (and none is added — CLI tool).
- evidence: `internal/api/handlers.go:77,97,120` (existing handlers) + the 3 new handlers from T05/T06/T07; `internal/api/doc.go:1-36`; `docs/web-ui/contracts.md §Consumed from external dev tools`.

## postcondition

`doc.go` has the general-info block. Each of the 6 handlers has a complete annotation block. `go build ./internal/api && golangci-lint run ./internal/api` green (comments don't affect either). `go.mod`/`go.sum` UNCHANGED. The annotations are ready for `swag init` (Task 10).

## test_seed

No unit test (annotations are comments). Verification is deferred to: (a) Task 10 runs `swag init -g cmd/mellifera/main.go -o internal/web/api` and the generated `openapi.yaml` lists all 6 routes (the AC-2 verify probe); (b) Task 15 integration test asserts `/openapi.yaml` contains all 6 route paths. This task's own `verify` is `go build` + `golangci-lint` green + a grep that each handler has an `@Router` line.

## callers_to_update

- (none — annotations are comments; no caller changes.)

## allowed_imports

- (no new imports — annotations are comments)

## allowed_categories

- (none — no Go code)

## test_exclusions

- (annotations are non-code comments — nothing to exclude.)

## negative_examples

- DO NOT hand-write `internal/web/api/openapi.yaml` (it drifts — regenerate via `swag init` in Task 10; conventions §Anti-patterns).
- DO NOT change any handler body or signature (INV-comments-only — the parse→call→write is untouched).
- DO NOT add `swaggo/swag` to `go.mod` (CLI tool, like `protoc` — INV-no-new-deps).
- DO NOT emit the spec to repo-root `docs/` (INV-spec-output-dir — Task 10 sets `-o internal/web/api`).
- DO NOT annotate the middleware or helpers — only the 6 HTTP handlers.

## existing_code_snapshot

```go
// internal/api/doc.go:4-8 (package doc — the general-info block goes ABOVE/INSIDE this, comment-only)
// Package api is Mellifera's HTTP edge: a chi router whose every handler does
// exactly three things — parse the request, call ONE domain function, write the
// response. There is no branching and no orchestration here (ai-architecture §3
// hard rule; mellifera-build skill). When a behavior needs logic, it belongs in a
// domain package (scan, store, module); api/ only routes to it.

// internal/api/handlers.go:75-77 (createLibrary — annotation block goes ABOVE the func comment)
// createLibrary: parse createLibraryRequest → store.CreateLibrary → write
// libraryResponse. One domain call.
func (a *app) createLibrary(w http.ResponseWriter, r *http.Request) {

// internal/api/handlers.go:96-97 (scanLibrary), :116-120 (listItems), + T05/T06/T07 new handlers — each gains an annotation block.
```

## contract_test_scope

- **joint (S-swag, annotation side):** `swag annotations -> openapi.yaml (via Task 10 swag init)` | assert: every handler has `@Router`; the generated spec names all 6 routes. The annotation→spec link is realized by Task 10 (`swag init`); the route-name probe runs in Task 15. This task's grep (each handler has `@Router`) is the local proxy.

## scope_boundary

- MODIFY `internal/api/doc.go` (add the general-info comment block).
- MODIFY `internal/api/handlers.go` (add annotation comment blocks above each of the 6 handler funcs; NO body changes).

## out_of_scope

- Running `swag init` / generating `openapi.*` (Task 10).
- Embedding/serving the spec (Task 12).
- Any handler body change.

## line_budget

70 (flex 1.3 — annotation verbosity varies)

## acceptance_criteria

- AC-2 (Swagger is code-generated from annotations — the annotation source)
- AC-7 (handlers stay pure-delegation; swag is a dev-only CLI tool, no go.mod change)

## refactoring_checklist

- `grep -c '@Router' internal/api/handlers.go` → ≥6 (one per handler).
- `grep -c '@title Mellifera\|@BasePath /api/v1' internal/api/doc.go` → ≥2 (general-info block).
- `git diff --stat go.mod go.sum` → EMPTY (INV-no-new-deps).
- `cd mellifera && go build ./internal/api && golangci-lint run ./internal/api` green (comments don't break either).
- Confirm NO handler body changed: `git diff internal/api/handlers.go` shows ONLY added comment lines above each func, no statement changes (INV-comments-only).

## source_anchor

MODIFY `internal/api/doc.go:4-8` (general-info block added as comments) + `internal/api/handlers.go` above each of the 6 funcs (`:77,97,120` + the 3 new). Contract: `contracts.md §Consumed from external dev tools` + `integration_map.md S-swag`.

## skill_hint

`mellifera-build`, `grounding`
