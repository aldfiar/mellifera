<!-- wf: source_fingerprint=848a956fc9f4eb50123a3dafda3671be589e9b19daa113d98d222cf5cc72af34 -->
<!-- wf: initial_skip_specs=false -->
# Tasks: plugin-title-enrichment

Eight groups: foundations (store prefs + module decode), gate threading,
composer legs, presentation, admin API, SPA + shared fixture, gates, and QA.
Dependencies: 1 → 2 → 3 → 4 → 5 → 6 → 7; QA (8) depends on 2 and 5.
Probe ids reference the change's spec scenarios (`specs/*/spec.md`); boxes
whose verification has no dedicated scenario probe are marked `[unprobeable]`
(accepted at GATE 2 inspection).

## 1. Foundations

- [x] 1.1 Add the sparse `metadata_source_prefs` table to the store's `schemaSQL` (module_id, library_id DEFAULT 0, plugin_id, enabled, updated_at; PK(module_id, library_id, plugin_id)) with accessors `UpsertMetadataSourcePref` / `DeleteMetadataSourcePref` / batched `ListMetadataSourcePrefs` — no existing table changes. Ticks spec scenarios `ae5cb6d3f0337e7f` (override) and `52adf392d8ac83f5` (clear-to-inherit), same probe command. Probe: `go test ./internal/store -run TestMetadataSourcePrefs -count=1`. [probe:ae5cb6d3f0337e7f]
- [ ] 1.2 Extend `parseModule` to decode `display.title_source_priority` + `display.language_preference` into exported `Module` fields and amend the contract comments claiming the display block is never modeled (config block stays SPA-consumed otherwise). In-group verified by `go test ./internal/module -run TestSerialModule -count=1`; spec coverage arrives via the presentation probes (group 4). [unprobeable]

## 2. Gate threading

- [x] 2.1 Add `ResolveGates(mod, prefs, libraryID) []module.MetadataSourceBinding` (binding COPIES, `Enabled=false` written into gated ones) and consume the resolved set in derivation (pendingSources + pendingExtras incl. the synthesized defaults) — consumer predicates unchanged. Ticks spec scenario `bae8da0f439049f0`. Probe: `go test ./internal/enrich -run TestGateResolution -count=1`. [probe:bae8da0f439049f0]
- [x] 2.2 Thread the SAME per-(pass, row) resolution through `driveSources` (drain) and `allSourcesTerminal` (settle) so a mid-pass flip never splits the verdict. Ticks spec scenario `2ba564501bad907f`. Probe: `go test ./internal/enrich -run TestSettleGateParity -count=1`. [probe:2ba564501bad907f]
- [x] 2.3 Enable wakes derivation through the existing `Notify` (no rescan, no new lifecycle transitions; rows already carrying the namespace derive nothing); disable wakes nothing — the disable-absence direction is the spec's UNPROBEABLE scenario, accepted at inspection. Ticks spec scenario `de17e2ba196a1bbf`. Probe: `go test ./internal/enrich -run TestGateDerivation -count=1`. [probe:de17e2ba196a1bbf]
- [ ] 2.4 Harden the production-dead scan seam: `internal/scan/run.go:95`'s prodEnricher resolves gates per run even though `runScan` never invokes it today. Covered by the joint QA group; no dedicated scenario probe. [unprobeable]

## 3. Composer legs

- [x] 3.1 `seriesName` gains the config-driven walk ABOVE the serial-parser leg: `display.title_source_priority` ∩ effectively-enabled sources; string titles verbatim; object titles picked by `language_preference` (ru→russian, en→romaji, isolated in one named function); absent/empty/mistyped floors; `raw` group style skips the walk. Ticks spec scenarios `5308c71133a6c9d8` (order) and `a9c5703d70c3a202` (language pick) with this probe command; `f1ab9604fd072c03` (mistyped floor) additionally exercises `TestGoldenTitleVectors` at gate time. Probe: `go test ./internal/api -run TestSeriesDisplayName -count=1`. [probe:5308c71133a6c9d8]
- [x] 3.2 `itemName` gains the same walk as a floor leg between the composed element name and `_view.title` (films included); the number-typed `_view.title` passthrough is unchanged. Ticks spec scenarios `d2181f925f401011` (film floor) and `162b923230e42769` (number passthrough) — shared probe command. Probe: `go test ./internal/api -run TestItemDisplayNamePrecedence -count=1`. [probe:d2181f925f401011]

## 4. Presentation

- [x] 4.1 Widen the `ModulePresentation` closure to `(ctx, moduleID string, libraryID int64)` (router.go + the two test fakes), add `TitleSources []{id, enabled}` (EFFECTIVE per-library resolution via one batched prefs read) and `LanguagePreference` to the DTO additively, and rewire `cmd/mellifera`. Ticks spec scenario `f7b4602d79a89eda`. Probe: `go test ./internal/api -run 'TestLibraryDetailPresentation|TestLibraryListPresentation' -count=1`. [probe:f7b4602d79a89eda]

## 5. Admin Sources API

- [x] 5.1 `GET /api/v1/admin/sources` (new `source_admin.go`, Deps-closure): boot-literal inventory + `Deps.Status` health, capabilities, per-module chain positions, effective-enabled per module and per library, on-demand title counts; admin-gated. Ticks spec scenarios `42d6776a7c6b00ee` (aggregate) and `dba497c843f5b188` (gate) — shared probe command. Probe: `go test ./internal/api -run TestAdminSources -count=1`. [probe:42d6776a7c6b00ee]
- [x] 5.2 `PATCH /api/v1/admin/sources/{plugin_id}` writes the module gate; enable notifies every affected library and returns the queued count, disable notifies nothing; unknown plugin → 400, nothing written. Ticks spec scenarios `d419f8d5db567374` (disable/enable) and `6deb81404aea5313` (unknown) — shared probe command. Probe: `go test ./internal/api -run TestAdminSourcePatch -count=1`. [probe:d419f8d5db567374]
- [x] 5.3 `PUT|DELETE /api/v1/libraries/{id}/sources/{plugin_id}` write / clear-to-inherit the library gate; unknown library → 404, unknown plugin → 400, nothing written on error. Ticks spec scenario `742b32daea84adaa`. Probe: `go test ./internal/api -run TestLibrarySourceGate -count=1`. [probe:742b32daea84adaa]
- [x] 5.4 `POST /api/v1/admin/sources/preview` runs the production composer TWICE (live gates vs. the request's hypothetical vector), returns symmetric before/after name sets with the `no_data` marker, writes nothing. Ticks spec scenario `425a21c495069e5a`. Probe: `go test ./internal/api -run TestSourcePreview -count=1`. [probe:425a21c495069e5a]

## 6. SPA + shared fixture

- [x] 6.1 Author the ONE shared golden fixture `internal/api/testdata/golden/title_vectors.json` (11 vectors incl. the five review cases) consumed by Go `TestGoldenTitleVectors` AND the web `naming.ts` walk mirror test — mutating either side fails that suite. Ticks spec scenario `341a94e9c2975995`. Probe: `go test ./internal/api -run TestGoldenTitleVectors -count=1 && cd web && npx vitest run src/lib/naming.test.ts`. [probe:341a94e9c2975995]
- [x] 6.2 Add the Sources admin surface beside Collections (health chips, chain positions, per-module/per-Collection toggles, queued-count + inline errors, symmetric preview rendering) and the `api.ts` clients for the five new routes. Ticks spec scenarios `28499782454703ae` (toggle) and `68706750c7ddedd3` (preview) — shared probe command. Probe: `cd web && npx vitest run src/pages/admin/Sources.test.tsx && npx tsc --noEmit`. [probe:28499782454703ae]
- [x] 6.3 Extend the endpoint allowlist with the five new routes and add `admin/(status|sources)` to the off-contract grep exclusion — the audit scenario probe goes green with the SPA slice in place. Ticks spec scenario `6c03f9c2829e0509`. Probe: `go build ./... && (grep audit) && cd web && npx vitest run && npx tsc --noEmit` (full command lives on spec scenario `6c03f9c2829e0509`). [probe:6c03f9c2829e0509]

## 7. Gates

- [x] 7.1 Full Go gate stays green node-free: committed artifacts embedded, no node/npm/swag in the gate; `make web-build` stays dev-time (OpenAPI + web dist regenerate at LANDING, never in a probe). Ticks spec scenario `ebd254ceacffd32c` (web-ui). Probe: `make build check test lint`. [probe:ebd254ceacffd32c]
- [x] 7.2 Web checks stay green after the SPA slice (deleted-helper tests already replaced by display_name consumers; new suites added). Ticks spec scenario `6bb071a4149e765f` (display-naming). Probe: `cd web && npx vitest run && npx tsc --noEmit`. [probe:6bb071a4149e765f]

## 8. QA (joint integration — Tier 1)

- [x] 8.1 Joint itest through the real plugin harness: a dormant source composes nothing while its `sources.shikimori` namespace, `_provenance`, and `_view` stay byte-identical and `doc.identifiers` untouched. Ticks spec scenario `5cc9472ed43c03d8` (metadata-source-admin). Probe: `go test ./internal/itest -run TestSourceGateJoint -count=1`. [probe:5cc9472ed43c03d8]
- [x] 8.2 Joint itest: clearing the gate restores derivation through the queue wake and composition on read with NO scan call. Ticks spec scenario `905754511525b27e` (metadata-source-admin). Probe: `go test ./internal/itest -run TestSourceGateRestore -count=1`. [probe:905754511525b27e]
