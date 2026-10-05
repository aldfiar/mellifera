# Contracts — web-ui Phase 2a (scaffold + auth + admin library-management)

> The SPA consumes the **Phase-1 Go API contract verbatim** (no new endpoints —
> `internal/api/router.go:89-102`). This file fixes the TypeScript wire shapes the
> React app owns (mirrors of the Go DTOs in `internal/api/handlers.go`), the auth
> flow, and the build-output seam. The Go side is unchanged (INV1/INV2/INV5 hold).

## Target: web/ (the React app — CREATE in Phase 2a)

The npm project root is `web/` (`web/README.md:66-81` — the authoritative Phase-2 layout). Vite `build.outDir` redirects to `internal/web/dist/` (the only path `//go:embed all:dist` in `internal/web/web.go:20` can reach — embed paths must be within the package).

### Wire types (TS mirrors of the Go DTOs — `internal/api/handlers.go`)

```ts
// web/src/lib/api.ts — mirrors internal/api/handlers.go verbatim (do NOT drift).

// handlers.go:34-38 (createLibraryRequest)
interface CreateLibraryRequest {
  module_id:    string;   // "tv" | "image" (ModuleID; arch §2.4 module seeds: tv + image)
  root_path:    string;   // absolute OS path — local OR NFS-mounted (documented in-form)
  display_name: string;
}

// handlers.go:46-51 (libraryDTO)
interface LibraryDTO {
  id:           number;   // int64
  module_id:    string;
  root_path:    string;
  display_name: string;
}
// handlers.go:54-56 (librariesResponse)
interface LibrariesResponse { items: LibraryDTO[]; }   // empty array, never null

// handlers.go:59-64 (scanResponse)
interface ScanResponse {
  library_id: number;
  discovered: number;
  persisted:  number;
  warnings?:  string[];
}

// handlers.go:86-91 (PluginHealth — exported seam input)
interface PluginHealth {
  id:         string;
  state:      string;   // "serving" | "degraded" | "not_serving" | "failed"
  restarts:   number;
  checked_at: string;   // RFC3339; "" when LastCheckedAt is zero (main.go:149-151)
}
// handlers.go:97-102 (EnrichStats — exported seam input)
interface EnrichStats {
  pending:  number;
  in_flight: number;
  done:     number;
  failed:   number;
}
// handlers.go:110-123 (AdminStatus aggregate + statusResponse envelope)
interface AdminStatus {           // the /admin/status response body (statusResponse)
  plugins: PluginHealth[];
  enrich:  EnrichStats;
}

// handlers.go:129-139 (itemDTO) + the §3.1 document (json.RawMessage — opaque to Go)
interface ItemDTO {
  id:             string;         // "itm_<libraryID>_<fileID>"
  module_id:      string;
  library_id:     number;
  file_id:        string;
  relative_path:  string;
  media_type:     string;         // "video" | "image"
  document:       ItemDocument;   // the FULL §3.1 document (precision-preserved)
  schema_version: number;
  status:         string;         // "new"|"pending"|"enriched"|"failed"|"ready"|"stale"
}
interface ItemsResponse { items: ItemDTO[]; }     // handlers.go:67-69 (Phase 2b)
interface ItemResponse  { item: ItemDTO; }        // handlers.go:74-76 (Phase 2b)
```

### The §3.1 document shape (Phase 2b renders it; fixed here so the TS is honest)

From `docs/architecture.md:772-831` (transcribed, not invented). The SPA renders this verbatim — no averaging, no rounding (arch §3.4, §11.2).

```ts
// web/src/lib/document.ts (Phase 2b; shape fixed now)
interface ItemDocument {
  identifiers?: Record<string, string | number>;           // Tier 1 (tmdb_id, imdb_id, …)
  sources?:     Record<string, SourceNamespace>;           // Tier 2: sources.<plugin_id> (lossless)
  _view?:       Record<string, ViewEntry>;                 // Tier 3: computed display
  _provenance?: Record<string, ProvenanceEntry>;           // per field_path audit trail
  _stages?:     StageEntry[];                              // pipeline progress
  ffprobe?:     unknown;                                   // raw scanner blob
  [k: string]:  unknown;                                   // dynamic JSON — never collapse
}
interface SourceNamespace { [field: string]: unknown }     // per-plugin; render as a card
interface ViewEntry   { value: unknown; source: string; lang?: string; reason: string }
interface ProvenanceEntry {
  plugin_id: string; plugin_version?: string; fetched_at?: string;
  confidence?: number; source_url?: string;
}
// _stages entry — transcribed from internal/enrich/enrich.go:137-149
interface StageEntry {
  stage:       string;     // "metadata_source"
  plugin_id:   string;
  status:      string;     // stageStatus: "ok" | "failed" | …
  advanced_to: string;     // item status after this source ran
  started_at:  string;     // RFC3339
  finished_at: string;     // RFC3339
  error?:      string;     // present only on failure
}
```

### API client contract (`web/src/lib/api.ts`)

- **Base URL:** same-origin `"/api/v1"` (the SPA is served by the Go binary; `/api/*` is mounted in `internal/web/web.go:49`). No CORS.
- **Auth:** every request carries `Authorization: Bearer <token>` read from localStorage (`web/src/lib/auth.ts`). The Go `authMiddleware` (`internal/api/middleware.go:32-45`) constant-time-compares it.
- **401 handling:** a 401 from any `/api` call clears the token and redirects to `/login` (the token is wrong/rotated).
- **Error body:** the canonical `{"error":{code, message, retryable}}` (`internal/api/handlers.go:364-385`, arch §11.6). The client surfaces `error.code` + `error.message` inline; `retryable: true` MAY offer a retry affordance.
- **Endpoints used in 2a** (all pre-existing — `internal/api/router.go:89-102`):

| Method + Path | Role group | TS hook (2a) | Go handler |
|---|---|---|---|
| `GET /api/v1/libraries` | admin+client | `useLibraries()` | `listLibraries` (`handlers.go:243-250`) |
| `POST /api/v1/libraries` | admin | `useCreateLibrary()` | `createLibrary` (`handlers.go:152-169`) |
| `POST /api/v1/libraries/{id}/scan` | admin | `useScanLibrary()` | `scanLibrary` (`handlers.go:181-198`) |
| `GET /api/v1/admin/status` | admin | `useAdminStatus()` | `adminStatus` (`handlers.go:292-303`) |

**Phase 2b adds** (unchanged Go side): `GET /api/v1/items?library=&status=&limit=&offset=` (`listItems`, `handlers.go:216-230`), `GET /api/v1/items/{id}` (`getItem`, `handlers.go:266-278`).

### Auth contract (`web/src/lib/auth.ts` + `RequireAuth`)

- **Token storage:** `localStorage` key `mellifera.token`. localStorage (not sessionStorage) so the operator enters it once per browser; not a cookie (no Go login endpoint exists — the admin token is a static env var).
- **`useToken()` hook:** reads/writes/clears the key; exposes `{ token, setToken, clearToken }`.
- **`<RequireAuth>` route guard:** if no token → `<Navigate to="/login" state={{from}} />`; else render children. (MVP: presence-of-token = authenticated. The Go side enforces real authZ via `authMiddleware` + `requireRole`; the SPA never trusts the token's validity for data — a 401 is the source of truth.)
- **XSS acknowledgment (documented, accepted for MVP):** a personal server bound to `127.0.0.1` by default (`MELLIFERA_LISTEN`, `main.go:251`); the SPA shell is static + same-origin; the only third-party JS is the committed, hashed build (no runtime CDNs). Revisit at D18 (multi-user).

### Routing contract (`web/src/App.tsx`)

| Route | Component | Guard | Phase |
|---|---|---|---|
| `/login` | `Login` | public (only unauthenticated SPA route) | 2a |
| `/admin` | `Admin` (libraries + status) | `<RequireAuth>` | 2a |
| `/` → redirect `/admin` (2a; becomes `/browse` in 2b) | — | `<RequireAuth>` | 2a |
| `/browse`, `/items/:id` | (browse + detail) | `<RequireAuth>` | **2b (outlined)** |

The Go `web.Handler` NotFound (`internal/web/web.go:54-63`) falls back to `index.html` for any non-`/api`/`/openapi`/`/docs`/`/assets` path, so client-side routes work without server config.

## Consumed from: internal/api (Phase 1 — no edits; the SPA is a pure HTTP client)

- The 4 endpoints above + their DTOs (`internal/api/handlers.go`). The SPA is a stateless HTTP client over `fetch`; it imports nothing from Go. **api stays at 7 exported symbols** (INV5); **no new endpoints** (AC-7).

## Consumed from: internal/web (Phase 1 — only the embed slot)

- `//go:embed all:dist` (`internal/web/web.go:20`) reads whatever bytes are in `internal/web/dist/`. Phase 2a replaces the placeholder bytes with the Vite build; the Go directive + `Handler` are byte-identical. `mustReadIndex` (`web.go:138-144`) requires `dist/index.html` — Vite emits it.

## Consumed from: external dev tools (NOT runtime Go deps; NOT in go.mod)

- **Vite + @vitejs/plugin-react** — dev build (emits `internal/web/dist/`). Dev-only.
- **TypeScript** — type-check (dev-only; the built JS is what ships).
- **react, react-dom (18)**, **react-router-dom**, **@tanstack/react-query** — runtime SPA deps (bundled into the hashed assets; NOT Go deps).
- **Tailwind CSS + PostCSS + autoprefixer** — build-time CSS (dev-only toolchain; ships compiled CSS).
- **shadcn/ui** — copy-in components (Radix UI primitives + `class-variance-authority` + `tailwind-merge` + `clsx`); lives under `web/src/components/ui/`. Copy-in (not a runtime npm import of "shadcn") — the primitives are vendored into the source tree and bundled.
- **Vitest + @testing-library/react + jsdom** — JS unit tests (dev-only).
- All MIT/BSD-3 licensed; recorded in `web/README.md` + `NOTICE` (Radix UI MIT, TanStack MIT, Tailwind MIT, Vite BSD-3). The Go binary serves only the built, hashed assets — these deps never enter `go.mod` or the Go build path.

## Exported to: internal/web (the embed slot) + operators

- `web/` exports **the built `internal/web/dist/`** (committed build INPUT for `//go:embed`). This is the ONLY thing the Go binary consumes from the React app at runtime. Source under `web/src/` is dev-only (not embedded).
- **Operators** get: `make web-build` (the regen target — `cd web && npm ci && npm run build`), the Vite dev workflow (`:5173` proxy → Go `:8080`, `MELLIFERA_WEB_DEV=true`), and the SPA itself at `/`.

## Refactoring map

- **`internal/web/dist/*` (placeholder → real React build):** NOT a code rename — a byte replacement of the embedded build INPUT. The `index.html` + `assets/app.js` placeholder (`web/README.md:8-12`) is overwritten by `vite build` (outDir `internal/web/dist/`, `emptyOutDir: true`). No Go directive or import changes.
- **`Makefile` `web-build` (`:56-61`):** uncomment the npm step AND correct `cd internal/web` → `cd web` (the npm project root per `web/README.md:66-81`). R1 (architecture_review).
- **`web/README.md`:** Phase-2 status note (placeholder → real build landed) + the resolved outDir path. No structural contract change.
- **No Go symbol renames.** No Go signature changes. No proto/sdk/scan/enrich/module changes.

## Constants / env

| Name | Default | Purpose | Phase-2a change |
|---|---|---|---|
| `MELLIFERA_ADMIN_TOKEN` | (required) | the SPA's bearer token; resolves to `RoleAdmin` (`middleware.go:41`) | none |
| `MELLIFERA_LISTEN` | `127.0.0.1:8080` | Go bind (private by default) | none |
| `MELLIFERA_WEB_DEV` | `false` | `web.Options.DevMode` (no-cache everywhere; for the Vite dev proxy) | none |
| `MELLIFERA_TOKEN_KEY` (SPA, localStorage) | `"mellifera.token"` | where the SPA stores the entered admin token | NEW (SPA-local; not a Go env) |

## Interface contracts (pre/postconditions)

### `fetch` wrapper `apiRequest<T>(path, init?)` (`web/src/lib/api.ts`)
- **Precondition:** `path` starts with `/api/v1/`. A token MAY be absent (the wrapper still sends the request; a 401 triggers the login redirect).
- **Postcondition:** on 2xx → parsed `T`; on 401 → clear token + redirect `/login` + reject; on other non-2xx → reject with `{code, message, retryable}` parsed from the canonical body.
- **Invariant:** NEVER rounds/averages document values; passes JSON through `JSON.parse` verbatim (arch §3.4/§11.2).

### `<RequireAuth>` (`web/src/components/RequireAuth.tsx`)
- **Precondition:** rendered inside `<BrowserRouter>`.
- **Postcondition:** renders children iff a token is in localStorage; else `<Navigate to="/login">`.

### `useCreateLibrary()` / `useScanLibrary()` (`web/src/lib/queries.ts`)
- **Precondition:** authenticated (token present).
- **Postcondition:** on success, invalidates the `useLibraries` query (TanStack Query cache) so the list re-fetches; surfaces the canonical error on failure.
