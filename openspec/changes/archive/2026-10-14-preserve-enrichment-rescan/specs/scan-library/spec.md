# scan-library Delta

## ADDED Requirements

### Requirement: Enrichment namespaces survive re-scan

An item re-scan SHALL decide derived-state carry-forward by a two-tier
unchanged test against the prior document. Tier A — the parsed identity
unchanged: the re-scan SHALL carry the prior document's entire derived state
forward verbatim — every namespace outside the identity base (`sources`,
`_provenance`, `_view`, `_stages`, `identifiers`, `streams`) — alongside the
freshly assembled `{parsed, ffprobe}` base, and SHALL preserve the prior
status. Tier B — the parsed identity unchanged but the ffprobe blob changed:
the re-scan SHALL preserve the prior status and carry the derived namespaces
EXCEPT `streams`, which it SHALL drop so changed media repackages under the
packaged-playback frontier; the ffprobe blob itself refreshes verbatim. The
identity base is compared per tier: tier A keys on `parsed` ONLY (the verbatim
ffprobe blob flips on scanner toolchain drift — new keys, re-serialized
floats, creation_time — so keying enrichment carry on it would mass-wipe
enrichment on scanner upgrades), tier B keys on `parsed` + `ffprobe`
byte-identically with the packaged-playback re-scan contract, whose streams
carry is unchanged by this requirement. A re-scan whose parsed identity
changed SHALL drop every derived namespace and advance the row to `stale`.
The enrich queue's derivation is unchanged by this contract: a preserved
namespace is present, so no `(item, plugin)` work is derived for it.

#### Scenario: Unchanged re-scan carries every derived namespace

- **WHEN** an enriched item's library is re-scanned with the item's file untouched
- **THEN** the persisted document carries `sources`, `_provenance`, `_view`, `_stages`, and `identifiers` byte-equivalent to the pre-rescan document alongside the fresh `parsed`/`ffprobe` base, and the row keeps its prior status

<!-- wf:probe id=5fd765a27058d9b2 -->
```bash
set -e
grep -q 'func TestRescanCarriesEnrichmentNamespaces(' internal/scan/carry_test.go
go test ./internal/scan -run '^TestRescanCarriesEnrichmentNamespaces$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Ffprobe-only drift keeps enrichment and drops streams

- **WHEN** a re-scan's refreshed ffprobe blob differs from the prior document's while the parsed identity is equal
- **THEN** the document keeps the derived namespaces except `streams` (absent after the re-scan), the ffprobe blob is refreshed, and the row keeps its prior status

<!-- wf:probe id=348a18b28a6f6d87 -->
```bash
set -e
grep -q 'func TestFfprobeDriftKeepsEnrichmentDropsStreams(' internal/scan/carry_test.go
go test ./internal/scan -run '^TestFfprobeDriftKeepsEnrichmentDropsStreams$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Parsed change drops every derived namespace

- **WHEN** a re-scan's parsed identity differs from the prior document's
- **THEN** the persisted document carries only the freshly assembled base (no prior namespace survives) and the row advances to `stale`

<!-- wf:probe id=2ca79ddc897ac0f5 -->
```bash
set -e
grep -q 'func TestChangedParsedDropsDerivedNamespaces(' internal/scan/carry_test.go
go test ./internal/scan -run '^TestChangedParsedDropsDerivedNamespaces$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Enriched library survives a rescan end-to-end

- **WHEN** a serial library enriched to `ready` through real plugin subprocesses against a hermetic stub upstream is re-scanned with no file changes and the queue settles
- **THEN** every series and episode document carries its namespaces, `_provenance`, `_view`, and the shikimori identifier byte-equivalent to the pre-rescan documents, the rows still read `ready`, and the stub upstream records zero new requests (the queue derived no re-work for preserved namespaces); `_stages` is byte-equivalent EXCEPT truthful `skipped` entries the enrich queue appends per derive pass for plugin×row shapes whose plugin contractually never writes a namespace (frame-grabber on series, shikimori on episodes — pre-existing queue behavior outside this contract's scope)

<!-- wf:probe id=0149c43a097537b4 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required for the joint rescan fixture"; exit 1; }
grep -q 'func TestRescanPreservesEnrichmentJoint(' internal/itest/qa_rescan_preservation_test.go
go test ./internal/itest -run '^TestRescanPreservesEnrichmentJoint$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Changed content re-derives after rescan end-to-end

- **WHEN** one item's content changes between scans (its parsed identity changes) and the library is re-scanned to a settled queue
- **THEN** that item's derived namespaces were dropped at the re-scan and re-derived through the real chain, while the untouched items keep their carried namespaces and the stub upstream records requests only for the re-derived work

<!-- wf:probe id=c745fa4309da6e75 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required for the joint rescan fixture"; exit 1; }
grep -q 'func TestRescanPreservesEnrichmentJoint(' internal/itest/qa_rescan_preservation_test.go
go test ./internal/itest -run '^TestRescanPreservesEnrichmentJoint$' -count=1
```
<!-- /wf:probe -->
