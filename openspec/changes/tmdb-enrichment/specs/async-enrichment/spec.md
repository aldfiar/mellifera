# Spec Delta

## ADDED Requirements

### Requirement: Server-mode auth context resolution

The chain SHALL resolve a SERVER-mode binding's required secrets from the
binding's store-backed config before BuildRequest: every secret name the plugin
declares in its handshake `required_secrets` SHALL resolve to a configured value,
BuildRequest SHALL receive `AuthContext` with mode `SERVER` (the secret values
themselves never enter the plugin process), and request-spec execution SHALL
resolve `server:`-scoped `redacted_ref` variables from that config at the one
executor seam — including the fully resolved descriptors a relayed fetch hands out
(client-relayed-fetch's server-authored rule). A binding whose required secrets do
not resolve SHALL be UNCONFIGURED: derivation SHALL NOT derive work for it (dormant
read-time semantics — no ledger row, no retry churn), and its interactive search
and identify actions SHALL answer unavailable with the missing-secret reason. The
`client:` redacted_ref scope SHALL remain unsupported (Mode B unbuilt, the explicit
error); CLIENT bindings stay excluded from the background queue (the
queueable-source rule is unchanged), and a local/anonymous binding without
declared secrets SHALL behave byte-identically to today.

#### Scenario: A configured SERVER binding enriches with resolved substitution

- **WHEN** the chain runs a SERVER binding whose binding config carries values for every declared required secret
- **THEN** BuildRequest receives mode SERVER, the executed spec's `server:` redacted refs are substituted from the binding config, and a network-class failure hands out a fully resolved relay descriptor with no template syntax and no placeholder

#### Scenario: An unconfigured SERVER binding stays dormant

- **WHEN** derivation considers a SERVER binding whose binding config lacks a value for a declared required secret
- **THEN** no work is derived for that pair (no ledger row, no retry), and the source's interactive search answers unavailable naming the missing configuration

#### Scenario: The client scope stays unsupported and anonymous sources are byte-identical

- **WHEN** a spec carries a `client:`-scoped redacted ref, and separately a local source builds a spec with no secret variables
- **THEN** the client-scoped ref is rejected with the explicit unsupported error, and the anonymous source's fetch path executes unchanged from today

### Requirement: Item identify override

The admin API SHALL expose `PUT /api/v1/items/{id}/identify` with body
`{source_id, external_id}` (both required non-empty strings) as a Deps-closure
endpoint (nil-safe, cmd-wired — the api package stays free of enrich/plugin
imports), generalizing the series identify override over any item row (films are
items in tv libraries). The action SHALL run under the row's own lease and SHALL
behave exactly as the series override: write the picked id into the item
document's `identifiers.<source_id>_id` key OVERWRITING the previous anchor, run
the same explicit strip of that source's namespace (never touching `identifiers`
or another plugin's namespace), and notify the library so derivation re-runs the
pair id-anchored. The action SHALL clear the source's ledger cooldown for the row
like every explicit action and SHALL answer `202` with
`{queued, stripped, deferred}`. A row whose lease is held SHALL be reported
deferred with NOTHING written. An unknown item SHALL be `404`, an unknown or
non-search source `400`, a malformed or empty-field body `400`, an UNCONFIGURED
source `503` — in every error case nothing is written. The action SHALL NOT modify
any title-bearing namespace nor the stored title override: the display name
composes byte-identically before and after.

#### Scenario: Identify re-anchors an item and the next run fetches by the picked id

- **WHEN** the identify action lands `{tmdb, 12345}` on a film item whose identifiers anchor a different id
- **THEN** the stored identifiers carry `tmdb_id` 12345, the tmdb namespace is stripped and re-derived, and the re-derived run's Match is anchored on 12345 — the id lookup, not a title search

#### Scenario: A busy row is deferred with nothing written

- **WHEN** the item's lease is held by a worker while identify runs
- **THEN** the answer reports deferred 1 and the document is byte-identical — no anchor write and no strip

#### Scenario: Error cases write nothing

- **WHEN** the identify route targets an unknown item id, names a source that is not loaded, or carries an empty external_id
- **THEN** the answers are `404`, `400`, and `400` respectively with the canonical error body, and no document changes in any of the three cases
