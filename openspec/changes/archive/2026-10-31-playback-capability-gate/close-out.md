# close-out — playback-capability-gate (2026-10-31)

Closed the same evening it was seeded: the live findings from the
tv-playback-unblock postmortem became this change, GATE 1 approved,
applied, gated, and archived in one session.

## What shipped

- **One pack gate** — `stream.PackGate(ff, optInCodecs) Gate` in
  `internal/stream/classification.go`; refusal tokens ARE the
  descriptor's `state_reason` tokens (`codec_not_opted_in`,
  `codec_unsupported`). Ridden by describe floorReason, episodeFromDoc,
  the POST /play retry closure (`refusal.PlayRefusal` → 400, code =
  gate token, retryable:false), the integrity repack sweep (one INFO
  refusal line, no enqueue, no ledger), and the build executor
  (`refusal.PolicyRefusal` → `state: failed` with NO `pack_failed`
  row — a knob setting never charges the 30-day cooldown; knob-on
  heals via the frontier).
- **Codec truth on the wire** — `internal/stream/codecs.go` composes
  RFC 6381 strings by probing the published build's VARIANT PLAYLISTS
  (apply-time D2 amendment: bare fMP4 init probes report no
  profile/level); recorded at publish (`doc["streams"].codecs`),
  projected through Describe's 7th return → the additive `codecs`
  descriptor field; read-side legacy composition answers pre-record
  builds; direct answers carry none; uncomposable → absent (fail-open).
- **SPA pre-mount probe** — one `MediaSource.isTypeSupported` call on
  the default mount (video + first audio) before `new Hls()`; a miss
  renders the honest device-unsupported banner and one beacon
  `{hls, video-error, device-cannot-decode, <probe mime>}` — the TV's
  cryptic MSE fatal becomes a named refusal.
- **Publish replacement** — `stream.Service.EvictSuperseded` via
  `enrich.Deps.AfterPackPersist`, ordered after the success doc write;
  one current build per item (the human ruling), `.tmp-*` staging
  never touched, budget LRU untouched.
- **Docs** — postmortem Post-archive findings routed (5.2); F5
  transcode lane and manifest CODECS stay deliberately open.

## Receipt record (machine home `.tmp/playback-capability-gate/`, now cleaned)

Apply (wf-coder / wf-docs runners, receipts 17:38–19:27Z, all green;
several after fix-and-re-run — journal holds both):

| Task | Outcome |
|------|---------|
| 1.1 PackGate judge + refactors | green |
| 1.2 retry + sweep-site gates | green |
| 1.3 build-time gate, no ledger | green |
| 2.1 publish-time codecs record | green |
| 2.2 end-to-end codecs projection | green |
| 3.1 SPA probe + honest banner | green (first verify refused: 1 test red, fixed, re-run green) |
| 3.2 embedded regen | green (separate commit 6efa768) |
| 4.1 publish-replacement eviction | green |
| 5.1 joint itest | green (two red runs — both defects in the runner's own test, zero production defects) |
| 5.2 postmortem routing | green first run |
| git-check | green at 5dbf4b1 and again at 9bb0ad4 |

GATE 2: first round @ 5dbf4b1 **FAIL** — F1: internal/api 13 exported
symbols > 12 bar (`PlayRefusal`); check.sh + full suite's ac7_gates
deterministically red (the PR #21 class of catch, as the loop memory
predicted). Discharge @ 9bb0ad4: both refusal types re-homed into the
new `internal/refusal` (api 12, enrich 11); F2 wording drift fixed.
Re-verdict: **PASS-WITH-FLAGS** (reviewer's own shell: check.sh OK,
full `go test ./...` rc 0 with ac7 live, re-home mechanical, receipts
re-verified `--by wf-reviewer`). Human archive approval recorded in
review.md. Remaining P3 wording notes routed to the docs pass.

Commits: 6efa768 (regen) → 5dbf4b1 (the change) → 9bb0ad4 (gate fix).
Spec deltas merged: packaged-playback +1/~2, web-ui +1/~1.

## Known residue (for future passes)

- P3 mechanism wording in the archived proposal Impact prose and
  tasks/2.1.md six-slot (review.md documents the correction).
- Pre-existing: gofmt-dirty internal/itest/qa_display_naming_joint_test.go
  and qa_episode_titles_joint_test.go; pbNewWorld harness Playback
  closure drops Describe's Codecs (green — nothing asserts codecs
  through it yet); docs debt (api-reference depth, project_structure
  thinness) — flagged 24 Oct.
- Open follow-ups: F5 transcode lane (the only path to HEVC-on-TV and
  the AVI/mpeg4-ASP title), manifest/master-playlist CODECS attributes
  (routed to the F5 design), infra-vs-content cooldown classification.
