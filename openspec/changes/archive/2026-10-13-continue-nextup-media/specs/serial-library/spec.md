## MODIFIED Requirements

### Requirement: Frame-grab default images

The `frame-grabber` plugin SHALL produce a default image for an episode by
invoking the system `ffmpeg` binary via `os/exec` with an explicit argument slice
(NEVER a shell) under a bounded timeout, seeking into the first minutes of the
file (the enrich-time seek point SHALL be `min(300s, 50% duration)` — the
"about 5 first minutes" preview still, with shorter files still yielding a frame
at half their probe duration, never past EOF; previously `min(60s, 10%)`) and
writing a single JPEG frame into the data directory
(`<data_dir>/thumbs/<hash16(series relative path)>/<hash16(episode relative path)>.jpg`;
the data directory root is the `MELLIFERA_DATA_DIR` environment value, default
`./data`). `Convert` SHALL honor an explicit integer `seek_seconds` query field:
it replaces the default seek (the stop-position override) while staying clamped
by the probe-reported duration — never past EOF, never negative. The plugin SHALL
write ONLY `sources.frame-grabber` — carrying the
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

#### Scenario: Five-minute default seek clamped to half duration

- **WHEN** frame-grabber enriches a video whose probe reports a 24-minute duration and one whose probe reports 8 minutes
- **THEN** the default enrich-time seek lands at 300 seconds for the first and at 240 seconds — half the probe duration — for the second, never past EOF

<!-- wf:probe id=c140a9be3ddbad7f -->
```bash
set -e
go test ./plugins/frame-grabber -run TestSeekPolicy
```
<!-- /wf:probe -->

#### Scenario: seek_seconds override replaces the default and stays clamped

- **WHEN** `Convert` is invoked with an explicit integer `seek_seconds` — one below the duration clamp, one above it, and a non-positive value
- **THEN** the override replaces the default seek while remaining subject to the same `min(300s, 50% duration)` clamp — a beyond-clamp override is pulled back to the clamp, an override without a probed duration is honored unclamped — and a non-positive override is ignored in favor of the default

<!-- wf:probe id=92c558a32a6b0699 -->
```bash
set -e
go test ./plugins/frame-grabber -run TestSeekPolicy
```
<!-- /wf:probe -->
