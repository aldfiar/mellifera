# Spec Delta: plugin-pipeline

## ADDED Requirements

### Requirement: Optional plugin load sites

The composition root SHALL distinguish fatal in-repo load sites from OPTIONAL
ones declared in the boot catalog. An optional entry whose binary path does not
exist SHALL be skipped at boot WITHOUT loading or starting: one info log line,
and a synthesized health row `not_serving` whose message names the absence.
An optional entry whose Load or Start fails SHALL be skipped-and-reported: one
warning log line, and a synthesized health row `failed` carrying the error
message. In-repo entries SHALL keep today's fail-fast discipline unchanged.
The status closure SHALL consult the synthesized rows FIRST and fall through
to the manager's served status otherwise, so the admin aggregates render
synthesized rows exactly like manager-served ones with no api change. The
shutdown loop SHALL NOT attempt to stop an id recorded as never-loaded. The
health vocabulary SHALL stay the closed set it is today — no new state string.
The optional catalog entries SHALL carry service-name-class neutral display
strings (no adult grammar wording); their plugin ids remain opaque id strings.

#### Scenario: Absent optional binary boots green with synthesized rows

- **WHEN** the core boots without the optional plugins' binaries deployed (the
  env-overridable paths miss, the catalog entries are present)
- **THEN** boot completes exactly as today, each absent optional plugin is
  logged once at info, and the admin aggregates render its row as
  `not_serving` with the absence message alongside the normally loaded
  plugins

#### Scenario: Broken optional binary is skipped and reported

- **WHEN** an optional binary exists but its Load or Start fails (a stale or
  mismatched external binary)
- **THEN** boot stays green, the failure is logged once at warning, and the
  admin aggregates render the plugin's row as `failed` carrying the error
  message

#### Scenario: In-repo plugins keep fail-fast

- **WHEN** an in-repo plugin's Load or Start fails at boot
- **THEN** boot fails fast exactly as today — the optional skip-and-report
  discipline does not apply to in-repo entries

#### Scenario: Shutdown skips never-loaded optional ids

- **WHEN** the core shuts down with an optional plugin absent (never loaded)
- **THEN** the shutdown loop skips that id quietly — no stop attempt, no
  error log

### Requirement: tv module seed v3

The core SHALL promote the tv module config to `schema_version` 3 by a
guarded, idempotent `UPDATE … WHERE id='tv' AND schema_version < 3` run after
the existing promotions, appending two metadata-source bindings after
frame-grabber at priorities 5 and 6; fresh installs SHALL seed the tv module
directly at version 3 carrying the same bindings. Both promoted bindings SHALL
be enabled, carry the no-relay trait, and the priority-6 binding SHALL bind
its source in SERVER auth mode declaring a required option that stays
unresolved until the operator configures it (the binding therefore derives
nothing until then). The promoted plugin ids in seed config are opaque id
strings; a second open of an already-promoted row SHALL change nothing, and
no other module row SHALL be touched.

#### Scenario: Fresh install seeds the tv module at v3

- **WHEN** the registry seeds the tv module on a fresh store
- **THEN** the row lands at `schema_version` 3 already carrying the ordered
  binding list with the two promoted bindings at priorities 5 and 6, both
  enabled, both no-relay

#### Scenario: v2 to v3 promotion is idempotent

- **WHEN** a store holds the tv module at `schema_version` 2 and the core
  opens it twice
- **THEN** the first open rewrites the row to the v3 config with the promoted
  bindings, the second open changes nothing further, and no other module row
  is touched

#### Scenario: The promoted SERVER binding starts dormant

- **WHEN** the promoted priority-6 binding is seeded and its declared required
  option is not yet configured
- **THEN** derivation derives nothing for that source — no work, no ledger
  row — until the operator configures the option, exactly per the SERVER
  dormancy law

#### Scenario: An absent-binary enabled binding settles ready

- **WHEN** a derivation pass runs for an item whose only enabled binding names
  a plugin with no binary deployed
- **THEN** the run records one unavailable stage entry, writes no ledger row,
  and the item settles ready with no namespace — quiet on every pass, and the
  pair derives again once the binary deploys
