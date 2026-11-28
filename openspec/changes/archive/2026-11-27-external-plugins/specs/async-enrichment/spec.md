# Spec Delta: async-enrichment

## ADDED Requirements

### Requirement: No-relay source trait

A metadata-source binding MAY declare a `no_relay` trait in its module config.
The config decode SHALL treat an absent or false trait as relay-eligible and
decode it with byte-identical behavior for every existing config (no existing
binding changes meaning). A trait-carrying binding's DERIVATION is unchanged —
it still derives per the queueable-source rule and the configured SERVER
dormancy law. What the trait changes is the fetch side: a fetch failure on a
trait-carrying source SHALL take the plain chain-failure path — the run SHALL
NEVER defer to the relay queue, SHALL NOT consult the relay cache, and its
fully-substituted request plan SHALL never be handed to the relay (the
relay-side law is client-relayed-fetch's). The trait exists so a source whose
descriptors are environment-bound (LAN URLs, personal credentials) keeps them
off the claim pool by config rather than by plugin knowledge.

#### Scenario: Trait-carrying source's network failure stays a chain failure

- **WHEN** a trait-carrying source's fetch fails with a network-class error
  while the relay is enabled
- **THEN** the run fails through the normal retry and ledger paths exactly as
  a non-relay-eligible failure does today — no relay job is created and no
  `relayed` ledger row is written

#### Scenario: Trait-carrying source never consults the relay cache

- **WHEN** a trait-carrying source's run reaches the fetch point while a done,
  unconsumed relay job exists for the pair
- **THEN** the run skips the cache consult entirely and performs a server
  fetch, leaving the stored job unconsumed

#### Scenario: Absent trait decodes byte-identically

- **WHEN** any existing module config (no trait declared) is parsed after the
  change
- **THEN** every binding decodes with the trait false and every derivation,
  fetch, and relay behavior is byte-identical to today

### Requirement: Required-option value transport (raw substitution)

A declared required option MAY carry a full origin (a base URL with scheme and
port), and the request-spec substitution law SHALL let such a value survive
into the executed URL: a template placeholder MAY carry a raw marker suffix,
and a raw-marked placeholder SHALL be substituted VERBATIM from its resolved
value — unescaped, so an origin dials instead of arriving percent-encoded. The
default SHALL stay percent-encoding (safe in path and query positions) for
every placeholder without the marker — codes, ids, and keys escape exactly as
before — and an unresolved placeholder SHALL remain a spec error. Existing
templates without the marker SHALL substitute byte-identically to today.

#### Scenario: A raw-marked origin value dials

- **WHEN** a SERVER binding's request template carries the raw marker on the
  base-url placeholder and the declared required option holds an
  http://host:port origin
- **THEN** the executed URL carries the origin verbatim — scheme, host, and
  port unescaped — while the other placeholders on the same template still
  percent-encode

#### Scenario: Templates without the marker substitute byte-identically

- **WHEN** any existing request template (no raw marker) substitutes its
  variables after the change
- **THEN** every value percent-encodes exactly as before — the substitution
  output is byte-identical to the pre-change law
