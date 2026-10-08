# Mellifera Operator + Dev Runbook

> Audience: **operators** (build, run, configure, troubleshoot) and **UI/API
> devs** (regenerating the embedded artifacts). The HTTP contract itself lives
> in [`api-reference.md`](api-reference.md). Consolidated 2026-10-06 from the
> per-feature runbooks (web-ui Phase 1/2a, image-enrichment B2,
> async-enrichment B1) — those records live in git history and
> `openspec/changes/archive/`.

## 1. Build & run

Mellifera is a **single static Go binary** (pure Go, `CGO_ENABLED=0`) plus its
plugin subprocess binaries. The Go build gate (`make build` / `make check` /
`make lint` / `make test`) **never invokes `node`, `npm`, or `swag`** — it
embeds the **committed** artifacts (`internal/web/dist/*`,
`internal/web/api/openapi.{yaml,json}`). On a node-less host:
`make build && make check` exits 0.

```bash
make build          # server + all packages (CGO_ENABLED=0)
make build-plugin   # bin/{base-scanner,serial-scanner,tv-parser,image-enricher,serial-parser,frame-grabber}
make web-build      # dev/CI only — regenerates the embedded web artifacts (§6)

export MELLIFERA_ADMIN_TOKEN='change-me'
./mellifera         # serves 127.0.0.1:8080; loads the bin/ plugins; opens ./data/mellifera.db
```

### Runtime dependencies (needed on PATH at serve time)

| Tool | Used by | Missing ⇒ |
|---|---|---|
| `ffmpeg` / `ffprobe` | base-scanner (video probe) | per-file soft-fail: empty probe blob + warning; scan succeeds |
| `exiftool` | image-enricher (EXIF) | per-source soft-fail: empty namespace → `no_data` cooldown; scan succeeds |
| `ffmpeg` | frame-grabber (episode thumbnails, serial module) | OPTIONAL: per-source soft-fail: empty namespace → `no_data` cooldown; episodes still settle `ready` |

exiftool install: macOS `brew install exiftool` · Debian/Ubuntu
`apt install libimage-exiftool-perl` · Fedora/RHEL `dnf install perl-Image-ExifTool`
· Arch `pacman -S perl-image-exiftool`. Verify with `exiftool -ver` (no minimum
version pinned). Both tools are invoked via `os/exec` with an explicit argument
slice — **never a shell**.

### Dev-only deps (NEVER required by the Go gate)

`node`/`npm` (SPA build), `swag` CLI (OpenAPI regen), `golangci-lint` (v1.64.8),
`buf`/`protoc` (proto regen). Install on dev/CI hosts only.

## 2. Configuration (environment)

Read in `cmd/mellifera/main.go`. Only `MELLIFERA_ADMIN_TOKEN` is fail-fast;
every other malformed/missing value falls back to its default with a warning
(startup never aborts on them).

| Env var | Default | Effect |
|---|---|---|
| `MELLIFERA_ADMIN_TOKEN` | (none — **required**) | Fail-fast if empty; a valid token resolves `RoleAdmin`. |
| `MELLIFERA_LISTEN` | `127.0.0.1:8080` | Bind address (localhost-only by default). |
| `MELLIFERA_DATA_DIR` | `./data` | SQLite file `<data_dir>/mellifera.db` (WAL). |
| `MELLIFERA_WEB_DEV` | `false` | `true` ⇒ `Cache-Control: no-cache` everywhere (use alongside the Vite dev proxy, §6). |
| `MELLIFERA_BASE_SCANNER` | `bin/base-scanner` | Plugin binary path (dev-mode loading). |
| `MELLIFERA_TV_PARSER` | `bin/tv-parser` | Plugin binary path. |
| `MELLIFERA_IMAGE_ENRICHER` | `bin/image-enricher` | Plugin binary path. |
| `MELLIFERA_SERIAL_SCANNER` | `bin/serial-scanner` | Plugin binary path. |
| `MELLIFERA_SERIAL_PARSER` | `bin/serial-parser` | Plugin binary path. |
| `MELLIFERA_FRAME_GRABBER` | `bin/frame-grabber` | Plugin binary path (needs `ffmpeg` at runtime). |
| `MELLIFERA_ENRICH_WORKERS` | `4` | Async worker-pool size (§5). |
| `MELLIFERA_ENRICH_MAX_ATTEMPTS` | `3` | In-memory retries per source before terminal `exhausted`. |
| `MELLIFERA_ENRICH_LEASE_TTL` | `60s` | Per-item in-memory lease lifetime (lazy expiry). |
| `MELLIFERA_ENRICH_BACKOFF` | `2s` | Initial exponential-backoff step. |
| `MELLIFERA_ENRICH_EXHAUSTED_COOL` | `7d` | `exhausted` cooldown — **doubling** per round, capped at `COOL_CAP`. |
| `MELLIFERA_ENRICH_NODATA_COOL` | `30d` | `no_data` cooldown — flat. |
| `MELLIFERA_ENRICH_COOL_CAP` | `365d` | Cap on the `exhausted` doubling schedule. |

Durations use `time.ParseDuration` syntax (`30s`, `2m`; `7d` is **invalid** —
write `168h`). All plugins share the magic-cookie pair
`MELLIFERA_MAGIC_COOKIE` / `mellifera-plugin-v1`.

## 3. Deployment posture (public surface)

The public surface is **static-only** — the SPA shell, the OpenAPI contract,
and Swagger UI carry **no data**; all data stays behind role-gated
`/api/v1/*` (see [`api-reference.md`](api-reference.md) §1).

- The default bind is `127.0.0.1:8080` — already private for a single-user box.
- If you expose it publicly, do so behind a reverse proxy that authenticates
  `/api/*` (or relies on the server's own role-gating) and treats
  `/`, `/assets/*`, `/openapi.*`, `/docs` as public static. Caching at the edge
  is fine — `/assets/*` is immutable; `/` and `/openapi.*` are `no-cache`.
- Never put `/` or `/docs` behind the auth middleware — the SPA shell and the
  contract must load before any token.
- Point Mellifera only at directories you trust: the scanner's `withinRoot`
  guard rejects any path escaping a library root (pre- and post-symlink-resolve;
  `filepath.WalkDir` does not follow symlinks).

## 4. Plugins

Three subprocess binaries ship (all pure Go, built by `make build-plugin`):

| Binary | Capability | Service |
|---|---|---|
| `bin/base-scanner` | `scanner` | `mellifera.scanner.v1.Scanner` (Scan stream + Identify) |
| `bin/tv-parser` | `metadata_source` | `mellifera.metadata.v1.MetadataSource` (Match→BuildRequest→Convert→Merge) |
| `bin/image-enricher` | `metadata_source` | `mellifera.metadata.v1.MetadataSource` (EXIF via system exiftool) |

- Launched via `hashicorp/go-plugin` with the magic-cookie handshake; a plugin
  crash never takes down the server. Restart policy (arch §7.3): exponential
  backoff (initial 1s, factor 2, cap 60s, jittered); after **3 consecutive
  failed restarts** the plugin is marked `failed` (no further attempts).
- Launch is **capability-driven**: each plugin declares `[]sdk.Capability` and
  the manager builds the client set from that; plugin selection per module comes
  from module config (`internal/module/registry.go` — seeded `tv` and `image`
  modules), never media-type branching.
- The plugin **process** is mandatory at startup (a missing binary aborts
  startup); the external tools it shells out to (ffprobe, exiftool) are
  optional at runtime (soft-fail). Override binary paths with the
  `MELLIFERA_BASE_SCANNER` / `MELLIFERA_TV_PARSER` / `MELLIFERA_IMAGE_ENRICHER`
  env vars.
- Image discovery is module-type-gated: a `module_type == "image"` library
  discovers exactly `.jpg .jpeg .png .webp .heic .heif` (stdlib base dims for
  jpeg/png only — webp/heic get their dims from exiftool at enrichment).
  RAW extensions (`.cr2 .nef .arw .dng`) are deferred — see
  [`backlog.md`](backlog.md).

## 5. The async enrichment queue (operations)

`POST /scan` returns once items are persisted `pending`; the process-lifetime
worker pool drains enrichment in the background. There is **no queue table** —
pending `(item, plugin)` work is derived from `items` + document namespaces +
the `enrichment_failures` ledger. A source is queueable iff
`AuthMode != "CLIENT"` (the seeded `kinopoisk` is CLIENT-mode and excluded;
`tmdb` is SERVER-seeded but not loaded — it records `unavailable` `_stages`
and items still settle). Poll `GET /api/v1/items?status=ready` until settled.

- **Failures**: a source that exhausts retries writes ledger status `exhausted`
  (doubling cooldown); a clean-but-empty run writes `no_data` (flat cooldown).
  Derivation skips pairs in cooldown; elapsed cooldowns re-derive automatically;
  a success clears the ledger row. Inspect the ledger (no admin HTTP route yet):

  ```bash
  sqlite3 "$MELLIFERA_DATA_DIR/mellifera.db" \
    "SELECT item_id, plugin_id, status, attempts, next_eligible_at FROM enrichment_failures;"
  ```

- **Restart & resume**: pending work is durable (items status + namespaces +
  ledger), so a restart re-derives and drains it. Leases are in-memory and
  vanish on restart (single-instance MVP). Shutdown order: stop accepting HTTP →
  `enrichQueue.Stop()` (drains the channel, waits for workers) → stop plugin
  subprocesses → `store.Close`.
- **Write safety**: a pool-wide 5s `busy_timeout` in `store.Open`'s DSN
  serializes cross-writer SQLite contention.

## 6. Web delivery + the dev workflow

The SPA is a React 18 app in `web/` (Vite 5, TS strict, TanStack Query,
Tailwind) built into `internal/web/dist/` and embedded via `//go:embed` — there
is no separate web server at serve time. Cache headers: `/assets/*` immutable
(365d, Vite-hashed filenames); `/` and `/openapi.*` `no-cache`; set
`MELLIFERA_WEB_DEV=true` when running against the Vite dev proxy so hot-reload
is not masked.

**Dev proxy**: `vite.config.ts` forwards `/api`, `/openapi.*`, `/docs` →
`http://127.0.0.1:8080` (same origin, no CORS). Run both:

```bash
MELLIFERA_ADMIN_TOKEN=dev-token MELLIFERA_WEB_DEV=true go run ./cmd/mellifera
cd web && npm ci && npm run dev      # Vite on :5173
```

**Regenerating the embedded artifacts** — the only node/swag-touching step:

```bash
make web-build
# internals: swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml
#           + cd web && npm ci && npm run build   (outDir ../internal/web/dist)
```

- Run it after editing a handler DTO / swag annotation in `internal/api`, or
  after editing the React app — then **commit** the regenerated
  `internal/web/api/openapi.{json,yaml}` and `internal/web/dist/`. Hand-editing
  the OpenAPI spec is forbidden (it drifts).
- **Known issue**: the `swag init` step currently fails to parse a
  `json.RawMessage` DTO field, so `make web-build` errors on hosts until that is
  fixed; the working regen path is the direct `cd web && npm ci && npm run
  build` (the committed `openapi.{json,yaml}` stay valid). The swag-annotation
  drift on `GET /items` (`library` marked optional but is required) is tracked
  for the next Go-touching change.

## 7. Verification probes

Against a running server (`MELLIFERA_ADMIN_TOKEN=t`), with `curl` + `jq`:

```bash
# public surface is unauthenticated static
curl -sI localhost:8080/ | grep -i cache-control                      # → no-cache
curl -sI localhost:8080/assets/app.js | grep -i cache-control         # → immutable (real builds: hashed asset name)

# the served OpenAPI spec carries the endpoints
curl -s localhost:8080/openapi.yaml | grep -cE '(/libraries|/items|/admin/status)'   # → ≥6

# data is token-gated: no token → 401
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/api/v1/admin/status          # → 401

# valid admin token → 200 + plugin health + enrich snapshot
curl -s -H "Authorization: Bearer t" localhost:8080/api/v1/admin/status | jq '{plugins, enrich}'

# first scan walkthrough: create → scan (non-blocking) → poll to settled
curl -s -X POST localhost:8080/api/v1/libraries -H 'Authorization: Bearer t' \
  -H 'Content-Type: application/json' \
  -d '{"module_id":"tv","root_path":"<trusted-dir>","display_name":"TV"}'
curl -s -X POST localhost:8080/api/v1/libraries/1/scan -H 'Authorization: Bearer t'
curl -s -H 'Authorization: Bearer t' 'localhost:8080/api/v1/items?library=1&status=ready'

# node-free Go gate
make build && make check    # → exit 0, no node/npm/swag invoked
```

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Scan 200 but image items carry no EXIF (`sources.image-enricher` absent) | `exiftool` not on PATH → soft-fail (§1). Install it; re-scan or wait out the 30-day `no_data` cooldown (`MELLIFERA_ENRICH_NODATA_COOL`). |
| Server won't start: plugin binary not found | Run `make build-plugin`, or point the `MELLIFERA_*` env var at the binary (§4). |
| Items stuck at `pending` | Check `GET /api/v1/admin/status` enrich counters and the failure ledger (§5); a source may be exhausting retries or in cooldown. |
| webp/heic have no dimensions before enrichment | Expected — stdlib has no decoder; exiftool supplies dims at enrichment (§4). |
| Startup aborts with an admin-token error | `MELLIFERA_ADMIN_TOKEN` is empty — the only fail-fast knob (§2). |
| Item hard-`failed` | Only a cancelled context hard-fails; the next derive pass retries it (`failed → pending`). Inspect `document._stages[].error` for the cause. |

---

**Cross-references:** [`api-reference.md`](api-reference.md) (HTTP contract) ·
`docs/architecture.md` + `docs/open-questions.md` (authoritative design,
decisions Q6/Q29-D21 ffprobe/exiftool posture) · `openspec/specs/` (behavioral
requirements) · [`backlog.md`](backlog.md) (deferred work).
