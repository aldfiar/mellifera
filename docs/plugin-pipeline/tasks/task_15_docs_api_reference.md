# Task 15 (Docs) — API reference: item `status` field + `?status=` filter

- **Type:** docs
- **Doc file:** CREATE `docs/plugin-pipeline/api_reference.md` (Phase A API surface delta; cross-references `docs/scan-library/api_reference.md` as the base)
- **Related tasks:** T04 (store QueryItems status), T09 (api status field + filter)
- **AC trace:** AC-7, AC-3

## purpose

Phase A adds an additive `status` field to item responses and an optional `?status=` filter on `GET /api/v1/items`. Scan-library's `docs/scan-library/api_reference.md` documents the base endpoint WITHOUT these. Document the Phase A delta in a self-contained `docs/plugin-pipeline/api_reference.md` (mirroring how this feature keeps its own contracts/acceptance docs), so operators can list/filter items by lifecycle state.

## changes

- **C1** Document the `GET /api/v1/items` endpoint with the Phase A additions: the optional `?status=` query param (values from `{new,pending,parsed,enriched,failed,deleted}`; absent/empty = all statuses) and the additive `status` field on each item in the response. | ac: AC-7 | kind: normal
- **C2** Document the lifecycle state set + meaning (`new`/`pending`/`parsed`/`enriched`/`failed`/`deleted`) and the state machine (forward `new->pending->parsed->(pending)->enriched`; `->failed` on hard error; `->deleted` on soft-delete) — reference `docs/plugin-pipeline/acceptance.md` (AC-7) as the source of truth. | ac: AC-7 | kind: normal
- **C3** Document additivity (AC-3): the `status` field is additive (existing clients unaffected); `?status=` is optional; no existing field/route changed. Cross-reference `docs/scan-library/api_reference.md` for the base item shape.
- **C4** Include concrete examples: `GET /api/v1/items?library=1` (response now includes `status`); `GET /api/v1/items?library=1&status=enriched` (only enriched); `?status=failed` (only failed).

## invariants

- **INV-match-code:** the documented param/field names + status values EXACTLY match the implementation (`itemDTO.Status` json tag `"status"`; the query param key `status`; the lowercase status strings owned by `internal/enrich`). Verify against `internal/api/handlers.go` (Task 09) + `acceptance.md` AC-7.
- **INV-self-contained:** the file documents the Phase A delta + enough base context to be readable alone, cross-referencing (not duplicating) scan-library's reference.

## precondition

The API change (Task 09) is implemented. `docs/scan-library/api_reference.md` documents the base `GET /items`. `acceptance.md` AC-7 defines the state set + machine.

## postcondition

`docs/plugin-pipeline/api_reference.md` exists, documenting the `status` field + `?status=` filter + the lifecycle state set with examples; accurate against the code.

## refactoring_docs

- Note the additive `status` response field + optional `?status=` filter (the only Phase A API changes). `QueryItems` signature change is internal (not user-facing); mention only that filtering is now supported.

## scope_boundary

- CREATE `docs/plugin-pipeline/api_reference.md`

## out_of_scope

- `docs/scan-library/api_reference.md` (the base — cross-reference, do not mutate)
- Phase B endpoints (drafts/responses, async queue — not in Phase A)
- the module map (Task 14)

## acceptance_criteria

- AC-7 (the status field + filter are documented with the correct values/examples)
- AC-3 (documented as additive)

## skill_hint

`mellifera-build`, `grounding`, `contracts`
