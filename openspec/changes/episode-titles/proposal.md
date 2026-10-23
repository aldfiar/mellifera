# Proposal

## Why

Anime episode documents never learn their own names: shikimori declines episode
documents at Match (they carry season+episode keys) and fetches only
series-level endpoints, so the only namespace an episode doc ever carries is
serial-parser's parse facts. The identity slot stays "title — not identified"
and every episode surface floors to bare SxxEyy. The data exists upstream —
shikimori `/api/animes/{id}/episodes` carries per-episode ru/en titles — and the
series run that already fetches `/roles` for cast can fetch `/episodes` beside
it at no new trigger machinery. Layer 1.2 of the UI roadmap: the surfaces
already render the title when present; what is missing is the WRITER.

## What Changes

- The Convert contract gains an additive per-episode output: ConvertResult MAY
  carry `episode_titles` — entries naming the source's episode number plus the
  namespace fields for THAT episode (convention episode fields only). No
  existing message or RPC changes; the run document's own namespace never
  carries the entries.
- The shikimori plugin's id-anchored plan declares the episodes endpoint as a
  second extra request after the roles fetch; Convert maps the payload into
  per-episode `title` contributions — the russian name preferred (RU-first),
  never a description (upstream serves none), an unfetched or unusable payload
  leaving the contributions absent. Search runs stay without them. Match on
  episode documents still never applies — titles ride the series run only.
- The core enrich worker routes a series run's contributions onto the series'
  episode documents: a matching episode doc gains `sources.shikimori` with the
  convention episode title plus the standard `_provenance`/`_view` stamps,
  written under that episode row's own lease (held rows deferred, one bounded
  retry pass), matched by (the series' season fact, the entry's episode
  number). No matching entry → the episode doc is untouched; lifecycle states
  and derivation predicates are untouched.
- `ReenrichSource` scope grows for explicit rowIDs naming a series row: its
  episode items scope too, so a strip that re-anchors the series also strips
  the routed episode titles and the fresh run rewrites them (whole-library
  sweeps already cover items and series).
- The repo's three additive proto guards re-pin to this change's sanctioned
  proto commit (precedent 32daa76, identify-match-override box 2.4).

## Capabilities

### New Capabilities

None — the behavior lands in the three existing capabilities it extends, per
the project's spec organization.

### Modified Capabilities

- `plugin-pipeline`: the MetadataSource convert contract gains the additive
  per-episode output beside the run namespace (entries delivered to the
  enrichment router, never wrapped into the run document), plus the
  additive-guard re-anchor scenario re-pinned to this change's proto edit.
- `async-enrichment`: the enrichment pipeline learns the series-run
  episode-title routing (lease-held, best-effort, lifecycle- and
  derivation-neutral), and explicit re-enrichment of a series row cascades the
  strip to its episode items.
- `shikimori-enrichment`: the anchored request plan gains the episodes fetch
  and the ru-first per-episode title contributions (honest absence, no
  fabricated descriptions, search runs unaffected).

## Impact

- `proto/mellifera/metadata/v1/metadata.proto` + regenerated contract — the
  additive guards in `internal/itest` re-pin (box 2.3).
- `plugins/shikimori` (BuildRequest extra spec, Convert episodes mapping) —
  the only plugin touched; `plugins/serial-parser` embeds nothing new (no SDK
  surface change — the field rides the generated ConvertResult).
- `internal/enrich`: the worker routes contributions after a series run's
  success (unexported — no new exported symbols); `reenrichScope` grows the
  series→episodes cascade.
- `internal/api` untouched: the served episode block, the identity-slot walk,
  and the display-name floors already render what lands.
- `internal/itest`: the new Tier-1 joint test rides the qa_shikimori_joint
  stub-upstream harness.
