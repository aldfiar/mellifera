# Spec Delta

## MODIFIED Requirements

### Requirement: Library summary endpoint

The API SHALL expose `GET /api/v1/libraries/{id}/summary` (browse role group —
admin+client) returning `{library_id, items, updated_at}` where `items` is the
library's persisted, non-deleted item count and `updated_at` is the most recent
item update stamp (RFC3339, zero-value `""` when the library has no items). An
unknown id SHALL be 404 `not_found`; INVISIBLE library (a library outside the
caller's visible set) SHALL ALSO be 404 `not_found` — hidden ≡ unknown, never
a count or a 403; a non-integer id SHALL be 400
`bad_request`. The endpoint SHALL be a constant-time aggregate (SQL count/max),
not an item scan.

#### Scenario: Summary reflects counts and last update

- **WHEN** a library holds 964 items last updated 2026-10-06T21:14:00Z and the endpoint is called
- **THEN** the response is 200 with `{library_id, items: 964, updated_at: "2026-10-06T21:14:00Z"}`, an empty library reports `items: 0` with `""`, and an unknown id is 404

<!-- wf:probe id=2b30942d278fb480 -->
```bash
set -e
grep -q '/summary' internal/api/router.go
go test ./internal/api -run TestLibrarySummary
```
<!-- /wf:probe -->

#### Scenario: An invisible library answers unknown

- **WHEN** a scoped user calls the summary of a library their groups do not carry
- **THEN** the answer is 404 `not_found` with the canonical error body — indistinguishable from a nonexistent library, no count ever leaks

### Requirement: Library folders endpoint

The API SHALL expose `GET /api/v1/libraries/{id}/folders` (browse role group)
returning `{folders:[{path, items}]}` — the distinct depth-1 relative-path
prefixes (top-level files report `""`) with the number of items under each
prefix, ordered by path. An unknown id SHALL be 404; an INVISIBLE library
(outside the caller's visible set) SHALL ALSO be 404 `not_found` — hidden ≡
unknown; a non-integer id SHALL be 400. The endpoint SHALL aggregate in SQL
over the items table without loading documents.

#### Scenario: Folders list depth-1 prefixes with counts

- **WHEN** a photos library contains items under `2026/`, `nature/`, and the root, and the endpoint is called
- **THEN** the response lists one entry per prefix with its item count — `""` for root files — sorted by path, and an unknown id is 404

<!-- wf:probe id=7e1d32a64d7043ff -->
```bash
set -e
grep -q '/folders' internal/api/router.go
go test ./internal/api -run TestLibraryFolders
```
<!-- /wf:probe -->

#### Scenario: An invisible library's folders answer unknown

- **WHEN** a scoped user calls the folders of a library their groups do not carry
- **THEN** the answer is 404 `not_found` with the canonical error body — no path prefix, no count, no existence signal
