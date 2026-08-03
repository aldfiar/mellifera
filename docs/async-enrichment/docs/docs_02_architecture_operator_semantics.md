# DOCS 02 — architecture.md §4.4 → IMPLEMENTED-in-B1 + operator runbook (env knobs, non-blocking scan, lifecycle)

- **Type:** docs
- **Doc file:** `docs/architecture.md` (PRIMARY — §4.4 async work queue) + `docs/open-questions.md` (COMPANION status flips, same task)
- **Related tasks:** T05 (queue — the §4.4 realization), T02 (ledger), T06 (non-blocking scan), T07 (env knobs), T01 (ready/stale lifecycle)
- **AC trace:** AC-async (non-blocking scan semantics), AC-ledger (loop-safety), AC-states (lifecycle), AC-1
- **Audience:** developer (§4.4 spec) + operator (env knobs, lifecycle, runbook)

## purpose

`docs/architecture.md §4.4` (line 1007+) is the AUTHORITATIVE design for the async work queue — but it is written as a DESIGN ("Enrichment is driven by…", `auth_mode is SERVER`). Phase B1 IMPLEMENTS it (with one confirmed refinement: D-Q1 — queueable iff `!= CLIENT`, not `== SERVER`). The spec must (a) mark §4.4 IMPLEMENTED for B1, (b) record the D-Q1 refinement inline (so the spec matches the code — the §4.4 literal "SERVER" would wrongly exclude tv-parser), and (c) add the operator-facing runbook details: the worker env knobs, the non-blocking `POST /scan` semantics, and the extended status lifecycle. The companion `open-questions.md` flips note where B1 realized a defaulted/decided item.

## changes (architecture.md)

- **C1** §4.4 status marker: add a dated "Phase B1 — IMPLEMENTED" callout at the top of §4.4 (`architecture.md:1007`). Frame: the derived queue + worker pool + per-item leases + `enrichment_failures` ledger + loop-safety are now live (single-instance MVP; multi-instance leases are Phase 2 / Q24). | evidence (current): `docs/architecture.md:1007-1058` (§4.4 body).
- **C2 (D-Q1 refinement — load-bearing)** §4.4 line 1011 literally says a task is pending iff "the source's `auth_mode` is `SERVER`". Record the CONFIRMED refinement inline: **queueable iff `auth_mode != "CLIENT"`** (empty/local like tv-parser + SERVER are server-runnable; only CLIENT needs user credentials → Mode B). Justification: tv-parser (the primary enricher) has EMPTY `auth_mode` (local parser, no fetch) — the literal "SERVER" would wrongly exclude it; the enhanced objective mandates async-for-every-enrichment. Cite decision D-Q1. | evidence (current): `docs/architecture.md:1011` (the "auth_mode is SERVER" clause); `internal/module/registry.go:60-63` (tv-parser seeded with no auth_mode).
- **C3** §4.4 dispatch section: add a one-line "IMPLEMENTED in `internal/enrich/queue.go` (+`lease.go`+`retry.go`)" pointer so a reader finds the code (the spec describes the design; the pointer lands them on the realization). Note `enrich.Enrich` is preserved as the worker-internal per-item body (deprecate-don't-delete). | evidence (current): `docs/architecture.md:1013-1058` (dispatch + lease + loop-safety sections).
- **C4 (operator runbook — env knobs)** add a "Worker configuration (env)" subsection to §4.4 listing the `cmd/mellifera` knobs with §4.4 zero-value defaults: `MELLIFERA_ENRICH_WORKERS` (4), `MELLIFERA_ENRICH_MAX_ATTEMPTS` (3), `MELLIFERA_ENRICH_LEASE_TTL` (60s), `MELLIFERA_ENRICH_BACKOFF` (2s), `MELLIFERA_ENRICH_EXHAUSTED_COOL` (7d), `MELLIFERA_ENRICH_NODATA_COOL` (30d), `MELLIFERA_ENRICH_COOL_CAP` (365d). Malformed values fall back to the default (non-fatal). | evidence (code): T07 / `cmd/mellifera/main.go` `loadConfig`.
- **C5 (operator runbook — non-blocking scan)** add a "POST /scan timing (B1)" note: scan returns after discovery + identify + persist (items `pending`); enrichment is async. The response shape (`scan.Result{Discovered,Persisted,Warnings,…}`) is UNCHANGED — only timing. Progress is observable via `GET /items?status=pending|ready|stale`. This is the one user-visible behavior change; it is the POINT of the feature. | evidence (code): T06 / `internal/scan/run.go`; AC-async.
- **C6 (lifecycle extension)** extend the §4.4 (or the lifecycle section cross-referenced from it) status set with `ready` (async settlement — all queueable sources terminal: done or terminal-failure-in-cooldown) and `stale` (re-scan change → re-enrich). Document the transitions `enriched --settled--> ready`, `* --stale--> stale`, `stale --rehydrate--> pending`, and that `failed --retry--> pending` is now exercised by the queue. Note `?status=` passes any value through (no API validation). | evidence (code): T01 / `internal/enrich/state.go`; AC-states.
- **C7 (loop-safety schedule — pin the numbers)** confirm the §4.4 cooldown numbers match the B1 `QueueConfig` defaults (exhausted 7d doubling → 14d → 28d, cap 365d; no_data 30d). If §4.4's prose differs from the shipped defaults, reconcile to the SHIPPED values (the code is the authority post-implementation). | evidence (current): `docs/architecture.md:1031-1047` (loop-safety); code: T05 `QueueConfig`.

## changes (open-questions.md — COMPANION status flips, same task)

- **C8** Q13 ("Enrichment dispatch … — DECIDED (see §4.4)"): add an "IMPLEMENTED in Phase B1" note (no status change — it was already DECIDED; this records realization). | evidence (current): `docs/open-questions.md:198`.
- **C9** Q22 ("Enrichment-failure ledger: admin API & observability — DEFAULTED"): note the `store.ListFailures`/`RecordFailure`/`ClearFailure` METHODS now EXIST in B1 (the ledger escape hatch); an admin HTTP ROUTE remains deferred (B1-light). | evidence (current): `docs/open-questions.md:304`; code: T02.
- **C10** Q27 ("CLIENT-source enrichment UX contract — DEFAULTED"): note the D-Q1 refinement (queueable iff `!= CLIENT`) is now IMPLEMENTED — CLIENT sources are excluded from the background queue (Mode B only); empty/local + SERVER are queued. No reopen. | evidence (current): `docs/open-questions.md:394`.

## invariants

- **INV-spec-matches-code:** the §4.4 prose (esp. the `auth_mode` clause + the cooldown numbers) MUST match the shipped B1 code. Where the design prose and the code differ, the CODE wins (post-implementation) and the spec is reconciled — with the deviation (D-Q1) called out explicitly, not silently rewritten.
- **INV-authoritative-frame:** architecture.md stays the AUTHORITATIVE spec. Mark sections IMPLEMENTED (with dates) rather than demoting them to "historical". The design rationale is preserved; only the status + the D-Q1 refinement + the runbook details are added.
- **INV-no-contract-rewrite:** do NOT describe the plugin contract / API / `scan.Result` shape as changed — they are unchanged (AC-3). The doc must state the additivity.
- **INV-B2/B3-still-outlined:** image (B2) + TMDB/AuthContext (B3) remain OUTLINED — B1 realized only the substrate. Do not mark them implemented.

## precondition

Coder T01-T09 implemented + reviewer PASS. `docs/architecture.md` §4.4 (`:1007-1058`) + `docs/open-questions.md` (Q13:198, Q22:304, Q27:394) exist (G2-verify line numbers — the files may have drifted).

## postcondition

`docs/architecture.md` §4.4 marked IMPLEMENTED-in-B1 with the D-Q1 `!= CLIENT` refinement inline + the env-knob / non-blocking-scan / lifecycle runbook details; `docs/open-questions.md` records the B1 realizations (Q13 implemented, Q22 methods exist, Q27 D-Q1 implemented). The spec matches the code.

## refactoring_docs

- **D-Q1 deviation (load-bearing):** §4.4 `auth_mode == SERVER` → `auth_mode != CLIENT` (refines the literal spec; confirmed at plan-review; cited inline).
- **New env knobs:** the `MELLIFERA_ENRICH_*` set (operator runbook).
- **Lifecycle extension:** `ready`/`stale` + `settled`/`stale`/`rehydrate` events; `retry` exercised.
- **New code pointer:** `internal/enrich/{queue,lease,retry}.go` + `internal/store/ledger.go`.

## scope_boundary

- MODIFY `docs/architecture.md` (§4.4 + the lifecycle cross-reference; C1-C7).
- MODIFY `docs/open-questions.md` (Q13/Q22/Q27 status-flip notes; C8-C10 — a companion update in the same task because the flips are tightly coupled to §4.4's IMPLEMENTED marker).

## out_of_scope

- `docs/project_structure.md` (that is DOCS-01 — the module map).
- Any source change (docs only).
- B2/B3 spec sections (OUTLINED — not this plan).
- An admin HTTP route spec for `ListFailures` (deferred — B1-light; only the method exists).

## acceptance_criteria

- AC-async (non-blocking scan semantics documented for operators)
- AC-ledger (loop-safety schedule pinned to shipped values)
- AC-states (ready/stale lifecycle documented)
- AC-1 (§4.4 marked implemented — the authoritative spec matches the code)

## skill_hint

`mellifera-build`, `grounding`
