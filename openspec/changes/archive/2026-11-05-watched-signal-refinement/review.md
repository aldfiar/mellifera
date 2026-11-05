# Review — watched-signal-refinement (the gate record)

## GATE 1 (2026-11-04)

Approved — user selected "Approve — amend Q4 first (Recommended)". Surveyor
frontier Q1–Q4 closed by amendment (round 1 + the approved Q4 rider); N1 kept
as an apply-time/GATE-2 eyeball. Baseline disclosed GREEN at 9949db0
(`go test ./...` 23 ok / 0 FAIL + `npm ci` rc 0).

## GATE 2 (2026-11-05) — verdict: PASS-WITH-FLAGS (approved)

Reviewer re-ran all six duties in its own shell (`--by wf-reviewer`): all
rc 0 — 1.1 23/23; 2.1 75/75; 2.2 84/84; 3.1 33/33; 4.1 17.2s with dist
BYTE-IDENTICAL to the committed hashes; git-check rc 0.
`wf pipeline status` rc 0 — 6/6 green, cmd-match. Gate anchor: full
`go test ./...` rc 0 (23 ok / 0 FAIL) from the worktree — baseline-identical.

Checklist axes: diff-vs-deltas CLEAN (every SHALL traced; `watched` never
renders — zero `>watched<`; hit twins restored by deletion, base 28px / coarse
40px / tv clamp blocks untouched); standards axis CLEAN (toggle strictly
simpler; pure-append CSS +102/−0 held the zero-edits law); symbol-removal
re-ground CLEAN (placement / WATCHED_ACCENT / word-span zero live callers; all
WatchedToggle callers inside the diff); integration.md re-ground HELD (all 10
edges evidenced, no orphans, no waivers — Q1–Q4 amendments verified on disk);
N1 eyeball SATISFIED (own reveals authored at 0,4,0, placed after the 0,3,0
hide).

The 2.2 deviation (three query-scope widenings in Collection.test.tsx) ruled
COMPLIANT — scope-only, content-identical. Precision note (flag 1): the count
means edit SITES; the first site's referent rename drags six assertions in
that test to the card-box scope — negative assertions strictly stronger at the
wider scope, the positive pin's content unchanged, none weakened.
Flag 2 (stale pre-apply "Next" section in handoffs/session.md) resolved by the
verdict-rewrite.

## Manual eyeball (the MANUAL TEST NOTE items) — 2026-11-05, all PASS

Driven via playwright against the worktree build served locally (scratch copy
of the dev DB): at-rest grids light + dark — zero ghost noise; watched ✓
visible at rest at the meta row's right end (accent) and beside the item
heading in BOTH states (D1); unwatched hidden at rest on fine pointers,
revealed on host hover and own keyboard focus (UA focus ring, not button
chrome); tv mode (`mellifera.tv=on`) keeps unwatched persistent; coarse
emulation keeps it persistent with the toggle MEASURED 40×40px (the restored
≥40px twin); rows reserve space with no shift; SeriesCard serial grid
regression clean. Residuals: the ItemGrid (tv-module) mount and an
in-progress bar in the row were not exercisable in dev data — covered by the
DOM pins + tvCssContract (noted, not gating).

## Archive approval

Approved — 2026-11-05, via structured gate question: the browser eyeball ran
first (matrix all-pass, above), then the user selected "Approve archive
(Recommended)".
