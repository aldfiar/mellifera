# Mellifera API Reference + Operator Runbook

> Scope: the HTTP edge shipped by the `scan-library` feature (the foundational
> slice). Every detail below is grounded in the implemented code — endpoint paths
> and DTOs mirror `internal/api/{router,handlers,middleware}.go`; env vars mirror
> `cmd/mellifera/main.go`; the plugin model mirrors `plugins/base-scanner/` +
> `internal/plugin/`. See `docs/architecture.md` for the authoritative contracts.

## 1. Authentication

Every endpoint is gated by a single admin bearer token (D18/Q15 — MVP auth).

- Send `Authorization: Bearer <ADMIN_TOKEN>` on every request.
- The middleware (`internal/api/middleware.go`) constant-time-compares the
  credential against the configured token; on any miss (no header, wrong scheme,
  wrong token) it responds `401` and **does not invoke the handler** — no handler
  ever runs without a resolved `Principal`.
- `Principal` is a type (`Principal{Admin: true}` for MVP), resolved into the
  request context. Phase 2 widens it (user_id, roles, library ACLs) behind the
  same middleware without changing handler signatures (arch §11.5).
- 401 body: `{"error":{"code":"unauthenticated","message":"missing or invalid admin token","retryable":false}}`.

## 2. Endpoints

All routes are mounted under `/api/v1` (`internal/api/router.go`). Handlers are
pure delegation: parse → call ONE domain function → write the response (ai-arch
§3). The scan endpoint **blocks until the scan completes** (MVP — no async job
queue yet).

### `POST /api/v1/libraries` — create a library

Request body:
```json
{ "module_id": "tv", "root_path": "/media/TV", "display_name": "TV" }
```
- `module_id` names a module config row (the built-in `tv` module is seeded at
  startup); `root_path` is the scan root; `display_name` is a human label.
- Success: `201 Created` with the library.
- Errors: `400 bad_request` (malformed JSON); `500 internal_error` (retryable).

Response:
```json
{ "id": 1, "module_id": "tv", "root_path": "/media/TV", "display_name": "TV" }
```

### `POST /api/v1/libraries/{id}/scan` — trigger a scan

- `{id}` is the integer library id from the path. One domain call: `scan.Run`.
- Success: `200 OK` with the scan result.
- Errors: `400 bad_request` (non-integer id); `500 internal_error` (retryable).
- **Blocks** until the scan completes. Soft per-file failures do not abort the
  scan — they are aggregated into `warnings` (AC-6). Hard failures (library,
  module, or scanner cannot be resolved; stream cannot open; context cancelled)
  return the error with a partial result.

Response (`scan.Result`):
```json
{
  "library_id": 1,
  "discovered": 12,
  "persisted": 11,
  "warnings": ["identify \"bad.mkv\": ffprobe: non-JSON stdout"]
}
```

### `GET /api/v1/items?library={id}&limit=&offset=` — list items

- `library` (query, integer, required) — the library id.
- `limit` (query, optional) — page size; default `50`, capped at `200`. Invalid
  or non-positive values fall back to the default.
- `offset` (query, optional) — non-negative; default `0`.
- Success: `200 OK` with items. Each item carries the dynamic-JSON `document`
  (the parsed title/season/episode block + the verbatim `ffprobe` blob) per
  arch §3.1.
- Errors: `400 bad_request` (non-integer `library`); `500 internal_error` (retryable).

Response:
```json
{
  "items": [
    {
      "id": "itm_1_<file_id>",
      "module_id": "tv",
      "library_id": 1,
      "file_id": "<file_id>",
      "relative_path": "Show/S01E01.mkv",
      "media_type": "tv",
      "document": { "file_id": "...", "module_type": "tv", "schema_version": 1, "parsed": { "title": "Show", "season": 1, "episode": 1 }, "ffprobe": { "...": "..." } },
      "schema_version": 1
    }
  ]
}
```
> `id` is the deterministic composite `itm_<libraryID>_<fileID>` (MVP substitute
> for the contracts §4 ULID; idempotent re-scan maps a file back to the same item).
> `document` is opaque bytes on the wire (`json.RawMessage`); timestamps are
> intentionally omitted (the document is the source of truth for item state).

## 3. Error model

Canonical body (arch §11.6), emitted by every error path:
```json
{ "error": { "code": "internal_error", "message": "...", "retryable": true } }
```
- Codes in use (MVP): `bad_request`, `unauthenticated`, `internal_error`.
- MVP mapping is deliberately simple: domain errors from `CreateLibrary`/`Scan`/
  `QueryItems` map to `500 internal_error retryable=true`. Richer 4xx semantics
  (e.g. duplicate-library → 409, not-found → 404) are deferred — the body shape is
  established now so they land additively later (reviewer deviation #5).

## 4. Configuration (environment)

Read in `cmd/mellifera/main.go` (`loadConfig`):

| Env var | Required | Default | Notes |
|---|---|---|---|
| `MELLIFERA_ADMIN_TOKEN` | **yes** | — | Server **refuses to start** on an empty token (exit 1). Gates all endpoints. |
| `MELLIFERA_DATA_DIR` | no | `./data` | SQLite file is `<data_dir>/mellifera.db`; created if absent. |
| `MELLIFERA_BASE_SCANNER` | no | `bin/base-scanner` | Filesystem path to the base-scanner binary (dev-mode plugin loading). |
| `MELLIFERA_LISTEN` | no | `127.0.0.1:8080` | HTTP listen address. Defaults to localhost only. |

Internal constants shared with the plugin subprocess (must match `base-scanner`):
magic-cookie pair `MELLIFERA_MAGIC_COOKIE` / `mellifera-plugin-v1`, core version
`0.1.0`, scanner service `mellifera.scanner.v1.Scanner`.

## 5. Build & run

```bash
# Build both binaries (pure-Go, no CGO) from one module.
make build          # -> CGO_ENABLED=0 go build ./... (server + all packages)
make build-plugin   # -> bin/base-scanner

# Or directly:
go build ./...
go build -o bin/base-scanner ./plugins/base-scanner
```

Run:
```bash
make build && make build-plugin
export MELLIFERA_ADMIN_TOKEN='change-me'
./mellifera          # serves 127.0.0.1:8080; loads bin/base-scanner; opens ./data/mellifera.db
```

Runtime dependency: **`ffprobe` must be on `PATH`** — it is the only external
runtime dependency. If absent, scans soft-fail: items are still identified but the
`ffprobe` field is empty and a per-file warning is recorded (AC-6).

## 6. Plugin model (operators)

- `base-scanner` runs as a **separate OS subprocess**, launched via
  `hashicorp/go-plugin` with a magic-cookie handshake. A plugin crash does **not**
  take down the server.
- Restart policy (arch §7.3): on unexpected subprocess exit the manager marks
  capabilities unavailable and exponential-backoff restarts (initial 1s, factor 2,
  cap 60s, jittered); after **3 consecutive failed restarts** the plugin is marked
  `failed` (no further attempts without intervention).
- Dev-mode loading: the binary is loaded from the filesystem path in
  `MELLIFERA_BASE_SCANNER`. `go:embed` first-run extraction is deferred to release
  packaging (D11/Q20).
- `base-scanner` serves both the `scanner.v1` capability service and the
  `plugin.v1` domain service (`Handshake`/`Health`/`Shutdown`) on one gRPC server.

## 7. Storage

- SQLite in WAL mode under `<data_dir>/mellifera.db`. All arch §9.1 tables are
  created on first run (idempotent migrations), including the reserved tables
  (`playback_progress`, `drafts`, `enrichment_failures`, `scan_jobs`).
- Re-scan is idempotent: `PutItem` upserts by `file_id` and preserves the item id
  and `created_at` on conflict.
- The dynamic-JSON document is stored opaque; only small generated-column paths
  are projected via `json_extract` at the SQLite layer (arch §9.2).

## 8. Security notes

- The admin token gates all endpoints. Put Mellifera behind a trusted boundary;
  the MVP token is a single shared secret, not per-user auth.
- The base-scanner path guard (`withinRoot`) rejects any path escaping the
  configured library root — checked pre- and post-symlink-resolve on every
  candidate (AC-4). `filepath.WalkDir` does not follow symlinks, so symlink
  escapes are dropped upstream of the guard. Point Mellifera only at directories
  you trust.
- `ffprobe` is invoked with an argument slice, never a shell (`os/exec`, no
  `sh -c`).

## 9. First scan walkthrough

```bash
# 1. Build.
make build && make build-plugin

# 2. Start the server (admin token required).
MELLIFERA_ADMIN_TOKEN=T ./mellifera &

# 3. Create a TV library.
curl -s -X POST http://127.0.0.1:8080/api/v1/libraries \
  -H 'Authorization: Bearer T' -H 'Content-Type: application/json' \
  -d '{"module_id":"tv","root_path":"<trusted-dir>","display_name":"TV"}'
# -> {"id":1,...}

# 4. Trigger a scan (blocks until complete).
curl -s -X POST http://127.0.0.1:8080/api/v1/libraries/1/scan \
  -H 'Authorization: Bearer T'
# -> {"library_id":1,"discovered":N,"persisted":M,"warnings":[...]}

# 5. List the discovered items.
curl -s 'http://127.0.0.1:8080/api/v1/items?library=1&limit=50' \
  -H 'Authorization: Bearer T'
# -> {"items":[{...,"document":{"parsed":{...},"ffprobe":{...}}}, ...]}
```

---

**Cross-references:** `docs/architecture.md` (§2 protos, §3.1 document model,
§7.3 restart, §9.1 schema, §11.5 Principal, §11.6 errors), `docs/ai-architecture.md`
(§3 pure-delegation, §4 module map), `docs/scan-library/contracts.md` (signature
contracts), `docs/scan-library/acceptance.md` (AC-1/AC-5/AC-6).
