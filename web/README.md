# Mellifera Web UI

This directory holds the Mellifera React single-page app (the client + admin
panels). The SPA is built by Vite/TypeScript and the built bundle is embedded
into the Go binary via `go:embed` so the single-binary invariant is preserved at
runtime.

> **Phase 2a status:** the real React build lives in `internal/web/dist/`
> (built via `make web-build`). The Phase-1 placeholder (hand-written
> `index.html` + `assets/app.js`) is replaced by the Vite-built hashed SPA
> bundle. `web/src/`, `package.json`, and `vite.config.ts` have landed; this
> README records the dev-workflow contract.

## Toolchain (Phase 2+)

- Vite + React 18 + TypeScript
- react-router-dom (client-side routing; the Go server falls back to
  `index.html` for unknown non-`/api` paths)
- TanStack Query (data fetching against `/api/v1/*`)
- Tailwind CSS

`node` and `npm` are **dev-only**. They are NOT runtime Go dependencies, are
NOT in `go.mod`, and are NOT invoked by `make build` / `make check` /
`make test`. The Go gate consumes the committed, pre-built `dist/` via
`go:embed`; `node` never appears in the Go build path.

## Dev workflow

Run the Go server (the API + the embedded placeholder shell) on `:8080`:

```
MELLIFERA_ADMIN_TOKEN=dev-token go run ./cmd/mellifera
```

Run the Vite dev server on `:5173` (Phase 2). `vite.config.ts` configures
`server.proxy` so these paths forward to the Go server at
`http://127.0.0.1:8080`:

| Dev path                  | Proxied to (Go :8080)   |
|---------------------------|-------------------------|
| `/api`                    | `/api`                  |
| `/openapi.json`,`/openapi.yaml` | `/openapi.*`       |
| `/docs`                   | `/docs` (Swagger UI)    |

Same-origin: the SPA calls `/api/v1/*` directly, attaching
`Authorization: Bearer <token>` per request. No CORS middleware.

## Building the SPA (`make web-build`)

`make web-build` is the **dev/CI-time regeneration path**. It is NOT called by
`make build`, `make check`, `make lint`, or `make test` (those four stay
node-free — AC-6). It:

1. runs `swag init` to regenerate `internal/web/api/openapi.{json,yaml}` from
   the handler annotations in `internal/api`, and
2. runs `cd web && npm ci && npm run build`, emitting the React bundle into
   `internal/web/dist/`.

Resolved paths: the npm project root is `web/` (this directory — `package.json`
+ `vite.config.ts` live here). Vite's `build.outDir` is `../internal/web/dist`,
so the hashed SPA bundle lands directly in `internal/web/dist/` (the
`//go:embed all:dist` target at `internal/web/web.go:20`) — NOT `/web/dist/`
(which is gitignored and unused). `make web-build` runs from the repo root and
`cd`s into `web/`; never `cd internal/web`.

The committed `internal/web/dist/` (the real bundle) is a build INPUT the Go
gate embeds via `//go:embed all:dist` in `internal/web`. It is committed (not
gitignored — `.gitignore` ignores `node_modules/` and `/web/dist/` only).
`web/node_modules/` is gitignored (dev-only); only the built `dist/` is
committed.

## Layout

```
web/                          # this directory (Phase 2 React app + dev config)
  README.md                   # this file (the dev-workflow contract)
  src/                        # Phase 2: React/TS source
  package.json, vite.config.ts, tsconfig.json   # Phase 2
  node_modules/               # Phase 2 — gitignored (dev-only)

internal/web/                 # the Go-side embedding + composition (Phase 1)
  dist/                       # committed build INPUT for //go:embed
    index.html                # Phase 1 placeholder shell
    assets/app.js             # Phase 1 placeholder (AC-6 cache probe target)
  web.go                      # Handler + Options + //go:embed (Task 11)
  swagger.go                  # /openapi.* + /docs serve (Task 12)
  api/openapi.{json,yaml}     # generated spec (Task 10, embedded by Task 12)
  swagger-ui/                 # vendored Swagger UI static (Apache-2.0, Task 10)
```
