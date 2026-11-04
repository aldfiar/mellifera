# Session handoff — watched-toggle-label

## GATE 1 approved (2026-11-04)

- **Proposal**: WatchedToggle affordance amendment — top-right slot (inline `right:40px`, left of the untouched ⋯ trigger), text label `watched` (accent #a4c8f4 watched / muted ghost + 1px ring unwatched), ALWAYS visible at rest both states (disclosure law retired for this control only), click/aria semantics unchanged, series cards keep passive ✓. SPA-only; no API change.
- **Approval**: operator picked "Approve — apply it" at GATE 1. Validate strict rc 0; surveyor trigger FALSE (no design.md, no file: targets, 3 < 6 tasks). No waivers.
- **Isolation**: worktree `/Users/aldfiar/projects/go/mellifera.worktrees/watched-toggle-label`, branch `feature/watched-toggle-label`, base e5d957f. Baseline: Go suite green, tsc clean, vitest 650/650. Pipeline: strict lane, home `.tmp/watched-toggle-label/`, 1 group / 4 tasks (3 + git-check), registered rc 0.
- **Next**: apply 1.1 (WatchedStates.tsx + test re-pin) → 1.2 (consumer comment sweep + name-pin proof; its grep duty depends on 1.1) → 1.3 (make web-build regen). One fresh @wf-coder per task, sequential (linear DAG). Resolved wf string: `bash /Users/aldfiar/.claude/bin/wf` — run from the worktree root.

## Apply progress (2026-11-04)

- 1.1 green @ `6621205` (rc 0, 1861ms, WatchedStates 15/15) — chip + both-states opacity:1 + right:40px; test re-pin; eslint clean.
- 1.2 green @ `931567b` (rc 0, 3575ms, Collection 61 + ItemDetail 52, negative grep clean) — comments-only, ZERO test retargeting (name-based queries held).
- Flags carried INTO GATE 2 for the reviewer: (a) 1.1 chip height ~20px (auto sizing beats the "28px-ish" prose — quiet by design); (b) 1.1 unwatched ghost color now pinned inline (muted-foreground token — same value as the base class); (c) 1.1 added symmetric unwatched corner/chip pins beyond the literal list; (d) 1.2 reworded ItemDetail.tsx:1235-1237 beyond the literal ~1255 cite (same heading-mount prose, comments-only, same file); (e) 1.2 left TWO residual prose sites out of scope: Collection.tsx:1199-1201 ("the mark takes the top-left" on the film card — stale after this change, fixing needs a scope amendment) and WatchedStates.tsx:46-48 (WatchedMark's own comment — still TRUE for series cards).
- 1.3 (make web-build regen) in flight; git-check closes the set.

## GATE 2 verdict (2026-11-04): PASS after gate touch-up — archive approval pending

- Reviewer re-ran 1.1 (rc 0, 15/15), 1.2 (rc 0, 113/113), 1.3 (rc 0, swag no-op); uncached spot-check green; eslint scoped-clean (2 pre-existing warnings outside hunks); validate strict zero failures. Spec axis PASS (every SHALL implemented + pinned; geometry 40−34=6px gutter verified; 4/4 scenario bodies match). Removal axis PASS (zero old-affordance code/asserions; dist carries the chip).
- Standards: PASS with ONE required fix — Collection.tsx:1199-1201 stale "mark takes the top-left" prose (newly-misleading on the reworked surface) — plus 4 recommended glyph-prose riders. Applied as gate touch-up commit `ed6962b` (comments-only, 3 files); 1.2 duty re-run green on the touched tree. Flags (a)-(d) ACCEPTED/waived; (e)(b) waived as pre-existing.
- Gate anchor: full Go suite green (zero .go files in diff). Verdict + archive approval → review.md at the human gate.
- Operator approved archive ("Approve archive (Recommended)") — review.md written; close order: commit change folder + push → git-check → archive --yes → placeholder police → @wf-docs → close-out → clean → merge-back dry-run → PR → redeploy.
