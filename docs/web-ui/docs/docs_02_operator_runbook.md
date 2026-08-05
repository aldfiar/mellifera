# DOCS 02 — Operator runbook for web-ui Phase 1 (node dev-only + `make web-build` + public-surface-widens R-2)

- **Type:** docs
- **audience:** operator (deployment/config — the person running the binary + the dev building the UI)
- **AC trace:** AC-7 (build-gate story; node dev-only), R-2 (public-surface-widens risk note), AC-6 (the delivery mechanism)
- **related_tasks:** T01 (placeholder dist), T10 (vendored swagger-ui + NOTICE), T13 (`MELLIFERA_WEB_DEV` + composition), T14 (`make web-build`)
- **Deps:** none (docs; references the implemented behavior post-coder)

## what changes

CREATE `docs/web-ui/operator-runbook.md` — a focused operator + developer runbook for the Phase-1 web surface. Sections:

1. **Build-gate story (the headline).** The Go gate (`make build` / `make check` / `make lint` / `make test`) NEVER invokes `node`/`npm`/`swag`. It embeds COMMITTED artifacts via `go:embed`:
   - `internal/web/dist/*` (Phase-1 placeholder now; the real React build replaces it in Phase 2)
   - `internal/web/api/openapi.{yaml,json}` (swag-generated, committed)
   - `internal/web/swagger-ui/*` (vendored official Swagger UI, Apache-2.0; recorded in `NOTICE`)
   - On a node-less host: `make build && make check` exit 0 (AC-7 verify probe).

2. **The dev-time regen: `make web-build`.** Runs `swag init -g cmd/mellifera/main.go -o internal/web/api` (regenerates the OpenAPI spec from the `internal/api` handler annotations) + a commented Phase-2 `npm ci && npm run build` (emits `internal/web/dist/`). A developer who touches a handler DTO or a swag annotation runs `make web-build` and COMMITS the regenerated artifacts. CI runs it in a SEPARATE node-enabled job; the Go CI job stays node-free. `swag`/`node` are dev tools (like `protoc`/`golangci-lint`) — NEVER runtime, NEVER in `go.mod`.

3. **Public vs authenticated surface (R-2 — the widens note).** Phase-1 puts `/`, `/assets/*`, `/openapi.{yaml,json}`, `/docs/` OUTSIDE the admin middleware. Today (pre-web-ui) every route required the admin token. Operators who assumed "all endpoints authenticated" now have:
   - a PUBLIC landing page (`/` — the SPA shell — serves NO data, only static HTML/JS)
   - a PUBLIC API contract (`/openapi.*` + `/docs` — the OpenAPI spec + Swagger UI — serves NO data)
   - All DATA stays behind role-gated `/api/v1/*` (`Authorization: Bearer <token>`; admin token → `RoleAdmin`).
   - Mitigation: the public surface is static-only. The server still binds `127.0.0.1:8080` by default (`MELLIFERA_LISTEN`). If you expose it publicly, do so behind a reverse proxy that authenticates `/api` and treats `/`,`/docs`,`/openapi.*` as public static.

4. **Env knobs.**
   - `MELLIFERA_ADMIN_TOKEN` (required; fail-fast) — existing; resolves to `RoleAdmin`.
   - `MELLIFERA_LISTEN` (default `127.0.0.1:8080`) — existing.
   - `MELLIFERA_WEB_DEV` (default `false`; NEW) — when `true`, `web.Options{DevMode:true}` sends `Cache-Control: no-cache` everywhere (disables the immutable `/assets/*` header). Use when running the Go server alongside the Vite dev proxy (`:5173`) so dev edits are not masked by the production cache headers.

5. **Dev workflow (Phase-2 forward; documented now).** Vite dev server `:5173` with `vite.config.ts server.proxy` mapping `/api`, `/openapi.*`, `/docs` → `http://127.0.0.1:8080` (the Go server). Same-origin; no CORS. The SPA attaches `Authorization: Bearer <token>` client-side on `/api` calls. (Phase 1 documents the contract; Phase 2 wires the real Vite project.)

6. **Verification probes (operator-runnable).**
   - `curl -sI localhost:8080/ | grep -i cache-control` → `no-cache` (index).
   - `curl -sI localhost:8080/assets/app.js | grep -i cache-control` → `immutable` (placeholder asset).
   - `curl -s localhost:8080/openapi.yaml | grep -cE '(/libraries|/items|/admin/status)'` → ≥6.
   - `curl -s localhost:8080/api/v1/admin/status` (no token) → 401.
   - `curl -s -H "Authorization: Bearer $MELLIFERA_ADMIN_TOKEN" localhost:8080/api/v1/admin/status` → 200 + plugins + enrich.

## context

- **feature_goal:** Phase 1 proves the delivery mechanism + auth + API extensions. Operators + devs need ONE place that explains the build-gate contract (node stays out), the regen path (`make web-build`), the public-surface widening (R-2), and the env knobs — so a node-less deploy works and a UI-dev knows how to regen.
- **rationale:** pre-web-ui the operator story was "set `MELLIFERA_ADMIN_TOKEN`, run the binary, everything is token-gated." Phase 1 widens the surface (public SPA + contract) AND introduces a dev-only toolchain (node/swag) that must NOT touch the runtime. Without a runbook, an operator will either (a) be surprised by the public `/` or (b) try to `apt install node` on the prod host. Both are the failure modes this doc prevents.

## scope_boundary

- CREATE `docs/web-ui/operator-runbook.md` (the focused Phase-1 runbook).

## out_of_scope

- The `docs/ai-architecture.md §4` module-map sync (DOCS1).
- The React dev guide (Phase 2 — `web/README.md` from T01 documents the proxy contract; this runbook references it).
- API reference docs (the Swagger UI at `/docs` IS the API reference — code-generated, no hand-doc).

## verify

- `test -f docs/web-ui/operator-runbook.md` → exit 0.
- `grep -ci 'make web-build\|MELLIFERA_WEB_DEV\|public.*surface\|node-free\|go:embed' docs/web-ui/operator-runbook.md` ≥ 4 (the load-bearing concepts present).
- `grep -ci 'swag init\|swagger-ui\|NOTICE' docs/web-ui/operator-runbook.md` ≥ 2 (the regen + vendored-UI attribution).

## source_anchor

CREATE `docs/web-ui/operator-runbook.md`. Source of truth: `Makefile` (post-T14), `cmd/mellifera/main.go` (`MELLIFERA_WEB_DEV`, post-T13), `docs/web-ui/implementation_plan.md §Build-gate story`, `docs/web-ui/architecture_review.md R-2`.

## refactoring_docs

- (new doc — no prior runbook to update. `web/README.md` from T01 covers the dev-proxy contract; this runbook covers the operator/build-gate side. Cross-link the two.)

## acceptance_criteria

- AC-7 (the build-gate story documented; node dev-only) + R-2 (public-surface-widens documented — the explicit mitigation)

## line_budget

120 (flex 1.3 — a runbook's verify-probe section is verbose)

## skill_hint

`mellifera-build`, `grounding`
