# Design

## Context

The document machine already carries per-source lossless namespaces
(`sources.<plugin_id>`) with per-field `_provenance`/`_view` (plugin-pipeline),
and the About panel already derives one convention group with cohesion — the
first description-bearing namespace wins whole, facts riding along from the
SAME namespace (web/src/components/metadata/Synopsis.tsx). Three gaps make
that a convention instead of an accident:

1. The group rule is SPA-side and its namespace iteration order is the served
   JSON key order (Object.entries in web/src/lib/document.ts `sourcesOf`;
   Go-marshaled maps serialize alphabetically) — with a second conforming
   source the "first" would be alphabetical, not chain order.
2. The fetch contract is singular: one RequestSpec per run, one raw_response
   into Convert (proto/mellifera/metadata/v1/metadata.proto). Companion
   endpoints (roles today, episodes in Layer 1.2) are unreachable.
3. Nothing writes `cast` or episode fields — shikimori's namespace is exactly
   the de-facto series field set (plugins/shikimori/convert.go
   `namespaceFields`); BuildRequest shapes only the search and the anchored
   `GET /api/animes/{id}` (plugins/shikimori/source.go).

Constraints honored: api stays pure-delegation with zero new exported symbols
(the package sits at the check.sh cap; new surface rides method-set
constructors and unexported types — the titleSourceBinding precedent), the
core hardcodes no provider/media-type literals (parser-display AC-4), probes
stay node-free, `go test ./...` stays green, and downward-only deps are
untouched (the resolver lives in api like the display-naming composer).

## Goals / Non-Goals

**Goals:**
- The convention becomes executable once, server-side: served `metadata`
  blocks (about / cast / episode) resolved first-chain-wins, gate-resolved,
  key-order-immune.
- One source run can fetch companion endpoints (ordered request plan,
  soft-failed extras).
- shikimori proves the convention as first conformer (`cast`).
- The SPA consumes served fields; its synopsis walk retires.

**Non-Goals:**
- The episode-title WRITER (the `/episodes` fetch + how an episode run
  anchors to its series' identifiers) — Layer 1.2, riding the Identify
  refresh; this change ships only the episode fields' convention, the
  projection that will serve them, and the request plan its plugin slice
  will reuse.
- Any UI block beyond switching Synopsis's data source (cast row = Layer 3,
  poster candidates = Layer 2.3, TMDB = Layer 4).
- Store, module seed (no schema_version bump — the chain list derives from
  existing bindings at presentation build), and new routes.

## Decisions

**D1 — cast is flat `{name, role?, photo_url?}` (settlement a).** One shape
renders as one row (portrait, name, role line) for both upstream families:
shikimori character+seiyuu pairs collapse to name=character, role=free-text
seiyuu credit, photo_url=character portrait; TMDB actor→character pairs give
name=actor, role=character, photo_url=actor portrait. `role` is free text
precisely so each source's pair semantics stay honest; `photo_url` is
documented as the entry's primary portrait. Rejected: split
characters[]/actors[] — doubles the contract and forces per-source UI
branching against the convention's core rule.

**D2 — episode title/description live in the source's own namespace ON the
episode document (settlement b).** `sources.<plugin_id>.title/.description`
on the episode doc keeps provenance and footer grouping per-plugin, and the
projection operates per document as today. serial-parser never writes episode
titles (its episode namespaces carry season/episode only — the ItemDetail
"Episode name — not identified" slot exists for exactly that), so no
impersonation and no synthetic shared namespace. Show-level data stays on the
series document (serial-library's episode-doc rule untouched — these fields
are the EPISODE's own data).

**D2-finding — the draft's self-contradiction.** Layer 0's "episode titles
нет upstream — честно" is true only of TODAY'S plugin: it fetches no episodes
endpoint and Match never applies to episode documents (shikimori-enrichment
"Episode documents never match"). The draft's §1.2 asserts the upstream
`/animes/{id}/episodes` carries ru/en titles — plausible, but unverifiable
from this worktree (no such fetch exists to inspect). Resolution: Layer 0
declares the episode fields and ships the machinery; Layer 1.2 confirms the
live upstream shape when it lands the writer.

**D3 — the implementation line (settlement c).** Ship: the contract (spec
deltas), the request-plan extension, the serve-side projection, the
shikimori `cast` conformer, and the SPA consumption switch — everything that
makes the contract executable and conformed-by-once. Defer: the episode
writer (1.2), cast UI (3), poster candidates (2.3), TMDB (4). Rationale: the
sequencing column calls Layer 0 "the contract"; a pure-prose contract would
leave nothing mechanical to gate, while the writer needs the 1.1/1.2 refresh
work anyway.

**D4 — request plan, not facet bindings.** Extending the run with ordered
extra specs (additive proto: `BuildRequestResponse.extra_specs`,
`ConvertRequest.extra_responses` as `FetchedResponse` entries) keeps ONE
source run per (item, plugin) — one Match, one stage trail, one namespace
write. Rejected: binding the same plugin twice with a facet option — a
core-visible concept, two subprocess round-trips, and a Merge replace hazard
(applyContribution replaces `sources[pluginID]` wholesale, so the second run
would need merge-in-plugin gymnastics).

**D5 — the merge machinery is a serve-side read-time projection.** api
composes the additive `metadata` block per request from the document plus the
served `source_chain` — the display-naming posture (compose at read, never
persist, SPA renders served values). This kills the alphabetical-order
hazard for every consumer at once, gives node-free mechanical probes
(go test), and Layers 2–3 read served fields literally ("UI читает поля").
Rejected alternatives: an SPA-side chain-ordered walk (per-consumer
duplication, vitest probes forbidden in this change, no Go acceptance
floor); an enrich-time `_view` rewrite (touches three write paths —
applyContribution, reenrich, rescan-carry — and entangles the title machine,
whose walk order is title_source_priority, deliberately NOT the chain).

**D6 — the resolution order is a NEW additive `source_chain` presentation
list.** The cmd-side closure already resolves gates over the chain
(enrich.ResolveGates); appending `{id, enabled}` pairs in chain order costs
one method and ~3 lines of wiring. Rejected: walking Parsers (chain order
but not gate-resolved) or RefreshSources (gate-resolved but only
title_source_priority entries — a modeled chain source outside the title
priorities would silently never win a group).

**D7 — AC-4 defense (declared, not coded).** The convention package text
fixes the shared field vocabulary (cast, description, episode title…); that
is the convention itself, not per-source or per-media branching. No core
logic branches on a provider or media-type literal; a future source writes
the same names and needs zero core edits — AC-4's intent (config-declared
display, no coded branching) is preserved, and GATE 1 blesses this reading.

**D8 — group membership.** Synopsis group = description plus its ride-along
facts (genres, score, kind, status, episodes, aired_on) — spec-izing the
shipped Synopsis.tsx cohesion; carrier test = description present (facts
alone never claim the group). Cast group = non-empty cast array. Episode
group = title and/or description on an episode document; carrier test =
any member present, served members = what the winner has (honest partial).

## Interfaces (cross-group)

1. **proto (group 2 → group 3):**
   - `BuildRequestResponse { spec = 1; repeated RequestSpec extra_specs = 2; }`
   - `message FetchedResponse { bytes body = 1; int32 http_status = 2;
     map<string,string> headers = 3; bool fetched = 4; string error = 5; }`
   - `ConvertRequest { … existing 1–6 …; repeated FetchedResponse
     extra_responses = 7; }` — aligned with extra_specs order; primary
     fields unchanged (wire-compatible).
2. **enrich (group 2):** the fetch point loops spec+extras through the same
   validation and the plugin's FetchGate slot; a failed extra yields
   `FetchedResponse{fetched:false, error}` and the run continues; primary
   failure is today's path.
3. **api presentation (group 1 → group 4):** `ModulePresentation` gains
   additive `source_chain []titleSourceBinding` (json
   `source_chain,omitempty`) via a new `AddChainSource(id string, enabled
   bool)` method — cmd/mellifera appends each ResolveGates verdict in chain
   order.
4. **api DTOs (group 1 → groups 4, 5):** additive `metadata` object on
   itemDTO and seriesDTO (list + detail), composed at read, keys present
   only when resolved:
   ```json
   "metadata": {
     "about":  { "source": "shikimori", "description": "…",
                 "genres": ["…"], "score": 4.6, "kind": "tv",
                 "status": "released", "episodes": 13, "aired_on": "2005-…" },
     "cast":   [ { "name": "…", "role": "…", "photo_url": "…" } ],
     "episode": { "title": "…", "description": "…" }
   }
   ```
   Values verbatim from the winning namespace; `source` names it (the
   footer's provenance stays the stored `_provenance`). TS mirrors the
   optional shape in web/src/lib/api.ts.
5. **plugin contract (group 3):** anchored shikimori BuildRequest returns the
   primary anime spec plus `GET /api/animes/{id}/roles` as the extra spec;
   Convert composes `cast` from the roles body per D1; absent/unfetched
   roles → no cast field.
6. **SPA (group 4):** Synopsis takes the resolved about object as its prop
   (ItemDetail resolves the series' served about for episodes, its own for
   everything else — the resolution it already does, now over served
   blocks); the client-side namespace walk (sourcesOf in that component's
   path) retires.

## Risks / Trade-offs

- [Roles endpoint shape assumed character+seiyuu pairs] → Convert is
  tolerant: unusable entries are skipped, empty/unfetched roles leave cast
  absent; fixtures pin the shape in TestConvert. The live upstream contract
  gets its final confirm at the first anchored refresh.
- [cast only appears after an id-anchored run] → Documented in the spec
  scenario; the refresh pickers (RefreshSources) already give operators the
  one-click path; Identify (1.1) anchors every corrected match.
- [api package size] → the resolver is one unexported file + unexported
  types; exported surface unchanged (method-set constructors per the
  titleSourceBinding precedent).
- [Read-time projection cost] → one bounded walk over a handful of
  namespaces per element, the same order as the existing namer walk; no
  persistence, no invalidation.
- [Episode group serves partial ({title} without {description})] → intended
  honesty (never stitch); Layer 1.2's writer should emit both members from
  the same fetch, matching the group rule.

## Migration Plan

Additive only: proto field additions are wire-compatible; DTO/presentation
additions are omitempty; no store rows change; no seed bump. Roll-forward
only — reverting the change removes served fields and returns Synopsis to
its (still-conformant-for-one-source) walk. The Go gate stays green at every
box; dist rebuild per the house release flow.

## Open Questions

None blocking. Deferred by design (D3/D2-finding): the episode-run anchoring
mechanism and the live `/episodes` upstream shape are Layer 1.2 design
inputs; the poster-candidate ordering question (2.3) will read
`source_chain` but decides there.
