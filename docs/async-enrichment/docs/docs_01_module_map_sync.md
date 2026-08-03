# DOCS 01 — Sync the module map (`docs/project_structure.md`) to Phase B1 (async substrate)

- **Type:** docs
- **Doc file:** `docs/project_structure.md` (the module map / project structure — the AI-navigability doc)
- **Related tasks:** T01 (state ready/stale), T02 (store ledger.go + FailureRow), T03 (enrich/retry.go), T04 (enrich/lease.go), T05 (enrich/queue.go + enrich.go driver + doc.go), T06 (scan async handoff), T07 (cmd wiring)
- **AC trace:** AC-2 (the module map must reflect the realized B1 substrate), AC-1, AC-3 (additive narrative)
- **Audience:** developer (technical internals — file tree, symbol counts, dependency direction)

## purpose

`docs/project_structure.md` currently describes the **Phase A** state: `internal/enrich` as a 3-symbol *serial* inline orchestrator (`Enrich`/`Deps`/`Result`), scan calling enrich between Identify and PutItem, and "Phase B — async enrichment queue" marked DEFERRED. Phase B1 REALIZES the async substrate: the derived queue + worker pool + per-item leases + retry/backoff + the `enrichment_failures` ledger + the serial→async migration + `ready`/`stale` states. The module map must be updated so the docs match the code (the AI-navigability invariant — docs describe what exists, not what's planned).

## changes

- **C1** `internal/enrich/` tree comment: 3 → 7 exported symbols. Add the new symbols (`Queue`, `QueueConfig`, `Stats`, `NewQueue`) and the new files (`queue.go`, `lease.go`, `retry.go`). Reframe from "serial inline orchestrator" to "async derived-queue dispatcher (arch §4.4); the per-item chain (`Enrich`) is preserved as the worker-internal body". | evidence (current): `docs/project_structure.md:67` (`├── enrich/ # ... Enrich/Deps/Result (3) — REALIZED in Phase A`), `:155` (the "3 symbols" paragraph). G2-verify against `internal/enrich/*.go` post-B1.
- **C2** `internal/store/` tree comment: add `ledger.go` + `FailureRow` (4 → 5 exported; methods don't count). Note the `enrichment_failures` table was already created in Phase A and B1 only adds the METHODS (`RecordFailure`/`ClearFailure`/`ListFailures`) — NO DDL. | evidence (current): `docs/project_structure.md:62` (`├── store/ # ... (11 WARN; +items.status column, not symbols)`). Reconcile the count with the post-B1 code (the doc currently says "11 WARN" — confirm whether that's top-level decls vs exported; state the exported count as 5).
- **C3** `internal/scan/` tree comment: scan now ENQUEUES (persists `pending` + `Notify`) instead of enriching inline. Note the new `Deps.Notify` field (a func seam, mirroring `Deps.Enrich`) and that `scan.Result` shape is UNCHANGED. | evidence (current): `docs/project_structure.md:65` (`├── scan/ # ... Deps.Enrich drives enrich`), `:161` (the scan paragraph).
- **C4** Dependency-direction line: keep `api → scan → enrich → {module, plugin} → store` AND note scan now hands off to the `enrich.Queue` via `Notify` (enrich still never imports scan — INV-downward preserved). Add the worker pool as a process-lifetime component. | evidence (current): `docs/project_structure.md:80`.
- **C5** `cmd/mellifera/` tree comment: it now constructs `enrich.NewQueue`, `Start`s the worker pool, threads `Notify` into scan, and `Stop`s on shutdown; env knobs `MELLIFERA_ENRICH_WORKERS` etc. (§4.4 defaults). | evidence (current): `docs/project_structure.md:74` (`└── mellifera/ # flat main.go — ... builds enrich.Deps`), `:163`.
- **C6** Lifecycle paragraph: extend the status set from `{new,pending,parsed,enriched,failed,deleted}` to include `ready` (async settlement) + `stale` (re-scan change → re-enrich). Document the new transitions: `enriched --settled--> ready`, `* --stale--> stale`, `stale --rehydrate--> pending`, and that `failed --retry--> pending` is now EXERCISED by the queue (was defined-but-unused in Phase A). | evidence (current): `docs/project_structure.md:167-170` (the lifecycle paragraph).
- **C7** Integration-test inventory: add `integration_async_test.go` (the B1 AC-1 async golden) alongside the existing `integration_test.go` + `integration_pipeline_test.go`. | evidence (current): `docs/project_structure.md:76,146`.
- **C8** Phase-B-deferred note: move "async enrichment queue" from the DEFERRED Phase B list to REALIZED-in-B1, while keeping image (B2) + TMDB/AuthContext (B3) marked OUTLINED. Add a dated "Phase B1 shipped" note (mirror the `> Foundational slice shipped` callout style). | evidence (current): `docs/project_structure.md:17` (the Phase B deferred mention), `:187-188` (the "Phase B — ... async enrichment queue, ... `ready`/`stale` lifecycle states" line — now partially realized).

## invariants

- **INV-match-code:** every count, path, and description matches the post-B1 code (G2: verify against the actual files — the docs agent reads `internal/enrich/*.go`, `internal/store/ledger.go`, `internal/scan/run.go`, `cmd/mellifera/main.go` before writing). Do NOT describe B2/B3 as built — keep them OUTLINED/deferred.
- **INV-additive-narrative:** frame the change as additive (deprecate-don't-delete): the serial `Enrich` path is PRESERVED (now worker-internal); the scan-library + Phase A slices remain the foundation. The async queue is a dispatch refactor, not a replacement.
- **INV-symbol-budget-honest:** state the real post-B1 exported counts (enrich 7, store 5) and note both are under the ≤8 WARN / ≤12 FAIL gate. Do not undercount (hides budget pressure) or overcount (false alarm).
- **INV-no-behavior-change-to-doc-contract:** the plugin contract (`metadata.v1`, `sdk.MetadataSource`), the API endpoints, and the `scan.Result` shape are UNCHANGED — the doc must say so (AC-3 additivity is part of the narrative).

## precondition

The coder pipeline (T01-T09) is implemented + reviewer PASS. `docs/project_structure.md` is the Phase-A-era module map (evidence line numbers above — G2-verify; the file may have drifted).

## postcondition

`docs/project_structure.md` reflects Phase B1: the async queue/lease/retry/ledger files + symbols documented; enrich 3→7 + store 4→5 counts; scan-enqueue + cmd-wiring described; `ready`/`stale` lifecycle added; the async golden test listed; B2/B3 still marked OUTLINED.

## refactoring_docs

- **New files to document:** `internal/enrich/queue.go`, `internal/enrich/lease.go`, `internal/enrich/retry.go`, `internal/store/ledger.go`, `integration_async_test.go`.
- **New exported symbols:** `enrich.Queue`, `enrich.QueueConfig`, `enrich.Stats`, `enrich.NewQueue`, `store.FailureRow`.
- **New seam (behavioral):** `scan.Deps.Notify` (scan → enrich.Queue post-drain handoff); scan no longer calls enrich inline.
- **Lifecycle extension:** `ready`, `stale` states + `settled`/`stale`/`rehydrate` events; `retry` now exercised.

## scope_boundary

- MODIFY `docs/project_structure.md` ONLY (the module map). C1-C8 above.

## out_of_scope

- `docs/architecture.md` §4.4 (that is DOCS-02 — the spec/operator-semantics update).
- `docs/open-questions.md` status flips (companion in DOCS-02).
- Any source code change (docs only).
- B2 (image) / B3 (TMDB) descriptions beyond "OUTLINED — consumes the B1 queue unchanged".

## acceptance_criteria

- AC-2 (module map matches the realized B1 code — the navigability budget)
- AC-1 (the async substrate is documented as built)
- AC-3 (additive narrative — Enrich preserved, contract unbroken, stated in the doc)

## skill_hint

`mellifera-build`, `grounding`
