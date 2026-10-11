# Design: fix-episode-playback

## Context

The pack lane publishes head-first: phase 1 remuxes the first HeadChunk
seconds into `tmp` (EVENT playlist, no ENDLIST), `tmp` is renamed to
`final/<nonce>/` and becomes playable; phase 2 remuxes the remainder into
`tmp-tail`, `moveTree` folds it under `final/<nonce>/t/`, and
`mergePlaylists` rewrites each variant playlist to the complete ENDLIST merge
(`internal/stream/pack.go`). Two facts make the current defects dangerous:

- ffmpeg's `-hls_list_size` defaults to 5; the head phases pass
  `-hls_playlist_type event` (which implies an unbounded list), the tail
  phases pass neither — so only the tail's last 5 segments enter the merge.
- Serving is strict (`internal/stream/serve.go` `serveArtifact`: join + open,
  every path component charset-guarded, no fallback), so one unresolvable
  playlist reference is a player-fatal 404. hls.js resolves relative URIs
  against the playlist's OWN URL client-side, so a `../`-bearing reference
  never puts `..` on the wire — the strict per-component guard is unaffected.

Already-published broken builds cannot re-enqueue: their packaging state is
`complete`, the play verb's `retry` answers 400 when nothing failed, and the
frontier skips packaged items. The stores know nothing is wrong; only the
disk disagrees with the playlists.

See proposal.md — Why for the defect detail; the spec deltas pin the
corrected behavior.

## Goals / Non-Goals

Goals:

- New packs are whole: every published segment listed, every reference
  resolvable, single-variant and rendition builds alike.
- The user's existing broken library heals without manual steps, and no
  playback surface shows the fatal banner at any point during the heal.
- The latent head-only segment-stranding defect closes with the same
  coverage style (playlist-relative resolution asserts).

Non-Goals:

- No GC of superseded build directories — the repack-collision scenario
  pins that a cached old playlist URL keeps answering old bytes; the budget
  sweep reclaims under pressure (a known, accepted accumulation; the
  wf-debugger handoff's "no GC" finding stays open on the backlog).
- No change to the verb split, the classification rules, the direct floor's
  semantics, or any wire contract (no OpenAPI drift).
- No SPA fallback logic for player-fatal errors — the descriptor is the
  single place that decides what the player attaches to.

## Decisions

### D1 — Tail phases pin `-hls_list_size 0` (not EVENT)

`packTailArgs` and `renditionArgs(seek=true)` append `-hls_list_size 0`.
The tail playlist's own playlist-type semantics are irrelevant —
`mergePlaylists` only consumes its `EXT-X-MAP` and `EXTINF`/URI lines and
writes its own ENDLIST — so the minimal, precise fix is the list size, not a
playlist-type flag. Alternative rejected: re-writing the tail playlist
post-hoc to restore dropped entries — redundant; ffmpeg emits the full list
when told.

### D2 — Rendition tail prefix becomes playlist-relative (`../t/rendK/`)

`variantLayout` returns per-variant merge prefixes computed from the
receiving playlist's slot: `rel "."` keeps `"t/"`; `rel "rendK"` becomes
`"../t/rendK/"`. Refs written into `final/rendK/index.m3u8` then resolve to
`final/t/rendK/…` — exactly where `moveTree` publishes. Alternatives
rejected: (a) relocating tail artifacts under `final/rendK/t/rendK/` — a
physical-layout change that ripples into budget accounting and breaks the
one `t/` convention; (b) merging tail refs with absolute `/media/...` URLs —
couples artifacts to the mount point and leaks into any future re-mount.
`../` is the standard HLS relative-reference shape; hls.js resolves it
client-side (the wire path is `…/t/rendK/seg-…`, clean under
`artifactNameOK`).

### D3 — `publishHeadOnly` unifies on the rename shape

The legacy single-variant branch finalizes the head playlist inside `tmp`
and renames `tmp → final`, mirroring the renditions branch. One publish
mechanism, no branch that writes into `final` while `Pack` deletes `tmp`.
Alternative rejected: copying segments out of `tmp` — two mechanisms where
one atomic rename suffices.

### D4 — Healing is sweep-driven, with the integrity check as the shared mechanism

Three pieces, respecting the repo's mechanism/policy/composition split:

- **Mechanism** (`internal/stream`, new `validate.go`):
  `Service.ValidateBuild(itemID, nonce string) error` — parse every `.m3u8`
  under `Root/itemID/nonce`; every referenced URI (segment lines,
  `EXT-X-MAP` `URI="…"`) must resolve to an existing file relative to that
  playlist's own directory; when a playlist carries ENDLIST, the union of
  referenced segments must equal every `seg-*.m4s` under the build dir.
  Read-only, no media parsing, filename set-equality only — cheap (a few KB
  of text + stats per build) and layout-agnostic. Partial builds (no
  ENDLIST) are exempt from the coverage half by design: their playlists
  legitimately lag the disk while growing.
- **Policy** (`internal/orchestrator`): pure judge `Repacks(items
  []IntegrityItem) []Job` beside `Frontier`/`OnPlay` — unhealthy items →
  repack jobs. Keeping it pure keeps the itest on the real function (no
  `pbSweep`-style mirror for the decision).
- **Composition** (`cmd/mellifera/playback.go`): `sweepIntegrity` walks the
  artifact root like `sweepBudget` (item dirs → nonces, live rows only),
  validates the nonce the doc's `streams` namespace points at for
  `state == "complete"` items, and enqueues the judge's jobs. It runs inside
  the `newSweep` closure — the boot sweep before serving AND the 60 s ticker
  both carry it. `validate` is injected as a func (the `enqueue` seam's
  pattern), so the sweep stays testable without package main.

Alternatives rejected: an admin force-repack route (manual; the user cannot
identify which items are broken); a one-time format-version migration
(artifacts carry no metadata, and a structural check catches ALL corruption —
including evicted-but-still-marked-complete items — not just this bug's
shape); healing on GET (the descriptor verb is pinned read-only).

Loop safety: a repack failure flips state to `failed` + cooldown, which
takes the item out of the integrity pass's `complete`-state scope — no
re-enqueue storm; `EnqueuePack` buffer-full errors are logged and the next
sweep retries (the frontier's existing pattern).

### D5 — The descriptor answers the direct floor for a broken build

`Describe` (`internal/stream/describe.go`) runs `ValidateBuild` when stored
state is `complete` and a nonce is present; on failure it takes the existing
direct-floor branch (mode `direct`, original play URL, fresh token). This
closes the heal window: from the moment the fix deploys, a user playing a
not-yet-repacked episode gets the original bytes instead of the fatal banner,
and after the repack lands the descriptor flips back to `hls`. It also fixes
the adjacent latent hole where budget eviction removes a build while the doc
still says `complete` (descriptor answered an evicted playlist). GET stays
non-mutating — the check reads disk, never writes packaging state.
Consequence: the three tests that fabricate `complete` docs without real
build dirs (`media_test.go` "complete_build", `rendition_test.go` descriptor
case, `api/playback_test.go`) materialize minimal handwritten build dirs —
bounded churn, and exactly the contract the guard enforces. Alternatives
rejected: SPA-side fatal-fallback (the hls descriptor carries no original
URL; client-side URL surgery is fragile); accepting the banner during the
repack window (it is the user's exact complaint).

### D6 — Web: the player IS the media stage; the thumb is its poster

`Player` gains `poster?: string | null` rendered as the `<video>` poster
attribute (absent → no attribute; the browser shows no poster and no broken
state). `ItemDetail`'s video lane stops rendering `{mediaStage}`; the
existing `useItemMedia` thumb fetch (the `hasFrameGrabberThumb` branch)
feeds the poster instead — the blob-URL channel already handles the
authenticated fetch, so no new auth surface. The photo lane ("the photo IS
the page"), episode mini cards, and collection tiles are untouched. No
backend change; the descriptor is consumed exactly as delivered.

## Risks / Trade-offs

- [Describe now performs disk I/O on the descriptor path] → bounded by
  design: a few small text files + stats per fetch, page-load frequency;
  read-only, no locks; a missing dir degrades to the direct floor (the
  safe side).
- [First boot after the fix enqueues every broken item at once] → the
  streams lane's per-item leases serialize work; remux-only packs are
  I/O-bound and fast; the budget cap still governs disk; buffer-full
  enqueues log and retry next sweep (60 s).
- [False-positive integrity failures on healthy builds] → the check is
  filename set-equality plus stat-existence, no media parsing; published
  builds are immutable per nonce and the doc flips to `complete` only after
  `Pack` returns, so the validator never races a live pack.
- [Old broken builds linger on disk until budget eviction] → accepted and
  spec-pinned (cached-playlist safety); not a correctness risk, nothing
  references them after the doc re-points.
- [Box 2.2's probe is half-vacuous until box 4.1 lands the itest] → noted
  in tasks.md; the gate re-runs every probe against the finished tree, so
  the final state is non-vacuous.

## Migration Plan

Deploy → boot sweep validates every `complete` build, enqueues the broken
ones → the streams lane repacks them under fresh nonces → descriptors flip
back to `hls` per item as each repack lands; until then each affected item
answers the direct floor. Rollback: revert the deploy — no data format
changed; broken builds remain broken exactly as today, healed items stay
healthy (their builds are ordinary valid builds).

## Open Questions

None — the repack-path choice, the descriptor guard, and the web poster
approach are resolved here; everything else is pinned by the spec deltas.
