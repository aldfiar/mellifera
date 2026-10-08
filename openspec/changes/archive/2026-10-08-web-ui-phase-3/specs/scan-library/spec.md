# scan-library Delta — library description, update, summary, folders

Modifies the `scan-library` capability: libraries gain a human `description`
(create + read + update), an admin update endpoint (`PATCH
/api/v1/libraries/{id}`) whose accepted field set excludes the identity-bearing
`root_path`, and two read-only browse-group endpoints backing the
collections-first UI — `GET /api/v1/libraries/{id}/summary` (item count +
last-update stamp) and `GET /api/v1/libraries/{id}/folders` (depth-1 subfolder
counts). Scan flow, registration semantics, and the root-path guard stay
untouched.

## MODIFIED Requirements

### Requirement: Library registration via the API

The API SHALL expose `POST /api/v1/libraries` (admin only) accepting
`{module_id, root_path, display_name, description?}` — `description` is an
optional human string defaulting to `""` — and returning the created library as
`{id, module_id, root_path, display_name, description}`. The library DTO
carried by every library-returning endpoint SHALL include `description`. The
shipped validation posture is unchanged: `module_id` must be a seeded module,
`root_path` must pass the library-root path guard, and the store SHALL persist
the description on the library row.

#### Scenario: Create with and without a description

- **WHEN** `POST /api/v1/libraries` is called with `description: "Seasonal shows"` and again without the field
- **THEN** both calls create the library and return the DTO with the description persisted — `"Seasonal shows"` in the first case, `""` in the second

<!-- wf:probe id=a412a2004b1f0741 -->
```bash
set -e
grep -q 'description' internal/api/handlers.go
go test ./internal/api -run TestLibraryCreateDescription
go test ./internal/store -run TestLibraryDescriptionRoundtrip
```
<!-- /wf:probe -->

#### Scenario: create-library-and-list-items
- **WHEN** an operator creates a library pointing at a directory of TV-named media files, triggers a scan, and lists the library's items
- **THEN** the item list contains every discovered file, each carrying its parsed identity and probe data in its document

<!-- wf:probe id=8e3b5af30e95a861 -->
```bash
set -e
go test -run TestIntegrationScanLibrary .
```
<!-- /wf:probe -->

## ADDED Requirements

### Requirement: Library update via the API

The API SHALL expose `PATCH /api/v1/libraries/{id}` (admin only) accepting
`{display_name?, description?}`: present fields update the library row and the
response is 200 with the updated DTO; an absent/unknown id SHALL be 404
`not_found`; a body attempting to change `root_path` or `module_id` SHALL be
rejected with 400 `bad_request` (identity is `(library_id, relative_path)` —
moving a root re-identifies every item and is not an API operation); a non-
canonical body SHALL be 400. Handlers SHALL NOT retry or auto-correct.

#### Scenario: Rename and describe succeed

- **WHEN** `PATCH /api/v1/libraries/{id}` is called with `{display_name: "ongoing", description: "Seasonal shows still airing"}`
- **THEN** the response is 200 with the updated DTO and a following `GET /api/v1/libraries` reflects both fields

<!-- wf:probe id=7b5af9af35da650b -->
```bash
set -e
go test ./internal/api -run TestLibraryPatchUpdate
```
<!-- /wf:probe -->

#### Scenario: Immutable fields are rejected

- **WHEN** the PATCH body contains `root_path` (or `module_id`) different from the library's current value
- **THEN** the response is 400 `bad_request` with the canonical error body, the library row is unchanged, and an unknown id yields 404 `not_found`

<!-- wf:probe id=77928e420935e248 -->
```bash
set -e
go test ./internal/api -run TestLibraryPatchImmutable
```
<!-- /wf:probe -->

### Requirement: Library summary endpoint

The API SHALL expose `GET /api/v1/libraries/{id}/summary` (browse role group —
admin+client) returning `{library_id, items, updated_at}` where `items` is the
library's persisted, non-deleted item count and `updated_at` is the most recent
item update stamp (RFC3339, zero-value `""` when the library has no items). An
unknown id SHALL be 404 `not_found`; a non-integer id SHALL be 400
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

### Requirement: Library folders endpoint

The API SHALL expose `GET /api/v1/libraries/{id}/folders` (browse role group)
returning `{folders:[{path, items}]}` — the distinct depth-1 relative-path
prefixes (top-level files report `""`) with the number of items under each
prefix, ordered by path. An unknown id SHALL be 404; a non-integer id SHALL be
400. The endpoint SHALL aggregate in SQL over the items table without loading
documents.

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
