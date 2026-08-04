# Source Baseline — image-enrichment (Phase B2)

> Snapshot of the code this feature refactors/extends. All facts G2-verified against
> live source on `feature/image-enrichment` (off `main` @ `e2a7562`). No
> `.source_map.json` exists for this repo; every fact below is transcribed from a
> direct source Read. Zero `UNVERIFIED:` tokens.

## What EXISTS now (Phase A + B1) vs what this feature does

- **EXISTS (reuse, extend — NO change):** the B1 async queue
  (`internal/enrich` queue/worker/chain/lease/retry/state/ledger), the
  `metadata.v1.MetadataSource` proto + `pkg/sdk` adapter, `internal/store`
  (media-type-agnostic items + provenance document), `internal/api` (library create
  + scan + items, all keyed by an opaque `module_id`), the build gate.
- **THIS PLAN (Phase B2 — image media type + EXIF enricher via exiftool subprocess):**
  extend `plugins/base-scanner` walk to discover images incl. HEIC/HEIF (stdlib
  `image.DecodeConfig` for jpg/png/webp base dimensions/format; HEIC/RAW base info
  soft-fails — stdlib has no decoder); add `plugins/image-enricher` (a
  `metadata_source` subprocess mirroring `plugins/tv-parser`) that invokes the
  **system-installed `exiftool`** via `os/exec` arg-slice (the SAME pattern as
  `ffprobe`); stamp the absolute file path into the base document so the enricher
  can run exiftool on it (`internal/scan`); seed an `image` module
  (`internal/module`); load the new plugin (`cmd/mellifera`). **No new Go module
  dependency** — exiftool is a runtime dep like ffmpeg/ffprobe.
- **DEFERRED (outlined, NOT built):** RAW discovery (cr2/nef/arw/dng — cheap to add
  to the extension set since exiftool reads them; held back only to keep B2's
  extension set bounded); external image enrichers (reverse-image-search / online
  EXIF — B3-style); image generated columns (width/height/date_taken) in the store
  (data lives in the opaque document for B2); Phase C post-action.

## Module: plugins/base-scanner — discovery + base-info scanner (MODIFY)

`evidence: plugins/base-scanner/walk.go:25-123, scanner.go:32-95, ffprobe.go:29-53`

- `mediaMime` — `walk.go:25-38` — video-only extension→MIME map (`.mkv .mp4 .m4v
  .mov .avi .webm .wmv .flv .mpg .mpeg .ts .m2ts`). **THIS becomes** a
  module-type-selected map: `image` module → image extensions
  (jpg/jpeg/png/webp/**heic/heif**); else → the existing video set.
- `walk(ctx, root, opts)` — `walk.go:50-79` — `filepath.WalkDir`, emits one
  `DiscoveredFile` per regular media file on a bounded channel (`walkChanBound=16`).
  **THIS becomes** `walk(ctx, root, moduleType, opts)` so the extension map is
  selected by module type (sanctioned by `scanner.proto`: "Module type … Guides the
  scanner's parsing heuristics").
- `toDiscovered(ctx, root, path, d)` — `walk.go:84-105` — builds `DiscoveredFile`
  (file_id, relative_path, size, mime_type) and calls `probe` (ffprobe) at
  `walk.go:93` for EVERY media file. **THIS becomes** a family branch: image ext →
  `probeImage` (stdlib `image.DecodeConfig` → `{width,height,format}` JSON into the
  opaque `ffprobe_json` field); video ext → `probe` (ffprobe, unchanged).
- `isMedia` / `mimeType` — `walk.go:115-123` — keyed off `mediaMime`. **THIS becomes**
  keyed off the selected map.
- `probe(ctx, absPath)` — `ffprobe.go:29-53` — runs the `ffprobe` binary, arg-slice
  only (never a shell; golang-security), 30s timeout, ALL failures soft (empty bytes
  + warning, `INV3`). **Unchanged**; the new `probeImage` mirrors its
  `(data, warning, err)` signature + soft-fail contract.
- `Scan` — `scanner.go:38-48` — resolves+validates root, calls
  `walk(ctx, absRoot, req.GetOptions())`. **THIS becomes** passing
  `req.GetModuleType()` into `walk`.
- `Identify` — `scanner.go:59-73` — media-type-agnostic: `Parsed = {relative_path,
  extension}`, `MediaType = req.GetModuleType()`, `ParserName "base"`,
  `baseConfidence = 0.5` (`scanner.go:32`). **Unchanged** — base-scanner stays
  media-type-agnostic; image intelligence is the enricher's job.
- `main.go` — `plugins/base-scanner/main.go:15-42` — cookie pair
  (`MELLIFERA_MAGIC_COOKIE`/`mellifera-plugin-v1`), `sdk.Serve(ScannerPlugin +
  pluginSvcPlugin)`. **Unchanged.**
- `pluginsvc.go` — Handshake advertises ONE `scanner` capability. **Unchanged.**

**Patterns:** soft-fail per file (AC-6 philosophy); arg-slice-only `exec.Command`;
opaque `ffprobe_json` ("the core does not structurally inspect ffprobe fields —
only plugins and the storage layer via json_extract", `scanner.pb.go:113-118`).

## Module: plugins/tv-parser — the metadata_source pattern to MIRROR (reference)

`evidence: plugins/tv-parser/main.go:16-47, parser.go:32-153, pluginsvc.go:24-77, tvparse.go, doc.go`

The image-enricher is a byte-for-byte structural mirror (only the capability body
differs: filename parse → EXIF extraction). Transcribed so the coder copies the
shape, not reinvents it.

- `main.go:16-47` — `pluginID="tv-parser"`, cookie pair, `sdk.Serve(
  &sdk.MetadataSourcePlugin{Impl: impl}, &pluginSvcPlugin{})`. **image-enricher
  mirrors with `pluginID="image-enricher"`.**
- `parser.go:32-51` `Match` — applies iff the parse yields a season/episode token;
  else `Applies:false` (skipped, never an error — AC-6). Carries the parse as
  `Query`.
- `parser.go:58-60` `BuildRequest` — nop (empty `RequestSpec`); Phase A has no
  fetch. **image-enricher mirrors** (the local EXIF "fetch" is the file read,
  done in Convert, not via BuildRequest).
- `parser.go:68-74` `Convert` — normalizes `Query` → `Metadata` + per-field
  `Provenance` hints. **image-enricher mirrors the SHAPE, not the body**: Convert
  runs the **system `exiftool`** subprocess (`exec.Command("exiftool","-j","-n",
  <selected tags>, absPath)` — arg-slice, NEVER shell; the SAME pattern as base-scanner's
  `probe`/`ffprobe.go:29-53`), parses the JSON array, maps the known tags → metadata,
  and soft-fails (empty metadata → B1 `no_data`) if exiftool is missing/fails.
- `parser.go:83-103` `Merge` — writes `document.sources[pluginID]` ONLY; never
  `_provenance/_view/_stages` (core-stamped); proposes `View` bindings. **image-enricher
  mirrors verbatim** (only `pluginID` differs).
- `parser.go:141-153` `provenanceHints` — per-field `{plugin_id, plugin_version,
  fetched_at}` (confidence left to the core). **image-enricher mirrors.**
- `pluginsvc.go:24-77` — `pluginSvcPlugin` + `pluginServiceImpl`: `Handshake`
  advertises ONE `metadata_source` capability (`ProtoService =
  "mellifera.metadata.v1.MetadataSource"`), `Health=SERVING`, no-op `Shutdown`.
  **image-enricher mirrors verbatim.**
- `pathFromParsed` (`parser.go:111-123`) — reads `parsed.relative_path`/`stem`.
  **image-enricher's analog** reads `parsed.absolute_path` (the new key scan stamps).

## Module: pkg/sdk — MetadataSource adapter (NO change)

`evidence: pkg/sdk/metadata.go:23-101`

- `MetadataSource` interface (`metadata.go:23-28`) — `Match/BuildRequest/Convert/Merge`
  (4 unary RPCs). The image-enricher implements this EXISTING interface (R8: ≥2
  implementations — the subprocess client + an in-process test fake already exist).
- `MetadataSourcePlugin` (`metadata.go:39-55`) — dual-side go-plugin adapter.
  **Unchanged** — no new proto, no new capability type.

## Module: internal/enrich — the B1 async queue (NO change)

`evidence: internal/enrich/enrich.go:63-205, chain.go:49-334, worker.go:297-334, retry.go:42-70, state.go:11-101`

Image items flow through this UNCHANGED. Confirmed by reading the four load-bearing
paths:

- `runSource` (`chain.go:49-97`) — drives Match→BuildRequest→Convert→Merge; passes
  `Document: &commonv1.MediaDocument{}` (EMPTY) at `chain.go:79` — the plugin gets
  ONLY its own `Incoming` + `PluginId`, never the full core document. **Load-bearing
  for the design: the enricher's real input is `Item.Parsed`, so the file path must
  ride in `parsed`.**
- `validateNamespace` (`chain.go:104-122`) — plugin may write ONLY
  `sources.<plugin_id>`; a foreign key is rejected+reverted (soft-fail). image-enricher
  writes `sources.image-enricher`.
- `reconstructBase` (`chain.go:115-122`) — rebuilds the base `IdentifyResult` from
  `doc["parsed"]` ONLY (no re-probe). **Unchanged** — so anything the enricher needs
  must be in `doc["parsed"]`.
- `runSourceRetryable` (`retry.go:42-70`) — **empty-namespace success → terminal
  `no_data`** (`retry.go:53-55`); non-empty → clean success (`retry.go:56`). So a
  valid image (enricher returns ≥ `{width,height,format}`) succeeds cleanly; a
  totally unreadable image → `no_data` terminal → ledger → cooldown → settles.
- `allSourcesTerminal` (`worker.go:297-311`) + `attemptedNoWork`
  (`worker.go:323-334`) — the settle predicate. **Unchanged** — image items reach
  `ready` via the same path as TV.
- `state.go:11-101` — the lifecycle set/transitions; `enriched --settled--> ready`
  (`state.go:79`). **No new statuses** for B2.

## Module: internal/scan — discovery orchestrator (MODIFY)

`evidence: internal/scan/run.go:70-369`

- `Run` (`run.go:70-73`) → `runScan` (`run.go:113-166`). `runScan` resolves
  `lib, _ := st.GetLibrary(ctx, libraryID)` (`run.go:116`) — so **`lib.RootPath` is
  in scope** at the scan layer (the core, where the absolute path is reconstructed
  per `DiscoveredFile.RelativePath` comment "Absolute path is reconstructed by the
  core", `scanner.pb.go:108-109`).
- `persist` (`run.go:179-193`) — calls `assembleBaseDoc(f, identified,
  mod.MediaType, mod.SchemaVersion)` at `run.go:185`. **THIS becomes** threading the
  reconstructed absolute path (`filepath.Join(lib.RootPath, f.RelativePath)`) into
  `assembleBaseDoc` so it is stamped into `doc["parsed"]["absolute_path"]` — the
  channel the image-enricher reads. Additive for ALL items (tv-parser ignores it).
- `assembleBaseDoc` (`run.go:334-352`) — builds `{file_id, module_type,
  schema_version, parsed, ffprobe}`. **THIS becomes** merging `absolute_path` into
  the parsed map before marshalling.
- `baseChanged`/`baseSignature` (`run.go:232-251`) — stale-on-rescan compares
  `parsed + ffprobe`. Adding `absolute_path` to parsed is safe: it is deterministic
  for (root, relative_path), so no false-stale.
- `nextScanStatus` (`run.go:213-222`) — pending/stale/preserve. **Unchanged** —
  image items enqueue as `pending` exactly like TV.

## Module: internal/module — config registry (MODIFY)

`evidence: internal/module/registry.go:27-230, doc.go`

- `Open` (`registry.go:125-160`) — seeds the built-in TV module with ONE
  `ExecContext(seedModulesSQL, "tv", "tv", tvConfigJSON, 1, 1, …)` at
  `registry.go:127-131`, then loads enabled modules. **THIS becomes** seeding a
  SECOND row for the `image` module (a second `ExecContext`, same idempotent
  `INSERT OR IGNORE`, `modules.media_type UNIQUE` accepts `"image"`).
- `tvConfigJSON` (`registry.go:44-81`) — the TV module config binding `base-scanner`
  (scanner) + `tv-parser` (priority 1) + kinopoisk/tmdb (designed, soft-fail). **THIS
  mirrors** an `imageConfigJSON`: `base-scanner` (scanner) + `image-enricher`
  (priority 1), `media_type:"image"`, no auth_mode (local parser).
- `seedModulesSQL` / `listModulesSQL` (`registry.go:27-34`) — parameterized, idempotent.
  **Unchanged.**
- 7 exported symbols (`doc.go:14` INV4). Adding the image seed adds NO exported
  symbols (a `const` + a second `Exec`) → stays at 7.

## Module: internal/store — media-type-agnostic persistence (NO change)

`evidence: internal/store/items.go:16-163, open.go:34-224, libraries.go:16-50`

- `Item` (`items.go:16-28`) — carries `MediaType string`; the document is opaque
  `json.RawMessage`.
- `PutItem` (`items.go:42-71`) — upsert by `file_id`; never branches on media_type.
- `QueryItems` (`items.go:88-126`) — `status` is a parameterized `?` filter
  (INV1: never interpolated); media_type-agnostic.
- `items` DDL (`open.go:62-78`) — `media_type TEXT NOT NULL`; generated columns are
  TV/movie-oriented (`display_title`, `display_rating`, `tmdb_id`, `kinopoisk_id`).
  **No image generated columns in B2** — image dimensions/EXIF live in the opaque
  document (`ffprobe` base info + `sources.image-enricher`); querying by dimension
  uses `json_extract` at read time (no index — deferred). No migration: generated
  columns can't be added idempotently to an existing table (`open.go:30-33`), and B2
  is additive-only.
- `Library.RootPath` (`libraries.go:16`), `CreateLibrary`, `GetLibrary`. **Unchanged.**

## Module: cmd/mellifera — composition root (MODIFY)

`evidence: cmd/mellifera/main.go:60-197`

- `main` loads `tv-parser` (`main.go:88-91`): `mgr.Load("tv-parser",
  cfg.tvParserPath, []sdk.Capability{{Type:"metadata_source",…}})` +
  `mgr.Start`. **THIS mirrors** an `image-enricher` Load+Start block (same
  capability declaration, `metadataService`).
- Shutdown order (`main.go:148-151`) stops plugins last. **THIS adds**
  `mgr.Stop(shutdownCtx, "image-enricher")`.
- `config.tvParserPath` (`main.go:159`) from `MELLIFERA_TV_PARSER` env
  (`main.go:181`). **THIS adds** `imageEnricherPath` from
  `MELLIFERA_IMAGE_ENRICHER` (default `bin/image-enricher`).

## Module: internal/api — HTTP edge (NO change)

`evidence: internal/api/handlers.go:32-110, router.go:42-43`

- `createLibrary` (`handlers.go:77-94`) — `createLibraryRequest{ModuleID, RootPath,
  DisplayName}` → `store.CreateLibrary(ctx, ModuleID, …)`. `ModuleID` is an arbitrary
  string — an image library is `POST /api/v1/libraries {"module_id":"image",…}`. **No
  change.**
- `scanLibrary` (`handlers.go:97-110`) + items listing (`?status=`) — media-type
  agnostic. **No change.**

## Module: Protos (NO edit — additive)

`evidence: proto/mellifera/scanner/v1/scanner.pb.go:103-127,260-279; proto/mellifera/metadata/v1/metadata.pb.go:27-688`

- `DiscoveredFile` (`scanner.pb.go:103-127`) — frozen: `RelativePath` ("Absolute
  path is reconstructed by the core", `:108-109`), `FfprobeJson []byte` (opaque probe
  field, `:113-119`). image base info rides `FfprobeJson`; the absolute path is
  reconstructed by scan (the core), not added here.
- `IdentifyResult.Parsed` (`scanner.pb.go:267-272`) — "Free-form JSON whose keys are
  module-interpreted." Adding `absolute_path` for image items is within this contract.
- `MetadataSource` messages (`metadata.pb.go`) — `MatchRequest.Item`,
  `ConvertResult.Metadata`, `MergeRequest.Document`/`PluginId`. **No edit** —
  image-enricher implements the EXISTING service (AC-3 additive).

## Build / deps / lint

`evidence: go.mod:1-34, Makefile:1-40, .golangci.yml, .claude/skills/mellifera-build/scripts/check.sh`

- `go.mod` — module `github.com/mellifera/mellifera`, go 1.25. Deps today:
  `go-plugin`, `grpc`, `protobuf`, `modernc.org/sqlite` (pure-Go — confirms the
  NO-CGO posture). **NO `image/*` imports present yet; NO exiftool binding yet.** B2
  adds **NO new Go module dependency** — EXIF is read by invoking the system
  `exiftool` binary via `os/exec` (a runtime dep like `ffmpeg`/`ffprobe`). Stdlib
  `image/jpeg`/`image/png`/`image/webp` are added to `plugins/base-scanner` ONLY (for
  base dimensions/format at discovery; stdlib has no HEIC/RAW decoder → those base-info
  reads soft-fail, and exiftool supplies full data at enrichment).
- `Makefile build-plugin` — builds `bin/base-scanner` + `bin/tv-parser`. **THIS adds**
  `bin/image-enricher` + a runtime-deps note/target documenting `exiftool`
  (`brew install exiftool` / `apt install libimage-exiftool-perl`) alongside
  `ffmpeg`/`ffprobe`.
- Gate (`check.sh`): exported-symbol count per package (WARN >8, FAIL >12; `*.pb.go`
  exempt); `golangci-lint` (funlen 60, gocognit/gocyclo 15, lll 120, dupl 100,
  depguard denies `reflect` + DI). `CGO_ENABLED=0` everywhere.

## Cross-Module Dependencies (the seams this feature opens)

| Symbol / data | Defined in | Imported/Used by | B2 change |
|---|---|---|---|
| `absolute_path` (parsed key) | `internal/scan` (NEW stamp) | `plugins/image-enricher` (reads via `base.Parsed`) | NEW additive key; tv-parser ignores it |
| `mediaMime` ext selection | `plugins/base-scanner/walk.go:25` | `walk`, `toDiscovered`, `isMedia`, `mimeType` | module-type-selected map |
| `probeImage` (stdlib decode) | `plugins/base-scanner` (NEW) | `toDiscovered` (image branch) | NEW; mirrors `probe` signature |
| `MetadataSource` interface | `pkg/sdk/metadata.go:23` | `plugins/image-enricher` (impl), `internal/enrich/chain.go:54` | NO change (new impl) |
| `imageConfigJSON` / image seed | `internal/module/registry.go` (NEW) | `Open` (second seed) | NEW const + Exec |
| `image-enricher` plugin load | `cmd/mellifera/main.go` (NEW block) | `mgr.Load/Start/Stop` | mirrors tv-parser block |
| `sources.image-enricher` (namespace) | `plugins/image-enricher` Merge (NEW) | `internal/enrich` `validateNamespace`/`applyContribution` | NEW namespace (core validates, no branch) |

## Test Inventory

- Framework: Go `testing`, table-driven, in-package fakes injected via the
  unexported resolver seams (`scan.scannerResolver`/`enricher`, `enrich.metadataResolver`
  — R8 second-impl). Package clock `var now = time.Now` (`enrich.go:21`) for
  deterministic `_stages`/`_provenance` timestamps.
- Existing tests B2 extends/mirrors: `plugins/tv-parser` (the structural mirror
  source), `internal/module/registry_test.go:95-113` (List after seed — image module
  appears), `internal/scan` in-package tests (absolute_path stamp), `internal/api/router_test.go`
  (image library create+scan+list via real subprocesses for the golden AC).
- New tests: `plugins/image-enricher` unit (Match applicability, Convert EXIF on a
  fixture jpg/png/webp with + without EXIF, Merge namespace isolation, Unicode model
  string), `plugins/base-scanner` (image discovery + dimensions via stdlib, no
  ffprobe for images), and a golden e2e (real subprocesses + real image files).

## Git State

Branch `feature/image-enrichment` off `main` @ `e2a7562` (scan-library + plugin-pipeline
Phase A + async-enrichment Phase B1 merged). The pre-existing unrelated `backend/`
deletions in `git status` are out of scope for B2 (legacy layout cleanup from a prior
repo shape). No commit is made by the planner (read-only planning task).
