## ADDED Requirements

### Requirement: Voiceover renditions in the pack lane

When packaging an episode whose document carries episode-linked audio
sidecars (`parsed.sidecars` with kind `audio`), the pack lane SHALL remux
each resolvable sidecar into the fMP4-HLS build as an alternate audio
rendition alongside the embedded audio tracks — stream copy only, no decode
and no encode, ever. A sidecar's absolute path SHALL be derived from the
episode's own stored facts (the episode's `parsed.absolute_path` and
`parsed.relative_path` joined with the sidecar's stored relative path); the
lane SHALL NOT accept client-supplied paths. The build's audio rendition
order SHALL be the embedded audio first, then the episode-linked audio
sidecars in document order. A sidecar that cannot be resolved or read at
build time SHALL be omitted from that build while the rest publishes
(soft-omit); a build that fails outright remains on the shipped
`pack_failed` path. The direct floor and every existing classification rule
are unchanged.

#### Scenario: Packaged episode carries alternate audio renditions

- **WHEN** an episode with embedded audio and two resolvable `.mka` voiceover sidecars is packaged
- **THEN** the published master playlist declares the embedded audio plus two alternate audio renditions in document order, every stream is copied without decoding or encoding, and the direct floor still serves the original bytes

<!-- wf:probe id=99170732b4589948 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestPackRenditions
```
<!-- /wf:probe -->

#### Scenario: Unreadable voiceover soft-omits and the rest publishes

- **WHEN** one of the referenced sidecar files is missing on disk at build time while the other is present
- **THEN** the build publishes with the remaining renditions and is playable, instead of failing the whole pack

<!-- wf:probe id=c8cb3c70656c2c4b -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required to verify the pack lane"; exit 1; }
go test ./internal/stream -run TestPackRenditions
```
<!-- /wf:probe -->

### Requirement: Voiceover tracks on the playback descriptor

The playback descriptor SHALL project the episode document's episode-linked
audio sidecars as `voiceovers`, ordered by document order, each entry
carrying the sidecar's document index and a display label resolved as the
language fact when present, else the containing folder name, else the sidecar
file name. An episode whose document carries no audio sidecars SHALL carry an
empty list. The projection SHALL read stored facts only — never a re-probe,
never client input — and the descriptor SHALL stay read-only: the read half
SHALL never mutate packaging state.

#### Scenario: Descriptor lists voiceovers from stored facts

- **WHEN** the playback descriptor is fetched for an episode whose document carries two audio sidecars — one with a language fact, one without but under a named folder — and for an episode whose document carries none
- **THEN** the first descriptor lists two voiceover entries in document order with the language-then-folder label resolution and their document indexes, the second lists an empty `voiceovers`, and neither fetch changed packaging state

<!-- wf:probe id=61ba379799f368ce -->
```bash
set -e
go test ./internal/stream -run TestVoiceoverTracks
```
<!-- /wf:probe -->
