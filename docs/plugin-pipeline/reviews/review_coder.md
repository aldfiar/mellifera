# Review — plugin-pipeline (Phase A), Coder Phase

- **Reviewer:** @wf-reviewer (read-only; no code modified)
- **Branch:** `feature/plugin-pipeline` (stacked off shipped scan-library @ `7bcc6c9`)
- **Scope:** coder tasks T01–T11 (11/11 marked complete); QA T12–T13 and Docs T14–T15 are out of scope (later phases)
- **Stack:** go 1.25.3 · `CGO_ENABLED=0` · golangci-lint v1.64.8 · ffprobe 7.1.1
- **Date:** 2026-08-01

## 0. Headline

**OVERALL VERDICT: PROCEED.** 11/11 tasks PASS. All 7 acceptance scenarios independently re-derived and met. All build gates independently re-run green. The additive (zero-proto-edit) contract holds. All non-negotiable constraints honored. Of the 7 coder-flagged deviations: **6 ACCEPT, 1 advisory FLAG** (T11 golden line-budget overshoot — justified). No P0, no P1.

## 1. Per-task verdict (T01–T11)

| Task | Title | Verdict | Rationale (evidence) |
|---|---|---|---|
| T01 | sdk MetadataSource client + adapter | **PASS** | `pkg/sdk/metadata.go`: `MetadataSource` iface (4 unary RPCs) + `MetadataSourcePlugin` dual-side adapter (`GRPCServer` registers `metadatav1.MetadataSourceServer`, `GRPCClient` returns stub wrapper), mirrors `ScannerPlugin`. `sdk` 7 symbols (<8). Compile-time + unit round-trip (bufconn); the adapter is proven end-to-end by the T11 golden through a real subprocess. No proto edit (proto/ diff empty). |
| T02 | plugin.Manager.MetadataSource + caps-driven launch | **PASS** | `internal/plugin/manager.go:215` `MetadataSource` accessor mirrors `Scanner` (no reflect/generic Call/`protobuf.Any`). `lifecycle.go:274` `clientPluginSet(caps)` builds the go-plugin set from **declared** caps; base-scanner (scanner-only) → `{scanner: &sdk.ScannerPlugin{}}` byte-identical to scan-library's hardcoded set (verified via `git show 7bcc6c9`). `assignCapability` dispenses metadata_source. `exec.Command` arg-slice only. plugin 10 symbols (<12, WARN documented). |
| T03 | module bindings (metadata_sources) | **PASS** | `internal/module/registry.go`: `Module.MetadataSources []MetadataSourceBinding` + `MetadataSourceBinding` type modeled verbatim from config (Enabled carried, lossless). `parseModule` decodes the slot it previously dropped. Seed `tvConfigJSON` lists tv-parser p1, kinopoisk p2, tmdb p3. module 7 symbols (<8). Media strings confined to seed config (AC-4). |
| T04 | store status column + QueryItems filter | **PASS** | `items.Status` field (additive); unexported `defaultStatus="new"` (store value-agnostic — owns only the column + default). `QueryItems(ctx,libID,status,limit,offset)` — status filter via empty-check, two query shapes gated by the empty check, status **never** interpolated (parameterized only). `open.go`: fresh DBs get `status` in CREATE TABLE; pre-existing scan-library DBs get a PRAGMA-`table_info`-guarded idempotent `ALTER` + `CREATE INDEX IF NOT EXISTS items_status`. Backward-compatible. |
| T05 | `internal/enrich` orchestrator (LOAD-BEARING) | **PASS** | 3 exported symbols (`Enrich`,`Deps`,`Result`). Pure table-driven `nextState` (every legal + illegal transition encoded + unit-tested). 4-RPC chain Match→BuildRequest→Convert→Merge (fetch stubbed, AuthContext empty — Phase A). Namespace enforcement (`validateNamespace` rejects foreign `sources.<x>`/non-sources keys → reject+revert+failed-stage+soft-fail). Provenance/_view assembled per-field with precision. Status composition + last-writer view correct (see deviations #1–#3). Soft-fail + cancelled-ctx hard-fail correct. |
| T06 | plugins/tv-parser (parseTV move) | **PASS** | `tvparse.go` is **byte-for-byte identical** to deleted `plugins/base-scanner/tvparse.go` (`diff` exit 0; both `package main`). Cyrillic-safe regexes intact (ASCII digit classes). `parser.go` implements all 4 RPCs + `var _ sdk.MetadataSource` conformance; `main.go`+`pluginsvc.go` serve capability+`plugin.v1` on one shared gRPC server, mirroring base-scanner. Cookie pair matches core. |
| T07 | base-scanner media-type-agnostic extract | **PASS** | `scanner.go` Identify now stamps only `relative_path`+`extension` (no season/episode); parseTV removed; `ParserName="base"`, `Confidence=0.5`. **Wire shape unchanged** (IdentifyResult fields identical — AC-3). Structural probe: 0 `parseTV/season/episode` hits in base-scanner source. `tvparse*.go` deleted. |
| T08 | scan integrates enrich | **PASS** | `scan.Deps.Enrich enrich.Deps` field (run.go:30); scan stays 3 exported symbols. `persist` runs enrich between Identify and PutItem with the advanced status; Identify/enrich/PutItem failures are soft (AC-6), cancelled ctx is hard. ffprobe preserved verbatim. No structpb import (allowed_imports respected). |
| T09 | api status field + ?status= filter | **PASS** | `itemDTO.Status` (additive); `listItems` parses `?status=` → one `QueryItems` call → write. Empty status = all (INV-empty-all). api does **not** validate the status set (pure delegation; store/enrich own it). |
| T10 | composition root wiring | **PASS** | `cmd/mellifera/main.go`: flat constructor list, no DI container, no reflection. Loads+starts base-scanner + tv-parser; constructs `enrich.Deps` and wires into `scan.Deps.Enrich`; graceful shutdown stops both plugins. |
| T11 | AC-1 golden + AC-2 gates | **PASS** (1 advisory FLAG) | `integration_pipeline_test.go` AC-1 golden runs REAL base-scanner+tv-parser subprocesses + REAL ffprobe + HTTP; independently re-derives title/season/episode via `ipDeriveShow` (byte-scan, not the plugin's parseTV); asserts sources/_provenance/_view/_stages/status + parseTV split + AC-6 soft-fail + AC-7 ?status= filter. scan-library tests reconciled (coverage moved, not lost). Line-budget FLAG only — see deviation #7. |

**Summary: Checked 11 · Passed 11 · Failed 0 · Flagged 1 (advisory, non-blocking).**

## 2. State Audit

- `task_index.md`: 11 coder tasks `[x]`, 4 (T12–T15 QA/docs) `[ ]`. `state.json`: `completed_count: 11`, `total_tasks: 15`, `phase: reviewer`. **No drift** — every `[x]` task has real git changes; `rejection_history: []`, `blockers: []`. Phase log shows granular coder entries ending at the T11 capstone.

## 3. Acceptance re-derivation (golden-test rule — AC-1..AC-7)

I re-derived each AC from its Given/When/Then, not from the coder's assertions.

- **AC-1 (golden e2e) — PASS.** Independent re-derivation from `Show.Name.S01E02.1080p.mkv`: title=`"Show Name"` (stem before SxxExx, dots→spaces), season=1, episode=2, resolution=`1080p` (stripped from title, preserved in sources). The golden (`ipAssertGolden`) derives the same via `ipDeriveShow` and asserts `sources.tv-parser.{title="Show Name",season=1,episode=2,resolution="1080p"}`, `_provenance.*.plugin_id="tv-parser"`, `_view.title`, a `_stages` parse entry, `status="enriched"`. parseTV split asserted (`parsed` has no season/episode; TV parse solely from `sources.tv-parser`). Cyrillic fixture survives end-to-end. The e2e RAN and passed (real subprocesses + real ffprobe). My re-derivation matches the plugin output and the test's assertions.
- **AC-2 (all gates green) — PASS** (1 advisory gofmt note). Independently re-ran: `gofmt -l .`, `CGO_ENABLED=0 go build ./...`, `go test ./...`, `golangci-lint run ./...`, `go vet ./...`, `check.sh`, `make build-plugin` — all green. Symbol budgets all <12. No reflect in production, no DI, parameterized SQL, `exec.Command` arg-slice only. *Advisory:* `gofmt -l .` flags one file — `.claude/skills/mellifera-build/module-template/doc.go` — an **untracked skill template**, not present at `7bcc6c9`, not modified by plugin-pipeline, not compiled source. All plugin-pipeline source is gofmt-clean; this is an ambient pre-existing condition, not a regression.
- **AC-3 (additive) — PASS.** `git diff 7bcc6c9 -- proto/` **empty** (verified from both `mellifera/` cwd and repo root). `scanner.v1`/`plugin.v1` untouched; generated `*.pb.go` for scanner/plugin unchanged; `sdk.Scanner`/`sdk.Serve` unchanged (blank diff); `go.mod`/`go.sum` untouched (no new deps). items table: only the defaulted `status` column + `items_status` index, additive with a backward-compat migration. base-scanner `IdentifyResult` wire shape unchanged. `GET /api/v1/items` still works (status additive + optional filter).
- **AC-4 (config-driven, no media branching) — PASS.** Structural probe: 0 media-type **branching** in core (`grep mediaType==` in enrich/scan/store = 0). Media-type literals (`"tv"/"tmdb"/"kinopoisk"`) appear ONLY in `internal/module/registry.go` seed config (`tvConfigJSON`) — exactly where AC-4 allows them. *(Minor note: the acceptance.md probe regex `registry.go.*tvConfig` under-matches the multi-line raw string, so the literal probe "hits" those lines; the AC-4 semantic intent — only in seed config — is met. The probe filter, not the code, is the loose end.)*
- **AC-5 (provenance queryable) — PASS.** Each enriched field carries `_provenance.<field>.{plugin_id,plugin_version,fetched_at,confidence}` (golden asserts `plugin_id="tv-parser"` + non-empty version). `sources.tv-parser.*` lossless. `_view.title.value` populated. The store's existing generated column `display_title = json_extract(document,'$._view.title.value')` projects it (provenance/queryability via `json_extract`).
- **AC-6 (soft-fail) — PASS.** Seeded-but-unloaded kinopoisk/tmdb → scan SUCCEEDS, recorded `unavailable` in `_stages` + in scan warnings; item still reaches `enriched` via tv-parser. corrupt.mkv (unprobeable) still persisted with empty ffprobe. `enrich_test.go` covers the convert-error furthest-valid path (status stays `parsed`).
- **AC-7 (lifecycle state) — PASS.** Every Item has a status in the canonical set; orchestrator advances new→pending→parsed→enriched on success; `failed` on hard error (with `_error`); status column indexed + filterable via `?status=enriched` (golden: exactly 2 enriched items). Illegal transitions rejected — `TestNextState` proves **every** illegal (state,event) returns an error.

## 4. Deviation adjudication (7 flagged by coder)

| # | Deviation | Verdict | Reasoning |
|---|---|---|---|
| 1 | T05 empty-document Merge: core passes `&commonv1.MediaDocument{}` (not the full doc); plugin writes `sources.<id>`; core stamps `_provenance`/`_view` | **ACCEPT** | `chain.go:79` passes the empty doc. This preserves the verbatim ffprobe/base document (the plugin never sees it), enforces namespace isolation (plugin writes only `sources.<id>`), and keeps the core authoritative for provenance/view (arch §3.2 L2 + §3.3). Golden proves sources present + ffprobe preserved + provenance/view stamped. Correct + asserted. |
| 2 | T05 status composition (enriched = ≥1 success & 0 failed; furthest-valid on partial) + `_view` Phase-A last-writer | **ACCEPT** | `enrich.go:101`: `begun && succeeded>0 && failed==0` → enriched; partial (failed≠0) stays at furthest-valid (`parsed`). `applyContribution` overwrites `_view`/`_provenance` per source = last-writer (Phase B adds arbitration, documented). Grounded in AC-6/AC-7 + conventions §"_view recomputable". `enrich_test.go` asserts the partial-failure furthest-valid case. Correct + asserted. |
| 3 | T05 `_stages` uses `stage:"metadata_source"` (spec example said `"parse"`) + `advanced_to` | **ACCEPT** (shape correct) | `_stages` entries carry the contract field names `{stage,plugin_id,status,advanced_to,started_at,finished_at,error}` — matches `conventions.md`. The value `"metadata_source"` is semantically accurate (these ARE metadata_source runs; there is no separate "parse" stage in Phase A). `contracts.md:132` `"stage":"parse"` was illustrative. *Note:* the golden asserts `plugin_id`/`status`/`advanced_to` via `ipStageHas` but does **not** pin the literal `stage` string — low risk, as it is not a contract value. |
| 4 | T02 caps-driven plugin launch — base-scanner path byte-identical (AC-3); metadata_source dispenses | **ACCEPT** | `lifecycle.go:274 clientPluginSet(caps)` builds the set from declared caps. For base-scanner (scanner-only) it yields `{scanner: &sdk.ScannerPlugin{}}` — identical to scan-library's hardcoded set (`git show 7bcc6c9:lifecycle.go` confirms). `assignCapability` dispenses metadata_source. INV-ac3-base-scanner preserved; the golden runs base-scanner as a real subprocess successfully. |
| 5 | T06/T07 parseTV moved VERBATIM; base-scanner Identify now media-type-agnostic | **ACCEPT** | `diff <(git show 7bcc6c9:...base-scanner/tvparse.go) plugins/tv-parser/tvparse.go` → **identical** (exit 0, both `package main`). Cyrillic-safe behavior intact (regexes identical, ASCII digit classes). base-scanner Identify now stamps only `relative_path`+`extension` (0 parseTV/season/episode in source). Verified. |
| 6 | T08 `Deps.Enrich` field (scan stays 3 symbols); T10 wiring pulled into T08 for the green gate | **ACCEPT** | `scan.Deps.Enrich enrich.Deps` (`run.go:30`) — scan stays at 3 exported symbols (`Deps`,`Result`,`Run`). `cmd/mellifera/main.go` constructs `enrich.Deps` and wires it. Field definition in T08 (scan owns its API) + construction in T10 (composition root) is the correct separation; necessary for scan to compile/integrate. |
| 7 | T11 golden line-budget overshoot (397 lines vs budget 180, flex 1.4 → ~252) vs "never weaken a test" | **FLAG (advisory)** | The golden is 397 lines (over-flex by ~145). Justified: it is the single load-bearing e2e proof of the whole feature; the `ipDeriveShow` independent re-derivation is load-bearing for reviewer independence; **no function exceeds the funlen(60)/gocognit(15) hard gates** (lint passed); weakening it to fit a soft test-budget would violate the stronger "never weaken a test" rule. Advisory only — no hard gate failed. |

**Adjudication: 6 ACCEPT · 1 advisory FLAG · 0 FAIL.**

## 5. Build-gate re-verification (independently re-run, read-only)

| Gate | Command | Result |
|---|---|---|
| 1 gofmt | `gofmt -l .` | CLEAN for plugin-pipeline; 1 ambient untracked skill-template file (`.claude/skills/mellifera-build/module-template/doc.go`) — pre-existing, not source |
| 2 build | `CGO_ENABLED=0 go build ./...` | OK |
| 3 test | `go test ./...` | all packages pass (root AC-1 golden 9.885s); `TestIntegrationPipeline` PASS (4 subtests: AC1 golden+split, AC6 soft-fail, AC7 status filter) |
| 4 lint | `golangci-lint run ./...` | exit 0 (funlen/gocognit/gocyclo/lll/depguard/dupl/govet/ineffassign/misspell) |
| 5 check.sh | `bash .claude/skills/mellifera-build/scripts/check.sh` | `check.sh: OK` |
| 6 vet | `go vet ./...` | OK |
| 7 build-plugin | `make build-plugin` | both `bin/base-scanner` + `bin/tv-parser` built |

## 6. Additive check (NON-NEGOTIABLE)

- `git diff 7bcc6c9 -- proto/` → **empty** (zero proto edits). Verified from `mellifera/` cwd and repo-root scoped.
- `scanner.v1.Scanner` (Scan/Identify) + `plugin.v1.Plugin` → unchanged on the wire; generated `*.pb.go` for scanner/plugin unchanged.
- `sdk.Scanner` / `sdk.Serve` → unchanged (blank diff).
- `go.mod` / `go.sum` → untouched (no new dependencies).
- `items` table → only additive `status TEXT NOT NULL DEFAULT 'new'` + `items_status` index; backward-compatible PRAGMA-guarded migration for pre-existing scan-library DBs.
- base-scanner still serves `scanner.v1` discovery; `IdentifyResult` wire shape unchanged (only `Parsed` content shrinks + `ParserName` value).
- Deprecate-don't-delete honored throughout.
- Per-package exported symbols (check.sh authoritative): all ≤7 by heuristic (plugin/store/module/sdk/enrich/scan/api). doc.go-declared counts (store 11, plugin 10 WARN; rest ≤7) — **all <12**. No WARN FAIL.

## 7. Constraints honored

- ≤8 symbols/pkg (12 fail): **all packages under 12** (heuristic all ≤7; doc.go-declared max 11). ✓
- No reflect in production: authored production code = **0** reflect imports (only `*.pb.go` generated + one test file). ✓
- No DI framework (depguard bans `reflect` + `wagon`): **0** hits. ✓
- Parameterized SQL only: **0** string-interpolated SQL values. ✓
- `exec.Command` arg-slice only (ffprobe + plugin launch): both call sites use arg slices, no shell. ✓
- Apache-2.0 headers: all new source files carry `SPDX-License-Identifier: Apache-2.0`. ✓
- Core media-type-agnostic: 0 media-type branching in core (enrich/scan/store). ✓
- api/ pure delegation: each handler is parse → one domain call → write; no pipeline logic. ✓
- Provenance preserves precision (per-field, lossless `sources.<id>`): confirmed. ✓

## 8. Refactoring audit

- Renamed/moved: `parseTV`/`cleanTitle`/`parentDir`/`atoi` + 4 regexes moved verbatim base-scanner→tv-parser (diff identical). Stale old-name grep in base-scanner source = 0.
- Callers updated: `QueryItems` 4→5-arg signature change propagated to all call sites (api handler + scan tests + store tests). No stale 4-arg callers.
- `parseModule` now models the `metadata_sources` slot it previously dropped (additive).
- scan-library `integration_test.go`/`qa_*_test.go` reconciled minimally to the Phase A pipeline; coverage **relocated** (TV-parse → T11 golden + tv-parser `parser_test.go`), not removed. tv-parser `parser_test.go` covers Cyrillic, SxxExx, multi-episode, parent-dir fallback.

## 9. Overall verdict

**PROCEED.**

- 11/11 tasks PASS. 7/7 acceptance scenarios independently re-derived and met. 7 gates independently re-run green. Additive contract intact. All constraints honored. 6/7 deviations ACCEPT, 1 advisory FLAG.
- **No P0, no P1.** The two advisory notes (gofmt skill-template; T11 golden line-budget) and one minor observation (golden does not pin the literal `_stages.stage` string) are non-blocking — none weakens correctness, security, or contract fidelity.
- **Recommended next:** health-check (@wf-auditor), then QA (T12/T13) + Docs (T14/T15). The two advisory items can be folded into a docs/hygiene pass but do not gate the pipeline.

## 10. Handoff

- **Phase:** reviewer (coder 11/11 complete) → next: auditor/QA/docs.
- **Acceptance path:** `docs/plugin-pipeline/acceptance.md` (7/7 PASS).
- **Reproduction/golden path:** `integration_pipeline_test.go::TestIntegrationPipeline` (PASS, real subprocesses + real ffprobe).
- **Review path:** `docs/plugin-pipeline/reviews/review_coder.md` (this file).
- **Advisory, non-blocking:** (a) gofmt the untracked skill template `module-template/doc.go`; (b) T11 golden at 397 lines (justified); (c) optionally pin `_stages.stage` literally in the golden if it becomes contract-relevant in Phase B.
