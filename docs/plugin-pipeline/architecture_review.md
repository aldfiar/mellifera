# Architecture Review — plugin-pipeline (Phase A)

> Risk register + grounding audit + complexity-budget rationale + Generation
> Self-Audit. Mirrors `docs/scan-library/architecture_review.md`. Phase A scope.
> **No P0** (Phase A is within all gates; the full feature is phased by design —
> the objective authorized phasing). Risks are P1/P2, surfaced for plan-review.

## Issues Found

None at P0. The feature is correctly sized via phasing (Phase A scoped; B/C
outlined). `feature_too_large: false` for Phase A. The single design item most
needing human confirmation is R-1 (the category-model reconciliation) — a P1
plan-review decision, not a HALT.

## Risk register

| ID | Risk | Severity | Mitigation | Owner phase |
|---|---|---|---|---|
| **R-1** | **Category-model reconciliation (D-1)** — the user DECIDED "3 plugin categories (parser/enricher/post-action)"; Phase A MAPS these onto the architecture's 2 existing capabilities (`scanner`+`metadata_source`) and DEFERS post-action. If the user requires literal 3 new services, the symbol budget FAILS (plugin 9→12) and the plan must redesign. | **P1** | Document the mapping explicitly (decision log D-1); surface as the #1 plan-review item; the mapping satisfies the user's *intent* (categorized/staged/config-driven/provenanced/agnostic) with zero new protos. | plan-review |
| **R-2** | **Namespace-enforcement correctness (arch §3.3)** — the core must validate each plugin wrote ONLY `sources.<own_id>` and reject+revert otherwise. A bug here = cross-source data corruption (violates principle 4). | P1 | Pure post-Merge validator in `internal/enrich` (unexported); table test with a malicious fake plugin that writes a foreign namespace → assert reject+revert+`failed` stage. | coder/reviewer |
| **R-3** | **Additive compatibility (AC-3)** — the `QueryItems` signature change + `status` migration must not break scan-library's shipped items/API. | P1 | Migration is `DEFAULT 'new'` + index (idempotent); test the migration on a scan-library-era DB; `?status=` is additive (empty=all); wire shapes unchanged. | coder/reviewer |
| **R-4** | **Plugin crash isolation across stages (AC-6)** — a tv-parser crash mid-4-RPC-chain must soft-fail, not abort the scan or corrupt the half-written document. | P1 | enrich treats each source's RPC errors as soft (append warning, record `_stages` `failed`, continue); operate on a document COPY per source so a crash leaves the pre-source doc intact; rely on go-plugin restart for the subprocess. | coder/reviewer |
| **R-5** | **Lifecycle state-machine correctness (AC-7)** — illegal transitions must be rejected; the item must reach the furthest *valid* state under soft-fail; backfill of pre-existing scan-library rows is a decision. | P1 | Pure `nextState(current,event)` fn with an explicit transition table + table tests for every legal/illegal transition; surface the backfill (`'new'` default vs one-time `'parsed'`) at plan-review. | coder/reviewer |
| **R-6** | **Provenance/stage write amplification** — per-field `_provenance` + `_stages[]` grows the JSON document; large libraries inflate the column. | P2 | Keep `_stages` to one entry per configured source (bounded by config, not per-field); `_provenance` is per-field but field count is bounded by the source; watch `enrich.go` file length (<500 fail) — split helpers. | coder |
| **R-7** | **Symbol-budget tightness** — `internal/plugin` 9→10 WARN, `pkg/sdk` 5→7, `internal/module` 6→7, `internal/store` stays 11. All <12 fail but tight. | P2 | Statuses stay UNEXPORTED consts (store stays 11); no new store methods (provenance is JSON); `check.sh` is the gate. Documented in contracts §3. | coder |
| **R-8** | **Fetch-stub vs Phase-B contract drift** — Phase A stubs the BuildRequest→fetch→Convert step; must not bake assumptions that break Phase B's real HTTP fetch + AuthContext. | P2 | Keep the 4-RPC contract intact (call all 4); the stub returns empty `raw_response`; tv-parser's Convert derives from `Match.query`; Phase B swaps the stub for a real fetcher with no signature change. | coder |
| **R-9** | **`internal/enrich` is the load-bearing new logic** — the 4-RPC dispatch + state fn + namespace enforcement + provenance in one package risks the file-length/funlen budget. | P2 | Split `enrich.go` into unexported-helper files (`chain.go`, `state.go`, `namespace.go`) if it approaches 300 lines (warn); exported surface stays `Enrich`/`Deps`/`Result` (3). | coder |

## Grounding audit (every load-bearing claim → evidence)

| Claim | Evidence |
|---|---|
| `metadata.v1.MetadataSource` (4-RPC chain) already exists + is generated | `proto/mellifera/metadata/v1/metadata.proto:12-31`; imported by NO Go source today (agent recon) |
| `internal/enrich` is the designated deferred orchestrator | `architecture.md:1534`, `ai-architecture.md:57` |
| Provenance schema is designed (`_provenance.<field>`, `sources.<plugin>`, `_view`) | `common.proto:26-32`, `architecture.md:772-839` |
| Store ALREADY projects `_view`/`identifiers` via generated columns | `internal/store/open.go:72-75` |
| `AuthContext`/`required_secrets` already exist (Phase B) | `common.proto:52-65`, `plugin.proto` CapabilityDeclaration.required_secrets, `architecture.md:153-168,606-609` |
| `parseTV` has exactly ONE call site, zero I/O deps (clean extraction) | `plugins/base-scanner/scanner.go:47`, `tvparse.go:22-108` |
| `plugin.Manager.Scanner` is the typed-accessor pattern to mirror | `internal/plugin/manager.go:175`, `internal/plugin/doc.go:14-19` |
| `module.parseModule` DROPS the `metadata_sources` slot (the gap to fill) | `internal/module/registry.go:162`; seeded config carries it at `:56-73` |
| scan flow is identify→PutItem (the insertion point for enrich) | `internal/scan/run.go:65-108,116` |
| `api.Deps.Scan` closure is the ONE domain call (pure delegation) | `cmd/mellifera/main.go:81-87`, `internal/api/router.go` |
| All MODIFY targets exist on disk now (G2) | `source_baseline.md` MODIFY table — each row cited |
| D8 serial / D14 no-hybrid / D11+Q20 embed-deferred drive the decisions | `docs/open-questions.md` (D8, D14, D11/Q20) |

No `UNVERIFIED:` token appears in any deliverable.

## Complexity-budget rationale (resolution order: existing-convention → archetype → framework-canonical → stack-to-pattern → general)

The design extends ESTABLISHED patterns rather than inventing:
- **Typed accessor per capability** (`Manager.MetadataSource` mirrors `Manager.Scanner`) — existing convention.
- **Dual-side go-plugin adapter** (`MetadataSourcePlugin` mirrors `ScannerPlugin`) — existing convention.
- **The 4-RPC enrichment chain** — framework-canonical (already-designed `metadata.v1`), NOT a novel abstraction.
- **Document provenance** — the architecture's designed schema (arch §3.1), not invented.
- **Lifecycle `status` column** — analogous to existing core-managed fields (`file_id`, `created_at`); the V5 hybrid reuses the document mechanism.

**Simpler-design check (Step 9.10):** is there a meaningfully simpler design that
meets every AC and extends an existing pattern? Considered and rejected
alternatives: (a) invent 3 new category services — FAILS symbol budget +
duplicates `metadata_source`; (b) keep parseTV in base-scanner and add a "parser
flag" — violates "all parsers are plugins" (DECIDED) + the no-flags anti-pattern;
(c) make tv-parser a second `scanner` capability chained in scan — a novel
"scanner chain" not in the architecture (violates extend-don't-invent). The
chosen design (tv-parser = first `metadata_source`) is the simplest that is
architecture-faithful AND satisfies the user's intent.

## Generation Self-Audit

- [x] Every MODIFY file in the File Map appears in ≥1 seam with non-empty `After` + `Contract` + `evidence:` (S1–S11; `integration_map.md`).
- [x] Every seam has a unique ID; every MODIFY/CREATE file is covered (no `no_seam` needed).
- [x] Every seam → one owner task + one joint test (Coverage Matrix template ready for specifier).
- [x] Every Step Outline step traces to ≥1 AC; every File Map entry has steps; ordering is dependency-correct.
- [x] Every `## Foundational Setup` item owns an emitted task or an explicit `fold→precondition` note.
- [x] Every task will carry precondition + postcondition + allowed_imports + an AC trace (the Step Outline + import map give the specifier the AC trace + allowed imports; specifier produces the per-task fields).
- [x] **No `UNVERIFIED:` token remains** in any deliverable.
- [x] Complexity budget examined; simpler-design check done (above).
- [x] AC count = **7** (< 8 gate; parseTV folded into AC-1).
- [x] Step count = **11** (< 15 gate).
- [x] `feature_too_large: false` (Phase A within budget; full feature phased by design — objective-authorized).
- [x] **No P0** (risks are P1/P2; R-1 is the plan-review decision).

## Notes for the specifier

- The Step Outline is the decomposition input; the import map (contracts §4) is the per-package `allowed_imports` source.
- `internal/enrich` is the riskiest package (R-9) — give it the most granular tasks (dispatch / state-fn / namespace / provenance may be separate tasks if file length pressures).
- The tv-parser `tvparse.go` is a VERBATIM move — cite `plugins/base-scanner/tvparse.go` as the source; do NOT re-implement the regexes.
- Statuses are UNEXPORTED string constants — do NOT make them exported (store budget).
- The fetch stub (R-8) must preserve the 4-RPC contract for Phase B — call all 4 RPCs.
- Surface for plan-review (not coder): R-1 (category reconciliation), R-5 (status backfill of existing rows), the Phase B/C outlines.
