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
fails anything). The move-aside step exists for the client mid-fetch (an
atomic rename hides the deletion from a live session holding the tree's
segment URLs) and applies to a directory NOT already carrying the
`.trash` suffix: a directory that already carries the suffix — stranded
trash, whether crash hygiene or an earlier pass's removal-failure leftover —
SHALL be deleted on sight, never renamed again, so a failed reclaim retries
the SAME directory under the SAME name on a later tick and a `.trash`
suffix never grows beyond the stranded one; a stranded stale trash
directory is reclaimed like any other stale directory the moment its
removal can succeed, whatever its suffix depth. The retention SHALL never
touch `.tmp-*` staging whose directory is still fresh (a live pack's
staging grows and is never reclaimed; stalled staging past the grace is),
another item's artifacts, or the document-named build itself — for any
packaging state, including `failed` and after a budget unpublish. Budget
pressure may reclaim retained superseded builds before their grace passes
(Budget-capped artifacts owns that precedence). A client holding a
superseded build's playlist URL keeps serving through the grace window and
recovers by refetching the playback descriptor, which answers the new
build. Playlists SHALL be byte-identical for a given published build.

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

#### Scenario: Stranded trash never gains a suffix across passes

- **WHEN** a stale directory already carrying the `.trash` suffix sits under an item's artifact directory and its removal fails (a subtree the sweep cannot unlink), and the sweep passes it again and again
- **THEN** every pass logs the removal warning and leaves the directory under its existing name — no pass renames it aside, no `.trash.trash` name ever appears, and a later pass whose removal succeeds reclaims it outright

#### Scenario: Deeper stranded suffixes are reclaimed on sight

- **WHEN** the sweep passes a stale directory whose name already carries grown `.trash` suffixes (any depth) and its removal can succeed
- **THEN** the directory is deleted outright that pass — no rename-aside, no deeper name, and no trash-bearing residue remains under the item's artifact directory

### Requirement: Budget-capped artifacts

Stored packaging artifacts SHALL live under a storage budget (default 32 GB,
`0` disables the cap). Accounting SHALL read the artifact directories on disk
as the truth — including directories orphaned by moved or deleted library
files — and eviction SHALL be least-recently-watched first (by playback
progress recency), moving the artifact aside before deleting it — the aside
step skipped for a directory already carrying the `.trash` suffix, which is
deleted on sight under the same stranded-trash law the Remux-only pack lane
requirement defines. Originals SHALL never be evicted. Retained superseded
build directories count against the budget like any other artifact directory
and SHALL be reclaimed before current builds when the budget demands space —
stale nonces first, ahead of watch recency, regardless of their retention
grace — because reclaiming a superseded directory unpublishes nothing while
reclaiming a current build forces a re-pack; only a build directory that is
not the item's document-named build (and any directory of an item whose row
is gone or deleted) is stale for this precedence.

The frontier's working set (the bounded pin set the Watch-driven packaging
frontier requirement defines) SHALL be eviction's last resort: pinned builds
fall to eviction only when the budget cannot be met from every non-pinned
artifact alone, whatever their recency — the churn break — and the sweep
SHALL log one loud warning naming the pinned eviction (the operator's signal
that the disk holds more than the budget plus the working set). A budget
eviction of a document-named build SHALL eviction-suppress the item (the
Watch-driven packaging frontier requirement) so the eviction is not silently
undone by a re-pack on the next tick.

#### Scenario: Over-budget eviction reaps least-recently-watched and orphans

- **WHEN** artifact directories on disk exceed the budget, including one orphaned by a moved library file, and the least-recently-watched item's artifact and the orphan are oldest by watch recency
- **THEN** eviction removes those artifact directories first and accounting afterwards reports within budget

#### Scenario: Budget pressure reclaims retained builds before current ones

- **WHEN** the budget demands space and a recently watched item still holds a retained superseded build directory past its grace eligibility while an unwatched item's current build is next by recency
- **THEN** eviction takes the retained superseded directory first — the grace never shields an artifact from budget pressure — and the current build is evicted only if the budget still cannot be met

#### Scenario: A pinned eviction is the last resort, warned and suppressed

- **WHEN** the budget cannot be met from non-pinned artifacts alone and the sweep must evict a pinned build
- **THEN** the sweep evicts it last, logs one loud warning naming the pinned item, suppresses re-fronting of the item until its next real play, and unpublishes the build record so the descriptor answers the direct floor instead of a gone playlist
