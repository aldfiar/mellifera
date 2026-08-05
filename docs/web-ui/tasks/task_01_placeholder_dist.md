# Task 01 — Foundational: commit Phase-1 placeholder `internal/web/dist` + `web/README.md`

- **Type:** coder (Foundational Setup — owns no AC, owns no seam; required so `//go:embed` compiles + AC-6 cache-header probe is verifiable)
- **Step:** 13 (Outline) / Foundational Setup item 3
- **Seams:** S-placeholder-dist (produces the committed artifact)
- **AC trace:** (enables AC-6; none owned)
- **Project scope:** `.` (root)
- **Deps:** none
- **Estimated LOC:** ~25 (artifacts + README)

## behaviors

- **B1** A minimal valid `internal/web/dist/index.html` exists and is committed so `//go:embed all:dist` (Task 11) compiles pre-Phase-2. | ac: AC-6 | kind: normal
- **B2** A placeholder `internal/web/dist/assets/app.js` exists and is committed so the AC-6 immutable-cache verify probe (`/assets/app.js`) has a real hashed-style asset to hit. | ac: AC-6 | kind: normal
- **B3** `web/README.md` documents the dev workflow contract: Vite :5173 with `vite.config.ts server.proxy` mapping `/api`, `/openapi.*`, `/docs` → `http://127.0.0.1:8080`; the Phase-2 `npm run build` emits `internal/web/dist/`; node is dev-only. | ac: AC-6 | kind: normal

## invariants

- **INV-placeholder-shell-only:** the placeholder `index.html` is a static hand-written shell (title + root div + `<script src="/assets/app.js">`). It contains NO React, NO build step, NO `node` invocation to produce. The real React build replaces it in Phase 2.
- **INV-dist-is-build-input:** `internal/web/dist/` is a committed build INPUT the Go gate consumes via `go:embed`. It is NOT gitignored. (`web/node_modules/` will be gitignored in Phase 2; `web/dist/` is committed.)

## precondition

`feature/web-ui` is at `main` @ `58a1130`. No `web/`, no `internal/web/`, no `dist/`, no `package.json` exists (confirmed: `find . -name web -type d` empty; source_baseline §internal/web). The Go gate is green at HEAD.
- evidence: `docs/web-ui/source_baseline.md §internal/web (CREATE — net-new)`; `docs/web-ui/integration_map.md S-placeholder-dist` (`(none)` Existing column).

## postcondition

`internal/web/dist/index.html` + `internal/web/dist/assets/app.js` exist on disk (committed). `web/README.md` exists at repo root. No `.go` file references them yet (Task 11 adds `//go:embed`). `go build ./...` still green (these are static files, not compiled until embedded).

## test_seed

No unit test (static artifacts). Verification is structural + deferred to Task 11 (the `//go:embed` compiles) + Task 15 (the integration test asserts `/` 200 + `/assets/app.js` immutable cache header). This task's own `verify` is file-existence + `go build ./...` stays green.

## allowed_imports

- (no Go imports — static files + markdown only)

## allowed_categories

- (none — no Go code)

## test_exclusions

- (no Go code to exclude)

## scope_boundary

- CREATE `internal/web/dist/index.html`
- CREATE `internal/web/dist/assets/app.js`
- CREATE `web/README.md` (repo-root `web/` directory)

## out_of_scope

- Any `.go` file (Task 11/12 own `internal/web/*.go`).
- The `//go:embed` directive (Task 11).
- A real Vite/React build (Phase 2).
- `package.json`, `vite.config.ts`, `tsconfig.json` (Phase 2; `web/README.md` only DOCUMENTS the future contract).

## existing_code_snapshot

```
(greenfield — no internal/web/ exists pre-T01. No .go snapshot applies; this task creates static artifacts only.
 Post-T01 filesystem state it must leave behind:
   internal/web/dist/index.html        (placeholder shell: <html>...<script src="/assets/app.js">...)
   internal/web/dist/assets/app.js     (placeholder asset for the AC-6 cache-header probe)
   web/README.md                       (repo-root dev-workflow README)
 Nearest existing anchor: none — first go:embed in the codebase per source_baseline §internal/web.)
```

## line_budget

25 (flex 1.2 — README length varies)

## acceptance_criteria

- (enables AC-6; no AC owned — foundational)

## refactoring_checklist

- `test -f internal/web/dist/index.html && test -f internal/web/dist/assets/app.js && test -f web/README.md` → exit 0.
- `go build ./...` green (static files do not break the build).
- `grep -c 'go:embed' internal/web/dist/index.html` → 0 (the placeholder is plain HTML, not a Go template).

## source_anchor

CREATE (greenfield). Nearest existing anchor: none (first `go:embed` in the codebase per source_baseline §internal/web). Target paths fixed by `implementation_plan.md §File Map (CREATE)` + `contracts.md §internal/web`.

## skill_hint

`mellifera-build`, `grounding`
