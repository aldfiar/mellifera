# close-out — tv-playback-unblock

Closed 2026-10-31. Branch `feature/tv-playback-unblock` (cut from the
deployed hotfix line), head `2e5ccff`, pushed; deployed to alatoic
2026-10-31 ~19:00 MSK and live-verified on the real TV the same evening.

## What shipped

- **Honest descriptor** (internal/stream Describe): read-side
  `preparing`/`unsupported` + additive `state_reason`
  (non_native_container / codec_not_opted_in / codec_unsupported);
  play_url retained; persisted docs untouched.
- **Dual-credential media gate** (cookie AND query, either grants naming the
  path item) + one classified `media: rejected` INFO line per 401 (kind /
  class / UA — never token values, INV4).
- **Playback decision log**: one INFO per descriptor GET (item, mode, state,
  reason) from the cmd closure.
- **Completion-aware watched semantics** (per the human's amendment):
  watched = position ≥ 90% duration OR ≥ earliest classified credits start;
  missing facts conservative NOT-watched; proactive packing unwatched-only;
  pack-on-play is the watched-content path; budget-eviction recency
  untouched.
- **Beacon** `POST /api/v1/playback-events`: five-string shape, closed
  mode/phase vocab, 400-before-limiter, 429 silent, one INFO per accepted,
  per-IP 30/min in-process.
- **SPA pack-on-play wiring**: one POST /play {retry:false} per descriptor
  instance (identity = state + tokenless play_url path — D6 as amended),
  bounded 2s/5min preparing poll, Preparing/Unsupported surfaces replacing
  any spinner.
- **SPA failure surfacing**: lane-tagged media-error banners (direct
  onerror; hls fatal type/details/status), clear-on-re-attach, non-empty
  beacon detail (falls back to the browser's own error message).
- **Joint itest** over real store/router/stream + living-docs update to the
  postmortem.

## Receipts

13/13 green (12 tasks + built-in git-check), two rounds: the original run
plus the reviewer's re-run of every duty, plus fresh post-fix receipts for
4.1–4.4 + git-check after commit 2e5ccff. Final `wf pipeline status` rc 0
under the cmd-match rule; reviewer's own receipts were the latest per task.
Full `go test ./...` green at the gate (reviewer-run, beyond the duties).

## Reviewer rulings (both rounds PASS)

Flags a–e all PASS: 1.1 fail-safe unsupported for factless docs; 2.1
comment-only frontier doc edit + earliest-credits-start; 3.1 remote-IP
limiter key; 4.1 beacon riding the shared 401-rotation; 5.1 wireArray
null→[] seam fix. P2 (beacon empty-detail) discharged by 2e5ccff. P3s
folded into the docs pass (postmortem branch naming) and this file
(re-mint wording corrected in the merged web-ui spec).

## Post-archive follow-ups (routed, not lost)

- **New change**: per-device MSE capability gate (descriptor carries the
  pack's codec string; SPA probes MediaSource.isTypeSupported before
  mounting → honest "device can't decode" banner instead of a cryptic
  fatal) + packer honoring OptInCodecs (knob off on prod yet HEVC packs
  built — incoherent today) + per-item artifact replacement (a fresh build
  for an episode evicts that episode's previous build directories — human
  request 2026-10-31).
- **F5 transcode lane** (postmortem, open): the only path to HEVC-on-TV
  playback and to the AVI/mpeg4-ASP title; unplayable-by-any-MSE codecs
  need re-encoding, remux-only can never serve them.
- **Streams budget** stays 60 GiB (user choice); eviction pressure remains
  real at ~58/60.
- Docs debt (api-reference staleness etc.) remains a dedicated pass.

## Evidence

Incident + evidence docs: `.tmp/tv-playback-bugs-2026-10-31.md`,
`.tmp/playback-evidence-2026-10-31.md` (pre-change), docker-logs beacon
lines 2026-10-31 19:11–19:14 MSK (post-change, the observability working
as designed). GATE record: review.md in this folder.
