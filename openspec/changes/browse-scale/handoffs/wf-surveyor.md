# wf-surveyor → wf-reviewer — browse-scale integration audit (handoff record)

Written: 2026-11-06 · round 3 landing check (latest-wins; supersedes rounds 0–1) ·
surveyed at 211665a (map CURRENT, fp=234bf79a)
Evidence: `openspec/changes/browse-scale/integration.md` §1–§6 (round 0) + §7 (rounds
1–3); this file is belief.

## Round-1 summary

GATE 1 answered Q1–Q4 AMEND; the planner's round landed and is VERIFIED against live
source at HEAD (re-grounded this round, not taken on faith). Strict validate re-run:
valid.

- **Q1/F1+F2 landed** — 1.1 move list + elementTokens/itemTags/genresFor (compile
  rationale verbatim-correct), withSeriesOverride named a keeper; 1.2 + the four
  metadataFor transitive helpers. All six anchors re-verified at HEAD.
- **Q2/F3 landed** — 3.1/3.2/3.3 thread the caller's Viewer (visible-id scoping,
  v.ChainMutes into namerFor, access.System()-built shared/full index preserved);
  home-continue delta carries the visibility-conjunct clause + leak scenario;
  global-search delta the one-sentence clause.
- **Q3/F5 landed** — web-ui delta's second MODIFIED requirement (:89) re-scopes the
  living ":2329" requirement to watch page + grids and records the /home supersession
  ("the /progress-ordering clause no longer applies to the home surface") — merge-safe
  by name-matched replacement.
- **Q4/F4 landed** — 4.1 carries the two-viewer invisible-library case and
  `file: contracts/4.1-joint-itest.md`; every contract anchor re-grounded at HEAD
  (access.User viewer.go:55, principalInjector :22 / principalViewerInjector :37,
  scopedRouter handlers_viewer_test.go:99 — contract cites the enclosing mount :93,
  harmless 6-line offset).

## Rulings on the planner's flagged items

- **(a) design.md stale prose — recommend AMEND (open as Q5).** Non-Goal :72-73
  ("No per-user dimension (L6 accounts inserts…)") is falsified at both ends post-round
  (L6 landed without these routes; this change now threads the allow-list itself); the
  Interfaces naming-constructor list omits HEAD's two namer fields (mutes — l6-accounts
  10.4, display.go:66-74; moduleID — rec-sorting carve-out, :75-80). One prose touch;
  design.md:149's L6-migration-point line stays future-true — no-action.
- **(b) library-facets delta has no visibility clause — recommend AMEND (open as Q6).**
  Verified: zero visibility hits in that delta; behavior lives only in task 3.2 prose.
  Same F6 class already closed on the other two deltas; archive would leave the living
  facets spec silent on leak-existence. One sentence + one scenario (+ half a sentence
  on the filtering requirement).

## Waiver list

Empty — no waived-priority items found.

## Open questions at write time (the frontier)

**EMPTY.** Round 3 verified the round-2 landing: Q5 AMEND landed (design.md Non-Goal
:72-77 reworded — no per-user dimension IN THE INDEX, serve-time Viewer threading in
scope, l6-accounts correction recorded; constructor inventory carries mutes
display.go:66-74 + moduleID :75-80; migration-point line untouched per scope guard)
and Q6 AMEND landed (library-facets delta: visibility-conjunct endpoint sentence,
scenario "A library outside the viewer's visible set serves nothing", filtering
clause scoped to visible libraries). tasks.md byte-consistent with round 1; strict
validate clean on the surveyor's re-run. Q1–Q6 all resolved AMEND and verified —
no open questions, no waivers. GATE 1 approval may be requested.

## Re-check leads for the reviewer (at GATE 2, post-change map)

- Re-ground E7/E8/E24 via `wf index query callers` on scoreProgress/namerFor after the
  change lands; re-run the orphan check on internal/naming (every moved symbol — now
  including itemTags/genresFor/elementTokens and the four metadata helpers — must have
  an api-side caller or a browse-side consumer).
- Verify the archived web-ui spec's "Continue and Next up consume served scores" reads
  as the re-scoped delta text (watch page + grids), with no residual /progress mandate
  on the home surface.
- Verify the invisible-library joint case (TestBrowseScaleJoint) proves SERVE-side
  scoping over the access.System()-built index — the denied-viewer set must genuinely
  exclude the fixture library (anti-tautology note in the contract's Handoff section).
- If Q5/Q6 amend: CONFIRMED LANDED (round 3) — design prose and facets-delta clause
  verified in the artifacts; nothing left open on them at the gate.
