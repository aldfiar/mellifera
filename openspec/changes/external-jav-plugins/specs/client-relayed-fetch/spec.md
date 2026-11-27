# Spec Delta: client-relayed-fetch

## ADDED Requirements

### Requirement: No-relay bindings never enqueue relay jobs

All three relay enqueue seams SHALL honor the no-relay source trait
(async-enrichment's declaration). The enrichment handoff seam SHALL refuse a
trait-carrying source's plan outright — the run falls through to the plain
fetch-failure path with no relay row and no deferral state. The
consult-before-fetch seam SHALL exclude trait-carrying sources — a
trait-carrying run always fetches server-side and never consumes a stored
job. The search seam SHALL NOT enqueue a search job for a trait-carrying
plugin — a network-class search failure on such a plugin answers the upstream
error immediately, with no held request and no search job. Together: no
fully-substituted descriptor of a trait-carrying binding ever reaches
`relay_jobs` or any claimant. Sources without the trait SHALL behave
byte-identically to today at every seam.

#### Scenario: Handoff refuses a trait-carrying plan

- **WHEN** a trait-carrying source's request plan reaches the enrichment
  handoff seam after a network-class failure
- **THEN** the seam refuses the handoff, the run takes the plain fetch-failure
  path, and `relay_jobs` gains no row for the pair

#### Scenario: Consult excludes trait-carrying sources

- **WHEN** a trait-carrying source's run reaches the consult-before-fetch
  point
- **THEN** no consult is attempted for the pair, the run fetches server-side,
  and any stored job for the pair stays unconsumed

#### Scenario: Search never enqueues for a trait-carrying plugin

- **WHEN** an identify-search fetch against a trait-carrying plugin fails with
  a network-class error
- **THEN** no search job is enqueued, no request is held, and the search
  endpoint answers the upstream error exactly as a non-relayed failure does
  today

#### Scenario: Sources without the trait are byte-identical

- **WHEN** any source whose binding does not carry the trait enriches,
  consults, or searches under relay-enabled conditions
- **THEN** all three seams behave exactly as before the change
