# Task Interactions — plugin-pipeline (Phase A)

> Cross-task dependency/conflict map. Single project (`.`/root) — no cross-project
> table needed. Read with `task_index.md`.

## Symbol Ownership

| Symbol / artifact | Owner task | Consumer tasks | Shared? | Notes |
|---|---|---|---|---|
| `sdk.MetadataSource` / `sdk.MetadataSourcePlugin` | T01 | T02, T05, T06 | yes (capability contract) | the typed metadata_source interface + dual-side adapter |
| `plugin.Manager.MetadataSource` (accessor) + caps-driven launch | T02 | T05, T10, T11 | yes | `runningPlugin.metadata` field + `metadataSourcePluginKey` are unexported |
| `module.MetadataSourceBinding` / `Module.MetadataSources` | T03 | T05 | yes | config-driven chain source (AC-4) |
| `store.Item.Status` field + `QueryItems(...,status,...)` | T04 | T08, T09, T11 | yes | signature MODIFY (internal); `?status=` additive |
| **status string set** `{new,pending,parsed,enriched,failed,deleted}` | **T05** (`enrich.nextState`) | T04 (column DEFAULT 'new' literal), T08 (passthrough), T09 (echo) | **yes — cross-task invariant** | T05 OWNS the values; store is value-agnostic; ALL tasks use the exact lowercase literals |
| `enrich.Enrich` / `enrich.Deps` / `enrich.Result` | T05 | T08, T10 | yes | T10 constructs `enrich.Deps`; T08 calls `Enrich` |
| `scan.Deps.Enrich` field | T08 | T10 | yes | exported FIELD (not a symbol); T10 sets it |
| `parseTV` + helpers + 4 regexes | T06 (destination) | T07 (delete source), T11 (probe) | move | verbatim `base-scanner/tvparse.go` -> `tv-parser/tvparse.go` |
| tv-parser `metadata_source` capability declaration | T06 | T02 (dispense), T10 (Load caps) | yes | `{Type:"metadata_source",ID:"default",ProtoService:"mellifera.metadata.v1.MetadataSource"}` — must match across T06 handshake + T10 Load |

## Order Dependencies

| Task | Must complete before | Reason |
|---|---|---|
| T01 | T02, T05, T06 | defines `sdk.MetadataSource`/adapter |
| T02 | T05, T10, T11 | accessor + caps-driven launch (else metadata_source never dispenses) |
| T03 | T05, T08 | `Module.MetadataSources` read by enrich/scan |
| T04 | T08, T09, T11 | `Item.Status` + `QueryItems` signature |
| T05 | T08, T10, T11 | `enrich.Enrich`/`Deps` |
| T06 | T07, T10, T11 | tv-parser binary exists (T07 deletes the base-scanner copy only AFTER the move) |
| T07 | T11 | extraction probes; base-scanner agnostic |
| T08 | T10, T11 | scan drives enrich |
| T09 | T11 | api status |
| T10 | T11 | full graph boots |
| T01..T10 | T11 | integration golden needs the whole pipeline |
| T11 | T12, T13 | QA runs after the pipeline is green |
| (T12, T13, T14, T15) | — | independent; docs/QA run after coder (reviewer/QA phase) |

**Suggested run order:** T01, T03, T04 (parallel roots) -> T02 -> T05 -> T06 -> T07 -> T08 -> T09 -> T10 -> T11 -> (review) -> T12, T13 -> T14, T15.

## Potential Conflicts

| Tasks | Shared file / concern | Risk | Mitigation |
|---|---|---|---|
| T04 ↔ T09 | `internal/api/handlers.go:124` (QueryItems call) | T04's signature change breaks the call; both edit it | T04 does the mechanical `""` fix (build-green); T09 replaces `""` with the parsed `?status=`. T09 runs AFTER T04. |
| T04 ↔ T11 | `integration_test.go`, `qa_resilience_test.go` (QueryItems calls) | signature break | T04 applies the mechanical `""` arg; T11 reconciles assertions. |
| T06 ↔ T07 | `plugins/base-scanner/tvparse.go` | T07 deletes it; T06 must have created the copy first | hard dep T06 -> T07 (ordering enforced). |
| T02 ↔ T10 | `internal/plugin` launch + `cmd` Load caps | the Load `caps` must match what the caps-driven launch expects | both use `sdk.Capability{Type:"metadata_source",...}`; T06's Handshake declares the same. Cross-check in T11. |
| T05 ↔ T08 | `enrich.Enrich` signature / `enricher` seam | signature drift breaks scan | T08's `enricher` seam mirrors `enrich.Enrich`'s return `(map[string]any, string, enrich.Result, error)`. |
| T08 ↔ T10 | `scan.Deps.Enrich` field | T10 must set the field T08 adds | T08 adds the field; T10 sets it (both shipped before T11). |

## Circular Dependencies

**None found.** Direction is strictly downward: `api -> scan -> enrich -> {module, plugin} -> store`; `pkg/sdk` + `proto/` are shared leaves; `plugins/*` + `cmd/mellifera` are `package main` leaves. `internal/enrich` imports `{store,plugin,module,sdk,scannerv1,metadatav1,commonv1}` and is imported ONLY by `internal/scan` (and constructed by `cmd/mellifera`). Verified: `enrich` never imports `scan`/`api`.

## Foundational Setup — folds (own no AC, no seam)

| Item | Fold -> consuming task | Note |
|---|---|---|
| `metadata.v1`/`common.v1` already generated | precondition of T01 | no protoc run; verify they compile when imported (T01 begins importing `metadatav1`). |
| `MELLIFERA_TV_PARSER` env var | precondition of T10 (default `bin/tv-parser`) | read in `loadConfig`; T06 builds the binary. |
| `Makefile` `build-plugin` target | T06 (generalize to build both binaries) | T10/T11 depend on `bin/tv-parser` existing. |
| `go.mod` (no new deps) | (none) | all imports already present; T11 asserts `git diff --stat 7bcc6c9 -- go.mod` empty. |
| `items.status` backfill of pre-existing rows | T04 (DEFAULT 'new') | additive DEFAULT; existing scan-library rows read `'new'`. One-time backfill to `'parsed'` is OUT of scope (documented decision D-8). |

No foundational item emits its own task — all five are precondition folds (each is trivial or already-satisfied). This satisfies the "every Foundational Setup item covered" rule.

## File-Map refinements (specifier, G2-driven — grounded against live source)

1. **`internal/plugin/lifecycle.go` added to T02 scope.** The plan's File Map listed only `manager.go`+`doc.go` for the plugin accessor, but `defaultLaunch` hardcodes `goplugin.PluginSet{scannerPluginKey: &sdk.ScannerPlugin{}}` (`lifecycle.go:251`) and `dispense` populates ONLY `runningPlugin.scanner` (`lifecycle.go:265-283`). A `metadata_source` plugin (tv-parser) would never dispense without generalizing the launch to build the PluginSet from declared caps. T02 modifies `lifecycle.go` accordingly (base-scanner path stays byte-identical -> AC-3).
2. **`scan.Deps.Enrich` field (not "Run builds enrich.Deps internally").** The plan says "Deps gains an enrich field" + "main wires enrich.Deps into scan". Realized as: `scan.Deps` gains an exported `Enrich enrich.Deps` FIELD (a struct field is NOT a top-level symbol, so `internal/scan` stays at 3); `cmd/mellifera` (T10) constructs `enrich.Deps` and sets it (flat composition root). T08's `enricher` seam closes over `deps.Enrich`.
3. **`store.QueryItems` callers expanded.** G2 grep found ONE production caller (`api/handlers.go:124`) but FOUR test callers (`store_test.go`, `run_test.go`, `integration_test.go`, `qa_resilience_test.go`). T04 mechanically updates ALL to the 5-arg form (`""`=all) to keep `go test ./...` green; T09/T11 refine later. (`internal/scan/run.go` does NOT call QueryItems — the source_baseline cross-module table was slightly off; the grep is authoritative.)
4. **Status-value ownership.** Statuses are UNEXPORTED string literals owned by `enrich.nextState` (T05), NOT `store` constants (store stays at 11). The migration DEFAULT `'new'` is a literal in T04. Both must use the exact lowercase set — a cross-task invariant (table above).

## Cross-project tasks

N/A — single Go module at the repo root (`.`). All tasks share `project_scope: "."`.

## Test budget (feature-level; pyramid ~70/20/10 unit/joint/e2e for a logic-heavy service)

```json
{ "unit": 9, "joint": 5, "e2e": 2, "total": 16 }
```

- **Coder writes** the unit tests (co-located per exported symbol, `check.sh`-required) + most joint contract tests (in-task `contract_test_scope.joint`) + the T11 e2e golden.
- **QA (T12/T13) writes** against the REMAINING budget: independent e2e re-derivation (T12) + joint/structural regression (T13). Going OVER budget requires deleting redundancy first (not raising the budget).
- `state.json.test_budget` carries this for the completion gate (pipeline-control §Pyramid-Ratio Gate).
