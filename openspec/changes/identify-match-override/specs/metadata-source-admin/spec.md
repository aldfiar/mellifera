# Spec Delta

## ADDED Requirements

### Requirement: Source search passthrough

`GET /api/v1/admin/sources/{plugin_id}/search?query=…&kind=…` SHALL pass an
operator's interactive search through to the named source's search
capability and answer `{candidates: [...]}` in the source's served order —
clients render the served order verbatim and never re-score. The route
SHALL sit in the admin role group and SHALL write nothing — search is
read-only against the source and every store. The named source's spec SHALL
execute through the enrichment pacing gate, so an interactive search shares
the plugin's anonymous-tier budget with background sweeps. A missing or
whitespace-only `query` SHALL be `400 bad_request`; an unknown plugin SHALL
be `400`; a source that does not implement search SHALL be `400` with the
canonical `search_unsupported` code; a failed upstream fetch SHALL surface
as the canonical inline error with retry disabled.

#### Scenario: Search passes through in the source's served order

- **WHEN** the search endpoint is asked for query "aria" against a source
whose closure returns three candidates
- **THEN** the answer is 200 carrying those candidates with their convention
fields in the served order, unchanged
<!-- wf:probe id=25131eca4343efe7 -->
```bash
set -e
go test ./internal/api -run TestSourceSearch -count=1
```
<!-- /wf:probe -->

#### Scenario: The interactive fetch rides the enrichment pacing gate

- **WHEN** the search passthrough fetches a paced plugin's spec on the
injectable clock after prior traffic for that plugin
- **THEN** the send starts at least the plugin's declared interval after the
prior slot — the same gate contract the enrichment fetches obey
<!-- wf:probe id=6af5b1890c36d52a -->
```bash
set -e
go test ./internal/enrich -run TestSearchSource -count=1
```
<!-- /wf:probe -->

#### Scenario: The route is admin-gated

- **WHEN** the route is called without a valid admin token
- **THEN** the answer is `401` with the canonical error body and no search
runs
<!-- wf:probe id=12f7ae2c59ff70c7 -->
```bash
set -e
go test ./internal/api -run TestSourceSearch -count=1
```
<!-- /wf:probe -->

#### Scenario: Validation, unsupported sources, and upstream failures answer honestly

- **WHEN** the route names an unknown plugin, carries a whitespace-only
query, targets a source without search, or the upstream fetch fails
- **THEN** the answers are `400`, `400`, `400` with the
`search_unsupported` code, and the canonical upstream error with retry
disabled — and nothing is written in any of the four cases
<!-- wf:probe id=a03dfc2d20c51b13 -->
```bash
set -e
go test ./internal/api -run TestSourceSearch -count=1
```
<!-- /wf:probe -->
