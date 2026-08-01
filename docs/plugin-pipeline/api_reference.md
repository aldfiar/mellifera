# Mellifera API Reference + Operator Runbook — `plugin-pipeline` Phase A

> Scope: the **additive API + operator surface** layered on by the
> `plugin-pipeline` Phase A feature. Every detail below is grounded in the
> implemented code — the `?status=` filter and `status` response field mirror
> `internal/api/handlers.go`; the lifecycle set mirrors `internal/enrich/state.go`;
> the env vars + plugin model mirror `cmd/mellifera/main.go`. The base endpoint
> shapes, auth, error model, and base item DTO are documented in
> [`docs/scan-library/api_reference.md`](../scan-library/api_reference.md) — this
> file documents the Phase A **delta** and the enrichment-pipeline operator
> runbook. State-set/state-machine source of truth: `acceptance.md` AC-7.

## 0. Relationship to the base reference

Phase A is **additive** (AC-3): no existing route, request field, or response
field changed shape. Auth (single admin bearer token), the canonical error body,
and the pure-delegation handler model are unchanged — see
[`docs/scan-library/api_reference.md`](../scan-library/api_reference.md) §1–§3.
The two Phase A API changes are:

1. an optional `?status=` query filter on `GET /api/v1/items`; and
2. an additive `status` string field on every item in the response.

## 1. `GET /api/v1/items` — list/filter items (Phase A delta)

Same path, auth, and pagination as the base (`?library={id}&limit=&offset=`),
documented in the base reference §2. Phase A adds:

- **`status`** (query, **optional**) — filter items by lifecycle state. Values
  are the lowercase strings from `internal/enrich/state.go`:
  `{new, pending, parsed, enriched, failed, deleted}`. **Absent or empty ⇒ all
  statuses** (the handler passes `""` straight through to `store.QueryItems`).
  The API does **not** validate the status set against the legal values — an
  unknown value simply matches no rows (returns an empty list), so the store
  stays the sole authority on legal states.
- **`status`** (response field, **additive**) — every item in `items[]` now
  carries its current lifecycle state. Existing clients that ignore unknown
  fields are unaffected.

The full call is still **one domain function**: `listItems` parses
`{id}` + optional `?status=` + pagination → `store.QueryItems(ctx, id, status,
limit, offset)` → write `itemsResponse` (pure delegation, ai-arch §3).

### Examples

List all items for a library (response now includes `status`):
```bash
curl -s 'http://127.0.0.1:8080/api/v1/items?library=1&limit=50' \
  -H 'Authorization: Bearer T'
```
```json
{
  "items": [
    {
      "id": "itm_1_<file_id>",
      "module_id": "tv",
      "library_id": 1,
      "file_id": "<file_id>",
      "relative_path": "Show.Name.S01E02.1080p.mkv",
      "media_type": "tv",
      "document": { "file_id": "...", "module_type": "tv", "schema_version": 1, "sources": { "tv-parser": { "title": "Show Name", "season": 1, "episode": 2 } }, "_provenance": { "title": { "plugin_id": "tv-parser", "confidence": 1.0 } }, "_view": { "title": { "value": "Show Name", "source": "tv-parser" } }, "_stages": [ { "stage": "metadata_source", "plugin_id": "tv-parser", "status": "ok", "advanced_to": "enriched" } ], "ffprobe": { "...": "..." } },
      "schema_version": 1,
      "status": "enriched"
    }
  ]
}
```

Filter to only fully-enriched items:
```bash
curl -s 'http://127.0.0.1:8080/api/v1/items?library=1&status=enriched' \
  -H 'Authorization: Bearer T'
# -> only items whose status == "enriched"
```

Find items that hard-failed enrichment:
```bash
curl -s 'http://127.0.0.1:8080/api/v1/items?library=1&status=failed' \
  -H 'Authorization: Bearer T'
# -> only items whose status == "failed" (inspect document._stages[].error for the cause)
```

> Errors are unchanged from the base reference: `400 bad_request` (non-integer
> `library`); `500 internal_error` (retryable). An unknown `?status=` value is
> not an error — it yields an empty list.

## 2. Lifecycle state (`status`)

Every persisted item has an indexed `status` in
`{new, pending, parsed, enriched, failed, deleted}` — core-managed (like
`file_id`/`created_at`), media-type-agnostic pipeline-stage names. The
orchestrator (`internal/enrich` + `internal/scan`) advances state per stage via a
**pure transition function** (`internal/enrich/state.go`); the store owns the
column. Illegal transitions are rejected by the transition function.

```
                 (re-scan: file changed → forward, Phase B)
   new ─► pending ─► parsed ─► pending ─► enriched
     │      │         │          │           │
     │      └─────────┴──────────┴───────────┴─► failed   (hard error; → pending on retry)
     └──────────────────────────────────────────► deleted (soft-delete; file gone on re-scan)
```

| State | Meaning |
|---|---|
| `new` | discovered + base-identified, first record written, awaiting enrichment |
| `pending` | a pipeline stage is in-flight (persisted so a crash knows where to resume) |
| `parsed` | parser-class sources ran (tv-parser wrote its namespace) |
| `enriched` | all configured enrichment sources ran (soft-fails recorded); **terminal-success for Phase A** |
| `failed` | a stage hard-failed (carries `last_error`); `failed → pending` on retry |
| `deleted` | soft-delete: file no longer present on re-scan (data retained — deprecate-don't-delete) |

**Composition** (accepted deviation #2): `enriched` requires ≥1 source succeeded
∧ 0 failed; a partial run (some sources failed) stays at the furthest-valid state
(e.g. `parsed` if only the parser ran) — one bad source never aborts the item
(AC-6 soft-fail). Verify the live set:
```bash
sqlite3 ./data/mellifera.db "SELECT DISTINCT status FROM items ORDER BY status"
# -> rows ⊆ {new,pending,parsed,enriched,failed,deleted}
```

> Phase B (surfaced, **not built**) adds `ready` (external/async enrichment
> settled) and `stale` (re-scan detected change → `pending`).

## 3. The enrichment document (provenance + view + stages)

The `document` field is opaque bytes on the wire (`json.RawMessage`). Phase A
extends it (arch §3.1) — the per-source data is lossless and every field is
tagged with where it came from:

| Key | Meaning |
|---|---|
| `sources.<plugin_id>` | lossless per-source namespace (D3, arch §0 #4). tv-parser writes `sources["tv-parser"]`. |
| `_provenance.<field_path>` | per-FIELD source audit: `{plugin_id, plugin_version, fetched_at, confidence, source_url?}` (`common.v1.Provenance`). |
| `_view.<field>` | recomputable view `{value, source}`; the existing generated column projects `$._view.title.value`. **Phase-A last-writer** (Phase B adds arbitration). |
| `_stages[]` | per-STAGE progress: `{stage:"metadata_source", plugin_id, status, advanced_to, started_at, finished_at, error?}`. (The contract example `"stage":"parse"` was illustrative; the implemented value is `"metadata_source"`.) |

The plugin sees only an **empty** document and writes its `sources.<id>` namespace
(namespace isolation enforced — a foreign write is rejected+reverted; arch §3.2 L2,
§3.3); the core stamps `_provenance`/`_view`/`_stages` and preserves the verbatim
ffprobe/base document.

**Read provenance** for one field:
```bash
sqlite3 ./data/mellifera.db \
  "SELECT json_extract(document,'\$._provenance.title.plugin_id') FROM items WHERE id='itm_1_<file_id>'"
# -> tv-parser
```

## 4. Configuration (environment) — Phase A additions

Read in `cmd/mellifera/main.go`; all base env vars (`MELLIFERA_ADMIN_TOKEN`,
`MELLIFERA_DATA_DIR`, `MELLIFERA_BASE_SCANNER`, `MELLIFERA_LISTEN`) from the base
reference §4 still apply. Phase A adds one:

| Env var | Required | Default | Notes |
|---|---|---|---|
| `MELLIFERA_TV_PARSER` | no | `bin/tv-parser` | Filesystem path to the tv-parser binary (dev-mode plugin loading, like base-scanner). |

Internal constants shared with **both** plugin subprocesses (must match
base-scanner AND tv-parser): magic-cookie pair `MELLIFERA_MAGIC_COOKIE` /
`mellifera-plugin-v1`, core version `0.1.0`; capability services
`mellifera.scanner.v1.Scanner` (base-scanner) and
`mellifera.metadata.v1.MetadataSource` (tv-parser).

## 5. Build & run (Phase A)

```bash
# Build the server + every plugin binary (pure-Go, no CGO) from one module.
make build          # -> go build ./... (server + all packages)
make build-plugin   # -> bin/base-scanner AND bin/tv-parser

# Or directly:
go build ./...
go build -o bin/base-scanner ./plugins/base-scanner
go build -o bin/tv-parser     ./plugins/tv-parser
```

Run (the server now loads **both** plugins and constructs `enrich.Deps`; a scan
runs discovery → enrichment → persist, and still **blocks** until complete — no
async queue until Phase B):
```bash
make build && make build-plugin
export MELLIFERA_ADMIN_TOKEN='change-me'
./mellifera   # serves 127.0.0.1:8080; loads bin/base-scanner + bin/tv-parser; opens ./data/mellifera.db
```

Runtime dependencies are unchanged: **`ffprobe` must be on `PATH`** (the only
external runtime dependency; if absent, scans soft-fail with a per-file warning —
AC-6). tv-parser is a pure-Go filename parser with no external runtime dependency.

## 6. Plugin model — the `metadata_source` capability (operators)

Phase A introduces the **second capability type** alongside `scanner`:

- `base-scanner` — `scanner.v1` (Scan/Identify): filesystem walk + ffprobe; now
  **media-type-agnostic** (TV parsing removed; emits only base fields).
- `tv-parser` — `metadata.v1` `MetadataSource` (Match→BuildRequest→Convert→Merge):
  the first `metadata_source` plugin; houses `parseTV` (moved verbatim from
  base-scanner) and serves `metadata.v1.MetadataSource` **and** `plugin.v1`
  (Handshake/Health/Shutdown) on one shared gRPC server.

Both run as **separate OS subprocesses** via `hashicorp/go-plugin` with the
magic-cookie handshake — a plugin crash never takes down the server (the base
reference §6 restart policy — exponential backoff, 3 strikes → `failed` — applies
to both). Plugin launch is now **capability-driven**: each plugin declares its
`[]sdk.Capability` and the manager builds the client set from that (base-scanner's
set is byte-identical to scan-library's — AC-3). Plugin selection is driven
strictly by `module.MetadataSources[]` (config), never by media-type branching.

Dev-mode loading: both binaries are loaded from their filesystem paths
(`MELLIFERA_BASE_SCANNER` / `MELLIFERA_TV_PARSER`). `go:embed` first-run
extraction remains deferred (D11/Q20).

---

**Cross-references:** [`docs/scan-library/api_reference.md`](../scan-library/api_reference.md)
(base endpoints/auth/errors), `docs/architecture.md` (§2 protos, §3.1 document
model, §3.2/§3.3 namespace + provenance, §7.3 restart), `docs/ai-architecture.md`
(§3 pure-delegation, §4 module map), [`docs/project_structure.md`](../project_structure.md)
(Phase A module map + lifecycle summary), `acceptance.md` (AC-1/AC-3/AC-5/AC-6/AC-7),
`contracts.md` (signature contracts + document schema).
