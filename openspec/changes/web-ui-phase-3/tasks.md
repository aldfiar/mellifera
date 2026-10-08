# Tasks: web-ui-phase-3

Probe CWD is the repo root. All probes are node-free (`go test`/`go build` +
greps over `web/src`). Probe bodies live in the spec deltas
(`specs/*/spec.md`); each box links one. Group dependencies (DAG):
1 → (3, 4, 5, 6, 7); 2 → (4, 7); 5 (serial layout) additionally consumes the
`serials-library` `/series` endpoints — merge order: that change first, or land
this change with the serial layout gated on its presence. Max concurrency 2
(1+2, then 3+4+5, then 6, then 7).

## 1. Store + library API — description, update, summary, folders

- [x] 1.1 Libraries `description` column: new idempotent migration entry (`ALTER TABLE libraries ADD COLUMN description TEXT NOT NULL DEFAULT ''`), store roundtrip through create/read (design D8) [probe:a412a2004b1f0741]
- [x] 1.2 Library DTO + `GET /libraries` carry `description`; `POST /libraries` accepts the optional field (create with/without) [probe:10a04e7e23934383]
- [x] 1.3 `PATCH /api/v1/libraries/{id}` (admin): updates `display_name`/`description`, returns the DTO [probe:7b5af9af35da650b]
- [x] 1.4 PATCH rejects `root_path`/`module_id` changes with 400 (row untouched), unknown id → 404 [probe:77928e420935e248]
- [x] 1.5 `GET /api/v1/libraries/{id}/summary` (browse): constant-time `{library_id, items, updated_at}`, empty library → `items: 0` + `""`, 404 unknown, 400 non-integer [probe:2b30942d278fb480]
- [x] 1.6 `GET /api/v1/libraries/{id}/folders` (browse): depth-1 prefixes + counts, path-sorted, SQL aggregate, 404 unknown [probe:7e1d32a64d7043ff]
- [ ] 1.7 Regenerate committed `internal/web/api/openapi.{json,yaml}` with the new routes and DTO field [probe:fe5d7468a0e434f4]

## 2. Playback-progress capability

- [x] 2.1 `playback_progress` idempotent DDL + upsert (single row per item, refreshed stamp, orphan-tolerant reads) [probe:8696d785bab6006b]
- [x] 2.2 `PUT /api/v1/progress/{item_id}` (browse): valid → 200 record, negative/non-integer → 400 (value untouched), unknown item → 404 [probe:25e5e695d3472138]
- [x] 2.3 `GET /api/v1/progress?limit` (default 20, max 100, newest-first, positive positions only) + `GET /api/v1/progress/{item_id}` (200/404), `limit=abc` → 400 [probe:7e018bd69bc80a50]

## 3. SPA shell — sidebar, profile, navigation

- [x] 3.1 Sidebar hidden by default: floating menu button, slide-in 224px panel (brand, Home/Admin icon nav, pinned profile, theme toggle), chevron/Escape close, `mellifera.side` persistence, no heading overlap [probe:024d433d9435672e]
- [x] 3.2 Profile block: operator identity + role probed via `GET /admin/status` (admin on 200, client on 403/failure), pinned at the panel bottom [probe:e11f23f0dc338749]
- [x] 3.3 Collections list: all libraries as pastel-dot entries with summary counts, independently scrollable list, Home/Admin/profile pinned, counts never block opening [probe:2e30440ea6eccd07]
- [x] 3.4 Remove the top navigation header and the redundant Home page title; routes: `/` → Home, `/collections/{id}`, `/items/{id}`, `/admin`, `/login` [probe:b9c48ae1b98f0c79]

## 4. Home — collections grid, Continue, Next up

- [x] 4.1 Collections grid from libraries + summary (name, pastel type badge, description, count, updated; zero-item empty card), type chips as client-side filter, no paths / no lifecycle pills [probe:25c42c993ff9a6c8]
- [x] 4.2 Continue row from `GET /progress` (positive positions, newest-first, progress bars, Play deep-links to `/items/{id}`) with shared empty state [probe:b95db436defdd04e]
- [x] 4.3 Next up row: lowest-numbered unstarted episode per touched series from episode facts, Play deep-link, empty state [probe:d337c75bf42912ac]

## 5. Collection pages — `/collections/{id}`

- [x] 5.1 Route + header from library + summary (name, type badge, description, count, updated; no paths/pills) with the body keyed by `module_id` [probe:25c42c993ff9a6c8]
- [x] 5.2 Movies (`tv`): paginated item card grid with parsed chips + raw filenames [probe:b9c48ae1b98f0c79]
- [x] 5.3 Photos (`image`): folder chip row from the folders endpoint (client-side filter) over an item masonry grid with capture-date footers [probe:b44fac0b43f4f086]
- [x] 5.4 Serials (`serial`): series grid from `GET /series?library={id}` linking into the episode flow (consumes serials-library; gate on its merge) [probe:df3ca14e8db184a5]

## 6. Admin — collections management

- [x] 6.1 Collections table: name + description, type badge, root folder, Items/Updated from summary, per-row Scan (inline result) + Edit, sticky header at 20+ rows [probe:107d8a9a99bec216]
- [x] 6.2 Edit overlay: Name/Description inputs, read-only Type + Root folder with the re-identification warning, PATCH submission with inline 400/404 canonical errors, table re-fetch on success [probe:fdc92080f01735e6]
- [x] 6.3 Add-collection form gains Description; Status section removed from the SPA (no plugin/enrich UI anywhere in `web/src/pages/admin/`); `GET /admin/status` contract untouched [probe:bbfedb503f8ff6ff]
- [x] 6.4 Add-collection form renders Description and POSTs it on create [probe:43d0b2ce71a94805]

## 7. QA + delivery

- [ ] 7.1 SPA endpoint-allowlist audit (all calls within the versioned surface) + `go build ./...` [probe:6c03f9c2829e0509]
- [ ] 7.2 Regenerate committed `internal/web/dist/` carrying the `/collections` route literal; embed directive and node-free gate untouched [probe:fe5d7468a0e434f4]
- [ ] 7.3 Close-out: `make build && make check && make test` green node-free; manual e2e walkthrough (home, 20+ collection sidebar, photos folders, admin overlay) against the mockup `.tmp/webui-mockup.html`; golden `tv`/`image` scans unchanged; note the softened-pastel base as a proposal against the shipped slate tokens [unprobeable]
