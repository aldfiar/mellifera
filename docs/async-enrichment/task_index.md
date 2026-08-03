# Tasks: async-enrichment (Phase B1 — async substrate)

> Scope = **B1 only** (derived queue + worker pool + per-item leases + in-memory retry/backoff +
> `enrichment_failures` ledger + serial→async migration + `failed→pending` retry + `ready`/`stale`
> states). B2 (image+EXIF) + B3 (TMDB+auth) are OUT OF SCOPE (outlined, not tasked). Builds
> ADDITIVELY on shipped Phase A (`main` @ `6507277`): `enrichment_failures` + `items.status` already
> exist → NO DDL migration. No new plugin/proto/sdk/dep. 13 tasks (9 coder + 2 QA + 2 docs) — under
> the 15-step gate; 7 ACs — under the 8 gate; enrich 3→7 + store 4→5 — under the ≤8 symbol gate.

## Coder Tasks (dependency-ordered; run in this order)

- [x] **T01** — `internal/enrich/state.go`: add `ready`/`stale` states + exercise `retry` (`tasks/task_01_state_ready_stale.md`) — S2 — AC-states, AC-2
- [x] **T02** — `internal/store/ledger.go`: `enrichment_failures` ledger methods (`FailureRow`/`RecordFailure`/`ClearFailure`/`ListFailures`) (`tasks/task_02_store_ledger.md`) — S1 — AC-ledger, AC-2
- [x] **T03** — `internal/enrich/retry.go`: per-source retry/backoff wrapper (`runSourceRetryable`) (`tasks/task_03_enrich_retry.md`) — S3 — AC-ledger, AC-1, AC-2
- [x] **T04** — `internal/enrich/lease.go`: per-item in-memory lease map (lazy expiry) (`tasks/task_04_enrich_lease.md`) — S4 (lease half) — AC-lease, AC-2
- [x] **T05** — `internal/enrich/queue.go` + `worker.go` + `enrich.go` driver + `doc.go`: the async derived-queue (THE load-bearing task) (`tasks/task_05_enrich_queue.md`) — S4/S7/S8 — AC-1, AC-lease, AC-ledger, AC-states, AC-3, AC-2
- [x] **T06** — `internal/scan/run.go`: drop inline enrich; enqueue (`pending` + `Notify`) (`tasks/task_06_scan_enqueue.md`) — S5, S2(scan) — AC-async, AC-1, AC-states, AC-3
- [x] **T07** — `cmd/mellifera/main.go`: construct + Start the queue; wire Notify; Stop; env knobs (`tasks/task_07_cmd_wiring.md`) — S6 — AC-async, AC-1, AC-2
- [x] **T08** — `integration_async_test.go`: the AC-1 async golden (scan→pending→drain→async drain) (`tasks/task_08_integration_async.md`) — S9, S-integration — AC-1, AC-async, AC-states, AC-3 — NOTE: golden asserts the reachable `enriched` drain terminal (not `ready`); see `state.json` blocker `B2-ready-unreachable-e2e`.
- [x] **T09** — gates-green + structural/additive probes (`tasks/task_09_gates_green.md`) — (all) — AC-2, AC-3 — FULL GATE GREEN (gofmt/build/vet/test/-race/lint/check.sh) + 2 obsolete sync tests retired.

## QA Tasks (after coder + reviewer)

- [x] **QA-01** — async-correctness acceptance re-derivation (AC-1, AC-async, AC-lease, AC-ledger, AC-states) (`qa/qa_01_async_correctness.md`) — DONE: `mellifera/qa_async_acceptance_test.go` (independent e2e, DIFFERENT fixtures: Mandalorian.S02E03.720p.WEB-DL + Чёрное зеркало S03E01.480p + broken-qa.mkv; independent regexp derivation). All ACs independently re-derived; zero uncovered behaviors.
- [x] **QA-02** — regression + structural/additive negative (AC-2 gates, AC-3 additive, serial-path regression) (`qa/qa_02_regression_structural.md`) — DONE: full gate green (gofmt/build/vet/test/-race/lint/check.sh); AC-3 additive probes all hold (proto/internal-api/plugins/go.mod diff empty vs 6507277; `func Enrich(` preserved; no reflect/queue-table). Regression joints (restart-resume, lease, loop-safety) verified green via existing `queue_test.go` (REDUNDANCY gate — not duplicated). **C-01 VERIFIED REAL (P1):** `mellifera/internal/enrich/qa_c01_stages_roundtrip_test.go` — `_stages` store round-trip mutates `[]map[string]any`→`[]any`; appendStage DROPS history on re-derive (manifesting data loss), attemptedNoWork cannot read round-tripped stages (latent). See `qa/debug_brief.md` for the exact fix (normalize `_stages` in decodeDoc). Non-blocking (no AC violated).

## Docs Tasks (after coder + reviewer)

- [x] **DOCS-01** — sync the module map to B1 (`docs/docs_01_module_map_sync.md`) — DONE: `docs/ai-architecture.md` §4 + `docs/project_structure.md` + `docs/.project_context.json` `src_layout` updated (enrich 3→7, store 4→5 top-level; scan enqueue+Notify; cmd NewQueue/Start/Stop + env knobs; ready/stale lifecycle; async golden test; B2/B3 outlined). Scope EXPANDED per orchestrator (task spec said project_structure.md ONLY; delegation added ai-architecture §4 + .project_context.json).
- [x] **DOCS-02** — async model + operator runbook (`docs/docs_02_architecture_operator_semantics.md`) — DONE as **NEW** `docs/async-enrichment/api_reference.md` (non-blocking scan, lifecycle + `?status=`, env knobs, restart-resume, provenance/`_stages`, loop-safety). SCOPE REDIRECT per orchestrator: task spec said modify `architecture.md` §4.4 + `open-questions.md`; delegation marked architecture.md AUTHORITATIVE read-only (never edit) → runbook authored as a feature-scoped doc instead.

## Foundational Setup (NO standalone task — all pre-existing or folded)

| Item | Disposition | Evidence |
|---|---|---|
| `enrichment_failures` table | **EXISTS from Phase A** — fold → T02 precondition | `internal/store/open.go:98-107` |
| `items.status` column + index | **EXISTS from Phase A** — fold → T05/T06 precondition | `internal/store/open.go:72,161-199` |
| `MELLIFERA_ENRICH_*` env vars | fold → T07 (reads them in `loadConfig`) | T07 B5 |
| `go.mod` | **NO new deps** (stdlib `context`/`sync`/`time` only) — non-item | `go.mod` unchanged (T09 probe) |
| `Makefile` | **NO new plugin binary** (B1 reuses tv-parser) — non-item | — |
| `stale` change-detection basis | fold → T06 (minimal "base changed" basis; full mtime/size = R-stale refine) | T06 B5 |

## Totals

- coder: 9 · qa: 2 · docs: 2 · **total: 13**
- ACs covered: AC-1, AC-2, AC-3, AC-async, AC-lease, AC-ledger, AC-states (7 — under the 8 gate)
- Symbol budget: `internal/enrich` 3→7 (≤8), `internal/store` 4→5 (≤8) — both green
- Seams S1-S9: every seam has an owner task + a joint test (see `integration_map.md` Coverage Matrix)
