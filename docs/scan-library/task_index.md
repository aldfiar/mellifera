# Task Index — scan-library

> 17 tasks total: 13 coder, 2 QA, 2 docs. Decomposed from the 12-step
> `implementation_plan.md` Step Outline (some steps = one task; R2 adds a 13th
> coder task). Order = dependency order. Status fields drive wf-coder.

## Coder tasks (build order)

| task_id | file | title | package | depends_on | AC trace | est_LOC | status |
|---|---|---|---|---|---|---|---|
| Task 01 | tasks/task_01_init_licensing.md | Init Go module + Apache-2.0 licensing | mellifera (root) | — | AC-2 | 120 | done |
| Task 02 | tasks/task_02_protos_generate.md | Extract protos verbatim + generate Go bindings | proto/mellifera/{common,scanner,metadata,plugin}/v1 | T01 | AC-3, AC-2 | 900 | done |
| Task 03 | tasks/task_03_pkg_sdk.md | Implement pkg/sdk (plugin SDK — shared leaf) | pkg/sdk | T02 | AC-1, AC-2 | 600 | done |
| Task 04 | tasks/task_04_internal_store.md | Implement internal/store (SQLite — sole owner of *sql.DB) | internal/store | T01 | AC-1, AC-2 | 700 | done |
| Task 05 | tasks/task_05_internal_module.md | Implement internal/module (config-driven registry) | internal/module | T04 | AC-1, AC-2 | 350 | done |
| Task 06 | tasks/task_06_internal_plugin.md | Implement internal/plugin (subprocess lifecycle + gRPC clients) | internal/plugin | T03, T02 | AC-1, AC-2 | 900 | done |
| Task 07 | tasks/task_07_internal_scan.md | Implement internal/scan (scan orchestrator — NEW package) | internal/scan | T04, T05, T06, T03 | AC-1, AC-6, AC-2 | 450 | done |
| Task 08 | tasks/task_08_plugins_base_scanner.md | Implement plugins/base-scanner (scanner binary) | plugins/base-scanner | T03, T02 | AC-1, AC-4, AC-6, AC-2 | 950 | done |
| Task 09 | tasks/task_09_internal_api.md | Implement internal/api (chi router — pure delegation) | internal/api | T04, T07 | AC-1, AC-5, AC-2 | 650 | done |
| Task 10 | tasks/task_10_cmd_mellifera.md | Implement cmd/mellifera (flat wiring) | cmd/mellifera | T04, T05, T06, T07, T09, T03 | AC-1, AC-2 | 200 | done |
| Task 11 | tasks/task_11_integration_test.md | Integration test — AC-1 golden (end-to-end scan) | mellifera (integration) | T08, T10 | AC-1, AC-4, AC-6 | 566 | done |
| Task 12 | tasks/task_12_gates_green.md | Green all five verification gates | (whole module) | T01-T11, T13 | AC-2 | 0 | done |
| Task 13 | tasks/task_13_checksh_pbgo_exclude.md | Verify/harden check.sh `*.pb.go` exclusion (R2) | mellifera/.claude/skills/mellifera-build/scripts | T02 | AC-2 | 8 | done |

## QA tasks (after coder, independent safety net)

| task_id | file | title | test_type | validates_tasks | depends_on | AC trace | status |
|---|---|---|---|---|---|---|---|
| QA-1 | tasks/task_14_qa_acceptance_independent.md | Independent acceptance re-derivation (golden rule) | e2e | T02,T04,T05,T06,T07,T08,T09,T10,T11 | T11 | AC-1, AC-4, AC-6, AC-3 | done |
| QA-2 | tasks/task_15_qa_resilience_regression.md | Resilience, security-matrix, boundary regression | integration + regression | T04,T06,T07,T09 | QA-1 | AC-5, AC-2 | done |

## Docs tasks (after coder, sync docs to code)

| task_id | file | title | action | related_tasks | audience | status |
|---|---|---|---|---|---|---|
| DOCS-1 | tasks/task_16_docs_modulemap_sync.md | Sync module map + ai-architecture.md §4 with the scan-library package set | UPDATE | T03,T05,T06,T07 | developer | done |
| DOCS-2 | tasks/task_17_docs_api_reference.md | scan-library API reference + operator runbook | CREATE | T08,T09,T10 | developer + operator | done |

## Summary counts

- coder_tasks: 13
- qa_tasks: 2
- docs_tasks: 2
- total_tasks: 17
- AC coverage: AC-1 (T03,T04,T05,T06,T07,T08,T09,T10,T11 + QA-1), AC-2 (every task + T12), AC-3 (T02 + QA-1), AC-4 (T08,T11 + QA-1), AC-5 (T09 + QA-2), AC-6 (T07,T08,T11 + QA-1)
- WARN-symbol packages (pre-justified R10): internal/store (10), internal/plugin (9)

## Next agent

@wf-coder — start at Task 01 (`tasks/task_01_init_licensing.md`), proceed in dependency order. See `task_interactions.md` for the symbol-ownership + dependency map and `integration_map.md` (Coverage Matrix now filled) for the seam→owner→joint-test mapping.
