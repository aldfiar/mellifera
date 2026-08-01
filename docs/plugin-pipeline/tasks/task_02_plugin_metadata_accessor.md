# Task 02 — internal/plugin: MetadataSource typed accessor + caps-driven launch

- **Type:** coder
- **Step:** 2
- **Seams:** S2 (enrich↔plugin typed accessor)
- **AC trace:** AC-2, AC-3
- **Project scope:** `.` (root; package `internal/plugin`)
- **Deps:** Task 01 (consumes `sdk.MetadataSource` + `sdk.MetadataSourcePlugin`)
- **Estimated LOC:** ~90 (S)

## behaviors

- **B1** `Manager.MetadataSource(pluginID, capabilityID string) (sdk.MetadataSource, error)` mirrors `Manager.Scanner` (`manager.go:175`): errors if not loaded / not serving / no live connection / capability not declared; returns the live typed client. | ac: AC-2 | kind: normal
- **B2** The launch path builds the go-plugin client `PluginSet` from the plugin's DECLARED capabilities (`e.caps`), mapping each `Capability.Type` to its dual-side adapter (`"scanner"`->`sdk.ScannerPlugin`, `"metadata_source"`->`sdk.MetadataSourcePlugin`); `dispense` populates BOTH `runningPlugin.scanner` and `runningPlugin.metadata` for whichever capabilities the plugin declares (nil for the rest). | ac: AC-2 | kind: normal
- **B3** base-scanner (scanner-only, declares `[{Type:"scanner"}]`) launches and dispenses IDENTICALLY to today — no behavior change (AC-3). tv-parser (declares `[{Type:"metadata_source"}]`) dispenses a live `sdk.MetadataSource`. | ac: AC-2, AC-3 | kind: normal
- **B4** `internal/plugin` exported symbols rise 9->10 WARN (only `MetadataSource` is new exported; `hasMetadataCapability`, the `runningPlugin.metadata` field, and the `metadataSourcePluginKey` const are unexported). | ac: AC-2 | kind: normal

## invariants

- **INV-typed (INV1):** No reflect, no `protobuf.Any`, no generic `Call`. `MetadataSource` is the second typed per-capability accessor (`internal/plugin/doc.go:14-19`).
- **INV-caps-driven:** The client `PluginSet` is built ONLY from `e.caps` (the declarations passed to `Load`). A plugin is never asked to serve a capability it did not declare. The accessor's `hasMetadataCapability` gate mirrors `hasScannerCapability` (`manager.go:196-203`).
- **INV-ac3-base-scanner:** base-scanner's PluginSet under caps-driven launch is `{scannerPluginKey: &sdk.ScannerPlugin{}}` — byte-for-byte the same map as today's hardcoded one (`lifecycle.go:251`), so its launch/dispense/Scanner-accessor path is unchanged.
- **INV-dispense-key-independence:** go-plugin binds gRPC services by fully-qualified service name; the client PluginSet keys are LOCAL dispense handles only (`manager.go:32-35` comment). Key the metadata adapter by its own constant (`metadataSourcePluginKey = "metadata_source"`); do NOT reuse `scannerPluginKey`.

## precondition

`internal/plugin` ships the typed `Manager.Scanner` accessor and a launch path that hardcodes the scanner-only PluginSet. `sdk.MetadataSource`/`sdk.MetadataSourcePlugin` exist after Task 01.
- evidence: `internal/plugin/manager.go:175-192` (`Manager.Scanner` to mirror); `:116-121` (`runningPlugin` struct — add `metadata sdk.MetadataSource`); `:196-203` (`hasScannerCapability` to mirror for `hasMetadataCapability`).
- evidence: `internal/plugin/lifecycle.go:242-264` (`defaultLaunch` — `goplugin.PluginSet{scannerPluginKey: &sdk.ScannerPlugin{}}` at `:251` is the line to make caps-driven); `:265-283` (`dispense` — `proto.Dispense(scannerPluginKey)` + `raw.(sdk.Scanner)` at `:276-280` is the scanner-only populate to generalize).
- evidence: `internal/plugin/doc.go:20-31` (9-symbol API list + INV1 to extend to 10).

## postcondition

`Manager.MetadataSource` returns a live `sdk.MetadataSource` for a serving plugin that declared a `metadata_source` capability. `defaultLaunch` builds the client PluginSet from `e.caps`; `dispense` populates `rp.scanner` and `rp.metadata` (each nil unless declared+served). `manager_test.go` extends with a `MetadataSource` accessor test (in-process fake plugin via `sdk.Serve` like the existing scanner test). base-scanner's existing `Scanner` accessor test still passes unchanged. `check.sh` OK at 10 symbols.

## test_seed

Extend `internal/plugin/manager_test.go`: table test for `Manager.MetadataSource` covering (not-loaded / not-serving / cap-not-declared / success) — mirrors the existing `Scanner` accessor test rows. Add a test-fake plugin that serves `metadata_source` (second impl of `sdk.MetadataSource`, R8) OR reuse the `testdata/fakeplugin` pattern. Assert base-scanner-style scanner-only plugins still dispense via `Scanner` and that `MetadataSource` errors for them.

## callers_to_update

- `internal/plugin/doc.go` — the `# Public API (9 symbols)` block (`doc.go:20-31`) and INV1 (`doc.go:34-36`) MUST list `MetadataSource` (10 symbols) and note the caps-driven launch.
- `internal/plugin/lifecycle.go` — `defaultLaunch` PluginSet (`:251`) + `dispense` (`:265-283`) generalized as above. (G2-driven addition: the plan's File Map listed only `manager.go`+`doc.go`; the actual hardcoded scanner-only launch at `lifecycle.go:251` MUST change or no `metadata_source` client is ever dispensed — a metadata_source accessor without a dispensed client is dead code. Recorded in `task_interactions.md` File-Map refinement.)

## allowed_imports

- `context`, `errors`, `fmt`, `sync`, `time` (stdlib, already imported)
- `os/exec`, `math/rand` (stdlib, already imported in lifecycle.go)
- `github.com/hashicorp/go-plugin` (goplugin)
- `github.com/mellifera/mellifera/pkg/sdk`
- `github.com/mellifera/mellifera/proto/mellifera/plugin/v1` (pluginv1)
- (NO `metadatav1` import needed here — the accessor returns `sdk.MetadataSource`, not the proto type; the adapter lives in pkg/sdk.)

## allowed_categories

- `stdlib`

## test_exclusions

- The accessor's error-path branches are logic and ARE tested (table test). The `hasMetadataCapability` loop mirrors the tested `hasScannerCapability` — cover via the accessor rows, no separate no-op test.

## negative_examples

- DO NOT hardcode a second fixed PluginSet entry (`{scanner:..., metadata:...}`) — a scanner-only plugin does not serve MetadataSource and dispensing it would fail. Build from `e.caps`.
- DO NOT make `MetadataSource` lazily dispense — the architecture dispenses at `Start` and holds live clients in `runningPlugin` (mirror `Scanner`).
- DO NOT return `e.rp.scanner` from `MetadataSource` — return the distinct `e.rp.metadata` client.
- DO NOT import `metadatav1` (returns `sdk.MetadataSource`).

## existing_code_snapshot

`Manager.Scanner` (`manager.go:175-192`) to mirror:
```go
func (m *Manager) Scanner(pluginID, capabilityID string) (sdk.Scanner, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.plugins[pluginID]
	if !ok { return nil, fmt.Errorf("plugin: scanner: %q not loaded", pluginID) }
	if e.state != stateServing { return nil, fmt.Errorf("plugin: scanner: %q not serving (state=%s)", pluginID, e.state) }
	if e.rp == nil { return nil, fmt.Errorf("plugin: scanner: %q has no live connection", pluginID) }
	if !hasScannerCapability(e.caps, capabilityID) { return nil, fmt.Errorf("plugin: scanner: capability %q not declared by %q", capabilityID, pluginID) }
	return e.rp.scanner, nil
}
```
`runningPlugin` (`manager.go:116-121`): add `metadata sdk.MetadataSource` field.
`defaultLaunch` PluginSet line (`lifecycle.go:251`): `Plugins: goplugin.PluginSet{scannerPluginKey: &sdk.ScannerPlugin{}},` -> built by iterating `e.caps`.
`dispense` (`lifecycle.go:267-283`): the `proto.Dispense(scannerPluginKey)` + `raw.(sdk.Scanner)` block becomes "for each declared cap, dispense+assert into the matching field".

## contract_test_scope

- **joint:** `internal/plugin MetadataSource -> internal/enrich (Task 05 consumer)` | assert: a serving plugin declaring `metadata_source` yields a non-nil `sdk.MetadataSource` whose 4 methods round-trip to the subprocess (tv-parser in Task 06 / integration Task 11). The scanner path stays intact (AC-3).

## scope_boundary

- MODIFY `internal/plugin/manager.go` (`Manager.MetadataSource` accessor + `hasMetadataCapability` + `runningPlugin.metadata` field + `metadataSourcePluginKey` const)
- MODIFY `internal/plugin/lifecycle.go` (`defaultLaunch` caps-driven PluginSet + `dispense` dual-populate)
- MODIFY `internal/plugin/doc.go` (10 symbols + INV note)
- MODIFY `internal/plugin/manager_test.go` (accessor table rows)

## out_of_scope

- `pkg/sdk/metadata.go` (Task 01)
- `internal/enrich` (Task 05 — the consumer)
- `plugins/tv-parser` (Task 06 — the real serving plugin)
- `cmd/mellifera/main.go` wiring (Task 10)
- the restart/monitor state machine (UNTOUCHED — only launch+dispense change)

## line_budget

90 (flex 1.4 — the `dispense` generalization + accessor + helper are small but the caps->adapter mapping adds lines)

## acceptance_criteria

- AC-2 (10 symbols <= 12; co-located test; build green)
- AC-3 (base-scanner scanner path byte-identical; no proto edits)

## refactoring_checklist

- `cd mellifera && go test ./internal/plugin/...` green incl. the EXISTING scanner accessor test unchanged.
- `grep -n 'scannerPluginKey' internal/plugin/*.go` still present AND `grep -n 'metadataSourcePluginKey' internal/plugin/*.go` >= 2 (const decl + use).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK at 10 symbols.
- `git diff --stat 7bcc6c9 -- proto/` empty.

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
