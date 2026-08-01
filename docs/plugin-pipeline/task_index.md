# Task Index — plugin-pipeline (Phase A)

> 15 tasks: 11 coder (one per Step-Outline step) + 2 QA + 2 docs. Dependency-ordered.
> Coder tasks run in ID order (each leaves `go test ./...` green). Foundational-setup
> items are folded into consuming-task preconditions (see `task_interactions.md`).
> Next agent: **@wf-coder** (`tasks/task_02_plugin_metadata_accessor.md`) — T01 unblocks it.

## Coder tasks

| ID | Slug | Title | Step | Seams | AC trace | Deps | Key files (CREATE/MODIFY) |
|---|---|---|---|---|---|---|---|
| T01 ✓ | sdk_metadata | `pkg/sdk` MetadataSource capability client + adapter | 1 | S9 | AC-2, AC-3 | — | CREATE `pkg/sdk/metadata.go`+test; MODIFY `pkg/sdk/doc.go` |
| T02 ✓ | plugin_metadata_accessor | `plugin.Manager.MetadataSource` + caps-driven launch | 2 | S2 | AC-2, AC-3 | T01 | MODIFY `internal/plugin/{manager,lifecycle,doc}.go`+test |
| T03 ✓ | module_bindings | model `metadata_sources` + seed tv-parser | 4 | S4 | AC-1, AC-4 | — | MODIFY `internal/module/{registry,doc}.go`+test |
| T04 ✓ | store_status | `items.status` column + index + QueryItems filter | 5 | S1, S7, S11 | AC-3, AC-7 | — | MODIFY `internal/store/{open,items,doc}.go`+test + 4 mechanical callers |
| T05 ✓ | enrich | `internal/enrich` inline serial orchestrator (LOAD-BEARING) | 3 | S3, S5 | AC-4, AC-5, AC-6, AC-7 | T01, T02, T03 | CREATE `internal/enrich/*` |
| T06 ✓ | tv_parser_plugin | `plugins/tv-parser` (parseTV verbatim move; serves metadata_source) | 8 | S3 | AC-1, AC-5 | T01 | CREATE `plugins/tv-parser/*`; MODIFY `Makefile` |
| T07 ✓ | base_scanner_extract | base-scanner media-type-agnostic (parseTV removal) | 7 | S8 | AC-1 (structural), AC-3 | T06 | MODIFY `plugins/base-scanner/scanner.go`+test; DELETE `tvparse*.go` |
| T08 ✓ | scan_integrate | scan calls enrich between Identify and PutItem | 6 | S6, S7 | AC-1, AC-5, AC-6, AC-7 | T04, T05 | MODIFY `internal/scan/{run,doc}.go`+test |
| T09 ✓ | api_status | item `status` field + `?status=` filter | 10 | S11 | AC-7, AC-3 | T04 | MODIFY `internal/api/handlers.go`+test |
| T10 ✓ | cmd_wiring | composition root: enrich.Deps + load/start tv-parser | 9 | S10 | AC-1 | T05, T06, T08 | MODIFY `cmd/mellifera/main.go` |
| T11 ✓ | integration_gates | AC-1 golden e2e + AC-2 gates green (the acceptance gate) | 11 | S-integration, S-proto | AC-1, AC-2, AC-5, AC-6, AC-7 | T01..T10 | CREATE `integration_pipeline_test.go`; reconcile scan-library tests |

## QA tasks

| ID | Slug | Title | Layer | Validates | AC trace |
|---|---|---|---|---|---|
| T12 ✓ | qa_acceptance_rederivation | Independent acceptance re-derivation (golden independence) | e2e + joint | T05, T06, T08, T11 | AC-1, AC-5, AC-7 |
| T13 ✓ | qa_regression_structural | Regression (additive contract) + structural/negative probes | joint + structural | T03, T04, T07, T09, T11 | AC-2, AC-3, AC-4, AC-6 |

## Docs tasks

| ID | Slug | Title | Doc file | Related tasks |
|---|---|---|---|---|
| T14 ✓ | docs_module_map | Sync module map (project_structure.md) to Phase A | MODIFY `docs/project_structure.md` (+ `ai-architecture.md` §4, `.project_context.json` src_layout) | T03, T04, T05, T06, T07, T08 |
| T15 ✓ | docs_api_reference | API reference: item `status` field + `?status=` filter | CREATE `docs/plugin-pipeline/api_reference.md` | T04, T09 |

## Quick facts

- **Total:** 15 (coder 11 / qa 2 / docs 2). `completed_count: 15` — **ALL COMPLETE**. T14 = synced the module map: `docs/project_structure.md` (enrich REALIZED, `plugins/tv-parser` added, base-scanner media-type-agnostic, dep direction `api→scan→enrich→{module,plugin}→store`, counts sdk 5→7/module 6→7/plugin 9→10 WARN/store stays 11, lifecycle + document schema, metadata/v1 exercised; Phase B/C deferred) + `docs/ai-architecture.md` §4 (Phase A deltas `[A]`) + `docs/.project_context.json` src_layout. T15 = `docs/plugin-pipeline/api_reference.md` (additive `?status=` filter + `status` field, lifecycle state set/machine AC-7, provenance/`_view`/`_stages`, operator runbook `MELLIFERA_TV_PARSER` + `make build-plugin`). Lifecycle detail extracted from project_structure.md into the API reference (extraction rule).
- **Dependency root:** T01, T03, T04 (no coder deps) — all three DONE; the rest fan out in ID order — all 11 coder tasks DONE.
- **Load-bearing:** T05 (`internal/enrich`) — highest risk (R-9 file-length/funlen; R-2 namespace; R-4 isolation; R-5 state machine).
- **Structural/negative owner:** T07 (AC-1 extraction probe) + T13 (automated AC-4/AC-1 probes in CI).
- **No new protos / no new deps** (additive; `metadata.v1`/`common.v1` already generated). `go.mod` untouched.
- **All gates:** T11 owns the AC-2 gate sequence; every coder task self-checks `check.sh`.
