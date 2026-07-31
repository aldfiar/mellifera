- [x] Task 12 (coder): Green all five verification gates
  target: (whole module — verification, not new code) mellifera/ | action: MODIFY (gate-fix only)
  archetype: cli
  skill_hint: mellifera-build
  feature_goal: (see T01)
  why: AC-2 is the shippability gate. The five commands (`go build ./...`, `go test ./...`, `golangci-lint run ./...`, `gofmt -l .`, `check.sh`) must all exit 0. This task runs them, fixes any failure, and verifies per-package: ≤8 symbols (WARN 9-12 only where documented — store=10, plugin=9), doc.go present, Apache headers present, zero reflect, zero DI imports, table test per exported symbol. NOTE: golangci-lint is NOT installed in this environment (state.json phase_log) — see BLOCKER note.
  data_flow: enters from: all coder tasks (T01-T11 + T13 done) → transforms: run gates, triage failures, apply minimal fixes (formatting, header, test gaps) → emits to: a green pipeline (reviewer/health-check rely on these gates).
  related: depends on T01-T11 + T13 (all code + the R2 fix done); validates every package; AC-2.
  imports:
    - (no new imports — gate-fix only; if a fix needs an import, it belongs in the owning package task)
  allowed_imports: []
  allowed_categories:
    - stdlib
  precondition: |
    All coder tasks T01-T11 + T13 are complete (code + the R2 check.sh verification). The module compiles (`go build ./...` may still have lint/test failures — this task resolves them).
  behaviors:
    - B1: `cd mellifera && go build ./...` exits 0 | ac: AC-2 | kind: normal
    - B2: `cd mellifera && go test ./...` exits 0 (integration test SKIPs cleanly if ffprobe absent) | ac: AC-2 | kind: normal
    - B3: `cd mellifera && golangci-lint run ./...` exits 0 (funlen≤60, gocognit≤15, gocyclo≤15, lll≤120, dupl, depguard denies reflect+DI, govet, ineffassign, misspell) | ac: AC-2 | kind: normal
    - B4: `cd mellifera && gofmt -l .` outputs nothing | ac: AC-2 | kind: normal
    - B5: `bash mellifera/.claude/skills/mellifera-build/scripts/check.sh` exits 0 — every package ≤8 symbols (WARN at 9-12 only for documented store=10/plugin=9), doc.go present, Apache headers present, exported-symbol-without-test = none | ac: AC-2 | kind: normal
    - B6: zero `reflect` usage, zero DI-framework imports across the module (depguard + grep confirm) | ac: AC-2 | kind: normal
    - B7: any gate failure is fixed by a MINIMAL change (formatting / missing header / missing table test / a split if a package genuinely exceeds 12) — NOT by relaxing the budget | ac: AC-2 | kind: error
  invariants:
    - INV1: A failed check means REDESIGN, not relax. If check.sh FAILs on a >12 package, split the package; do not raise the ceiling. (mellifera-build skill.)
    - INV2: WARN packages (store=10, plugin=9) are pre-justified (R10) — WARN is acceptable; FAIL (>12) is not.
    - INV3: Generated `*.pb.go` is exempt from the symbol-count rule (R2/T13 confirms the exclusion).
  postcondition: |
    (AC-2) All five gates exit 0; every package conforms (≤8/WARN-documented, doc.go, headers, table tests, no reflect/DI).
  test_seed: |
    # (no test — this task RUNS the gates). act: run the five commands in order. assert: each exits 0; gofmt -l . prints nothing.
  spec: |
    Signatures: (none — verification task)

    Steps:
    1. `cd mellifera && go build ./...` — fix compile errors (belong to the owning package; if a fix changes a contract, STOP and surface it).
    2. `cd mellifera && go test ./...` — fix test failures; ensure the integration test SKIPs cleanly when ffprobe is absent.
    3. `cd mellifera && golangci-lint run ./...` — fix funlen/gocognit/gocyclo/lll/dupl/depguard/govet/ineffassign/misspell findings. BLOCKER: if golangci-lint is NOT installed (state.json phase_log note), STOP and report `status: blocked` with "golangci-lint not installed" — do NOT pretend the gate passed. Surface for the user to `brew install golangci-lint`.
    4. `cd mellifera && gofmt -l .` — `gofmt -w .` any listed files.
    5. `bash mellifera/.claude/skills/mellifera-build/scripts/check.sh` — triage by package: missing doc.go → add; missing header → prepend `.license-header.txt`; exported symbol without test → add table test; >12 → split (do not relax). Confirm `*.pb.go` excluded (T13).
    6. Re-run all five until green. Record the final per-package symbol counts in the handoff (store=10 WARN, plugin=9 WARN, others ≤8).
  test_exclusions:
    - "(none — verification task)"
  error_handling:
    - "golangci-lint not installed": BLOCK — report `status: blocked` ("golangci-lint not installed; AC-2 cannot be verified"). This is a known environment gap (state.json phase_log note). Do NOT mark AC-2 green without it.
    - "check.sh FAILs on a >12 package": split the package (redesign), do not relax.
    - "a gate failure requires a contract change": STOP — surface to the user (a contract change needs a planner/specifier decision, not a coder gate-fix).
  callers_to_update: []
  negative_examples:
    - "DO NOT relax the complexity budget to make a gate pass — redesign (split)."
    - "DO NOT mark AC-2 green if golangci-lint is not installed — BLOCK and report."
    - "DO NOT add tests that assert 'something happened' — table tests per exported symbol, real assertions."
  existing_code_snapshot: |
    (N/A — whole-module verification. The code is the union of T01-T11 outputs.)
  source_anchor: acceptance.md:28-33 (AC-2); mellifera-build SKILL.md:56-61 (check.sh); .golangci.yml:1-40 (lint config)
  scope_boundary: "This task ONLY runs gates + applies minimal fixes (formatting, headers, doc.go, table-test gaps) across mellifera/. Any fix that changes a contract or splits a package is surfaced, not done silently."
  out_of_scope:
    - mellifera/.claude/skills/mellifera-build/scripts/check.sh logic changes  # T13 owns the .pb.go exclusion
    - new features to fix a gate (redesign only, surfaced)
  line_budget: 0
  line_budget_flex: 1.0
  acceptance_criteria:
    - scenario: AC-2 | given: all code written | when: the five commands run | then: all exit 0 (or BLOCKED if golangci-lint absent)
  verify: cd mellifera && go build ./... && go test ./... && gofmt -l . && test -z "$(gofmt -l .)" && bash .claude/skills/mellifera-build/scripts/check.sh
