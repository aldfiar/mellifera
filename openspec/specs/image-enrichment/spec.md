# image-enrichment Specification

## Purpose
Adds an image media type to Mellifera and an EXIF metadata enricher. An `image` library
discovers jpg/jpeg/png/webp/heic/heif files through the base-scanner (module-type-gated),
gathers stdlib base dimensions/format at discovery, and enriches each item with EXIF data
via the `image-enricher` plugin, which invokes the system `exiftool` binary. Image items
flow through the shipped B1 async-enrichment queue unchanged, carrying EXIF provenance in
`sources.image-enricher`. Seeded from docs/image-enrichment (shipped as feat(image-enrichment) Phase B2).

## Requirements

### Requirement: Module-Type-Gated Image Discovery
The base-scanner SHALL select the discovered extension set from the library's
`module_type`: a `module_type == "image"` library SHALL discover exactly the image
extensions `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif` (NOT a union filter), and
any other library type SHALL keep the existing video extension set. A file whose
extension is outside the selected set SHALL NOT be discovered as an item.

#### Scenario: Stray video file in an image library is skipped
- **WHEN** a library with `module_type == "image"` is scanned from a directory that also contains a `.mkv` file
- **THEN** only the image-extension files are persisted as items and the `.mkv` is absent from the item list

### Requirement: Stdlib Base Info at Discovery
The base-scanner SHALL gather image base info (width, height, format) at discovery time
via the Go stdlib (`image.DecodeConfig`), soft-failing per file (empty data plus a
human-readable warning, no error abort) for any image without a stdlib decoder. Only
jpeg/png SHALL receive stdlib base dimensions; webp/heic/heif SHALL be discovered but
carry no stdlib base info (their dimensions arrive at enrichment). ffprobe SHALL NOT be
invoked for image items.

#### Scenario: JPEG carries dimensions before enrichment
- **WHEN** a `.jpg` file is discovered in an image library scan
- **THEN** the item is persisted with base width/height/format while still at status `pending`, before enrichment runs

#### Scenario: HEIC base info soft-fails at discovery
- **WHEN** a `.heic` file is discovered in an image library scan
- **THEN** discovery succeeds with empty base info plus a warning, and the item proceeds through the pipeline normally

### Requirement: Absolute-Path Stamp as the File-Location Channel
The scan flow SHALL stamp the reconstructed absolute file path
(`filepath.Join(library_root, relative_path)`) into `doc["parsed"]["absolute_path"]`
for ALL discovered items, media-type-agnostically. This key SHALL be the only
file-location channel into the enricher chain.

#### Scenario: Enricher receives the file location
- **WHEN** an item reaches the image-enricher's Match/Convert RPCs
- **THEN** the enricher can open the file using `parsed.absolute_path` carried through the chain Query

#### Scenario: Stamp leaves existing behavior intact
- **WHEN** a re-scan compares base identity or a consumer reads the other `parsed` keys
- **THEN** the added `absolute_path` key changes neither the change detection nor the existing fields

### Requirement: EXIF Extraction via System Exiftool Subprocess
The `image-enricher` plugin SHALL extract EXIF data by invoking the system `exiftool`
binary via `os/exec` with an explicit argument slice (NEVER a shell) under a bounded
per-file timeout. exiftool SHALL be a system runtime dependency only — the build adds
NO new Go module dependency and the binary remains pure-Go (`CGO_ENABLED=0`).

#### Scenario: Enricher runs exiftool on the item's file
- **WHEN** Convert is invoked for an image item with exiftool installed
- **THEN** the plugin runs `exiftool -j -n` with explicitly selected tags (ImageWidth, ImageHeight, FileType, Make, Model, DateTimeOriginal, Orientation, GPSLatitude, GPSLongitude) on the item's absolute path and maps them into the metadata namespace

#### Scenario: Match applies only to images
- **WHEN** Match is invoked for an item
- **THEN** it applies iff the item's module type is `image` or its extension is an image extension, carrying `absolute_path` into the Query without I/O

#### Scenario: Enricher runs exiftool on the item's file
- **WHEN** Convert is invoked for an image item with exiftool installed
- **THEN** the plugin runs exiftool with a JSON arg-slice command on the item's absolute path and maps the selected tags into the metadata namespace

### Requirement: EXIF Provenance Namespace
The `image-enricher` plugin SHALL write metadata ONLY into
`document.sources["image-enricher"]`, never touching `_provenance`/`_view`/`_stages`
(core-stamped). A successful exiftool run SHALL always yield `width`, `height`, and
`format` (lowercased FileType) for a decodable image — a clean success, never a spurious
`no_data`. Absent fields SHALL simply be absent.

#### Scenario: Golden EXIF enrichment of a camera JPEG
- **WHEN** a JPEG with EXIF (Make=Apple, Model=iPhone 15, DateTimeOriginal, Orientation, GPS) is scanned and enriched
- **THEN** the item reaches status `ready` with `sources.image-enricher` carrying those fields plus width/height/format, and the document has core-stamped `_provenance` (`plugin_id="image-enricher"`), `_view`, and a `_stages` entry (`stage="metadata_source"`, `status="ok"`)

#### Scenario: Optional EXIF fields carried when present
- **WHEN** EXIF carries make, model, date, orientation, or GPS data
- **THEN** they map to `make`, `model`, `date_taken` (RFC3339 UTC when parseable, verbatim otherwise), `orientation`, `gps_lat`, and `gps_lon` in the namespace

#### Scenario: EXIF-less image still yields base data
- **WHEN** a valid image with no EXIF block is enriched
- **THEN** `sources.image-enricher` contains at least `{width, height, format}` and the item settles as a clean success

### Requirement: Image Module Seed
The core SHALL seed an idempotent `image` module config row (`INSERT OR IGNORE`, config
entity — not code) binding `base-scanner` as scanner and `image-enricher` as
`metadata_source` (priority 1, no `auth_mode`), so a fresh install scans image libraries
out-of-the-box. The core process SHALL load, start (before serving), and stop the
`image-enricher` subprocess; its binary path is `bin/image-enricher` by default,
overridable via `MELLIFERA_IMAGE_ENRICHER`.

#### Scenario: Image library scan on a fresh install
- **WHEN** a library is created with `module_id: "image"` and scanned
- **THEN** the walk uses the image extension set and the image-enricher enriches the discovered items without additional configuration

### Requirement: Per-Source Soft-Fail on Missing Tool or Bad File
Every exiftool failure (missing binary, non-zero exit, timeout, non-JSON output) and every
undecodable/corrupt image SHALL be a per-source SOFT-FAIL: a human-readable warning plus
an empty metadata namespace — never a gRPC error, never an aborted scan or startup. An
empty namespace SHALL flow into the B1 queue's `no_data` terminal, cooldown, and settle;
the scan SHALL still return success and the library SHALL remain listable. Only a
cancelled context SHALL be a hard failure.

#### Scenario: exiftool missing on the host
- **WHEN** an image library is scanned on a host without the `exiftool` binary
- **THEN** the scan returns 200, items are discovered and persisted (jpg/png keeping their stdlib base dimensions), each enrichment soft-fails to an empty namespace, and the items settle via the `no_data` cooldown path

#### Scenario: Corrupt image in the library
- **WHEN** a truncated JPEG is scanned
- **THEN** that item soft-fails per-source and settles via the B1 ledger/cooldown while the rest of the library enriches normally

### Requirement: Unicode-Safe Filenames and EXIF Strings
File discovery and EXIF string handling SHALL be UTF-8-safe: the extension filter SHALL
lowercase ASCII extensions only, and non-ASCII EXIF string values SHALL be carried
verbatim into `sources.image-enricher` without re-encoding.

#### Scenario: Cyrillic filename and camera model
- **WHEN** a file named `Фото.jpg` with a non-ASCII EXIF Model tag is scanned and enriched
- **THEN** the item is discovered and `sources.image-enricher.model` preserves the string verbatim

### Requirement: Additive Consumption of the Shipped Queue
Image items SHALL consume the B1 async-enrichment queue UNCHANGED: the scan SHALL return
non-blocking once items are persisted `pending`; enrichment SHALL use the same worker
pool, state machine, retry/backoff, failure ledger, and settle predicate as TV items; NO
proto, `internal/api`, `internal/enrich`, `internal/store`, or `pkg/sdk` code SHALL be
modified by this capability.

#### Scenario: Scan returns before enrichment completes
- **WHEN** an image library scan is triggered via the API
- **THEN** the scan HTTP response returns with items persisted as `pending`, and the items reach `ready` later via the background worker pool
