# Spec Delta

## ADDED Requirements

### Requirement: Client relay loop

The authenticated SPA SHALL run a background relay worker: poll
`POST /api/v1/relay/claim` on a ~15 s interval with idle backoff (a longer
interval between consecutive empty polls), execute a claimed descriptor's
request verbatim — the served method, URL, and headers are never modified;
`timeout_seconds` aborts the attempt; redirects follow (parity with the
server's client); `min_interval_ms` paces between executions best-effort — and
POST the outcome to `POST /api/v1/relay/{id}/result` (the response body
base64-encoded when the descriptor is `binary_safe`). A `401` SHALL stop the
loop (the existing credential-clearing path owns the redirect); unmount SHALL
stop the loop; unauthenticated routes SHALL never start it. The worker SHALL
run concurrently with any pending user action — an in-flight identify search
is never blocked by it.

#### Scenario: The loop claims, executes, and posts

- **WHEN** the relay worker's claim returns a descriptor with a GET url, two
  headers, a `timeout_seconds`, and `binary_safe` set
- **THEN** the worker fetches exactly that request (method, url, headers
  verbatim, aborted at the timeout), and POSTs the outcome to the result
  route with the body base64-encoded

#### Scenario: A 401 stops the loop

- **WHEN** a claim poll answers 401 (a revoked credential)
- **THEN** the worker stops polling for good, and the SPA follows its
  existing 401 path back to the credential entry

#### Scenario: Empty polls back off

- **WHEN** consecutive claims answer 204 (nothing to do)
- **THEN** the polling interval lengthens (idle backoff) and returns to the
  ~15 s cadence once work appears again

### Requirement: Embedded build carries the relay surface

The committed embedded SPA dist and the committed OpenAPI documents SHALL be
regenerated inside this change — the swag annotations of the two relay routes
into `internal/web/api`, the vite build into `internal/web/dist` — via the
`make web-build` path, and the result SHALL be reproducible: a fresh rebuild
over the committed sources leaves `git diff` clean on both trees, and
`go build ./...` succeeds with the embedded result.

#### Scenario: Regeneration is reproducible

- **WHEN** the committed sources are rebuilt through the make web-build path
- **THEN** `git diff` on internal/web/dist and internal/web/api is clean and
  `go build ./...` succeeds

### Requirement: Plugin failures column and drill-down

The admin Plugins page SHALL render a «Ошибки» column reading the served
per-plugin `failures` count verbatim — `0` rendered muted with no link, any
positive count a click-through to the plugin's failures page. The failures
page (mounted at `/admin/plugins/:pluginId/failures`) SHALL render the
server-limited window for that plugin — the served rows verbatim — with
«Показать ещё» load-more advancing the offset, the honest empty state
«Ошибок нет» (an empty ledger is normal, not an error), canonical errors
inline, `retry: 0`, and Russian operator copy — consuming only the aggregate
and `GET /api/v1/enrich/failures`.

#### Scenario: The column reads the served count verbatim

- **WHEN** the plugins aggregate serves `failures: 3` for one plugin and
  `failures: 0` for another
- **THEN** the Plugins page shows «3» as a click-through to that plugin's
  failures page and «0» muted with no link

#### Scenario: The drill-down renders the served window with an honest empty state

- **WHEN** the failures page opens for a plugin whose scoped listing serves
  a full 50-row window, and for a plugin with no stored rows
- **THEN** the first renders those served rows with «Показать ещё»
  available, and the second renders «Ошибок нет» as a normal state — no
  error banner

## MODIFIED Requirements

### Requirement: SPA consumes only pre-existing endpoints

The SPA SHALL be a pure HTTP client over the versioned API — calling only
`GET /api/v1/libraries`, `POST /api/v1/libraries`, `PATCH
/api/v1/libraries/{id}`, `GET /api/v1/libraries/{id}/summary`,
`GET /api/v1/libraries/{id}/folders`, `POST /api/v1/libraries/{id}/scan`,
`POST /api/v1/libraries/{id}/refresh`, `GET
/api/v1/libraries/{id}/enrich/preview`, `GET /api/v1/items`, `GET
/api/v1/items/{id}`, `PUT /api/v1/items/{id}/parsers`, `DELETE
/api/v1/items/{id}/parsers`, `GET /api/v1/items/{id}/media`, `GET
/api/v1/series`, `GET /api/v1/series/{id}`, `GET /api/v1/series/{id}/episodes`,
`GET /api/v1/progress`, `PUT /api/v1/progress/{item_id}`, `GET
/api/v1/admin/status`, `GET /api/v1/items/{id}/playback`, `POST
/api/v1/items/{id}/play`, `PUT /api/v1/series/{id}/title`, `DELETE
/api/v1/series/{id}/title`, `PUT /api/v1/items/{id}/title`, `DELETE
/api/v1/items/{id}/title`, `GET /api/v1/admin/sources`, `PATCH
/api/v1/admin/sources/{plugin_id}`, `POST /api/v1/admin/sources/preview`, `PUT
/api/v1/libraries/{id}/sources/{plugin_id}`, `DELETE
/api/v1/libraries/{id}/sources/{plugin_id}`, `GET /api/v1/admin/plugins`, `GET
/api/v1/admin/plugins/{plugin_id}/logs`, `GET /api/v1/enrich/failures`, `POST
/api/v1/relay/claim`, and `POST /api/v1/relay/{id}/result` — with wire shapes
mirrored verbatim. Media loads (originals, thumbs, and `?variant=sidecar` subtitle
bytes) SHALL go through the authenticated fetch wrapper into object URLs (an
`<img>`/`<track>` channel cannot carry the bearer header), keeping the media
endpoint's bearer gate intact. Every new SPA consumer SHALL keep the
byte-identical Go contract posture: no client-side shaping that the server
does not send.

#### Scenario: No off-contract calls

- **WHEN** the SPA's network calls are audited and the Go tree is built
- **THEN** every app call targets one of the allowlisted `/api/v1` routes and `go build ./...` succeeds

<!-- wf:probe id=6c03f9c2829e0509 -->
```bash
set -e
go build ./...
violations=$(grep -rnE "fetch\(|['\"]/api/" web/src --include="*.ts" --include="*.tsx" \
  | grep -v "\.test\." \
  | grep -vE "/(items|libraries|series|progress|relay|enrich|admin/(status|sources|plugins))" \
  | grep -vE "fetch\(path") || true
test -z "$violations"
cd web && npx vitest run && npx tsc --noEmit
```
<!-- /wf:probe -->

#### Scenario: Items client mirrors the wire contract
- **WHEN** the SPA's API client is inspected for the items endpoints
- **THEN** listItems and getItem target the pre-existing `/api/v1/items` routes and the ItemDTO fields match the Go JSON tags verbatim

<!-- wf:probe id=b60a9bba64675000 -->
```bash
set -e
grep -q "listItems" web/src/lib/api.ts
grep -q "getItem" web/src/lib/api.ts
grep -q "schema_version" web/src/lib/api.ts
grep -q "relative_path" web/src/lib/api.ts
grep -q "media_type" web/src/lib/api.ts
```
<!-- /wf:probe -->
