# Surveyor handoff — group 15 amendment round (2026-11-17 afternoon)

TO: @wf-reviewer. FROM: the integration surveyor, pre-register audit of tasks 15.1–15.7
(operator re-audit fixes; design §D). Tree @ a89cc56, planner files uncommitted (3 M + 3
??). Full record: `integration.md`, section "Integration audit — AMENDMENT ROUND:
group 15" — this is belief for your re-check, never a substitute for its evidence.

## What the round plans

D1 grid-arrow actuator split (15.1), clear-on-enter body law (15.2: closeBody clears the
twelve fields, SeriesGrid unmounts on `!isBodyOpen`, enter() drops the default body),
re-armed body-top landing (15.3), bodyEpoch race guard over a suspending fake MelliferaApi
(15.4), windowBackground → app_canvas #020617 XML-only (15.5), RailRow fillMaxWidth +
one-line clamps (15.6), RAIL_PANEL_WIDTH 112→96dp (15.7). Device legs all ride 6.1's
single window (15.4 none — JVM-proven).

## Grounding verdicts (your re-check anchors)

- ALL planner line cites verified byte-true on a89cc56 (drift report in the record; two
  spectral notes: RailLawTest EXISTS — "RailLawTest-to-be" is stale; the audit-era
  activateRailRow :529-558 cite has drifted to :658-687, nothing cites it).
- Live map built but extracts ZERO Kotlin symbols — every node grounded by file:line
  reads, map-directed. Re-verify the same way.
- Every 15.x duty grep NON-VACUOUS (reds today) and every context anchor UNIQUE —
  verified. The Q3-12.3 lesson held.

## Check verdicts

- WIRING: PASS — no orphans; 15.5's theme chain and 15.1's actuation chain close
  end-to-end; the 15.4 fake seam is compatible (MelliferaApi = pure suspend interface,
  Api.kt:26; the `apiFor` constructor lambda accepts it).
- QA SEAMS: PARTIAL — two adequacy defects (Q11, Q13 below); @qa rule NOT triggered
  (15.1/15.2 carry audit:true; 15.4's new test classes follow the 10.1/FacetsTest
  precedent; no production new-module).
- COMPLEXITY: PASS — BrowseScreen.kt ×4 / BrowseFlow.kt ×2 heat is DAG-ordered; safe
  under the 9-14 sequential-apply precedent only. The 15.2 ripple list checked COMPLETE
  (railWasOpen gate, homeHoldsEntry's other consumers, CollectionsRail, gridFocusNonce,
  D12 exit — all safe; details in the record).
- DAG: CONSISTENT — 15.1→15.2→15.3→15.4→15.5→15.6→15.7 honors §C; the audit's pairing
  (15.2+15.4, 15.3+15.2) deliberately split into adjacent tasks; no duty depends on a
  later edit.
- Q9 RE-ADJUDICATED: AMENDED — the rail-geometry delta requirement is legitimate (the
  operator's ruling froze the numbers; defect-class, grader-able), Q9's no-presentation
  rule still stands for decoration class (14.1 stays delta-free). No action needed.

## Open questions (numbered; recommendations in integration.md — the human decides)

- Q10 (HIGH): 15.1's cursor actuator key makes isRailOpen OPTIONAL ("[,
  state.isRailOpen]") — keyed on gridFocus alone, the mount-run fires the grid UNDER THE
  OPEN RAIL (the only mount path is activateRailRow; the body composes before the rail
  closes) and steals focus from the rail row for the fetch window. Recommend: isRailOpen
  mandatory in the key/gate.
- Q11 (HIGH): the entry claim keyed mount-ONLY can't re-run on a homeHoldsEntry flip
  ("resolved-empty home hands it back" unserviced — recommend (mount, homeHoldsEntry)
  keying); AND the spec delta's "Entry claim stays gated" scenario describes the pre-15.2
  event and contradicts 8.4/walk62c at every switch mount — recommend rewriting the THEN
  to the post-15.2 semantics (claim stands down while home holds cards; the activation
  landing owns the cursor; grid claim fires only on home-failed/empty).
- Q12 (MED): 15.4's site list omits four reachable stale-write sites — selectLibrary's
  revert (:287-301), pickFolder's revert (:469-474), openSeries' positions write (:718,
  after the loadPositions loop), refresh's positions write (:775). The §B double-switch
  leg can still reproduce through the revert path. Recommend naming all four.
- Q13 (MED): 15.6's prose promises a row-width uniformity device probe; 6.1's group-15
  leg line names none, and a count-less row may be unforceable on-device. Recommend:
  fold into 15.7's leg or drop the probe for the structural law.
- Q14 (LOW): the C-2 App.kt cross-ref comment must not contain the literal
  `background(AppCanvas)` — it would red 15.5's one-hit count-grep.

## State at handoff

SUPERSEDED BELOW — the questions section above is the pre-fold record; the planner
folded all five and the confirmation pass re-audited the folded tree. Your re-check
anchors are the Resolutions section and the confirmation block.

## CONFIRMATION PASS (2026-11-17, post-fold): FRONTIER EMPTY

Re-audited only the deltas (register lines, contracts 15.1/15.4, §D, spec delta,
Resolutions). All five folds verified at every named home, consistent with each other
and with the live tree:

- Q10 verified: isRailOpen REQUIRED at tasks.md 15.1 line + 15.1.md law/Done-when +
  §D (:646-659) + spec.md:268-269; rationale matches the grounded code path
  (selectLibrary commits+awaits loadBody BEFORE the rail close, BrowseFlow.kt:664-678;
  the :562 no-focus-under-rail law cited).
- Q11 verified (both legs): (mountMarker, homeHoldsEntry) keying at register/15.1.md/§D
  (:660-669) with the KEY-SHAPE note protecting the negative grep; the spec scenario
  THEN rewritten to post-15.2 semantics (spec.md:285 — claim stands down, activation
  landing owns the cursor, failed/empty-home branch).
- Q12 verified: all four sites named in 15.4.md's law with per-site mechanism + the
  FOURTH BodyEpochTest leg + Done-when "3 + Q12 revert leg + control"; §D :605-619
  enumerates identically. Zero-cost note (not a question): the register 15.4 TEST
  sentence's leg inventory still says "three S-3 legs + control" without the 4th-leg
  clause — the contract and §D carry it; duty-level consistent (verify runs the whole
  class); one-clause prose touch-up if the planner wants register/contract symmetry.
- Q13 verified: 15.6 prose pointer + explicit 6.1 leg with the honest no-count-less-row
  caveat (evidence class = fillMaxWidth law + 15.7 captures).
- Q14 verified: constraint pinned beside the 15.5 duty (register prose) and §D
  (:636-643), with suggested wording; the verify line unchanged.
- Spectral notes: BOTH STABLE — 15.6's duty reads "RailLawTest green (zero flow laws
  move)" (existing-class posture); the only :529-558 cites remaining are frozen
  walk-ledger history (tasks.md 8.11 narrative, 6.1.md:697 ledger #13), no group-15
  artifact cites it.

Recommendation: approve group 15 for GATE 1 (questions empty; nothing waived).
Resolutions recorded rc 0 strict-validate. Writes this session: integration.md
(round + resolutions read-verified) + this record's confirmation block — nothing else.
