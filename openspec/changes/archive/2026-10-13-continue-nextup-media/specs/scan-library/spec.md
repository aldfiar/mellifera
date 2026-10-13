## ADDED Requirements

### Requirement: TV module seed v2

The core SHALL seed the `tv` module config at `schema_version` 2, binding
`base-scanner` as scanner and the ordered metadata chain `tv-parser`
(priority 1), `kinopoisk` (2), `tmdb` (3), and `frame-grabber` (priority 4,
display fields `thumbnail`/`grabbed_at`), so tv-module films derive
frame-grabber thumbnails like serial episodes. An existing store whose seeded
`tv` row still sits at `schema_version` 1 SHALL be upgraded by a guarded
`UPDATE modules SET ... WHERE id='tv' AND schema_version < 2` run after the
`INSERT OR IGNORE` (the ignore alone never rewrites an existing row); the
upgrade SHALL be idempotent — an open against a row already at version 2 SHALL
NOT rewrite it — and SHALL touch no other module row. The enrich derivation
stays chain-driven: existing film items derive the frame-grabber namespace on
the next drain without a rescan.

#### Scenario: Fresh install seeds the v2 tv chain with the frame-grabber

- **WHEN** a fresh store opens and the `tv` module's config is resolved
- **THEN** the config binds `base-scanner` as scanner and the ordered metadata chain `tv-parser`, `kinopoisk`, `tmdb`, `frame-grabber` at priorities 1–4, with `schema_version` 2

<!-- wf:probe id=9e2727e0ab147725 -->
```bash
set -e
go test ./internal/module -run TestTvModuleSeedV2
```
<!-- /wf:probe -->

#### Scenario: A v1 tv row upgrades to v2 idempotently

- **WHEN** the registry opens against a store pre-seeded with the v1 `tv` module row, and then opens again
- **THEN** the first open rewrites the row to the v2 config with `schema_version` 2, the second open changes nothing further, and no other module row is touched

<!-- wf:probe id=d0e02977b9a60fc5 -->
```bash
set -e
go test ./internal/module -run TestOpen_TVSeedUpgradesV1Row
```
<!-- /wf:probe -->
