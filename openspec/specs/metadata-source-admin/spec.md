# metadata-source-admin Specification

## Purpose
Lets operators control which metadata sources enrich and name titles — per
module and per Collection — through an admin surface, with dormant semantics
that never destroy enriched data.

## Requirements

### Requirement: Source preference storage with inherit semantics

The store SHALL persist per-source operator gates in a sparse control table
keyed `(module_id, library_id, plugin_id)` where `library_id` 0 denotes module
scope. An ABSENT row SHALL mean inherit; a module-scope row SHALL apply to
every library of the module that carries no library-scope row of its own. The
gates SHALL live OUTSIDE the module config blob — a schema-guarded config
migration MUST never rewrite operator state — and the store SHALL enforce at
most one row per `(module_id, library_id, plugin_id)`.

#### Scenario: A library gate overrides the module gate

- **WHEN** a plugin is disabled at module scope and separately enabled at one library's scope
- **THEN** that library resolves the source enabled while every other library of the module resolves it disabled, and the module config blob is byte-identical before and after

<!-- wf:probe id=ae5cb6d3f0337e7f -->
```bash
set -e
go test ./internal/store -run TestMetadataSourcePrefs -count=1
```
<!-- /wf:probe -->

#### Scenario: Clearing a library gate reverts to inherit

- **WHEN** the library-scope gate row is deleted
- **THEN** the library reverts to the module-scope resolution on the next read

<!-- wf:probe id=52adf392d8ac83f5 -->
```bash
set -e
go test ./internal/store -run TestMetadataSourcePrefs -count=1
```
<!-- /wf:probe -->

### Requirement: Dormant source semantics

A gated metadata source SHALL be dormant in scope: excluded from enrichment
derivation AND from display-title composition for the scoped rows. Gating
SHALL retain the plugin's existing document namespace, `_provenance` and
`_view` entries byte-identical, SHALL never touch `doc.identifiers`, and SHALL
never purge data — purge remains the explicit Refresh action. Clearing the
gate SHALL restore composition on read and derivation through the queue
without any rescan.

#### Scenario: A dormant source composes nothing and retains its namespace

- **WHEN** a series row enriched by the shikimori source sits in a library whose shikimori gate is set, and the row is served
- **THEN** the document still carries the full `sources.shikimori` namespace with its provenance and view entries, and the served display_name composes from the next title source in the module's priority — never from the dormant namespace

<!-- wf:probe id=5cc9472ed43c03d8 -->
```bash
set -e
go test ./internal/itest -run TestSourceGateJoint -count=1
```
<!-- /wf:probe -->

#### Scenario: Clearing the gate restores derivation and composition without a rescan

- **WHEN** the gate is cleared (or the module gate flips back to enabled) and the queue wake runs
- **THEN** rows lacking the source's namespace re-derive it without any scan call, and the served display_name composes from the restored source on the next read

<!-- wf:probe id=905754511525b27e -->
```bash
set -e
go test ./internal/itest -run TestSourceGateRestore -count=1
```
<!-- /wf:probe -->

### Requirement: Admin sources aggregate

The admin API SHALL expose `GET /api/v1/admin/sources`, a read-only aggregate
of every loaded plugin: the plugin id, its localized display name and
description, its health snapshot (state, message, restart count, last-checked
time), its declared capabilities, per-module chain positions, and the
effective-enabled resolution per module and per library. Per-plugin title
counts SHALL be computed on demand from the stored documents when the request
asks for them (an O(all-rows) read, admin-only, never stored). The endpoint
SHALL be admin-gated like the existing admin surface.

#### Scenario: The aggregate reports chain position and resolved gates

- **WHEN** GET /admin/sources answers on a store carrying one module-scope disable and one library-scope override
- **THEN** the response lists the shikimori source with its serial-chain position, the module resolution disabled, the overriding library enabled, and health plus capability chips per plugin

<!-- wf:probe id=42d6776a7c6b00ee -->
```bash
set -e
go test ./internal/api -run TestAdminSources -count=1
```
<!-- /wf:probe -->

#### Scenario: The aggregate is admin-gated

- **WHEN** the endpoint is called without admin credentials
- **THEN** it is refused with the same role error the other admin endpoints answer

<!-- wf:probe id=dba497c843f5b188 -->
```bash
set -e
go test ./internal/api -run TestAdminSources -count=1
```
<!-- /wf:probe -->

### Requirement: Module-scope enable/disable endpoint

`PATCH /api/v1/admin/sources/{plugin_id}` with body `{enabled}` SHALL write
the module-scope gate for the named plugin. On enable it SHALL notify every
library of the affected modules so the queue re-derives, and the response
SHALL carry the queued count; on disable it SHALL notify nothing. An unknown
plugin SHALL answer 400 and nothing SHALL be written.

#### Scenario: Disabling then enabling a source module-wide

- **WHEN** PATCH disables shikimori module-wide and later re-enables it
- **THEN** the disable wakes no derivation and the enable wakes every affected library without any scan call, each write answering with its queued count

<!-- wf:probe id=d419f8d5db567374 -->
```bash
set -e
go test ./internal/api -run TestAdminSourcePatch -count=1
```
<!-- /wf:probe -->

#### Scenario: Unknown plugin is rejected

- **WHEN** PATCH names a plugin id that is not loaded
- **THEN** the answer is 400 with no gate written

<!-- wf:probe id=6deb81404aea5313 -->
```bash
set -e
go test ./internal/api -run TestAdminSourcePatch -count=1
```
<!-- /wf:probe -->

### Requirement: Per-Collection source gates

`PUT /api/v1/libraries/{id}/sources/{plugin_id}` with body `{enabled}` SHALL
write the library-scope gate; `DELETE` SHALL remove it (clear-to-inherit). An
unknown library SHALL answer 404; an unknown plugin SHALL answer 400; in both
error cases nothing SHALL be written.

#### Scenario: Library gate PUT and DELETE roundtrip

- **WHEN** PUT disables the source for one library, then DELETE clears it, and separately an unknown library id is named
- **THEN** the library resolves the source disabled while the gate stands and back to the module resolution after the delete, and the unknown id answers 404 with nothing written

<!-- wf:probe id=742b32daea84adaa -->
```bash
set -e
go test ./internal/api -run TestLibrarySourceGate -count=1
```
<!-- /wf:probe -->

### Requirement: Composition preview

`POST /api/v1/admin/sources/preview` SHALL run the production composer TWICE
over the same requested rows — the before pass under the live gates and the
after pass under the hypothetical gate vector in the request body — and SHALL
return both name sets symmetrically. Rows whose after-composition floors for
want of any namespace SHALL carry the `no_data` marker. The preview SHALL
write nothing.

#### Scenario: Symmetric before and after with a no_data floor

- **WHEN** the preview runs for a library whose rows carry shikimori titles under a hypothetical shikimori disable
- **THEN** the before names equal the served display_names, the after names show the composition floored past the gated source, rows with no other title source carry no_data, and no stored document changes

<!-- wf:probe id=425a21c495069e5a -->
```bash
set -e
go test ./internal/api -run TestSourcePreview -count=1
```
<!-- /wf:probe -->
