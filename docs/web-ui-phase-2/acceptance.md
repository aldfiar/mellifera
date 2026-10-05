# Acceptance Criteria — web-ui Phase 2a (scaffold + auth + admin library-management)

## Source

User request (`docs/web-ui-phase-2/.phase_cache/enhanced_objective.md:8-19`): *"Build the actual React SPA (the visible UI), served from the Go binary via the Phase-1 `internal/web` `go:embed` scaffold. It delivers: (1) Library management (admin panel) — add a media library (name, path on disk — local OR NFS-mounted — module type tv/image), list libraries, trigger a scan, view status/plugins; (2) Client (browse) panel …; (3) The SPA shell + auth (admin token entry; both panels use the admin token for now)."*

**Phase-2a scope (right-sized — see source_baseline §Sub-phasing verdict).** This plan covers the SPA scaffold + auth + the **admin library-management panel** (add, list, scan, status) + the delivery story (real React build served by Go, Go gate node-free). The client browse panel + item-detail metadata rendering are **Phase 2b** (outlined in implementation_plan §Out of Scope). Acceptance here proves the delivery mechanism with a REAL React build (not the Phase-1 placeholder) and the admin flow end-to-end through the Go API.

USER-CONFIRMED decisions baked in (do not re-litigate — `enhanced_objective.md:21-35`): React SPA embedded (Vite + React 18 + TS + react-router + TanStack Query + Tailwind); role-aware auth (SPA sends admin bearer token; both panels use it for MVP; client role unminted — D18); consumes the Phase-1 API (add endpoints ONLY if a panel needs one — **audit found zero needed**); node/npm dev-only, Go gate node-free.

## Scenarios

### AC-1: token-entry login (auth shell)
- **Given**: the Go binary running (SPA served from `internal/web/dist/` via `go:embed`) and `MELLIFERA_ADMIN_TOKEN` set on the server; a browser with no token in localStorage.
- **When**: the operator navigates to any SPA route (e.g. `/admin`) and is redirected to `/login`, enters the admin token, and submits.
- **Then**: the token is stored in localStorage under a fixed key; the SPA sends `Authorization: Bearer <token>` on every `/api/v1/*` request via the fetch wrapper; the operator is redirected to the requested admin route. A subsequent `/api` call returning 401 clears the token and redirects back to `/login`.
- **User intent**: *"The SPA shell + auth (admin token entry; both panels use the admin token for now)"* (`enhanced_objective.md:18-19`). The token-entry screen is the MVP auth surface; localStorage is acceptable for a personal server (XSS note documented in conventions).
- **Covers tasks**: T03 (auth store + `<RequireAuth>`), T04 (`apiRequest` Bearer wrapper + 401 rotation), T06 (App routing — `/login`,`/admin`,`/`→`/admin`), T07 (Login token-entry form). Verified by QA1.

### AC-2: admin adds a library (local OR NFS-mounted path; module type tv/image)
- **Given**: the operator is authenticated (AC-1) and on the admin Libraries page.
- **When**: the operator fills the add-library form (`module_id` ∈ {tv, image}, `root_path` = an absolute path on disk — local or NFS-mounted, documented in-form, `display_name`) and submits.
- **Then**: the SPA POSTs `{"module_id","root_path","display_name"}` to `POST /api/v1/libraries`; on 201 the new library appears in the list (sourced from `GET /api/v1/libraries`). A 400/500 surfaces the canonical `{"error":{code,message,retryable}}` inline. The form documents that network paths must be OS-mounted (the Go process reads them like local paths).
- **User intent**: *"add a media library (name, path on disk — local OR NFS-mounted — module type tv/image)"* (`enhanced_objective.md:12-14`).
- **Covers tasks**: T05 (`useLibraries`/`useCreateLibrary` + invalidate `["libraries"]`), T08 (Libraries table + add form; verbatim `{module_id,root_path,display_name}`; NFS-mount note; canonical error inline). Verified by QA1.

### AC-3: admin triggers a scan and sees the result + the queue drain
- **Given**: a library exists (AC-2) and the base-scanner + tv-parser + image-enricher plugins + the async enrich queue are running (cmd/mellifera wiring).
- **When**: the operator clicks "Scan" on a library row.
- **Then**: the SPA POSTs to `POST /api/v1/libraries/{id}/scan`; on 200 the `scanResponse` `{library_id, discovered, persisted, warnings?}` is shown inline. The admin Status page (AC-4) then reflects the async enrich queue draining (pending → in_flight → done) as items progress toward `ready`. (The browse rendering of the items themselves is Phase 2b; 2a proves the scan trigger + the queue moving via admin/status.)
- **User intent**: *"trigger a scan"* and the real-flow-through-the-Go-API-and-async-queue proof (`enhanced_objective.md:14`, acceptance sketch AC-admin `:87-89`).
- **Covers tasks**: T05 (`useScanLibrary` — no auto-retry), T09 (per-row Scan trigger + inline `{library_id,discovered,persisted,warnings?}`), T10 (Status reflects the queue drain pending→in_flight→done). Verified by QA1.

### AC-4: admin views system status (plugin health + enrich queue stats)
- **Given**: the operator is authenticated and on the admin Status page.
- **When**: the page loads (and on a TanStack Query refetch interval).
- **Then**: `GET /api/v1/admin/status` returns the liveness snapshot; the page renders a per-plugin health table (`id`, `state` ∈ {serving,degraded,not_serving,failed}, `restarts`, `checked_at`) for base-scanner/tv-parser/image-enricher and an enrich-queue stats block (`pending`, `in_flight`, `done`, `failed`). A nil-closure 503 (status disabled) is rendered as a clear "status unavailable" state, not a crash.
- **User intent**: *"view status/plugins"* (`enhanced_objective.md:14`).
- **Covers tasks**: T05 (`useAdminStatus` + refetch interval), T10 (plugin-health table + enrich-stats block; 503 → "status unavailable"; `checked_at` "" → placeholder). Verified by QA1.

### AC-5 (structural): the built React SPA is served from the Go binary (real build, not the placeholder)
- **Given**: `make web-build` has produced a real React build in `internal/web/dist/` (`index.html` + hashed `assets/*`), and the binary is built with `CGO_ENABLED=0 go build` — no node/npm in the build path.
- **When**: `GET /`, `GET /assets/<hashed>.js`, and `GET /admin` (a client-side route) are requested with no auth.
- **Then**: `/` returns 200 `text/html; charset=utf-8` — the REACT index.html (not the 338-byte Phase-1 placeholder); `/assets/*` carries `Cache-Control: public, max-age=31536000, immutable`; `/admin` falls back to index.html (200, SPA client-side routing); index.html carries `Cache-Control: no-cache`. The served HTML references hashed React assets (a Vite build signature), confirming the placeholder was replaced.
- **User intent**: *"served from the Go binary (go:embed); single-binary preserved; cache headers; SPA client-side routes work"* (acceptance sketch AC-embed `:92-94`).
- **Verify probe**: `curl -sI localhost:8080/ | grep -iE 'cache-control|content-type'` → `no-cache` + `text/html`; `curl -s localhost:8080/ | grep -cE 'assets/.*\.(js|css)'` → `>=1` (a hashed asset reference — the real build, not the placeholder's `assets/app.js`); `curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/admin` → `200` (SPA fallback).
- **Covers tasks**: T01 (Vite `outDir → ../internal/web/dist`), T11 (`make web-build` cwd fix so the build lands in the embed target), T12 (regenerates + commits `internal/web/dist/*`; runs the AC-5 probe). Verified by QA2.

### AC-6 (structural): the Go build gate stays green WITHOUT node; additive holds
- **Given**: Phase-2a source committed (the `web/` React app + the regenerated committed `internal/web/dist/` + Makefile/README edits).
- **When**: `make build`, `make check`, `make lint`, `make test` run on a host **without `node` installed**.
- **Then**: all four pass. `internal/api` stays at **7 exported symbols** (≤8). `internal/web` stays at 2. The Go source files (`internal/api/*.go`, `internal/web/*.go`, `cmd/mellifera/main.go`) are byte-identical vs `47f276e` except the regenerated `internal/web/dist/*` bytes. `proto/`, `pkg/sdk`, `internal/{scan,enrich,store,module,plugin}` are untouched. `make web-build` is the ONLY node-touching target and is NOT a prerequisite of `build`/`check`/`test`/`lint`.
- **User intent**: *"`make web-build` produces the dist; the Go gate (build/test/lint/check) stays node-free"* + *"the Go side mostly unchanged; any API additions additive"* (acceptance sketch AC-build + AC-additive `:94-98`).
- **Verify probe**: `make build && make check && make test` on a node-less host → exit 0; `grep -cE '^[[:space:]]*(func|type|var|const) [A-Z]' internal/api/*.go` → `7`; `git diff 47f276e HEAD -- internal/api internal/web/web.go internal/web/swagger.go cmd/mellifera proto/ pkg/sdk internal/scan internal/enrich --stat` → empty (only `internal/web/dist/*` + `web/` + `Makefile` + `web/README.md` changed).
- **Covers tasks**: T11 (`web-build` standalone, NOT a prereq of build/check/lint/test), T12 (gate run on a node-less host → exit 0; Go diff empty; api = 7 symbols). Verified by QA2.

### AC-7 (structural): no new API endpoints; pure-delegation + INV2 preserved
- **Given**: the Phase-2a SPA source.
- **When**: the SPA's network calls are audited.
- **Then**: the SPA calls ONLY existing Phase-1 endpoints — `GET /api/v1/libraries`, `POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`, `GET /api/v1/admin/status` (and the Phase-2b browse endpoints, unused in 2a). **Zero new Go endpoints.** `internal/api` imports no new packages (INV2 — still no plugin/enrich/module/web import); handlers remain parse → one domain call → write (INV1).
- **User intent**: *"Consumes the Phase-1 API … Add endpoints ONLY if a panel needs one (keep api ≤8 + pure-delegation)"* (`enhanced_objective.md:32-35`). The audit found both panels' 2a needs already met.
- **Verify probe**: `grep -rnE "fetch|api\.v1|useQuery|useMutation" web/src | grep -vE '/(items|libraries|admin/status)'` → empty (no off-contract calls); `grep -nE '"internal/(plugin|enrich|module|web)"' internal/api/*.go` → empty (INV2).
- **Covers tasks**: T04 (`ENDPOINTS` = the 4 pre-existing routes only; no items calls used in 2a), T11 + T12 (no Go source edit — only dist bytes + Makefile/README). Verified by QA2.

## Coverage Matrix

| Scenario | Tasks | Verified By |
|---|---|---|
| AC-1 login/auth | T03 (auth+RequireAuth), T04 (Bearer wrapper + 401 rotation), T06 (App routing), T07 (Login page) | QA1 (golden re-derive: no-token redirect, token-entry, Bearer-attached, 401 rotation) + reviewer |
| AC-2 add library | T05 (useLibraries/useCreateLibrary + invalidation), T08 (Libraries list + add form, verbatim DTO, NFS note) | QA1 (verbatim POST + invalidation + canonical error inline) + reviewer |
| AC-3 scan + queue drain | T05 (useScanLibrary, no retry), T09 (scan trigger + inline ScanResponse), T10 (status reflects the drain) | QA1 (scan POST + result render + warnings edge) + reviewer |
| AC-4 admin status | T05 (useAdminStatus + refetch interval), T10 (plugin table + enrich stats + 503-not-crash) | QA1 (table + stats + 503 + checked_at placeholder) + reviewer |
| AC-5 embed/delivery (structural) | T01 (vite outDir → internal/web/dist), T11 (make web-build cwd fix), T12 (dist replace + served build) | QA2 (verify probes: `/` hashed assets + no-cache; `/assets/*` immutable; `/admin` 200 fallback) |
| AC-6 build-gate node-free (structural) | T11 (web-build standalone, not a prereq), T12 (gate run on node-less host) | QA2 (verify probes: `make build/check/lint/test` exit 0; api 7 symbols; Go diff empty) |
| AC-7 additive/no-new-endpoints (structural) | T04 (ENDPOINTS = 4 pre-existing only), T11 (Makefile — no Go edit), T12 (dist bytes only) | QA2 (verify probes: off-contract grep empty; INV2 grep empty) |

## Out of scope (Phase 2b/2c — outlined in implementation_plan §Out of Scope)
- **Phase 2b:** client browse panel — items list (`GET /items?library=&status=`) + item detail (`GET /items/{id}`) + metadata rendering (`sources.<plugin>` cards, `_provenance` badges, `_view` fields, `_stages` progress; precision-preserved, Cyrillic-safe per arch §3.1/§3.4/§11.1).
- **Phase 2c:** polish — responsive layout, empty/loading/error states, pagination, keyboard a11y, dark mode.
- A real `client`-role resolver / user accounts (D18) — the role abstraction exists; accounts are later.
- `DELETE`/`PUT /libraries` (library deletion/rename) — not needed for MVP (arch §12 defers).
