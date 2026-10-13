## MODIFIED Requirements

### Requirement: Scan orchestrates store, module registry, and plugin manager
`internal/scan` SHALL resolve the library → its module's scanner binding → a
`sdk.Scanner` client from the plugin manager, drain the discovery stream,
`Identify` each file, assemble the item document, and persist it — aggregating
discovered/persisted counts and warnings into a `scan.Result`. The core SHALL
distinguish a scanner stream that ended with a confirmed clean completion from
one that did not: a stream that ends before completing — a mid-stream failure,
or a stream that reports no terminal state — SHALL be surfaced as a warning in
the scan Result (never a scan error), and the pass SHALL NOT run the post-drain
work (no series sweep, no enrichment-queue handoff). The gRPC/proto wire
contracts SHALL stay verbatim.

#### Scenario: end-to-end-golden-scan
- **WHEN** a scan runs against a fixture library of TV-named media files with ffprobe on PATH
- **THEN** each persisted item's document carries parsed title/season/episode (e.g. `title="Breaking Bad"`, `season=1`, `episode=1`) plus a non-empty ffprobe blob, and the scan response reports the persisted count

#### Scenario: A stream that ends before completing surfaces a warning, not a silent clean drain
- **WHEN** the scanner stream terminates on its own before completing — the channel closes with no clean-completion confirmation and no context cancellation — and the scan finishes
- **THEN** the scan reports no error, its Result warnings name the incomplete stream, nothing is handed to the enrichment queue, and the persisted counts reflect only what the partial pass actually persisted

<!-- wf:probe id=41ea7b5924cd8344 -->
```bash
set -e
go test ./internal/scan -run TestTruncatedStreamWarnsIncomplete
```
<!-- /wf:probe -->

#### Scenario: A mid-stream failure is distinguishable from a clean end-of-stream
- **WHEN** a scanner stream breaks mid-flight, and separately when it ends cleanly, over the plugin transport
- **THEN** the core-side stream reports the mid-flight failure as its terminal error, the clean end as a confirmed clean completion, and an unconfirmed close never reads as clean

<!-- wf:probe id=c7583e056fbcda8b -->
```bash
set -e
go test ./pkg/sdk/
```
<!-- /wf:probe -->

#### Scenario: A gRPC stream that breaks mid-flight never reaches the post-drain pass
- **WHEN** a scan drains a real scanner gRPC client whose stream breaks mid-stream over a serial library holding a series the partial pass never observed
- **THEN** the scan result carries the truncation warning, reports no error, and no series row advances to `deleted`

<!-- wf:probe id=d9c1c7d081cf3601 -->
```bash
set -e
go test ./internal/scan -run TestJointTruncatedGRPStreamDoesNotSweep
```
<!-- /wf:probe -->
