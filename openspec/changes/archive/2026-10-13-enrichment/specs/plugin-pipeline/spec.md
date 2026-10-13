## ADDED Requirements

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
