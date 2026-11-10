# Proposal

## Why

The registry has seeded an unloaded `tmdb` metadata-source slot since the enrichment seed (tv module, priority 3, `auth_mode: SERVER`) and the client-relayed-fetch transport has shipped, but no TMDB plugin exists — films and serial libraries enrich without the largest film/TV metadata source, and serial episodes carry no names or overviews beyond the parser's facts. This change lands the designed TMDB slice from the layer-4 design (Concern 1) with the operator's scope ruling applied: the serial follow-up the design ruled out (OQ-4) is folded in — serial module seed bump plus per-episode names/overviews.

## What Changes

- New `plugins/tmdb` binary (structural mirror of `plugins/shikimori`): a stateless `sdk.MetadataSource` on one gRPC server — document-shape match dispatch (`tmdb_id` anchor, film → movie search, series → tv search, episode never applies), SERVER-mode request contract (`required_secrets: ["api_key"]`, `server:`-scoped `redacted_ref`, `language=ru-RU`, light pacing), RU-first conversion namespace under `sources.tmdb` with convention `cast[]` and per-episode title/description contributions, namespace-only Merge, and the interactive search pair.
- Core SERVER-mode auth plumbing (the design's OQ-5, store-backed): the plugin manager exposes the handshake-declared `required_secrets`; the enrich chain resolves a SERVER binding's secrets from the binding's store-backed config, substitutes `server:` redacted refs at the one executor seam (fetch, search, and relay plan descriptors alike), and passes `AuthContext{mode: SERVER}` to BuildRequest (values never enter the plugin process); a binding whose required secrets do not resolve is UNCONFIGURED — dormant at derivation, never queued into retry churn; interactive search/identify answer unavailable.
- Admin secret surface (OQ-5's visible "needs config"): `PUT /admin/modules/{module_id}/sources/{plugin_id}/options` writes one module binding's options JSON (the store-backed home of secrets); the plugins aggregate carries declared `required_secrets` vs provided, and served binding options omit secret values.
- `PUT /items/{id}/identify` — the series identify override generalized over any item row (films are items in tv libraries), mirroring body, semantics, and error shapes.
- Serial module seed promoted to `schema_version` 4: the `tmdb` binding at priority 4 (after shikimori), enabled, `auth_mode: SERVER`; anchored series runs fetch `/3/tv/{id}/season/{n}` as an extra and per-episode name/overview ride `ConvertResult.EpisodeTitles` into the existing episode-title routing — no routing change.
- Zero UI cost (verified against the live tree): the SPA reads the served about/cast/episode blocks field-driven; a conforming `sources.tmdb` namespace simply appears. No web change, no media-data-convention change (the convention already names TMDB as an anticipated source).

## Capabilities

### New Capabilities

- `tmdb-enrichment`: the TMDB metadata source as a plugin capability — match dispatch, SERVER request contract, RU-first namespace with cast and per-episode contributions, and the serial module seed v4 binding.

### Modified Capabilities

- `async-enrichment`: the chain resolves SERVER-mode auth from store-backed binding config (BuildRequest auth context, `server:` redacted-ref substitution incl. relay descriptors, unconfigured-binding dormancy, interactive search/identify unconfigured answer); the identify override generalizes from series rows to any item row via `PUT /items/{id}/identify`.
- `plugin-admin`: the plugins aggregate surfaces declared `required_secrets` vs provided and redacts secret values from served binding options; a new admin endpoint writes one module binding's options JSON.

## Impact

- `plugins/tmdb/` (new package + `bin/tmdb` Makefile target), `cmd/mellifera/main.go` (load the plugin, wire the required-secrets and options closures).
- `internal/enrich` (auth-context injection, `server:` substitution at `resolveVariables`, relay plan descriptor resolution, derivation dormancy check, `IdentifyItem`), `internal/plugin` (required-secrets accessor over the retained handshake), `internal/module` (serial seed v4, binding-options write), `internal/api` (identify + options routes, aggregate fields, unconfigured mapping).
- Proto untouched (`AuthContext`, `required_secrets`, `EpisodeTitle` all exist); relay behavior untouched (the binding rides the shipped client-relayed-fetch transport transparently; its descriptor-resolution requirement is satisfied by the new substitution seam); web untouched.
- New admin API surface: 2 routes (`PUT /items/{id}/identify`, `PUT /admin/modules/{module_id}/sources/{plugin_id}/options`) + aggregate fields — openapi/embedded-web regen required.
