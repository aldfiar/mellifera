# Mellifera — Project Structure

> **Foundational slice shipped.** The `scan-library` feature implemented the
> initial vertical: Go module, protos, `pkg/sdk`, `internal/{store,module,plugin,
> scan,api}`, `plugins/base-scanner`, `cmd/mellifera`, and the integration test.
> The module map in `docs/ai-architecture.md` §4 is now grounded in real code.
> Design-doc parents: `docs/architecture.md`, `docs/ai-architecture.md`,
> `docs/prior-art.md`, `docs/open-questions.md`.
>
> **Phase A (`plugin-pipeline`) layered on top — additive.** Realizes
> `internal/enrich` (the metadata-side serial orchestrator), adds the
> `plugins/tv-parser` `metadata_source` subprocess, makes `base-scanner`
> media-type-agnostic (parseTV extracted into tv-parser), and adds the
> `items.status` lifecycle column. Zero new protos — tv-parser and the enrich
> chain implement the already-generated `metadata.v1.MetadataSource`. The
> scan-library wire contract is unchanged (deprecate-don't-delete). Behavior:
> `openspec/specs/plugin-pipeline/spec.md`.
>
> **Phase B1 (`async-enrichment`) layered on top — additive.** Enrichment is now
> ASYNC (architecture §4.4): `internal/enrich` gains a derived in-process
> `Queue` + bounded worker pool that drains pending `(item, plugin)` work derived
> from `items` + document namespaces + the `enrichment_failures` ledger (**no**
> queue/claim/lease table) under per-item in-memory leases with retry/backoff.
> `POST /scan` returns once items are persisted `pending`; workers drain to
> `enriched`/`ready` in the background. Additive: zero new protos, `go.mod`
> unchanged, plugin contract + API surface + `scan.Result` unchanged
> (deprecate-don't-delete). enrich 3→7, store 4→5 (both green ≤8). B3 (TMDB +
> `AuthContext`) remains **deferred** ([`docs/backlog.md`](backlog.md)).
> Operator runbook: [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/async-enrichment/spec.md`.
>
> **Phase B2 (`image-enrichment`) layered on top — additive.** Lands the image
> media type + EXIF enrichment as the SECOND consumer of the B1 queue: a new
> `plugins/image-enricher` `metadata_source` subprocess (structural mirror of
> tv-parser; reads EXIF via the system `exiftool` binary — `os/exec` arg-slice,
> NO new Go dep), module-type-gated image discovery in `plugins/base-scanner`
> (`image.go`), an `absolute_path` stamp in `internal/scan`, and an `image`
> module seed in `internal/module`. Additive: zero new protos, `go.mod` unchanged,
> plugin contract + API surface + `scan.Result` + the B1 queue unchanged
> (deprecate-don't-delete). `metadata_source` now ships tv-parser + image-enricher
> (still ZERO new capability types — `image_provider` stays reserved). `exiftool`
> is a RUNTIME dep (like ffmpeg/ffprobe); a missing exiftool soft-fails image
> enrichment per-source (the scan always succeeds). B3b (external image enrichers
> + RAW) and Phase C (post-action) remain **deferred**
> ([`docs/backlog.md`](backlog.md)). Operator runbook:
> [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/image-enrichment/spec.md`.
>
> **web-ui Phase 1 layered on top — additive.** Lands the Go-side UI foundation:
> a NEW `internal/web` package (`Handler`+`Options`) composes the chi `/api/*`
> router with the embedded SPA (`//go:embed all:dist` — the first real `go:embed`
> here), the code-generated OpenAPI spec (`/openapi.{yaml,json}`, embedded committed
> bytes), and Swagger UI (`/docs/` via `github.com/swaggo/http-swagger` — the first
> new Go runtime dep; NOTICE-documented; `swag` stays a dev/CI CLI like `protoc`).
> `internal/api` widens to role-aware auth (`Principal{Role}` + `Role` + two
> `requireRole` groups) + 3 additive GETs (`/libraries`, `/items/{id}`,
> `/admin/status` via a `Deps.Status` closure built in `cmd/mellifera` — INV2
> preserved). Additive: proto/sdk/scan/enrich/plugin/module byte-identical vs
> `58a1130`. api 3→7 (≤8); `internal/web` = 2. The Go gate (`make build`/`check`/
> `test`/`lint`) is **node-free**; `make web-build` is the only node/swag target
> (dev/CI-only). The public surface widens (R-2): `/`, `/assets/*`, `/openapi.*`,
> `/docs` are unauthenticated static (no data); all data stays role-gated. React
> app + client panels + B3 (TMDB) + Phase C (post-action) remain **deferred**
> (Phase 2+; [`docs/backlog.md`](backlog.md)). Operator runbook:
> [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/web-ui/spec.md`.
>
> **web-ui Phase 2a/2b/2c layered on top — additive (web-only).** Lands the
> React app itself: a NEW `web/` npm project (Vite 5 + React 18 + TypeScript
> strict + `react-router-dom` v6 + TanStack Query v5 + Tailwind CSS +
> shadcn/ui copy-in primitives) with the token-entry auth layer
> (`localStorage` `mellifera.token` + `<RequireAuth>` presence-only guard) and
> the **admin panel** (libraries list/add-library/per-row scan + a Status page
> with plugin health + enrich-queue stats). The committed
> `internal/web/dist/*` now holds the REAL hashed Vite build — the Phase-1
> placeholder `app.js` is gone. `make web-build` is corrected + uncommented
> (`cd web && npm ci && npm run build`; `web/` is the npm root, Vite `outDir`
> = `internal/web/dist`). Additive: ZERO Go source changes beyond test-only
> hash-agnostic adjustments (`internal/web/web_test.go`,
> `integration_web_test.go`) — `go.mod`, `internal/api` (7), `internal/web`
> (2 symbols), `cmd/`, protos, SDK, and every endpoint are byte-identical vs
> `47f276e`; zero new API endpoints. node/npm are dev/CI-only. Phase 2b
> (browse + item detail + metadata rendering) and 2c (theme toggle, empty/error
> states, route polish) shipped in the same openspec change (`web-ui-phase-2`,
> archived 2026-10-06 — one additive Go integration test
> `integration_web_items_test.go` is the only Go diff beyond test-only
> adjustments). Behavior: `openspec/specs/web-ui/spec.md`.
>
> **packaged-playback layered on top (archived 2026-10-09).** Remux-only video
> playback without transcoding: a NEW `internal/stream` package (the playback
> mechanism — pure classification over stored ffprobe facts, the fMP4-HLS pack
> lane, the HMAC media token, the token-gated `/media` surface, the playback
> descriptor), a NEW `internal/orchestrator` package (the pure watch-driven
> policy core — pack-on-play + serial frontier; `cmd/mellifera/playback.go` is
> its thin shell), a `__streams__` enrichment lane riding the B1 queue
> (`internal/enrich/streams.go`), and two additive endpoints
> (`GET /items/{id}/playback` + `POST /items/{id}/play`, both browse group via
> nil-safe `Deps.Playback`/`Deps.Play` closures). `ffmpeg` becomes a runtime
> dep of the pack lane (per-item soft-fail → `pack_failed` ledger cooldown).
> Behavior: `openspec/specs/packaged-playback/spec.md`.
>
> **element-pages layered on top (archived 2026-10-10).** Media-first element
> detail pages + per-item parser attachments: `display_fields`/`identity_fields`
> presentation declarations in module seed config (`internal/module` — config
> IS render order, the core never branches on the literals), new
> `item_parsers`/`library_parsers` control tables + `internal/store/item_parsers.go`,
> `PUT/DELETE /items/{id}/parsers` + the `parsers` field on
> `PATCH /libraries/{id}` + the additive `module` presentation block on
> `GET /libraries/{id}` (`internal/api/parsers.go`; 16→17 paths), element-attached
> sources in the enrich queue derivation (chain order = queue priority;
> `enrich.Enrich` gains backward-compatible variadic extras), and the SPA's
> identity block + chain-ordered `ParserFooter` (chain groups first,
> element-only groups last) with prev/next browsing and the photo slideshow.
> NEW capability spec: `openspec/specs/parser-display/spec.md`; web deltas in
> `openspec/specs/web-ui/spec.md`.
>
> **serial-watch-flow layered on top (archived 2026-10-11).** Titled serials +
> the watch flow: a `title_overrides` control table (`internal/store/series.go`
> — `Series`/`TitleOverride`; store 7→9 top-level, WARN band), four admin
> title routes (`internal/api/titles.go` — `PUT/DELETE /series/{id}/title` +
> `PUT/DELETE /items/{id}/title`; openapi 17→19 paths; api holds 10 — the
> handlers are methods), `?variant=sidecar&n=<index>` on the item media
> endpoint (index-keyed, resolved only from the stored document), voiceover
> renditions in the pack lane (`internal/enrich/streams.go` +
> `internal/stream`), and the SPA's title fallback chain (override → best
> plugin title → floor) + watch-page voiceover/subtitle selection
> (`web/src/lib/subtitles.ts`). Deltas merge into the living `serial-library`,
> `media-serving`, `packaged-playback`, and `web-ui` specs.
>
> **video-item-pages layered on top (archived 2026-10-11; web-only).** The SPA
> gated every playback surface on `media_type === "video"` — a literal no
> scanner ever writes. Video-ness is now STRUCTURAL: shared predicates
> (`isVideoItem`/`isPhotoItem` in `web/src/lib/api.ts`) replace the literal,
> so the Player mounts for tv/serial items; the item page folds core fields,
> identifiers, and `_view` under the collapsed "Technical details" disclosure
> on EVERY item page. Zero Go production changes.
>
> **fix-episode-playback layered on top (archived 2026-10-11).** Whole-build
> playback reachability: the pack lane's window-truncated tail playlists and
> rendition tail-URI 404s are healed (whole-build republish; the legacy
> head-only branch no longer deletes published segments), `internal/stream`
> gains `validate.go` (whole-build validation — every published segment
> reachable), `internal/orchestrator` gains the integrity-sweep policy half
> (`IntegrityItem`/`Repacks`; 8→10, WARN band) executed by
> `cmd/mellifera/playback.go`, and the episode page becomes poster-only
> (player-first). Deltas merge into the living `packaged-playback` and
> `media-serving` specs.
>
> **serial layered on top (archived 2026-10-12).** Parsing hardening for REAL
> serial layouts — plugins-only: `plugins/serial-parser` gains `releasetags.go`
> (a neutral, role-keyed release-tag mask vocabulary — two-part bracket rule,
> CamelCase group-tag shape; no resource brand in any identifier) and reworks
> the `serialparse.go` grammar (always-season parse; anchored markers incl. the
> "Season N" word form and "TV N" space/hyphen-dot; romans II–IX; the episode
> number from SxxExx / "N серия" / `[NN]` edge bracket / trailing standalone,
> with a season fallback stem → series dir → 1); `parser.Match` ALWAYS writes
> season. `plugins/serial-scanner` indexes episodes by the same shapes:
> `sidecar.go` episode-number helpers + `walk.go associateSidecars` (SxxExx by
> `{season, number}`, bare forms by number). Deltas merge into the living
> `openspec/specs/serial-library/spec.md`; zero new protos, endpoints, or
> exported symbols.
>
> **artwork layered on top (archived 2026-10-24).** Layer-2 poster art: a NEW
> `internal/art` package (the content-addressed art store — `Acquire`
> singleflight fetch-once per (url, kind), `Ingest` upload guard with
> crop-once, `Settle`+GC, `Resolve` serve; a leaf over the store —
> `golang.org/x/sync/singleflight` + `golang.org/x/image/webp` are the first
> NEW Go runtime deps since web-ui Phase 1), two control tables
> `art_fetches` + `art_overrides` (`internal/store/art.go` —
> primitive-signature methods; DDL in `open.go`), `internal/api/art.go` (the
> read-time `artwork` stamp at the DTO seam, GET/HEAD
> `/api/v1/art/object/{oid}` browse-gated serve, the poster override family
> on series + items, nil-safe `Deps.Art` `*art.Service`), and
> `cmd/mellifera/janitor.go` — the named multi-task sweep registry that
> replaces the old single-ticker sweep loop (the packaged-playback streams
> task folds in unchanged; the art settle+GC task rides
> `MELLIFERA_ART_INTERVAL`, default 6 h, `0` = off). `plugins/shikimori`
> drops upstream missing-art placeholders write-side (pinned by the golden
> fixture `internal/api/testdata/golden/missing_art.json`); the SPA renders
> `PosterFrame` + `fallbackGradient` (`web/src/components/Artwork.tsx`) and
> the poster-change overlay (`web/src/components/manage/PosterOverlay.tsx`)
> over the object-URL LRU in `queries.ts`. Behavior:
> `openspec/specs/artwork/spec.md`.

## Overview

Mellifera is a modular, plugin-based, self-hostable media server (Jellyfin/Plex class in scope, deliberately not a clone) shipped as a **single Go binary**. Storage is embedded SQLite with JSON columns (`json_extract`, generated columns). The only external CORE runtime dependency is `ffmpeg`/`ffprobe`, invoked via `os/exec`; the image-enricher plugin additionally requires `exiftool` (both invoked via `os/exec` arg-slice, never a shell). A missing `exiftool` soft-fails image enrichment per-source — the scan always succeeds (see the operator runbook). Plugins are `hashicorp/go-plugin` gRPC subprocesses — crash-isolated and cross-language-capable — embedded into the core binary via `go:embed` and extracted to a data directory on first run (D11 / Q20). Media documents are **dynamic JSON** (`google.protobuf.Struct` / `json.RawMessage`), explicitly not 357 typed DTOs (D2).

The differentiator versus the Jellyfin/Emby lineage is **subprocess plugin isolation**: a plugin crash never takes down the server, and the plugin contract is open to any gRPC-capable language (Q1, prior-art.md §3). The core is an **orchestrator, not a domain engine**: it knows capability *types* (gRPC service interfaces), never specific media types or plugin names. The strings `"movie"`, `"tv"`, `"tmdb"` appear in **config**, not in core code (architecture §0, design principle 1).

## Stack

| Layer | Choice | Source |
|---|---|---|
| Language | Go 1.25.0 (toolchain `go1.25.3`) | `go.mod`; enhanced_objective.md §2 |
| Storage | SQLite via `modernc.org/sqlite` (pure-Go, no CGO) + JSON columns | arch §1.2; enhanced_obj §4 (recommended; planner confirms) |
| HTTP router | `chi` v5 | ai-arch §3, module map |
| Web composition | `github.com/swaggo/http-swagger` v1.3.4 (Swagger UI at `/docs/`) — first runtime dep added by web-ui Phase 1; NOTICE-documented | ai-arch §4 `[web-ui]` row |
| OpenAPI codegen | `swaggo/swag` CLI (dev/CI only — like `protoc`; NOT a `go.mod` runtime dep) | Makefile `web-build`; operator runbook |
| Web UI (SPA) | React 18 SPA in `web/`: Vite 5 + TypeScript (strict) + `react-router-dom` v6 + TanStack Query v5 + Tailwind CSS v3 + shadcn/ui copy-in primitives (8) + Radix (label/select/slot only) | `web/package.json` (web-ui Phase 2a) |
| Frontend toolchain | `node` v24 / `npm` 11 — **dev/CI-only** (the only node target is `make web-build`); NOT `go.mod` or runtime deps — the binary embeds the committed Vite build | Makefile; `web/README.md` |
| Plugin transport | `hashicorp/go-plugin` v1.8.0 (gRPC subprocess) | arch §1.2, §2; D1 |
| RPC | `google.golang.org/grpc` + `google.golang.org/protobuf` | arch §2 |
| Codegen | `protoc` 29.3 (generated `*.pb.go` committed; `buf` not installed — protoc fallback) | arch §2; enhanced_obj §1 |
| Media probe | `ffmpeg`/`ffprobe` 7.1.1 via `os/exec` (arg slice, never shell) | arch §1.2; enhanced_obj §7 |
| Art decode | `golang.org/x/image` v0.44.0 (WebP decode-only) + `golang.org/x/sync` v0.22.0 (`singleflight`) — the first NEW Go runtime deps since web-ui Phase 1 | `go.mod`; `internal/art/doc.go` (artwork) |
| Image metadata | `exiftool` via `os/exec` (arg slice, never shell) — RUNTIME dep (plugin-scoped); install: `brew install exiftool` / `apt install libimage-exiftool-perl` | image-enricher plugin (Phase B2); arch §1.2; operator runbook |
| Linter | `golangci-lint` v1.64.8 | `.golangci.yml` |
| Build | `go build` | conventions |
| Test | `go test` (table-driven per exported symbol) | mellifera-build skill |

CGO is avoided (pure-Go SQLite chosen to fit single-binary + cross-compile). No DI framework. No `reflect` (depguard-denied).

## Module layout (`scan-library` + `plugin-pipeline` Phase A + `async-enrichment` Phase B1 + `image-enrichment` Phase B2 + `web-ui` Phase 1 + `web-ui` Phase 2a + `serials-library` + `web-ui-phase-3` + `media-preview` + `packaged-playback` + `element-pages` + `serial-watch-flow` + `video-item-pages` + `fix-episode-playback` + `serial` + `display-naming` + `artwork`)

Directory tree as realized by the foundational slice PLUS the additive Phase A,
Phase B1, Phase B2, web-ui Phase 1, web-ui Phase 2a, serials-library,
web-ui-phase-3, media-preview, packaged-playback, and element-pages layers
(grounded in `docs/ai-architecture.md` §4 module map + `docs/architecture.md`
§10). Symbol
counts are exported symbols per
`scripts/check.sh`, which counts **top-level** `func/type/var/const` decls only
(method receivers excluded); `WARN` = >8 but ≤12:

```
mellifera/
├── go.mod                          # module github.com/mellifera/mellifera, Go 1.25.0
├── .golangci.yml                   # complexity-budget gate (funlen/gocognit/gocyclo/lll/dupl/depguard)
├── docs/                           # design docs (read-only inputs; user-authored)
├── .claude/skills/mellifera-build/ # project-local build skill + scripts/check.sh (NON-NEGOTIABLE)
├── proto/mellifera/                # generated *.pb.go + *_grpc.pb.go committed
│   ├── common/v1/                  # MediaDocument, AuthContext, Provenance, ... (arch §2.1.1)
│   ├── scanner/v1/                 # Scanner service: Scan(stream), Identify (arch §2.1.2)
│   ├── metadata/v1/                # MetadataSource (generated; EXERCISED in Phase A by tv-parser + sdk + enrich)
│   └── plugin/v1/                  # Plugin service: Handshake, Health, Shutdown (arch §2.2.2)
├── pkg/sdk/                        # plugin SDK (7): + MetadataSource + MetadataSourcePlugin in Phase A
├── internal/
│   ├── store/                      # SQLite: docs + control + reserved tables (9 top-level — WARN band; +ledger.go FailureRow + busy_timeout in B1; methods excluded by check.sh; [packaged-playback] streams facts ride the item document; [element-pages] +item_parsers.go — SetItemParsers/ListItemParsers over the new item_parsers table + SetLibraryChain/GetLibraryChain/TestLibraryChain over library_parsers, all FULL-replacement ordered control tables in open.go schemaSQL; [serial-watch-flow] +series.go — Series/TitleOverride over the new title_overrides table: manual display titles keyed by series row id or item id, control state beside the documents, never a namespace write; [display-naming] libraries gains the naming_group_style/naming_element_name option columns (libraries.go COALESCE partial UPDATE — an option change re-composes every served display_name on the next read; [artwork] +art.go — primitive-signature methods over the two new art control tables in open.go schemaSQL: art_overrides (UpsertArtOverride/GetArtOverride/DeleteArtOverride + ListArtOverrides — the per-entity selection, partitioned by entity kind) and art_fetches (InsertArtFetch/LookupArtFetch/DeleteArtFetch/ListArtFetches/ListArtFetchRefs — one row per (url_hash, kind) fetch; the settle+GC refsource))
│   ├── plugin/                     # subprocess lifecycle + gRPC clients + capability routing (10 WARN; +MetadataSource accessor)
│   ├── module/                     # config-driven module registry (7; +MetadataSourceBinding; tv-parser seed [A] + image-enricher image-module seed [B2] + serial seed [serials-library]; [element-pages] +identity_fields per module + display_fields per binding in ALL seeds + the IdentityFields/DisplayFields presentation accessors — methods, outside the symbol budget; [display-naming] display.item_name is the ONE display key modeled in Go (parseModule decodes it verbatim into Module.ItemName — config data, never core logic) + the serial seed promoted to schema_version 3 ("{title} · S{season}E{episode}"; schema-guarded v2→v3 UPDATE on Open, chained after the v1→v2 upgrade)
│   ├── scan/                       # scan-side orchestrator: Run/Deps/Result (3; B1: persists pending + Notify(libraryID), drops inline enrich, re-scan→stale; B2: stamps absolute_path into parsed for all items)
│   ├── api/                        # chi router — PURE DELEGATION, zero logic (10 exported symbols — WARN band: +Role +AdminStatus/PluginHealth/EnrichStats [web-ui] + Playback [packaged-playback] + ParserBinding/ModulePresentation [element-pages]; role-aware auth Principal{Role}+requireRole into TWO route groups — browse admin+client read-only + viewer actions, admin admin-only mutating; [phase-3] +PATCH /libraries/{id} +summary +folders +progress GET/PUT + [serials] +/series* + [media-preview] +GET/HEAD /items/{id}/media + [packaged-playback] +playback.go GET /items/{id}/playback + POST /items/{id}/play (Deps.Playback/Play closures) + [element-pages] +parsers.go PUT/DELETE /items/{id}/parsers + parsers field on PATCH /libraries/{id} + module block on GET /libraries/{id} (Deps.ModulePresentation/PluginCapabilities closures) — 42 paths; every handler swag-annotated; committed openapi.{json,yaml} regenerate via make web-build; [serial-watch-flow] +titles.go — PUT/DELETE /series/{id}/title + PUT/DELETE /items/{id}/title (admin; over the store title_overrides table; handler methods, so the 10-symbol count holds) + ?variant=sidecar&n=<index> on the item media endpoint, index-keyed and resolved only from the stored document; [display-naming] +display.go — the display-name composition core, ALL-UNEXPORTED (so the 10-symbol count holds): item list/detail + library responses carry the server-composed display_name; naming_group_style/naming_element_name validated options on GET/PATCH /libraries/{id}; no new endpoints); [artwork] +art.go — the read-time `artwork` stamp composed at the DTO seam for the browse surfaces (stored override selection → served proxy URL; an upstream missing-art placeholder counts as absence — pinned by the golden fixture testdata/golden/missing_art.json), GET/HEAD /art/object/{oid} (browse group; ServeContent with ETag 304s), and the poster override family GET …/posters + PUT/POST/DELETE …/poster on /series/{id} and /items/{id} (POST = multipart upload) — all over the nil-safe Deps.Art *art.Service (nil ⇒ absence; the object route 503s)
│   ├── web/                        # [web-ui] embedding + composition layer (2: Handler+Options) — //go:embed all:dist (SPA) + embedded openapi.{yaml,json} + /docs (Swagger UI via swaggo/http-swagger); SPA fallback + immutable /assets cache; public surface (/, /assets, /openapi, /docs) unauthenticated; [2a] dist/* = the REAL hashed Vite build; [packaged-playback] mounts the token-gated /media + /media/* stream surface BEFORE the SPA fallback (Options.Media)
│   ├── enrich/                     # metadata-side orchestrator + async derived-queue: Enrich/Deps/Result + Queue/QueueConfig/Stats/NewQueue (7; B1: queue.go/worker.go/lease.go/retry.go; [packaged-playback] +streams.go — the __streams__ pack lane riding the same queue via the Deps.PackItem seam; [element-pages] Enrich gains backward-compatible variadic extras (element-attached sources run after the chain) + queue derivation reads ListItemParsers + the library chain (chain order = queue priority))
│   ├── orchestrator/               # [packaged-playback] PURE watch-driven policy core (no I/O: snapshots in, decisions out): Budget (32GB LRU artifact budget + .trash eviction), Frontier (serial watch frontier + movies pack-on-play), Job/Episode/ArtifactDir — executed by the cmd/mellifera janitor registry ([artwork] the streams task runs playback.go's newSweep closure; never execs ffmpeg, never writes documents); [fix-episode-playback] +IntegrityItem/Repacks — the broken-build integrity-sweep policy half (integrity facts in, repack jobs out; 10 symbols, WARN band)
│   ├── itest/                      # [all features] black-box integration + QA suite (38 files + testdata/, package `itest`) — external test package at internal/itest, NOT beside code: integration_* = per-feature AC-1 goldens (scan/pipeline/async/image/web/web-items/media) ; qa_* = independent acceptance + regression + pinned-baseline guards (git-diff additivity vs merge-bases, node-free build-gate dry-run) + packaged-playback joint harness/roundtrip/streams tests + [element-pages] element_hermetic_e2e_test.go + element_parsers_test.go over the testdata/element-parser fixture plugin (hermetic attach→drain→namespace E2E) + [serial-watch-flow] qa_serial_watch_flow_test.go + [video-item-pages] qa_video_item_pages_test.go + [fix-episode-playback] qa_broken_build_sweep_test.go (the healing sweep E2E) + [display-naming] qa_display_naming_joint_test.go (the store→api→module naming joints over the REAL server+plugin subprocess surface: module-default item_name compose, PATCH option re-compose with no rescan, override/precedence tiers) + [artwork] qa_artwork_joint_test.go (the art store→api joint surface over the same hermetic harness). The server+plugin subprocess harness (startServer/qaStartServer/…, moduleRoot/buildBinary) is HERMETIC: every plugin is built into t.TempDir and pinned via MELLIFERA_* absolute paths, and make/git calls run with Dir=moduleRoot — the suite passes from any cwd (incl. a fresh checkout with no bin/ artifacts)
│   ├── stream/                     # [packaged-playback] REALIZED (was DEFERRED): packaged-playback mechanism — Classify (pure over stored ffprobe), the remux-only fMP4-HLS pack lane (one ffmpeg exec site, `-c copy`, head-first 600s chunk, build-nonce atomic publish), HMAC media tokens (cookie-first + query fallback, 4h), the token-gated /media ServeHTTP surface, Describe (mode direct|hls); counted exports 4 (Build/Class/Classify/Service; grouped consts + methods excluded); [serial-watch-flow] the pack lane packages voiceover renditions; [fix-episode-playback] +validate.go (whole-build validation — every published segment reachable) + the lane heals window-truncated tail playlists / rendition tail-URI defects (whole-build republish; the legacy head-only branch no longer deletes published segments)
│   └── janitor/                    # DEFERRED (the package; [artwork] the cmd-level sweep registry lives at cmd/mellifera/janitor.go)
├── plugins/
│   ├── base-scanner/               # scanner subprocess: walk + ffprobe + withinRoot (media-type-agnostic; parseTV extracted); B2: image.go — module-type-gated image discovery + stdlib base info (jpeg/png dims; webp/heic soft-fail)
│   ├── tv-parser/                  # metadata_source subprocess: parseTV moved here verbatim; serves metadata.v1.MetadataSource
│   ├── image-enricher/             # metadata_source subprocess [B2]: EXIF via the system exiftool (os/exec arg-slice); structural mirror of tv-parser; serves metadata.v1.MetadataSource
│   ├── serial-scanner/             # scanner subprocess [serials-library]: walks the serial root into series candidates (S/E-structured dirs); [serial] associateSidecars classifies sidecars into series-level + per-episode facts indexed by the same episode-number shapes (SxxExx by {season,number}, bare forms by number)
│   ├── serial-parser/              # metadata_source subprocess [serials-library]: serial-level + episode-level facts from directory structure (no network); [serial] +releasetags.go (neutral role-keyed release-tag mask vocabulary — bracket-segment rules, release-tag tables, CamelCase group-tag shape) + serialparse.go grammar rework (always-season parse, anchored markers, romans II–IX, multi-form episode numbers) — Match always writes season
│   └── frame-grabber/              # metadata_source subprocess [serials-library]: ffmpeg JPEG grabs under <dataDir>/thumbs/, stamped sources["frame-grabber"].thumbnail_path into episode documents (the fact the media endpoint serves as ?variant=thumb)
├── cmd/
│   └── mellifera/                  # flat main.go — constructor wiring (loads all SIX plugin subprocesses — base-scanner, serial-scanner, tv-parser, image-enricher, serial-parser, frame-grabber — paths overridable via MELLIFERA_<PLUGIN> env, default bin/; builds enrich.Deps; enrich.NewQueue + Start/Stop + Notify + MELLIFERA_ENRICH_* knobs; composes web.Handler(api.New(deps),opts) as sole handler + builds Deps.Status closure + MELLIFERA_WEB_DEV; [packaged-playback] playback.go — the orchestrator shell: builds stream.Service + the Deps.Playback/Play closures + EnqueuePack dispatch + budget eviction; MELLIFERA_ORCH_BUDGET_GB + MELLIFERA_MEDIA_SECRET knobs; [fix-episode-playback] playback.go also executes the broken-build integrity sweep (orchestrator Repacks over integrity facts); [element-pages] loadPlugin factors the per-plugin Load+Start pair so loadedCaps (declared capability types) is captured at the declaration site — feeds the Deps.PluginCapabilities parser-validation closure + builds Deps.ModulePresentation over module.Registry; [artwork] +janitor.go — the named multi-task sweep registry (janitorTask{name, interval, fn}: one ticker goroutine per enabled task, every enabled task boot-runs once before serving, interval ≤ 0 disables the task ALONE) — day-one tasks "streams" (the packaged-playback sweep over playback.go's newSweep closure, fixed 60 s const) and "art" (artSvc.Settle — the art store's settle+GC walk; MELLIFERA_ART_INTERVAL, default 6 h, ≤0 = off); main.go builds art.NewService over the blob root <dataDir>/art)
└── web/                            # React SPA (npm project root; node/npm DEV-ONLY): Vite 5 + React 18 + TS strict + react-router-dom + TanStack Query + Tailwind/shadcn (8 copy-in primitives); src/lib api.ts (typed DTOs mirroring the Go json tags verbatim + Bearer fetch wrapper + authenticated media objectURL channel + endpoint allowlist + MediaVariant union + [packaged-playback] PlaybackDescriptor + play/playback calls + [element-pages] ParserBinding/ModulePresentation DTOs + getLibrary), auth.ts (localStorage token), document.ts (§3.1 accessors), queries.ts (TanStack hooks + useItemMedia + useLibrary); pages Login + Home (collections + Continue/Next-up rails) + Browse + ItemDetail (Details surface + collapsed Technical details + hero media; [packaged-playback] hls.js player + click-to-seek; [element-pages] identity-field badges + chain-ordered ParserFooter + prev/next browsing + photo slideshow w/ S toggle) + collections/{Collection,serial episode flow; [element-pages] browse handoff to the element page} + admin/{Admin,Libraries,Status}; components/{Sidebar shell, metadata/* (incl. [element-pages] ParserFooter.tsx), states, ui/*}; [serial-watch-flow] title fallback chains (override → best plugin title → floor) with rename affordances + watch-page voiceover/subtitle selection (lib/subtitles.ts); [video-item-pages] structural video-ness — isVideoItem/isPhotoItem predicates in lib/api.ts replace the media_type=="video" literal no scanner writes, + core fields/identifiers/view folded under the collapsed Technical-details disclosure on every item page; [fix-episode-playback] poster-only episode page; [display-naming] Home/Collection cards render the server-composed display_name (the SPA never re-derives names); [artwork] components/Artwork.tsx (PosterFrame — the served-art frame with the deterministic fallbackGradient floor), components/manage/PosterOverlay.tsx (the poster-change overlay: candidate grid + select/upload/delete), lib/api.ts artwork on the item/series DTOs + putPoster/uploadPoster/deletePoster + isServedArtPath (a library surface renders a served artwork value only when it is an /art/object/ path — else the gradient floor), lib/queries.ts the module-scope art object-URL LRU (ART_LRU_LIMIT 64 — the LRU owns revocation) + useArtworkObjectUrl; Vitest 301 cases in 21 files
```

Dependency direction points **down only**: `web → api → scan → enrich → {module, plugin} → store` (web-ui Phase 1: `internal/web` composes `internal/api`; api does not import web). Phase B1: scan no longer calls enrich inline — after persisting items `pending` it hands the library to the `enrich.Queue` via `Deps.Notify` (wired in `cmd/mellifera`); enrich still never imports scan. The worker pool is a process-lifetime component (started before serving, stopped on shutdown). `proto/` and `pkg/sdk` are shared leaves. No cycles (ai-arch §4). web-ui Phase 2a adds ZERO Go import edges — the SPA in `web/` is a same-origin HTTP client of `/api/v1/*` (Bearer header; no CORS), not an importer. packaged-playback keeps the shape: `internal/orchestrator` imports only stdlib (`time`) — snapshots in, decisions out, executed by the `cmd/mellifera` janitor registry (artwork — the `streams` task over `playback.go`'s `newSweep` closure); `internal/stream` is mounted by `internal/web` (`Options.Media`) and reached from enrich ONLY through the `Deps.PackItem` func seam — enrich never imports stream (D-10). element-pages adds no import edges at all: api reads module config through the `Deps.ModulePresentation`/`PluginCapabilities` closures (INV2/INV4), and the SPA consumes existing endpoints. artwork adds one store-adjacent leaf edge — `api → art → store` (art never imports enrich/plugin/module; upstream URLs and pacing stay at the composition root).

## Entry points

| Binary | Path | Role |
|---|---|---|
| Server | `cmd/mellifera/main.go` | Flat constructor wiring (no DI, no reflect). Reads config, opens store, loads **all three** plugins (base-scanner + tv-parser + image-enricher), constructs `enrich.Deps`, constructs + starts the async `enrich.Queue` (before serving) and wires `scan.Deps.Notify` → `queue.Notify` (process ctx); stops pool → plugins → store on shutdown. Reads `MELLIFERA_ENRICH_*` knobs (and `MELLIFERA_IMAGE_ENRICHER` — Phase B2). **web-ui Phase 1:** composes `web.Handler(api.New(deps), opts)` as the sole top-level handler; builds the `Deps.Status` closure over `mgr.Status` + `enrichQueue.Stats` (INV2 seam); reads `MELLIFERA_WEB_DEV`. |
| Scanner plugin | `plugins/base-scanner/main.go` | Separate subprocess binary using `pkg/sdk.Serve(...)`. **Media-type-agnostic** (Phase A): walks configured library root, runs `ffprobe` via arg slice, emits ONLY base fields (`relative_path`/`extension` + the verbatim ffprobe blob). TV parsing no longer lives here (extracted to tv-parser). Path-traversal guard (`withinRoot`) on every discovered path. |
| Metadata-source plugin | `plugins/tv-parser/main.go` | Phase A. Separate subprocess binary; the first `metadata_source` capability plugin. Houses `parseTV` (moved verbatim from base-scanner) and serves `metadata.v1.MetadataSource` (Match→BuildRequest→Convert→Merge) on one shared gRPC server via `pkg/sdk.Serve`. |
| Metadata-source plugin (image) | `plugins/image-enricher/main.go` | Phase B2. Separate subprocess binary; the second `metadata_source` capability plugin. A structural mirror of tv-parser (only the capability body differs: EXIF extraction via the system `exiftool` binary — `os/exec` arg-slice, never a shell — vs filename parse). `Match` applies for `module_type=="image"` or an image extension; `Convert` runs exiftool on `absolute_path` (carried by `Match`); `Merge` writes `sources["image-enricher"]` only. A missing/failing exiftool is a per-source SOFT-FAIL. |
| Web SPA | `web/src/main.tsx` | web-ui Phase 2a. NOT a separate process — the React root (`StrictMode` > `QueryClientProvider` > `BrowserRouter`); Vite builds it into the committed `internal/web/dist/`, which `internal/web` embeds into the single Go binary. Dev iteration runs `npm run dev` (Vite proxies `/api`, `/openapi.*`, `/docs` to `:8080`). |

## Conventions snapshot (enforced by `.claude/skills/mellifera-build/` + `.golangci.yml`)

- **≤8 exported symbols per package** (12 hard fail) — `scripts/check.sh` counts; ai-arch §5.
- **`doc.go` per package** — the entire public API in one file (contract-first).
- **Pure core, thin shell** — logic = pure functions; I/O only at `store/plugin/stream/api/janitor` edges.
- **`api/` is pure delegation** — a handler does exactly three things: parse request → call ONE domain function → write response. No branching, no orchestration (ai-arch §3).
- **No DI framework, no `reflect`** — depguard denies both in `.golangci.yml`.
- **Flat `main.go`** — the entire app graph readable in one file.
- **Data-type boundaries, not interfaces** — structs cross packages; interfaces ONLY at the plugin seam with ≥2 implementations.
- **No shared mutable types across packages** — cross-package data crosses a struct conversion.
- **Table-driven test for every exported symbol** — tests are the spec AND the acceptance gate.
- **Parameterized SQL only** — no string-built queries (golang-security skill).
- **Apache-2.0 license headers** on every `.go` file (D12, Q18).
- **Precision over collapse** — per-source values namespaced and preserved exactly (design principle 4).
- **Deprecate, don't delete** — reserved fields, additive changes, deprecation markers (design principle 6).
- **Russian-language data is first-class** — no English-only assumptions (arch §1.2).

Complexity budget (`.golangci.yml` + `check.sh`):

| Metric | Warn | Fail |
|---|---|---|
| Exported symbols / package | >8 | >12 |
| Outgoing intra-core deps / package | >4 | >6 |
| File length | >300 lines | >500 |
| Function cognitive complexity | >10 | >15 (`gocognit`, `gocyclo`) |
| Function length (funlen) | — | 60 lines / 40 statements |
| Line length (lll) | — | 120 |
| Duplicate code (dupl) | — | threshold 100 |
| Exported symbol without table test | — | any |

A failed check means **redesign**, not relax (skill: "a fail means redesign").

## Key architectural decisions (immutable — D1–D20)

All DECIDED or DEFAULTED in `docs/open-questions.md`; none OPEN. Load-bearing for the planner:

- **D1** gRPC (not net/rpc) for plugin transport.
- **D2** Dynamic JSON documents, no typed DTOs.
- **D3** Namespaced per-source document + recomputable view.
- **D11 / Q20** Single-file delivery via `go:embed` + first-run extraction (D10 sibling-files superseded). First-run *extraction* itself is **deferred** for scan-library — the feature loads base-scanner from a filesystem path (dev mode).
- **D12** Apache-2.0 (core + SDK + bundled plugins); DCO, no CLA.
- **D15 / Q2** Proto-first thin SDK now; full SDK before Phase 2.
- **D18 / Q15** Auth: single admin token for MVP; `Principal` abstraction grounds Phase 2 multi-user.
- **D20** Playback progress & resume: `playback_progress` table + `GET /items/{id}/resume` + `POST /items/{id}/progress`.

Q1–Q28 carry reversible defaults with named revisit triggers (see `docs/open-questions.md`). Risk register R1–R14 lives there too.

## What exists now (`scan-library` + `plugin-pipeline` Phase A + `async-enrichment` Phase B1 + `image-enrichment` Phase B2 + `web-ui` Phase 1 + `web-ui` Phase 2a + `serials-library` + `web-ui-phase-3` + `media-preview` + `packaged-playback` + `element-pages` + `serial-watch-flow` + `video-item-pages` + `fix-episode-playback` + `serial` + `display-naming` + `artwork`)

The foundational slice plus the additive Phase A, B1, B2, web-ui Phase 1/2a/2b+2c,
serials-library, web-ui-phase-3, media-preview, packaged-playback, and
element-pages layers are implemented (all committed on `main`), plus the
2026-10-11/12 hardening layers serial-watch-flow, video-item-pages,
fix-episode-playback, and serial, the 2026-10-13 layers shikimori-enrichment,
continue-nextup-media, and fix-truncated-scan-sweep, and display-naming
(2026-10-14), and artwork (2026-10-24) — eighteen
living specs under `openspec/specs/`, and the per-change gate records in
`openspec/changes/archive/` (latest: `2026-10-24-artwork`). All
verification gates are green at the merge
point: `make build && make check && make test` node-free PASS,
`cd web && npm test` Vitest (301 cases / 21 files) + `tsc --noEmit` + eslint clean, and every
archived change's probe set re-runs exit 0 (the `swag init` step of
`make web-build` was fixed in media-preview: `-d internal/api -g doc.go`
reproduces the committed `openapi.{json,yaml}` byte-identically).

- `go.mod` (`github.com/mellifera/mellifera`, Go 1.25.0). **Unchanged** across Phase A/B1/B2/2a (additive). web-ui Phase 1 adds the first new Go runtime dep — `github.com/swaggo/http-swagger v1.3.4` (+ transitives) for the Swagger UI at `/docs/`; NOTICE-documented. `swag`/`swagfmt` stay dev/CI CLIs (not in `go.mod` as runtime). Phase 2a and every layer through display-naming add ZERO Go deps (the React toolchain lives in `web/package.json`, dev-only); artwork (2026-10-24) breaks the streak with the first NEW Go runtime deps since web-ui Phase 1 — `golang.org/x/sync` (singleflight fetch collapse) + `golang.org/x/image` (WebP decode-only), both `internal/art`-scoped.
- Source under `mellifera/`: `cmd/`, `internal/{store,module,plugin,scan,api,enrich,web,orchestrator,stream,art}/`, `pkg/sdk/`, `plugins/{base-scanner,tv-parser,image-enricher,serial-scanner,serial-parser,frame-grabber}/`, compiled `proto/mellifera/*/v1/*.pb.go` (**proto tree unchanged** — serials-library added ZERO new protos), and the `web/` React SPA.
- `mellifera` binary (server) + 6 plugin binaries via `make build` / `make build-plugin` (`base-scanner`, `serial-scanner`, `tv-parser`, `image-enricher`, `serial-parser`, `frame-grabber`). The server serves the embedded React SPA plus the token-gated `/media` playback surface.
- `internal/itest/` — the black-box integration + QA suite, 30 files + `testdata/` in package `itest` (moved off the repo root into Go-idiomatic layout; unit tests stay beside the code they test): `integration_test.go` (scan-library) + `integration_pipeline_test.go` (Phase A) + `integration_async_test.go` (Phase B1 AC-1 async golden) + `integration_image_test.go` (Phase B2 AC-1 async image golden) + `integration_web_test.go` (web-ui keystone) + `integration_web_items_test.go` (2a items contract) + `integration_media_test.go` (media-preview media E2E) + serial E2E (`qa_serial_e2e_test.go`) + packaged-playback joint tests (`qa_playback_harness_test.go`, `qa_playback_roundtrip_test.go`, `qa_streams_joint_test.go`) + [element-pages] `element_hermetic_e2e_test.go` + `element_parsers_test.go` (hermetic attach→drain→namespace E2E over the `testdata/element-parser` fixture plugin) + [serial-watch-flow] `qa_serial_watch_flow_test.go` + [video-item-pages] `qa_video_item_pages_test.go` + [fix-episode-playback] `qa_broken_build_sweep_test.go` (the healing-sweep E2E) + [display-naming] `qa_display_naming_joint_test.go` (the store→api→module naming joints over the real server+plugin surface) + `qa_*_test.go` (independent acceptance + regression for all slices) + `web/src/**/*.test.{ts,tsx}` (Vitest — Phase 2a+).
- Inputs, still read-only: `docs/{architecture,ai-architecture,prior-art,open-questions}.md`, `.claude/skills/mellifera-build/`, `.golangci.yml`.

### Phase A additions (additive — `plugin-pipeline`)

Phase A realizes the metadata-side pipeline WITHOUT touching the scan-library
wire contract (AC-3: zero proto edits; `scanner.v1`/`plugin.v1`/`sdk.Scanner`/`sdk.Serve`
byte-identical; base-scanner launch path byte-identical). Key additions:

- **`internal/enrich` (3 symbols: `Enrich`, `Deps`, `Result`).** The metadata-side analog of `internal/scan`. An inline, serial orchestrator that, per configured `metadata_source`, runs the 4-RPC chain **Match→BuildRequest→Convert→Merge** over `metadata.v1.MetadataSource` (RPCs stubbed fetch; `AuthContext` empty — Phase B). Owns a pure `nextState` transition function (every legal + illegal transition encoded + unit-tested) that advances the `items.status` lifecycle, and authoritative per-field `_provenance` + recomputable `_view` assembly. Plugin sees only an empty document and writes its `sources.<id>` namespace (namespace isolation enforced — a foreign write is rejected+reverted; arch §3.2 L2, §3.3).
- **`plugins/tv-parser` (subprocess; no exported symbols).** The first `metadata_source` plugin. `parseTV`/`cleanTitle`/`parentDir`/`atoi` + 4 regexes moved **verbatim** from `plugins/base-scanner/tvparse.go`; base-scanner Identify now stamps only base fields (media-type-agnostic). Serves `metadata.v1.MetadataSource` on one shared gRPC server via `sdk.Serve` + `sdk.MetadataSourcePlugin`.
- **`pkg/sdk` (5→7: `MetadataSource` interface + `MetadataSourcePlugin` dispense).** The capability-2 adapter, mirroring `Scanner`/`ScannerPlugin`.
- **`internal/plugin` (9→10 WARN: `Manager.MetadataSource(pluginID, capabilityID)` accessor).** Plugin launch is now **capability-driven** — the client-plugin set is built from each plugin's declared `[]sdk.Capability` (base-scanner's set is byte-identical to scan-library's hardcoded set; AC-3 preserved).
- **`internal/module` (6→7: `MetadataSourceBinding` + `Module.MetadataSources[]`).** The `metadata_sources` enrichment chain is modeled in config order; the `tv` module seeds `tv-parser` (priority 1).
- **`internal/store` (stays 11; `items.status` is a column, not symbols).** New indexed `status` column (default `"new"`); `QueryItems` gained an additive `status` filter param (`""` ⇒ all statuses); `Item.Status` field.
- **`internal/scan` (stays 3: `Run`/`Deps`/`Result`).** New `Deps.Enrich enrich.Deps` field — scan calls enrich **between Identify and PutItem** (an exported field, not a 4th symbol).
- **`internal/api` (stays 3).** Additive `itemDTO.Status` (`json:"status"`) response field + optional `?status=` query filter.
- **`cmd/mellifera`.** Loads tv-parser alongside base-scanner and constructs `enrich.Deps` (env `MELLIFERA_TV_PARSER`, default `bin/tv-parser`).

### Phase B1 additions (additive — `async-enrichment`)

Phase B1 realizes the async enrichment substrate (architecture §4.4) WITHOUT
touching the plugin contract, the API surface, or the `scan.Result` shape (AC-3:
proto/SDK/plugins/API diff empty vs `6507277`; `func Enrich(` preserved). Key
additions:

- **`internal/enrich` (3→7: + `Queue`, `QueueConfig`, `Stats`, `NewQueue`).** The async derived-queue dispatcher (arch §4.4). `Queue` derives pending `(item, plugin)` work from `items` + the document `sources` namespaces + the `enrichment_failures` ledger (no queue/claim/lease table — INV-derived-not-stored), feeds a bounded channel (`Workers*4`), and a worker pool drains it under per-item in-memory leases (serialize-within-item, parallelize-across-items). Per-source in-memory retry/backoff (`retry.go`); terminal failure writes a ledger row + cooldown (loop-safety), a later success clears it (reset-on-success). New files: `queue.go`, `worker.go`, `lease.go`, `retry.go`. `Enrich` (sync per-item chain) is preserved (deprecate-don't-delete, AC-3); the worker shares its helpers (`runSource`/`nextState`/`applyContribution`/`appendStage`) but does not call `Enrich` directly.
- **`internal/store` (4→5 top-level: + `FailureRow`).** New `ledger.go` with `FailureRow` + `RecordFailure`/`ClearFailure`/`ListFailures` (the `enrichment_failures` ledger escape hatch — no DDL; the table existed from Phase A). New pool-wide **5s `busy_timeout`** PRAGMA in `Open`'s DSN (`withBusyTimeout`) — the root-cause fix for pooled-connection write-lock errors under the async pool. (The methods are excluded from the ≤8 budget by `check.sh`; the Phase-A "11" narrative counted them.)
- **`internal/scan` (stays 3).** Drops inline enrich: persists each item `pending` and, once the scanner stream drains, calls `Notify(ctx, libraryID)` once (new `Deps.Notify` func field, nil-safe). A re-scan whose base identity (`parsed`+`ffprobe`) changed → `stale`; an unchanged re-scan preserves the prior status (a `ready` item is not regressed). `scan.Result` shape is unchanged — only timing (scan returns before enrichment drains).
- **`internal/api` (stays 3).** Unchanged surface; `?status=` now meaningfully filters the new `pending`/`ready`/`stale` states (passes any value through; empty = all).
- **`cmd/mellifera`.** Constructs `enrich.NewQueue`, `Start`s it before the server serves (so the first scan's `Notify` lands in a running pool), wires `scan.Deps.Notify` → `queue.Notify` over the **process** ctx (not the per-request ctx), and `Stop`s on shutdown (HTTP → pool → plugins → store). Reads `MELLIFERA_ENRICH_*` knobs (defaults: workers 4, max-attempts 3, lease-TTL 60s, backoff 2s, exhausted-cool 7d, no-data-cool 30d, cool-cap 365d).
- **`integration_async_test.go`.** The B1 AC-1 async golden: scan → items `pending` → bounded poll until the async drain settles TV items to `ready` (tv-parser namespace + tmdb attempted-but-unavailable ⇒ `allSourcesTerminal` ⇒ settled), Cyrillic preserved, `?status=ready` filter asserted.

**D-Q1 (load-bearing deviation):** a source is queueable iff `AuthMode != "CLIENT"` (not the §4.4-literal `== SERVER`). The seeded `tv` module reflects this: `tv-parser` (empty `auth_mode`, queued), `tmdb` (`SERVER`, queued but unloaded in B1 → runs-but-unavailable ⇒ terminal-at-settle), `kinopoisk` (`CLIENT`, excluded from the background queue — Mode-B-only).

#### Lifecycle + document schema (V5 hybrid)

Every persisted `Item` carries an indexed `status` in `{new, pending, parsed, enriched, failed, deleted, ready, stale}`
(core-managed like `file_id`; media-type-agnostic pipeline-stage names — arch §0 #1 holds). The
orchestrator advances `new→pending→parsed→pending→enriched` on success, `→failed` on hard error
(`→pending` on retry), `→deleted` on soft-delete; `enriched` requires ≥1 source succeeded ∧ 0 failed
(a partial run stays at the furthest-valid state). **Phase B1** adds `enriched --settled--> ready`
(all queueable sources terminal: done, in-ledger-cooldown, or ran-but-produced-no-work) and the re-scan
transitions `* --stale--> stale`, `stale --rehydrate--> pending`; `failed --retry--> pending` is now
exercised by the queue (defined-but-unused in Phase A). The `document` gains (arch §3.1):
`sources.<plugin_id>` (lossless per-source namespace), `_provenance.<field_path>` (per-field source
audit), `_view.<field>` (recomputable view; Phase-A last-writer), and `_stages[]` (per-stage progress,
`stage:"metadata_source"`). **Full state machine, status meanings, and provenance-reading** ->
[`docs/api-reference.md`](api-reference.md) §4–§5; **async queue, env knobs, and the
non-blocking-scan runbook** -> [`docs/operator-runbook.md`](operator-runbook.md) §5;
behavioral requirements: `openspec/specs/{plugin-pipeline,async-enrichment}/spec.md`.

### Phase B2 additions (additive — `image-enrichment`)

Phase B2 lands the image media type + EXIF enrichment WITHOUT touching the plugin
contract, the API surface, the B1 queue, or `scan.Result` (AC-3: `proto/`/
`internal/api/`/`internal/enrich/`/`pkg/sdk/`/`go.mod` diff empty vs `e2a7562`). Key
additions:

- **`plugins/image-enricher` (subprocess; 0 exported symbols).** The second `metadata_source` plugin — a structural mirror of `plugins/tv-parser` (only the capability body differs). `Convert` reads EXIF by invoking the **system `exiftool`** binary via `os/exec` arg-slice (`-j -n <selected tags> <absPath>`, never a shell — mirrors `ffprobe.go`); maps `{ImageWidth→width, ImageHeight→height, FileType→format, Make→make, Model→model, DateTimeOriginal→date_taken, Orientation→orientation, GPSLatitude→gps_lat, GPSLongitude→gps_lon}`. `Match` applies for `module_type=="image"` or an image extension and carries `absolute_path`; `Merge` writes `sources["image-enricher"]` only. Every exiftool failure is a per-source SOFT-FAIL → empty namespace → B1 `no_data` → settle (AC-6). **NO new Go dep** — `exiftool` is a runtime dep (see the operator runbook).
- **`plugins/base-scanner` (+`image.go`).** Module-type-**gated** discovery (not a union): `walk` selects `imageMime` (jpg/jpeg/png/webp/heic/heif) only when `module_type=="image"`, else the video `mediaMime` (a union filter would discover TV cover-art jpgs — R-I4). `probeImage` decodes jpeg/png dims via stdlib `image.DecodeConfig`; webp/heic/heif/RAW base-info soft-fails (no stdlib decoder — exiftool supplies their data at enrichment). ffprobe is NEVER invoked for images.
- **`internal/scan` (stays 3).** `assembleBaseDoc` stamps `absolute_path = filepath.Join(root, rel)` into `doc["parsed"]` for EVERY item (media-type-agnostic — INV2; no `module_type` branch). This is the only file-location channel into the enricher chain (the B1 chain passes an empty Merge doc). Additive — tv-parser ignores it (TV goldens pass).
- **`internal/module` (stays 7).** Second idempotent seed: an `image` module config row binding base-scanner + image-enricher (priority 1, local/no `auth_mode`, no `filename_format`). `imageConfigJSON` is an unexported const → no new exported symbol.
- **`cmd/mellifera`.** Loads + starts + stops the image-enricher subprocess (3rd plugin), started before the server serves (INV-start-before-serve). `config.imageEnricherPath = envOr("MELLIFERA_IMAGE_ENRICHER", "bin/image-enricher")`. No new import.
- **`Makefile`.** `build-plugin` now builds 3 binaries (base-scanner, tv-parser, image-enricher); a runtime-deps comment documents ffmpeg/ffprobe + exiftool.
- **`integration_image_test.go`.** The B2 AC-1 golden: real server + 3 plugin subprocesses + REAL exiftool over stdlib-encoded image fixtures (jpeg/png + exiftool-stamped EXIF + ffmpeg webp + sips heic); scan non-blocking → items `pending` → bounded poll until settled `ready`; `sources."image-enricher"` carries real EXIF + `_provenance`/`_view`/`_stages`; soft-fail + Cyrillic + HEIC + stray-`.mkv`-gated-out asserted.

**Image lifecycle = the B1 lifecycle, unchanged.** Image items consume the SAME async queue as TV: scan persists each item `pending` (non-blocking) → the worker pool drains `(item, image-enricher)` → `enriched --settled--> ready`. EXIF provenance, soft-fail, and runtime-dep posture: **[`docs/operator-runbook.md`](operator-runbook.md)** §1/§4/§5; behavior: `openspec/specs/image-enrichment/spec.md`.

### web-ui Phase 1 additions (additive — `web-ui`)

web-ui Phase 1 lands the Go-side UI foundation WITHOUT touching the plugin contract,
the enrich queue, `scan.Result`, or proto/sdk (additive: `proto/`/`pkg/sdk`/
`internal/{scan,enrich,plugin,module}` byte-identical vs `58a1130`). Key additions:

- **`internal/web` (NEW; 2 symbols: `Handler`, `Options`).** The embedding + composition layer. `Handler(apiHandler, Options)` builds one chi router mounting `/api/*` → the passed-in api handler (nil-safe — tests serve SPA/swagger alone), `/openapi.{yaml,json}` → the embedded committed spec bytes, `/docs/*` → Swagger UI (`github.com/swaggo/http-swagger`), and `/` + `/assets/*` + SPA-fallback → the embedded SPA (`//go:embed all:dist` — the first real `go:embed` in the codebase). `/assets/*` (hashed filenames) → `Cache-Control: public, max-age=31536000, immutable`; `index.html` → `no-cache`; broken hashed assets 404 (fail fast). `Options.DevMode` collapses both to `no-cache` (for the Vite dev proxy). The public surface is intentionally unauthenticated; `/api/v1/*` carries its own role-gating. Owns NO domain logic — does not import plugin/enrich/module/scan/store.
- **`internal/api` (3→7: +`Role`, +`AdminStatus`, +`PluginHealth`, +`EnrichStats`).** Role-aware auth arrives as a TYPE not a bool: `Role` (`RoleAdmin` minted, `RoleClient` gated — the Phase-2 swap point), `Principal{Role}` with `IsAdmin()`, and two `requireRole` route groups (browse = admin+client read-only; admin = admin-only mutating + liveness). Handlers never fork on `Role` — the group is the only authZ gate (arch §11.5). 3 additive GETs ship (`/libraries`, `/items/{id}`, `/admin/status`); `/admin/status` reads a `Deps.Status` closure (built in `cmd/mellifera` over `mgr.Status`+`enrichQueue.Stats`) — the INV2 anti-corruption seam that keeps api free of plugin/enrich imports (mirrors `Deps.Scan`). `AdminStatus`/`PluginHealth`/`EnrichStats` are the exported seam-input wire types (INV4). swag annotations on all 6 handlers (comment-only metadata; INV1 preserved). `IsAdmin()` is a method → excluded from the `check.sh` count; 7 ≤ 8 green.
- **`internal/store` (stays 5; +`ListLibraries` method).** `ListLibraries(ctx) ([]Library, error)` — parameterized SQL (`?`-bound, `ORDER BY id ASC`); a method, excluded from the symbol budget.
- **`cmd/mellifera`.** Composes `web.Handler(api.New(deps), web.Options{DevMode: cfg.webDev})` as the SOLE top-level `http.Handler` (no second `http.Server`). Builds the `Deps.Status` closure (iterates the canonical `pluginIDs` set, maps `plugin.Health`→`api.PluginHealth` RFC3339-at-the-edge, reads `enrichQueue.Stats()`→`api.EnrichStats`; best-effort — a per-plugin error omits one entry, does not fail the snapshot). Reads `MELLIFERA_WEB_DEV` (`envBool`, default `false`). **artwork:** builds `art.NewService` over the blob root `<dataDir>/art` and runs the `cmd/mellifera/janitor.go` registry — a boot-run of every enabled task before serving, then one ticker goroutine per task: `streams` (the packaged-playback sweep, fixed 60 s) and `art` (`MELLIFERA_ART_INTERVAL`, default 6 h, `0` = off).
- **`Makefile`.** New `web-build` target — DEV/CI-only (`swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml`; a commented Phase-2 `npm ci && npm run build`). NOT a prerequisite of `build`/`check`/`lint`/`test` (INV-node-free-gate).
- **`NOTICE`.** Records the bundled Swagger UI (Apache-2.0) served via `github.com/swaggo/http-swagger` + the code-generated OpenAPI spec.
- **`integration_web_test.go` + `qa_*_test.go`.** AC-1..AC-7 keystone (roles, swagger, list, item, admin-status, embed/delivery, build-gate node-free) + independent QA (browse-group default-deny, DTO-accuracy drift catcher, INV4 library wire key-set, empty-name asset guard, AC-7 node-free dry-run). Health-check P0/P1: 0; the two P2 cleanups (dead `Principal.Admin()` removed; byte-identical `libraryResponse`/`libraryDTO` collapsed) and two P3 doc-reconciliation notes (A-01/A-02) are recorded in the feature's review records (git history).

**Build-gate story (AC-7).** The Go gate (`make build`/`check`/`lint`/`test`) NEVER invokes `node`/`npm`/`swag` — it embeds COMMITTED artifacts (`internal/web/dist/*` — placeholder at Phase-1 time, real Vite build since 2a; `internal/web/api/openapi.{json,yaml}`). `make web-build` is the only node/swag-touching target (dev/CI). **Public-surface widens (R-2):** `/`, `/assets/*`, `/openapi.*`, `/docs` are now unauthenticated (static only — no data); all data stays behind role-gated `/api/v1/*`. Build-gate + R-2 posture + env knobs: **[`docs/operator-runbook.md`](operator-runbook.md)**.

### web-ui Phase 2a additions (additive — `web-ui-phase-2`)

Phase 2a lands the React app (scaffold + auth + admin library-management) WITHOUT
touching the Go side: `internal/api` (7 symbols), `internal/web` (2 symbols),
`cmd/mellifera`, `pkg/sdk/`, `proto/`, `plugins/`, and `go.mod` are byte-identical
vs `47f276e`; ZERO new API endpoints (the SPA consumes the 4 pre-existing routes:
`GET/POST /api/v1/libraries`, `POST /api/v1/libraries/{id}/scan`,
`GET /api/v1/admin/status`). Scoped by right-sizing: 2b (browse + item detail +
metadata rendering) + 2c (polish) are outlined for separate plans. Key additions:

- **`web/` (NEW npm project; node/npm dev-only).** Vite 5 + React 18 + TypeScript (strict) + `react-router-dom` v6 + TanStack Query v5 + Tailwind CSS v3. `vite.config.ts` sets `build.outDir = ../internal/web/dist` (the `//go:embed all:dist` target at `internal/web/web.go:20`), `emptyOutDir`, an `@/*` alias, and a dev proxy (`/api`, `/openapi.{yaml,json}`, `/docs` → `:8080`). `/web/dist/` and `node_modules/` are gitignored — the build output is committed at `internal/web/dist/`.
- **Auth layer (`web/src/lib/auth.ts` + `web/src/components/RequireAuth.tsx`).** Token-entry model (no Go login endpoint exists): `localStorage` under the fixed key `mellifera.token` (`useToken`/`getToken`/`setToken`/`clearToken`, try/catch-wrapped); `<RequireAuth>` is a presence-only guard (no format/claim validation — Go enforces authZ) that redirects to `/login` carrying `state.from`. XSS-in-localStorage is accepted for the 127.0.0.1-bound personal server (arch §11.5; revisit at D18).
- **API client (`web/src/lib/api.ts`).** DTO interfaces mirroring `internal/api/handlers.go` verbatim (`CreateLibraryRequest`, `LibraryDTO`, `LibrariesResponse`, `ScanResponse`, `PluginHealth`, `EnrichStats`, `AdminStatus`); `ApiError` (status/code/retryable); generic `apiRequest<T>` fetch wrapper — `Bearer` header whenever a token is present, `Accept: json`, JSON body stringify; 2xx → lossless `JSON.parse` (no rounding); 401 → `clearToken` + redirect to `/login`; non-2xx canonical-body → `ApiError`. `ENDPOINTS` lists ONLY the 4 pre-existing routes (AC-7).
- **Query hooks + provider root (`web/src/lib/queries.ts` + `main.tsx`).** `queryClient` singleton (mutations `retry: 0`), `useLibraries`, `useCreateLibrary` (invalidates `['libraries']` on success), `useScanLibrary` (no list invalidation — a scan does not change the row), `useAdminStatus` (`refetchInterval: 5000`). `main.tsx` = `StrictMode` > `QueryClientProvider` > `BrowserRouter`.
- **Admin panel pages.** `Login.tsx` (token-entry form, inline validation, already-authed → redirect); `admin/Admin.tsx` (shell + nav); `admin/Libraries.tsx` (list + add-library form with the NFS-mount note + per-row **Scan** button with inline `ScanResponse` and per-row error keyed by library, disabled while pending); `admin/Status.tsx` (plugin-health table + enrich-stats grid on a 5s poll; 503 → "Status unavailable"). Routing in `App.tsx`: `/login` public, `/admin/*` behind `<RequireAuth>`, `/` → `/admin` (becomes `/browse` in 2b).
- **shadcn/ui primitives (`web/src/components/ui/` — 8 files).** Copy-in `alert`, `badge`, `button`, `card`, `input`, `label`, `select`, `table` (cva variants, `forwardRef`, Apache-2.0 headers; Radix only behind `label`/`select`/`slot`). `lib/utils.ts` exports `cn()` (clsx + tailwind-merge). No shadcn runtime package.
- **`internal/web/dist/*` (REGENERATED bytes).** The real Vite build replaces the Phase-1 placeholder: `index.html` (`<div id="root">`, references the hashed assets) + `assets/index-*.js|css` (Vite-hashed names — rebuilt on every `npm run build`); `assets/app.js` placeholder deleted. The embed target, `web.Handler`, and `Options` are unchanged.
- **`Makefile` (`web-build` corrected + uncommented — R1).** `swag init -g internal/api/doc.go -o internal/web/api -ot json,yaml` + `cd web && npm ci && npm run build` (the Phase-1 comment wrongly said `cd internal/web`); a comment block records the resolved paths. Still NOT a prerequisite of `build`/`check`/`lint`/`test` (node-free gate). Known dev-tooling limitation: the `swag init` step fails on a PRE-EXISTING `json.RawMessage` parse issue (Phase-1-era, out of 2a scope) — regen the SPA via `cd web && npm run build`; the committed `openapi.{json,yaml}` remain valid.
- **`.golangci.yml`.** + `issues.exclude-dirs: [node_modules]` — a stray `.go` example file inside an npm dep's tree tripped `golangci-lint run ./...` (and thus `check.sh`) on dev hosts. `node_modules/` is gitignored, so the node-less gate host is unaffected (reviewer-accepted deviation). The complexity-budget table is unchanged.
- **Test-only Go adjustments (`internal/web/web_test.go` + `integration_web_test.go`).** The Phase-1 tests hard-coded placeholder bytes (`/assets/app.js`, "Mellifera SPA placeholder"). Both now discover the first `.js` file in `dist/assets` at test time (hash-agnostic) and assert the `<div id="root">` mount point. This resolved the T12 blocker — no production Go source changed (reviewer-accepted deviation).
- **Tests.** `web/` Vitest (api wrapper incl. 401-clearToken+redirect and lossless number round-trip; query hooks incl. cache invalidation; Libraries list/add; scan trigger; Status; document accessors). Go: `integration_web_test.go` (AC-1..AC-7 keystone) updated as above.

### web-ui Phase 2b+2c additions (additive — same openspec change, archived 2026-10-06)

Phase 2b+2c complete the user-facing SPA on top of the 2a scaffold, still with a
byte-identical Go production tree (the only Go diff is the additive
`integration_web_items_test.go` items-contract test: library-required envelopes,
pagination constants 50/200, full-document byte-fidelity, 404 shape):

- **Browse (`web/src/pages/browse/Browse.tsx`).** Library-scoped item browsing: `useItems` (`["items", params]` TanStack Query hook, `?library=&limit=&offset=`) with pagination and per-library selection; routes live under `<RequireAuth>` (`/browse`, `/items/:id`; `/` and `*` → `/browse`).
- **Item detail + metadata rendering (`ItemDetail.tsx` + `web/src/components/metadata/`).** `useItem` (`["item", id]`) + the §3.1 document renderer: `SourceCard` (per-source namespaces), recursive `JsonValue`, `ProvenanceBadge` (per-field `_provenance`), `ViewFields` (`_view`), `StagesProgress` (`_stages`). Accessors live in `web/src/lib/document.ts` (`sourcesOf`/`viewEntries`/`provenanceEntries`/`stageEntries`) — components stay presentational; `lib/api.ts` gained `ItemDTO` (field names mirror the Go json tags verbatim) + `listItems`/`getItem`.
- **Polish (2c).** `ThemeToggle` (light/dark, persisted in `localStorage` `mellifera.theme`), shared loading/error/empty states (`components/states.tsx`), `AppNav` navigation, and SPA route polish.
- **`internal/web/dist/*` regenerated** for the new build. Client roles, `RoleClient` minting, and the recent-items widget remain deferred ([`backlog.md`](backlog.md)); behavior: `openspec/specs/web-ui/spec.md`.

### serials-library additions (additive — archived 2026-10-08)

Serial (episodic TV box-set) libraries as a second first-class library kind,
with ZERO new protos (decision D-1 pattern holds — the serial trio are
`scanner`/`metadata_source` subprocesses):

- **`plugins/serial-scanner`** (scanner): walks the serial root into series
  candidates; **`plugins/serial-parser`** (`metadata_source`): serial-level +
  episode-level facts from directory structure (local, no network);
  **`plugins/frame-grabber`** (`metadata_source`): ffmpeg JPEG grabs under
  `<dataDir>/thumbs/` stamped as `sources["frame-grabber"].thumbnail_path`
  into episode documents — the fact media-preview later serves.
- **Series tables + wire**: `ser_<libraryID>_<sha16>` opaque ids; `GET
  /api/v1/series`, `/series/{id}`, `/series/{id}/episodes` in the browse
  group (the serial document is opaque on the wire exactly like an item
  document). `ready`/`stale`/`deleted` series lifecycle.
- **SPA**: the serial collection page (series grid + episode flow into the
  same ItemDetail), module-`serial` sidebar/type accents.

### web-ui-phase-3 additions (additive — archived 2026-10-08)

The viewer-shaped SPA shell on top of the admin/browse skeleton:

- **Sidebar shell** (`components/Sidebar.tsx` + `.side*` CSS): hidden by
  default, FAB toggle, independently-scrolling collections list with pinned
  nav + profile footer; detail pages highlight the parent collection entry
  (shared `["item", id]` cache key — one request total).
- **Home** (`pages/home/Home.tsx`): collection cards (+ summaries via `GET
  /libraries/{id}/summary`, folders via `/libraries/{id}/folders`), Continue /
  Next-up rails over the playback-progress endpoints (`GET /progress`,
  `GET/PUT /progress/{item_id}` — PUT is a viewer action, browse group).
- **Collections** (`pages/collections/Collection.tsx`): tv body (parsed chips
  + raw filename + limit/offset paging), photos body (folder-chip client-side
  filter + CSS-columns masonry with capture-date footers), serial body (the
  series grid + episode flow).
- **Admin**: collections table (sticky header, edit overlay over
  `PATCH /libraries/{id}` — identity fields immutable), no plugin/enrich UI.
- **Library mutations in the SPA**: `UpdateLibraryRequest` sends only present
  fields (Go decodes pointers); root_path/module_id are unrepresentable in
  the TS type (server 400s them regardless).

### media-preview additions (additive — archived 2026-10-09)

Real media bytes + the viewer-first detail page (the first NEW capability
spec since async-enrichment: `openspec/specs/media-serving/spec.md`):

- **`GET /api/v1/items/{id}/media`** (+ explicit HEAD — chi does not fold
  HEAD into Get) in the browse group, `internal/api/handlers.go itemMedia`:
  `http.ServeContent` bytes, Content-Type by extension, strong ETag +
  `Cache-Control: private, immutable`, 304s. Paths resolve ONLY from the
  stored document — `parsed.absolute_path` for the original,
  `sources["frame-grabber"].thumbnail_path` for `?variant=thumb`; a thumb
  miss is a 404 (no server-side fallback — strict D6). Non-image bytes carry
  `Content-Disposition: attachment` — **video downloads, it does not
  stream**; `internal/stream` stays deferred.
- **SPA media channel** (`web/src/lib/api.ts fetchItemMediaObjectUrl` +
  `queries.ts useItemMedia`): an `<img>` cannot carry the bearer header, so
  bytes are fetched through the authenticated wrapper into ONE blob object
  URL, revoked on unmount/URL-change (deliberately not TanStack-cached —
  cached object URLs would be dead). Photo masonry tiles, movie/episode
  cards, and Home collection-card previews render real images over the
  ratio-correct placeholder fallback; a thumb-less video is not previewable.
- **ItemDetail viewer-first restructure**: the Details surface (core fields,
  identifiers, `_view`, and the item's own HERO IMAGE) leads; Sources/
  Provenance/Pipeline stages collapse into one native `<details>` "Technical
  details" disclosure — content byte-identical when expanded (visibility
  changed, fidelity did not).
- **E2E**: `internal/itest/integration_media_test.go` (built server, real
  scanned fixtures, bytes + headers + 304 + error contract).

### packaged-playback additions (additive — archived 2026-10-09)

Remux-only playback without transcoding — playback time degenerates to static
file serving (no sessions, no per-play processes, no encode anywhere):

- **`internal/stream` (NEW — realized from DEFERRED; 4 counted symbols:
  `Build`, `Class`, `Classify`, `Service`).** The playback mechanism: pure
  playback classification over stored ffprobe facts (D-2 — never stored, never
  client-driven), the fMP4-HLS pack lane (one ffmpeg exec site, `-c copy`
  stream-copy only; head-first 600 s first chunk published playable; atomic
  build-nonce publish), the short-lived HMAC media token (cookie-first +
  query fallback, 4 h — never the admin secret, never logged), the
  token-gated `/media` ServeHTTP surface (playlists, segments, direct
  originals with `Range`), and `Describe` (the read-only playback
  descriptor). The direct floor (original bytes) is unconditional for every
  class.
- **`internal/orchestrator` (NEW — pure policy core, stdlib-only imports).**
  Watch-driven serial frontier + movies pack-on-play as pure functions:
  snapshots in (store read passed IN as data), decisions out (jobs, budget
  evictions). `cmd/mellifera/playback.go` is the thin shell that executes the
  decisions — the policy core never execs ffmpeg, never writes item
  documents, never touches a library directory.
- **`internal/enrich` (+`streams.go` — the `__streams__` lane).** Packaging
  jobs ride the SAME derived queue as metadata sources under the dedicated
  `__streams__` key, through the `Deps.PackItem` func seam (enrich never
  imports stream — D-10). Lease RENEWAL while a long pack runs; failure =
  `pack_failed` ledger row with a FLAT 30-day cooldown; the lane replaces
  ONLY the document's `streams` namespace.
- **`internal/api` (+`playback.go`; +`Playback` exported → 8).**
  `GET /items/{id}/playback` (read half) + `POST /items/{id}/play` (write
  half — `retry` re-enqueues a failed pack), both browse group over nil-safe
  `Deps.Playback`/`Deps.Play` closures (nil → 503). The fresh media token
  rides `Set-Cookie`, never a body field (INV4).
- **`internal/web` (+`Options.Media`).** Mounts the stream surface at
  `/media` + `/media/*` BEFORE the SPA fallback.
- **`cmd/mellifera` (+`playback.go`).** Builds `stream.Service`, the api
  closures, the EnqueuePack dispatch and budget evictions; new env knobs
  `MELLIFERA_ORCH_BUDGET_GB` (default 32, `0` = off) and
  `MELLIFERA_MEDIA_SECRET`. `ffmpeg` is now a pack-lane runtime dep
  (per-item soft-fail — see the runbook).
- **`internal/itest` (+3)**: `qa_playback_harness_test.go` +
  `qa_playback_roundtrip_test.go` + `qa_streams_joint_test.go` (real graph
  end to end).
- OpenAPI + `internal/web/dist` regenerated. Gate-review fixes landed in the
  same commit (tail-segment serving, `TestDirectFloor`). Behavior:
  `openspec/specs/packaged-playback/spec.md`; operations:
  [`operator-runbook.md`](operator-runbook.md) §1/§2.

### element-pages additions (additive — archived 2026-10-10)

Media-first element detail pages + per-item parser attachments. NEW living
capability spec: `openspec/specs/parser-display/spec.md`; web deltas in
`openspec/specs/web-ui/spec.md`. Presentation declarations are CONFIG, not
code — the core carries `identity_fields`/`display_fields` as opaque strings
and never branches on them (AC-4; INV5 in `internal/module`):

- **`internal/module` (stays 7).** Every seed config (tv, image, serial)
  gains `identity_fields` per module + `display_fields` per scanner and
  metadata_source binding; pure presentation accessors `IdentityFields`/
  `DisplayFields` are methods (outside the symbol budget).
- **`internal/store` (+`item_parsers.go`; tables in `open.go` schemaSQL).**
  `item_parsers` (element-only attachments, keyed `(item_id, plugin_id)`,
  position = attachment order; follow the item's IDENTITY — survive
  id-preserving re-scans, die with a re-identified item) and
  `library_parsers` (the per-library parser chain). `SetItemParsers`/
  `ListItemParsers`, `SetLibraryChain`/`GetLibraryChain`/`TestLibraryChain`
  — all FULL-replacement, transactional, orphan-tolerant reads (the
  `playback_progress` pattern).
- **`internal/api` (+`parsers.go`; +`ParserBinding` + `ModulePresentation`
  → 10, WARN band).** `PUT/DELETE /items/{id}/parsers` (admin group; 400
  validation via `Deps.PluginCapabilities` BEFORE any write; 404 with
  nothing written for a ghost item), the optional ordered `parsers`
  full-replacement field on `PATCH /libraries/{id}` (empty list = 400 — a
  chain is reordered, never cleared), `extra_parsers` on the item detail
  DTO, and the additive `module` presentation block on
  `GET /libraries/{id}` via `Deps.ModulePresentation` (nil closure = block
  omitted; stored chain overlaid onto config order). OpenAPI regenerated:
  16→17 paths; `internal/web/dist` rebuilt.
- **`internal/enrich`.** Queue derivation adds two inputs: element-attached
  sources (`ListItemParsers`, items only, same D-Q1 predicate — a
  chain-declared CLIENT source stays unqueueable) and the library chain
  (`GetLibraryChain` → `chainOrderedSources`: chain order IS the queue
  priority; absent chain = config order). `Enrich` gains backward-compatible
  variadic extras — attached sources run after the chain in attachment
  order through the identical per-source path (element attachment changes
  WHO runs, not how a source writes).
- **`cmd/mellifera`.** `loadPlugin` factors the per-plugin Load+Start pair so
  `loadedCaps` is captured at the declaration site (one source for the
  validation closure); builds `Deps.ModulePresentation` over
  `module.Registry`. No new env knobs.
- **`web/src`.** ItemDetail restructured media-first: identity block from
  `identity_fields`, `components/metadata/ParserFooter.tsx` (one group per
  parser in chain order — element-only groups last, pill-marked; values
  verbatim from the parser's own namespace; absent pairs skipped
  silently), prev/next browsing with the position handoff passed from every
  grid surface (collections + serial flow), photo slideshow (fixed 2.5 s
  cadence, `s`/`S` toggle, never survives navigation). `lib/api.ts` gained
  `ParserBinding`/`ModulePresentation` DTOs + `getLibrary`; `lib/queries.ts`
  the `useLibrary` hook (non-fatal failure — the page degrades).
- **`internal/itest` (+2 + fixture).** `element_hermetic_e2e_test.go` +
  `element_parsers_test.go` over `testdata/element-parser/main.go` — the
  hermetic attach→drain→namespace E2E.

### serial additions (additive — archived 2026-10-12)

Parsing hardening for real serial layouts — plugins-only, zero new
protos/endpoints/exported symbols; deltas merged into the living
`openspec/specs/serial-library/spec.md`:

- **`plugins/serial-parser`**: NEW `releasetags.go` — the release-decoration
  vocabulary (bracket-segment rules, whole-token release-tag tables, CamelCase
  group-tag shape) as a NEUTRAL role-keyed mask (no resource brand in any
  identifier — extractable verbatim when the per-resource plugin projects
  land); `serialparse.go` grammar rework — always-season parse, anchored
  markers (incl. the "Season N" word form and "TV N" space/hyphen-dot), romans
  II–IX, and the episode number read from SxxExx / "N серия" / `[NN]` edge
  bracket / trailing standalone, with the season fallback stem → series dir →
  1; `parser.go` `Match` now ALWAYS writes season.
- **`plugins/serial-scanner`**: `sidecar.go` gains the replicated
  episode-number helpers; `walk.go` `associateSidecars` classifies a serial
  dir's sidecars into series-level facts and per-episode facts indexed by the
  same shapes (SxxExx by `{season, number}`, bare forms by number).
- **`internal/itest/qa_serial_e2e_test.go`**: expectations re-derived for the
  reworked grammar.

### display-naming additions (additive — archived 2026-10-14)

Per-item display naming — library-scoped naming options composed SERVER-side,
zero new protos or endpoints; deltas merged into the living
`openspec/specs/display-naming/spec.md`:

- **`internal/api` (+`display.go`; all-unexported composition core — the
  10-symbol WARN count holds).** Item list/detail and library responses carry
  a server-composed `display_name` (always on the wire); the per-library
  `naming_group_style`/`naming_element_name` options ride the existing
  `GET`/`PATCH /libraries/{id}` (validated BEFORE any write; a changed option
  re-composes every served name on the NEXT read — no rescan, no rebuild).
- **`internal/module`.** The display block's `item_name` is the ONE display
  key modeled in Go — `parseModule` decodes it verbatim into
  `Module.ItemName` (config data, never core logic; every other display key
  stays SPA-consumed config). The serial seed ships at `schema_version` 3
  with `"item_name": "{title} · S{season}E{episode}"` (U+00B7 separator,
  byte-matching the SPA compose); pre-v3 serial rows are promoted by a
  schema-guarded UPDATE on Open (idempotent, scoped to the serial row,
  chained after the v1→v2 upgrade).
- **`internal/store`.** `libraries` gains the `naming_group_style` /
  `naming_element_name` option columns (COALESCE partial UPDATE — a nil
  option leaves the stored column unchanged).
- **`internal/itest` (+1 file + fixtures).** `qa_display_naming_joint_test.go`
  asserts the store→api→module naming joints over the real server+plugin
  subprocess surface (module-default compose, option re-compose, the
  override/precedence tiers, group-style switching) — fully hermetic
  (datadir + library root under `t.TempDir()`).
- **`web/`.** Home/Collection cards render the server-composed
  `display_name`; the SPA never re-derives names. Vitest 153→155 cases
  (11 files).

### Capability model

Two capability types now ship (the open-set the core knows): `scanner` (base-scanner, serial-scanner) and
`metadata_source` (tv-parser, image-enricher, serial-parser, frame-grabber — still ZERO new capability types;
`image_provider` stays reserved). Phase A MAPS the user's parser/enricher categories
onto these two capabilities with **zero new protos** (decision D-1): tv-parser, image-enricher, and any enricher
implement `metadata.v1.MetadataSource`. Plugin selection is driven strictly by `module.MetadataSources[]`
(config), never by `if mediaType == "..."` (AC-4 — media-type literals appear only in `internal/module` seed config).
element-pages reuses exactly this pair as the attachable parser types: the
`PUT /items/{id}/parsers` and `PATCH /libraries/{id}` validation accepts a
plugin id only when its declared capabilities include `scanner` or
`metadata_source` (via the `Deps.PluginCapabilities` closure over the same
`[]sdk.Capability` literals the `cmd` Load sites carry).

**Still NOT built** (deferred): the `internal/janitor` package
(cleanup cron — artwork shipped the cmd-level sweep registry
`cmd/mellifera/janitor.go` instead); **Phase B3** — external enrichers (`tmdb`/`kinopoisk` real fetch + `AuthContext`
population, `_view` arbitration); **Phase C** — post-actions (needs arch design). Also: `go:embed`
first-run plugin extraction (dev-mode filesystem-path loading is used instead — D11/Q20); session-based
multi-user auth (single admin token for MVP — D18/Q15); store methods for reserved tables
(`RecordProgress`/`GetResume` — tables exist, methods deferred); an admin HTTP route over
`store.ListFailures` (the method ships in B1; the route is deferred — B1-light). Realized in B1 (no
longer deferred): the **async enrichment queue** + worker pool + per-item leases + the
`enrichment_failures` ledger + `failed→pending` retry + the `ready`/`stale` lifecycle states + the
pool-wide `busy_timeout`. **Realized in B2 (no longer deferred):** image+EXIF enrichment (image media
type + the `image-enricher` `metadata_source` subprocess + module-type-gated image discovery); RAW image
discovery (`.cr2/.nef/.arw/.dng`) remains deferred (exiftool reads RAW natively — cheap to add to `imageMime` later).
**Realized in web-ui Phase 1 (no longer deferred):** the Go-side UI foundation — `internal/web` (SPA +
Swagger composition via `go:embed`) + role-aware auth (`Principal{Role}`/`requireRole`) + 3 additive
GETs + the `Deps.Status` liveness closure + the `make web-build` regen path (the `Principal` abstraction
grounds the deferred session-based multi-user auth, D18/Q15). **Realized in web-ui Phase 2a+2b+2c (no longer
deferred):** the real React app — `web/` (`package.json` + `vite.config.ts` + `web/src/`), the
token-entry auth layer (`localStorage` + `<RequireAuth>`), the admin panel (libraries list/add/scan +
status), the client **browse** panel + item detail with §3.1 metadata rendering, and the polish layer
(theme toggle, shared states) — embedded as the REAL Vite build at `internal/web/dist/` (the Phase-1
placeholder shell is gone). **Realized in web-ui 2b+2c (no longer deferred):** the full
user-facing browse/detail surface + theme + shared states. **Realized in
serials-library (no longer deferred):** serial libraries end-to-end (the
serial trio of plugins, series tables + `/series*` wire, the series grid +
episode flow) — with the frame-grabber thumbnail fact that media-preview
serves. **Realized in web-ui-phase-3 (no longer deferred):** the sidebar
shell, Home rails over playback progress, the three collection bodies, the
admin collections table + edit overlay, `PATCH /libraries/{id}`. **Realized
in media-preview (no longer deferred):** item media byte serving (the
`media-serving` capability — originals + frame-grabber thumbs, document-only
path resolution) and the SPA's real-image rendering + the viewer-first
ItemDetail. **Realized in packaged-playback (no longer deferred):**
`internal/stream` — video no longer merely downloads: remux-only fMP4-HLS
pack playback over the token-gated `/media` surface (stream-copy only, no
encode; the direct floor keeps original bytes with `Range` for every item),
plus the `__streams__` enrichment lane and the watch-driven orchestrator
policy. **Realized in element-pages (no longer deferred):** per-item parser
attachments + the library parser chain (the `parser-display` capability —
`item_parsers`/`library_parsers` tables, `PUT/DELETE /items/{id}/parsers`,
`PATCH …parsers`, the `module` presentation block) and the media-first
element detail page (identity badges, chain-ordered footer, prev/next,
slideshow). **Still deferred:** the `internal/janitor` package (the cmd-level janitor registry shipped in artwork), client
panels for non-admin roles + the `RoleClient` resolver (type exists, no
minter yet), B3 (TMDB + `AuthContext`), Phase C (post-action) — see
[`backlog.md`](backlog.md).

The per-feature wf records (plans, contracts, reviews, qa, state) were removed on
2026-10-06 — behavior lives in `openspec/specs/` (scan-library, plugin-pipeline,
async-enrichment, image-enrichment, web-ui, serial-library, media-serving, and
the playback-progress additions inside web-ui), the gate records in
`openspec/changes/archive/`, and the full records in git history.

## Open questions the planner must resolve

From the enhanced objective (nice-to-have unless marked blocking):

1. Whether to split the slice into a thinner first vertical if the full slice is too large for one clean pass (explicitly authorized).
2. SQLite driver — `modernc.org/sqlite` (recommended; planner confirms).
3. Module path — `github.com/mellifera/mellifera` (confirm or flag).
4. (Blocking at completion only) Whether `.claude/` (gitignored repo-wide) gets force-added on commit.
5. (Blocking at completion only) Whether `docs/` design docs get committed with the feature or separately.
