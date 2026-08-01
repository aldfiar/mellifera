# Task 14 (Docs) — Sync the module map (project_structure.md) to Phase A

- **Type:** docs
- **Doc file:** `docs/project_structure.md` (the module map / project structure)
- **Related tasks:** T03 (module 6->7), T04 (store status), T05 (internal/enrich realized), T06 (plugins/tv-parser), T07 (base-scanner media-type-agnostic), T08 (scan->enrich dep)
- **AC trace:** (docs trace AC-1/AC-3/AC-4 — the module map must reflect the realized pipeline)

## purpose

`docs/project_structure.md` currently describes the FOUNDATIONAL scan-library slice and marks `internal/enrich` as DEFERRED. Phase A REALIZES `internal/enrich`, adds `plugins/tv-parser`, makes base-scanner media-type-agnostic, adds the `items.status` lifecycle column, and begins importing the already-generated `metadata.v1`. The module map must be updated so the docs match the code (the AI-navigability invariant — docs describe what exists).

## changes

- **C1** Module-layout tree: move `internal/enrich/` from "DEFERRED" to REALIZED with its Phase A role (inline serial `Match->BuildRequest->Convert->Merge` orchestrator; 3 symbols `Enrich`/`Deps`/`Result`; provenance + V5-hybrid state). | evidence: project_structure.md:50 (`├── enrich/ # DEFERRED`), :133 ("Still NOT built ... internal/enrich").
- **C2** Add `plugins/tv-parser/` to the tree + binaries list: a `metadata_source`-capability subprocess; `tvparse.go` moved verbatim from base-scanner. | evidence: project_structure.md:59-60 (the `plugins/` block), :128-129 (source + binaries).
- **C3** Update the `base-scanner/` description: remove "TV parse" — base-scanner is now media-type-agnostic (discovery + base Identify only); TV parsing lives in tv-parser. | evidence: project_structure.md:60 ("walk + ffprobe + TV parse + withinRoot"), :74 (Scanner-plugin row: "parses TV filenames").
- **C4** Update the dependency-direction line to `api -> scan -> enrich -> {module, plugin} -> store`. | evidence: project_structure.md:67.
- **C5** Update symbol counts in the tree comments: `module/` 6->7, `plugin/` 9->10 WARN, `pkg/sdk/` 5->7; note `store/` stays 11 (status is a column, not symbols). | evidence: project_structure.md:48,52,53.
- **C6** Document the lifecycle: `items.status` column (`{new,pending,parsed,enriched,failed,deleted}`, V5 hybrid + `_stages[]`) and the document schema additions (`sources.<plugin>`, `_provenance.<field>`, `_view`, `_stages`). Add a short "Phase A additions" subsection (or a dated note in the header, mirror the `> Foundational slice shipped` callout at project_structure.md:3).
- **C7** `metadata/v1` is no longer "NOT exercised" — Phase A imports it. | evidence: project_structure.md (proto tree comment "generated; NOT exercised this feature").

## invariants

- **INV-match-code:** every count, path, and description matches the post-Phase-A code (G2: verify against the actual files). Do NOT describe Phase B/C as built — keep them marked OUTLINED/deferred.
- **INV-additive-narrative:** frame the change as additive (deprecate-don't-delete); the scan-library slice is still the foundation.

## precondition

The coder pipeline (Tasks 01-11) is implemented. `docs/project_structure.md` is the scan-library-era module map (evidence line numbers above).

## postcondition

`docs/project_structure.md` reflects Phase A: enrich realized, tv-parser present, base-scanner agnostic, status/lifecycle documented, counts/dependency-direction correct, Phase B/C still marked deferred.

## refactoring_docs

- **Symbol/file moves to document:** `parseTV`/`cleanTitle`/`parentDir`/`atoi` + 4 regexes moved `plugins/base-scanner/tvparse.go` -> `plugins/tv-parser/tvparse.go` (verbatim). `base-scanner` Identify no longer emits TV fields (behavior change). `store.QueryItems` signature changed (internal; `?status=` additive).
- **Capability model:** document the `metadata_source` capability (the 2nd, alongside `scanner`) and that Phase A MAPS the user's parser/enricher categories onto `scanner`+`metadata_source` (decision D-1).

## scope_boundary

- MODIFY `docs/project_structure.md`

## out_of_scope

- `docs/architecture.md` (authoritative design doc — additive at most: a one-line note that §3.1/enrich are now realized in Phase A, NOT a rewrite; only if a natural anchor exists)
- `docs/scan-library/*` (the shipped-feature record — do not mutate; Phase A is documented in `docs/plugin-pipeline/` + the shared module map)
- API reference (Task 15)
- Phase B/C design (outlined only; do not document as built)

## acceptance_criteria

- The module map matches the code (counts, paths, dependency direction, lifecycle).
- A reader can locate `internal/enrich`, `plugins/tv-parser`, and the `status` lifecycle from the map.

## skill_hint

`mellifera-build`, `grounding`, `contracts`
