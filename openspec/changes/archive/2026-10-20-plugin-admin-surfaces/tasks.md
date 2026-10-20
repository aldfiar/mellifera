<!-- wf: source_fingerprint=87975e51fdd0b674e2103021a1bdbfe578b9f24c7b1f404f3f261512688909aa -->
<!-- wf: initial_skip_specs=false -->
# Tasks: plugin-admin-surfaces

Four groups: refresh pickers end-to-end, plugin logs + admin plugins API, the Plugins
admin page, and QA. Dependencies: 1 and 2 are independent; 3 depends on 2 (the wire
shapes it mirrors); QA (4) depends on 2. Probe ids reference the change's spec
scenarios (`specs/*/spec.md`); box 2.5 has no dedicated scenario probe and is marked
`[unprobeable]` (accepted at GATE 2 inspection, per the wf unprobeable-tick gap).

## 1. Refresh pickers end-to-end

- [x] 1.1 Add the additive `ModulePresentation.RefreshSources` wire field (`[{id, enabled}]`, `json:"refresh_sources,omitempty"`) + the `AddRefreshSource` method (the unexported `titleSourceBinding` element type reused — the export count stays at 12) and extend the api presentation test fakes. Ticks spec scenario `1c1dab77a80e2531`. Probe: `go test ./internal/api -run TestLibraryDetailPresentation -count=1`. [probe:1c1dab77a80e2531]
- [x] 1.2 Convert the Manage overlay's Refresh metadata section to a Select dropdown of the served `module.refresh_sources` (empty list → the section's empty state with explanatory copy and a disabled trigger; the preview-consent flow unchanged); mirrors `refresh_sources` into the `api.ts` ModulePresentation type; updates `Collection.test.tsx`. Keeps the overlay's other scenarios green (same suite). Ticks spec scenario `8731478ff8246028`. Probe: `cd web && npx vitest run src/pages/collections/Collection.test.tsx`. [probe:8731478ff8246028]
- [x] 1.3 Convert the per-item Refresh view to the same dropdown (served `refresh_sources`; empty list → view empty state + disabled trigger) — the `chain` prop swap through the card/action plumbing; updates `Collection.test.tsx`. Ticks spec scenarios `d9b16926fa78011a` (new picker) and `4237edd856cd7c71` (409 copy, unchanged) — shared probe command. Probe: `cd web && npx vitest run src/pages/collections/Collection.test.tsx`. [probe:d9b16926fa78011a]

## 2. Plugin logs + admin plugins API

- [x] 2.1 Add the bounded per-plugin line ring writer to `internal/plugin` (chunk-to-line buffering, 2 KiB clamp, 256-line tail, copy-on-read) with unit tests. Ticks spec scenario `f38838b4b9336498`. Probe: `go test ./internal/plugin -run TestLogRing -count=1`. [probe:f38838b4b9336498]
- [x] 2.2 Wire the ring as the go-plugin `ClientConfig.Stderr` sink in `defaultLaunch` (per entry, never cleared across restarts) and add `Manager.Logs(pluginID) ([]string, error)`; extend the launch-fake restart tests. Ticks spec scenario `f70ed77f86ce96c6`. Probe: `go test ./internal/plugin -run TestManagerLogs -count=1`. [probe:f70ed77f86ce96c6]
- [x] 2.3 `GET /api/v1/admin/plugins` (new `plugin_admin.go`, Deps-closure pattern, unexported DTOs): boot inventory + `Deps.Status` health + capability chips + module-scope effective verdicts + `Deps.PluginConfigs` bindings (options embedded verbatim as raw JSON); nil closure → 503, closure/store error → 500; router entry in the admin requireRole group; admin-gated. Ticks spec scenarios `ff293933e074fc83` (aggregate) and `dba497c843f5b188` (gate) — shared probe command. Probe: `go test ./internal/api -run TestAdminPlugins -count=1`. [probe:ff293933e074fc83]
- [x] 2.4 `GET /api/v1/admin/plugins/{plugin_id}/logs` handler + router entry: the `Deps.PluginLogs` tail oldest-first; unknown plugin → 400, nil closure → 503, closure error → 500; admin-gated. Ticks spec scenarios `35c9a9d6a5f1aa67` (serve) and `c0f06700ef3126b6` (unknown) — shared probe command. Probe: `go test ./internal/api -run TestAdminPluginLogs -count=1`. [probe:35c9a9d6a5f1aa67]
- [ ] 2.5 Wire the cmd closures in `cmd/mellifera`: `PluginConfigs` (bindings assembled over module.Registry, options as raw JSON strings — the sourceResolution parallel-slices shape), `PluginLogs` (delegating to `Manager.Logs`), and the `refresh_sources` filter in the ModulePresentation closure (`TitleSourcePriority` ∩ modeled binding ∩ `loadedCaps` ∩ effectively-enabled, config order). In-group verified by `go build ./...`; served-contract coverage arrives via the QA joint test (group 4). [unprobeable]

## 3. Plugins admin page

- [x] 3.1 Add the `api.ts` clients + wire mirrors for the two new routes and extend the endpoint allowlist. Ticks spec scenarios `6c03f9c2829e0509` (allowlist audit) and `b60a9bba64675000` (items client mirror, unchanged) — shared probe command. Probe: `go build ./...` + the audit grep + `cd web && npx vitest run && npx tsc --noEmit` (full command lives on spec scenario `6c03f9c2829e0509`). [probe:6c03f9c2829e0509]
- [x] 3.2 New `pages/admin/Plugins.tsx` (state chips from the served health state + module verdicts, config bindings read-only with options verbatim, per-plugin on-demand last-logs view, inline canonical errors, no writes) + the `/admin/plugins` route in `App.tsx` (RequireAuth + Shell) + the AdminTab row on the three admin pages; `Plugins.test.tsx`. Ticks spec scenarios `85b1963591d79139` (state + config) and `254e34ec3a058ca6` (last logs) — shared probe command. Probe: `cd web && npx vitest run src/pages/admin/Plugins.test.tsx && npx tsc --noEmit`. [probe:85b1963591d79139]
- [x] 3.3 Sidebar Plugins row (icon + label, `/admin/plugins`, active highlight) and its test updates; keeps the profile-role scenario green. Ticks spec scenario `256315bd3250806b` (updated nav enumeration); `e11f23f0dc338749` (role probe, unchanged) stays green on the same file. Probe: `cd web && npx vitest run src/components/Sidebar.test.tsx && npx tsc --noEmit`. [probe:256315bd3250806b]

## 4. QA (joint integration — Tier 1)

- [x] 4.1 Joint itest through the real plugin harness: a subprocess writing stderr lines has its tail served byte-identical (oldest-first) through the production closure wiring and the logs route — the host→api contract in one test. Ticks spec scenario `2b3470f315808c4a`. Probe: `go test ./internal/itest -run TestPluginLogsJoint -count=1`. [probe:2b3470f315808c4a]
