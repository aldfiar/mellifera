# serial-library Delta

## MODIFIED Requirements

### Requirement: Series identity and re-scan semantics

A series SHALL be identified by `(library_id, relative_path)` — the directory path
within the library. An unchanged re-scan — the series' parsed identity facts equal
to the prior document's — SHALL preserve the prior series status (a `ready` series
is not regressed) and SHALL carry the prior document's entire derived state forward
verbatim (every namespace outside the identity base: `sources`, `_provenance`,
`_view`, `_stages`, `identifiers`); the persisted document is the freshly assembled
`{parsed, ffprobe}` base plus the carried namespaces. A re-scan whose serial
identity facts changed SHALL advance the series to `stale` and drop every derived
namespace; a re-scan whose parsed identity is unchanged but whose ffprobe blob
changed SHALL preserve the prior status and carry the derived namespaces while the
ffprobe blob refreshes verbatim (directory-backed series persist an empty ffprobe
object, so this case arises only for file-backed records). A serial directory that
vanished SHALL have its series row advanced to `deleted` by a post-drain sweep; a
serial directory that was renamed or moved SHALL become a NEW series identity and
the old row SHALL be swept to `deleted`, with no automatic migration of enrichment
data. The post-drain sweep SHALL run ONLY after the scanner stream ended with a
confirmed clean completion: a scan whose stream did not end cleanly — a cancelled
context, a stream that terminated on its own before completing, or a stream that
reports no terminal state — SHALL NOT sweep and SHALL NOT hand off to the
enrichment queue. A series re-observed by a scan while its row is at `deleted`
SHALL leave `deleted` — `ready` when its serial identity facts are unchanged (a
wrongful tombstone heals on the rescan that re-observes the directory), `stale`
when they changed; a `deleted` row that a pass did not re-observe keeps `deleted`.
Enrichment of a re-created identity re-runs from scratch under the same namespace
rules.

#### Scenario: Unchanged rescan preserves a ready series

- **WHEN** a `ready` series' library is re-scanned with the directory unchanged
- **THEN** the series row keeps status `ready` and its document carries the prior derived namespaces (`sources`, `_provenance`, `_view`, `_stages`) verbatim alongside the fresh `parsed`/`ffprobe` base

<!-- wf:probe id=34fbd0d5302da3cd -->
```bash
set -e
go test ./internal/scan -run '^TestSeriesUnchangedRescanPreservesReady$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Ffprobe-only drift preserves a file-backed series' enrichment

- **WHEN** a file-backed series' library is re-scanned and the record's ffprobe blob differs from the prior document's while its parsed identity facts are unchanged
- **THEN** the series row keeps its prior status, its derived namespaces survive verbatim, and the ffprobe blob is refreshed

<!-- wf:probe id=3803283174c0f651 -->
```bash
set -e
grep -q 'func TestSeriesFfprobeDriftPreservesDerived(' internal/scan/series_test.go
go test ./internal/scan -run '^TestSeriesFfprobeDriftPreservesDerived$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Renamed directory yields a new series and deletes the old

- **WHEN** a serial directory is renamed between scans and the library is re-scanned to a clean drain
- **THEN** a new series row exists under the new path with status `pending`, the old row is `deleted`, and no metadata was copied across identities

<!-- wf:probe id=98e1dd00be30a3aa -->
```bash
set -e
go test ./internal/scan -run TestSeriesRenameNewIdentity
```
<!-- /wf:probe -->

#### Scenario: Cancelled scan does not sweep

- **WHEN** a re-scan of a serial library is cancelled before the stream drains
- **THEN** no series row is advanced to `deleted`, even for directories the partial stream never saw

<!-- wf:probe id=eb2ddd730ebd00ae -->
```bash
set -e
go test ./internal/scan -run TestCancelledScanDoesNotSweep
```
<!-- /wf:probe -->

#### Scenario: A stream that ends without completing does not sweep

- **WHEN** a serial library is re-scanned and the scanner stream terminates on its own before completing — the channel closes with no clean-completion confirmation and no context cancellation — after re-observing only part of the library
- **THEN** no series row the partial pass did not re-observe advances to `deleted` (the unobserved rows keep their prior status), and the scan reports no error

<!-- wf:probe id=f2ddf8f24c53232e -->
```bash
set -e
go test -run TestTruncatedStreamMustNotSweep ./internal/scan/
```
<!-- /wf:probe -->

#### Scenario: A re-observed deleted series heals on rescan

- **WHEN** a serial library is re-scanned and a series row at status `deleted` is re-observed
- **THEN** the row leaves `deleted` — `ready` when its serial scanned facts are unchanged and `stale` when they changed — while a `deleted` row the pass did not re-observe keeps `deleted`

<!-- wf:probe id=10894af4d44c3a67 -->
```bash
set -e
go test ./internal/scan -run TestSeriesReobservedDeletedSelfHeals
```
<!-- /wf:probe -->
