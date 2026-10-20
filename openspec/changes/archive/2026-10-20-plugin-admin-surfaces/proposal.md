# Proposal

## Why

The refresh-metadata pickers offer the module's whole parser chain — scanner and local
parsers included — even though the refresh endpoint only accepts metadata-bound plugins,
so the operator is offered choices that 400. And there is no operator page answering the
basic fleet questions: which plugins exist, how is each one configured, what did it last
say, and does it work. The health pieces exist (PluginHealth, /admin/sources) but are
scattered across sources-shaped surfaces; config and logs have no surface at all.

## What Changes

- `ModulePresentation` gains an additive `refresh_sources` list: the module's
  `display.title_source_priority` entries ∩ modeled bindings ∩ loaded plugins ∩
  effectively-enabled — the config's own declaration of the operator-visible enrichment
  sources. The display composition walk is untouched.
- The TWO refresh-metadata pickers — the Manage overlay's Refresh metadata section and
  the per-item Refresh view — become dropdowns fed by the served `refresh_sources`
  (default/local plugins like serial-parser and frame-grabber disappear from them; a
  module with no refreshable source renders its empty state). The preview-consent flow
  is unchanged.
- New read-only admin surface over the loaded plugin set: `GET /admin/plugins` (boot
  identity, capability chips, health snapshot, effective module-scope gate verdicts, and
  per-module config bindings with options JSON verbatim) and `GET
  /admin/plugins/{plugin_id}/logs` (the host-captured stderr tail). Admin-gated, Deps-
  closure pattern, api export budget unchanged (all DTOs unexported / methods).
- Host-side log capture: the plugin manager wires each subprocess's stderr into a
  bounded per-plugin ring (tail wins, survives restarts); `Manager.Logs` exposes it; the
  plugin CONTRACT is untouched (capture from the existing subprocess plumbing).
- SPA: a Plugins admin page beside Collections and Sources — state chips (working /
  errored / disabled composed from the SERVED health state and gate verdicts), config
  bindings read-only, per-plugin last-logs view; reachable from the sidebar and the
  admin pages' tab row; endpoint allowlist grows by the two new routes.

Not in scope (settled defaults, flagged at GATE 1): plugin runtime load/stop
(`Manager.List()` stays Phase-2), gate toggles on the new page (Sources owns gating),
log persistence beyond the in-memory ring (no store table; a server restart empties
it), config editing from the page, chain reorder editing.

## Capabilities

### New Capabilities

- `plugin-admin`: operator control and observability over the loaded plugin set — the
  refreshable-sources presentation feeding the refresh pickers, the plugins aggregate
  and logs endpoints, and the host-side bounded log capture.

### Modified Capabilities

- `web-ui`: the two refresh-metadata pickers become dropdowns of the served
  `refresh_sources` (Manage overlay section + per-item Refresh view); the endpoint
  allowlist gains `GET /admin/plugins` and `GET /admin/plugins/{plugin_id}/logs`; a new
  Plugins admin surface requirement; the sidebar navigation gains the Plugins row.

## Impact

- `internal/api` — additive `ModulePresentation.RefreshSources` + `AddRefreshSource`
  (unexported element type reused; the package-level export count stays at its 12 cap);
  two new handlers + unexported DTOs in a new `plugin_admin.go`; two `Deps` func fields
  (`PluginConfigs`, `PluginLogs`, primitive-typed per the sourceResolution precedent);
  router: the two routes join the admin requireRole group. INV2/INV4 hold (no module/
  enrich/plugin imports).
- `cmd/mellifera` — the ModulePresentation closure filters `TitleSourcePriority` through
  `loadedCaps` + gate resolution; new `PluginConfigs` closure (bindings assembled over
  module.Registry, options embedded as raw JSON strings) and `PluginLogs` closure
  (delegating to `Manager.Logs`).
- `internal/plugin` — a bounded line-oriented ring writer per plugin entry, wired as the
  go-plugin `ClientConfig.Stderr` sink at launch (not cleared on restart); `Manager.Logs`
  accessor; no contract files touched — **proto 0 · pkg/sdk 0 · plugins/ 0**.
- `web/src` — `api.ts` clients + wire mirrors (allowlist), `Collection.tsx` both pickers,
  new `pages/admin/Plugins.tsx` + route in `App.tsx`, `Sidebar.tsx` Plugins row, admin
  tab rows on the three admin pages.
- OpenAPI + embedded web dist regenerate at LANDING (dev-time `make web-build`), never
  inside a box probe.
