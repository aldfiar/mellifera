# Proposal

## Why

A wrong metadata source match is permanent today: refresh re-fetches by the
STORED id (the anchored run), so shikimori having matched the Aria directory
to a 1998 OVA poisons every refresh. Rename fixed the display name — never
the metadata. Layer 1.1 of the UI roadmap adds the Plex-style fix: one
overlay — search, pick from the source's served candidates, confirm — and an
identifier override that makes the next refresh fetch BY the picked id.

## What Changes

- The MetadataSource plugin capability gains an interactive search pair —
  `SearchSpecs`/`SearchResults` — declared by the plugin, fetched by the
  core through the existing pacing gate, candidates returned in the
  source's served order (verbatim; plugins stay HTTP-free). shikimori
  implements it from its existing bounded `/animes?search=` call;
  non-search plugins answer through an SDK unsupported-search base.
- `GET /api/v1/admin/sources/{plugin_id}/search` — admin-gated read-only
  passthrough to that capability, in the served order.
- `PUT /api/v1/series/{id}/identify` `{source_id, external_id}` — stores
  the identifier override (`identifiers.<source_id>_id`, overwritten) under
  the row's lease, then runs the existing ReenrichSource strip + notify, so
  the next fetch is id-anchored on the picked id; display names and title
  state are structurally untouched.
- The series card's ⋯ menu gains the Identify… row (module-wired gate,
  the item-card idiom) opening the three-step overlay: search pre-filled
  from the current name with the current match shown for orientation →
  candidates rendered in served order with a source picker from the served
  `refresh_sources` → a confirm step stating plainly what replaces what
  (description/genres/facts re-pull; the display name stays). States:
  quiet-line searching, honest no-results, canonical inline error with
  retry disabled.
- Films (`/items/{id}/identify`) are DEFERRED to Layer 4 (post-TMDB); the
  search RPC pair and the passthrough stay kind-agnostic for that reuse.
- The repo's three additive proto guards re-pin to this change's sanctioned
  proto commit (precedent 32daa76).

## Capabilities

### New Capabilities

None — the behavior lands in the four existing domain capabilities it
extends, per the project's spec organization.

### Modified Capabilities

- `plugin-pipeline`: the MetadataSource capability gains the interactive
  search pair beside the four-RPC chain (core-fetched, anonymous-tier
  contract, verbatim served order, unsupported-search base), plus the
  additive-guard re-anchor scenario.
- `metadata-source-admin`: the admin sources surface gains the read-only
  search passthrough (`GET /admin/sources/{plugin_id}/search`) — admin
  group, gate-paced fetch, served-order candidates, honest
  validation/unsupported/upstream errors.
- `async-enrichment`: explicit re-enrichment gains the series identify
  override — lease-held anchor write + strip + notify, deferred-when-busy,
  byte-stable title state, and the across-the-pipeline joint scenario.
- `web-ui`: the CardActions series-card menu rows gain Identify…, and the
  series identify overlay requirement lands (three steps, honest states,
  confirm copy, refresh_sources picker, invalidation).

## Impact

- `proto/mellifera/metadata/v1/metadata.proto` + regenerated contract —
  the additive guards in `internal/itest` re-pin (box 2.4).
- `pkg/sdk` (interface + adapters + `UnsupportedSearch`), `plugins/shikimori`
  (SearchSpecs/SearchResults), `plugins/serial-parser` (embed only).
- `internal/enrich`: two new queue methods riding the existing FetchGate,
  ReenrichSource, and lease machinery.
- `internal/api` + `cmd/mellifera`: two Deps closures (primitive returns —
  the package stays at its 12-symbol cap), two admin routes, OpenAPI regen.
- `web/`: new overlay component + api client functions + the series-card
  menu wiring; the Go gate stays node-free (greps as probes; vitest
  sanctioned in the SPA boxes' own text).
