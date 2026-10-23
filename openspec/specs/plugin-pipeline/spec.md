# plugin-pipeline Specification

## Purpose

Generalizes scan-library's single-plugin scan into a multi-stage, config-driven
enrichment pipeline: after discovery and base identification, each item runs
through the module's ordered `metadata_sources` chain, every metadata field is
tagged with the plugin that produced it (provenance), and every item carries a
queryable lifecycle status. The core stays a media-type-agnostic orchestrator;
all parsing lives in plugins. Seeded from docs/plugin-pipeline (shipped as feat(plugin-pipeline) Phase A).

## Requirements

### Requirement: Config-driven enrichment chain
The system SHALL run each discovered item through the `metadata_sources` list
configured on its module, in `priority` order, serially within an item. Plugin
selection SHALL come from module config only; core orchestration code SHALL NOT
branch on media-type literals.

#### Scenario: Chain follows module config priority
- **WHEN** a scan runs against a library whose module lists `tv-parser` in `metadata_sources` (priority 1)
- **THEN** the enrichment chain resolves its plugins strictly from `Module.MetadataSources`, not from any media-type check in core code

### Requirement: Metadata source capability (plugin SDK)
The plugin SDK SHALL expose a `MetadataSource` capability — a typed client
interface over the four-RPC chain Match→BuildRequest→Convert→Merge — plus a
dual-side go-plugin adapter so a plugin can serve it via `sdk.Serve` and the
core can call it via a typed gRPC client.

#### Scenario: Four-RPC chain drives a metadata source plugin
- **WHEN** the orchestrator enriches an item with a configured metadata source
- **THEN** it dispatches Match, BuildRequest, Convert, and Merge over gRPC to the plugin subprocess, and Merge results land in that plugin's `sources.<plugin_id>` document namespace

### Requirement: Typed capability routing in the plugin manager
The plugin manager SHALL provide a typed `MetadataSource(pluginID, capabilityID)`
accessor returning an `sdk.MetadataSource` client. The system SHALL NOT use
generic call, reflection, or `protobuf.Any` for capability dispatch.

#### Scenario: tv-parser subprocess is routed by capability
- **WHEN** the manager is asked for the `metadata_source` capability of the loaded `tv-parser` plugin
- **THEN** it returns a typed gRPC client to the crash-isolated subprocess, obtained the same way as the `scanner` capability accessor

### Requirement: Item lifecycle status
Every persisted item SHALL carry a core-managed, media-type-agnostic `status`
in `{new, pending, parsed, enriched, failed, deleted}`. The orchestrator SHALL
advance status per stage via a pure transition function; illegal transitions
SHALL be rejected. (`ready` and `stale` are surfaced for Phase B, not built.)

#### Scenario: Successful enrichment advances to enriched
- **WHEN** all configured enrichment sources for an item complete without failure
- **THEN** the item's status advances `new → pending → parsed → (pending) → enriched`, with `enriched` the terminal-success state

#### Scenario: Hard failure advances to failed
- **WHEN** a pipeline stage hard-fails for an item
- **THEN** the item's status becomes `failed` carrying a last error, instead of aborting the scan

### Requirement: Status storage
The store SHALL persist `status` as a column on `items` with default `new`
(idempotent, additive migration) and an index on it. The store SHALL remain the
sole SQL owner of the column; existing scan-library rows SHALL remain queryable
with the default status.

#### Scenario: Store filters items by status
- **WHEN** `QueryItems` is called with a non-empty status filter
- **THEN** only items whose `status` matches are returned; an empty filter returns all statuses

### Requirement: Item status over the API
The items list endpoint SHALL accept an optional `status` query filter and SHALL
include an additive `status` field on every returned item. An unknown status
value SHALL NOT be an error — it SHALL return an empty list.

#### Scenario: Filter enriched items over HTTP
- **WHEN** `GET /api/v1/items?status=enriched` is called
- **THEN** only items whose `status` is `enriched` are returned, each carrying its `status` field, and existing clients ignoring the new field are unaffected

### Requirement: Field provenance in the document
The enrichment pipeline SHALL record, per enriched item: lossless per-source
data under `sources.<plugin_id>`; a `_provenance.<field_path>` entry
(plugin_id, plugin_version, fetched_at, confidence) per enriched field; a
recomputable `_view.<field>`; and a `_stages[]` per-stage progress trail.
Provenance SHALL be queryable from the stored document.

#### Scenario: Provenance names the contributing plugin
- **WHEN** a TV item enriched by tv-parser is read back from the store
- **THEN** its document contains `sources.tv-parser.{title,season,episode}`, a `_provenance` entry naming `tv-parser` per field, a `_view` projection, and a `_stages` trail — all extractable via `json_extract`

### Requirement: Namespace enforcement
A plugin SHALL write only into its own `sources.<plugin_id>` namespace; the
orchestrator SHALL reject and revert any foreign-namespace write, record the
violation, and NOT abort the scan.

#### Scenario: Foreign namespace write is rejected
- **WHEN** a metadata source attempts to write into another plugin's `sources.<other>` namespace
- **THEN** the write is reverted, the stage is recorded as failed, and the item remains persisted at the furthest valid state

### Requirement: Soft-fail enrichment
A failing or missing enrichment source SHALL NOT abort the scan. Its failure
SHALL be recorded in `_stages` and in the run's warnings; the item SHALL still
be persisted with whatever upstream stages produced and SHALL advance to the
furthest valid state.

#### Scenario: Unavailable source does not abort the scan
- **WHEN** a module lists two enrichment sources and one cannot run
- **THEN** the scan succeeds, the failure is recorded as a stage failure plus a warning, and the item persists advancing only to the state its successful stages reached (e.g. `parsed`)

### Requirement: Parser extraction from the base scanner
The base scanner SHALL be discovery plus media-type-agnostic base
identification only; media-specific parsing SHALL live in metadata_source
plugins. The TV parser SHALL be served by the `tv-parser` plugin (logic moved
verbatim from the base scanner), with the scanner Identify wire shape unchanged.

#### Scenario: TV fields come only from the tv-parser plugin
- **WHEN** a file like `Show.Name.S01E02.1080p.mkv` is scanned
- **THEN** base-scanner emits no `season`/`episode` fields, and the TV parse appears solely via tv-parser's `sources.tv-parser` namespace

### Requirement: Additive compatibility with scan-library
Phase A SHALL be additive: the scanner and plugin proto services, the scanner
SDK surface, and existing routes SHALL be unchanged on the wire; the `items`
table gains only the defaulted `status` column.

#### Scenario: Shipped scan-library contract unbroken
- **WHEN** the pipeline feature lands on a scan-library installation
- **THEN** existing proto/store/API surfaces still work as shipped — existing items read with default status, `GET /items` works without the filter, and base-scanner still serves scanner discovery

### Requirement: Core-side fetch execution with per-plugin pacing

The orchestrator SHALL execute a metadata source's HTTP fetch server-side
at the reserved fetch point between BuildRequest and Convert: validate the
returned request spec (method GET/POST; every {placeholder} resolvable
from `variables`); substitute {placeholder} values with percent-encoding;
honor `timeout_seconds`; and enforce `min_interval_ms` per plugin so
consecutive sends to the same plugin are spaced at least the declared
interval — a per-plugin gate owned by the core process, constructed at
process wiring (not a package global), with an injectable clock for tests
and pacing independent across plugins — per the request-spec contract that
the core enforces `min_interval_ms` server-side. The fetch result SHALL
populate ConvertRequest `raw_response`, `http_status`, and
`response_headers`. A spec referencing a `redacted_ref` variable SHALL
fail the source run with an explicit unsupported error and no network
attempt (client-held-secret execution is contract-present but unbuilt).

#### Scenario: Fetch populates the convert inputs

- **WHEN** a source's BuildRequest returns a valid GET spec without redacted_ref variables and the source runs to Convert against a stub HTTP upstream
- **THEN** ConvertRequest carries the fetched body verbatim, the HTTP status code, and the response headers

<!-- wf:probe id=43065bee968f0723 -->
```bash
set -e
go test ./internal/enrich -run TestFetchSource
```
<!-- /wf:probe -->

#### Scenario: Sends to one plugin are paced by min_interval_ms

- **WHEN** two source runs for the same plugin fetch back-to-back and the spec declares `min_interval_ms` 700
- **THEN** the second send starts at least 700 ms after the first when measured on the injectable clock, while a different plugin's fetch is not delayed by that interval

<!-- wf:probe id=8894bdce3560a269 -->
```bash
set -e
go test ./internal/enrich -run TestFetchSource
```
<!-- /wf:probe -->

#### Scenario: redacted_ref variables fail explicitly as unsupported

- **WHEN** a source's request spec references a `redacted_ref` variable
- **THEN** the source run fails with an explicit unsupported error, no HTTP request is made, and the failure surfaces through the normal soft-fail path

<!-- wf:probe id=1085e0d6f24c9e1d -->
```bash
set -e
go test ./internal/enrich -run TestFetchSource
```
<!-- /wf:probe -->

#### Scenario: timeout_seconds bounds the fetch

- **WHEN** a stub upstream stalls longer than the spec's `timeout_seconds`
- **THEN** the fetch aborts at the timeout and the source run records a failure instead of hanging the worker

<!-- wf:probe id=91148741538f4add -->
```bash
set -e
go test ./internal/enrich -run TestFetchSource
```
<!-- /wf:probe -->

### Requirement: Identity anchoring across enrich runs

The orchestrator SHALL read the document's `identifiers` object into
`MatchRequest.existing_ids` before dispatching Match, and SHALL write a
successful `MatchResult.resolved_ids` back into the document's
`identifiers` — a core-side write outside plugin namespace enforcement
(namespace validation polices only the plugin's Merge output). A first
enrichment SHALL pass empty `existing_ids`.

#### Scenario: Anchored re-match feeds stored ids to Match and persists resolved ids

- **WHEN** a source runs for a document already carrying `identifiers.shikimori_id`, and its Match succeeds with `resolved_ids`
- **THEN** MatchRequest.existing_ids carries the stored id, and after the run the document's identifiers carry the Match result's resolved_ids

<!-- wf:probe id=f233833364b389eb -->
```bash
set -e
go test ./internal/enrich -run TestIdentityAnchor
```
<!-- /wf:probe -->

#### Scenario: First enrichment runs with empty existing_ids

- **WHEN** a source runs for a document without identifiers
- **THEN** MatchRequest.existing_ids is empty, and a successful Match's resolved_ids still land in the document's identifiers

<!-- wf:probe id=2ec0808b233ba42f -->
```bash
set -e
go test ./internal/enrich -run TestIdentityAnchor
```
<!-- /wf:probe -->

### Requirement: Request plan per source run
A metadata source's BuildRequest SHALL be able to declare an ordered plan of
additional fetches beyond the primary request: BuildRequestResponse MAY carry
extra request specs, and the core SHALL execute the primary plus each extra
in order at the reserved fetch point — each spec validated and paced by the
plugin's `min_interval_ms` exactly like the primary — and SHALL deliver each
extra's outcome to Convert as an aligned fetched-response list (body, http
status, headers, and a fetched flag carrying the error when the fetch
failed). A failed extra SHALL NOT fail the source run: the run proceeds with
the responses it has and Convert decides what the namespace gains (the
soft-fail posture). The primary request's failure path is unchanged.

#### Scenario: Extra specs are fetched and delivered in order

- **WHEN** BuildRequest declares one extra spec and the source runs
- **THEN** the core fetches the primary and then the extra, and
ConvertRequest carries the extra's body, status, and headers aligned after
the primary's

<!-- wf:probe id=3100aa62f043cfcb -->
```bash
set -e
go test ./internal/enrich -run TestRequestPlan
```
<!-- /wf:probe -->

#### Scenario: A failed extra fetch soft-fails the plan

- **WHEN** an extra spec's fetch fails while the primary succeeds
- **THEN** the source run continues, the extra's entry reports not-fetched
with the error, Convert runs with the primary response, and the namespace
gains only what Convert builds from what arrived

<!-- wf:probe id=92a6f85507ac63a2 -->
```bash
set -e
go test ./internal/enrich -run TestRequestPlan
```
<!-- /wf:probe -->

#### Scenario: Pacing spans the whole plan

- **WHEN** a plan of primary plus one extra runs for a plugin declaring
min_interval_ms
- **THEN** the extra's send starts at least the declared interval after the
primary's on the injectable clock

<!-- wf:probe id=e1b29038e92d1278 -->
```bash
set -e
go test ./internal/enrich -run TestRequestPlan
```
<!-- /wf:probe -->

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
<!-- wf:probe id=1661b76634439fa1 -->
```bash
set -e
grep -q "episode-titles" internal/itest/qa_pipeline_regression_test.go
grep -q "episode-titles" internal/itest/qa_image_regression_test.go
go test ./internal/itest -run 'TestQA_AdditiveContract_ProtoAndDepsUnchanged|TestB2_Ac3Additive' -count=1
```
<!-- /wf:probe -->

### Requirement: Per-episode convert output

The MetadataSource convert contract SHALL let Convert return per-episode
contributions beside the run's own namespace: ConvertResult MAY carry
episode-title entries, each naming the source's episode number for the entry
(the episode's number within the matched series' season) and the namespace
fields for THAT episode (the convention episode fields only). The core SHALL
wrap `metadata` into the run document's namespace exactly as before and SHALL
hand the entries to the enrichment router; the entries SHALL never appear
inside the run document's own namespace. The contract change SHALL be
additive — no existing message, RPC, or field changes meaning — and a
conversion that returns no entries runs unchanged.

#### Scenario: Entries ride beside the run namespace, never inside it

- **WHEN** Convert returns the run metadata plus per-episode entries for an
anchored series run
- **THEN** the run document's namespace wraps the metadata exactly as
before, the entries travel in the additive episode-titles field, and no
entry's fields appear inside the run document's namespace

<!-- wf:probe id=402ef845bdb2e5ce -->
```bash
set -e
go test ./internal/enrich -run TestEpisodeTitleRouting -count=1
```
<!-- /wf:probe -->
