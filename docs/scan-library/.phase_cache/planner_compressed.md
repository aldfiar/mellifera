## Phase: planner | Status: done

### Result
Planned the full 10-deliverable foundational vertical slice for Mellifera (API → module → plugin manager → base-scanner subprocess → store → list) as 12 dependency-ordered steps across 9 packages. Confirmed modernc.org/sqlite + github.com/mellifera/mellifera; chose buf for proto extraction; added internal/scan as the pure-delegation-preserving orchestrator. No P0 risks. All gates PASS.

### Key Decisions (max 5)
- **D-Q2 SQLite driver:** `modernc.org/sqlite` (pure-Go, no CGO) — confirmed.
- **D-Q3 Module path:** `github.com/mellifera/mellifera` — confirmed.
- **D-Q1 Right-sizing:** full slice in ONE pass; phasing fallback documented but NOT activated (AC=6<8, Steps=12<15).
- **Proto extraction:** `buf` (generated `.pb.go` committed); verbatim from arch §2.
- **New package:** `internal/scan` (orchestrator, analog of deferred `enrich`; keeps api pure-delegation).

### Files Created (all at mellifera/docs/scan-library/)
- implementation_plan.md (300 lines, has ## File Map + ## Step Outline)
- integration_map.md (77 lines, 13 seams, all populated)
- contracts.md (321 lines)
- architecture_review.md (131 lines, 0 P0 / 10 P1-P2)
- source_baseline.md (108 lines)
- conventions.md (162 lines)
- acceptance.md (84 lines, 6 scenarios)

### Symbol-count WARN packages (under 12-fail ceiling, over 8-warn target)
- internal/store: 10 symbols (owns items + libraries + sole SQLite ownership)
- internal/plugin: 9 symbols (lifecycle + typed Scanner accessor)

### Surfaced for user awareness (NOT silently applied)
- **R2 (P1):** `mellifera/.claude/skills/mellifera-build/scripts/check.sh` counts generated `.pb.go` symbols and will spuriously FAIL on proto packages. Planned fix: one-line `--exclude='*.pb.go'` (intent-preserving bugfix; the rule targets hand-written API surface). Coder applies at Step 12; surfaced as a visible task.
- **R1 (P1):** go-plugin gRPC handshake is the trickiest pure-Go piece; phasing fallback is the safety valve (NOT activated).
- **R7/R8 (P2):** base-scanner in main go.mod (not separate module) + sdk.Scanner single-real-impl — both justified deviations (decision log).

### AC Map (6 acceptance scenarios)
- AC-1: Integration test scans a small fixture into temp SQLite, asserts items persisted with parsed title/season/episode + ffprobe blob. (Step 11)
- AC-2: Table test per exported symbol across all packages. (Steps 3-10)
- AC-3: Proto extraction fidelity — diff against arch §2. (Step 2)
- AC-4: Path-traversal guard — symlink escape, `..`, absolute, nested. (Step 8)
- AC-5: Admin-token middleware — no/wrong/correct token. (Step 9)
- AC-6: ffprobe soft-fail — missing binary, non-zero exit, non-JSON stdout. (Step 8)

### Blocking Issues
- none from planner side; awaits user APPROVE/REVISE/ABORT at Phase 1b

### Next Agent Should
- @wf-specifier: Decompose the 12 Step Outline entries into 12-16 coder tasks (some steps split into build + test). Each task gets precondition, postcondition, allowed_imports, AC trace. Preserve package locality (whole packages where possible). Read integration_map.md for seam ownership. Expect tasks for: go.mod/licensing, protos, pkg/sdk, internal/store, internal/module, internal/plugin, internal/scan, plugins/base-scanner, internal/api, cmd/mellifera, integration_test, gates-green. Plus a visible task for the check.sh .pb.go fix (R2).

### Detail Files on Disk
- mellifera/docs/scan-library/implementation_plan.md (full plan with File Map + Step Outline + decision log)
- mellifera/docs/scan-library/integration_map.md (13 seams)
- mellifera/docs/scan-library/contracts.md (types, interfaces, import map)
- mellifera/docs/scan-library/architecture_review.md (risk register, grounding audit)
- mellifera/docs/scan-library/acceptance.md (6 AC scenarios)
