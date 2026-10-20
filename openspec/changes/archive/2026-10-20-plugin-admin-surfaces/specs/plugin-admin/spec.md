# Spec Delta

## Purpose

Gives operators one read-only observability surface over the loaded plugin set: the
refreshable-sources list that scopes the refresh-metadata pickers to custom enrichment
sources, per-plugin config bindings as configured, the host-captured last logs, and the
served health and gate state — admin-gated throughout, with the plugin subprocess
contract untouched.

## ADDED Requirements

### Requirement: Refreshable sources presentation

The library surfaces' module block SHALL carry an additive `refresh_sources` list: the
module's `display.title_source_priority` entries that have a modeled metadata-source
binding, whose plugin is loaded, and whose effective gate resolution is enabled, in
config order, each entry carrying the plugin id and its effective enabled flag (always
true). The display composition walk SHALL ignore the list — title composition behavior
SHALL be byte-identical with and without it. Local infrastructure plugins (parsers,
frame grabbers) and scanners SHALL never appear: only plugins the config names as title
sources do.

#### Scenario: The serial module serves exactly its loaded, enabled title sources

- **WHEN** the library detail serves the module block for a serial library whose module declares serial-parser, frame-grabber, and shikimori in its metadata chain with only shikimori in `title_source_priority`, all three plugins loaded, and a library gate muting one unrelated source
- **THEN** `refresh_sources` is exactly `[{id: "shikimori", enabled: true}]` — the local parser and frame grabber and the scanner appear in `parsers` as before but never in `refresh_sources`, and a module whose title sources name an unloaded plugin omits that plugin from the list

<!-- wf:probe id=1c1dab77a80e2531 -->
```bash
set -e
go test ./internal/api -run TestLibraryDetailPresentation -count=1
```
<!-- /wf:probe -->

### Requirement: Host-side plugin log capture

The plugin host SHALL capture each plugin subprocess's stderr into a bounded per-plugin
ring buffer — the tail wins, oldest lines drop first, each line clamped to a fixed
maximum length — shared across restarts of the same plugin so the last lines survive a
crash-restart. The capture SHALL be host-side observation only: the plugin contract
(proto, SDK, plugin implementations) MUST stay untouched, and reading the captured tail
SHALL return a copy that cannot corrupt the ring.

#### Scenario: The ring keeps the tail and clamps long lines

- **WHEN** more lines are written to one plugin's ring than it holds, among them one line longer than the clamp
- **THEN** the oldest lines are gone, the remaining lines read in write order oldest-first with the over-long line stored clamped, and the returned slice is a copy the caller can mutate without affecting the ring

<!-- wf:probe id=f38838b4b9336498 -->
```bash
set -e
go test ./internal/plugin -run TestLogRing -count=1
```
<!-- /wf:probe -->

#### Scenario: Capture survives a restart

- **WHEN** a plugin's subprocess writes lines, exits, the manager relaunches it (the launch fake), and the new subprocess writes further lines
- **THEN** the plugin's captured tail carries the union — the earlier lines first — because the ring is per plugin, never cleared between launches

<!-- wf:probe id=f70ed77f86ce96c6 -->
```bash
set -e
go test ./internal/plugin -run TestManagerLogs -count=1
```
<!-- /wf:probe -->

### Requirement: Admin plugins aggregate

`GET /api/v1/admin/plugins` SHALL return one read-only row per loaded plugin in boot
order: the plugin id, its operator-facing display name and description, its declared
capability types, its health snapshot (state, message, restart count, last-checked
time) when the health closure reported the plugin, its effective module-scope enabled
verdicts — the same gate resolution the sources aggregate serves, keyed by module id,
absent when no module binds the plugin as a metadata source — and its config bindings,
one row per module binding: the binding kind (`scanner` or `metadata`), and for
metadata bindings the chain priority, the config-enabled flag, the auth mode and
display fields when declared, plus the options JSON exactly as configured for every
binding. The endpoint SHALL be admin-gated like the other admin routes; a nil closure
SHALL answer 503; closure or store errors SHALL answer 500. It SHALL write nothing.

#### Scenario: The aggregate carries scanner and metadata plugins with their config

- **WHEN** GET /admin/plugins answers on a store whose serial module binds serial-scanner as its scanner and serial-parser, frame-grabber, and shikimori as metadata sources with priorities and options
- **THEN** every loaded plugin renders in boot order with health and capability chips, the shikimori row carries its module verdict and a metadata binding with priority, enabled, and its options JSON verbatim, the serial-scanner row carries a scanner binding with its options and no chain fields, and no stored data changes

<!-- wf:probe id=ff293933e074fc83 -->
```bash
set -e
go test ./internal/api -run TestAdminPlugins -count=1
```
<!-- /wf:probe -->

#### Scenario: The aggregate is admin-gated

- **WHEN** the endpoint is called without admin credentials
- **THEN** it is refused with the same role error the other admin endpoints answer

<!-- wf:probe id=dba497c843f5b188 -->
```bash
set -e
go test ./internal/api -run TestAdminPlugins -count=1
```
<!-- /wf:probe -->

### Requirement: Plugin logs endpoint

`GET /api/v1/admin/plugins/{plugin_id}/logs` SHALL return the plugin's captured tail,
oldest line first, as `{plugin_id, lines}`. An unknown plugin id SHALL answer 400 with
nothing served; a nil closure SHALL answer 503; a closure error SHALL answer 500. The
endpoint SHALL be admin-gated like the aggregate.

#### Scenario: The endpoint serves the captured tail

- **WHEN** the endpoint is called for a plugin whose log closure carries captured lines
- **THEN** the response lists those lines oldest-first under the plugin's id

<!-- wf:probe id=35c9a9d6a5f1aa67 -->
```bash
set -e
go test ./internal/api -run TestAdminPluginLogs -count=1
```
<!-- /wf:probe -->

#### Scenario: Unknown plugin is rejected

- **WHEN** the endpoint names a plugin id that is not loaded
- **THEN** the answer is 400 and no log body is served

<!-- wf:probe id=c0f06700ef3126b6 -->
```bash
set -e
go test ./internal/api -run TestAdminPluginLogs -count=1
```
<!-- /wf:probe -->

#### Scenario: Captured logs surface end-to-end

- **WHEN** the real plugin harness launches a plugin subprocess that writes stderr lines and the logs route is served through the production closure wiring
- **THEN** the served `lines` match the host-captured tail oldest-first — the same bytes the manager's ring holds for that plugin

<!-- wf:probe id=2b3470f315808c4a -->
```bash
set -e
go test ./internal/itest -run TestPluginLogsJoint -count=1
```
<!-- /wf:probe -->
