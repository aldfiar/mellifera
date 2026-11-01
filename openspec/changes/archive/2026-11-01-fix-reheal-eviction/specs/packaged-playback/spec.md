# Spec Delta

## MODIFIED Requirements

### Requirement: Remux-only pack lane

Packaged output SHALL be produced by remuxing only — stream copy, no decode
and no encode, ever — into fMP4-HLS carrying one video stream and the audio
tracks; subtitle and data streams SHALL be dropped. Artifacts SHALL be
published atomically into the server's own data space (written aside, then
moved into place), and each packaging run SHALL publish under a fresh build
directory so a repack never collides with a build still in flight.
Publishing a fresh build for an item SHALL NOT delete any of the item's
previous build directories at publish time: the document write that names
the new build makes it the item's one CURRENT build, and every superseded
build directory SHALL remain in place at its own path and keep serving
through the media surface for a retention grace window (10 minutes, locked
— repo precedent: locked defaults, no env knob by design), so a live
session holding the superseded build's playlist and segment URLs keeps
playing through a re-heal. Reclamation is the periodic sweep's decision,
never a publish side effect: the sweep SHALL reclaim a build directory
exactly when it is neither the document-named build nor `.tmp-*` staging,
and its age is past the grace measured on the directory itself AND — when
the item's row exists — on the document's last write, so an in-flight pack
(a fresh, growing directory under a document that does not yet name it) and
a just-superseded build (a fresh document write over an old directory) are
both safe for the full window; an item whose row is gone has no document
anchor and is judged on the directory age alone. Reclamation SHALL reuse
the budget sweep's move-aside-then-delete vocabulary and is best-effort (a
failed reclaim logs a warning and is retried by a later tick — it never
fails anything). The retention SHALL never touch `.tmp-*` staging whose
directory is still fresh (a live pack's staging grows and is never
reclaimed; stalled staging past the grace is), another item's artifacts, or
the document-named build itself — for any packaging state, including
`failed` and after a budget unpublish. Budget pressure may reclaim retained
superseded builds before their grace passes (Budget-capped artifacts owns
that precedence). A client holding a superseded build's playlist URL keeps
serving through the grace window and recovers by refetching the playback
descriptor, which answers the new build. Playlists SHALL be byte-identical
for a given published build.

#### Scenario: Remux drops subtitles without decoding

- **WHEN** an MKV carrying h264 video, AAC audio, and PGS subtitles is packaged
- **THEN** the produced playlist and segments are fMP4-HLS carrying video and audio only — no subtitle or data tracks — and the packaging invocation copies streams without decoding or encoding

<!-- wf:probe id=f9e6ec5d9a440008 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestPackLane
```
<!-- /wf:probe -->

#### Scenario: Repack never collides with a cached playlist

- **WHEN** an already-packaged item is packaged again while a client still holds the previously served playlist URL
- **THEN** the new build publishes at a different location (never into the previous build's directory) and, once the item's document names it, the previous build directory remains on disk and its playlist URL keeps answering through the retention grace while a descriptor refetch answers the new build

#### Scenario: A live session survives the re-heal that supersedes its build

- **WHEN** a play arms the lazy re-heal on an item with a complete pack and the session's next loader requests under the superseded nonce land after the fresh build publishes
- **THEN** the superseded nonce directory still exists and its playlist still answers 200 through the media surface with the session's token — publish never deletes a build a session may be reading

#### Scenario: Publish eviction spares staging and other items

- **WHEN** a publish lands while an in-flight build's `.tmp-*` staging directory and another item's build directory exist on disk
- **THEN** nothing is deleted at publish — the staging directory, the other item's artifacts, the freshly published build, and the superseded build all remain, and only the sweep past the grace may reclaim the superseded one

#### Scenario: The sweep reclaims superseded builds after the grace

- **WHEN** a build directory is neither the document-named build nor in-use staging and its age is past the grace on the directory and on the document's last write
- **THEN** the periodic sweep moves it aside and deletes it with the existing eviction vocabulary, the document-named build and fresh staging remain, and a failed reclaim only logs and waits for a later tick

### Requirement: Budget-capped artifacts

Stored packaging artifacts SHALL live under a storage budget (default 32 GB,
`0` disables the cap). Accounting SHALL read the artifact directories on disk
as the truth — including directories orphaned by moved or deleted library
files — and eviction SHALL be least-recently-watched first (by playback
progress recency), moving the artifact aside before deleting it. Originals
SHALL never be evicted. Retained superseded build directories count against
the budget like any other artifact directory and SHALL be reclaimed before
current builds when the budget demands space — stale nonces first, ahead of
watch recency, regardless of their retention grace — because reclaiming a
superseded directory unpublishes nothing while reclaiming a current build
forces a re-pack; only a build directory that is not the item's
document-named build (and any directory of an item whose row is gone or
deleted) is stale for this precedence.

#### Scenario: Over-budget eviction reaps least-recently-watched and orphans

- **WHEN** artifact directories on disk exceed the budget, including one orphaned by a moved library file, and the least-recently-watched item's artifact and the orphan are oldest by watch recency
- **THEN** eviction removes those artifact directories first and accounting afterwards reports within budget

#### Scenario: Budget pressure reclaims retained builds before current ones

- **WHEN** the budget demands space and a recently watched item still holds a retained superseded build directory past its grace eligibility while an unwatched item's current build is next by recency
- **THEN** eviction takes the retained superseded directory first — the grace never shields an artifact from budget pressure — and the current build is evicted only if the budget still cannot be met

<!-- wf:probe id=afb6d2ff79cb0935 -->
```bash
set -e
go test ./internal/orchestrator -run TestBudgetEviction
```
<!-- /wf:probe -->

### Requirement: Pack flow observability

The pack flow SHALL be traceable from the server log alone, riding the
decision-log pattern — compact INFO lines with stable prefixes at the
moments that matter, never per segment, never a new log-level system (the
binary serves the default slog INFO level): a packaging job SHALL log ONE
job-start line at the build executor carrying the item id, the playback
classification outcome (`direct` | `pack` | `opt_in` | `direct_only`), the
gate verdict (`open` or the refusal token), and one compact rendering of
the stored codec facts (the video codec and profile, the audio codecs with
multiplicity); the pack lane SHALL log ONE publish line per successful
pack carrying the item id, the build nonce, the layout decision
(`single-variant` | `rendition`), the variant count, the audio
(EXT-X-MEDIA member) count, whether the codec record was `recorded` or
`degraded`, and the ffprobe probe count (the per-variant cost); a failed
pack SHALL log ONE warning line naming the failing stage; a gate-refused
job SHALL log the refusal token on its job-start line and no publish line.
Publishing SHALL NOT log an eviction line — deletion is never a publish
act; the eviction line keeps its existing vocabulary and shape and rides
the sweep that owns the decision (publish-time retention and budget
reclamation alike). No new line SHALL carry a media token value or a play
URL (INV4 — item ids and build nonces are artifact identifiers, not
credentials), and the flow SHALL cost a bounded number of lines: one per
job plus one on failure, regardless of segment count or build size.

#### Scenario: A pack job logs the flow line sequence

- **WHEN** a packaging job runs from enqueue through publish with the server log captured
- **THEN** the captured log carries the job-start line (classification outcome, gate `open`, the codec-facts rendering) followed by the publish line (layout `single-variant` or `rendition` with variant and audio member counts, the nonce, `codecs` `recorded` or `degraded`, the probe count) and no eviction line — the eviction line, when a sweep later reclaims a superseded build, names the reclaimed path from the sweep, not from a pack job

#### Scenario: A gate-refused pack names the token and stops

- **WHEN** a packaging job reaches the build executor after the opt-in codec knob was disabled and the gate refuses the item
- **THEN** the job-start line carries the refusal token as the gate verdict and the flow ends there — no publish line exists for the job, and no packaging-failure ledger row is charged

#### Scenario: A failed pack logs its stage

- **WHEN** a packaging job's remux fails partway (the build never publishes)
- **THEN** exactly one warning line names the failing stage, the flow shows the job-start line followed by the warning, and the persisted state records the failure as before
