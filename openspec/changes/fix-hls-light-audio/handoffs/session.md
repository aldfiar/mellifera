# Session record — fix-hls-light-audio

## GATE 1 APPROVED (2026-11-01, user via approval prompt)

- Zero spec delta + `skip_specs: true` ACCEPTED; bundle cost (+217 KiB min / +64 KiB gzip) ACCEPTED; TV hardware retest = HUMAN acceptance step post-deploy.
- Registered: 3 tasks (1.1, 1.2, built-in git-check), pipeline home .tmp/fix-hls-light-audio in the WORKTREE, worktree attached.
- Note: an orphaned session record from a main-tree `handoff put` sits at main-tree .tmp/fix-hls-light-audio/handoffs/session.md — ignore it; this file is the live one.
- Context: prod already runs merged main @ 2950ace (relay live, server arc green, bundle index-DZO6n1Ct.js). This fix's deploy + TV retest follow GATE 2.
- Planner corrections to the debugger handoff: mock site is web/src/pages/browse/ItemDetail.test.tsx:1001; LIGHT-build comment spans Player.tsx:13–18; hls-light.d.ts KEEP (witness-only re-comment).

## Apply batch 1 complete (2026-11-01)

- 1.1 GREEN: verify rc 0 (vitest 424/424; repro PlayerHlsBuild.test.tsx green UNMODIFIED). 4 files: Player.tsx (import + :13–18 comment), Player.test.tsx:44 + browse/ItemDetail.test.tsx:1001 (mock specifiers), types/hls-light.d.ts (witness-only comment, kept).
- 1.2 GREEN: verify rc 0 (deterministic rebuild + committed-tree probe + go build). Commit 244e5e6, dist-only: index-BQft76X6.js (full hls build, 1074.57 kB / gzip 332.43 kB) replaces index-BsEr7z14.js; index.html updated.
- Next: GATE 2 (reviewer re-runs + full Go suite anchor + human archive approval).

## GATE 2 — reviewer verdict APPROVED (2026-11-01)

- @wf-reviewer re-ran both duties in its own shell (1.1 rc 0 vitest 424/424; 1.2 rc 0, dist byte-identical rebuild) + GATE anchor `go test ./... -count=1` rc 0 (all packages incl. internal/itest 245s) + spec axis PASS + standards axis PASS. No FAILs. Reviewer receipts appended, cmd-match.
- FLAG-1 (P3, prose only): proposal.md bundle figures cite the hls LIBRARY-dist deltas (371→593 kB), not the served main chunk (853→1076 kB min, 264→331 kB gzip). Accepted cost is honest; CARRY the corrected numbers into the close-out notes (proposal is GATE-1-frozen).
- Status rc 1 is the designed mid-gate state: git-check red until close (commit → git-check → push).
- Prod reality pinned at verdict time: embedded main dist index-DZO6n1Ct.js (859,406 B, zero AudioTrackController strings) = hls.js/LIGHT still on prod; this branch's full-hls bundle (index-BQft76X6.js) ships only at merge-back + redeploy.
- TV incident 20:20 (post-deploy window): two legacy v1 packs (e76d698d, ec59950c) demuxer-failed under the old master's codec composition DURING the lazy re-heal window; v2 packs self-healed 3–4s later, correct shape verified by playlist fetch. TV retest expectation BEFORE this fix deploys: video starts, SILENT (renditions unfetched under light); audio arrives with this merge.
- Next: human archive approval → review.md → close (git-check, pinned archive, @wf-docs, close-out notes w/ corrected bundle numbers, pipeline clean) → merge-back (human-gated).
