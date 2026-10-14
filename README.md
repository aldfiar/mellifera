# Mellifera

A self-hostable media server shipped as a **single static Go binary**, with
crash-isolated metadata plugins as gRPC subprocesses.

## What is Mellifera

Mellifera is a modular, plugin-based media server (Jellyfin/Plex class in
scope, deliberately not a clone). Its differentiator is **subprocess plugin
isolation**: every scanner and metadata plugin runs as a separate
`hashicorp/go-plugin` gRPC subprocess, so a plugin crash never takes down the
server, and the plugin contract is open to any gRPC-capable language. The
server launches the plugin binaries from disk (`bin/` by default, paths
overridable per plugin); embedding them into the single file is a planned
release-packaging step, not the current shape.

Three design commitments shape everything:

- **The core is an orchestrator, never a domain engine.** It knows capability
  *types* (gRPC service interfaces), never specific media types or plugin
  names. The strings `"movie"`, `"tv"`, `"tmdb"` appear in config, not in
  core code.
- **Media are dynamic JSON documents, not typed DTOs.** Each plugin writes
  into its own namespaced subtree of the item document (`sources.<plugin_id>`),
  with per-field provenance and a recomputable view — no source's data is ever
  destroyed by another source's merge.
- **Russian-language data is first-class.** Serial parsing handles
  Cyrillic titles and Russian episode layouts natively, and enrichment
  targets Russian-language databases (shikimori.io ships; more are planned).

Storage is embedded SQLite (pure Go, no CGO) with JSON columns. The only
external runtime dependencies are `ffmpeg`/`ffprobe` and `exiftool`, invoked
via `os/exec` — and every use of them soft-fails per item, so a missing tool
degrades enrichment but never blocks a scan.

## Features

- **Library scanning** — register trusted directory roots; a scan walks the
  tree, probes video with `ffprobe`, and persists items without blocking
  (enrichment continues in the background). Path-traversal guard on every
  discovered path.
- **Async enrichment pipeline** — a background worker pool drains
  `(item, plugin)` work with per-item leases, retries with backoff, and a
  failure ledger with cooldowns; pending work survives restarts. Every plugin
  runs the same four-RPC chain (Match → BuildRequest → Convert → Merge) and
  may write only its own namespace.
- **Serial libraries** — episodic box-sets as a first-class library type:
  series/episode structure from directory layout, subtitle/voiceover/soundtrack
  sidecar association, episode thumbnails via ffmpeg, and a season/episode
  grammar that reads SxxExx, "N серия", roman numerals, and release-tag noise.
- **Shikimori enrichment** — anonymous anime metadata (titles, posters,
  descriptions) from shikimori.io for anime films and series, with a
  named User-Agent and id-anchored re-matching.
- **Photo libraries** — image discovery gated by library type, with EXIF
  (dimensions, camera, date taken, GPS) extracted via the system `exiftool`.
- **Release-name parsing** — a neutral, role-keyed release-tag vocabulary
  (bracket segments, quality/source/codec tags, release-group shapes) that
  cleans noisy filenames into structured facts. No resource brand appears in
  any identifier.
- **Parser display** — attach parsers to individual items or whole libraries;
  the item page renders each parser's facts in chain order, with identity
  fields declared per module in config (the core never branches on them).
- **Server-composed display naming** — every list and detail response carries
  a `display_name` composed server-side (title override → template-composed
  name → best source title), with per-library naming options that re-compose
  on the next read — no rescan required.
- **Packaged playback** — remux-only video playback with no transcoding
  anywhere: on play, items are packaged to fMP4-HLS (`ffmpeg -c copy`,
  head-first so playback starts immediately), served over a short-lived
  HMAC-token-gated `/media` surface, with originals always available as the
  direct floor. A watched-artifact budget (default 32 GB) evicts old builds.
- **Playback progress** — resume positions per item, with Continue and
  Next-up rails on the home page.
- **Media serving** — originals and thumbnails served straight from the
  stored document paths, with strong ETags, 304s, and `Range` support.
- **Web UI** — an embedded React SPA (no separate web server at serve time):
  token login, browse/detail pages with a dark/light theme, technical metadata
  disclosure, photo masonry + slideshow, an HLS player, and an admin panel
  (libraries, scans, plugin health, enrich-queue stats).

For the precise vocabulary — **Collection**, **Subcollection**, **Element** —
see [GLOSSARY.md](GLOSSARY.md).

## Requirements

**To build:** Go 1.25 (the build gate is node-free: `make build` /
`make check` / `make test` never invoke `node`, `npm`, or `swag`).

**At runtime** (on `PATH` at serve time; all soft-fail per item):

| Tool | Used by | Missing ⇒ |
|---|---|---|
| `ffmpeg` / `ffprobe` | video probing, episode thumbnails, playback packaging | empty probe blob / no thumbnail / no HLS pack; scans still succeed |
| `exiftool` | photo EXIF enrichment | empty EXIF namespace; scans still succeed |

Install exiftool with `brew install exiftool` (macOS) or
`apt install libimage-exiftool-perl` (Debian/Ubuntu).

**Development only:** `node`/`npm` (SPA build), `swag` (OpenAPI regen),
`golangci-lint`, `protoc`/`buf` (proto regen) — none are Go module deps.

## Quickstart (from source)

```bash
make build          # server + all packages (CGO_ENABLED=0)
make build-plugin   # the seven plugin binaries into bin/
export MELLIFERA_ADMIN_TOKEN='change-me'
./mellifera         # serves 127.0.0.1:8080; loads the bin/ plugins; opens ./data/mellifera.db
```

Then open http://127.0.0.1:8080, enter the admin token, and add a library
under Admin → Libraries. `MELLIFERA_ADMIN_TOKEN` is the only fail-fast
environment variable — every other malformed or missing value falls back to
its default with a warning.

## Quickstart (Docker)

A prebuilt multi-arch image (`linux/amd64` + `linux/arm64`, ffmpeg/exiftool
included) is published by CI on every push to `main`:

```bash
docker pull ghcr.io/aldfiar/mellifera:main
```

With [compose](compose.yaml) (recommended):

```bash
cp .env.example .env            # set MELLIFERA_ADMIN_TOKEN (+ MELLIFERA_MEDIA_SECRET)
# edit the media root in compose.yaml if yours is not /srv/media
docker compose up -d --build
```

Or raw `docker run`:

```bash
docker build -t mellifera .
docker run -d --name mellifera -p 8080:8080 \
  -v mellifera-data:/app/data \
  -v /path/to/media:/media:ro \
  -e MELLIFERA_ADMIN_TOKEN=change-me \
  mellifera
```

The image builds the SPA, compiles the server plus all seven plugins, and
includes `ffmpeg`, `ffprobe`, and `exiftool` — fully capable out of the box.
It sets `MELLIFERA_LISTEN=0.0.0.0:8080` internally and declares `/app/data`
as a volume (SQLite DB, thumbnails, playback artifacts). Add libraries using
the **container-side** path (`/media/...`), not the host path.

## Configuration

Environment variables (read in `cmd/mellifera/main.go`). Only
`MELLIFERA_ADMIN_TOKEN` is fail-fast; everything else falls back to its
default with a warning.

| Env var | Default | Effect |
|---|---|---|
| `MELLIFERA_ADMIN_TOKEN` | (none — **required**) | Fail-fast if empty; a valid token resolves the admin role. |
| `MELLIFERA_LISTEN` | `127.0.0.1:8080` | Bind address (localhost-only by default). |
| `MELLIFERA_DATA_DIR` | `./data` | SQLite file `<data_dir>/mellifera.db` (WAL); also holds thumbnails and playback artifacts. |
| `MELLIFERA_MEDIA_SECRET` | random 32-byte secret | Hex secret for the playback media token. A random fallback is generated when unset; a malformed hex value is fatal. Set it explicitly if media tokens must survive a restart across processes. |
| `MELLIFERA_ORCH_BUDGET_GB` | `32` | Watched-artifact budget in GB for packaged playback (`0` = off); least-recently-watched builds are evicted past it. |
| `MELLIFERA_BASE_SCANNER` | `bin/base-scanner` | Plugin binary path. |
| `MELLIFERA_SERIAL_SCANNER` | `bin/serial-scanner` | Plugin binary path. |
| `MELLIFERA_TV_PARSER` | `bin/tv-parser` | Plugin binary path. |
| `MELLIFERA_IMAGE_ENRICHER` | `bin/image-enricher` | Plugin binary path. |
| `MELLIFERA_SERIAL_PARSER` | `bin/serial-parser` | Plugin binary path. |
| `MELLIFERA_FRAME_GRABBER` | `bin/frame-grabber` | Plugin binary path (needs `ffmpeg` at runtime). |
| `MELLIFERA_SHIKIMORI` | `bin/shikimori` | Plugin binary path (needs outbound HTTPS). |
| `MELLIFERA_ENRICH_WORKERS` | `4` | Async enrichment worker-pool size. |

Further enrichment tuning knobs (`MELLIFERA_ENRICH_MAX_ATTEMPTS`,
`MELLIFERA_ENRICH_LEASE_TTL`, `MELLIFERA_ENRICH_BACKOFF`,
`MELLIFERA_ENRICH_EXHAUSTED_COOL`, `MELLIFERA_ENRICH_NODATA_COOL`,
`MELLIFERA_ENRICH_COOL_CAP`) and the dev-mode `MELLIFERA_WEB_DEV` are
documented in the [operator runbook](docs/operator-runbook.md), along with
deployment posture and troubleshooting. All plugins share the
`hashicorp/go-plugin` handshake via the `MELLIFERA_MAGIC_COOKIE`
environment-variable key (value `mellifera-plugin-v1` — a launch-consent
constant, not a credential).

## Documentation

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Authoritative design: contracts, capability model, decisions. |
| [docs/api-reference.md](docs/api-reference.md) | The HTTP contract, auth model, item lifecycle. |
| [docs/operator-runbook.md](docs/operator-runbook.md) | Build, run, configure, troubleshoot; dev workflow. |
| [docs/project_structure.md](docs/project_structure.md) | Module layout, stack, conventions, what exists. |
| [docs/ai-architecture.md](docs/ai-architecture.md) | The codebase structure rules + module map. |
| [docs/backlog.md](docs/backlog.md) | Deferred and planned work — not yet features. |
| [GLOSSARY.md](GLOSSARY.md) | Canonical vocabulary. |
| [openspec/specs/](openspec/specs/) | Thirteen living capability specs — the behavioral requirements. |

## Development

```bash
make build          # compile every package (pure Go, no CGO)
make test           # table-driven test suite
make lint           # golangci-lint
make check          # the build gate: lint + exported-symbol budget per package
make build-plugin   # the seven plugin binaries into bin/
make web-build      # DEV/CI ONLY — regenerate the embedded SPA + OpenAPI artifacts
make dev            # dev mode: Go server + Vite dev server with proxy
make proto          # regenerate gRPC bindings (generated *.pb.go are committed)
```

The web artifacts are **committed inputs**, like generated proto code: the
built SPA bundle (`internal/web/dist/`) and the OpenAPI spec
(`internal/web/api/openapi.{json,yaml}`) are embedded into the binary by
`//go:embed`, so the Go build gate never needs the node toolchain. After
editing the React app (`web/`) or a handler annotation (`internal/api/`), run
`make web-build` and commit the regenerated artifacts. The complexity budget
(`.golangci.yml`) — exported-symbol caps per package, function-length and
cognitive-complexity limits — is enforced by `make check`.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
Copyright The Mellifera Authors.
