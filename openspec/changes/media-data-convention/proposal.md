# Proposal

## Why

Shikimori is one metadata source among the ones still to come (TMDB, Kinopoisk,
TVDB…), but the human-readable data — cast, episode titles, synopses — has no
shared contract: today each new source would need its own UI wiring. The UI
improvement proposal's Layer 0 («Общая конвенция медиаданных») fixes the field
convention once, spec'd first so every later layer reads it: the UI reads
fields, never sources, and a source that does not provide a field leaves the
UI block absent — never fabricated.

## What Changes

- A unified media-data field convention for every `metadata_source` plugin's
  `sources.<plugin_id>` namespace: the series/film fields (title{romaji?,
  russian?}, description, genres[], score, kind, status, episodes, aired_on,
  poster, url — shikimori's de-facto shape, raised to standard), a new shared
  `cast` array ({name, role?, photo_url?} — people/characters with role as
  free text), and the episode-document's own `title` and `description`.
- Group-integrity merge: convention groups (the synopsis set, cast, the
  episode title+description pair) resolve WHOLE from the first
  effectively-enabled namespace in the module's chain that carries them —
  never stitched from multiple sources. The gate-resolved chain order is
  served (`source_chain` on the module presentation); resolution never
  depends on document key order.
- Honest absence: no namespace carries a group → no served block. Provenance
  stays the existing per-field `_provenance` machine — no new writes.
- A small request-plan extension to the source run: BuildRequest may declare
  extra request specs; the core fetches and delivers them (soft-failing
  extras) — the enabler for companion-endpoint data (roles now, episode
  titles in Layer 1.2).
- First conformer: shikimori fetches the anime roles endpoint on id-anchored
  runs and writes the convention `cast` array into its namespace.
- The serve layer composes an additive `metadata` block (about / cast /
  episode) on item and series DTOs — the merge machinery, implemented once,
  read-time like display_name; the SPA's About panel consumes it and its
  client-side namespace walk retires.
- NOT in this change (later layers of the proposal): the episode-title
  writer (Layer 1.2, rides the Identify refresh), the cast UI row (Layer 3),
  poster candidates (Layer 2.3), TMDB (Layer 4).

## Capabilities

### New Capabilities

- `media-data-convention`: the field convention, the group-integrity merge
  rule, and the honest-absence rule that every metadata_source plugin obeys
  and every consumer resolves through — so any future source connects with
  zero UI edits.

### Modified Capabilities

- `plugin-pipeline`: a source run can carry an ordered request plan (extra
  fetch specs delivered to Convert, soft-failed extras) — additive to the
  shipped single-fetch chain, same validation and pacing.
- `shikimori-enrichment`: id-anchored runs declare the anime roles endpoint
  as an extra fetch and convert it into the convention `cast` array; absence
  stays honest (no roles body → no cast field).

## Impact

- `proto/mellifera/metadata/v1`: additive message fields (wire-compatible;
  no existing field changes).
- `internal/enrich`: the fetch point executes the plan (primary + extras)
  under the same validation and `min_interval_ms` pacing.
- `internal/api` (+ `cmd/mellifera` closure wiring): an unexported
  convention resolver, the additive `metadata` block on item/series DTOs
  (list + detail), the additive `source_chain` on the module presentation.
- `plugins/shikimori`: the roles extra spec on anchored runs + cast
  conversion.
- `web/src`: Synopsis consumes the served about block; TS types gain the
  additive fields.
- No store changes, no module seed bump, no new routes; the Go gate stays
  node-free and green throughout.
