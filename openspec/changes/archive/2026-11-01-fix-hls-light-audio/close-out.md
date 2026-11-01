# Close-out — fix-hls-light-audio (2026-11-01)

## What shipped

One-line production fix + disclosed ripples: `web/src/components/playback/Player.tsx:3` imports `"hls.js"` (full build) instead of `"hls.js/light"`. The light dist ships no audio-track-controller, so `hls.audioTracks` never populated and EXT-X-MEDIA renditions were never fetched — silent video-only on every MSE device, incl. the TV; the voiceover switch (Player.tsx:273–292, unchanged) had nothing to switch.

Ripples: the two module-seam mocks re-targeted (`Player.test.tsx:44`, `pages/browse/ItemDetail.test.tsx:1001`); the LIGHT-build/D-12 rationale comment rewritten to the full-build lane (`Player.tsx:13–21`); `types/hls-light.d.ts` kept, witness-only (types the repro test's light imports); NEW repro test `PlayerHlsBuild.test.tsx` (RED at baseline, green after the swap, unmodified between); embedded dist regenerated + committed (task 1.2, commit 244e5e6).

## Receipt summary (final; machine home deleted at clean)

- **1.1 green ×2** — wf-coder (vitest 424/424, repro green UNMODIFIED) + wf-reviewer re-run 17:17:20Z, cmd-match.
- **1.2 green ×2** — wf-coder (deterministic dist rebuild + porcelain probe + `go build ./...`) + wf-reviewer re-run 17:17:50Z — rebuild **byte-identical** to the committed payload.
- **git-check green** — wf-reviewer 17:36:12Z (tree committed, branch pushed: `feature/fix-hls-light-audio`).
- **GATE anchor**: `go test ./... -count=1` rc 0 (reviewer shell, every package).
- GATE 2 verdict: PASS (spec / standards / suite / status), one P3 FLAG — recorded in review.md; human archive approval 2026-11-01.

## Corrected bundle numbers (carries review.md FLAG-1)

Served main chunk figures (the proposal's figures measured the hls *library dist*, not the chunk):

| | before | after | delta |
|---|---|---|---|
| minified | 853,395 B (`index-BsEr7z14.js`) | 1,076,199 B (`index-BQft76X6.js`) | +222,804 B ≈ +218 KiB |
| gzip | 264,376 B | 331,558 B | +67,182 B ≈ +66 KiB |

Substance of the accepted cost unchanged; only the endpoints/percentages in the proposal prose were misframed (library file 371→593 kB).

## Verification on prod

- Deployed from this branch via `MELLIFERA_REPO=<worktree> deploy.sh` on 2026-11-01 @ 939f3b4; health 200 after 6s.
- Served-bundle proof of the full build: `/assets/index-BQft76X6.js` = exactly 1,076,199 B, 12 occurrences of the `audioTrackController` runtime key (the light dist has zero; class-name greps are mangled away and prove nothing).
- Descriptor arc green post-deploy: `mode=hls state=complete layout=rendition`, codecs `hev1.2.4.L120.B0` + `mp4a.40.2`, v2 pack nonce `6e608ea79a404e05`.
- **TV retest = human acceptance**: expected now — video AND russian audio, voiceover switch to jpn.
- Separately observed (not this change): two legacy v1 packs demuxer-failed on the TV DURING the lazy re-heal window before this deploy (Hotaru no Yomeiri 02 `itm_2_e76d…`, Katainaka Kensei S2 03 `itm_2_ec59…`) — v2 packs self-healed 3–4s later; stale-window UX + the XviD/AVI never-packed dead end (`itm_4_dc6b…`, Another 01) flagged as follow-ups.
