# tasks - browse-scale

## naming - PR A: internal/naming extraction (mechanical, byte-identical)

- [ ] 1.1 Create internal/naming: move the pure composer core verbatim out of internal/api/display.go (namer struct, seriesName, sourceTitle, pickLanguage, docMap, strField, sourceStr, intField, itemName, elementName, elementFacts, episodeFacts, factNamespaces, composeItemName, validElementTemplate, pad2, lastSegment, viewTitle, elementTokens — composeItemName's parameter type, display.go:328) plus the two rec-sorting-era namer methods from internal/api/recs_ordering.go (itemTags :339, genresFor :358 — methods on namer cannot stay in api once the type moves) with their unit tests; internal/api keeps namerFor/elementTemplate/withSeriesOverride (display.go:476 — the app method over a.storedTitle) and aliases `type titleSourceBinding = naming.TitleSourceBinding`; wire byte-identical, golden vectors green. @qa
  verify: go test ./internal/naming ./internal/api || exit 1
  qa: tests/internal/naming/display_test.go::TestSeriesNameChains, tests/internal/naming/display_test.go::TestItemNameChains, tests/internal/naming/display_test.go::TestPickLanguage, tests/internal/naming/display_test.go::TestEpisodeFactsOrder
- [ ] 1.2 Move the metadata projection (namer.metadataFor + aboutBlock from internal/api/metadata.go, with the transitive pure helpers metadataFactKeys :30, castBlock :128, episodeBlock :140, verbatimMember :158 — metadataFor resolves through all four) into internal/naming per design OQ2 — the About DTO seam keeps calling the moved resolver, response bytes identical. @qa
  verify: go test ./internal/naming ./internal/api -run 'TestMetadataProjection|TestGoldenTitleVectors' || exit 1
  qa: tests/internal/naming/metadata_test.go::TestMetadataProjection, tests/internal/naming/metadata_test.go::TestAboutBlockCarrier

## browse - PR B core: internal/browse RAM read model

- [ ] 2.1 internal/browse search index core: per-entity entries (composed served name + walk alternates), match tiers (alternate < composed-substring < composed-prefix), shared Unicode fold + bidirectional ё→е at write and query time, bounded 8+8 groups, alphabetical tiebreak; table-driven tests. @qa
  verify: go test ./internal/browse || exit 1
  qa: tests/internal/browse/search_test.go::TestMatchTiers, tests/internal/browse/search_test.go::TestYoFoldBidirectional, tests/internal/browse/search_test.go::TestBoundedGroups, tests/internal/browse/search_test.go::TestAlphabeticalTiebreak
- [ ] 2.2 internal/browse facet aggregates: genres/kind/status counted per library by running the SAME internal/naming resolver as About; description-but-no-genres namespace contributes nothing; absent carrier omits the key; count 0 omits the value; photo libraries empty; table-driven tests. @qa
  verify: go test ./internal/browse -run TestFacet || exit 1
  qa: tests/internal/browse/facets_test.go::TestFacetsMatchAboutResolver, tests/internal/browse/facets_test.go::TestPhotoLibraryEmpty, tests/internal/browse/facets_test.go::TestZeroCountOmitted
- [ ] 2.3 internal/browse index service: build over cmd-built Deps closures (package imports nothing internal), two-part scalar epoch (max updated_at + row count), wake channel, 60 s reconcile (watermark walk + orphan sweep), honesty-backstop serving (ids only; rows composed live); 10k-item fixture test pinning ~3.3 MB RAM and sub-second build. @qa
  verify: go test ./internal/browse -run 'TestEpoch|TestReconcile|TestRAMBudget' || exit 1
  qa: tests/internal/browse/service_test.go::TestEpochRowAndCount, tests/internal/browse/service_test.go::TestReconcileSweep, tests/internal/browse/service_test.go::TestRAMBudget10k

## wire - PR B surface: api routes, filter params, cmd wiring, invalidation pokes

- [ ] 3.1 internal/api: GET /api/v1/search handler in the browse group — grouped ≤8+≤8 server-ranked, empty q → 200 empty lists, photos excluded, optional library=/limit=, unexported DTOs + swag annotations, ONE memoized namer per distinct result library per request; hit ids scoped to the caller's visible library ids and namerFor fed v.ChainMutes (viewerFor(r), the browse-group serving convention) so names mute exactly like the other browse routes — the index itself stays shared/full via access.System() at rebuild (design D2 unchanged).
  verify: go test ./internal/api -run TestSearchRoute || exit 1
- [ ] 3.2 internal/api: GET /api/v1/libraries/{id}/facets handler + additive facet filter params — the genre/kind/status trio on /series, genre/kind only on /items (its status param name is pinned to the enrichment-lifecycle filter by the living specs: plugin-pipeline "Item status over the API", async-enrichment's GET /api/v1/items?status= passthrough) — id-set resolution + in-Go filter, composes with library/path/sort, unknown value → 200 empty; swag annotations; facet counts and the filtered /series + /items results scoped to the caller's visible library ids (viewerFor(r)) — an invisible library contributes nothing, the posture every browse route applies.
  verify: go test ./internal/api -run 'TestFacetsRoute|TestFacetFilterParams' || exit 1
- [ ] 3.3 internal/api: GET /api/v1/home handler — ≤50 progress rows bounded, rec_score desc + updated_at tiebreak via the recs score, ContinueRow composition through namerFor, next pick with tuple parity pinned, honest duration omission, query-time artwork over the bounded set; swag annotations; progress rows read through the caller's Viewer (scoreProgress already takes access.Viewer — the visibility-conjunct ledger consumption the rec-sorting spec binds to the continue rail) and namerFor fed v.ChainMutes, so invisible-library rows never leak and names mute exactly like the other browse routes.
  verify: go test ./internal/api -run TestHomeRoute || exit 1
- [ ] 3.4 internal/api: Deps.OnTitleChange nil-safe closure (the OnProgress idiom) poked on title-override PUT and on DELETE (fires on both) and on identify — the ~immediate index invalidation seam.
  verify: go test ./internal/api -run 'TestTitleOverridePoke|TestIdentifyPoke' || exit 1
- [ ] 3.5 cmd/mellifera wiring: janitor task `browse` (boot-warm synchronous pre-serve + 60 s tick, interval<=0 disables), scan-complete fan-out wake, gate-flip fan-out poke beside OnSourceGateChanged, browse + naming Deps closures into api.New.
  verify: go test ./cmd/mellifera || exit 1
- [ ] 3.6 cmd/mellifera: clear the browseComposer namer cache at each Corpus pass as browse_wiring.go:140-147's own invariant promises — without the clear, an epoch-drift rebuild recomposes search entries but buildFacets/FacetIDs keep resolving through the STALE cached namer, so facet aggregates keep counting under pre-flip gates until restart (the 4.1 clause-6 surface; defect flagged by wf-qa, joint-glue divergence); pin the convergence with a multi-pass wiring test: build → gate flip → one Reconcile → facets drop whole.
  verify: go test ./cmd/mellifera -run TestBrowseNamerCacheReconverges || exit 1

## qa - Tier 1 joint itest (dispatched to @wf-qa)

- [ ] 4.1 Joint itest over real instances, no mocks (internal/api test seam): scan a serial fixture → a Cyrillic query hits through the fold → facet counts equal the About resolver's output → /home answers in exactly ONE request → a title-override rename reflects in search immediately → a source-gate flip drops that source's genre facet within one reconcile tick → the invisible-library case: two viewers, one denied the fixture's library — /search hits, facet counts, and /home rows from that library are absent for the denied viewer and present for the granted one (seam mechanics in contracts/4.1-joint-itest.md).
  file: contracts/4.1-joint-itest.md
  verify: go test ./internal/api -run TestBrowseScaleJoint || exit 1

## web - PR C: SPA palette, chips, home rows

- [ ] 5.1 web SearchPalette component + App-shell mount: DialogShell overlay, ⌘K/Ctrl+K, 120 ms debounce + AbortController, ↑↓↵Esc, rows render served arrays verbatim, honest empty/no-result/canonical-error with retry:0; vitest asserts BOTH the one-request-per-keystroke count AND the abort path.
  verify: cd web && npx vitest run SearchPalette || exit 1
- [ ] 5.2 web FacetChips component on the serial/film collection grids: served values verbatim, active chip = color change, absent on photo libraries, fetched once per view, wiring the genre/kind/status chips into the /series query and genre/kind only into the /items query (/items carries no facet-status param — its status name is pinned to the enrichment-lifecycle filter); vitest.
  verify: cd web && npx vitest run FacetChips || exit 1
- [ ] 5.3 web Home.tsx swaps the 1+N fan-out for the single GET /home call: per-series continue rows, progress bar only when duration_seconds exists, next affordance from the served label deep-linking to next.item_id, shared empty state; vitest asserts one request and the honest bar-less row.
  verify: cd web && npx vitest run Home || exit 1
- [ ] 5.4 web/src/lib/nextup.ts trim: remove the home-only derivation exports (startedSeries, nextUpEntries, seriesKey) and their tests, KEEPING episodeFacts/EpisodeFacts/nextEpisodeAfter for the watch page; tsc proves no dangling imports.
  verify: cd web && npx tsc --noEmit || exit 1; grep -q 'nextEpisodeAfter' src/lib/nextup.ts || exit 1; grep -q 'nextUpEntries' src/lib/nextup.ts && exit 1; exit 0

## closeout - regen, glossary, gates

- [ ] 6.1 Regenerate the committed OpenAPI and embedded SPA dist: PATH="$HOME/go/bin:$PATH" make web-build (swag picks up the three new routes and the filter params).
  verify: grep -q '"/search"' internal/web/api/openapi.json && grep -q '"/libraries/{id}/facets"' internal/web/api/openapi.json && grep -q '"/home"' internal/web/api/openapi.json || exit 1
- [ ] 6.2 GLOSSARY entries: **Search index**, **Facet**, **Continue row** bullets in the canonical flat list.
  verify: grep -q '\*\*Search index\*\*' GLOSSARY.md && grep -q '\*\*Facet\*\*' GLOSSARY.md && grep -q '\*\*Continue row\*\*' GLOSSARY.md || exit 1
- [ ] 6.3 Gates (the GATE-2 anchor): full Go suite + the build gate (lint + export budgets) + web vitest + tsc.
  verify: CGO_ENABLED=0 go test ./... || exit 1; bash .claude/skills/mellifera-build/scripts/check.sh || exit 1; cd web && npx vitest run && npx tsc --noEmit || exit 1
