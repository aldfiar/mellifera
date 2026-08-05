# Operator + Dev Runbook — web-ui Phase 1

> Audience: **operators** (running the binary) and **UI/API devs** (regenerating the
> embedded artifacts). Phase 1 = the Go-side UI foundation: SPA + Swagger served
> from the single Go binary via `go:embed`. The real React app lands in Phase 2;
> today `internal/web/dist/` is a placeholder shell.
>
> Source of truth: `cmd/mellifera/main.go`, `Makefile`, `internal/web/web.go`,
> `internal/web/swagger.go`, `NOTICE`, `web/README.md`. Cross-link:
> [`web/README.md`](../../web/README.md) (the Phase-2 dev-proxy contract).

## 1. The headline: a single Go binary, node-free build gate

Mellifera stays a **single static Go binary** (CGO disabled). The web UI is
embedded static assets baked in at compile time via `go:embed` — there is no
separate web server, no Node runtime at serve time, and no on-disk `dist/` the
binary reads. The binary serves:

- `/` and `/assets/*` — the embedded SPA (`//go:embed all:dist` in `internal/web/web.go`).
- `/openapi.yaml` + `/openapi.json` — the embedded, code-generated OpenAPI spec (`internal/web/swagger.go`).
- `/docs/` — Swagger UI (served by `github.com/swaggo/http-swagger`).
- `/api/v1/*` — the chi router from `internal/api` (role-gated; see §4).

**The Go build gate never invokes `node`, `npm`, or `swag`.** It embeds
**committed** artifacts:

| Artifact | Path | Phase-1 state |
|---|---|---|
| SPA bundle | `internal/web/dist/*` | placeholder shell (real React build in Phase 2) |
| OpenAPI spec | `internal/web/api/openapi.{yaml,json}` | swag-generated, committed |
| Swagger UI | via the `github.com/swaggo/http-swagger` Go module | bundled (Apache-2.0; in `NOTICE`) |

On a node-less host:

```
make build && make check    # exits 0 — no node/npm/swag required
```

`make build` / `make check` / `make lint` / `make test` are the gate; they
embed the committed bytes and never touch the JS/swag toolchain (AC-7).

## 2. The dev-time regen: `make web-build`

`make web-build` is the ONLY target that touches `swag`/`node`. It is the same
kind of regen step as `proto` (`buf generate`) or `build-plugin` — a
developer/CI concern, never a runtime concern. It runs:

```
swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml
# Phase 2 (commented): cd internal/web && npm ci && npm run build
```

- **When to run it.** After editing a handler DTO or a swag annotation in
  `internal/api`, or (Phase 2) after editing the React app. Then **commit** the
  regenerated `internal/web/api/openapi.{json,yaml}` (and, Phase 2, `dist/`).
  Hand-editing the spec is forbidden — it drifts (`web-ui` anti-pattern).
- **Where `swag`/`node` sit.** They are **dev tools** (like `protoc` /
  `golangci-lint`). They are NOT runtime deps, NOT build deps, and NOT in
  `go.mod` as runtime requirements (`swaggo/swag` appears only as an indirect
  `// indirect` of `http-swagger`). Install them on the dev/CI host only.
- **CI posture.** CI runs `make web-build` in a SEPARATE node-enabled job (so
  the regenerated artifacts can be diff-checked for drift). The Go CI job stays
  node-free — it builds + tests with the committed artifacts.
- **The one runtime dep `web-ui` adds.** `github.com/swaggo/http-swagger v1.3.4`
  is a real Go runtime dep (the first new one in the project) — it serves the
  Swagger UI. It is recorded in `NOTICE` (bundled Swagger UI, Apache-2.0). This
  is the authorized exception to the "no new runtime Go deps" convention; see
  `docs/web-ui/conventions.md` §3.

## 3. Public vs authenticated surface (R-2 — the widens note)

Pre-`web-ui`, every route required the admin token. Phase 1 **widens the public
surface**. Operators who assumed "all endpoints authenticated" must read this:

| Surface | Auth | Serves data? |
|---|---|---|
| `/` (SPA shell) | **public** | no — static HTML/JS only |
| `/assets/*` (hashed JS/CSS) | **public** | no — static assets |
| `/openapi.yaml`, `/openapi.json` | **public** | no — the API contract (no row data) |
| `/docs/` (Swagger UI) | **public** | no — static UI (calls `/openapi.json`) |
| `/api/v1/*` (all data) | **role-gated** | yes — `Authorization: Bearer <token>` |

The widening is **static-only** — the SPA shell, the contract, and the Swagger
UI expose NO data. All data stays behind role-gated `/api/v1/*`. Roles
(`internal/api`): `RoleAdmin` is what every valid admin token resolves to today;
`RoleClient` is **defined but not minted by any resolver yet** (the Phase-2
client-panel swap point — `Principal{Role}` is a type, not a bool; arch §11.5).

**Mitigation / deployment guidance.**

- The server binds **`127.0.0.1:8080` by default** (`MELLIFERA_LISTEN`). For a
  single-user/dev box this is already private.
- If you expose it publicly, do so **behind a reverse proxy** that:
  - authenticates `/api/*` (or relies on the server's own role-gating), and
  - treats `/`, `/assets/*`, `/openapi.*`, `/docs` as public static (they carry
    no data; caching them at the edge is fine — `/assets/*` is immutable,
    `/` and `/openapi.*` are `no-cache`).
- Never put `/` or `/docs` behind `authMiddleware` — the SPA shell + contract
  must load before any token (`web-ui` anti-pattern).

## 4. Roles (admin token → admin; client coming)

- `MELLIFERA_ADMIN_TOKEN` (**required**, fail-fast) — the existing knob; a valid
  bearer token resolves to `RoleAdmin` and reaches every `/api/v1/*` route.
- No/wrong token → `401 unauthorized`. A good token with the wrong role → `403`
  (the `requireRole` groups: browse = admin+client read-only; admin = admin-only
  mutating + liveness). `RoleClient` is gated (no minter ships in Phase 1).
- The admin-status endpoint (`GET /api/v1/admin/status`) is admin-only; it reads
  a best-effort liveness closure (plugin health + enrich-queue stats) built in
  `cmd/mellifera` — the anti-corruption seam that keeps `internal/api` free of
  plugin/enrich imports.

## 5. Environment knobs

| Var | Default | Effect |
|---|---|---|
| `MELLIFERA_ADMIN_TOKEN` | (none — **required**) | Fail-fast if empty; resolves to `RoleAdmin`. |
| `MELLIFERA_LISTEN` | `127.0.0.1:8080` | Bind address. |
| `MELLIFERA_WEB_DEV` | `false` | **(Phase 1 NEW)** When `true`, `web.Options{DevMode:true}` sends `Cache-Control: no-cache` everywhere (disables the immutable `/assets/*` header). Use when running the Go server alongside the Vite dev proxy (`:5173`) so dev edits are not masked by production cache headers. Malformed → falls back to `false` + warns (never aborts startup). |
| `MELLIFERA_DATA_DIR` | `./data` | SQLite location (existing). |
| `MELLIFERA_IMAGE_ENRICHER` | `bin/image-enricher` | image-enricher plugin path (Phase B2; runtime). |
| `MELLIFERA_BASE_SCANNER` / `MELLIFERA_TV_PARSER` | `bin/base-scanner` / `bin/tv-parser` | plugin paths (dev-mode loading). |
| `MELLIFERA_ENRICH_*` | (see §4.4 defaults) | async enrich queue (Phase B1; malformed → default + warn). |

### Runtime deps (the binary needs these on PATH at serve time)

- `ffmpeg`/`ffprobe` — video probe (base-scanner). Install: `brew install ffmpeg`
  / `apt install ffmpeg`.
- `exiftool` — image EXIF (image-enricher, Phase B2). Install:
  `brew install exiftool` / `apt install libimage-exiftool-perl`. A missing
  exiftool soft-fails image enrichment per-source — the scan always succeeds.

### Dev-only deps (NEVER required by the Go gate)

- `node` / `npm` — Phase-2 SPA build (today only the placeholder `dist/` ships).
- `swag` CLI — OpenAPI regen (`make web-build`).
- `golangci-lint`, `buf`/`protoc` — existing dev tools.

## 6. Dev workflow (Phase-2 forward; documented now)

Run the Go server (API + embedded placeholder shell) on `:8080`:

```
MELLIFERA_ADMIN_TOKEN=dev-token go run ./cmd/mellifera
```

Phase 2 wires the Vite dev server on `:5173`. `vite.config.ts` `server.proxy`
forwards `/api`, `/openapi.*`, `/docs` → `http://127.0.0.1:8080` (the Go server).
Same-origin — no CORS. The SPA attaches `Authorization: Bearer <token>` on
`/api` calls client-side. Run both servers with `MELLIFERA_WEB_DEV=true` so the
Go server's cache headers do not mask Vite's hot-reload. Full contract:
[`web/README.md`](../../web/README.md).

## 7. Verification probes (operator-runnable)

Against a running server (`MELLIFERA_ADMIN_TOKEN=t MELLIFERA_LISTEN=127.0.0.1:8080`),
with `curl` and `jq`:

```
# index is no-cache (the SPA shell revalidates so a new deploy is picked up)
curl -sI localhost:8080/ | grep -i cache-control      # → no-cache

# hashed assets are immutable (365d; Vite hashes filenames)
curl -sI localhost:8080/assets/app.js | grep -i cache-control  # → public, max-age=31536000, immutable

# the served OpenAPI spec carries all three new endpoints
curl -s localhost:8080/openapi.yaml | grep -cE '(/libraries|/items|/admin/status)'  # → ≥6

# data stays token-gated: no token → 401
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/api/v1/admin/status          # → 401

# valid admin token → 200 + plugins + enrich snapshot
curl -s -H "Authorization: Bearer $MELLIFERA_ADMIN_TOKEN" \
     localhost:8080/api/v1/admin/status | jq '{plugins, enrich}'                      # → 200

# node-free Go gate (the AC-7 build probe)
make build && make check    # → exit 0, no node/npm/swag invoked
```

## Deferred (Phase 2+)

The real React app (`web/src/`, `package.json`, `vite.config.ts`), the client +
admin panels, the `RoleClient` resolver (the type exists; no minter yet), B3
(external TMDB enricher + `AuthContext`), and Phase C (post-actions) remain
**deferred**. Phase 1 fixes the delivery contract — the public/authenticated
surface, the embed/cache headers, the regen path, and the role abstraction — so
Phase 2 wires the React app against a stable target.
