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

### Requirement: TV module seed v2

The core SHALL seed the `tv` module config at `schema_version` 2, binding
`base-scanner` as scanner and the ordered metadata chain `tv-parser`
(priority 1), `kinopoisk` (2), `tmdb` (3), and `frame-grabber` (priority 4,
display fields `thumbnail`/`grabbed_at`), so tv-module films derive
frame-grabber thumbnails like serial episodes. An existing store whose seeded
`tv` row still sits at `schema_version` 1 SHALL be upgraded by a guarded
`UPDATE modules SET ... WHERE id='tv' AND schema_version < 2` run after the
`INSERT OR IGNORE` (the ignore alone never rewrites an existing row); the
upgrade SHALL be idempotent — an open against a row already at version 2 SHALL
NOT rewrite it — and SHALL touch no other module row. The enrich derivation
stays chain-driven: existing film items derive the frame-grabber namespace on
the next drain without a rescan.

#### Scenario: Fresh install seeds the v2 tv chain with the frame-grabber

- **WHEN** a fresh store opens and the `tv` module's config is resolved
- **THEN** the config binds `base-scanner` as scanner and the ordered metadata chain `tv-parser`, `kinopoisk`, `tmdb`, `frame-grabber` at priorities 1–4, with `schema_version` 2

<!-- wf:probe id=9e2727e0ab147725 -->
```bash
set -e
go test ./internal/module -run TestTvModuleSeedV2
```
<!-- /wf:probe -->

#### Scenario: A v1 tv row upgrades to v2 idempotently

- **WHEN** the registry opens against a store pre-seeded with the v1 `tv` module row, and then opens again
- **THEN** the first open rewrites the row to the v2 config with `schema_version` 2, the second open changes nothing further, and no other module row is touched

<!-- wf:probe id=d0e02977b9a60fc5 -->
```bash
set -e
go test ./internal/module -run TestOpen_TVSeedUpgradesV1Row
```
<!-- /wf:probe -->

### Requirement: Enrichment namespaces survive re-scan

An item re-scan SHALL decide derived-state carry-forward by a two-tier
unchanged test against the prior document. Tier A — the parsed identity
unchanged: the re-scan SHALL carry the prior document's entire derived state
forward verbatim — every namespace outside the identity base (`sources`,
`_provenance`, `_view`, `_stages`, `identifiers`, `streams`) — alongside the
freshly assembled `{parsed, ffprobe}` base, and SHALL preserve the prior
status. Tier B — the parsed identity unchanged but the ffprobe blob changed:
the re-scan SHALL preserve the prior status and carry the derived namespaces
EXCEPT `streams`, which it SHALL drop so changed media repackages under the
packaged-playback frontier; the ffprobe blob itself refreshes verbatim. The
identity base is compared per tier: tier A keys on `parsed` ONLY (the verbatim
ffprobe blob flips on scanner toolchain drift — new keys, re-serialized
floats, creation_time — so keying enrichment carry on it would mass-wipe
enrichment on scanner upgrades), tier B keys on `parsed` + `ffprobe`
byte-identically with the packaged-playback re-scan contract, whose streams
carry is unchanged by this requirement. A re-scan whose parsed identity
changed SHALL drop every derived namespace and advance the row to `stale`.
The enrich queue's derivation is unchanged by this contract: a preserved
namespace is present, so no `(item, plugin)` work is derived for it.

#### Scenario: Unchanged re-scan carries every derived namespace

- **WHEN** an enriched item's library is re-scanned with the item's file untouched
- **THEN** the persisted document carries `sources`, `_provenance`, `_view`, `_stages`, and `identifiers` byte-equivalent to the pre-rescan document alongside the fresh `parsed`/`ffprobe` base, and the row keeps its prior status

<!-- wf:probe id=5fd765a27058d9b2 -->
```bash
set -e
grep -q 'func TestRescanCarriesEnrichmentNamespaces(' internal/scan/carry_test.go
go test ./internal/scan -run '^TestRescanCarriesEnrichmentNamespaces$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Ffprobe-only drift keeps enrichment and drops streams

- **WHEN** a re-scan's refreshed ffprobe blob differs from the prior document's while the parsed identity is equal
- **THEN** the document keeps the derived namespaces except `streams` (absent after the re-scan), the ffprobe blob is refreshed, and the row keeps its prior status

<!-- wf:probe id=348a18b28a6f6d87 -->
```bash
set -e
grep -q 'func TestFfprobeDriftKeepsEnrichmentDropsStreams(' internal/scan/carry_test.go
go test ./internal/scan -run '^TestFfprobeDriftKeepsEnrichmentDropsStreams$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Parsed change drops every derived namespace

- **WHEN** a re-scan's parsed identity differs from the prior document's
- **THEN** the persisted document carries only the freshly assembled base (no prior namespace survives) and the row advances to `stale`

<!-- wf:probe id=2ca79ddc897ac0f5 -->
```bash
set -e
grep -q 'func TestChangedParsedDropsDerivedNamespaces(' internal/scan/carry_test.go
go test ./internal/scan -run '^TestChangedParsedDropsDerivedNamespaces$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Enriched library survives a rescan end-to-end

- **WHEN** a serial library enriched to `ready` through real plugin subprocesses against a hermetic stub upstream is re-scanned with no file changes and the queue settles
- **THEN** every series and episode document carries its namespaces, `_provenance`, `_view`, and the shikimori identifier byte-equivalent to the pre-rescan documents, the rows still read `ready`, and the stub upstream records zero new requests (the queue derived no re-work for preserved namespaces); `_stages` is byte-equivalent EXCEPT truthful `skipped` entries the enrich queue appends per derive pass for plugin×row shapes whose plugin contractually never writes a namespace (frame-grabber on series, shikimori on episodes — pre-existing queue behavior outside this contract's scope)

<!-- wf:probe id=0149c43a097537b4 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required for the joint rescan fixture"; exit 1; }
grep -q 'func TestRescanPreservesEnrichmentJoint(' internal/itest/qa_rescan_preservation_test.go
go test ./internal/itest -run '^TestRescanPreservesEnrichmentJoint$' -count=1
```
<!-- /wf:probe -->

#### Scenario: Changed content re-derives after rescan end-to-end

- **WHEN** one item's content changes between scans (its parsed identity changes) and the library is re-scanned to a settled queue
- **THEN** that item's derived namespaces were dropped at the re-scan and re-derived through the real chain, while the untouched items keep their carried namespaces and the stub upstream records requests only for the re-derived work

<!-- wf:probe id=c745fa4309da6e75 -->
```bash
set -e
command -v ffmpeg >/dev/null || { echo "ffmpeg is required for the joint rescan fixture"; exit 1; }
grep -q 'func TestRescanPreservesEnrichmentJoint(' internal/itest/qa_rescan_preservation_test.go
go test ./internal/itest -run '^TestRescanPreservesEnrichmentJoint$' -count=1
```
<!-- /wf:probe -->

### Requirement: Item tombstone sweep and self-heal

After a scanner stream ends in a confirmed clean completion, the pass SHALL sweep the library's ITEM rows in the same post-drain branch that sweeps series: every item whose status is not `deleted` SHALL have its resolved original path — the document's stamped absolute path, the same single file-location channel the direct floor serves through — checked on disk, and an item whose file is absent SHALL advance to `deleted`: the same soft-delete literal the series sweep writes, the document byte-untouched, every dependent row (progress, ledger, title overrides) preserved. The sweep SHALL judge disk truth — the stat, not the pass's observation set: a file present at its stamped path never tombstones, a file absent tombstones regardless of which pass last observed it. An item whose stamp is absent or unreadable SHALL be skipped with a warning — a missing stamp is an assembly anomaly, never evidence of a vanished file. The sweep SHALL be per-row soft-fail (a failed row check is a warning; the sweep continues; a cancelled context aborts it) and SHALL skip already-deleted rows without touching their update stamps. The item sweep SHALL run ONLY behind the same gate as the series sweep — a stream that ends before completing SHALL sweep neither series nor items. A tombstoned item whose file returns SHALL heal through the re-scan upsert exactly as a re-observed deleted series heals: a re-scan whose parsed identity is unchanged SHALL advance the row from `deleted` to `ready` with its derived namespaces carried forward, and one whose parsed identity changed SHALL advance it to `stale` — a wrongful tombstone (an offline root) and a restored file both heal on the next healthy rescan. A tombstoned item SHALL be absent from every surface that lists or joins items: the default item listing (an explicit `?status=deleted` lifecycle passthrough keeps working), series episode lists and the next-episode pick, the progress reads and the home rail (the non-deleted join), the browse/search/facet index (its walk exclusion and epoch count leg), and the item detail route (404 `not_found`) — and the enrichment derivation SHALL never dispatch a deleted row: the queue's derivation and re-enrichment sweeps read live rows only, because a dead row has nothing to enrich (stripping a tombstoned row's namespaces would damage the self-heal's namespace carry-forward); a self-healed row re-enters derivation the moment the re-scan upsert advances its status. While tombstoned, the row's playback-progress and watched-ledger rows remain stored untouched, retained for identity adoption and audit: progress feeds no served read and no scoring input, and adoption re-keys the state onto a live identity match within one rescan. The artwork garbage-collection union SHALL keep reading ALL item rows explicitly — a tombstoned item's artwork files SHALL NOT be garbage-collected while it sits tombstoned, so a self-heal or a later re-enrichment finds its posters intact.

#### Scenario: A vanished file tombstones its item on the next clean rescan

- **WHEN** a library holding an active item is re-scanned to a clean drain after the item's file was deleted from disk
- **THEN** the item's row reads status `deleted` with its document byte-unchanged and its progress and ledger rows preserved — while a clean rescan over a library whose files all exist tombstones nothing

#### Scenario: A truncated stream never sweeps items

- **WHEN** a scan's stream ends before completing over a library holding items
- **THEN** no item row advances to `deleted` — the item sweep runs only behind the same clean-drain gate as the series sweep

#### Scenario: An absent stamp skips with a warning

- **WHEN** the sweep checks an active item whose document carries no readable absolute-path stamp
- **THEN** the row keeps its prior status, the scan result carries a warning naming the item, and the sweep continues with the remaining rows

#### Scenario: A re-observed deleted item self-heals

- **WHEN** a clean rescan re-observes a tombstoned item's file at its stamped path (re-upserted by file_id)
- **THEN** the row leaves `deleted`: to `ready` with its derived namespaces carried forward when the parsed identity is unchanged, to `stale` when the identity changed

#### Scenario: Surfaces drop the tombstone while its rows survive

- **WHEN** an item tombstones
- **THEN** the default item listing omits it (an explicit `?status=deleted` still serves it), the series' episode list and next-episode pick omit it, the progress reads and the rail omit it while its progress row remains stored, and its item detail route answers 404 `not_found`

#### Scenario: A tombstoned row is never derived or re-enriched

- **WHEN** the queue derivation or a whole-library re-enrichment sweep runs over a library holding a tombstoned row whose sources still carry pending work
- **THEN** no task is derived, dispatched, or stripped for the dead row — and when a later rescan self-heals the row, it re-enters derivation on the following pass

#### Scenario: A healed item's artwork survives the tombstone

- **WHEN** an offline root returns, a clean rescan self-heals the library's tombstoned items, and the artwork settle runs over its union
- **THEN** the healed items' poster/artwork files are intact and serve again — the GC union read all rows explicitly while they sat tombstoned, so nothing was garbage-collected
