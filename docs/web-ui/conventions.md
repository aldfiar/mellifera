# Conventions — web-ui (Phase 1)

> Inherits `docs/architecture.md` (§0 principles, §11.5 auth, §11.6 errors),
> `docs/ai-architecture.md` (§3 pure-delegation, §4 module map, complexity
> budget), `.claude/skills/mellifera-build/SKILL.md`, and `.golangci.yml`
> unchanged. Only the **web-ui deltas** are below.

## Go side (gate-enforced)

1. **api stays pure-delegation.** Every handler — existing or new — is parse → ONE domain call → write (`internal/api/doc.go:24` INV1). swag annotations are **comment metadata**; they do NOT add branches or a second domain call. `funlen≤60`, `gocognit≤15`.
2. **api import allowlist unchanged (INV2).** api imports ONLY `internal/store`, `internal/scan`, stdlib + chi. It **MAY NOT** import `internal/plugin`, `internal/enrich`, `internal/module`, or `internal/web`. Admin-status data crosses the boundary as a **func-field closure** (`Deps.Status`, built in `cmd/mellifera`) — the same anti-corruption pattern as the existing `Deps.Scan` func field (`router.go:24`). depguard does not enforce INV2; reviewers do.
3. **No new runtime Go deps — one authorized exception.** `swag`/`swagfmt` are CLI tools (like `protoc`); annotations are comments; the generated `openapi.*` is embedded bytes (no generated-package import). The Phase-1 implementation adds **one** authorized runtime Go dep — `github.com/swaggo/http-swagger v1.3.4` (+ transitives) — to serve the Swagger UI at `/docs/`. This is NOTICE-documented (bundled Swagger UI, Apache-2.0) and is the **only** runtime dep added in Phase 1; AC-7's additive scope (the 4 gates + proto/sdk/scan/enrich byte-identical) is preserved. The earlier "`go.mod`/`go.sum` unchanged" wording was superseded by this exception (health-check A-01 reconciliation). `swag`/`swagfmt`/`node`/`npm` stay dev/CI-only — never runtime, never invoked by the Go build gate.
4. **Symbol budget.** `internal/api` 3→7 (`Deps`, `Principal`, `New`, `Role`, `AdminStatus`, `PluginHealth`, `EnrichStats`) — `IsAdmin()` is a method (excluded from the check.sh count). `AdminStatus`/`PluginHealth`/`EnrichStats` are the exported seam-input wire types the `Deps.Status` closure builds (INV4; promoted to exported so the closure site in `cmd/mellifera` and external tests can construct them). `internal/web` ships 2 (`Handler`, `Options`). `store` gains a method (`ListLibraries`, excluded). All under 8; WARN-free. (Health-check A-02 reconciliation: the prior "3→4" figure under-counted; `doc.go` INV5 is the authoritative 7.)
5. **No `store.Item`/`store.Library` over the wire (INV4).** New handlers convert at the boundary into unexported DTOs (`libraryDTO`, `statusResponse`, etc.) — mirror `toItemDTOs` (`handlers.go:156`).
6. **Parameterized SQL only.** `store.ListLibraries` uses `?`-bound args (no interpolation) — mirror `QueryItems` (`items.go:88`).
7. **Errors** via the existing `writeError` (`handlers.go:193`): 404 `not_found` (missing item/library), 403 `forbidden` (role denied), 503 `unavailable` (nil `Deps.Status`), 500 `internal_error`. Canonical `{error:{code,message,retryable}}` (arch §11.6).
8. **Apache-2.0 headers** on every new `.go` file (`internal/web/*`). Swagger UI is served via the `github.com/swaggo/http-swagger` Go module (which embeds the official `swagger-ui-dist` release) — NOT a hand-vendored `internal/web/swagger-ui/` tree. Its Apache-2.0 notice is recorded in `NOTICE`.
9. **Single-binary + pure-Go/no-CGO at runtime preserved.** The SPA is embedded static assets; `node`/`npm` never appear in `make build`/`make check`/`go build CGO_ENABLED=0`.

## web-ui-specific deltas

- **`internal/web` owns embedding + composition ONLY.** No domain logic. It routes: `/api/*` → the api handler; `/openapi.{yaml,json}` + `/docs` → swagger; everything else → SPA. It does not parse bodies, call store, or branch on media type. A nil apiHandler is valid (tests serve SPA+swagger alone).
- **Public vs authenticated surface (intentional).** `/`, `/assets/*`, `/openapi.*`, `/docs` are **unauthenticated** (the SPA shell + contract load before any token). All `/api/v1/*` routes ARE authenticated (role-gated). Do not put the SPA or swagger behind `authMiddleware`.
- **Cache headers.** `/assets/*` (hashed filenames) → `Cache-Control: public, max-age=31536000, immutable`; `index.html` → `Cache-Control: no-cache`; SPA fallback returns `index.html` with 200. `Options.DevMode` relaxes these (for running the Go server alongside the Vite dev proxy).
- **SPA fallback rule.** Any path NOT under `/api/`, `/openapi`, or `/docs` and NOT a real static asset serves `index.html` (client-side routing). Real assets are served with 404 on miss (no fallback) so broken hashed URLs fail fast.
- **Roles are a type, not a bool.** Use `Principal.IsAdmin()` (or `p.Role == RoleClient`); do not re-introduce a bool field. New role values are added as `Role` constants + `requireRole(...)` membership — no handler forks on "is admin" (arch §11.5: "No handler logic forks on is admin").
- **swag output directory = `internal/web/api/`** (set via `swag init -o`). NEVER the repo-root `docs/` (design docs live there). Annotations live in `internal/api` (on the handlers); the generated artifacts live in `internal/web/api/`.

## React/TS side (Phase 2+ — dev-only; recorded now so the contract is fixed)

- **Toolchain:** Vite + React 18 + TypeScript + react-router-dom + TanStack Query + Tailwind. `web/` directory at repo root (sibling to `internal/`).
- **Dev workflow:** `npm run dev` (Vite :5173) with `vite.config.ts` `server.proxy` mapping `/api`, `/openapi.*`, `/docs` → `http://127.0.0.1:8080` (the Go server). Documented in `web/README.md`.
- **Same-origin, no CORS.** The SPA calls `/api/v1/*` same-origin; the Bearer token is attached client-side. Do not add CORS middleware.
- **Small + cacheable bundle.** Rely on Vite's hashed assets + the immutable cache headers from `internal/web`. Lazy-load route chunks; keep the vendor split stable. Bundle-size is a Phase-4 review gate.
- **node is dev-only.** `web/node_modules/` is gitignored; only `web/dist/` (built) is committed (Phase 2 onward). The Go gate never runs `npm`.

## Anti-patterns (reject in review)
- Logic inside an `api/` handler (incl. computing status from plugin/enrich types inside api — use the closure).
- Importing `internal/plugin`/`internal/enrich` from `internal/api`.
- Putting `/` or `/docs` behind the admin middleware.
- Adding a second auth mechanism instead of widening `Principal`/`Role`.
- Hand-writing `openapi.yaml` (it drifts — regenerate via `swag init`).
- Requiring `node` for `make build`/`make check`.
