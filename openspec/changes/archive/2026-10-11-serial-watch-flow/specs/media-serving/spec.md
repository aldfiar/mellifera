## ADDED Requirements

### Requirement: Sidecar serving

The item media endpoint SHALL accept `?variant=sidecar` with an `n` query
parameter: it SHALL serve the bytes of the sidecar at zero-based index `n` of
the episode document's `parsed.sidecars` list, resolved ONLY from the stored
document — an index, never a client-supplied path. The response SHALL carry a
Content-Type derived from the sidecar file's extension, a strong ETag, and
`Cache-Control: private, immutable`; `HEAD` SHALL be answered with the same
headers and no body. A missing, non-integer, or negative `n` SHALL be `400
bad_request`; an index at or beyond the document's sidecar list, a document
without sidecar facts, an unknown item, and a resolved file missing on disk
SHALL all be `404 not_found` with the canonical error body. No request SHALL
ever serve a file other than one resolved from the stored document's sidecar
facts.

#### Scenario: Sidecar bytes serve by index

- **WHEN** an authorized caller requests `?variant=sidecar&n=0` and `n=1` for an episode whose document carries two sidecar facts pointing at existing files
- **THEN** each response serves the exact bytes of the indexed sidecar with its extension-derived Content-Type, a strong ETag, and `Cache-Control: private, immutable`, and a conditional re-request with the ETag answers 304

<!-- wf:probe id=9af98ae2a9d7cc4b -->
```bash
set -e
go test ./internal/api -run TestItemMediaSidecar
```
<!-- /wf:probe -->

#### Scenario: Sidecar error edges

- **WHEN** the sidecar variant is requested with `n` missing or non-integer or negative, with an index beyond the document's sidecar list, for an episode without sidecar facts, and for a resolved file that is missing on disk
- **THEN** the first three answer `400 bad_request` and the last two answer `404 not_found`, each with the canonical error body, and no response ever serves a file outside the stored document's sidecar facts

<!-- wf:probe id=1484c98853a70d0e -->
```bash
set -e
go test ./internal/api -run TestItemMediaSidecar
```
<!-- /wf:probe -->
