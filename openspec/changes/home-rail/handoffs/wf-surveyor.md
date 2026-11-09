# wf-surveyor → wf-reviewer — home-rail integration survey (written at propose step 4, 2026-11-09)

Belief record; the evidence is `openspec/changes/home-rail/integration.md`
(same change folder) and the source itself. Base surveyed: fa3c254
(worktree). Re-read this before the gate, then re-ground everything against
the post-change tree.

## Audit summary

- Scope audited: proposal.md, design.md, specs/ ×3 (home-continue, web-ui,
  recommendation-sorting), tasks.md, tasks/1.1.md, tasks/1.2.md,
  tasks/2.1.md + both design inputs (series-grain converged design Q1–Q7;
  recs-watched-rail diagnosis). Design inputs are faithfully carried; no
  artifact-vs-input contradiction found.
- **Nodes=27 edges=18**, all grounded by grep + direct source reads with
  `file:line` citations — NOT by the map (see anomaly).
- **Wiring coverage: COVERED — frontier empty.** Every touched surface has
  an implementing task or verified no-change-needed. The only Go consumers
  of the home wire struct are home.go + home_test.go +
  browse_scale_joint_test.go (grep-verified repo-wide); the only SPA
  consumers are api.ts / queries.ts / Home.tsx / Home.test.tsx; no
  plugins/scripts/e2e/docs-code consumers; router.go:435 needs no edit;
  `/progress` + `scoreProgress` (handlers.go:1039) + `scoreSeries`
  (handlers.go:1777) + `scoreItems` (handlers.go:1134/:1337) callers are
  all untouched by the plan.
- **QA seam: both sides pinned at the right joint** (Go omitempty probe ↔
  TS `current?` + tsc whole-tree ↔ client branch + key law); the
  cross-side agreement is register-visible via 2.1's @qa/qa: joint
  (resolved round 2 — see Open questions).
- **Blast radius: contained.** GATE 2 `go test ./...` movers = exactly the
  two named test functions (verified); existing fixtures carry no ledger
  rows, so all existing `Current` derefs stay non-nil; the joint fixture's
  2-row counts survive entity grain (aria = 1 entity + hidden = 1 entity).
  Full vitest movers = Home.test.tsx only. 2.1's whole-tree tsc duty is
  sufficient (zero `row.current` derefs outside Home.tsx:325/:344;
  `ContinueCurrent` only in api.ts). swag writes exactly the two artifacts
  (Makefile:73-75); `docs/` untouched by make web-build. TestHomeRoute has
  6 subtests (planner's count verified).

## INDEX ANOMALY (reproducible — you will hit it too)

`wf index build` exits ok (551 files, fp=8a4dc6f3) but the symbol table is
EMPTY: `wf index query stats` → `symbols=0` (tests=287). Every
`wf index query def/callers` in this change returns nothing to ground with.
**Your GATE 2 re-ground step (`wf index query callers` on removed/renamed
symbols) must fall back to `grep -rnw` + direct reads** — the same fallback
this survey used and recorded in integration.md. Orphan check: grep-based.

## Waiver list

(none granted — waiving is the human's, at GATE 1.)

## Open questions — CLOSED after amendment round 2 (2026-11-09)

**None. Frontier CLOSED.**

- **Q1 — RESOLVED (round 2).** The qa: re-encoding verified on disk:
  tasks.md:20 entries both PASS the exact register regex
  (pipeline.py:113 `^tests/\S+::\S+$` — surveyor re-ran it mechanically);
  the whitespace-free it() title `renders-anchor-card-current-absent` is
  anchored in tasks/2.1.md:33-36 (executor MUST create under this exact
  title) and the Handoff sentence (:67); the Go-side anchor
  (`watched_series_serves_anchor_card`, tasks/1.2.md:41-42) unchanged.
  Seam semantics unchanged from round 1: both joint sides named,
  register-visible, gate-re-runnable.
- **Q2 — RESOLVED (round 1).** tasks/1.2.md Audit slot (:67-72) carries
  the re-ground sentence: invisible_library_two_viewers,
  browse_scale_joint_test.go:834-886, deref :869, count pin :883, leak
  clause. It is on YOUR re-ground list at the gate.
- **O1 — RESOLVED (round 1).** tasks.md 1.1 (:5) pins
  internal/api/recs_ordering.go for the entity layer; proposal.md Impact
  (:82-84) keeps a cosmetic two-placed residual (same package — no
  integration consequence).

## Post-change re-ground checklist for the gate

1. `grep -rnw` each of: `homeEntities`, `scoreHomeEntities`,
   `orderHomeEntities` — every caller inside internal/api, none outside;
   an unconsumed entity function = orphan FAIL.
2. `grep -rn "\.Current\b"` in internal/api non-test + `row.current` /
   `row?.current` in web/src — expect home.go (composer only), the two
   test files (nil-guarded), Home.tsx (branch-guarded); any OTHER deref
   site = unwaived blast-radius FAIL.
3. Re-run `TestHomeRoute` + `TestBrowseScaleJoint` (both subtests that
   touch /home) and Home.test.tsx; diff the anchor-row bytes against the
   TS fixture field-presence (the Q1 seam — honor the recorded resolution).
4. `git status` for the committed artifacts: internal/web/api/openapi.*
   (exactly 2 files from swag) + internal/web/dist/* — present in the
   change diff (one-release law D10).
