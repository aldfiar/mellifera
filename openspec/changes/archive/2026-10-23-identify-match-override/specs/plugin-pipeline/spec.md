# Spec Delta

## ADDED Requirements

### Requirement: Interactive source search

The MetadataSource capability SHALL expose an interactive, operator-driven
search beside the four-RPC enrichment chain: `SearchSpecs` takes a free-text
query and an optional kind and returns the request spec to fetch under the
SAME anonymous-tier contract as BuildRequest — the application User-Agent,
the declared `min_interval_ms`, no secret material, {placeholder} substitution
only, and a bounded result page. `SearchResults` takes the same query plus
the fetched outcome and returns the candidate list. The core SHALL execute
the search spec through the same fetch point and per-plugin pacing gate as
enrichment fetches — plugins stay HTTP-free. Each candidate SHALL carry
`external_id`, `title`, optional `russian_title`, `year`, `kind`, `episodes`,
and optional `poster`, verbatim from the source: the plugin SHALL NOT
re-score, re-order, or pad the list beyond what the source served. A plugin
that does not implement search SHALL answer through the SDK's
unsupported-search base so the surface can refuse honestly.

#### Scenario: The service declares the interactive search pair

- **WHEN** the MetadataSource service definition is inspected and the
generated plugin contract builds
- **THEN** the service declares SearchSpecs and SearchResults beside the four
enrichment RPCs, the candidate message carries external_id, title, optional
russian_title, year, kind, episodes, and optional poster, and the generated
Go contract compiles
<!-- wf:probe id=3a7fb93ffc0e5457 -->
```bash
set -e
grep -q "rpc SearchSpecs" proto/mellifera/metadata/v1/metadata.proto
grep -q "rpc SearchResults" proto/mellifera/metadata/v1/metadata.proto
grep -q "message SearchCandidate" proto/mellifera/metadata/v1/metadata.proto
go build ./proto/... ./pkg/sdk/...
```
<!-- /wf:probe -->

#### Scenario: The search spec carries the anonymous-tier contract

- **WHEN** SearchSpecs runs for the query "aria" and, separately, with the tv
kind
- **THEN** the spec targets the bounded anime search endpoint with the title
substituted, carries the application User-Agent, declares min_interval_ms
700, references no secret variables, and the kind narrows the filter only
when present
<!-- wf:probe id=2cbc8a29bd170392 -->
```bash
set -e
go test ./plugins/shikimori -run TestSearchSpecs -count=1
```
<!-- /wf:probe -->

#### Scenario: Candidates return in the source's served order

- **WHEN** SearchResults receives a multi-anime search-list payload
- **THEN** the candidates carry external_id, title, russian_title, year,
kind, episodes, and poster exactly where the payload carries them, in the
payload's order — nothing re-scored, re-ordered, or padded
<!-- wf:probe id=4a5c4bf08a3fd5ec -->
```bash
set -e
go test ./plugins/shikimori -run TestSearchResults -count=1
```
<!-- /wf:probe -->

#### Scenario: A source without search answers unsupported

- **WHEN** SearchSpecs is called on a plugin that embeds the SDK's
unsupported-search base
- **THEN** the call fails with the sentinel unsupported-search error and no
request spec is built
<!-- wf:probe id=22941d1d8d1ccdc6 -->
```bash
set -e
go test ./plugins/serial-parser -run TestSearchUnsupported -count=1
go test ./pkg/sdk -run TestUnsupportedSearch -count=1
```
<!-- /wf:probe -->

#### Scenario: The additive guards re-anchor at the sanctioned baseline

- **WHEN** the repo's additive proto guards run after this change's
sanctioned proto edit
- **THEN** the guard pins name this change as the sanctioning baseline and
the guard tests pass against the re-pinned sha
<!-- wf:probe id=67e300875b4f5bbd -->
```bash
set -e
grep -q "identify-match-override" internal/itest/qa_pipeline_regression_test.go
grep -q "identify-match-override" internal/itest/qa_image_regression_test.go
go test ./internal/itest -run 'TestQA_AdditiveContract_ProtoAndDepsUnchanged|TestB2_Ac3Additive' -count=1
```
<!-- /wf:probe -->
