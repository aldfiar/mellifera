# Integration Map — image-enrichment (Phase B2)

> Completeness artifact: every seam where B2 new/changed code meets the existing
> system, with the before/after behavior + the invariant held. contracts.md owns
> TYPES; this owns SEAMS. Mirrors `docs/async-enrichment/integration_map.md` (6-column
> seams table). All claims G2-verified against live source on `feature/image-enrichment`
> (@ `e2a7562`). The Coverage Matrix is filled by the specifier.

## Seams

| ID | Existing (Phase A/B1) | New/Changed (B2) | After (behavior) | Contract | evidence |
|---|---|---|---|---|---|
| **S1** | `walk(ctx, root, opts)` uses the video-only `mediaMime` map for every library (`walk.go:25-38,50,115-123`). `Scan` does not forward `module_type` to walk (`scanner.go:38-48`). | `walk(ctx, root, moduleType, opts)` selects the extension map: `module_type=="image"` → image exts (jpg/jpeg/png/webp); else → video set. `Scan` forwards `req.GetModuleType()`. | An image library discovers only image files; a tv/movie library is unchanged (still video-only — no cover-art junk). A stray `.mkv` in a photo dir is skipped; a `.jpg` in a tv dir is skipped. | Plugin MAY be media-aware (core may not — INV2). Module-type guidance is sanctioned by `scanner.proto`. Additive for non-image modules. | `plugins/base-scanner/walk.go:25-38,50,115-123`; `scanner.go:38-48`; `scanner.pb.go:31-33` |
| **S2** | `toDiscovered` calls `probe` (the ffprobe binary) for EVERY media file (`walk.go:84-105`, call at `:93`); ffprobe output rides the opaque `ffprobe_json`. | New `probeImage` (stdlib `image.DecodeConfig` over `image/jpeg`/`image/png`/`image/webp`) for image exts; `toDiscovered` branches image→`probeImage`, video→`probe`. | Image base info `{width,height,format}` is gathered at discovery into the opaque probe field (listable pre-enrichment); ffprobe is NOT invoked for images. Per-file decode failure is soft (empty + warning — `INV3`). | Same `(data, warning, err)` soft-fail signature as `probe` (`ffprobe.go:29-53`); opaque field contract (`scanner.pb.go:113-119`); arg/path never shelled. | `plugins/base-scanner/walk.go:84-105`; `ffprobe.go:29-53`; `scanner.pb.go:113-119` |
| **S3** | `tv-parser` is the only `metadata_source` plugin; it implements `sdk.MetadataSource` (Match/BuildRequest/Convert/Merge) and writes `sources.tv-parser` (`plugins/tv-parser/parser.go:32-153`). The B1 chain drives the 4 RPCs and passes an EMPTY document to Merge (`chain.go:49-97`, empty doc at `:79`); base is reconstructed from `doc["parsed"]` only (`chain.go:115-122`). | New `plugins/image-enricher` implements the EXISTING `sdk.MetadataSource`. Match: applies iff image (module_type/extension), no I/O, carries `absolute_path` in Query. Convert: runs the **system `exiftool`** subprocess (`exec.Command` arg-slice, NEVER shell — mirrors `ffprobe.go:33-43`) on `absolute_path`, parses JSON, maps tags → `{width,height,format, make?,model?,date_taken?,orientation?, gps_lat?,gps_lon?}`. Merge: writes `sources.image-enricher` only. | Image items get EXIF provenance in `sources.image-enricher` (+ core-stamped `_provenance`/`_view`/`stages`); a valid image yields ≥ `{width,height,format}` when exiftool succeeds (clean success, no spurious `no_data`); exiftool missing/fails → empty metadata → B1 `no_data` terminal → settle (AC-6). | NAMESPACE WRITE only (`chain.go:104-122`); stateless subprocess (arch §0.2); implements EXISTING interface (no proto edit — AC-3); pure-Go binary (exiftool is external `os/exec`, NOT CGO — AC-2 holds). | `pkg/sdk/metadata.go:23-28`; `internal/enrich/chain.go:49-122`; `plugins/tv-parser/parser.go:32-153`; `internal/enrich/retry.go:53-55`; `plugins/base-scanner/ffprobe.go:29-53` |
| **S4** | `assembleBaseDoc` builds `doc["parsed"]={relative_path,extension}` only; `persist` does not receive the library root (`run.go:179-193,334-352`). `runScan` has `lib.RootPath` in scope (`run.go:116`). | `runScan` threads `lib.RootPath` → `persist` → `assembleBaseDoc`, which stamps `absolute_path = filepath.Join(lib.RootPath, rel)` into `doc["parsed"]` for ALL items. | The reconstructed absolute path (per `DiscoveredFile.RelativePath` "reconstructed by the core") reaches the enricher via `parsed` — the only channel (Merge gets an empty doc). tv-parser ignores the new key; `baseChanged` is unaffected (deterministic for root+rel). | Additive parsed key (free-form, `scanner.pb.go:267-272`); core reconstructs the abs path; no media-type branch in scan. | `internal/scan/run.go:116,179-193,232-252,334-352`; `internal/enrich/chain.go:115-122`; `scanner.pb.go:108-109,267-272` |
| **S5** | `module.Open` seeds ONE built-in module (`tv`) via `INSERT OR IGNORE` (`registry.go:125-160`); `tvConfigJSON` binds base-scanner + tv-parser (`registry.go:44-81`). | New `imageConfigJSON` + a second `INSERT OR IGNORE` seed row for `media_type="image"` binding base-scanner (scanner) + image-enricher (priority 1, local, no auth_mode). | A fresh install scans image libraries out-of-the-box (the `image` module resolves via `Get`); `modules.media_type UNIQUE` accepts `"image"`; `List` now returns both modules (order is id-sorted, harmless). | Module is a CONFIG ENTITY (INV1/INV2) — data, not code; zero new exported symbols (stays at 7); idempotent seed. | `internal/module/registry.go:27-34,44-81,125-160`; `internal/module/doc.go:14` |
| **S6** | `main` loads+starts+stops `tv-parser` with a `metadata_source` capability declaration and an env path (`main.go:88-91,148-151,159,181`). | A mirrored block loads+starts `image-enricher` (same capability declaration + `metadataService`), adds `config.imageEnricherPath` (`MELLIFERA_IMAGE_ENRICHER`, default `bin/image-enricher`), and `mgr.Stop(shutdownCtx, "image-enricher")` in the shutdown order. | The image-enricher subprocess is launched at startup (before the server serves) and torn down on SIGTERM after the enrich pool + HTTP server. | INV-start-before-serve + INV-shutdown-order (pool → plugins); flat constructor call, no DI/reflect; cookie pair matches. | `cmd/mellifera/main.go:74-91,104-113,148-151,159,181` |
| **S7** | `Makefile build-plugin` builds `bin/base-scanner` + `bin/tv-parser` (`Makefile:33-40`). | Adds `CGO_ENABLED=0 go build -o bin/image-enricher ./plugins/image-enricher`. | `make build-plugin` produces all three plugin binaries; the default path in S6 matches. | Pure-Go build (CGO_ENABLED=0). | `Makefile:33-40`; `cmd/mellifera/main.go:181` |
| **S8** | `go.mod` has no EXIF library and no `image/*` imports (`go.mod:7-34`); Mellifera already requires the system `ffmpeg`/`ffprobe` runtime deps (invoked via `os/exec` in `ffprobe.go:29-53`). | Adds **NO Go module dependency**. EXIF is read by invoking the **system `exiftool`** binary via `os/exec` (a runtime dep alongside ffmpeg/ffprobe). Stdlib `image/jpeg`/`image/png`/`image/webp` are added to `plugins/base-scanner` ONLY (base info). | `go.mod` is untouched; the whole module still builds `CGO_ENABLED=0` (exiftool is external, not CGO). Operators install `exiftool` (`brew install exiftool` / `apt install libimage-exiftool-perl`); a missing exiftool is a per-source soft-fail, not a startup/build failure. | Hard no-CGO constraint holds (external process, not CGO); matches the established ffprobe exec pattern. | `go.mod:7-34`; `plugins/base-scanner/ffprobe.go:29-53`; `Makefile:33-40`; decision log §D-2 |

**no_seam (explicit — files NOT touched, with reason):**

- `proto/**` — no_seam: image-enricher implements the EXISTING `metadata.v1.MetadataSource`; `absolute_path` rides the free-form `Parsed`. AC-3.
- `internal/enrich/**` (B1 queue/worker/chain/lease/retry/state/ledger) — no_seam: image items consume the queue unchanged; empty-namespace→`no_data` + settle predicate already handle images. AC-3/AC-queue.
- `internal/store/**` — no_seam: items table + queries are media-type-agnostic; image data lives in the opaque document; no migration (generated columns deferred). AC-3.
- `internal/api/**` — no_seam: `createLibrary` takes an arbitrary `module_id`; scan + items listing are media-type-agnostic. AC-3.
- `pkg/sdk/**` — no_seam: the `MetadataSource` adapter is reused as-is. AC-3.

## Behavior-change impact on existing flows

- **TV/movie scans: unchanged.** S1 selects the video extension set for any
  `module_type != "image"`, so existing tv libraries behave identically (the new
  image map is reachable only for the `image` module). No regression.
- **Every item's `parsed` gains `absolute_path` (S4).** Additive; tv-parser reads
  only `relative_path`/`stem` (`parser.go:111-123`); `baseChanged` compares
  `parsed+ffprobe` but `absolute_path` is deterministic for (root, rel) → no
  false-stale on re-scan.
- **Startup loads one more subprocess (S6).** A failure to load/start image-enricher
  is fatal at startup (same as base-scanner/tv-parser — `fatalOn`); an image library
  scanned while image-enricher is unloaded yields `outcomeUnavailable` per-source →
  items settle via `attemptedNoWork` (B1 forward-compat, `worker.go:323-334`).
- **B1 queue: zero behavior change.** Image items are indistinguishable from TV
  items to the worker (same state machine, same settle predicate, same ledger).

## External boundary changes

One LOCAL subprocess boundary is introduced (no network): the image-enricher execs the
system `exiftool` binary per item (`os/exec` arg-slice, NEVER a shell — same pattern as
base-scanner's `ffprobe`, `ffprobe.go:29-53`). Cross-cutting concerns:

- **Timeout:** bounded per-file via `context.WithTimeout` (mirrors `ffprobe.go:33`'s
  `probeTimeout`); a slow/hung exiftool is cancelled, not waited on.
- **Retry:** NONE at the enricher level — a soft-fail yields empty metadata → the B1
  queue owns retry/cooldown (`internal/enrich/retry.go`); exiftool is re-run on the
  next derivation after the cooldown.
- **Idempotency:** exiftool is a READ-ONLY query (`-j` JSON dump); running it twice on
  the same file yields the same output — no side effects, no idempotency concern.
- **Availability:** `exec.LookPath("exiftool")` on each use; missing → soft-fail (the
  item keeps base info; scan succeeds — AC-6). This is a runtime dep the operator
  installs, not a network service.

There is still NO outbound HTTP and NO network dependency.

## Coverage Matrix (owner task + joint test per seam — specifier-filled)

| Seam | Owner task | Joint test | ACs |
|---|---|---|---|
| S1 base-scanner ext selection | T02 (walk.go module-type branch) | QA1 `TestImageE2E_ModuleTypeGating` (+ T07 e2e gating: `.mkv` absent from image lib, `.jpg` absent from TV lib) | AC-image, AC-3 |
| S2 base-scanner image probe | T02 (image.go `probeImage` + toDiscovered branch) | QA1 `TestImageBase_PendingBeforeEnrich` (+ T02 unit: stdlib dims for jpg/png/webp; HEIC soft-fail) | AC-image, AC-softfail |
| S3 image-enricher MetadataSource | T01 (enricher.go Match/Convert/Merge + exiftool.go) | QA1 `TestImageE2E_GoldenReady` (+ T01 unit: Match applicability, Convert EXIF map, Merge namespace isolation) | AC-1, AC-image, AC-softfail, AC-unicode |
| S4 scan absolute-path stamp | T03 (run.go assembleBaseDoc stamps `doc["parsed"].absolute_path`) | QA1 `TestImageE2E_GoldenReady` (path round-trip — EXIF lands) (+ T03 unit: absolute_path set for all items, deterministic) | AC-1, AC-image |
| S5 image module seed | T04 (registry.go imageConfigJSON + second INSERT OR IGNORE) | QA2 `TestB2_ModuleRegistryCompose` (+ T04 unit: Get("image") + List len 2 + idempotent) | AC-1, AC-image |
| S6 cmd plugin loading | T05 (main.go Load/Start/Stop image-enricher) | T07 golden e2e (proves the subprocess loaded + chain ran → items ready) | AC-1 |
| S7 Makefile build-plugin | T06 (build-plugin adds `bin/image-enricher`) | QA2 `TestB2_BuildPluginProducesAll` (+ T06 verify: `make build-plugin && test -x bin/image-enricher`) | AC-2 |
| S8 EXIF dependency | T01 (exiftool via os/exec; no Go dep) + T06 (Makefile) | QA2 `TestB2_NoCgoNoDep` (+ T01 verify: `CGO_ENABLED=0 go build`; `git diff go.mod` empty; `grep 'import "C"'` 0) | AC-2 |

> Every seam maps to exactly one owner task (the task implementing the `New/Changed`
> side) and one joint test (the QA/coder test asserting the seam's `Contract`).
> The post-specifier gate `check-plan-coverage.sh` reads THIS matrix — no row is TBD.
