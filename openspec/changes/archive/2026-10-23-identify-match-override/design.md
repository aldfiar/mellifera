# Design

## Context

A wrong source match is permanent today: refresh re-fetches by the STORED id
(plugin-pipeline "Identity anchoring across enrich runs" — the document's
`identifiers` object feeds `MatchRequest.existing_ids`, and the shikimori
plugin re-matches id-anchored when `identifiers.shikimori_id` exists). Rename
fixed display names, never the metadata. Everything the fix needs already
exists on this base: the id-anchored by-id fetch template
(`GET /api/animes/{id}`), the bounded search call
(`/api/animes?search={title}&limit=10` — built by BuildRequest on the
non-anchored path), the explicit strip-and-rederive action
(`enrich.Queue.ReenrichSource`, whose purge never touches `identifiers`),
the per-plugin pacing gate (`enrich.FetchGate`), the admin route groups +
closure idiom (`api.Deps`, INV2), and the series-card ⋯ menu shell
(`CardActions` — whose `identify` prop slot the series card simply does not
pass today). The change wires a new INTERACTIVE surface (search + override)
out of those parts; no enrichment-path behavior changes.

See proposal.md — Why. Layer 1.1 of docs/ui-roadmap.md; the three-step flow,
states, and wire notes are authoritative in the mockup
(`/Users/aldfiar/projects/go/mellifera/.tmp/mockup-identify.html`).

## Goals / Non-Goals

**Goals:**
- One overlay that fixes a wrong match: search → pick (served order,
  verbatim) → confirm; the next refresh fetches BY the picked id.
- The search capability on the plugin SDK, reached through the same
  core-side, gate-paced fetch posture as every other source fetch.
- The override write as a first-class explicit action with the same
  discipline as ReenrichSource (lease, purge-never-identifiers, cooldown
  clear, deferred counts).
- Display-name inviolability, stated in the confirm copy AND held
  structurally (the write never touches a title-bearing namespace).

**Non-Goals:**
- Films (`/items/{id}/identify`) — deferred to Layer 4 with TMDB (Decision
  D4); the item Identify view stays parser-attachment in 1.1.
- Any art proxy — candidate posters render the served URL; proxying is
  Layer 2.
- Client-side scoring, filtering, or pagination of candidates — the SPA
  renders the served order verbatim.
- Any change to the enrichment chain's Match/BuildRequest/Convert/Merge
  behavior, the 6-upstream anchored-sweep contract, or title composition.

## Decisions

- **D1 — Search is TWO additive RPCs, core-fetched (not one plugin-side
  RPC; not request-plan reuse).** No plugin does direct HTTP today (zero
  non-test `net/http` under `plugins/` and `pkg/sdk/`); fetch execution and
  pacing are core-side (plugin-pipeline "Core-side fetch execution with
  per-plugin pacing"), and the anonymous-tier User-Agent/pacing contract
  lives on RequestSpecs. `SearchSpecs` declares the fetch (reusing
  `RequestSpec`); the core executes it through the queue's FetchGate;
  `SearchResults` converts the raw body into candidates. Reusing
  Match/BuildRequest/Convert was rejected: Match derives its query from a
  parsed document and anchors on identifiers, and Convert PICKS one
  candidate where search must return all, verbatim — a different
  conversation, not a mode of the same one. One plugin-side-fetch RPC was
  rejected as the first plugin-side HTTP in the repo, duplicating the UA
  contract and bypassing the shared anonymous-tier budget.
- **D2 — The override writes the identifiers tier, overwriting.**
  `identifiers.<source_id>_id = external_id` on the series document — the
  ONE resolution place for the refresh path (the anchor every future
  Match reads). The previous id is OVERWRITTEN, not tombstoned: the amend
  versus the prior draft — no reader exists for a deprecated old id, the
  confirm step already told the operator what is replaced, and the stale
  namespace (the old id's data) is purged by the strip. The write runs
  under the row's lease so an in-flight worker cannot resurrect the old
  anchor with an unconditional persist.
- **D3 — The identify action composes lease + patch + ReenrichSource.** No
  new trigger machinery, no predicate extension: write the anchor, then the
  EXISTING explicit strip (never touches `identifiers`, clears the ledger
  cooldown, notifies the library) — the queue re-derives the pair and the
  stored anchor makes that run id-anchored. All-or-nothing on the lease: a
  busy row reports `{deferred: 1}` with NOTHING written (the SPA's existing
  "kept its data — try again shortly" copy fits unchanged).
- **D4 — Films defer to Layer 4; the identify family is series-only for
  now.** The roadmap itself stages films post-TMDB ("Identify (1.1) covers
  films the moment the source exists (items id space)"), no `/items`
  identify surface exists, and the painful case (stored-id refresh) is
  series-level. The search RPC pair and the passthrough stay kind-agnostic
  and row-free (source-scoped only), so Layer 4 wires items additively.
  Amendment to the roadmap's "the view grows a search step before the
  parser-attachment list": the ITEM view gains nothing in 1.1 — a search
  step without a write path is dead UI; flagged at the gate.
- **D5 — Both routes in the existing admin group, family-shaped paths.**
  `GET /admin/sources/{plugin_id}/search` beside the sources aggregate (the
  family's `{plugin_id}` param — amending the dispatch's `{id}`),
  `PUT /series/{id}/identify` beside the title overrides (the `ser_` id
  space). Same gating, same canonical-error grammar, same swag-annotated
  per-route wrappers.
- **D6 — The source picker is served `refresh_sources`.** The module
  block's refreshable-source list is exactly "loaded, effectively-enabled
  metadata sources, parsers and scanners never appear" — for the serial
  module today, `[shikimori]`. No new presentation field, no
  capability-negotiation surface: a source without search answers
  `400 search_unsupported` honestly if ever hand-picked. Dropdown renders
  only when more than one binding is served.
- **D7 — The api export cap holds: closures return primitives.** api sits
  AT its 12-symbol cap, so `Deps.SearchSource`/`Deps.IdentifySeries` return
  primitive types (candidate maps; count ints) — the `SourceInventory`
  precedent; all wire DTOs unexported; handlers pure delegation.
- **D8 — The guard re-pin is an explicit box (precedent 32daa76).** Any
  proto/ diff trips the three additive guards; they re-pin to THIS change's
  proto commit with comments naming the sanction. Box 2.4, after 1.1
  commits — the red window is one group boundary, and the joint/integration
  guards re-verify at the gate.
- **D9 — Candidate posters render the served URL in the overlay.** Honest
  absence when the source carries none; the first-party admin overlay
  hotlinking a source URL is acceptable preview-only behavior until Layer
  2's art proxy re-routes it. Surfaced as an open question for the gate.

## Interfaces (cross-group)

**Proto — `proto/mellifera/metadata/v1/metadata.proto` (additive):**

```proto
rpc SearchSpecs(SearchSpecsRequest) returns (SearchSpecsResult);
rpc SearchResults(SearchResultsRequest) returns (SearchResultsResult);

message SearchSpecsRequest  { string query = 1; string kind = 2; }
message SearchSpecsResult   { RequestSpec spec = 1; }          // reused
message SearchResultsRequest{ string query = 1; string kind = 2;
                              FetchedResponse fetched = 3; }   // reused
message SearchResultsResult { repeated SearchCandidate candidates = 1; }
message SearchCandidate {
  string external_id = 1;
  string title = 2;
  optional string russian_title = 3;   // proto3 presence — absent, never ""
  optional int32  year = 4;
  optional int32  episodes = 5;
  string kind = 6;
  optional string poster = 7;          // URL; absent when the source has none
}
```

**SDK — `pkg/sdk/metadata.go`:** `MetadataSource` gains
`SearchSpecs(ctx, *metadatav1.SearchSpecsRequest) (*metadatav1.SearchSpecsResult, error)`
and `SearchResults(ctx, *metadatav1.SearchResultsRequest)
(*metadatav1.SearchResultsResult, error)`; the GRPCServer/GRPCClient
adapters forward them; embeddable `UnsupportedSearch` carries both with the
sentinel `ErrSearchUnsupported` (serial-parser embeds, shikimori overrides).

**Core enrich (cmd-closed over the queue):**

```go
// SearchSource: typed client → SearchSpecs → FetchGate-executed fetch →
// SearchResults → candidates as primitive maps (convention-keyed).
// Errors: manager unknown-plugin; ErrSearchUnsupported wrapped for the api
// mapping; upstream fetch failure as a distinct error class.
func (q *Queue) SearchSource(ctx context.Context, pluginID, query, kind string) ([]map[string]any, error)

// IdentifySeries: lease row → identifiers.<pluginID>_id = externalID
// (overwrite) → persist → release → ReenrichSource(pluginID, [seriesID]).
// A lease-held row returns zero counts + deferred=1 and writes NOTHING.
func (q *Queue) IdentifySeries(ctx context.Context, seriesID, pluginID, externalID string) (queued bool, stripped, deferred int, err error)
```

**Override write contract:** the key is `identifiers.<source_id>_id`
(e.g. `identifiers.shikimori_id`); the value is the picked `external_id`
verbatim; the write is core-side (outside plugin namespace enforcement, the
D-4 precedent), lease-held, and the strip that follows NEVER touches it.
`title_overrides` (a separate control table) and every title-bearing
namespace are structurally untouched — display composition is byte-stable.

**api Deps closures (INV2 — cmd builds, api never imports enrich/plugin):**

```go
// Deps additions (primitive returns — the SourceInventory budget precedent):
SearchSource   func(ctx context.Context, pluginID, query, kind string) ([]map[string]any, error)
IdentifySeries func(ctx context.Context, seriesID, pluginID, externalID string) (queued bool, stripped, deferred int, err error)
```

**Wire (admin group, both new):**

```
GET /api/v1/admin/sources/{plugin_id}/search?query=…&kind=…
  200 {"candidates":[{"external_id","title","russian_title?","year?",
        "kind","episodes?","poster?"}]}          // served order, verbatim
  400 bad_request (empty query) | 400 unknown plugin
  400 search_unsupported        | canonical upstream error, retry disabled
PUT /api/v1/series/{id}/identify   {"source_id", "external_id"}
  202 {"queued":true,"stripped":N,"deferred":N}   // ReenrichResult shape
  400 bad_request (empty fields) | 400 unknown source | 404 unknown series
```

**SPA:** `web/src/components/manage/IdentifySeries.tsx` (the three steps;
`data-testid` markers `identify-search-input`, `identify-current-match`,
`identify-candidate`, `identify-searching`, `identify-empty`,
`identify-error`, `identify-confirm` — the node-free probe anchors);
`web/src/lib/api.ts` gains `searchSource` + `identifySeries`; the series
card's `CardActions` call site gains `identify={seriesIdentifyGate(…)}` with
the picker fed by the served `refresh_sources`.

## Risks / Trade-offs

- [Interactive search shares the sweep's pacing budget] → a search may wait
  behind sweep traffic (a quiet line, not a hang; the 700 ms anonymous cap
  is shared by design and the search is one request).
- [The identifier overwrite is destructive] → the confirm step states the
  replacement plainly; the strip is the explicit-action path (re-identify
  again is always available); no other consumer reads the old id.
- [Guard red window between groups 1 and 2] → box 2.4 re-pins immediately
  after the proto commit; the DAG runs 1 → 2 back-to-back; the joint guards
  re-verify at the gate.
- [Two new RPCs widen the plugin contract for every implementer] → the
  UnsupportedSearch base keeps non-search plugins one line compatible; the
  capability stays opt-in per plugin at the surface (search_unsupported).
- [Candidate maps as closure return lose compile-time shape] → the proto
  message IS the shape; the api handler only relays; the joint test pins
  the field set end to end.

## Migration Plan

Purely additive: new RPCs, new SDK base (embed), new queue methods, new
closures + routes, new SPA component + one new prop at one call site. No
stored data migrates (the identifiers tier already exists); no existing
route, DTO, or namespace changes. Rollback = revert the change; stored
documents carry no trace unless an operator identified a row (the anchor
key is plain JSON, hand-inspectable).

## Open Questions

None blocking. D9 (raw-URL candidate posters vs no-poster until Layer 2)
is the one taste call a human may want to veto at the gate; the default
ships the raw URL, honestly absent when the source has none.
