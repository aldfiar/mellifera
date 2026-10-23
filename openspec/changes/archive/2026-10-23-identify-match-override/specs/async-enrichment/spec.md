# Spec Delta

## ADDED Requirements

### Requirement: Series identify override

The admin API SHALL expose `PUT /api/v1/series/{id}/identify` with body
`{source_id, external_id}` (both required non-empty strings) as a
Deps-closure endpoint (nil-safe, cmd-wired — the api package stays free of
enrich/plugin imports). The action SHALL run under the row's own lease and
SHALL: write the picked id into the series document's
`identifiers.<source_id>_id` key, OVERWRITING the previous anchor (a
replaced id has no reader once the operator has confirmed the replacement);
then run the same explicit strip as ReenrichSource for that source's
namespace — a purge that never touches `identifiers` or any other plugin's
namespace — and notify the library so derivation re-runs the pair. The
stored anchor makes that run id-anchored, so the next fetch fetches BY the
picked id (the by-id template already exists in the plugin). The action
SHALL clear the source's ledger cooldown for the row like every explicit
action and SHALL answer `202` with `{queued, stripped, deferred}`. A row
whose lease is held SHALL be reported deferred with NOTHING written. An
unknown series SHALL be `404`, an unknown or non-search source `400`, a
malformed or empty-field body `400` — in every error case nothing is
written. The action SHALL NOT modify any title-bearing namespace nor the
stored title override: the display name composes byte-identically before
and after.

#### Scenario: Identify re-anchors and the next run fetches by the picked id

- **WHEN** the identify action lands `{shikimori, 15041}` on a series whose
identifiers anchor a different id
- **THEN** the stored identifiers carry `shikimori_id` 15041, the shikimori
namespace is stripped and re-derived, and the re-derived run's Match is
anchored on 15041 — the id lookup, not a title search
<!-- wf:probe id=91da05fc3b0902ba -->
```bash
set -e
go test ./internal/enrich -run TestIdentifySeries -count=1
```
<!-- /wf:probe -->

#### Scenario: The display name and title state stay byte-identical

- **WHEN** identify lands on a series carrying a stored title override and
enriched title namespaces
- **THEN** the title_overrides row, the document's title-bearing namespaces,
and the composed display name read back byte-identical
<!-- wf:probe id=80282767bd6fda29 -->
```bash
set -e
go test ./internal/enrich -run TestIdentifySeries -count=1
```
<!-- /wf:probe -->

#### Scenario: A busy row is deferred with nothing written

- **WHEN** the row's lease is held by a worker while identify runs
- **THEN** the answer reports deferred 1, the document is byte-identical —
no anchor write and no strip — and a retry after the lease frees lands
<!-- wf:probe id=cf33047694193cb1 -->
```bash
set -e
go test ./internal/enrich -run TestIdentifySeries -count=1
```
<!-- /wf:probe -->

#### Scenario: Unknown series, unknown source, and malformed bodies write nothing

- **WHEN** the identify route targets an unknown series id, names a source
that is not loaded, or carries an empty external_id
- **THEN** the answers are `404`, `400`, and `400` respectively with the
canonical error body, and no document changes in any of the three cases
<!-- wf:probe id=7039a7931ea43277 -->
```bash
set -e
go test ./internal/api -run TestSeriesIdentify -count=1
```
<!-- /wf:probe -->

#### Scenario: The identify flow holds across the pipeline

- **WHEN** the identify PUT runs against the real graph — server, shikimori
subprocess, and a stub upstream carrying a different anime under the picked
id
- **THEN** the anchored leg fetches `GET /api/animes/{picked_id}`, the fresh
namespace reflects the picked anime's facts, and the served series keeps its
display name
<!-- wf:probe id=0b49adc00de64a1d -->
```bash
set -e
go test ./internal/itest -run TestIdentifyMatchJoint -count=1
```
<!-- /wf:probe -->
