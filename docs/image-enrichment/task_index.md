# Tasks: image-enrichment (Phase B2)

> 11-step plan decomposed into 7 coder + 2 QA + 2 docs tasks. Ordered by the plan's
> dependency-ordered Step Outline. ADDITIVE feature (no proto/api/enrich/sdk edits —
> AC-3); EXIF via the system `exiftool` subprocess (no new Go dep — AC-2/S8).

## Coder Tasks

- [x] **Task 01** — image-enricher plugin (subprocess serving MetadataSource + plugin.v1; EXIF via exiftool) — `tasks/task_01_image_enricher_plugin.md` [Steps 1+2+3 + doc.go; S3, S8]
- [x] **Task 02** — base-scanner image discovery (module-type-gated extensions + stdlib base info) — `tasks/task_02_base_scanner_image_discovery.md` [Steps 4+5+6; S1, S2]
- [x] **Task 03** — internal/scan stamps `absolute_path` into `doc["parsed"]` — `tasks/task_03_scan_absolute_path.md` [Step 7; S4]
- [x] **Task 04** — internal/module seeds the `image` module (config row) — `tasks/task_04_module_image_seed.md` [Step 8; S5]
- [x] **Task 05** — cmd/mellifera loads/stops the image-enricher subprocess — `tasks/task_05_cmd_load_image_enricher.md` [Step 9; S6]
- [x] **Task 06** — Makefile `build-plugin` builds the image-enricher binary — `tasks/task_06_makefile_build_plugin.md` [Step 10 build; S7]
- [x] **Task 07** — image golden e2e (AC-1) + full gate green (AC-2/AC-3 probes) — `tasks/task_07_integration_test_gates.md` [Step 11; integration capstone — joint coverage S1-S8]

## QA Tasks (after coder + reviewer)

- [x] **QA 01** — image enrichment end-to-end behavior (independent acceptance re-derivation: AC-1, AC-image, AC-softfail incl. exiftool-missing + HEIC, AC-unicode, provenance) — `qa/qa_01_image_enrichment_behavior.md` — DONE 2026-08-04: `mellifera/qa_image_e2e_test.go` (TestQAImage_E2EIndependentRederive with independent exiftool oracle + DIFFERENT Canon/EOS R6 fixture; TestQAImage_ExiftoolMissingSoftFail = reviewer INFO-2 full integration sim)
- [x] **QA 02** — structural & regression (AC-2 gates, AC-3 additive diff, AC-queue B1 untouched, TV no cover-art regression) — `qa/qa_02_structural_regression.md` — DONE 2026-08-04: `mellifera/qa_image_regression_test.go` (TestB2_TVNoCoverArtRegression NEW direction; TestB2_Ac3Additive; TestB2_PluginsBuildPureGo). Module-registry tests DROPPED redundant (coder registry_test.go).

## Docs Tasks (after coder + reviewer)

- [x] **DOCS 01** — module-map sync (image-enricher plugin + image module + image discovery across the 3-way authoritative map + capability roster + image module example) — `docs/docs_01_module_map_sync.md` — DONE 2026-08-04: synced the 3 EDITABLE module-map copies (`docs/ai-architecture.md` §4 [B2] rows + deviations block, `docs/project_structure.md` tree/entry-points/capability-model/Phase-B2-section, `.claude/skills/mellifera-build/SKILL.md` base-scanner fix + tv-parser/image-enricher rows + runtime-deps subsection) + `docs/.project_context.json` src_layout/entry_points/external_runtime_deps. `docs/architecture.md` intentionally NOT edited (AUTHORITATIVE read-only per delegation — its §1.4/§2.4.1 edits deferred).
- [x] **DOCS 02** — operator runtime-deps runbook: document the `exiftool` install alongside ffmpeg/ffprobe — `docs/docs_02_operator_runtime_deps_exiftool.md` — DONE 2026-08-04: authored `docs/image-enrichment/operator_runbook.md` (exiftool runtime dep + install, soft-fail contract, image-enricher plugin/env/build, formats table, EXIF namespace, B1-queue flow, troubleshooting) + `docs/open-questions.md` Q29/D21 + `project_structure.md` Stack/Overview + INFO-1 webp reconcile (contracts.md Imports Map + probeImage contract + Constants; task_02 B05/code-template/allowed_imports; acceptance.md AC-image/AC-softfail).

## Foundational Setup → task coverage

| Foundational Setup item (plan) | Coverage |
|---|---|
| DB migration | none — store is media-type-agnostic (no migration) |
| Proto regeneration | none — image-enricher implements the EXISTING MetadataSource (AC-3) |
| Config file | fold → Task 05 (`MELLIFERA_IMAGE_ENRICHER` env) |
| CI | fold → Task 06 (Makefile build-plugin; check.sh unchanged) |
| Go module dep | none — exiftool is a system runtime dep via os/exec (S8) |
| Runtime dep (exiftool) | Task 06 (Makefile comment) + DOCS 02 (operator runbook) |

## Counts

coder_tasks=7, qa_tasks=2, docs_tasks=2, total_tasks=11.
