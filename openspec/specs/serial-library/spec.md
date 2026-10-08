# serial-library Specification

## Purpose
Give directory-structured serial collections a first-class library type: the
subdirectory is the serial identity, its direct video files are episodes, nested
subtitle/voiceover/soundtrack sidecars associate to episodes or to the serial record,
and serial-level metadata enriches through the shipped per-plugin namespace pipeline
without any plugin's data overlapping another's — with ffmpeg frame grabs as default
images and a read-only series API, all while tv/image behavior and the core's
media-type-agnostic posture stay untouched.

## Requirements

### Requirement: Serial module seed

The core SHALL seed an idempotent `serial` module config row (`INSERT OR IGNORE` —
a config entity, not code) with `media_type: "serial"`, binding the `serial-scanner`
plugin as scanner with the scanner option `structure: "series-directories"`, and
`serial-parser` (priority 1) and `frame-grabber` (priority 2) as `metadata_source`
enrichers. The composition root SHALL load, start (before serving), and stop the
`serial-scanner`, `serial-parser`, and `frame-grabber` subprocesses, with
env-overridable binary paths (defaults `bin/serial-scanner`, `bin/serial-parser`,
`bin/frame-grabber`). The seeded `tv` and `image` module configs SHALL remain
unchanged.

#### Scenario: Serial library discovers through serial-scanner

- **WHEN** a library is created with `module_id: "serial"` and its module config is resolved
- **THEN** the seeded config binds `serial-scanner` with the `series-directories` structure option and `serial-parser` + `frame-grabber` as the ordered metadata chain, while the seeded `tv` and `image` configs are unchanged

<!-- wf:probe id=80c1e9af9d178dcf -->
```bash
set -e
grep -q '"serial"' internal/module/registry.go
grep -q 'series-directories' internal/module/registry.go
grep -q 'serial-scanner' internal/module/registry.go
grep -q 'serial-parser' internal/module/registry.go
grep -q 'frame-grabber' internal/module/registry.go
go test ./internal/module -run TestSerialModuleSeed
```
<!-- /wf:probe -->

### Requirement: Directory-structured discovery

The `serial-scanner` plugin SHALL walk the library root one level deep: a
depth-1 subdirectory containing at least one video file directly under it SHALL
be a serial and SHALL be emitted as a serial record (a `DiscoveredFile` whose
`parsed` carries the serial-record marker and the raw directory facts) before
that directory's episode files; video files directly under a serial directory
SHALL be its episodes (probed with ffprobe exactly like the shipped video walk);
video files deeper than the serial directory's direct children SHALL NOT be
discovered as items and SHALL surface a per-serial scan warning; files whose
extension matches no video or sidecar extension set SHALL be excluded without a
warning; a serial directory SHALL NOT be merged with any other directory
(same-show cours directories stay separate serials). The base-scanner walk SHALL
remain untouched.

#### Scenario: Serial directories, markers, and episodes

- **WHEN** a serial library containing two serial directories with episode video files is scanned
- **THEN** each directory yields one serial record followed by its episodes as items, with the raw directory name and directory path carried in the scanned facts

<!-- wf:probe id=deb03f5f7a07b865 -->
```bash
set -e
test -d plugins/serial-scanner
go test ./plugins/serial-scanner -run TestWalkSerialDirs
```
<!-- /wf:probe -->

#### Scenario: Deeper video files are excluded with a warning

- **WHEN** a serial directory contains a video file nested inside a subfolder (e.g. `SerialDir/Extras/extra.mkv`)
- **THEN** that file is not discovered as an item and the scan carries a warning naming the serial and the unexpected file

<!-- wf:probe id=d16c371b67739c27 -->
```bash
set -e
go test ./plugins/serial-scanner -run TestDeepVideoWarns
```
<!-- /wf:probe -->

#### Scenario: Same-show cours directories stay separate serials

- **WHEN** the library root contains two directories for the same show (e.g. two Bleach cours as separate directories)
- **THEN** the scan produces two distinct serial records and neither directory's episodes appear under the other

<!-- wf:probe id=87d0bb0b4f91f1f1 -->
```bash
set -e
go test ./plugins/serial-scanner -run TestCoursStaySeparate
```
<!-- /wf:probe -->

#### Scenario: Extensionless junk is excluded silently

- **WHEN** the library contains extensionless temp files (e.g. `smbdeleteaaa…`) at the root or inside a serial directory
- **THEN** no item or serial is created for them and no warning is emitted for them

<!-- wf:probe id=729f1fe78b8f1286 -->
```bash
set -e
go test ./plugins/serial-scanner -run TestJunkExcluded
```
<!-- /wf:probe -->

### Requirement: Sidecar association

The `serial-scanner` plugin SHALL discover sidecar files — subtitle extensions
(`.srt`, `.ass`, `.ssa`, `.sub`) and audio-track extensions (`.mka`, `.m4a`,
`.mp3`, `.flac`, `.aac`, `.ogg`, `.opus`, `.wav`) — at any depth under a serial
directory, without probing them or creating items for them. An episode-linked
sidecar SHALL be matched to an episode by an SxxExx token in the sidecar filename
first, falling back to a bare episode number when the sidecar filename has no
SxxExx token; the association SHALL be stamped into that episode's scanned facts
(relative sidecar path, kind, language, and match basis). The sidecar language
SHALL come from the containing folder name (case-insensitive, e.g. `Eng`, `Rus`)
or a filename language tag, and SHALL be empty when neither is present. A sidecar
that matches no episode SHALL be attached to the serial record's scanned facts as
a serial-level sidecar — never dropped silently. Sidecar folders MAY nest several
levels deep (e.g. `SerialDir/OST/`), and sidecars are OPTIONAL per serial (a
serial with none scans cleanly).

#### Scenario: Srt sidecar matched via SxxExx and folder language

- **WHEN** a serial directory contains `Eng/` and `Rus/` folders whose `.srt` filenames carry SxxExx tokens matching episodes
- **THEN** each episode's scanned facts carry the matched subtitle with its folder-derived language and the SxxExx match basis

<!-- wf:probe id=38d51abe09bfbf7d -->
```bash
set -e
go test ./plugins/serial-scanner -run TestSrtAssociation
```
<!-- /wf:probe -->

#### Scenario: Bare-number ass fallback

- **WHEN** a sidecar folder holds `.ass` files with no SxxExx token, only a bare episode number (e.g. `Show - 01 (1080p) [C48E56C8].ass`)
- **THEN** the file associates to the episode with that number via the bare-number fallback basis

<!-- wf:probe id=2195ddd74fa953fd -->
```bash
set -e
go test ./plugins/serial-scanner -run TestBareNumberFallback
```
<!-- /wf:probe -->

#### Scenario: Serial-level OST attaches to the series record

- **WHEN** a serial directory contains an `OST/` folder, nested several levels deep, holding audio files that match no episode number
- **THEN** the audio files are attached to the serial record's scanned facts as serial-level sidecars, are not discovered as items, and are not attached to any episode

<!-- wf:probe id=e805b89e8eea4ac1 -->
```bash
set -e
go test ./plugins/serial-scanner -run TestSerialLevelOST
```
<!-- /wf:probe -->

### Requirement: Loose top-level videos become file-backed serials

A video file directly in the library root (no parent serial directory) SHALL
become a file-backed single-episode serial: the scan SHALL emit a serial record
for it (identity key = the file's own relative path, backing fact `file`) plus
that file as the serial's single episode item, probed like any episode. It SHALL
NOT be rejected and SHALL NOT vanish from browse.

#### Scenario: Stray top-level video becomes a one-episode serial

- **WHEN** the library root contains a video file with no parent serial directory
- **THEN** the scan produces one file-backed serial record whose episode list contains exactly that file, and the file is also persisted as a probeable episode item

<!-- wf:probe id=cd6f6bbe663b2d1e -->
```bash
set -e
go test ./plugins/serial-scanner -run TestLooseTopLevelFile
```
<!-- /wf:probe -->

### Requirement: Series entity storage

The store SHALL gain a `series` table via an idempotent `CREATE TABLE IF NOT
EXISTS` migration — `id` (deterministic `ser_<library_id>_<hash16(relative_path)>`),
`library_id`, `module_id`, `relative_path`, `document` (the §3.1 dynamic JSON, a
serial-level document with the same `sources.<plugin_id>` / `_provenance` / `_view`
/ `_stages` machinery as items), `schema_version`, `status` (the same lifecycle
literals as items), `created_at`, `updated_at`, `UNIQUE (library_id, relative_path)`
— plus an index on `library_id`. The upsert SHALL be keyed by
`(library_id, relative_path)` and SHALL preserve `id` and `created_at` on
conflict. No generated column SHALL be added to any existing table, and the store
SHALL NOT parse series documents (opaque JSON, `json_extract` only where a
generated column already exists). The episodes of a series SHALL be derivable
without a join column: items whose `relative_path` equals the series
`relative_path` (file-backed) or starts with the series `relative_path` + `/` and
contains no further `/` (directory-backed).

#### Scenario: Series rows persist with serial documents

- **WHEN** a serial library scan persists serial records
- **THEN** each series row carries its serial-level document (raw directory facts in `parsed`, status `pending`), and the episodes are queryable as items under the series without a join column

<!-- wf:probe id=0668427b55d5e053 -->
```bash
set -e
go test ./internal/store -run TestSeriesRoundtrip
go test ./internal/store -run TestSeriesEpisodesQuery
```
<!-- /wf:probe -->

#### Scenario: Series rescan is idempotent

- **WHEN** the same serial library is scanned twice with no file changes
- **THEN** series rows are updated in place with `id` and `created_at` preserved, and the series count stays stable

<!-- wf:probe id=68554a93d9896e50 -->
```bash
set -e
go test ./internal/scan -run TestSeriesRescanIdempotent
```
<!-- /wf:probe -->

### Requirement: Series identity and re-scan semantics

A series SHALL be identified by `(library_id, relative_path)` — the directory path
within the library. An unchanged re-scan SHALL preserve the prior series status (a
`ready` series is not regressed); a re-scan whose serial scanned facts changed
SHALL advance the series to `stale`; a serial directory that vanished SHALL have
its series row advanced to `deleted` by a post-drain sweep; a serial directory
that was renamed or moved SHALL become a NEW series identity and the old row SHALL
be swept to `deleted`, with no automatic migration of enrichment data; a scan
whose stream did not drain cleanly (cancelled context) SHALL NOT sweep. Enrichment
of a re-created identity re-runs from scratch under the same namespace rules.

#### Scenario: Unchanged rescan preserves a ready series

- **WHEN** a `ready` series' library is re-scanned with the directory unchanged
- **THEN** the series row keeps status `ready` and its document is not regressed

<!-- wf:probe id=7b91b8ca7b9a5ecb -->
```bash
set -e
go test ./internal/scan -run TestSeriesUnchangedRescanPreservesReady
```
<!-- /wf:probe -->

#### Scenario: Renamed directory yields a new series and deletes the old

- **WHEN** a serial directory is renamed between scans and the library is re-scanned to a clean drain
- **THEN** a new series row exists under the new path with status `pending`, the old row is `deleted`, and no metadata was copied across identities

<!-- wf:probe id=98e1dd00be30a3aa -->
```bash
set -e
go test ./internal/scan -run TestSeriesRenameNewIdentity
```
<!-- /wf:probe -->

#### Scenario: Cancelled scan does not sweep

- **WHEN** a re-scan of a serial library is cancelled before the stream drains
- **THEN** no series row is advanced to `deleted`, even for directories the partial stream never saw

<!-- wf:probe id=eb2ddd730ebd00ae -->
```bash
set -e
go test ./internal/scan -run TestCancelledScanDoesNotSweep
```
<!-- /wf:probe -->

### Requirement: Series-level enrichment

The async enrichment queue SHALL derive `(series, plugin)` tasks for series rows
under the same predicates as items — the source is queueable (enabled, auth mode
not CLIENT), the plugin's `sources.<plugin_id>` namespace is absent from the
series document, and the pair is not in ledger cooldown — keyed by the series row
id (which never collides with an item id). The per-item lease, retry/backoff,
failure ledger, and settle rules SHALL apply to series unchanged, and a series
SHALL settle to `ready` independently of its episodes. The metadata_source chain
SHALL run over the series document with the raw directory facts as the Match
context; `serial-parser` SHALL write its parse (cleaned display title, extracted
season when a season token is present) ONLY into `sources.serial-parser`, and the
core SHALL stamp `_provenance`, `_view`, and `_stages` per the shipped rules.

#### Scenario: Series enriched through the parser namespace

- **WHEN** a scanned series with a noisy release-name directory (season marker and release tags included) drains into the queue
- **THEN** the series document gains `sources.serial-parser` carrying the cleaned display title and extracted season, a `_provenance` entry naming `serial-parser`, a `_view` projection, and a `_stages` entry — and no other namespace

<!-- wf:probe id=3e7ae9ebb5b9394b -->
```bash
set -e
go test ./internal/enrich -run TestSeriesEnrichedViaParser
```
<!-- /wf:probe -->

#### Scenario: Series settles ready independently of episodes

- **WHEN** every queueable source of a series reached a terminal outcome while its episodes are still enriching
- **THEN** the series row settles to `ready` and is listable via its status, without waiting for episodes

<!-- wf:probe id=1689a5e8b66761f3 -->
```bash
set -e
go test ./internal/enrich -run TestSeriesSettlesIndependently
```
<!-- /wf:probe -->

### Requirement: Episode-level enrichment in serial libraries

Within a serial library, each plugin SHALL self-select per document at Match, per
the shipped chain pattern: `serial-parser` SHALL apply to an episode document iff
its filename carries an SxxExx token and SHALL write the parsed episode fields
into `sources.serial-parser` of the EPISODE document; `frame-grabber` SHALL apply
only to episode documents carrying a video absolute path; a plugin that does not
apply SHALL be recorded as a skipped stage, not an error. Episode documents SHALL
NOT receive series-level metadata: the series' show metadata lives only in the
series document's namespaces.

#### Scenario: Episode enriched with its own parse

- **WHEN** an episode item named `Show.S01E02.1080p.mkv` in a serial library drains into the queue
- **THEN** the episode document gains `sources.serial-parser` carrying season 1 and episode 2, and the series' show-level namespace is untouched by the episode run

<!-- wf:probe id=5661e7491a9d1caa -->
```bash
set -e
go test ./plugins/serial-parser -run TestEpisodeParse
```
<!-- /wf:probe -->

### Requirement: Frame-grab default images

The `frame-grabber` plugin SHALL produce a default image for an episode by
invoking the system `ffmpeg` binary via `os/exec` with an explicit argument slice
(NEVER a shell) under a bounded timeout, seeking into the first minutes of the
file (the seek point SHALL be the configured seek seconds, default 60, clamped to
a fraction of the probe-reported duration so short files still yield a frame) and
writing a single JPEG frame into the data directory
(`<data_dir>/thumbs/<hash16(series relative path)>/<hash16(episode relative path)>.jpg`;
the data directory root is the `MELLIFERA_DATA_DIR` environment value, default
`./data`). The plugin SHALL write ONLY `sources.frame-grabber` — carrying the
thumbnail path — never a BLOB in the document, and never touching
`_provenance`/`_view`/`_stages` (core-stamped). Every ffmpeg failure (missing
binary, non-zero exit, timeout, unwritable output) SHALL be a per-source SOFT-FAIL
flowing into the shipped `no_data` ledger cooldown; only a cancelled context SHALL
be a hard failure. Any other source that later writes an image view entry SHALL
outrank the frame-grab default under the view semantics (the frame-grab namespace
is written before later-priority sources run).

#### Scenario: Thumbnail extracted and referenced by path

- **WHEN** an episode item with a probeable video file is enriched by `frame-grabber` with ffmpeg installed
- **THEN** a JPEG file exists under the data-directory thumbs layout and the episode document's `sources.frame-grabber` carries its path

<!-- wf:probe id=cb46677fed481743 -->
```bash
set -e
go test ./plugins/frame-grabber -run TestFrameGrabWritesThumb
```
<!-- /wf:probe -->

#### Scenario: Missing ffmpeg soft-fails to cooldown

- **WHEN** a serial library is enriched on a host without the `ffmpeg` binary
- **THEN** each episode's frame-grab enrichment soft-fails to an empty namespace, the items settle via the `no_data` cooldown path, and the scan and the rest of the chain are unaffected

<!-- wf:probe id=65fd06c7d306cf09 -->
```bash
set -e
go test ./plugins/frame-grabber -run TestMissingFfmpegSoftFails
```
<!-- /wf:probe -->

#### Scenario: Enricher image outranks the frame-grab default

- **WHEN** a chain runs a metadata source that writes an image view entry after `frame-grabber` has written its default
- **THEN** the view surfaces the later source's image while both namespaces remain stored losslessly

<!-- wf:probe id=19c935b30547bf65 -->
```bash
set -e
go test ./internal/enrich -run TestPosterOutranksFrameGrab
```
<!-- /wf:probe -->

### Requirement: Queue, ledger, and restart integration for series

Series tasks SHALL obey the shipped loop-safety rules: a terminally-failed
`(series, plugin)` pair SHALL be recorded in the `enrichment_failures` ledger and
skipped by derivation until its cooldown elapses; a successful run SHALL clear a
prior row; on restart the queue SHALL re-derive pending series tasks and skip
cooling pairs. A lease SHALL be keyed by the row id, so a series and an episode
are never serialized against each other and two workers never drain the same
series.

#### Scenario: Cooling series pair skipped and pending re-derived on restart

- **WHEN** the queue restarts with a `pending` series and an exhausted `(series, plugin)` pair whose cooldown has not elapsed
- **THEN** the pending series is re-derived and drained while the cooling pair stays skipped until eligibility

<!-- wf:probe id=b631150036bc2555 -->
```bash
set -e
go test ./internal/enrich -run TestSeriesLedgerAndRestart
```
<!-- /wf:probe -->

### Requirement: Series API surface

The API SHALL expose, in the browse role group (admin+client, read-only):
`GET /api/v1/series?library={id}` (integer `library` required — a missing or
non-integer value SHALL yield `400 bad_request`), `GET /api/v1/series/{id}`
(full serial-level document, opaque on the wire; an unknown id SHALL yield `404
not_found` with the canonical error body), and `GET /api/v1/series/{id}/episodes`
(the series' episode items, mirroring the item shape). Handlers SHALL be pure
delegation; the admin mutating group SHALL be unchanged; no write endpoint for
series or item documents SHALL be added by this change.

#### Scenario: Series endpoints sit in the browse group

- **WHEN** the route table is inspected and requests hit the series routes without a valid token
- **THEN** the three series routes are mounted in the browse role group and unauthenticated calls yield `401` with the canonical error body and no side effect

<!-- wf:probe id=e2feb234c74967df -->
```bash
set -e
go test ./internal/api -run TestSeriesRoutesBrowseGated
```
<!-- /wf:probe -->

#### Scenario: Episodes listing and 404 edges

- **WHEN** a client lists the episodes of an existing series and then requests an unknown series id
- **THEN** the episodes endpoint returns the series' episode items in the item wire shape, and the unknown id yields `404 not_found`

<!-- wf:probe id=18b31cb62db7ceff -->
```bash
set -e
go test ./internal/api -run TestSeriesEpisodesAndNotFound
```
<!-- /wf:probe -->

### Requirement: Additive posture

The change SHALL be additive: the proto contracts and `pkg/sdk` SHALL be unchanged
(the reserved `image_provider` capability stays reserved — no new capability type
is wired); `plugins/base-scanner`, `plugins/tv-parser`, and `plugins/image-enricher`
SHALL be untouched and their golden behavior SHALL keep passing; the core packages
(`internal/scan`, `internal/enrich`) SHALL NOT branch on media-type literals
(media-type strings appear only in module config JSON and plugin code); the scan
handoff SHALL stay non-blocking (series records persist during the same drain, and
the response returns after persistence without awaiting enrichment); and the
complexity budgets SHALL hold (methods and unexported API DTOs keep every package
within its exported-symbol budget).

#### Scenario: Core stays media-type-agnostic

- **WHEN** the core packages are inspected for media-type literals and the full Go tree is built
- **THEN** no `"serial"`/`"tv"`/`"image"` literal appears in non-test core code under `internal/scan` or `internal/enrich`, and `go build ./...` succeeds

<!-- wf:probe id=9ca607a7253bdfe1 -->
```bash
set -e
! grep -rn --include='*.go' -E '"(serial|tv|image)"' internal/scan internal/enrich | grep -v _test
go build ./...
```
<!-- /wf:probe -->

#### Scenario: TV and image libraries are unaffected

- **WHEN** the shipped golden scans for the `tv` and `image` module walks and parsers are run
- **THEN** base-scanner, tv-parser, and image-enricher tests all pass unchanged and the scan-library golden behavior holds

<!-- wf:probe id=0796c4f409ad3023 -->
```bash
set -e
go test ./internal/scan ./plugins/base-scanner ./plugins/tv-parser ./plugins/image-enricher
```
<!-- /wf:probe -->

### Requirement: Unicode-first-class serial names

Serial discovery and enrichment SHALL be UTF-8-safe: non-ASCII directory and file
names (e.g. Cyrillic `Необычный адвокат У Ён У Extraordinary Attorney Woo.2022.S01`)
SHALL be discovered, hashed, associated, parsed, and stored verbatim — identity
hashing over the raw bytes, sidecar association by SxxExx/bare number regardless
of the surrounding script, and display-title cleanup preserving non-ASCII
characters.

#### Scenario: Cyrillic serial directory flows through verbatim

- **WHEN** a serial library contains a directory with a mixed Cyrillic/Latin name and episode files under it
- **THEN** the serial record, its episodes, and the parser's cleaned display title all carry the non-ASCII characters unmodified

<!-- wf:probe id=cbaf65a0065ee7b4 -->
```bash
set -e
go test ./plugins/serial-scanner -run TestUnicodeSerialName
go test ./plugins/serial-parser -run TestUnicodeTitlePreserved
```
<!-- /wf:probe -->
