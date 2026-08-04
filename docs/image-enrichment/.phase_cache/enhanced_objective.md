# Enhanced Objective — image-enrichment (B2)

> Pre-approved by user (2026-08-04). This is the **B2** slice outlined in the
> async-enrichment plan. Builds on `main` @ `e2a7562` (scan-library + plugin-pipeline
> Phase A + async-enrichment Phase B1). Planner uses this as the approved objective.

## Intent

Add an **image media type** + a **pure-Go image-metadata enricher** (EXIF) to Mellifera.
Images flow through the SAME pipeline as TV: discovery → base identify → **the B1 async
queue** (unchanged) → the image enricher (`metadata_source` plugin) attaches EXIF
provenance. No new core media-type logic — the image type + the image-enricher binding
live in **module config**, like the `tv` module + `tv-parser`.

## Scope

1. **Image media type / discovery.** Images are discovered (filename, extension, path,
   dimensions/format) and persisted as items. base-scanner's walk is currently video-only
   (`walk.go` `mediaMime`) — extend media-extension filtering to common image formats
   (jpg/jpeg/png/webp; HEIC likely deferred — see open questions), and gather base image
   info (dimensions, format) at discovery (Go stdlib `image` decoders are pure-Go).
2. **Image EXIF enricher** (`plugins/image-enricher`, a `metadata_source` subprocess like
   `tv-parser`). Extracts basic EXIF metadata (dimensions, camera make/model, date-taken,
   orientation; GPS optional) via a **pure-Go EXIF library — NO CGO** (Mellifera's hard
   constraint). Writes its output to `sources.image-enricher` (provenance per arch §3.1),
   exactly as tv-parser writes `sources.tv-parser`.
3. **Image module config.** A new `image` module seed (like the `tv` module) binding the
   image-enricher, so a fresh install scans image libraries out-of-the-box.
4. **Consumes the B1 async queue UNCHANGED.** Image items enqueue as `pending` → the
   worker drains → image-enricher runs → `enriched`/`ready` with provenance. No change to
   the queue/worker/lease/ledger (B1). Items reach `ready` via the B1 settle-predicate.

## Foundation (on main — reuse, don't rebuild)
- The async queue (`internal/enrich` queue/worker/lease/retry/ledger from B1) — UNCHANGED.
- The `metadata_source` plugin pattern (`plugins/tv-parser` + `pkg/sdk` MetadataSource
  adapter) — the image-enricher mirrors tv-parser.
- Module registry (`internal/module` — the tv-module seed pattern), store (items +
  provenance), scan (discovery + enqueue), cmd (loads plugins), the build gate.
- ADDITIVE: no proto edits (image-enricher implements the EXISTING `metadata.v1.
  MetadataSource`); no change to the B1 queue/plugin/sdk/api contract.

## Open questions for the planner (decide + justify; surface any needing the user)
1. **Image discovery:** extend base-scanner's `mediaMime`/walk to image extensions, OR a
   separate image-discovery path? Base image info at discovery — Go stdlib `image.Decode`
   for dimensions/format (pure-Go; per-format `image/jpeg`, `image/png`, `image/webp`)?
2. **EXIF library:** which pure-Go EXIF lib (e.g. `dsoprea/go-exif` or `rwcarlsen/goexif`)?
   License-compatible (Apache-2.0/MIT/BSD)? Confirm pure-Go/no-CGO. Note: HEIC has no
   mature pure-Go decoder → likely DEFER HEIC (jpg/png/webp for B2).
3. **EXIF fields:** dimensions, camera make/model, date-taken, orientation (the basics);
   GPS — include (lat/lon) or defer (privacy/scope)? Unicode-safe (camera model strings,
   Cyrillic user filenames).
4. **Image module config:** the `image` module seed (binding image-enricher) — mirror the
   tv-module seed exactly. Does the image type need any filename parsing (date/camera from
   filename as fallback) or is it purely EXIF-based?
5. **ffprobe vs stdlib for base image info:** ffprobe reads some image metadata; stdlib
   `image` is the cleaner pure-Go path for dimensions/format. Prefer stdlib (no ffprobe
   dependency for images; keeps the scanner focused on its ffprobe-for-media role).

## Acceptance sketch (planner refines)
- **AC-1:** an image library scan → images discovered (base info: dimensions/format/
  filename/path) → enqueued → async enrichment (image-enricher EXIF) → items reach
  `enriched`/`ready` with `sources.image-enricher` provenance; listable via `?status=`.
  REAL subprocesses + real image files + real HTTP.
- **AC-2:** 5 gates green + vet; ≤8 symbols/pkg; no reflect/DI; parameterized SQL;
  exec.Command arg-slice only; pure-Go (no CGO — EXIF lib must be pure-Go).
- **AC-image:** image media type discovered (jpg/png/webp); image-enricher attaches EXIF
  to `sources.image-enricher` (+ `_provenance`/`_view`/`_stages`).
- **AC-queue:** image items flow through the B1 async queue unchanged (non-blocking scan,
  lease/retry/ledger, ready settle).
- **AC-3:** additive — `git diff e2a7562 -- proto/ internal/api/` empty (no proto/api
  edits); B1 queue/sdk contract unchanged.
- **AC-6:** an image with no/partial EXIF (or an unsupported format) soft-fails (item
  persists with base info; scan succeeds).

## Out of scope (DEFERRED)
- HEIC/RAW image support (no mature pure-Go decoder — defer).
- External image enrichers (e.g. reverse-image-search, online EXIF lookups) — that's a B3-
  style external enricher, not this slice.
- Image thumbnails/transcoding/streaming — separate concerns.
- Phase C (post-action).

## Right-sizing
B2 is SMALLER than B1 (it reuses the async queue + the tv-parser plugin pattern; it adds
one new plugin + image discovery + a module seed). Likely fits one pass, but the planner
evaluates honestly vs the budget (≤8 symbols/pkg, files <500, ≤15 steps, ≤8 ACs) and may
phase if needed.
