# Task 08 — internal/scan: integrate enrich between Identify and PutItem

- **Type:** coder
- **Step:** 6
- **Seams:** S6 (scan↔enrich), S7 (scan↔store status)
- **AC trace:** AC-1, AC-5, AC-6, AC-7
- **Project scope:** `.` (root; package `internal/scan`)
- **Deps:** Task 04 (`Item.Status`), Task 05 (`enrich.Enrich`/`Deps`/`Result`)
- **Estimated LOC:** ~70 (S-M)

## behaviors

- **B1** `scan.Deps` gains an `Enrich enrich.Deps` FIELD (an exported struct field — NOT a new top-level symbol; `check.sh` counts top-level decls, fields are free). The composition root (Task 10) constructs `enrich.Deps` and sets it, keeping wiring in flat main.go. | ac: AC-1 | kind: normal
- **B2** For each discovered file, scan calls `enrich.Enrich` BETWEEN `Identify` and `PutItem`: base-identify -> assemble base document -> enrich (drive the configured chain via `deps.Enrich`) -> set `Item.Status` + the enriched document -> PutItem. | ac: AC-1, AC-5 | kind: normal
- **B3** The persisted `Item.Document` carries the enriched shape (`sources`/`_provenance`/`_view`/`_stages`) and `Item.Status` is the status returned by enrich (the furthest reached state). | ac: AC-5, AC-7 | kind: normal
- **B4** enrich is injected into `runScan` via an UNEXPORTED `enricher` function-type seam (mirrors `scannerResolver` at `run.go:60`) so the in-package test injects a fake without a real subprocess; `Run` supplies the production closure `func(...) { return enrich.Enrich(ctx, deps.Enrich, ...) }`. | ac: AC-1 | kind: normal
- **B5** enrich's soft-fail `Result.Warnings` are merged into the scan `Result.Warnings` (AC-6: one bad source/file never aborts the library). | ac: AC-6 | kind: normal
- **B6** enrich's hard error (module unresolvable / ctx cancelled) propagates as the scan's error; a cancelled context takes precedence over any concurrent soft failure (`run.go:96-97,120` B6 pattern). | ac: AC-6 | kind: error
- **B7** `internal/scan` stays at 3 exported symbols (`Deps`/`Result`/`Run`); the `enricher` seam + the status plumbing are unexported; the new `Deps.Enrich` field is not a symbol. | ac: AC-2 | kind: normal

## invariants

- **INV-downward:** `internal/scan` now imports `internal/enrich` (the one new import). Direction stays `api -> scan -> enrich -> {module,plugin} -> store` — no cycle (enrich never imports scan).
- **INV-one-domain-call:** `api` still calls `scan.Run` as the ONE domain entry; scan's enrich call is per-item, not a new public surface (ai-arch §3).
- **INV-seam-mirror:** The `enricher` seam is the enrich analog of `scannerResolver` (`run.go:55-60`): an unexported function type, supplied by `Run` (production closure over `deps.Enrich`) and overridable by the in-package test (fake). Not a symbol.
- **INV-status-passthrough:** scan does NOT compute/validate status — it persists the string enrich returns (store is value-agnostic; enrich owns `nextState`). A module with no `MetadataSources` gets the start status unchanged.
- **INV-idempotent-upsert:** The PutItem upsert (`ON CONFLICT(file_id)`, `items.go:41`) is preserved; re-scan refreshes document + status, keeps id + created_at (AC-3).

## precondition

scan ships the identify->PutItem flow and a `scannerResolver` test seam. `Item.Status` exists (Task 04) and `enrich.Enrich`/`enrich.Deps` exist (Task 05).
- evidence: `internal/scan/run.go:51-53` (`Run` -> `runScan`); `:55-60` (`scannerResolver` seam to mirror for `enricher`); `:65-108` (`runScan` drain loop -> `persist`); `:111-128` (`persist`: Identify -> PutItem — the insertion point for enrich); `:130-144` (`newItem` builds the Item, calling `assembleDocument` at `:141`); `:176-212` (`assembleDocument` builds the base doc).
- evidence: `internal/scan/run.go:22-26` (`Deps{Store,Plugins,Modules}` — ADD the `Enrich enrich.Deps` field); `:12-17` (imports — ADD `internal/enrich`).
- evidence: `internal/store/items.go:15-26` (`Item.Status` from Task 04); `:32` (PutItem upsert).

## postcondition

`scan.Deps` carries `Enrich enrich.Deps`; `runScan`/`persist` call the injected `enricher` per item; the persisted Item carries the enriched document + Status; enrich warnings merge into the scan Result; ctx-err precedence holds. `run_test.go` extends with an injected fake enricher. `check.sh` OK at 3 symbols.

## test_seed

Extend `internal/scan/run_test.go` (inject a fake scanner AND a fake enricher):
- happy path: fake scanner emits a file; fake enricher returns `{sources.tv-parser:...}` + status `enriched`; assert the PutItem'd Item has that document + `Status=="enriched"`.
- enrich soft-fail: fake enricher returns warnings + status `parsed`; assert scan Result.Warnings includes them and the scan still succeeds (Persisted>0).
- enrich hard-error (ctx cancel): fake enricher returns ctx.Err(); assert scan returns the error with ctx precedence.
- no-metadata-sources module: enricher returns the start status; Item persisted with that status, document unchanged.

## callers_to_update

- `internal/scan/run.go` — `Deps` (+`Enrich enrich.Deps` field), `Run` (production closure over `deps.Enrich`), `runScan` (+`enricher` param), `persist` (call enrich, set `Item.Document`/`Item.Status`, merge warnings), `newItem` (take the enriched document, or split base-assembly out of it). Update package doc comment.
- `internal/scan/doc.go` — document the enrich step (S6); keep 3 symbols.
- `internal/scan/run_test.go` — inject the fake enricher + new assertions.

## allowed_imports

- `context`, `encoding/json`, `fmt`, `time` (stdlib, already imported)
- `github.com/mellifera/mellifera/internal/module` (already)
- `github.com/mellifera/mellifera/internal/plugin` (already)
- `github.com/mellifera/mellifera/internal/store` (already)
- `github.com/mellifera/mellifera/internal/enrich` (NEW — the one new import)
- `github.com/mellifera/mellifera/pkg/sdk` (already)
- `scannerv1 "github.com/mellifera/mellifera/proto/mellifera/scanner/v1"` (already)

## allowed_categories

- `stdlib`

## test_exclusions

- `Result`/`Deps` already tested via Run; the `enricher` seam is unexported logic covered via the Run-level fake-injection tests.

## negative_examples

- DO NOT add orchestration beyond the per-item enrich call (enrich owns the chain).
- DO NOT compute or validate status in scan (enrich owns `nextState`; scan persists).
- DO NOT let enrich import scan (downward-only — scan->enrich only).
- DO NOT change the PutItem upsert key or break re-scan idempotency (AC-3).
- DO NOT make the enricher an exported type/symbol (mirror `scannerResolver` — unexported).

## existing_code_snapshot

`persist` (`run.go:111-128`) — the insertion point:
```go
func persist(ctx context.Context, st *store.Store, sc sdk.Scanner, f *scannerv1.DiscoveredFile, mod module.Module, libraryID int64, res *Result) error {
	identified, err := sc.Identify(ctx, &scannerverv1.IdentifyRequest{File: f, ModuleType: mod.MediaType})
	if err != nil {
		res.Warnings = append(res.Warnings, fmt.Sprintf("identify %q: %v", f.GetRelativePath(), err))
		return ctx.Err()
	}
	if err := st.PutItem(ctx, newItem(f, identified, mod, libraryID)); err != nil {
		res.Warnings = append(res.Warnings, fmt.Sprintf("persist %q: %v", f.GetRelativePath(), err))
		return ctx.Err()
	}
	res.Persisted++
	return nil
}
```
Post-change: after Identify, build the base doc (`assembleDocument`), call the injected `enricher(ctx, mod, doc, identified)` -> `(enrichedDoc, status, enrichResult, err)`; on err return ctx-err-precedence; merge `enrichResult.Warnings` into `res.Warnings`; build the Item with `Document=enrichedDoc`, `Status=status`; PutItem.

`Deps` (`run.go:22-26`) — add the field:
```go
type Deps struct {
	Store   *store.Store
	Plugins *plugin.Manager
	Modules *module.Registry
	Enrich  enrich.Deps   // [NEW field, not a symbol] built by main (Task 10)
}
```
`scannerResolver` (`run.go:55-60`) — the seam pattern to mirror:
```go
type scannerResolver func(pluginID, capabilityID string) (sdk.Scanner, error)
```
Add: `type enricher func(ctx context.Context, mod module.Module, doc map[string]any, base *scannerv1.IdentifyResult) (map[string]any, string, enrich.Result, error)`. `Run`'s production closure: `func(ctx, mod, doc, base) (...) { return enrich.Enrich(ctx, deps.Enrich, mod, doc, base) }`.

## contract_test_scope

- **joint (S6):** `internal/scan -> internal/enrich` | assert: scan calls enrich per item and passes the result to PutItem. Verified here (fake enricher) + Task 11 integration.
- **joint (S7):** `internal/scan -> internal/store PutItem(status)` | assert: persisted Item.Status == enrich's returned status; upsert idempotency preserved. Verified here + Task 11.

## scope_boundary

- MODIFY `internal/scan/run.go` (Deps.Enrich field, Run closure, runScan/persist/newItem refactor, `enricher` seam)
- MODIFY `internal/scan/doc.go` (document S6; 3 symbols)
- MODIFY `internal/scan/run_test.go` (fake enricher + assertions)

## out_of_scope

- `internal/enrich` internals (Task 05)
- `internal/store` (Task 04)
- `internal/api` (Task 09)
- `cmd/mellifera/main.go` (Task 10 — constructs `enrich.Deps` + sets `scan.Deps.Enrich` + loads tv-parser)

## line_budget

70 (flex 1.4 — persist/newItem refactor + seam + field)

## acceptance_criteria

- AC-1 (per-item discovery->identify->enrich->persist)
- AC-5 (enriched document + status persisted)
- AC-6 (soft-fail warnings merged; ctx precedence)
- AC-7 (status persisted)
- AC-2 (scan stays 3 symbols; build green)

## refactoring_checklist

- `cd mellifera && go build ./internal/scan/... && go test ./internal/scan/...` green.
- `grep -n 'internal/enrich' internal/scan/*.go` -> import present (S6); `grep -rn 'internal/scan' internal/enrich/` -> 0 hits (no cycle).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK at 3 symbols.
- `git diff --stat 7bcc6c9 -- proto/` empty.

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
