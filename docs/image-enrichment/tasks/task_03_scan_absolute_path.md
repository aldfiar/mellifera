# Task 03 — internal/scan stamps `absolute_path` into `doc["parsed"]`

> Step Outline 7. MODIFY `internal/scan/run.go`. Generic, media-type-agnostic —
> scan stamps the reconstructed absolute path for ALL items (it does not know it
> is serving images). The image-enricher reads `parsed.absolute_path` to run
> exiftool (Task 01); tv-parser ignores the new key.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher.
- **why:** the B1 chain passes an EMPTY document to the enricher's Merge (`chain.go:79`) and reconstructs the base from `doc["parsed"]` ONLY (`chain.go:115-122`). So the ONLY channel through which the image-enricher can open the file is `doc["parsed"]["absolute_path"]` (D-6 / R-I3). There is no other channel without editing the proto or B1 (AC-3).
- **data_flow:** `runScan` already has `lib.RootPath` (`run.go:116`) → thread it through `persist` → `assembleBaseDoc`, which sets `parsed.absolute_path = filepath.Join(lib.RootPath, f.RelativePath)` for every item. Additive; tv-parser reads only `relative_path`/`stem` (`parser.go:111-123`).
- **rationale (D-6):** alternatives (base-scanner embeds EXIF bytes; change `reconstructBase`; embed in `doc["ffprobe"]`) were rejected as wrong-layer or B1-touching. `absolute_path` rides the free-form `Parsed` ("consumers must not assume presence", `scanner.pb.go:267-272`).

## Type

MODIFY `internal/scan/run.go` (+ extend an in-package test).

## Seams owned

- **S4** scan absolute-path stamp. (Joint test → Task 07; unit assertion here.)

## behaviors

- B01: `assembleBaseDoc` (and the persist path that feeds it) stamps `absolute_path = filepath.Join(lib.RootPath, f.RelativePath)` into `doc["parsed"]` for EVERY discovered item, regardless of media type. | ac: AC-1, AC-image | kind: normal
- B02: The existing parsed keys (`relative_path`, `extension`) and the rest of the document (`file_id`, `module_type`, `schema_version`, `ffprobe`) are unchanged — `absolute_path` is purely additive. | ac: AC-3 | kind: normal
- B03: `absolute_path` is deterministic for `(lib.RootPath, f.RelativePath)` → `baseChanged` (stale-on-rescan) does NOT flag a false-stale for the same file re-scanned (it compares `parsed+ffprobe` byte-stably; `run.go:232-251`). | ac: AC-queue | kind: normal
- B04: `runScan` threads `lib.RootPath` into `persist`, and `persist` threads it into `assembleBaseDoc`; the `runScan`→`persist`→`assembleBaseDoc` call chain compiles with the new parameter. | ac: AC-1 | kind: normal
- B05: scan stays media-type-agnostic — no `if module_type=="image"` branch anywhere in `internal/scan` (INV2). | ac: AC-3 | kind: normal

## invariants

- CORE STAYS INV2: scan does NOT branch on media type. The stamp is generic for all items (TV items get it too; tv-parser ignores it).
- ADDITIVE ONLY: no existing parsed key or document key is removed or renamed; `absolute_path` is the sole new key.
- DETERMINISTIC PATH: `absolute_path = filepath.Join(lib.RootPath, f.RelativePath)` — exactly the reconstruction the `DiscoveredFile.RelativePath` comment sanctions ("Absolute path is reconstructed by the core", `scanner.pb.go:108-109`). `lib.RootPath` is the resolved library root (`store.Library.RootPath`, `libraries.go:16`).
- NO B1 TOUCH: only `internal/scan/run.go` changes. `internal/enrich/**` (including `reconstructBase`) is untouched (AC-3 / AC-queue).
- STALE COMPARISON SAFE: `baseSignature` (`run.go:246-251`) projects `parsed` wholesale, so `absolute_path` enters the signature on BOTH sides across a re-scan → no false-stale (R-I3 mitigation).

## postcondition

Every persisted item's base document carries `parsed.absolute_path` (the reconstructed absolute file path); the stamp is generic (no media-type branch); TV items are unaffected functionally; re-scan stale detection is unaffected.

## existing_code_snapshot (G2-verified @ `e2a7562`)

`internal/scan/run.go:113-118` (runScan has `lib.RootPath` in scope):
```go
func runScan(ctx context.Context, st *store.Store, mods *module.Registry, resolve scannerResolver, enrich enricher, notify notifier, libraryID int64) (Result, error) {
	res := Result{LibraryID: libraryID, StartedAt: time.Now().UTC()}

	lib, err := st.GetLibrary(ctx, libraryID)
	if err != nil {
		return finish(res), fmt.Errorf("scan: library %d: %w", libraryID, err)
	}
```
`internal/scan/run.go:161` (persist call site inside runScan's drain loop):
```go
			if perr := persist(ctx, st, sc, f, mod, libraryID, &res); perr != nil {
```
`internal/scan/run.go:179-185` (persist signature + assembleBaseDoc call):
```go
func persist(ctx context.Context, st *store.Store, sc sdk.Scanner, f *scannerv1.DiscoveredFile, mod module.Module, libraryID int64, res *Result) error {
	identified, err := sc.Identify(ctx, &scannerv1.IdentifyRequest{File: f, ModuleType: mod.MediaType})
	...
	base := assembleBaseDoc(f, identified, mod.MediaType, mod.SchemaVersion)
```
`internal/scan/run.go:334-352` (assembleBaseDoc — the parsed map is built from `id.GetParsed()`):
```go
func assembleBaseDoc(f *scannerv1.DiscoveredFile, id *scannerv1.IdentifyResult, moduleType string, schemaVersion int) map[string]any {
	doc := map[string]any{
		"file_id":        f.GetFileId(),
		"module_type":    moduleType,
		"schema_version": schemaVersion,
	}
	if p := id.GetParsed(); p != nil {
		if b, err := json.Marshal(p); err == nil {
			doc["parsed"] = json.RawMessage(b)
		}
	}
	if doc["parsed"] == nil {
		doc["parsed"] = json.RawMessage(`{}`)
	}
	...
}
```

## test_seed

In-package test under `internal/scan/` (extend `run_test.go` or add `parsed_abs_test.go`):
- Table case: `persist`/`assembleBaseDoc` with `lib.RootPath="/tmp/lib"` and `f.RelativePath="sub/IMG.jpg"` → unmarshalled `doc["parsed"]` contains `absolute_path == "/tmp/lib/sub/IMG.jpg"` alongside the existing `relative_path`/`extension` (B01/B02).
- A TV item (`module_type="tv"`) ALSO gets `absolute_path` (no branch — B05).
- `baseChanged` over two assembleBaseDoc outputs for the SAME (root, rel) → `false` (B03 — no false-stale); changing `root` OR `rel` → `true`.
- Existing parsed keys still present (regression: nothing dropped).

## spec

### File to MODIFY: `internal/scan/run.go`

1. `runScan` (`run.go:113`): `lib.RootPath` is already in scope (`run.go:116`). Thread it into the `persist` call at `run.go:161`:
   ```go
   if perr := persist(ctx, st, sc, f, mod, lib.RootPath, libraryID, &res); perr != nil {
   ```
2. `persist` (`run.go:179`): add a `rootPath string` parameter (before `libraryID`):
   ```go
   func persist(ctx context.Context, st *store.Store, sc sdk.Scanner, f *scannerv1.DiscoveredFile, mod module.Module, rootPath string, libraryID int64, res *Result) error {
   ```
   and pass it to `assembleBaseDoc` at `run.go:185`:
   ```go
   base := assembleBaseDoc(f, identified, mod.MediaType, mod.SchemaVersion, rootPath)
   ```
3. `assembleBaseDoc` (`run.go:334`): add `rootPath string` and stamp `absolute_path` into the parsed map. The parsed map arrives as a marshalled `json.RawMessage` (from `id.GetParsed()`); the minimal, no-new-import approach: unmarshal it into `map[string]any`, set `parsed["absolute_path"] = filepath.Join(rootPath, f.GetRelativePath())` when `rootPath != ""`, re-marshal:
   ```go
   func assembleBaseDoc(f *scannerv1.DiscoveredFile, id *scannerv1.IdentifyResult, moduleType string, schemaVersion int, rootPath string) map[string]any {
       doc := map[string]any{
           "file_id":        f.GetFileId(),
           "module_type":    moduleType,
           "schema_version": schemaVersion,
       }
       parsed := map[string]any{}
       if p := id.GetParsed(); p != nil {
           _ = json.Unmarshal(toJSON(p), &parsed) // best-effort; {} on failure (existing behavior)
       }
       if rootPath != "" {
           parsed["absolute_path"] = filepath.Join(rootPath, f.GetRelativePath())
       }
       b, _ := json.Marshal(parsed)
       doc["parsed"] = json.RawMessage(b)
       if raw := f.GetFfprobeJson(); len(raw) > 0 {
           doc["ffprobe"] = json.RawMessage(raw)
       }
       return doc
   }
   ```
   Notes: `filepath` is already imported by run.go (`run.go:11`). Keep `toJSON`/marshal helper consistent with the existing style; if `json.Marshal(p)` was used inline (`run.go:341`), keep that exact serialization for the read path. Keep `assembleBaseDoc` under funlen 60 (factor the parsed-mutate into a small `withAbsolutePath(parsed map[string]any, rootPath, rel string) map[string]any` if needed).
4. Do NOT change `baseSignature`/`baseChanged` (`run.go:232-251`) — they already project `parsed` wholesale, so `absolute_path` enters the comparison on both sides (B03).

### Steps (ordered)
1. Edit `run.go`: `assembleBaseDoc` signature + body (stamp `absolute_path`).
2. Edit `run.go`: `persist` signature + forward `rootPath`.
3. Edit `run.go`: `runScan` call site → pass `lib.RootPath`.
4. Add/extend the in-package test in `test_seed`.
5. `cd /Users/alldfiar/projects/go/mellifera && go build ./internal/scan/ && go test ./internal/scan/`.

## allowed_imports

(existing `internal/scan` imports — unchanged set) +
- stdlib: `path/filepath` (ALREADY imported, `run.go:11`), `encoding/json` (already imported), `context`, `fmt`, `time`, `bytes` (used by `baseChanged`)
- `github.com/mellifera/mellifera/internal/store`, `github.com/mellifera/mellifera/internal/module`, `github.com/mellifera/mellifera/pkg/sdk`, `github.com/mellifera/mellifera/proto/mellifera/scanner/v1`

NO new import. NO import of `internal/enrich`, `internal/api`, or any `plugins/*`.

allowed_categories: stdlib

## callers_to_update

- `internal/scan/run.go:161` (runScan → persist call site — add `lib.RootPath` arg).
- `internal/scan/run.go:179` (persist signature — add `rootPath string`).
- `internal/scan/run.go:185` (persist → assembleBaseDoc call — forward `rootPath`).
- `internal/scan/run.go:334` (assembleBaseDoc signature — add `rootPath string`).
- In-package tests calling `persist`/`assembleBaseDoc` directly: `grep -n 'assembleBaseDoc(\|persist(' internal/scan/*_test.go` → update to the new signatures.

`assembleBaseDoc` and `persist` are UNEXPORTED (package-internal) — no other package imports them (G2: `grep -rn 'assembleBaseDoc\|persist(' internal/ api/ cmd/` confirms callers live only in `internal/scan`). evidence: `internal/scan/run.go:113,161,179,185,334`.

## negative_examples

- DO NOT branch on media type in scan (INV2 — the stamp is generic for all items).
- DO NOT edit `internal/enrich/**` (B1 reconstructBase is consumed, not modified — AC-3/AC-queue).
- DO NOT add `absolute_path` to `doc["ffprobe"]` or a new top-level doc key — it MUST live in `doc["parsed"]` (the only field `reconstructBase` reads, `chain.go:115-122`).
- DO NOT drop or rename any existing parsed key (`relative_path`, `extension`) — purely additive (B02).
- DO NOT edit `proto/**` (the parsed Struct is free-form; `absolute_path` is within contract).

## out_of_scope

- `internal/enrich/**` (AC-3 / AC-queue — no_seam).
- `plugins/**` (Tasks 01/02), `internal/module/**` (Task 04), `cmd/**` (Task 05).
- `proto/**`, `internal/api/**`, `pkg/sdk/**`, `internal/store/**`.

## scope_boundary

MODIFY `internal/scan/run.go` (+ in-package `*_test.go` that call `persist`/`assembleBaseDoc`). No other file.

## project_scope

.

## line_budget

50  (3 signature edits + the absolute_path stamp + a helper; small)
line_budget_flex: 1.1

## test_exclusions

- `assembleBaseDoc`/`persist` are unexported orchestrators wired through the existing test seams; their signatures are tested via the existing `runScan` fake-injection tests rather than a standalone exported-symbol test.

## refactoring_checklist

- [ ] `grep -rn 'assembleBaseDoc\|persist(' internal/scan/` — every call site updated; package compiles.
- [ ] `grep -rn 'assembleBaseDoc\|\.persist(' internal/api/ internal/enrich/ cmd/` → no external callers (confirms unexported scope).
- [ ] Unit test asserts `doc["parsed"].absolute_path` set AND existing keys intact AND no media-type branch (`grep -n 'module_type ==' internal/scan/run.go` shows no new branch).
- [ ] `go test ./internal/scan/` green.

## skill_hint

- grounding (G2 the persist/assembleBaseDoc call chain + confirm no external caller of the unexported symbols)
- mellifera-build (funlen-60; the existing run.go is large — keep edits minimal and factored)

## deps

(none — independent of Tasks 01/02/04/05; additive core change)

## verify

```
cd /Users/alldiar/projects/go/mellifera
go build ./internal/scan/
go vet ./internal/scan/
go test ./internal/scan/
```
