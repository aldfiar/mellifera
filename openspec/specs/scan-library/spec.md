# scan-library Specification

## Purpose

Scan-library is the foundational vertical slice of Mellifera: an operator
registers a filesystem directory as a library, triggers a scan, and a scanner
go-plugin subprocess walks the tree, probes each media file with ffprobe, and
parses filenames — while the core persists every discovered item as a
dynamic-JSON document (probe output + parsed identity fields) queryable through
the HTTP API. It proves the modular plugin architecture end-to-end and is the
backbone every later capability (enrichment, streaming) plugs into.

Seeded from the shipped scan-library slice (`docs/scan-library`); the behavior
below lives in `internal/{store,module,plugin,scan,api}`, `pkg/sdk`, and
`plugins/base-scanner`.

## Requirements

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

### Requirement: Admin-token gate on the API
The system SHALL require `Authorization: Bearer <admin_token>` on every
`/api/v1` route: a missing, malformed, or wrong token SHALL yield `401
Unauthorized` with no side effect; a valid token SHALL resolve a `Principal`
into the request context.

#### Scenario: request-without-valid-token-rejected
- **WHEN** a caller hits `POST /api/v1/libraries` with no Authorization header, a malformed header, or a wrong token
- **THEN** the server responds 401 and creates no library

### Requirement: Scanner capability served over the plugin seam
The scanner capability SHALL be delivered by a subprocess plugin speaking the
`mellifera.scanner.v1.Scanner` gRPC contract — `Scan` streaming
`DiscoveredFile`s (ffprobe JSON carried as bytes, plus resume cursor and
warnings) and `Identify` unary and pure — alongside the common
`plugin.v1.Plugin` handshake/health service over the go-plugin substrate. The
`.proto` contracts SHALL stay verbatim with `docs/architecture.md` §2.

#### Scenario: plugin-subprocess-serves-the-scan
- **WHEN** the core loads and starts the base-scanner plugin and a scan runs against its library
- **THEN** discovery streams through the subprocess's gRPC `Scan` stream and every file is identified by the same subprocess's unary `Identify`

### Requirement: Scan orchestrates store, module registry, and plugin manager
`internal/scan` SHALL resolve the library → its module's scanner binding → a
`sdk.Scanner` client from the plugin manager, drain the discovery stream,
`Identify` each file, assemble the item document, and persist it — aggregating
discovered/persisted counts and warnings into a `scan.Result`.

#### Scenario: end-to-end-golden-scan
- **WHEN** a scan runs against a fixture library of TV-named media files with ffprobe on PATH
- **THEN** each persisted item's document carries parsed title/season/episode (e.g. `title="Breaking Bad"`, `season=1`, `episode=1`) plus a non-empty ffprobe blob, and the scan response reports the persisted count

### Requirement: Idempotent re-scan
`PutItem` SHALL upsert by `file_id`: re-scanning a library SHALL NOT duplicate
rows for already-known files.

#### Scenario: rescan-does-not-duplicate
- **WHEN** the same library is scanned twice with no file changes
- **THEN** item rows are updated in place and the total item count stays stable

### Requirement: Documents are opaque dynamic JSON
The store SHALL persist each item's document as opaque JSON text — it SHALL NOT
parse the body, only `json_extract` the generated-column paths declared at
migration time (`display_title`, `display_rating`, `tmdb_id`, `kinopoisk_id`
plus indexes). Parsed identity SHALL live under well-known `parsed` keys
(title, season, episode, …) and probe output under `ffprobe`.

#### Scenario: document-shape-survives-roundtrip
- **WHEN** a scanned item is fetched back through the API
- **THEN** its document carries the parsed identity fields and the ffprobe JSON blob as persisted

### Requirement: Library-root path guard
The scanner SHALL apply a `withinRoot` check to every emitted candidate path
(before and after symlink resolution); a path escaping the configured root
SHALL yield no item and SHALL never be probed, read, or persisted. Symlink
escapes are not followed (`filepath.WalkDir`) and surface no warning.

#### Scenario: traversal-escape-yields-nothing
- **WHEN** a library contains a file reachable only via a `..` path segment or a symlink resolving outside the root
- **THEN** no item is created for it and no file outside the root is probed, read, or persisted

### Requirement: Probe failures are per-file soft fails
A file ffprobe cannot probe (zero bytes, unrecognized container) SHALL NOT abort
the scan: it SHALL be persisted with an empty ffprobe field plus a warning
entry, while valid files in the same scan carry their full probe data and the
scan completes.

#### Scenario: unprobeable-file-does-not-break-scan
- **WHEN** a scan runs over a library holding one valid media file and one unprobeable file
- **THEN** both items are persisted, the scan completes, and the unprobeable item carries an empty ffprobe field and a warning entry

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
