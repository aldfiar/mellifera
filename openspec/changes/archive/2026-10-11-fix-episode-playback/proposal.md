# Proposal: fix-episode-playback — every published segment reachable, and an episode page that is only a player

## Why

Episode playback dies at the head/tail boundary with the fatal banner
"Playback failed — the stream could not be played to the end."
(`web/src/components/playback/Player.tsx:175`). The session-verified
diagnosis found two independent defects in the pack lane, both invisible to
the existing suite because the old fixtures never cross ffmpeg's default
5-entry playlist window:

1. **Window-truncated tails.** The tail-phase ffmpeg invocations
   (`internal/stream/pack.go` `packTailArgs`, and `renditionArgs` with
   `seek=true`) set neither `-hls_playlist_type event` nor
   `-hls_list_size`, so the tail playlist holds only the LAST 5 segments;
   `mergePlaylists` publishes that truncated list as the complete ENDLIST
   build. Only the head's segments plus the last 5 tail segments are
   reachable and the playlist duration is fiction. Single-audio builds are
   silently truncated the same way (131 segments listed vs 159 on disk on a
   real library item) — no 404, no banner, but wrong duration, unreachable
   middle-tail, and progress recorded against a fake length. Most of the
   library is silently affected.
2. **Rendition tail URIs at a nonexistent path.** `variantLayout` prefixes
   rendition tail refs `t/rendN/`, but the merge is written to
   `final/rendN/index.m3u8` while `moveTree` publishes tail artifacts at
   `final/t/rendN/…` — every rendition tail ref, including the
   `EXT-X-MAP` init URI, 404s (live-verified on the running server).
   hls.js hits the 404 at the head/tail discontinuity → fatal network
   error → the banner.

Beyond the two defects, the legacy whole-file-within-head-chunk branch
(`publishHeadOnly`) publishes the playlist while `Pack` deletes the staging
directory holding the segments (backlog: "Legacy head-only pack path deletes
published segments") — latent today, one short file away from a 404 at play
start.

And the fix would still not restore the user's library on its own: broken
builds sit at packaging state `complete`, so nothing re-enqueues them —
`POST /items/{id}/play {retry:true}` answers 400 "nothing failed". A
sanctioned healing path is part of this change, not an afterthought.

Second symptom, web-only: the episode page stacks a separate hero thumbnail
("Media stage" section) above the Player in the video lane. The user wants
ONLY the player on the episode page, with the frame-grabber thumb as the
poster image inside the player until playback starts. Episode mini cards
elsewhere keep their thumbnails.

## What Changes

- **Pack lane (`internal/stream/pack.go`):** the tail phases pin
  `-hls_list_size 0` (never a sliding window); the rendition tail merge
  prefix becomes relative to the receiving playlist's own directory
  (`../t/rendK/`) so rendition tail refs — init URI included — resolve where
  `moveTree` publishes them; `publishHeadOnly`'s legacy branch adopts the
  rename shape so head-only builds publish their segments. The diagnosis
  repro `internal/stream/pack_repro_tail_window_test.go` (untracked) is
  committed unchanged as the permanent coverage and passes.
- **Healing for already-published broken builds:** a read-only build
  integrity check (`stream.Service.ValidateBuild`: every playlist-referenced
  URI resolves relative to its own playlist; a complete playlist covers every
  published segment) with two consumers — the playback descriptor answers
  the direct floor instead of an unplayable playlist URL when the stored
  build fails the check, and a third sweep pass re-enqueues broken builds for
  repackaging into fresh build directories (the pure judge lives beside the
  frontier in `internal/orchestrator`). Deploying the fix heals the user's
  existing library at boot: broken items repack through the existing streams
  lane, and until a given item's repack lands, its descriptor answers the
  never-broken direct floor — no banner at any point.
- **SPA (`web/src`):** the video lane renders only the Player; the
  frame-grabber thumb becomes the `<video>` poster (new optional Player
  prop) until playback starts; the photo lane ("the photo IS the page"),
  episode mini cards, and collection tiles are untouched. The committed
  embedded build (`internal/web/dist`) is regenerated and re-committed; no
  route or annotation edits, so the OpenAPI contract comes out byte-identical.

Explicitly out of scope: any encode/decode work (remux-only discipline
unchanged); GC of superseded build directories (a client's cached old
playlist URL must keep answering per the repack-collision scenario — the
storage budget reclaims them under pressure); the play verb's verb split
(`retry` stays failed-only, GET stays non-mutating); native-HLS voiceover
switching and the multi-embedded-audio map (pre-existing backlog flags,
untouched).

## Capabilities

### New Capabilities

None — every delta extends an existing capability.

### Modified Capabilities

- **`packaged-playback`** — three requirements are amended:
  - **Head-first partial packaging** pins what a complete build IS: the
    playlist lists every published segment (no sliding window), every
    referenced URI resolves relative to its own playlist in single-variant
    and every rendition variant, and head-only builds publish their
    segments.
  - **Playback descriptor and verb split** gains the integrity guard: a
    stored complete build that fails validation answers the direct floor
    (read-only; packaging state never written by the check).
  - **Watch-driven packaging frontier** gains the healing rule: a complete
    build failing integrity validation is treated as not packaged and the
    sweep re-enqueues it into a fresh build directory.
- **`web-ui`** — the **Item detail view** requirement is amended: for a video
  item the media stage IS the player (no separate thumbnail or hero image in
  the video lane) and the frame-grabber thumb renders as the player's poster
  until playback starts; the photo page keeps its hero image and episode
  thumbnails outside the item page are untouched. An **ADDED** delivery
  requirement pins the regenerated embedded build.

## Impact

- `internal/stream/pack.go` — tail arg builders, `variantLayout` prefix,
  `publishHeadOnly`; `internal/stream/validate.go` (new) — `ValidateBuild`;
  `internal/stream/describe.go` — descriptor integrity guard.
- `internal/orchestrator/frontier.go` — `Repacks` judge (+ `IntegrityItem`).
- `cmd/mellifera/playback.go` — `sweepIntegrity` pass wired into `newSweep`
  (boot + 60 s ticker), validate func supplied at the composition root.
- `web/src/components/playback/Player.tsx` — poster prop;
  `web/src/pages/browse/ItemDetail.tsx` — video lane renders the player
  only; test updates in `Player.test.tsx` / `ItemDetail.test.tsx`;
  `internal/web/dist` rebuilt.
- Tests: the repro test committed (group 1 anchor); new stream unit tests
  (`TestHeadOnlySegmentsPublished`, `TestDescribeBrokenBuild`,
  `TestValidateBuild`), orchestrator `TestRepacks`, joint
  `TestBrokenBuildRepackSweep` in `internal/itest`; three existing tests that
  fabricate complete-state docs materialize real build dirs.
- No API/wire changes, no new Go or npm dependencies, no data migration, no
  scanner/plugin changes.
