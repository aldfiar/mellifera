# Proposal: serial-watch-flow — titled serials, episode lists, and a watch page with voiceover and subtitle selection

## Why

The serial pipeline already scans directory-structured collections (the
`serial-library` capability: serial-scanner walks the root, serial-parser
cleans titles, sidecar association stamps subtitle/audio facts), the element
page already plays episodes (packaged-playback), and progress already
resumes — but the walk the user described is not complete. Series cards
title themselves from the parser or the folder with no way for the user to
name a serial, episode rows do not apply a title fallback chain, and the
watch page has no voiceover or subtitle selection even though the scan
already discovered exactly those facts (`parsed.sidecars` carries every
subtitle file and every voiceover audio track at any depth under a serial
directory). The user's own libraries are the target layouts: `/media/kofe/ongoing`
(folders per serial), `/media/inrat/anime/ID Invaded [BDRip 1080p]`
(`Rus sound/` holding `.mka` dubs, `Rus subs/` holding `.ass` subtitles),
and `/media/inrat/anime/ACCA_13-ku_Kansatsu-ka` (`.ass` sidecars beside
the episodes).

## What Changes

- **Manual title overrides (store + API):** a `title_overrides` control
  table keyed by the series row id or the item id, with
  `PUT/DELETE /api/v1/series/{id}/title` and `PUT/DELETE /api/v1/items/{id}/title`
  (admin role group, canonical 400/404 edges). Overrides are control state
  beside the documents — a rename never rewrites a document namespace. The
  series and item wire shapes gain an additive `title_override` field
  (empty string when unset).
- **Title fallback chains (SPA):** the serial collection screen and the
  episode list resolve every displayed title through one chain — the manual
  override, else the best plugin-provided title in the document, else the
  floor (the serial directory name for a series, the file name for an
  episode). Rename affordances on the series card and the episode row set
  and clear the override; clearing returns to the chain.
- **Sidecar serving (API):** the item media endpoint accepts
  `?variant=sidecar&n=<index>` serving the bytes of the episode document's
  n-th sidecar — index-keyed, resolved only from the stored document, never
  a client-supplied path (the D6 posture the media endpoint already holds).
- **Voiceover renditions (packaged-playback):** when the pack lane packages
  an episode whose document carries episode-linked audio sidecars, it
  remuxes each resolvable sidecar into the fMP4-HLS build as an alternate
  audio rendition — stream copy only, still no decode and no encode. The
  playback descriptor gains a read-only `voiceovers` projection of those
  stored facts. Direct items keep the direct floor; voiceover switching on
  a direct item is a visible disabled state naming the reason (a packaged
  build is required), not a silent control.
- **Watch-page track controls (SPA):** the episode element page carries a
  voiceover-selection button and a subtitle-selection button beside the
  play affordance. Voiceover selection switches the player's audio rendition
  on a packaged build. Subtitle selection fetches the sidecar through the
  authenticated media channel and renders it as timed text over the video
  (`.vtt`/`.srt` verbatim-converted; `.ass`/`.ssa` dialogue with timing;
  `.sub` listed with an explicit not-renderable state in v1). Selections
  are per-visit state.

## Capabilities

### New Capabilities

None — every delta extends an existing capability.

### Modified Capabilities

- **`serial-library`** — adds manual title overrides: the `title_overrides`
  control table, the `PUT/DELETE …/title` verbs in the admin role group,
  and the additive `title_override` wire field on series/item reads. The
  existing discovery, sidecar-association, and read-only series API
  requirements are untouched (the "no write endpoint" sentence in the
  Series API surface requirement remains true — it was scoped to that
  change; this delta adds a separate capability slice).
- **`media-serving`** — adds sidecar byte serving to the item media
  endpoint as a new index-keyed variant under the same document-only
  resolution and caching posture.
- **`packaged-playback`** — adds alternate voiceover audio renditions to
  the remux-only pack lane and the `voiceovers` projection on the playback
  descriptor. Classification, the direct floor, token gating, sections,
  the frontier, and the budget are unchanged.
- **`web-ui`** — adds the serial title fallback chains + rename
  affordances and the watch-page voiceover/subtitle controls; the SPA
  endpoint allowlist requirement is amended for the new routes (and picks
  up the playback descriptor/play routes it had drifted to omit).

## Impact

- `internal/store` — `title_overrides` table (idempotent DDL in `Open`) +
  set/clear/lookup methods (methods stay outside the symbol budget).
- `internal/api` — four title route handlers (methods, no new exported
  symbols beyond the wire field) + the sidecar media variant.
- `internal/stream` — pack-lane renditions (same single ffmpeg exec site,
  stream-copy) + the descriptor voiceover projection; the `Deps.PackItem`
  seam gains the audio sidecar facts.
- `internal/enrich` / `cmd/mellifera` — the `__streams__` lane extracts the
  audio sidecar facts from the document and passes them through the seam;
  wiring only.
- `web/src` — serial title chains + rename affordances in the collections
  serial body; track controls + a small client-side timed-text converter on
  the episode element page; DTO/endpoint additions in `lib/api.ts`.
- No proto changes, no new Go or npm dependencies, no new env knobs. The
  Go gate stays node-free; the committed `openapi.*` and `internal/web/dist`
  regenerate through the dev-time `make web-build` path.
