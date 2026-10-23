# tasks - identify-match-override

<!-- planner-authored index: wf edits this file only through the authoring verbs; the ledger holds claim state -->

## g1

- [ ] 1.1 Additive proto: SearchSpecs/SearchResults RPC pair + SearchCandidate, regenerated
- [ ] 1.2 SDK surface: MetadataSource methods + UnsupportedSearch base; serial-parser embeds
- [ ] 1.3 shikimori SearchSpecs: the bounded anime search spec
- [ ] 1.4 shikimori SearchResults: candidates in the payload order

## g2 - Core identify: queue search orchestrator + identify action, api wire, guard re-pin

- [ ] 2.1 enrich Queue.SearchSource: typed client -> FetchGate -> SearchResults
- [ ] 2.2 enrich Queue.IdentifySeries: lease -> identifiers overwrite -> ReenrichSource
- [ ] 2.3 api wire: admin search route + PUT /series/{id}/identify, closures, OpenAPI
- [ ] 2.4 Guard re-pin to this change's proto commit

## g3 - SPA identify overlay: three-step view, confirm flow + api client, series-card menu row

- [ ] 3.1 IdentifySeries overlay: three steps and their states
- [ ] 3.2 Confirm flow + api.ts wire (searchSource, identifySeries)
- [ ] 3.3 Series-card menu Identify row (seriesIdentifyGate)

## g4 - QA joint: search passthrough + identify re-anchor over the real graph

- [ ] 4.1 QA joint: TestIdentifyMatchJoint over the real graph
