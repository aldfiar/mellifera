# DOCS 02 — Operator runbook: npm dev workflow + corrected `make web-build`

- **Type:** docs
- **target:** `docs/web-ui/operator-runbook.md` (UPDATE §2 + §5 + §6 + §7)
- **action:** UPDATE
- **source_files:** [`Makefile` (`web-build`, T11), `web/README.md` (T11), `internal/web/web.go` (embed, unchanged)]
- **related_tasks:** [Task 11, Task 12, Task 01]
- **audience:** operator
- **content:**
  - section: §2 The dev-time regen — `make web-build` (CORRECT the Phase-1 placeholder)
    points:
      - "UPDATE: `make web-build` is now `swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml` + `cd web && npm ci && npm run build`. The Phase-1 placeholder (line 50: `# Phase 2 (commented): cd internal/web && npm ci && npm run build`) is replaced — the cwd is `web/` (npm project root), NOT `internal/web` (R1)."
      - "The build emits to `internal/web/dist/` (Vite `outDir: ../internal/web/dist`), which is COMMITTED (the `//go:embed` input). `/web/dist/` is gitignored and unused."
      - "`make web-build` remains the ONLY node-touching target and is NOT a prerequisite of `build`/`check`/`lint`/`test` (the node-free gate invariant holds)."
  - section: §5 Environment knobs / Dev-only deps (UPDATE the Phase-2 line)
    points:
      - "UPDATE §5 'Dev-only deps': `node`/`npm` are now REQUIRED for `make web-build` (Phase 2a landed); they remain NEVER required by the Go gate. The committed `internal/web/dist/` ships the built SPA — operators serving a release binary do NOT need node."
  - section: §6 Dev workflow (Phase-2 LANDED)
    points:
      - "UPDATE §6 to the real workflow: (a) Run the Go server: `MELLIFERA_ADMIN_TOKEN=dev-token go run ./cmd/mellifera` (:8080). (b) Run the Vite dev server: `cd web && npm install && npm run dev` (:5173). (c) The Vite dev proxy forwards `/api`, `/openapi.yaml`, `/openapi.json`, `/docs` → `http://127.0.0.1:8080` (same-origin; no CORS). Set `MELLIFERA_WEB_DEV=true` so Go cache headers don't mask Vite hot-reload."
      - "Production path: `make web-build` (regenerate the dist) → commit `internal/web/dist/*` → `make build` embeds it. Single binary, node-free at runtime."
      - "Auth in dev: the SPA stores the entered admin token in localStorage (`mellifera.token`); the same `MELLIFERA_ADMIN_TOKEN` value is the Bearer credential the Go `authMiddleware` expects."
  - section: §7 Verification probes (UPDATE — the placeholder check is replaced)
    points:
      - "UPDATE the §7 SPA probe: `curl -s localhost:8080/ | grep -cE 'assets/.*\\.(js|css)'` → ≥1 (a hashed asset reference — the real Vite build, NOT the placeholder's `/assets/app.js`). The Phase-1 placeholder assertion is obsolete."
      - "ADD: `curl -s -o /dev/null -w '%{http_code}' localhost:8080/admin` → `200` (SPA client-side route via the NotFound fallback)."
- **verify:**
  - §2 shows the corrected `cd web && npm ci && npm run build` (no `cd internal/web`); the placeholder comment is gone.
  - §5 reflects node/npm required for `make web-build` only.
  - §6 documents the two-process dev workflow (Go :8080 + Vite :5173 with the proxy) + the production single-binary path.
  - §7 SPA probe checks for hashed assets (not `assets/app.js`) + the `/admin` SPA fallback.

## notes

- This is the Phase-1 operator runbook being brought current with Phase 2a. Do NOT rewrite sections that are unchanged (§1 headline, §3 public/auth surface, §4 roles) — only §2/§5/§6/§7 have Phase-2a deltas.
- Keep the operator voice: deployment/config, not internals. The dev workflow is the one new procedure operators/developers run locally.
- Consistency: the corrected cwd (`cd web`) MUST match the Makefile (T11) + `web/README.md` (T11) + `docs/ai-architecture.md` (DOCS 01) — the same single source of truth in four places.
