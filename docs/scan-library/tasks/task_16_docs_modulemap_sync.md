- [x] DOCS-1 (docs): Sync module map + ai-architecture.md §4 with the scan-library package set
  target: mellifera/docs/ai-architecture.md (§4 module map) + mellifera/.claude/skills/mellifera-build/SKILL.md (module map table) | action: UPDATE
  source_files: [mellifera/internal/scan/doc.go, mellifera/internal/plugin/manager.go, mellifera/internal/module/registry.go]
  related_tasks: [Task 07, Task 06, Task 05, Task 03]
  audience: developer
  rationale: The scan-library feature introduced `internal/scan` (NEW package not in the module map — the scan-side analog of deferred `internal/enrich`) and realized the module map's generic `plugin.Call`/`plugin.Health` names as the typed accessor `plugin.Scanner(pluginID, capID)` + `plugin.Status` (avoids the name collision with the `Health` type). The mellifera-build skill's "Adding a new module" step 6 requires syncing the module map + ai-arch §4. This is the documented wf-docs follow-up (implementation_plan.md decision log). Also document the WARN packages (store=10, plugin=9).
  content:
    - section: ai-architecture.md §4 module map — ADD internal/scan row
      points:
        - "Add `internal/scan` to the module map: Owns = scan-side orchestration (resolve module → scanner capability → stream Scan → Identify → PutItem); Public API (≤8) = `Run`, `Deps`, `Result`; Depends on = store, plugin, module."
        - "Note it is the scan-side analog of the deferred `internal/enrich` (which handles metadata-side Match→Build→Convert→Merge). Both sit at the same dependency level: `scan/enrich → {module, plugin} → store`."
        - "Dependency direction is now `api → scan → {module, plugin} → store` (scan inserted between api and {module,plugin})."
    - section: mellifera-build SKILL.md module map — sync plugin + scan rows
      points:
        - "Update the `internal/plugin` row's Public API from `Load, Start, Stop, Health, Call` to the realized typed form: `Open, Load, Start, Stop, Status, Scanner` (the generic `Call` became per-capability typed accessors; `Health`→`Status` to avoid the collision with the `Health` return type). Flag as a realized deviation (decision log)."
        - "Add the `internal/scan` row to the skill's module map (same content as ai-arch §4)."
        - "Note the WARN packages: `internal/store` (10 symbols — multiple entities) and `internal/plugin` (9 — lifecycle phases + typed accessor) are documented exceptions under the 12-fail ceiling."
    - section: Both — cross-reference scan-library
      points:
        - "Link the new rows to `docs/scan-library/` (the feature that established them)."
        - "Record that `plugins/base-scanner` ships as part of the MAIN Go module for MVP (R7 — deviation from arch §10 'plugins are separate modules', to be revisited at Phase 2)."
  verify:
    - both files updated; `internal/scan` present in both module maps
    - no broken internal links
    - the plugin API names match the realized code (`Scanner`, `Status`) — cross-check against mellifera/internal/plugin/doc.go
