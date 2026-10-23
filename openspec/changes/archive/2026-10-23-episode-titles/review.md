# Gate record — episode-titles

## GATE 1

- Proposal approved by the operator in-session (2026-10-23): shikimori writes
  ru-first episode titles onto episode documents via a second anchored extra;
  core routes entries per-episode (lease + bounded retry); explicit series
  strips cascade; guard re-pin; QA joint. `openspec validate
  episode-titles --strict` rc 0.
- Baseline disclosure (worktree bootstrap, base 0a9f2a2): one pre-existing
  flaky failure, `internal/enrich TestGateDerivation/
  enable_pref_wakes_derivation` — passes at -count=3; not attributed to this
  change.

## GATE 2

### Reviewer verdict (first pass): FAIL — one finding

@wf-reviewer re-ran all 7 claimed duties (all rc 0), traced the diff against
all three spec deltas (fully implemented; additive proto confirmed; exported
surface unchanged), and passed the standards axis (linter clean, complexity
budgets met, table-driven tests throughout). The FAIL: the change's sanctioned
second anchored extra (episodes) leaves the PRE-EXISTING TestShikimoriJoint
request-count pin stale (want 6, saw 8) — a red probe would ship inside a
living spec. No box owned the file.

Resolution through the loop: box 2.4 authored (reconcile the pin, sanction
named, zero behavioral changes), applied and claimed; duty green.

### Gate-anchor full suite (session) — second finding, same class

First full `go test ./...` run: rc 1 — two more stale request-count pins, both
from the same sanctioned /episodes companion, both with zero behavioral
failures: TestIdentifyMatchJoint (want 4, saw 5) and TestQAMediaDataJoint
(want 3, saw 4). Boxes 2.5 and 2.6 authored, applied in parallel, claimed;
duties green on session re-run.

### Final state

- Boxes: 10/10 claimed (`wf change status` rc 0) — g1 1.1–1.3, g2 2.1–2.6,
  g3 3.1.
- Full suite at the gate anchor: **rc 0**, 20/20 packages ok (202s itest
  included; the known baseline flake did not fire).
- Reviewer FLAGs addressed: guard re-pin files + joint tests + fixes
  committed (bb61ca5, 23bd712, 1a3e359, 833bcbd on feature/episode-titles);
  working tree clean. The vacuous serial-parser probe in the carried
  plugin-pipeline delta text is pre-existing from identify-match-override —
  left as-is (not this change's sanctioned text).

### Human archive approval

- APPROVED by the operator in-session, 2026-10-23 (after the final full-suite
  rc 0 and status 10/10): `openspec archive episode-titles --yes` may run;
  merge-back follows the worktree skill's human-gated exit.
