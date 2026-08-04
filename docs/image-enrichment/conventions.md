# Conventions — image-enrichment (Phase B2)

> **Inherits** `docs/async-enrichment/conventions.md` + `docs/plugin-pipeline/conventions.md`
> + `docs/scan-library/conventions.md` in full. Hard rules repeated for density:
> Apache-2.0 header on every file; `doc.go` per package; no `reflect`; no DI
> frameworks; `CGO_ENABLED=0` everywhere (pure-Go, single static binary);
> parameterized SQL (never interpolate); `exec.Command` arg-slice only (never a
> shell); deprecate-don't-delete; soft-fail per file/source (AC-6 philosophy — one
> bad file/source never aborts the item/library). Below are the **image-specific
> deltas**.

## Naming

- Plugin id: `image-enricher` (kebab-case, mirrors `tv-parser`/`base-scanner`).
- Provenance namespace: `sources.image-enricher` (the plugin id; core validates,
  never branched on — `internal/enrich/chain.go:104-122`).
- Parsed key for the file location: `absolute_path` (the reconstructed
  library-root-relative absolute path; `DiscoveredFile.RelativePath` comment:
  "Absolute path is reconstructed by the core"). Additive — tv-parser ignores it.
- EXIF field keys (lowercase snake_case in `sources.image-enricher`):
  `width`, `height`, `format`, `make`, `model`, `date_taken`, `orientation`,
  `gps_lat`, `gps_lon`. Absent fields are simply absent (consumers must not assume
  presence — same rule as `IdentifyResult.Parsed`, `scanner.pb.go:267-272`).

## Image / EXIF rules (NON-NEGOTIABLE)

- **Pure-Go BINARY, no CGO; EXIF via external `exiftool`.** The Mellifera binary stays
  pure-Go and builds under `CGO_ENABLED=0` (hard constraint — `open-questions.md`
  no-CGO; `modernc.org/sqlite` is the precedent). EXIF is NOT read by a Go library —
  the image-enricher invokes the **system `exiftool`** binary via `os/exec` arg-slice
  (NEVER a shell), the SAME pattern as `ffprobe` (`plugins/base-scanner/ffprobe.go:29-53`).
  exiftool is an external PROCESS, not CGO — so the no-CGO guarantee holds. **B2 adds
  NO Go module dependency.** Verified by `CGO_ENABLED=0 go build ./plugins/image-enricher/`
  (AC-2) AND `git diff --name-only e2a7562 -- go.mod` empty.
- **`exiftool` is a runtime dep, like ffmpeg/ffprobe.** Operators install it
  (`brew install exiftool` / `apt install libimage-exiftool-perl`); it is documented in
  the Makefile + this runbook. It is NOT a build dep — `check.sh`/`golangci` are
  unchanged. A missing exiftool is a per-source SOFT-FAIL (`exec.LookPath` on each use;
  empty metadata → B1 `no_data` → settle), never a startup/build failure.
- **Stdlib for base image info at discovery; `exiftool` for EXIF + everything at
  enrichment.** Dimensions + format at discovery come from the Go stdlib
  (`image.DecodeConfig` with `image/jpeg`/`image/png`/`image/webp`). EXIF tags
  (make/model/date-taken/orientation/GPS) + authoritative dimensions at enrichment
  come from `exiftool`. ffprobe is NOT used for images (it stays the video probe).
- **Discovery is module-type-gated, NOT a union filter.** base-scanner selects the
  extension map from `ScanRequest.module_type`: `"image"` → image extensions
  (jpg/jpeg/png/webp/heic/heif); otherwise → the existing video set. Rationale: the tv
  module config excludes `*.jpg` (`internal/module/registry.go:54`) but base-scanner
  does not yet enforce `exclude_patterns` (opts deferred, `walk.go:48-49`); a union
  filter would discover cover-art jpgs inside tv libraries as junk items. Module-type
  selection is sanctioned by `scanner.proto` ("Module type … Guides the scanner's
  parsing heuristics"). A plugin MAY be media-aware; the CORE may not.
- **HEIC in scope; RAW deferred (cheap to add).** `exiftool` reads HEic/HEIF natively,
  so `.heic`/`.heif` ARE in the image extension set for B2 — base-scanner discovers
  them (its stdlib base-info soft-fails for HEIC; exiftool supplies full data at
  enrichment). RAW (`.cr2`/`.nef`/`.arw`/`.dng`) is deferred only to keep the
  extension set bounded; exiftool reads them, so adding the extensions is the only
  change needed later.
- **The enricher runs exiftool on the file; the path rides in `parsed`.** The B1 chain
  passes an EMPTY document to Merge (`chain.go:79`) and reconstructs the base from
  `doc["parsed"]` only (`chain.go:115-122`). So scan stamps `absolute_path` into
  `doc["parsed"]`, and the image-enricher reads it from `base.Parsed` in Match/Convert
  to run exiftool on the file. No other channel exists without editing the proto or B1.
- **Contribute a non-empty namespace when exiftool succeeds.** Convert maps exiftool's
  output to `{width,height,format, ...}`; when exiftool succeeds on a valid image the
  namespace is non-empty → clean success (not a spurious `no_data`, `retry.go:53-55`).
  When exiftool is missing/fails or the image is corrupt: return EMPTY metadata + a
  warning → B1 `no_data` terminal → cooldown → settle (AC-6). No `ConvertResult.error`
  for the missing-exiftool case (empty-metadata soft-fail, mirroring ffprobe).
- **Output-bounded exiftool invocation.** Tags are explicitly selected
  (`-ImageWidth -ImageHeight -FileType -Make -Model -DateTimeOriginal -Orientation
  -GPSLatitude -GPSLongitude`) so output is small and predictable (no makernote
  megabytes); `-j` JSON, `-n` numeric. The set is one-line-extensible. Per-file
  `context.WithTimeout` bounds a slow exiftool (mirrors `ffprobe.go:33`).
- **Unicode-safe.** Filenames are UTF-8 throughout; the extension filter lowercases
  ASCII dotted extensions only (Cyrillic/Latin stems untouched — mirrors `tvparse.go`'s
  ASCII-only regex classes). exiftool outputs UTF-8 JSON; camera model strings
  (including non-ASCII) are carried verbatim.
- **No filename-date fallback for images.** The image type is purely EXIF-based
  (images have no reliable filename convention analogous to TV's `SxxExx`). A
  no-EXIF image keeps base info only; it does not guess. (Decision log.)

## Media-type agnosticism (the core stays INV2)

- The CORE never branches on media type (`internal/module/doc.go` INV2). All
  image-specific behavior lives in: `plugins/base-scanner` (a plugin — may be
  media-aware), `plugins/image-enricher` (a plugin), and `internal/module` config
  (the `image` module seed — a CONFIG row, not a Go type). `internal/scan` stamps
  `absolute_path` for ALL items generically (it does not know it is serving images).
- The image module seed is data (`imageConfigJSON` + an `INSERT OR IGNORE` row), not
  code. Adding it adds zero exported symbols (`internal/module` stays at 7).

## Plugin isolation (unchanged from B1 / plugin-pipeline)

- image-enricher is a STATELESS SUBPROCESS (arch §0.2): every output is a pure
  function of the request; a crash loses no in-flight work (the core replays via the
  per-source document copy).
- NAMESPACE WRITE: Merge writes ONLY `document.sources["image-enricher"]`; never
  another source, never `_provenance`/`_view`/`_stages` (core-stamped + validated,
  `chain.go:104-122`). A violation is rejected + reverted + soft-failed.
- COOKIE PAIR matches core + sibling plugins (`MELLIFERA_MAGIC_COOKIE`/
  `mellifera-plugin-v1`); a mismatch is fatal at substrate handshake.
- SEPARATE PROCESS: `plugins/image-enricher` imports `pkg/sdk` + proto + stdlib ONLY
  (`os`, `os/exec`, `encoding/json`, …). It adds NO third-party Go module; it invokes
  the system `exiftool` via `os/exec`. It MAY NOT import any `internal/*` package
  (arch §10, R7).
- exiftool is invoked with an arg-slice (`exec.CommandContext(ctx, "exiftool", "-j",
  "-n", <tags>, absPath)`) — NEVER a shell, NEVER a concatenated command string. The
  file path is a single argument. Every failure (missing binary / non-zero / timeout /
  non-JSON) is soft (AC-6).

## SQL

- B2 adds NO SQL and NO migration. `internal/store` is untouched (media-type-agnostic;
  image data lives in the opaque document). The existing parameterized queries serve
  images verbatim (`items.go:88-126`). No generated columns for images in B2
  (deferred — they cannot be added idempotently to an existing table,
  `internal/store/open.go:30-33`).

## Concurrency

- B2 consumes the B1 async queue unchanged: image items are derived as pending
  `(item, plugin)` work and drained on the existing worker pool with lease/retry/
  ledger (`internal/enrich/queue.go`, `worker.go`). No new goroutines, channels, or
  locks in B2.
- base-scanner's image decode runs on the existing walk goroutine (per-file, like
  ffprobe); it does not introduce parallelism. `image.DecodeConfig` reads only the
  header (cheap); a large/corrupt image is bounded by the existing per-file soft-fail
  (no hang — decode errors are soft).

## Boundary rules (scope)

- **In:** image discovery (jpg/jpeg/png/webp/**heic/heif**), base image info
  (dimensions/format via stdlib), the image-enricher plugin (EXIF via the system
  `exiftool` subprocess — NO new Go dep), the `image` module seed, plugin loading,
  the absolute-path document stamp, the `exiftool` runtime-dep documentation.
- **Out (deferred):** RAW discovery (cr2/nef/arw/dng — one-line extension add);
  external image enrichers (B3); image generated columns / thumbnails / transcoding;
  Phase C post-action; enforcing scanner `exclude_patterns` (module-type gating makes
  it unnecessary for B2 correctness).

## Anti-patterns (forbidden in B2)

- A union `mediaMime` (video+image) without module-type gating — discovers tv
  cover-art as junk items.
- Using ffprobe for images (ffprobe is the video probe; image base info is stdlib).
- Invoking `exiftool` via a shell or a concatenated command string (MUST be an
  `exec.Command` arg-slice — golang-security; a hostile filename cannot inject).
- Adding a Go-module EXIF dependency (the decision is the system `exiftool` subprocess;
  `go.mod` stays untouched — AC-2/AC-3).
- A CGO dependency of any kind (violates the hard no-CGO constraint; exiftool is
  external `os/exec`, not CGO).
- Putting exiftool in base-scanner (wrong layer — base = discovery, enricher =
  enrichment; base-scanner uses stdlib for image base info only).
- The enricher reading the core document in Merge (it is empty by B1 contract,
  `chain.go:79`); or scan branching on media type (core stays INV2).
- Editing any proto, `internal/api`, `internal/enrich`, or `pkg/sdk` (additive-only,
  AC-3).
- An empty-namespace success for a valid image when exiftool is present (creates a
  spurious `no_data` ledger row — Convert must map exiftool's `{width,height,format}`).
- Guessing a date/camera from an image filename (no filename fallback — EXIF only).
