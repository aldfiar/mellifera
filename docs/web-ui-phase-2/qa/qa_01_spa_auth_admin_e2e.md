# QA 01 — SPA served + auth + admin library-management e2e (through the Go API)

- **Type:** QA (integration / e2e)
- **test_file:** `web/src/qa/e2e.test.tsx` (Vitest + MSW for the Go API contract) + a guided e2e checklist against the running Go binary
- **test_type:** integration (Vitest against the SPA↔API seam) + e2e (the running Go binary serving the embedded SPA)
- **validates_tasks:** [Task 03, Task 04, Task 05, Task 06, Task 07, Task 08, Task 09, Task 10]
- **deps:** none (runs after the coder tasks land + T12 commits the dist)
- **joints_targeted:**
  - `web/src/lib/api.ts apiRequest -> Go /api/v1/* (authMiddleware expects Bearer)` (S4)
  - `web/src/lib/queries.ts -> Go /api/v1/libraries,/scan,/admin/status` (S5)
  - `web/src/components/RequireAuth -> /login redirect` (auth guard)
  - `internal/web/web.go NotFound fallback -> index.html for /admin,/login` (R4 — client routes)
- **boundaries_targeted:**
  - Go API (401 on missing/wrong token; canonical error body on 400/500)
  - localStorage (token persistence — S4 credential store)

## mock_boundaries

- mock: [the Go HTTP API via MSW (Mock Service Worker) for the Vitest layer — the SPA↔API contract; `window.location`/`localStorage` via jsdom]
- real: [all SPA modules — `lib/api.ts`, `lib/auth.ts`, `lib/queries.ts`, `RequireAuth`, the pages — NO doubles between joints; the e2e layer uses the REAL Go binary + REAL embedded SPA]

## coverage_target

The SPA↔API behavioral seam (S4, S5): every admin user flow through the Go API — auth/401 rotation, list/add/scan libraries, admin status — exercised end-to-end. Delta: the auth + admin flows show green from browser to Go handler.

## scenarios

### auth flow (AC-1)
- **name:** no-token navigation redirects to /login
  - arrange: render `<App/>` in `<MemoryRouter initialEntries=["/admin"]>`; localStorage empty.
  - act: render.
  - assert: `/login` is the current route (RequireAuth redirected); no `/api` call fired.
- **name:** token-entry stores credential + redirects to requested route
  - arrange: at `/login` with `location.state.from = "/admin"`; MSW intercepts no call yet.
  - act: paste token "t1", submit.
  - assert: `localStorage.getItem("mellifera.token") === "t1"`; navigated to `/admin`.
- **name:** Bearer header attached on every /api call
  - arrange: token "t1" in localStorage; MSW captures `GET /api/v1/libraries`.
  - act: render `<Libraries/>`.
  - assert: the captured request headers include `Authorization: Bearer t1`.
- **name:** 401 rotates back to /login
  - arrange: token "t1" stored; MSW returns 401 for `GET /api/v1/libraries`.
  - act: render `<Libraries/>`.
  - assert: `localStorage.getItem("mellifera.token") === null` (cleared); navigated to `/login`.

### add library (AC-2)
- **name:** add-library POSTs the verbatim DTO + invalidates the list
  - arrange: MSW `GET /api/v1/libraries` → `{items:[{id:1,...}]}`; `POST /api/v1/libraries` → 201 `{id:2,...}`.
  - act: render `<Libraries/>`; fill `module_id="tv"`, `root_path="/media/tv"`, `display_name="TV"`; submit.
  - assert: POST body === `{"module_id":"tv","root_path":"/media/tv","display_name":"TV"}` (verbatim field names); after 201, `GET /api/v1/libraries` is re-fetched (TanStack invalidation) and the new row renders.
- **name:** 400 surfaces the canonical error inline
  - arrange: MSW `POST /api/v1/libraries` → 400 `{"error":{"code":"bad_request","message":"dup","retryable":false}}`.
  - act: submit the form.
  - assert: an inline Alert shows `code` + `message`; the list is not broken.

### scan trigger (AC-3)
- **name:** scan POSTs + renders ScanResponse inline
  - arrange: a library row id=1; MSW `POST /api/v1/libraries/1/scan` → 200 `{library_id:1, discovered:5, persisted:5}`.
  - act: click "Scan" on row 1.
  - assert: POST fired once (no auto-retry); "discovered 5 · persisted 5" renders inline on row 1.
- **name:** warnings render when present; absent when missing
  - arrange: MSW returns `{...warnings:["slow node"]}`.
  - act: scan.
  - assert: warnings list rendered. (Second case: `warnings` absent → no warnings node.)

### admin status (AC-4)
- **name:** status renders plugin table + enrich stats
  - arrange: MSW `GET /api/v1/admin/status` → `{plugins:[{id:"base-scanner",state:"serving",restarts:0,checked_at:"2026-..."}], enrich:{pending:2,in_flight:1,done:5,failed:0}}`.
  - act: render `<Status/>`.
  - assert: plugin row "base-scanner" with Badge "serving"; enrich block shows 2/1/5/0.
- **name:** 503 renders "Status unavailable" (not a crash)
  - arrange: MSW → 503.
  - act: render.
  - assert: "Status unavailable" Alert renders; no throw.
- **name:** checked_at empty → placeholder
  - arrange: PluginHealth `checked_at: ""`.
  - act: render.
  - assert: cell shows "—" (placeholder), not an empty cell.

### e2e (running Go binary) — guided checklist
- **name:** SPA served + auth + admin flow through real Go
  - arrange: `make web-build` ran (T12); `MELLIFERA_ADMIN_TOKEN=t go run ./cmd/mellifera` on :8080; browser open.
  - act: navigate `http://127.0.0.1:8080/admin`.
  - assert: redirected to `/login` (RequireAuth; the Go NotFound served index.html for `/admin` — client route worked).
  - act: paste `t`; submit.
  - assert: lands on `/admin`; `GET /api/v1/libraries` fired with Bearer.
  - act: add a library (tv, `/tmp/tvlib`, "TV"); click Scan.
  - assert: row appears; scan result renders `{discovered, persisted}`; the Status section reflects the queue (pending → done) on refetch.

## behavior_coverage

- B1 (T03, AC-1, token store): covered by "token-entry stores credential".
- B3 (T03, AC-1, kind:edge, RequireAuth redirect): "no-token navigation redirects to /login".
- B2 (T04, AC-1, Bearer attached): "Bearer header attached".
- B4 (T04, AC-1, kind:error, 401 → clear + /login): "401 rotates back to /login".
- B5 (T04, AC-1, kind:error, canonical error parse): "400 surfaces the canonical error inline".
- B1/B4 (T05/T08, AC-2, list + invalidation): "add-library POSTs the verbatim DTO + invalidates the list".
- B1/B2 (T09, AC-3, scan trigger + result): "scan POSTs + renders ScanResponse inline"; warnings edge.
- B1-B3 (T10, AC-4, status table + stats): "status renders plugin table + enrich stats".
- B5 (T10, AC-4, kind:error, 503): "503 renders 'Status unavailable'".
- B6 (T10, AC-4, kind:edge, checked_at ""): "checked_at empty → placeholder".
- uncovered_behaviors: [] (every coder B-id for AC-1..AC-4 is covered above; the e2e checklist ties them together through the real Go binary).

## acceptance_scenarios

- AC-1: independent re-derivation — token-entry login, Bearer-on-every-request, 401 rotation (4 scenarios above).
- AC-2: add-library verbatim POST + invalidation + canonical error inline.
- AC-3: scan trigger POST + inline ScanResponse + warnings edge.
- AC-4: admin status plugin table + enrich stats + 503-not-crash + checked_at placeholder.

## input_domain_targeted

- `module_id` Select: equivalence classes {tv, image} (only two valid); edge = the form never offers other values (Select-enforced).
- `checked_at`: classes {valid RFC3339, "" (zero)} → valid renders timestamp; "" renders "—".

## verify

```
cmd: cd web && npx vitest run src/qa/e2e.test.tsx
expected: all auth/add/scan/status scenarios green; then the guided e2e checklist against the running Go binary (MELLIFERA_ADMIN_TOKEN=t go run ./cmd/mellifera) passes the same flows through the REAL API.
```
