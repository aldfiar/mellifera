# Spec Delta

## ADDED Requirements

### Requirement: Plugin health state vocabulary

The plugin health snapshot's `state` SHALL draw from the closed vocabulary
`serving | degraded | not_serving | failed` — the host's lifecycle states
(serving, non-blocking warning, substrate down, failed to start). No other
value SHALL appear in the served `state` field; `message` stays free text
alongside, never instead.

#### Scenario: The aggregate serves only vocabulary states

- **WHEN** the plugins aggregate serves health for plugins that are serving,
  degraded, not serving, and failed to start
- **THEN** each row's `state` is exactly the corresponding vocabulary value
  and each `message` renders verbatim beside it

### Requirement: Plugin failure counts in the aggregate

The plugins aggregate (`GET /api/v1/admin/plugins`) SHALL carry an additive
per-plugin `failures` count: the number of enrichment-failures ledger rows
CURRENTLY STORED for that plugin — the ledger keeps no history (a row is
deleted on success), so the count reads "failures now", never a lifetime
total. A plugin with no stored rows SHALL read `0`; rows for entities gone
from the library SHALL stay counted (the ledger's loop-safety visibility
rule).

#### Scenario: The count reflects current rows only

- **WHEN** one plugin has a stored ledger row, another plugin's row was just
  cleared by a success, and a third plugin has never failed
- **THEN** the aggregate reads `failures: 1` for the first and `0` for the
  others — the cleared row leaves the count, and no lifetime total is implied

#### Scenario: Gone entities stay counted

- **WHEN** the only ledger row for a plugin names an entity no longer
  present in items or series
- **THEN** the row stays counted in that plugin's `failures` — the
  loop-safety rows remain visible until the ledger itself clears them
