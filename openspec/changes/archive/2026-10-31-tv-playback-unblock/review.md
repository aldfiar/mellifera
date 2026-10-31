# review — tv-playback-unblock

## GATE 2 record (2026-10-31)

**Verdict: PASS (final).** Two reviewer rounds:

1. **Round 1 — PASS-WITH-CHANGES.** All 12 tasks re-run green by @wf-reviewer
   (duties + full `go test ./...` + `openspec validate --strict`), every
   scenario checked in code against the deltas, all five session flags (a–e)
   ruled PASS. Single change: P2 beacon empty-detail seam (hls media-error
   fatals sent `detail: ""`; the server's five-non-empty-strings contract
   400'd the exact telemetry the design needed).
2. **Round 2 — spot-check of the fix commit 2e5ccff: P2 discharged, verdict
   upgraded to PASS.** The fix also stabilized the descriptor identity
   (state + tokenless play_url path) after live-TV evidence: the query token
   re-mints per GET, which re-fired pack-on-play every poll tick (six POSTs
   per page-open) and rebuilt hls.js/MSE until the TV webview answered
   `mediaSourceRequiresReset`. Ruled delta-compliant: D6 amended in
   design.md, spec deltas untouched, no scope changed.

Machine state at approval: 13/13 receipts green under the cmd-match rule,
tree clean, upstream even (git-check green post-push of 2e5ccff).

## Live verification (deploy + real TV, 19:00–19:15 MSK)

Deploy of 2e5ccff to alatoic; live wire checks (identity stability ×3 GETs,
beacon 204 + INFO line, broken payload still 400s) all green. The user's TV
session then exercised the full flow: pack-on-play fired and built in ~14 s,
H.264 packs played, and the two failure edges (an HEVC pack and an
AVI/mpeg4 title) surfaced EXACTLY as designed — one named fatal beacon
(`mediaSourceRequiresReset` + the browser's own append-failure text), one
honest `unsupported / codec_unsupported` banner. Both diagnosed as
out-of-change capability gaps (TV MSE can't take hev1 probing; MPEG-4 ASP is
undecodable by any MSE — remux-only can never serve it), not defects in this
change. The change's observability is what identified both within minutes.

## Human archive approval

Approved 2026-10-31 (~19:25 MSK) via structured answer: the user chose
"After my TV test" at the gate prompt, ran the TV test (above), and on the
findings selected "Honest capability gate first" — whose terms begin with
archiving this change. Follow-ups routed to a new change (per-device MSE
capability gate + packer honoring OptInCodecs) and the open postmortem F5
transcode lane; streams budget stays at 60 GiB per user choice.
