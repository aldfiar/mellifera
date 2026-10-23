# Design

## Context

Episode documents in serial libraries carry only `sources.serial-parser` parse
facts (season/episode) and `frame-grabber` images; the identity slot renders
"title — not identified" and every surface floors to SxxEyy. The write is
missing, not the read: the served episode block (media-data-convention),
the namespace walk floors (display-naming), and the SPA identity slots already
render a title when one lands. See proposal.md — Why.

Everything the writer needs already exists on this base: the request-plan
machinery (`BuildRequestResponse.extra_specs` → core-executed gate-paced
fetches → `ConvertRequest.extra_responses`, the media-data convention D4
seam the shikimori cast field already rides — roles is extras[0] today), the
anchored match (identifiers.shikimori_id), `QueryItemsBySeries`
(internal/store/series.go — the episode rows of a series, directory-backed,
depth-1), the per-row lease primitive, and the ReenrichSource strip. One gap:
Convert's output shape has no place for per-episode data — `metadata` wraps
into the RUN document's namespace, and an episode run can never happen
(shikimori declines episode documents at Match, which stays true).

The plugin targets `https://shikimori.io` (compile-time base) at the anonymous
tier; shikimori anime ids are PER-SEASON entries, so
`/api/animes/{id}/episodes` numbers episodes within the matched season — the
same season the local directory names.

## Goals / Non-Goals

**Goals:**
- One extra fetch per SERIES run puts every episode's title on its episode
  document — `sources.shikimori.title` + `_provenance`/`_view`, lease-held.
- The smallest honest contract surface: an additive ConvertResult field; no
  new RPC, no new SDK surface, no serial-parser change.
- Refresh honesty: an explicit series strip (identify, per-row refresh)
  refreshes the routed titles with the series; whole-library refresh already
  covers them.

**Non-Goals:**
- Episode descriptions — shikimori upstream serves none; no source writes the
  episode group's description today (the convention's honest-absence rule
  covers it; TMDB episode overviews are Layer B3).
- En titles on the wire — the convention episode `title` is one name; the
  russian name wins (RU-first), the other served name is the fallback. The
  multi-language episode-title shape would be a convention change, not 1.2.
- Display-name composition — the composed `Show · SxxEyy` still wins
  `display_name` where facts resolve; the title surfaces through the identity
  slots, the served episode block, and the walk floors (Layer 3.1 renders the
  watch-view heading from the convention field later). No api/ or web/ change.
- Per-episode Match applicability — episode documents keep never matching;
  titles ride the series run only.

## Decisions

- **D1 — The titles ride the EXISTING four-RPC chain as a second extra
  (not a new RPC pair; not per-episode runs; not core-side fetch).** The
  request-plan seam already executes companion fetches gate-paced and
  position-aligned, and the cast field is the in-repo precedent (anchored
  plan → roles extra → namespace field). A dedicated `EpisodeNames` RPC pair
  would duplicate that conversation for zero new capability; per-episode
  enrichment runs would cost N × 2 gate-paced fetches per series against the
  700 ms anonymous cap; a core-side episodes fetch would be the first
  upstream-specific endpoint the core knows — every fetch shape stays
  plugin-declared.
- **D2 — The contract is one additive field: `ConvertResult.episode_titles`
  (`repeated EpisodeTitle`), `EpisodeTitle{int64 episode, Struct metadata}`.**
  `episode` is the source's number within the matched season; `metadata` is
  that episode's namespace fields (title only today) — generic Struct, so a
  future episode description from another source rides additively. Carrying
  the entries inside `metadata` under a reserved key was rejected: `episodes`
  already means the episode COUNT in the series namespace (the synopsis
  group), and a reserved-key protocol smuggled through namespace data breaks
  the convention's honest-field rule. The entries never touch the run
  document's namespace — the core hands them to the router.
- **D3 — The episode namespace is `sources.shikimori` (the source namespace),
  not serial-parser's.** The roadmap left this open ("serial-parser namespace
  or the source namespace — decision at spec time"); namespace isolation ends
  the question: a plugin writes ONLY its own namespace (validateNamespace
  rejects foreign writes, and serial-parser is a different subprocess that
  never sees shikimori's payload). The convention's episode group is
  per-plugin by design and the group-integrity merge serves `{title}` alone
  (honest partial) — a conforming write needs no convention delta.
- **D4 — `title` is a plain string, russian-preferred.** The SPA identity
  walk renders strings cleanly; an object would surface as raw JSON in the
  identity badge and defeat `String(nameValue)`, and the display-naming walk
  uses a string verbatim. The russian name is first-class (the conventions
  digest; the seeded RU-first preference); an entry with no usable name
  contributes nothing — never a placeholder, never a fabricated description.
- **D5 — Routing is core-side, per-episode-lease-held, best-effort, matched
  by (series season fact, entry number).** After a series run commits its
  namespace, the worker loads the series' episode items
  (QueryItemsBySeries — a file-backed series has none and the route no-ops),
  reads facts namespace-agnostic (any namespace carrying BOTH integers — the
  display composer's rule; the series' season fact read the same way), and
  writes under the episode row's own lease with one bounded retry pass (the
  reenrich posture — an unleased write could be resurrected by an in-flight
  episode worker's unconditional persist). The season guard keeps a
  multi-season directory honest: an episode of another season matches no
  entry and stays untouched. A routed namespace makes the episode's own
  `<item, plugin>` pair terminal through the unchanged has-namespace gate —
  no lifecycle, derivation, or Match change; no `_stages` entry (routing is
  not a chain run; the footer trace is the `_provenance`/`_view` stamps).
- **D6 — The explicit strip cascades: rowIDs naming a series row scope its
  episode items.** Without it, re-anchoring a series (identify) leaves the
  old routed titles forever — derivation skips the episode pairs on namespace
  presence, so nothing would ever rewrite them. Whole-library sweeps need
  nothing (reenrichScope already covers every item and series row carrying
  the namespace); the cascade is scoped to explicit series rows so per-row
  counts stay truthful.
- **D7 — The guard re-pin is an explicit box in g2 (precedent 32daa76,
  identify-match-override box 2.4).** Any proto/ diff trips the three
  additive guards; they re-pin to THIS change's proto commit with comments
  naming episode-titles. The red window is one group boundary (the DAG runs
  g1 → g2 back-to-back); the joint guards re-verify at the gate.

## Interfaces (cross-group)

**Proto — `proto/mellifera/metadata/v1/metadata.proto` (additive, g1):**

```proto
message ConvertResult {
  // ... metadata = 1, provenance = 2, warnings = 3, error = 4 (unchanged)
  // Episode-title contributions (episode-titles): per-episode namespace
  // fields the core routes onto the enriched series' episode documents.
  // NEVER part of the run document's own namespace.
  repeated EpisodeTitle episode_titles = 5;
}

message EpisodeTitle {
  // The source's episode number within the matched series' season.
  int64 episode = 1;
  // The namespace fields for THAT episode (convention episode fields only).
  google.protobuf.Struct metadata = 2;
}
```

**Plugin (g1):** `episodesSpec(id)` beside `rolesSpec(id)` — the anchored
plan's `extra_specs` = [roles, episodes]; Convert maps extras[1]
(positionally — extras[0] stays roles) into `EpisodeTitle` entries:
`metadata = {"title": <russian name, else the other served name>}`.

**Core enrich (g2, all unexported — no new exported symbols in the package):**

```go
// after a series row's successful run with entries: route each entry onto
// the series' episode docs — QueryItemsBySeries → facts match → write
// sources.<plugin> + _provenance/_view under the episode row's lease
// (held → counted → one bounded retry); best-effort, no lifecycle change.
func (q *Queue) routeEpisodeTitles(...)

// reenrichScope: explicit rowIDs naming a series row grow the scope by
// that row's episode items (same backing read the routing uses).
```

**Test-name contract (the boxes' joint seam):** `TestBuildRequestEpisodeExtra`
and `TestConvertEpisodeTitles` (plugins/shikimori), `TestEpisodeTitleRouting`
and `TestReenrichSourceSeriesCascade` (internal/enrich),
`TestQAEpisodeTitlesJoint` (internal/itest) — the duties in the plan tracker
pin exactly these names, and the QA box builds on the g2 tests' fixtures only
through the real graph, never by importing their internals.

## Risks / Trade-offs

- [The upstream episodes payload is unpinned — shikimori.io returned 522
  across its domains this session, so the exact entry field names could not
  be captured] → the contract holds under either payload reality: the
  decoder maps the russian name field preferred and any other served name as
  fallback; entries without a usable name contribute nothing. The apply pass
  pins the fixture from a live capture (or the upstream's documented shape)
  inside `TestConvertEpisodeTitles`; the delta requirement never names
  upstream fields.
- [Shikimori per-season numbering is an upstream model, not a wire guarantee]
  → the season-fact guard makes a wrong assumption FAIL HONEST (an episode of
  another season stays titleless) instead of writing a wrong title; a
  multi-season directory matched to one season's anime leaves the other
  seasons' episodes untouched.
- [Routing writes race an in-flight episode worker] → the episode row's own
  lease + one bounded retry pass — the identical discipline the strip sweep
  uses for the same hazard; a row that stays held keeps its bytes.
- [Routed titles can go stale on upstream edits] → refreshed by explicit
  strips (identify, per-row, whole-library); automatic paths never re-route a
  namespace that exists — the same staleness posture every plugin namespace
  has; the refresh endpoints are the operator's handle.
- [Guard red window between g1 and g2] → box 2.3 re-pins immediately after
  1.1's commit; the DAG orders it; the gate re-verifies all three anchors.

## Migration Plan

Purely additive: one proto field, one plugin extra + mapping, one unexported
routing step, one scope growth. No stored data migrates; a routed namespace
is plain JSON in the episode document (hand-inspectable), strippable today
via the existing whole-library refresh and (after this change) any explicit
series refresh. Rollback = revert the change; stripped titles re-derive to
the pre-change state (absent, honest).

## Open Questions

None blocking. The upstream field-name question is bounded by the contract
(russian-preferred, fallback honest, absence honest) and resolves at apply
time inside the plugin's own tests; it cannot change the specs, the approach,
or the task breakdown.
