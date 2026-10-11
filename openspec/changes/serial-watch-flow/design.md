# Design: serial-watch-flow

## Context

The serial pipeline already walks directory-structured collections
(`serial-scanner`), parses serial/episode facts (`serial-parser`), and —
load-bearing for this change — classifies sidecars: every subtitle
(`.srt/.ass/.ssa/.sub`) and audio (`.mka/.m4a/…`) file at any depth under a
serial directory is stamped into the episode document's `parsed.sidecars`
(relative path, kind, language, match basis) or the series record's
`parsed.series_sidecars`, never probed, never items
(`openspec/specs/serial-library/spec.md`, "Sidecar association"). The
element page plays episodes through the playback descriptor
(`internal/stream` Describe) with an hls.js player, and progress resumes.
What is missing is everything the user touches from the collection screen
down: no manual title override exists (the SPA's `serialTitle` chain is
parser → folder name, hard-coded in `web/src/pages/collections/Collection.tsx`),
sidecar bytes are not servable (the media endpoint answers 400 on any
variant but `thumb`), and the playback surface carries no notion of
voiceover or subtitle tracks.

The user's real libraries fix the scope: voiceovers are external `.mka`
audio files in sibling subfolders (`ID Invaded [BDRip 1080p]/Rus sound/`),
subtitles are `.srt`/`.ass` sidecars beside the episodes or in `Rus subs/` —
both already discovery-covered; only serving, selection, and rendition
work is new.

## Goals / Non-Goals

Goals: the user's walk works end to end — titled serial list → episode
list → episode page with play + voiceover + subtitle controls → playback.

Non-Goals:

- No transcoding — voiceovers ride the remux-only pack lane (stream copy);
  the direct floor never changes.
- No dubbed-video-folder identity merging (a subfolder of full `.mkv` dubs
  is not unified with the main episodes; the scan's deep-video warning
  stands). Deferred — see Open Questions.
- No server-side subtitle format conversion; the serving surface stays
  static bytes and conversion is SPA presentation.
- No ASS styling fidelity (karaoke/positioning) — dialogue + timing only.
- No per-user title overrides (single-admin MVP; the override is global).

## D-1 — Title overrides are control state beside the document

One `title_overrides` control table keyed by `entity_id` (series ids carry
the `ser_` prefix, so the two id spaces never collide — the
`playback_progress` per-id pattern). Rename never rewrites a document
namespace: `_provenance` stays a parser-only trail, and a re-scan neither
clears nor follows the override (an override is identity-keyed; it dies
with the identity exactly like parser attachments). The fallback chain —
override > plugin title > folder/file name — resolves in the SPA from the
additive `title_override` wire field plus the document facts, matching the
opaque-document posture: the server stores truth, the client presents.
Alternative rejected: a server-resolved `display_title` field — it would
duplicate the SPA's existing chain logic and harden presentation order
into the API.

## D-2 — Voiceovers are alternate audio renditions in the remux pack lane

Selecting a voiceover must change what is heard, and under remux-only the
only honest mechanism is an fMP4-HLS audio group: the pack lane's single
ffmpeg exec site gains the resolvable audio sidecars as extra `-i` inputs,
`-map`ped into alternate audio renditions — still `-c copy` everywhere, no
decode/encode, one exec site. The build's audio rendition order is pinned:
embedded audio first, then sidecars in document order, so the SPA's
selection maps document index → `hls.audioTrack` (0 = embedded, k+1 =
voiceovers[k]). Alternatives rejected: per-voiceover builds (duplicate
video segments blow the artifact budget), client-side MSE dual-append
(hls.js does not orchestrate two sources; large custom player work), and
voiceover-as-file-switch (re-enters at position zero, wrong mental model).

Soft-omit over hard-fail: a sidecar missing at build time drops from that
build (the rest publishes) because a vanished dub must not take the
episode's playback down — the descriptor still lists from document facts
and the direct floor is untouched. A total build failure keeps the shipped
`pack_failed` cooldown. Direct items cannot switch audio without a remux;
the SPA renders the control disabled with that named reason (serial
episodes pack under the watch-driven frontier, so the packaged build is
the norm for a watched serial).

## D-3 — Subtitles render client-side from raw sidecar bytes

`?variant=sidecar&n=` serves the document-indexed file verbatim (same
static posture, ETag, and document-only resolution as the original/thumb
variants); the SPA fetches through the existing authenticated blob channel
(a `<track src>` cannot carry the bearer header) and converts in the
browser: `.vtt` passthrough, `.srt` → WebVTT (trivial text transform),
`.ass`/`.ssa` dialogue extraction (timing + text, styling dropped). A
`.sub` (MicroDVD — frame-based) is listed with an explicit not-renderable
state rather than converted garbage. No new npm dependency: the converter
is a small pure module (`src/lib/subtitles.ts`) unit-tested in Vitest.
Alternatives rejected: server-side ASS→VTT (a real parser living on the
serving surface, contradicting static-bytes) and a WASM ASS renderer
(a multi-MB dep for styling fidelity this change does not promise).

## D-4 — Sidecar serving is index-keyed over document facts

The media endpoint resolves `n` against `parsed.sidecars` exactly as it
resolves `variant=thumb` against `sources["frame-grabber"]`: a number into
the stored list, never a path from the client (the D6 posture that
endpoint already enforces). Absolute sidecar paths derive from the
episode's own stored facts (library root = `absolute_path` minus
`relative_path`, joined with the sidecar's relative path) — the same
derivation the pack lane uses, so serving and packing agree.

## D-5 — Additivity posture

Zero proto/SDK changes, zero new Go/npm dependencies, zero new env knobs.
Symbol budgets hold: store methods stay outside the count; api's title
handlers are methods (the package stays in its WARN band); the descriptor
projection is an unexported helper beside `projectChapters`. The `__streams__`
lane keeps owning the streams namespace — the pack job simply carries the
sidecar facts through the `Deps.PackItem` seam. Complexities: funlen on
the rendition-mapping ffmpeg invocation is the risk point (the existing
pack lane already sits near the budget — split the argument-slice builder
into a pure function if needed).

## Interfaces (cross-group)

- **Sidecar facts (existing, read-only input):**
  `parsed.sidecars[] = {relative_path, kind: "subtitle"|"audio", language,
  match_basis}`; `parsed.series_sidecars[]` at serial level; language may
  be empty (label falls back to the containing folder name, then file name).
- **Title overrides:** table `title_overrides(entity_id TEXT PRIMARY KEY,
  title TEXT NOT NULL, updated_at)`; wire `title_override` (string, `""`
  when unset) added to the series list/detail and items list/detail DTOs;
  routes `PUT/DELETE /api/v1/series/{id}/title` and
  `PUT/DELETE /api/v1/items/{id}/title` (admin group; body
  `{"title": "<non-empty>"}`; 200 with the record on PUT, 204 on DELETE).
- **Sidecar media variant:** `GET /items/{id}/media?variant=sidecar&n=<int>`
  (browse group, unchanged bearer gate); 400 missing/non-integer/negative
  `n`; 404 out-of-range index / no sidecar facts / unknown item / missing
  file.
- **Descriptor voiceovers:** additive `voiceovers: [{index, label}]` on the
  playback descriptor — document-order audio sidecars; `index` is the
  sidecar's document index; the build maps document order → audio
  rendition k+1 (0 = embedded). The SPA prepends the embedded-audio entry.
- **PackItem seam:** gains the episode-linked audio sidecar facts (paths +
  order) extracted from the document by the `__streams__` lane; enrich
  still never imports stream.

## Risks / Trade-offs

- [Multi-rendition packs grow artifacts and pack time] → stream-copy is
  cheap and the existing 32 GB LRU budget already evicts least-recently-
  watched; no budget change.
- [hls.js audioTrack switching UX] → native hls.js feature; selection
  without restart is its default behavior; per-visit state avoids
  persistence questions.
- [ASS dialogue extraction is imperfect (overlap/positioning lost)] →
  dialogue + timing is the acceptance floor; full styling stays deferred
  (Open Questions).
- [N+1 override lookups on list endpoints] → MVP volumes; batched lookup
  where the query already pages (implementation latitude).
- [Rendition mapping drift between build order and descriptor order] → the
  order rule is pinned in Interfaces and asserted by
  `TestPackRenditions` (playlist group order) against the same fixture
  order `TestVoiceoverTracks` uses.

## Migration Plan

None — additive DDL (`CREATE TABLE IF NOT EXISTS`), additive routes and
wire fields, additive descriptor field. Rollback = revert; no data
migration in either direction.

## Open Questions

- Dubbed-video voiceover folders (sibling subfolders of full `.mkv` dubs):
  currently the deep-video warning hides them. Aligning two video trees by
  episode number is a discovery-level feature — deferred with a named
  revisit trigger (first user with that layout).
- ASS rendering fidelity (styling/karaoke): a WASM renderer could land
  later behind the same selection control without spec change.
- Whether the rename affordance should hide for a probed client role: the
  MVP surfaces the canonical 403 inline instead (the app is single-admin;
  `RoleClient` has no minter).
