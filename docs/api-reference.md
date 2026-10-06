# Mellifera API Reference

> Scope: the current HTTP edge of the single Go binary. Grounded in
> `internal/api/{router,handlers,middleware}.go`, `internal/web/{web,swagger}.go`,
> `internal/enrich/state.go`, and `cmd/mellifera/main.go`. Authoritative design:
> `docs/architecture.md` (§2 protos, §3.1 document model, §7.3 restart, §9.1
> schema, §11.5 Principal, §11.6 errors); behavioral requirements:
> `openspec/specs/` (scan-library, plugin-pipeline, async-enrichment,
> image-enrichment, web-ui). Operations (env knobs, build, plugins, async queue):
> [`operator-runbook.md`](operator-runbook.md).
>
> Consolidated 2026-10-06 from the per-feature references that shipped with
> scan-library → plugin-pipeline (Phase A) → async-enrichment (B1) → web-ui
> (Phase 1/2a); the per-feature records live in git history and
> `openspec/changes/archive/`.

## 1. Surfaces and authentication

| Surface | Auth | Serves data? |
|---|---|---|
| `/` (SPA shell) | **public** | no — static HTML/JS only |
| `/assets/*` (hashed JS/CSS) | **public** | no — static assets (`immutable`, 365d) |
| `/openapi.yaml`, `/openapi.json` | **public** | no — the API contract (no row data) |
| `/docs/` (Swagger UI, `swaggo/http-swagger`) | **public** | no — static UI (calls `/openapi.json`) |
| `/api/v1/*` (all data) | **role-gated** | yes — `Authorization: Bearer <token>` |

Every `/api/v1` route requires the admin bearer token. A missing, malformed, or
wrong token yields `401` with the canonical error body and the handler is never
invoked:

```json
{ "error": { "code": "unauthenticated", "message": "missing or invalid admin token", "retryable": false } }
```

A valid token resolves a `Principal{Role}` into the request context
(arch §11.5): a valid **admin** token → `RoleAdmin` (everything). `RoleClient`
exists and the read-only routes admit admin+client, but no resolver mints client
tokens yet (the D18 multi-user swap point). Handler groups
(`internal/api`): **browse** = admin+client read-only; **admin** = admin-only
mutating + liveness. Handlers never fork on `Role`.

## 2. Endpoints

All routes are mounted under `/api/v1` (`internal/api/router.go`). Handlers are
pure delegation: parse → call ONE domain function → write the response
(ai-arch §3).

### `POST /api/v1/libraries` — create a library

```json
{ "module_id": "tv", "root_path": "/media/TV", "display_name": "TV" }
```

- `module_id` names a module config row (the seeded `tv` and `image` modules
  exist at startup); `root_path` is the scan root; `display_name` is a label.
- Success: `201 Created` with the library. Errors: `400 bad_request`;
  `500 internal_error` (retryable).

### `POST /api/v1/libraries/{id}/scan` — trigger a scan (non-blocking)

- Success: `200 OK` with the scan result — returned as soon as discovery has
  **persisted every item at `status:"pending"`**. Enrichment is **not awaited**:
  the background worker pool drains it (see §4). Soft per-file probe failures do
  not abort the scan — they are aggregated into `warnings`. Hard failures
  (library/module/scanner unresolvable, stream error, cancelled context) return
  the error with a partial result.
- Observe progress by polling `GET /api/v1/items` with `?status=` (§4).

```json
{ "library_id": 1, "discovered": 12, "persisted": 11, "warnings": [] }
```

### `GET /api/v1/libraries` — list libraries

`200 OK` with `{"libraries":[{ "id":1, "module_id":"tv", "root_path":"/media/TV",
"display_name":"TV" }]}`.

### `GET /api/v1/items?library={id}&status=&limit=&offset=` — list/filter items

- `library` (required, integer), `limit` (default `50`, capped at `200`),
  `offset` (default `0`), `status` (optional lifecycle filter — §4; absent or
  empty ⇒ all; an unknown value matches no rows, it is not an error).
- `400 bad_request` on a non-integer `library`; `500 internal_error`
  (retryable). Each item:

```json
{
  "id": "itm_1_<file_id>",
  "module_id": "tv",
  "library_id": 1,
  "file_id": "<file_id>",
  "relative_path": "Show.Name.S01E02.1080p.mkv",
  "media_type": "tv",
  "document": { "file_id": "...", "module_type": "tv", "schema_version": 1,
                "parsed": { "title": "Show Name", "season": 1, "episode": 2 },
                "ffprobe": { "...": "..." },
                "sources": { "tv-parser": { "title": "Show Name", "season": 1, "episode": 2 } },
                "_provenance": { "title": { "plugin_id": "tv-parser", "confidence": 1.0 } },
                "_view": { "title": { "value": "Show Name", "source": "tv-parser" } },
                "_stages": [ { "stage": "metadata_source", "plugin_id": "tv-parser",
                               "status": "ok", "advanced_to": "ready" } ] },
  "schema_version": 1,
  "status": "ready"
}
```

> `id` is the deterministic composite `itm_<libraryID>_<fileID>` — idempotent
> re-scan maps a file back to the same item. `document` is opaque bytes on the
> wire (`json.RawMessage`); §5 explains its internal keys.

### `GET /api/v1/items/{id}` — fetch one item

`200 OK` with the same item shape as above; `404` with
`{"error":{"code":"not_found", ...  "retryable":false}}` when absent.

### `GET /api/v1/admin/status` — liveness snapshot (admin-only)

`200 OK` with a best-effort snapshot built in `cmd/mellifera` over
`plugin.Manager.Status` + `enrich.Queue.Stats`: per-plugin health plus the
enrich-queue counters (`pending`/`in_flight`/`done`/`failed`), RFC3339
timestamped at the edge. Returns `503` when the snapshot is unavailable. The
closure is the anti-corruption seam that keeps `internal/api` free of
plugin/enrich imports.

## 3. Error model

Canonical body on every error path (arch §11.6):

```json
{ "error": { "code": "internal_error", "message": "...", "retryable": true } }
```

Codes in use: `bad_request`, `unauthenticated`, `not_found`,
`internal_error` (domain errors map here, `retryable: true`).

## 4. Item lifecycle (`status`)

Statuses are owned by `internal/enrich/state.go`; the store holds the indexed
column and is value-agnostic. Full set:
`new, pending, parsed, enriched, ready, stale, failed, deleted`.

```
new      --begin----> pending        pending --parsed---> parsed
parsed   --begin----> pending        pending|parsed --enriched--> enriched
enriched --settled--> ready          * --stale-----> stale          (re-scan change)
stale    --rehydrate> pending        * --failed---> failed
failed   --retry----> pending        * --deleted---> deleted        (file gone on re-scan)
```

- **scan** writes: `pending` (first scan), `stale` (re-scan whose
  `parsed`+`ffprobe` base identity changed), or preserves the prior status
  (unchanged re-scan never regresses a `ready`/`enriched` item).
- **worker** writes: `pending → parsed → enriched → ready`; `→ failed` only on
  a cancelled context; `failed → pending` on the next derive pass (retry).
- **Composition**: `enriched` requires ≥1 source succeeded ∧ 0 failed;
  `ready` requires **all queueable sources terminal** (namespace written, in
  ledger cooldown, or ran-but-unavailable).

Verify the live set: `sqlite3 ./data/mellifera.db "SELECT DISTINCT status FROM items ORDER BY status"`.

## 5. The item document (sources / provenance / view / stages)

The `document` is opaque dynamic JSON (arch §3.1) — the store only projects
small generated-column paths. Internal keys:

| Key | Meaning |
|---|---|
| `parsed` | base identity from identification (title/season/episode, `absolute_path`, image base dims, …) |
| `ffprobe` | the verbatim probe blob (video) |
| `sources.<plugin_id>` | lossless per-source namespace (D3) — e.g. `tv-parser`, `image-enricher`; plugins write ONLY here |
| `_provenance.<field_path>` | per-field source audit `{plugin_id, plugin_version, fetched_at, confidence, source_url?}` |
| `_view.<field>` | recomputable view `{value, source}`; the generated column projects `$._view.title.value`. Last-writer today (B3 adds arbitration) |
| `_stages[]` | per-stage progress: `{stage:"metadata_source", plugin_id, status: ok\|failed\|unavailable\|skipped, advanced_to, started_at, finished_at, error?}` |

Core stamps `_provenance`/`_view`/`_stages`; namespace isolation rejects and
reverts any foreign write (arch §3.2/§3.3). Read one field's provenance:

```bash
sqlite3 ./data/mellifera.db \
  "SELECT json_extract(document,'\$._provenance.title.plugin_id') FROM items WHERE id='itm_1_<file_id>'"
```

---

**Cross-references:** `docs/architecture.md` (authoritative design) ·
`docs/ai-architecture.md` (§3 pure-delegation, §4 module map) ·
`openspec/specs/` (behavioral requirements per capability) ·
[`operator-runbook.md`](operator-runbook.md) (env knobs, build/run, plugins,
async queue, web delivery, troubleshooting).
