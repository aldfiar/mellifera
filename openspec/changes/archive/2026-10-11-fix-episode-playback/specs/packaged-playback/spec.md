## MODIFIED Requirements

### Requirement: Head-first partial packaging

The first chunk of a packaging run (600 seconds, fixed in v1) SHALL be
published and playable while the remainder packages; the playlist SHALL grow
as segments land, and the closing ENDLIST tag SHALL mark a complete build —
its absence marks a partial one that clients natively live-poll. A complete
build SHALL be whole: the playlist SHALL list every media segment published
under the build directory (the tail phase's playlist is never a sliding
window), and every URI any published playlist references — segment and
EXT-X-MAP init alike — SHALL resolve to an existing file relative to that
playlist's own location, for the single-variant build and every rendition
variant alike. A build whose whole file fits within the head chunk SHALL
publish its segments together with the playlist that references them — no
referenced segment stranded in a staging directory that is discarded after
publish.

#### Scenario: Partial build plays before completion

- **WHEN** packaging has published only the first chunk and a client fetches the playlist, then packaging completes and the client refetches
- **THEN** the first fetch answers a playable playlist without ENDLIST and the refetch answers the grown playlist with ENDLIST

<!-- wf:probe id=750761395b927c06 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestHeadFirst
```
<!-- /wf:probe -->

#### Scenario: Human walkthrough of packaged playback end to end

- **WHEN** the operator walks a packaged item end-to-end in a real browser — playback starting from the partial head-first build and continuing past completion, a TV-remote-style transport-key seek within a section, a chapter-section jump, and an observed over-budget eviction
- **THEN** playback holds throughout without stalling on packaging, seeks land structurally, and the eviction is observable in logs

UNPROBEABLE

#### Scenario: Complete build lists every published tail segment

- **WHEN** a file whose duration exceeds the head chunk is packaged — long enough that the tail phase publishes more segments than a sliding window holds — and the build completes
- **THEN** the complete playlist lists every tail segment published under the build's tail tree, so the reported duration and the reachable content cover the whole file rather than only its last window

<!-- wf:probe id=8a43dcee929d1c7d -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestReproTailSegmentsPlayable
```
<!-- /wf:probe -->

#### Scenario: Every playlist URI resolves at its own path

- **WHEN** a build completes — single-variant, or a rendition build carrying embedded audio plus voiceover sidecars — and any of its published playlists is read
- **THEN** every URI the playlist references, including the tail splice's segments and the EXT-X-MAP init, resolves to an existing file relative to that playlist's own directory, so the player never meets a playlist reference that answers 404

<!-- wf:probe id=bd900d78dfa06dfb -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestReproTailSegmentsPlayable
```
<!-- /wf:probe -->

#### Scenario: Head-only build publishes its segments

- **WHEN** a file whose whole duration fits within the head chunk is packaged
- **THEN** the published playlist and every segment it references land together in the build directory — every reference resolves relative to the playlist and no referenced segment is removed with the staging directory

<!-- wf:probe id=3694483270be0ea8 -->
```bash
set -e
grep -q "func TestHeadOnlySegmentsPublished" internal/stream/pack_test.go
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestHeadOnlySegmentsPublished
```
<!-- /wf:probe -->

### Requirement: Playback descriptor and verb split

`GET /api/v1/items/{id}/playback` in the browse role group SHALL be the
read-only playback descriptor — current mode (`direct` or `hls`), packaging
state, sections, and the play URL — and SHALL answer 404 for an unknown item;
it SHALL never mutate packaging state. `POST /api/v1/items/{id}/play` in the
browse role group SHALL be the only playback mutation: a `retry` request
SHALL re-enqueue a failed packaging run, and `from_seconds` SHALL be accepted
and reserved (no-op) in v1; `retry` on an item with no failed packaging run
SHALL answer 400, and an unknown item SHALL answer 404. The descriptor SHALL
trust a stored complete build only as far as it verifies: when the item's
published build fails integrity validation — a playlist-referenced file
missing at its resolved path, or a complete playlist omitting published
segments — the descriptor SHALL answer the direct floor (mode `direct`, the
original's play URL) rather than hand the player an unplayable playlist URL;
the check is read-only and never writes packaging state.

#### Scenario: Retry is the only playback mutation and GET never mutates

- **WHEN** a failed packaging run is re-requested via POST with retry, a GET descriptor is fetched for the same item, and a retry POST is sent for an item whose packaging never failed
- **THEN** the retry POST re-enqueues the failed run, the GET returns the descriptor without changing packaging state, and the second POST answers 400

<!-- wf:probe id=0e71a0af8e1c3eb0 -->
```bash
set -e
go test ./internal/api -run TestPlaybackVerbs
```
<!-- /wf:probe -->

#### Scenario: Broken build answers the direct floor

- **WHEN** the playback descriptor is fetched for an item whose stored packaging state is complete but whose published build fails integrity validation
- **THEN** the descriptor answers mode direct with the original's token-carrying play URL instead of the broken playlist URL, and the stored packaging state is unchanged

<!-- wf:probe id=076f2d6eece1e791 -->
```bash
set -e
grep -q "func TestDescribeBrokenBuild" internal/stream/media_test.go
go test ./internal/stream -run TestDescribeBrokenBuild
go test ./internal/api -run TestPlaybackVerbs
```
<!-- /wf:probe -->

### Requirement: Watch-driven packaging frontier

Packaging work SHALL be decided off the play path by a watch-driven frontier,
swept periodically and at boot per library gated on that library's
streams-enabled state (default enabled): the next episode of a serial packages
once its predecessor is watched (episodes ordered exactly as the episodes
listing orders them); a serial with no watch progress packages its first
episode; a movie packages only when played, never pre-warmed. Items already
packaged, currently packaging, or inside their packaging failure cooldown
SHALL NOT be re-enqueued. An item whose stored packaging state is complete but
whose published build fails integrity validation — a playlist-referenced file
missing at its resolved path, or a complete playlist omitting published
segments — SHALL be treated as not packaged: the sweep re-enqueues it for
repackaging into a fresh build directory.

#### Scenario: Watching an episode fronts the next one

- **WHEN** the frontier sweeps a serial whose episode K carries watch progress and episode K+1 is not packaged
- **THEN** episode K+1 is enqueued for packaging and no other episode of the serial is

<!-- wf:probe id=329a4f043a1380c3 -->
```bash
set -e
go test ./internal/orchestrator -run TestFrontier
```
<!-- /wf:probe -->

#### Scenario: Fresh serial fronts its pilot and movies wait for play

- **WHEN** the frontier sweeps a serial with no watch progress and a movie library with untouched container-hostile items
- **THEN** the serial's first episode is enqueued while no movie is enqueued until its play is requested

<!-- wf:probe id=f8cc8d126bc39aab -->
```bash
set -e
go test ./internal/orchestrator -run TestFrontier
```
<!-- /wf:probe -->

#### Scenario: Streams-disabled library is skipped at the gate

- **WHEN** a library's streams-enabled state is switched off and the frontier sweeps that library
- **THEN** nothing in it is enqueued for packaging while its items keep the direct floor

<!-- wf:probe id=3711aba0eccd5a69 -->
```bash
set -e
go test ./internal/orchestrator -run TestFrontier
go build ./...
```
<!-- /wf:probe -->

#### Scenario: Broken build is re-enqueued at the sweep

- **WHEN** the sweep passes an item whose stored packaging state is complete but whose published build fails integrity validation, alongside healthy packaged items, in-flight packaging, and cooldown-gated failures
- **THEN** only the broken item is re-enqueued for packaging, and the repack publishes a fresh build directory whose playlists satisfy the complete-build contract

<!-- wf:probe id=e3a94ff9390eec25 -->
```bash
set -e
grep -q "func TestRepacks" internal/orchestrator/frontier_test.go
go test ./internal/orchestrator -run TestRepacks
```
<!-- /wf:probe -->

#### Scenario: Sweep healing repacks a corrupted build end to end

- **WHEN** the joint harness packages an episode through the real pack lane, corrupts its published complete build (a deleted tail segment file and a playlist truncated to its last window), and the integrity snapshot drives the repack judge into the real packaging enqueue
- **THEN** the descriptor answers the direct floor while the build is corrupt, and after the repack lands the fresh build directory satisfies the complete-build contract and the descriptor answers hls again

<!-- wf:probe id=bcc5c7c2ba0aedea -->
```bash
set -e
grep -qr "func TestBrokenBuildRepackSweep" internal/itest/
go test ./internal/itest -run TestBrokenBuildRepackSweep
```
<!-- /wf:probe -->
