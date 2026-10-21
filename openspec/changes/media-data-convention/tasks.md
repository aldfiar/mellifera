<!-- wf: source_fingerprint=07d8d6cfb697193016520c562d674be5155ab34485263d116c7d011462718b52 -->
<!-- wf: initial_skip_specs=false -->
# Tasks: media-data-convention

Probe CWD is the repo root. All probes are node-free (`go test` + greps over
`internal/` and `web/src`); probe bodies live in the spec deltas
(`specs/*/spec.md`) and each box links one — `wf change tick` is the only
writer of `[x]`, and the `<!-- wf: source_fingerprint=... -->` marker is
written by wf at tick time, never by hand. Group dependencies (DAG):
1 → {4, 5}; 2 → {3, 5}; 3 → 5. Max concurrency 2: (1 + 2), then (3 + 4),
then 5.

## 1. Convention projection — api + cmd

- [x] 1.1 Additive gate-resolved chain on the module presentation: `source_chain` (`{id, enabled}` pairs, chain order) on `api.ModulePresentation` via a new `AddChainSource(id string, enabled bool)` method reusing the unexported `titleSourceBinding` element (export surface unchanged), wired in the `cmd/mellifera` `ModulePresentation` closure by appending each `enrich.ResolveGates` verdict in `m.MetadataSources` order; table-driven `TestSourceChainPresentation` asserting the served list's order and the muted source's `enabled:false` [probe:8dd8ab3215581b83]
- [x] 1.2 The convention projection: an unexported api resolver walking `source_chain` over the document's `sources.*` namespaces — synopsis group (description + its genres/score/kind/status/episodes/aired_on), cast group, episode group (episode docs), first effectively-enabled carrier wins WHOLE, values verbatim, absent group → absent key — composed at read into an additive `metadata` block on `itemDTO` and `seriesDTO` (list + detail), with the optional TS shape added to the item/series DTOs in `web/src/lib/api.ts`; table-driven `TestMetadataProjection` covering first-chain-wins, disabled-source skip, partial-member honesty, and no-carrier-serves-nothing [probe:b138c9d1b7c48bee]

## 2. Multi-request source runs — proto + enrich

- [x] 2.1 The request plan: additive proto — `repeated RequestSpec extra_specs` on `BuildRequestResponse`, new `FetchedResponse {body, http_status, headers, fetched, error}`, `repeated FetchedResponse extra_responses = 7` on `ConvertRequest` — regenerated; the enrich fetch point loops spec + extras in order through the same validation and the plugin's `FetchGate` slot (pacing spans the plan), a failed extra yields `{fetched:false, error}` while the run continues, primary failure unchanged; `TestRequestPlan` covering ordered delivery, soft-failed extras, and interval spacing on the injectable clock [probe:3100aa62f043cfcb]

## 3. shikimori cast conformer

- [ ] 3.1 Anchored plans attach the roles fetch: `BuildRequest` returns the primary anime spec plus `GET /api/animes/{id}/roles` (same User-Agent + `min_interval_ms` contract) as an extra spec when the query carries `shikimori_id`, and the primary-only plan for search matches; subtests under `TestBuildRequest` [probe:6e7a220212cfa040]
- [ ] 3.2 Roles convert into the convention cast: `Convert` composes `cast` from the roles body — one entry per character, `name` the character (russian preferred), `role` the free-text seiyuu credit when present, `photo_url` the character portrait — skipping unusable entries, and leaves `cast` ABSENT when the roles body is missing/unfetched or carries nothing usable; search-run namespaces unchanged; subtests under `TestConvert` [probe:80dd1e5b5e0c9e1f]

## 4. SPA consumption switch

- [ ] 4.1 `Synopsis` takes the resolved about as its prop and both call sites pass the served block — ItemDetail resolves the series' `metadata.about` for episodes (the resolution it already does over documents) and its own otherwise, Collection passes the series' served block — while the client-side walk (`sourcesOf`/`synopsisOf` in that component's path) retires with its tests replaced by served-block consumption tests; vitest + tsc stay green in the session (the probe below is the node-free floor) [probe:aa0a7a63c5580d45]

## 5. QA — cross-module joint

- [ ] 5.1 `internal/itest/qa_media_data_joint_test.go` (`TestQAMediaDataJoint`), Tier-1 joint per the qa_shikimori_joint pattern — real store, stub upstream serving the anime + roles payloads: a series enriches through shikimori, the stored document carries `sources.shikimori` with the convention fields and `cast`, and the served series/item carry `metadata.about` + `metadata.cast` naming `shikimori`; an episode fixture document serves its `metadata.episode` block; a document with no convention carriers serves none; the group's `go test ./...` stays green [probe:fb9511dbf7bcf5e2]
