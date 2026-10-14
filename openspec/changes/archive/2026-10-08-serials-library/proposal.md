# Proposal: serials-library — directory-structured serial libraries

## Why

Mellifera's shipped library types (`tv`, `image`) are filename-flat: every media file under the root is one item, and identity comes from the filename. The user's real serial libraries (`/media/kofe/ongoing`, `/media/ojir/serials`) are directory-structured: one subdirectory per serial (show), episode files directly under it, and subtitle/voiceover/soundtrack sidecars in nested language folders. Today that structure is invisible — a `tv` scan flattens it, sidecars are never associated, and there is no serial-level document for per-plugin show metadata. This change adds a third library type, `serial`, that makes the directory the serial identity while reusing the shipped document model, enrichment pipeline, and API posture unchanged.

## What Changes

- **New `serial` module type (config entity, not code):** seeded module binding a new `serial-scanner` plugin (scanner capability) with a `structure: "series-directories"` scanner option, plus `serial-parser` (priority 1) and `frame-grabber` (priority 2) as `metadata_source` enrichers. Existing `tv` and `image` modules are untouched.
- **Directory-structured discovery (`serial-scanner`, new bundled plugin):** depth-1 subdirectory = serial identity; video files directly under it = episodes; subtitle/audio sidecar files at any depth are classified episode-linked (SxxExx match first, bare-number fallback for the `SUB/` `.ass - 01` case) or serial-level (OST soundtracks attach to the series record — never dropped silently); language from the container folder name or filename tag; deeper video files are excluded with a per-serial warning; extensionless junk (`smbdelete…`) is excluded; a stray top-level video file becomes a file-backed single-episode serial; same-show cours directories stay separate serials (no auto-merge); non-ASCII (Cyrillic) names are first-class. The base-scanner walk stays byte-identical.
- **First-class series entity (store):** an idempotent `series` table (no generated columns — the known B3b blocker is avoided) holding a serial-level §3.1 document with the same `sources.<plugin_id>` / `_provenance` / `_view` / `_stages` machinery as items. Identity is the directory path within the library: a rename/move is a new identity (the old row is marked `deleted`); an unchanged re-scan preserves status; changed directory facts go `stale`.
- **Two-level enrichment:** the async queue derives `(series, plugin)` tasks alongside `(item, plugin)` tasks under the same predicates, leases, retry/backoff, and failure ledger. `serial-parser` enriches the series document from the directory name (display-title cleanup, season extraction) and episode documents from filenames (SxxExx); plugins self-select at Match per the shipped pattern. Namespace isolation is unchanged — one plugin's serial metadata can never overlap or contradict another's.
- **Frame-grab default images (`frame-grabber`, new bundled plugin):** an ffmpeg single-frame grab from the first minutes of an episode (soft-fail per source, os/exec arg-slice only), stored as a data-dir JPEG referenced by path from `sources.frame-grabber` — no BLOBs. Any enricher-provided poster outranks the frame-grab default under the view semantics. The reserved `image_provider` capability stays reserved; no proto or SDK surface changes.
- **Series API surface (read-only, additive):** `GET /api/v1/series?library={id}`, `GET /api/v1/series/{id}`, `GET /api/v1/series/{id}/episodes` in the browse role group (admin+client). Scan flow and its endpoints are unchanged (create library with `module_id: "serial"`, non-blocking `POST /libraries/{id}/scan`).
- **Deferred (explicit scope line for GATE 1):** manual edits are NOT in this change. They need a document-write API surface plus real arbitration (manual fields survive plugin re-writes) — exactly the `_view` arbitration design B3 already plans, with the arch-reserved `_user` namespace. Shipping manual edits without arbitration would violate the user's "never contradicts" invariant, so they are deferred to a follow-up change sharing B3's design. Serial documents carry the standard namespaces, so that follow-up applies uniformly.

No breaking changes: new capability delta only; no proto/SDK changes; no generated columns; `tv`/`image` behavior is golden-tested unchanged.

## Capabilities

### New Capabilities

- **`serial-library`** — the directory-structured serial library type: module seed, serial-scanner discovery rules, sidecar association, the series entity and its storage, two-level queue enrichment, frame-grab defaults, series API surface, and the additive posture that keeps tv/image and the core media-type-agnostic. Delta at `specs/serial-library/spec.md`.

### Modified Capabilities

- None. The async-enrichment, scan-library, plugin-pipeline, and image-enrichment requirements remain true as written (series derivation and series storage are additive extensions specified in the new capability; existing items behave exactly as shipped).

## Impact

- **Affected code:** `internal/store` (series table + methods — idempotent DDL only), `internal/module` (third seeded config), `internal/scan` (config-gated series-record routing in the drain loop), `internal/enrich` (series-task derivation + series load/persist in the worker), `internal/api` (three unexported handlers + browse-group mounts), `cmd/mellifera` (three plugin subprocess wirings), three new plugin modules `plugins/serial-scanner`, `plugins/serial-parser`, `plugins/frame-grabber`, and the regenerated committed `internal/web/api/openapi.{json,yaml}`.
- **Not affected:** `proto/` and `pkg/sdk` (zero contract changes — scanner and metadata_source suffice), `plugins/base-scanner`, `plugins/tv-parser`, `plugins/image-enricher`, the SPA (`web/`), `go.mod` of the core (no new Go module deps; ffmpeg is a runtime dep like ffprobe/exiftool).
- **Dependencies:** none new at build time (pure-Go, CGO off); `ffmpeg` joins `ffprobe`/`exiftool` as an optional runtime dependency whose absence soft-fails.
- **Systems:** SQLite gains one table via `CREATE TABLE IF NOT EXISTS` (safe on existing databases); the enrich queue gains a second derivation source; no data migration.
