- [x] Task 13 (coder): Verify/harden check.sh `*.pb.go` exclusion (R2 — VISIBLE fix task)
  target: mellifera/.claude/skills/mellifera-build/scripts/check.sh | action: MODIFY (verify + defensive hardening only)
  archetype: cli
  skill_hint: grounding
  feature_goal: (see T01)
  why: R2 in architecture_review.md warned that `check.sh`'s symbol-count rule would spuriously FAIL on generated `.pb.go` (a single `scanner.pb.go` exports 20+ symbols), blocking AC-2. The rule's INTENT is hand-written API surface, not generated vendor contracts. This task makes that intent robust. GROUNDING NOTE (G2 drift caught): the CURRENT `check.sh` ALREADY excludes `*.pb.go` via the `find` filter on line 30 (`! -name '*.pb.go'`) — so the R2 fix the plan anticipated is already applied by a different mechanism. This task is therefore a VERIFICATION + defensive-hardening task, NOT a blind redundant edit. Surfaced prominently because the user asked for a visible R2 task and the plan's assumption about check.sh was stale relative to the live script.
  data_flow: enters from: T02 (generated .pb.go exists, exercising the exclusion) → transforms: confirm the symbol-count computation never counts `*.pb.go`; harden so a future edit to the find filter cannot regress it → emits to: T12 gate (check.sh must pass with proto packages present).
  related: producer T02 (the .pb.go files the rule must exclude); consumer T12 (gate relies on the exclusion); R2 (architecture_review.md:14).
  imports: []
  allowed_imports: []
  allowed_categories:
    - stdlib
  precondition: |
    `mellifera/.claude/skills/mellifera-build/scripts/check.sh` exists. CURRENT STATE (read this turn): line 30 builds the source list via
      `find "$dir" -maxdepth 1 -type f -name '*.go' ! -name '*_test.go' ! -name '*.pb.go' ! -name '*.gen.go'`
    i.e. `*.pb.go` is ALREADY excluded from `srcs`, and the grep on line 32 runs only on `srcs`. So generated proto symbols are NOT counted today. evidence: mellifera/.claude/skills/mellifera-build/scripts/check.sh:28-32. T02 (generated .pb.go) should be done so the exclusion is exercised against real generated files.
  behaviors:
    - B1: VERIFIES the symbol-count computation never counts `*.pb.go` — runs check.sh against the module after T02 and confirms proto packages do not FAIL (>12) the gate | ac: AC-2 | kind: normal
    - B2: if the find-side `! -name '*.pb.go'` exclusion is PRESENT (it is, as of this read): no removal needed; the coder may add a belt-and-suspenders `--exclude='*.pb.go'` to the grep on line 32 so a future edit removing the find filter cannot regress the rule, AND/OR add a one-line comment at the find filter documenting WHY `*.pb.go` is excluded (intent preservation per R2) | ac: AC-2 | kind: normal
    - B3: if a future check.sh revision has REMOVED the find-side exclusion (drift between spec time and coder time): the coder adds `! -name '*.pb.go'` back to the find filter (the documented, minimal fix) — NOT a relaxation of the 12-ceiling | ac: AC-2 | kind: error
  invariants:
    - INV1: The change is INTENT-PRESERVING. It does NOT relax the ≤8/12 symbol-count rule; it ensures the rule measures hand-written API surface only (the module map + ai-arch §2 intent). Generated vendor code (protoc output) was never meant to count.
    - INV2: This is a bugfix to the build-skill SCRIPT, not a negotiation of a project rule. The `.claude/skills/` tree is gitignored at the repo root (state.json repo_gitignore_note) — surface the commit question (force-add vs leave untracked) in the handoff; do NOT silently force-add.
  postcondition: |
    (AC-2) check.sh's symbol-count rule is verified to exclude `*.pb.go` (and defensively hardened against regression); running check.sh against the module with all four proto packages present does not FAIL on generated symbols. R2 closed.
  test_seed: |
    # arrange: T02 done (proto .pb.go present). act: re-read check.sh; confirm `*.pb.go` excluded (find filter line 30 OR grep --exclude); run check.sh. assert: no proto package FAILs >12; the four proto packages are absent from the per-package count (they only contain generated code, so find yields 0 hand-written srcs → skipped).
  spec: |
    Signatures: (bash script edit — no Go)

    Steps:
    1. RE-READ `mellifera/.claude/skills/mellifera-build/scripts/check.sh` (do not trust this spec's snapshot — G2 verify the live file).
    2. LOCATE the source-list builder (currently the `mapfile -t srcs < <(find ...)` line). Confirm it contains `! -name '*.pb.go'`.
    3. IF present: optionally harden — add `--exclude='*.pb.go'` to the `grep -rhE ...` on the count line so BOTH the find filter AND the grep enforce exclusion (belt + suspenders); add/refresh the comment explaining "generated protoc output is vendor contract, not authored API". Keep the edit to one or two lines.
    4. IF absent (drift): re-add `! -name '*.pb.go'` to the find filter (the documented minimal fix). Do NOT touch the 12-ceiling or any other rule.
    5. Run check.sh (or wait for T12) and confirm no proto package FAILs the symbol count.
    6. In the handoff: state which branch was taken (verified-present / hardened / re-added) and surface the gitignore question (`.claude/` is gitignored — force-add or leave untracked is a user decision).
  test_exclusions:
    - "(bash script — exercised by running check.sh in T12)"
  error_handling:
    - "live check.sh differs materially from this spec's snapshot (e.g. restructured)": STOP, surface the diff in the handoff, apply the equivalent exclusion at the new location. Do not guess.
  callers_to_update:
    - file: mellifera/.claude/skills/mellifera-build/scripts/check.sh | symbol: (symbol-count srcs filter + grep) | change: ensure *.pb.go excluded (find filter present → optional grep hardening; absent → re-add find filter)
  negative_examples:
    - "DO NOT relax the ≤8/12 symbol-count ceiling to work around generated symbols — exclude them (intent-preserving)."
    - "DO NOT force-add the gitignored `.claude/` skill files without surfacing the commit question to the user."
    - "DO NOT edit any other check.sh rule (file-length, dependency-direction, etc.) — only the .pb.go exclusion."
  existing_code_snapshot: |
    # Heuristic: counts top-level func/type/var/const starting uppercase.
    # Authoritative view: `go doc <pkg>`.
    FAIL=0
    while IFS= read -r pkg; do
      dir=$(go list -f '{{.Dir}}' "$pkg" 2>/dev/null || true)
      [[ -d "$dir" ]] || continue
      # Hand-written public API surface only — exclude tests + generated code
      # (*.pb.go from protoc, *.gen.go). Generated symbols aren't authored API.
      mapfile -t srcs < <(find "$dir" -maxdepth 1 -type f -name '*.go' ! -name '*_test.go' ! -name '*.pb.go' ! -name '*.gen.go')
      [[ ${#srcs[@]} -gt 0 ]] || continue
      count=$(grep -rhE '^[[:space:]]*(func|type|var|const) [A-Z]' "${srcs[@]}" 2>/dev/null | wc -l | tr -d ' ')
  source_anchor: mellifera/.claude/skills/mellifera-build/scripts/check.sh:28-32 (live read this turn — `! -name '*.pb.go'` already present); architecture_review.md:14 (R2 mitigation)
  scope_boundary: "This task ONLY edits mellifera/.claude/skills/mellifera-build/scripts/check.sh (the .pb.go exclusion). No other file."
  out_of_scope:
    - any other check.sh rule
    - the 12-symbol ceiling value
    - any Go source file
  line_budget: 8
  line_budget_flex: 1.5
  acceptance_criteria:
    - scenario: AC-2 | given: proto packages present | when: check.sh runs | then: no proto package FAILs the symbol count (generated code excluded)
  verify: grep -n "pb.go" mellifera/.claude/skills/mellifera-build/scripts/check.sh && cd mellifera && bash .claude/skills/mellifera-build/scripts/check.sh
