# Design

## Context

The refresh endpoint (`POST /libraries/{id}/refresh`, enrich_admin.go) already validates
its `plugin_id` against loaded plugins WITH a metadata-source binding
(`newReenrichClosure` + `hasMetadataBinding`), but the SPA pickers feed it
`module.parsers` — the scanner plus every metadata binding — so the operator is offered
scanner and local-parser choices the endpoint rejects. Capability type alone cannot
express the user's split: serial-parser and frame-grabber declare the SAME
`metadata_source` capability as shikimori (cmd/mellifera/main.go load sites). What does
distinguish "custom plugins like shikimori" is config, not code: the display block's
`display.title_source_priority` is the module config's own declaration of the
operator-visible enrichment sources (serial: `[shikimori]`; tv: `[kinopoisk, tmdb]`;
image: none), and `Module.TitleSourcePriority` is already a modeled, Go-consumed input
(plugin-title-enrichment).

Other constraints this design works inside: the api package-level export budget sits at
its cap of 12 (all new api surface must be unexported or methods — the sourceAdminSource
and titleSourceBinding precedents); api must not import module/enrich/plugin (INV2/INV4 —
cmd-side Deps closures with primitive-typed returns are the established seam, per the
sourceResolution parallel-slices comment); the plugin contract is frozen (proto 0 ·
pkg/sdk 0 · plugins/ 0); go-plugin is v1.8.0, whose `ClientConfig.Stderr io.Writer` is
the subprocess stderr sink; `Manager` already tracks per-plugin state
(`serving|degraded|not_serving|failed`) with a launch-fake seam for restart tests.

## Goals / Non-Goals

**Goals:**

- Refresh pickers offer exactly the custom (title-source) plugins — grounded in module
  config, not name matching — and never offer a choice the endpoint would reject.
- One read-only page answering: what plugins exist, how is each configured, what did it
  last say, does it work (working / errored / disabled).
- Last logs captured host-side from existing subprocess plumbing, bounded, restart-
  survivor, contract-frozen.

**Non-Goals:**

- No plugin runtime load/stop (`Manager.List()` stays Phase-2; boot catalog is the set).
- No gate toggles on the new page — the Sources surface owns gating; the Plugins page
  renders the served verdicts read-only.
- No log persistence (no store table): the ring is in-memory; a server restart empties
  it. Honest limitation, stated on the surface's copy.
- No config editing, no chain reorder, no display-walk changes (the composition walk
  ignores `refresh_sources` by construction).

## Decisions

**D1 — The picker filter ground is a served `refresh_sources` list, computed cmd-side.**
`ModulePresentation` gains additive `RefreshSources []titleSourceBinding` +
`AddRefreshSource` (the AddTitleSource pattern: unexported element type, method
constructor — the export count stays at 12). The cmd closure appends
`TitleSourcePriority` entries that (a) have a modeled `MetadataSourceBinding`, (b) whose
plugin id is in `loadedCaps` (loaded), and (c) whose `enrich.ResolveGates` resolution is
enabled — config order, always `enabled: true` on the wire. Rejected alternatives:
capability-type filter (includes serial-parser/frame-grabber — not the user's split);
`auth_mode` presence (inverted signal: shikimori — external — has none, kinopoisk/tmdb
do); name string-matching (brittle, forbidden); client-side join of `title_sources` ×
`/admin/sources` healths (`/admin/sources` is admin-role and the join is client-side
gate resolution — INV-no-client-gates). Only effectively-enabled sources are offered: a
refresh of a dormant source would strip its namespace and re-derive nothing.

**D2 — Both refresh pickers become dropdowns of that list.** The Manage overlay section
and the per-item Refresh view render a Select (the ui Select the Sources page already
uses) of `refresh_sources`; empty list → designed empty state with a disabled trigger.
The preview-consent flow (D-7: no drift picture, no kickoff) is unchanged — the preview
endpoint is plugin-generic. The per-item view is included because it is the same
"refresh metadata" choice surface at row scope, and the user's rule names the plugins,
not the screen. (Flagged at GATE 1; overlay-only is the fallback scope.)

**D3 — Log capture is a bounded per-plugin ring in the Manager, wired as the go-plugin
Stderr sink.** `defaultLaunch` sets `ClientConfig.Stderr` to the entry's ring writer;
the ring buffers partial chunks into lines (go-plugin delivers stderr in arbitrary
chunks), clamps each line (2 KiB), keeps the tail (256 lines), and is per `pluginEntry`
— never cleared on restart, so a crash-restart's history survives. `Manager.Logs(id)`
returns a copy. Contract untouched: no proto/sdk/plugins change; quiet plugins simply
serve an empty tail. In-memory only (Non-Goal: persistence).

**D4 — The plugins aggregate is a new read-only endpoint with unexported DTOs and
primitive-typed closures.** `GET /admin/plugins` composes the existing closure set plus
one new `Deps.PluginConfigs` closure returning parallel slices (module ids, kinds,
priorities, enableds, auth modes, options JSON strings) — the sourceResolution
precedent, forced by the export cap (cmd cannot construct an api-unexported struct).
Options are embedded verbatim as `json.RawMessage` rows; api never parses config
semantics (INV4). Effective verdicts are module-scope only (the per-library granularity
stays on the Sources aggregate, which already serves it).

**D5 — The state vocabulary is served-data presentation.** The SPA maps the served
health state (`serving` → working; `failed`/`not_serving` → errored with the message;
`degraded` → its own word) and the served module verdicts (a muted module → a disabled
chip). No new state store, no client-side resolution — the same
consume-served-verdicts posture as the Sources surface.

**D6 — Reachability: sidebar row + admin tab row.** Sidebar gains a Plugins NavLink
beside Admin (`/admin/plugins`); the three admin pages' shared `AdminTab` row gains the
third tab. Route joins `App.tsx` under the existing `RequireAuth` + `Shell` wrap.

## Interfaces (cross-group seams)

- `api.Deps` additions (primitive-typed, cmd-constructed):
  - `PluginConfigs func(ctx context.Context, pluginID string) ([]string, []string, []int, []bool, []string, []string, error)` — parallel slices: moduleIDs, kinds (`scanner`|`metadata`), priorities, configEnableds, authModes, optionsJSON strings; unknown plugin → error.
  - `PluginLogs func(ctx context.Context, pluginID string) ([]string, error)` — oldest-first tail.
- Wire (unexported Go DTOs, mirrored verbatim in `api.ts`):
  - `GET /api/v1/admin/plugins` → `{plugins: [{plugin_id, name, description, capabilities: [], health?: PluginHealth, effective?: {modules: {module: bool}}, config: [{module_id, kind, priority?, enabled?, auth_mode?, display_fields?, options?}]}]}`.
  - `GET /api/v1/admin/plugins/{plugin_id}/logs` → `{plugin_id, lines: []}`.
- `api.ModulePresentation` — additive `refresh_sources` wire field `[{id, enabled}]`,
  constructed via `AddRefreshSource(id, enabled)`; composition walk untouched.
- `plugin.Manager` — `Logs(pluginID string) ([]string, error)` (unknown id → error);
  ring caps: 256 lines, 2 KiB clamp per line.
- Routes: `r.Get("/admin/plugins", ...)` + `r.Get("/admin/plugins/{plugin_id}/logs", ...)`
  inside the existing admin requireRole group.

## Risks / Trade-offs

- [A plugin bound as a title source but unloaded (kinopoisk/tmdb) silently shrinks the dropdown] → intended: an unloaded source cannot serve a refresh; the empty state explains it. tv libraries show an empty dropdown until such plugins exist.
- [Options JSON may one day carry secrets (auth_mode SERVER is designed, unbuilt)] → the surface is admin-gated and renders operator-set config; redaction arrives with the secret-bearing config itself, before SERVER mode ships.
- [go-plugin may interleave chunk boundaries across writes] → the ring buffers partial chunks until newline or clamp, so lines reassemble; worst case a truncated line, never a corrupted ring.
- [Ring memory] → hard caps (256 × 2 KiB per plugin × 7 plugins) bound it regardless of plugin chattiness.
- [In-memory logs lost on server restart] → stated on the surface; persistence is a deliberate Non-Goal until a need is shown.

## Migration Plan

No store migration (no tables). Landing regenerates OpenAPI + embedded web dist via the
dev-time `make web-build`; the Go gate stays node-free. Rollback = revert; the additive
`refresh_sources` field and the two new routes carry no cross-version state.

## Open Questions

- GATE 1: confirm the picker rule applies to BOTH refresh pickers (encoded default) and
  that the plugins page stays read-only (Sources keeps the toggles).
