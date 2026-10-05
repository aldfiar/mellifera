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
The system SHALL expose `POST /api/v1/libraries` accepting
`{module_id, root_path, display_name}` and persisting a library, and
`GET /api/v1/items?library={id}` returning the persisted items of a library
with pagination. Each handler SHALL be pure delegation: parse request → one
domain call → write response.

#### Scenario: create-library-and-list-items
- **WHEN** an operator creates a library pointing at a directory of TV-named media files, triggers a scan, and lists the library's items
- **THEN** the item list contains every discovered file, each carrying its parsed identity and probe data in its document

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
