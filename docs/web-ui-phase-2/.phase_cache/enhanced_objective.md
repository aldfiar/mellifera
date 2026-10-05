# Enhanced Objective — web-ui Phase 2 (the React app + panels)

> Pre-approved by user (2026-08-05). Builds on `main` @ `47f276e` (scan-library +
> plugin-pipeline Phase A + async-enrichment Phase B1 + image-enrichment B2 +
> web-ui Phase 1). **Phase 2 = the visible React SPA + panels** that consume the
> Phase-1 Go foundation. Planner uses this as the approved objective.

## Intent

Build the actual **React SPA** (the visible UI), served from the Go binary via the
Phase-1 `internal/web` `go:embed` scaffold. It delivers:
1. **Library management (admin panel)** — add a media library (name, path on disk —
   local OR NFS-mounted — module type tv/image), list libraries, trigger a scan, view
   status/plugins.
2. **Client (browse) panel** — list items (filter by library/status), view an item's
   full document incl. plugin metadata (sources.<plugin> + _provenance + _view + _stages)
   rendered human-readable (precision-preserved per arch principle 4).
3. The SPA shell + auth (admin token entry; both panels use the admin token for now —
   the role-aware middleware from Phase 1 is client-role-ready).

## USER-CONFIRMED decisions (from Phase 1 + this feature — do not re-litigate)
- **React SPA embedded.** Vite + React 18 + TypeScript + react-router + TanStack Query
  + Tailwind (decided in Phase 1). Built → `web/dist/` → `go:embed` via the existing
  `internal/web` package (Phase 1 placeholder dist replaced with the real build).
  Single-binary DELIVERY preserved; node/npm/Vite dev-only; the Go gate stays node-free
  (commits the built dist; `make web-build` regenerates).
- **Role-aware auth (Phase 1).** The SPA sends the admin bearer token; both panels use
  it for now (MVP). The `client` role exists but isn't minted (D18 swap point). The
  browse panel's routes accept client+admin; admin actions require admin.
- **Swagger (Phase 1)** — the SPA can also drive off `/openapi.yaml` if useful, but it
  primarily calls the REST API directly (`/api/v1/*`).
- **Consumes the Phase-1 API** — `GET /libraries`, `POST /libraries`, `POST /libraries/{id}/scan`,
  `GET /items?library=&status=`, `GET /items/{id}`, `GET /admin/status`. Add new API
  endpoints ONLY if a panel needs something not yet exposed (the planner audits; keep
  api pure-delegation + ≤8 symbols).

## Scope
1. **React app scaffold** (Vite + TS + react-router + TanStack Query + Tailwind) under
   `web/` (the source); build → `web/dist/` (committed for go:embed). Routing: an admin
   area (/admin: libraries, scan, status) + a browse area (/ or /browse: items + detail).
   Auth: a token-entry/login screen → token stored (localStorage) → sent as Bearer on
   all /api requests (TanStack Query auth middleware / fetch wrapper).
2. **Admin panel — library management:** add-library form (name, path, module type
   tv/image; document that NFS/network paths must be OS-mounted), list libraries,
   trigger scan (POST /scan), view admin/status (plugins + queue stats).
3. **Client panel — browse:** list items (filter library + status), item detail view
   rendering the full document incl. per-plugin provenance (sources.<plugin> +
   _provenance + _view + _stages) human-readable; Cyrillic-safe; precision preserved.
4. **Build integration:** `make web-build` = `npm ci && npm run build` (Vite →
   web/dist/) + the existing `swag init`; `web/dist/` committed (go:embed); the Go gate
   node-free. Dev workflow: Vite :5173 proxying /api → Go :8080.

## Foundation (on main — reuse, don't rebuild)
- `internal/web` (Phase 1): `Handler` composes /api + the embedded SPA + swagger. Phase 2
  replaces the placeholder dist with the real React build (no Go change to web.Handler —
  it embeds whatever is in dist/).
- `internal/api` (Phase 1): the role-aware endpoints the SPA calls.
- The async pipeline: items reach `ready` with provenance — the browse panel shows them.
- The build gate (check.sh, golangci-lint) — node is dev-only.
- ADDITIVE where possible: the Go side is mostly unchanged (Phase 1 built the
  foundation); Phase 2 is primarily a NEW React app under `web/` + the built dist. Any
  Go API additions are additive (new endpoints only if a panel needs one).

## Open questions for the planner (decide + justify; surface any needing the user)
1. **Component library:** shadcn/ui (Tailwind-based, copy-in, lightweight) vs MUI vs
   plain Tailwind primitives. Lean toward shadcn/ui (matches the Vite+TS+Tailwind stack;
   small bundle; cacheable).
2. **Token storage + auth flow:** localStorage (simple, MVP) vs sessionStorage vs
   httpOnly cookie (would need a Go login endpoint). MVP = localStorage + a token-entry
   screen (the admin token). Note XSS implications for a personal server (acceptable for
   MVP; document).
3. **Routing/structure:** /admin (libraries + scan + status) + /browse (items + /item/:id
   detail) + a login/token screen. Protected routes (redirect to login if no token).
4. **Metadata rendering:** a reusable component that renders the dynamic-JSON document —
   sources.<plugin> (per-plugin cards), _provenance (per-field source badges),
   _view (recomputed display fields), _stages (pipeline progress). Precision-preserved
   (no collapse); Cyrillic-safe.
5. **API additions (audit):** does the browse panel need anything beyond GET /items +
   GET /items/{id}? Does the admin panel need DELETE/PUT /libraries (manage), or is
   add+list+scan enough for Phase 2? (Prefer no new endpoints unless clearly needed; keep
   api ≤8 symbols + pure-delegation.)
6. **Phasing:** this is a LARGE phase (React scaffold + admin library-mgmt + browse +
   metadata rendering). Likely sub-phased: (2a) scaffold + auth + admin library-mgmt;
   (2b) browse + item detail + metadata rendering; (2c) polish. The planner decides.

## Acceptance sketch (planner refines)
- **AC-admin:** an admin can add a library (local path + module type), trigger a scan,
  and see items appear (real flow through the Go API + async queue). Driven via the SPA
  in a browser (or a browser-equivalent black-box test against the embedded SPA's API).
- **AC-browse:** a user can list items (filter library/status) and view an item's full
  metadata (plugin provenance rendered).
- **AC-embed:** the built React SPA is served from the Go binary (go:embed); single-
  binary preserved; cache headers; SPA client-side routes work.
- **AC-build:** `make web-build` produces the dist; the Go gate (build/test/lint/check)
  stays **node-free** (commits the built dist).
- **AC-additive:** the Go side mostly unchanged; any API additions additive (no
  proto/sdk/scan/enrich break — verify).
- **AC-2:** Go build gates green + vet; ≤8 symbols/pkg (Go side); the Go gate node-free.

## Out of scope (DEFERRED)
- Full multi-user / a real client-account system (D18) — the roles abstraction exists;
  accounts are later.
- Streaming/playback/transcoding (browse metadata only).
- Phase C (post-action).
- A mobile-native app (the SPA is responsive web).

## Right-sizing (CRITICAL)
Phase 2 is LARGE (React app + 2 panels + library mgmt + metadata rendering). The
objective EXPLICITLY authorizes sub-phasing. Evaluate honestly vs the budget. Likely:
(2a) scaffold + auth + admin library-management; (2b) browse + item-detail + metadata
rendering; (2c) polish. Decide + document; if sub-phased, scope THIS plan to 2a and
outline 2b/2c. **The Go build gate must stay node-free** (commit the built dist; node
dev-only).
