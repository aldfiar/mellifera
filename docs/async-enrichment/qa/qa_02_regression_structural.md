# QA 02 — regression + structural/additive negative (AC-2 gates, AC-3 additive, serial-path regression)

> **STATUS: DONE (2026-08-03).** (1) AC-2 gate re-run independently — all green
> (gofmt/build/vet/test/-race/lint/check.sh; enrich 7 ≤8, store 5 ≤8 exported).
> (2) AC-3 additive probes all hold: `git diff 6507277 -- proto/ internal/api/
> pkg/sdk/metadata.go plugins/ go.mod go.sum` EMPTY; `func Enrich(` preserved
> (enrich.go:63); no reflect in new code; no queue table. (3) Regression joints
> (restart-resume, concurrency/lease, loop-safety) verified green via existing
> `queue_test.go` (REDUNDANCY gate). (4) **C-01 VERIFIED REAL (P1, non-blocking):**
> `mellifera/internal/enrich/qa_c01_stages_roundtrip_test.go` — `_stages` store
> round-trip mutates `[]map[string]any`→`[]any`; appendStage drops history on
> re-derive (data loss); attemptedNoWork cannot read round-tripped stages (latent).
> Fix + verdict in `qa/debug_brief.md`.

- **Type:** qa (regression / structural-negative)
- **Phase:** after coder (T01-T09) + reviewer PASS
- **AC trace:** AC-2, AC-3 (+ regression of Phase A behavior preserved by the refactor)
- **Validates tasks:** T01-T09 (all — AC-2 is cross-cutting; T05/T06 for AC-3 additive surface)
- **Project scope:** `.` (root)

## purpose

Two jobs: (1) the AC-2 build/lint/symbol/file-length budget holds for the WHOLE module after B1 (regression — the refactor must not blow the navigability budget); (2) the AC-3 additive contract holds NEGATIVELY (the plugin/proto/sdk/plugins surfaces are untouched; the serial `Enrich` path still works — deprecate-don't-delete regression). QA runs these INDEPENDENTLY of the coder's Task 09 self-gate (the coder ran the gate; QA re-derives the assertions).

## behavior_coverage (independent re-derivation)

| AC clause | Independently-derived behaviors | Covered by |
|---|---|---|
| **AC-2** (gates) | `go vet ./...` clean; `go build ./...` succeeds; `go test ./...` passes; `golangci-lint` (funlen/gocognit/gocyclo/lll/depguard/dupl) clean; `check.sh` OK (enrich ≤8 exported [3→7], store ≤8 [4→5], files <500, co-located test per new exported symbol) | T09 (gate-run); QA re-runs + asserts |
| **AC-3** (additive/structural-negative) | `proto/**`, `pkg/sdk/metadata.go`, `plugins/tv-parser/**`, `plugins/base-scanner/**` git-diff EMPTY; `func Enrich(` still present (≥1 hit); no new proto/SDK symbol; no new dependency in `go.mod`; no `reflect`; no DI framework; no CGO; no `enrichment_jobs`/`enrichment_leases`/`queue_items` table | T09 (probes); QA re-runs + asserts |
| **(regression) Phase A serial path** | `enrich.Enrich` still runs the 4-RPC chain serially when called directly (the worker calls the SAME body); `scan.Result` shape unchanged; `?status=` still lists existing statuses (`new`/`parsed`/`enriched`/`failed`/`deleted`) AND the new ones (`pending`/`ready`/`stale`); the existing Phase A tests + `integration_pipeline_test.go` golden still PASS unchanged | T05 (Enrich preserved), T06 (Result shape), QA asserts the existing tests are untouched + green |

### uncovered_behaviors

- (QA fills after the audit. Expected: NONE. If `integration_pipeline_test.go` (the Phase A serial golden) was edited or now fails, that is a REGRESSION → flag + HALT.)

## joints_targeted

- **the additive surface** (AC-3): `proto/` + `pkg/sdk/metadata.go` + `plugins/tv-parser/` + `plugins/base-scanner/` ↔ `git diff`-empty contract.
- **the build-budget surface** (AC-2): `internal/enrich` (3→7), `internal/store` (4→5), file lengths (queue.go <500), co-located tests.
- **the serial↔async shared body** (regression): `enrich.Enrich` ↔ the worker's per-item body (same code path, two callers).

## mock_boundaries

- None — this is a structural/gate/regression QA. It runs real gates + `git diff` + the existing real-subprocess integration golden unchanged.

## test_plan (QA-authored)

1. **regression (Phase A serial golden unchanged):** `TestIntegrationPipeline` (`integration_pipeline_test.go`) — QA asserts the file is UNCHANGED (`git diff --stat -- integration_pipeline_test.go` empty or trivial) AND still PASSES. This is the deprecate-don't-delete proof: the serial path still drives the full pipeline. (If B1 broke it, HALT.)
2. **regression (serial `Enrich` direct call):** `TestEnrich_SerialPathStillWorks` (in `internal/enrich/enrich_test.go` or QA-added) — call `enrich.Enrich` directly (not via the queue) with a fake resolver; assert it still returns the advanced status + provenance (the Phase A contract). The refactor must not have changed the per-item body's observable behavior. (AC-3 deprecate-don't-delete.)
3. **regression (`scan.Result` shape):** compile-time + a scan-test assertion that the `Result` struct literal `{LibraryID, Discovered, Persisted, Warnings, StartedAt, FinishedAt}` is unchanged (T06's test; QA confirms it asserts the FULL field set, not a subset).
4. **structural (AC-3 additive probes — re-run independently of T09):**
   - `git diff --stat -- proto/ pkg/sdk/metadata.go plugins/tv-parser/ plugins/base-scanner/` → empty.
   - `grep -rn 'func Enrich(' internal/enrich/` → ≥1.
   - `git diff --stat -- go.mod go.sum` → empty (no new deps).
   - `grep -rnE '"reflect"' internal/ cmd/` → 0.
   - `grep -rnE 'enrichment_jobs|enrichment_leases|queue_items' internal/` → 0.
5. **structural (AC-2 budget — re-run independently of T09):**
   - `bash .claude/skills/mellifera-build/scripts/check.sh` → `check.sh: OK`.
   - Confirm `internal/enrich` exported count is 7 (≤8) and `internal/store` is 5 (≤8).
   - `awk 'END{print NR}' internal/enrich/queue.go` → <500.
   - Confirm a co-located test exists for each new exported symbol: `Queue`, `QueueConfig`, `Stats`, `NewQueue` (enrich) + `FailureRow` (store).
   - `golangci-lint run ./...` → clean (funlen/gocognit/gocyclo/lll/depguard/dupl).

## refactoring_validation

- `git diff --stat -- integration_pipeline_test.go integration_test.go` → empty or trivial (the Phase A goldens are not edited to mask a regression).
- `git log --oneline main..HEAD -- proto/ pkg/sdk/metadata.go plugins/` → empty (no commits touch the additive surface).
- `go test -run 'TestEnrich|TestIntegrationPipeline|TestNextState' ./...` → all PASS (the Phase A behavior surface is green post-refactor).

## precondition

Coder T01-T09 landed + reviewer PASS. The Phase A test suite (`internal/enrich/enrich_test.go`, `integration_pipeline_test.go`, `internal/store/store_test.go`, `internal/scan/*_test.go`) exists and was green pre-B1.

## postcondition

AC-2 (budget) + AC-3 (additive) independently verified; the Phase A serial path regression-confirmed intact (the existing goldens pass unchanged); the additive surface is `git diff`-empty; no new deps/reflect/queue-table. `uncovered_behaviors` empty.

## acceptance_criteria

- AC-2 (gates green — re-run by QA, not just coder-claimed).
- AC-3 (additive negative probes hold; serial path regression-intact).

## skill_hint

`mellifera-build`, `grounding`, `pipeline-gates`, `golang-security`
