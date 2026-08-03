# Task 09 — gates-green + structural/additive probes (AC-2 + AC-3 negative)

- **Type:** coder (verification/gate)
- **Step:** 10 (Outline) — the final AC-2 gate + the AC-3 structural negative probes
- **Seams:** (verifies all)
- **AC trace:** AC-2, AC-3
- **Project scope:** `.` (root; runs the build gate + the additive negative probes)
- **Deps:** Tasks 01-08 all landed
- **Estimated LOC:** ~0 source (gate-runner; may add a `Makefile` target or a `.check` script note — none required)

## behaviors

- **B1** `go vet ./...` is clean across the whole module. | ac: AC-2 | kind: normal
- **B2** `go build ./...` succeeds (the binary + all packages compile). | ac: AC-2 | kind: normal
- **B3** `go test ./...` passes (unit + integration; integration skips cleanly when external deps are absent). | ac: AC-2 | kind: normal
- **B4** `golangci-lint run ./...` is clean (funlen/gocognit/gocyclo/lll/depguard/dupl — `.golangci.yml`). | ac: AC-2 | kind: normal
- **B5** `bash .claude/skills/mellifera-build/scripts/check.sh` reports `check.sh: OK`: `internal/enrich` at 7 exported symbols (≤8 WARN/≤12 FAIL), `internal/store` at 5, every new exported symbol has a co-located table test, every file <500 lines, no generated-symbol budget breach. | ac: AC-2 | kind: normal
- **B6 (AC-3 negative probe — plugin contract unbroken)** `git diff -- 'proto/**' 'pkg/sdk/metadata.go' 'plugins/tv-parser/**' 'plugins/base-scanner/**'` is EMPTY (no contract edits — only DISPATCH moved). | ac: AC-3 | kind: normal
- **B7 (AC-3 negative probe — Enrich preserved)** `grep -rn 'func Enrich(' internal/enrich/` returns ≥1 hit (the serial entry is preserved, now worker-internal — deprecate-don't-delete). | ac: AC-3 | kind: normal
- **B8 (AC-3 negative probe — no forbidden patterns)** no `enrichment_jobs`/`enrichment_leases`/`queue_items` table; no `reflect`; no DI framework import; no CGO; no new dependency in `go.mod` (B1 adds NONE). | ac: AC-3, AC-2 | kind: normal

## invariants

- **INV-gate-is-the-truth:** the `check.sh` exit code + `go test` exit code are authoritative. A lint warning is NOT "basically green" — fix it or FLAG it. `verify_passed` is `true` only when every gate is concretely green.
- **INV-no-test-massage:** if a gate fails, the coder does NOT weaken assertions, delete failing tests, or `//nolint` to silence — the failure is reported (HALT) and routed to a fix task. (Trivial-formatting exception per agent-protocol §Git.)
- **INV-additive-probe-load-bearing:** the AC-3 `git diff` over `proto/`+`pkg/sdk/metadata.go`+`plugins/tv-parser/`+`plugins/base-scanner/` is the structural proof of additivity. It MUST be empty. A non-empty diff there means a task touched a contract surface — HALT.
- **INV-no-new-deps:** `go.mod` / `go.sum` are unchanged by B1 (stdlib `context`/`sync`/`time` only; no broker, no EXIF lib). A new require is a scope breach — HALT.

## precondition

Tasks 01-08 landed: the async substrate (`internal/enrich/{state,chain,enrich,queue,lease,retry,doc}.go` + tests), the store ledger (`internal/store/ledger.go` + test), the scan migrate (`internal/scan/run.go` + test), the cmd wiring (`cmd/mellifera/main.go`), and the integration golden (`integration_async_test.go`). The build gate (`mellifera-build` skill + `scripts/check.sh`), `.golangci.yml`, and `go.mod` exist.
- evidence: `.claude/skills/mellifera-build/SKILL.md` + `scripts/check.sh`; `.golangci.yml`; `go.mod` (module `github.com/mellifera/mellifera`, go 1.25.0, no B1 deps).

## postcondition

All gates green: `go vet`/`go build`/`go test`/`golangci-lint`/`check.sh` pass; the AC-3 negative probes (`git diff` empty over proto/sdk/plugins; `Enrich` present; no forbidden patterns; no new deps) hold. `verify_passed: true`. No source change from this task unless a gate surfaces a trivial fix (formatting-only auto-fix per agent-protocol; anything else → HALT for a fix task).

## test_seed

(n/a — this task RUNS the gate; it does not add tests. The co-located per-symbol tests were added in Tasks 01-05; the integration golden in Task 08.)

## callers_to_update

(none — verification task. If a gate fails, HALT and surface a fix task; do NOT edit source here beyond trivial formatting.)

## allowed_imports

(n/a — no source written here.)

## allowed_categories

- `stdlib`

## test_exclusions

(n/a — gate-runner.)

## negative_examples

- DO NOT weaken/silence/delete a failing test or add `//nolint` to pass a gate (INV-no-test-massage).
- DO NOT edit `proto/`, `pkg/sdk/metadata.go`, or `plugins/*` to make a diff "look" empty (INV-additive-probe-load-bearing).
- DO NOT add a dependency to `go.mod` (INV-no-new-deps).
- DO NOT declare `verify_passed: true` if any gate was skipped or returned indeterminate output (agent-protocol §DONE).

## existing_code_snapshot

```
# The gate commands (verbatim from mellifera-build SKILL.md + this plan):
cd mellifera
go vet ./...
go build ./...
go test ./...
golangci-lint run ./...              # funlen/gocognit/gocyclo/lll/depguard/dupl (.golangci.yml)
bash .claude/skills/mellifera-build/scripts/check.sh    # → check.sh: OK
git diff -- 'proto/**' 'pkg/sdk/metadata.go' 'plugins/tv-parser/**' 'plugins/base-scanner/**'   # → empty
grep -rn 'func Enrich(' internal/enrich/                # → ≥1 hit
git diff --stat -- go.mod go.sum                        # → empty (no new deps)
```

## contract_test_scope

- **joint (AC-2):** the whole module against the build/lint/symbol/file-length budget. Verified by the gate exit codes.
- **joint (AC-3 structural):** the additive surface (`proto/`+`pkg/sdk/metadata.go`+`plugins/`) against the `git diff`-empty contract + `Enrich`-preserved. Verified by the probes.

## scope_boundary

- RUN the gates + the AC-3 negative probes. Record the results.
- (Trivial formatting auto-fix ONLY if a gate fails solely on formatting and the config is known — agent-protocol §Git. Anything else → HALT.)

## out_of_scope

- Implementing/fixing behavior (if a gate fails non-trivially, HALT → a fix task is spawned).
- Adding tests (done in Tasks 01-05, 08).
- Editing `proto/`/`pkg/sdk`/`plugins/` (forbidden — AC-3).

## line_budget

0 (gate-runner; no source)

## acceptance_criteria

- AC-2 (vet/build/test/lint/check.sh all green)
- AC-3 (additive — git diff empty over proto/sdk/plugins; Enrich preserved; no forbidden patterns; no new deps)

## refactoring_checklist

- `cd mellifera && go vet ./... && go build ./... && go test ./... && golangci-lint run ./...` → all exit 0.
- `bash .claude/skills/mellifera-build/scripts/check.sh` → prints `check.sh: OK` (exit 0); confirm `internal/enrich` ≤8 exported + co-located test per new symbol + `queue.go` <500.
- `git diff --stat -- proto/ pkg/sdk/metadata.go plugins/tv-parser/ plugins/base-scanner/` → empty.
- `grep -rn 'func Enrich(' internal/enrich/` → ≥1 hit.
- `grep -rnE 'enrichment_jobs|enrichment_leases|queue_items' internal/` → 0 hits (no queue table).
- `grep -rnE '"reflect"' internal/ cmd/` → 0 hits (no reflect).
- `git diff --stat -- go.mod go.sum` → empty (no new deps).
- `./.claude/skills/mellifera-build/scripts/check.sh` final OK.

## source_anchor

Gate definitions: `.claude/skills/mellifera-build/SKILL.md` + `scripts/check.sh`; `.golangci.yml`; `go.mod`. Additive surface: `proto/`, `pkg/sdk/metadata.go`, `plugins/tv-parser/`, `plugins/base-scanner/`. Preserved symbol: `internal/enrich/enrich.go:56` (`func Enrich(`).

## skill_hint

`mellifera-build`, `grounding`, `pipeline-gates`
