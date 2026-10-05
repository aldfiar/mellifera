# DOCS 01 — Module map: `web/` React app + build workflow

- **Type:** docs
- **target:** `docs/ai-architecture.md` (UPDATE §4 Module map)
- **action:** UPDATE
- **source_files:** [`web/` (the React app created in T01-T10), `Makefile` (`web-build`, T11), `internal/web/web.go` (`//go:embed all:dist`)]
- **related_tasks:** [Task 01, Task 11, Task 12]
- **audience:** developer
- **content:**
  - section: §4 Module map — add a `web/` (SPA) entry
    points:
      - "`web/` is the React SPA (Vite + React 18 + TS + react-router + TanStack Query + Tailwind + shadcn/ui), created in Phase 2a. Its npm project root is `web/`; it is dev-only — the Go binary serves the built, hashed assets, not the source."
      - "Build-output seam: `cd web && npm ci && npm run build` (via `make web-build`) emits to `internal/web/dist/` (Vite `outDir: ../internal/web/dist`) — the committed `//go:embed all:dist` input (`internal/web/web.go:20`). `internal/web/dist/` is COMMITTED; `/web/dist/` + `node_modules/` are gitignored."
      - "Boundary: `web/` consumes the Go API over HTTP (`/api/v1/*`, Bearer). It imports NO Go module. The Go side is byte-identical except the regenerated `internal/web/dist/*` bytes (Phase 2a)."
      - "Node is dev-only: `make build`/`check`/`lint`/`test` NEVER invoke node/npm/swag (INV-node-free-gate). `make web-build` is the ONLY node-touching target and is NOT a prerequisite of any gate target."
  - section: §4 Module map — note the api/web relationship
    points:
      - "`internal/api` (7 exported symbols, INV5) is pure-delegation (INV1) and imports no `plugin`/`enrich`/`module`/`web` (INV2). Phase 2a adds ZERO new endpoints — the SPA consumes the existing `/api/v1/libraries`, `/scan`, `/admin/status` routes (AC-7)."
- **verify:**
  - doc updated at `docs/ai-architecture.md` §4 with the `web/` entry + build-workflow note.
  - no broken internal links (`internal/web/web.go:20`, `Makefile`, `web/README.md` references resolve).
  - the note matches T11's corrected cwd (`cd web`, NOT `cd internal/web`) — consistency with the Makefile fix.

## notes

- Keep the entry concise (module map is an authoritative index, not prose). One bullet for `web/` purpose, one for the build-output seam, one for the boundary, one for node-dev-only.
- Do NOT document the SPA internals (component tree, hooks) here — that belongs in `web/README.md` (updated in T11) + a future developer guide. The module map records the BOUNDARY + the build workflow only.
- Cross-reference: `web/README.md` (the dev-workflow contract, updated T11) + `docs/web-ui/operator-runbook.md` (the operator runbook, updated DOCS 02).
