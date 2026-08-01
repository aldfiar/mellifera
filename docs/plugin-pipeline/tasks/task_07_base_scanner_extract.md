# Task 07 — plugins/base-scanner: media-type-agnostic Identify (parseTV extraction's delete half)

- **Type:** coder
- **Step:** 7 (the extraction delete half — Task 06 is the create/move half)
- **Seams:** S8 (base-scanner extraction)
- **AC trace:** AC-1 (structural/negative — the clean parseTV split), AC-3
- **Project scope:** `.` (root; `package main` at `plugins/base-scanner/`)
- **Deps:** Task 06 (tvparse.go moved to tv-parser — removing it from base-scanner loses nothing)
- **Estimated LOC:** ~25 net (XS — delete + one call removal + test fixups)

## behaviors

- **B1** `scannerImpl.Identify` NO LONGER calls `parseTV`; it returns media-type-agnostic BASE fields only (file_id, media_type, generic filename decomposition such as `{stem, extension}`). NO `season`/`episode`/`SxxExx`/`release_group`/`year`/`resolution` keys. | ac: AC-1 | kind: normal
- **B2** The `scanner.v1.IdentifyResult` WIRE SHAPE is UNCHANGED (`{FileId, MediaType, Parsed, Confidence, ParserName}`) — only the `Parsed` CONTENT shrinks (fewer keys) and `ParserName` is no longer `"tv-filename"` (deprecate-don't-delete; AC-3). | ac: AC-3 | kind: normal
- **B3** `plugins/base-scanner/tvparse.go` is DELETED (it was moved verbatim to `plugins/tv-parser/tvparse.go` in Task 06). `plugins/base-scanner/tvparse_test.go` is DELETED (its cases were re-homed in `plugins/tv-parser/parser_test.go`, Task 06). | ac: AC-1 | kind: normal
- **B4** `plugins/base-scanner/scanner_test.go` no longer asserts TV fields from `Identify`; it asserts the base fields only. | ac: AC-1 | kind: normal

## invariants

- **INV-wire-shape (AC-3):** `scanner.v1.Scanner` Scan/Identify and `IdentifyResult` are unchanged on the wire. base-scanner still serves the `scanner` capability discovery. Existing clients that read `IdentifyResult` keep compiling; clients that read `season`/`episode` from base-scanner's `Parsed` now get them from the enrich stage (documented behavior change, acceptance.md AC-1).
- **INV-agnostic (AC-1/AC-4):** base-scanner emits NO media-type-specific fields. The literal probe `grep -rnE 'season|episode|SxxExx|parseTV' plugins/base-scanner/ | grep -v _test` -> 0 hits after this task.
- **INV-move-not-delete:** the parseTV logic is NOT lost — it lives in `plugins/tv-parser/tvparse.go` (Task 06). This task removes the base-scanner COPY only because the destination exists.

## precondition

`parseTV` is called at exactly one site in base-scanner, and `tvparse.go` has already been moved to tv-parser (Task 06).
- evidence: `plugins/base-scanner/scanner.go:42-55` (`Identify` — `parsed, confidence, parser := parseTV(file.GetRelativePath())` at `:47` is the single call site to remove; the doc comment `:42-44` mentions parseTV and must be rewritten).
- evidence: `plugins/base-scanner/tvparse.go` (the file to DELETE — 112 lines, moved verbatim to `plugins/tv-parser/tvparse.go`).
- evidence: `plugins/base-scanner/tvparse_test.go` (DELETE — the parseTV table test, cases re-homed in Task 06).
- evidence: `plugins/base-scanner/scanner_test.go:98-105` (Identify assertions `season==1`/`episode==1`/`parser_name=="tv-filename"` to drop/update); `:19` comment mentions title/season/episode parsing.

## postcondition

base-scanner's `Identify` returns base fields only; `tvparse.go` + `tvparse_test.go` are gone; `scanner_test.go` asserts base fields. The AC-1 extraction probes pass: 0 hits for parseTV/season/episode/SxxExx in base-scanner non-test code; >=1 hit for parseTV in tv-parser. base-scanner still builds, serves `scanner`, and the existing ffprobe/pathguard/injection tests pass unchanged.

## test_seed

Update `scanner_test.go`'s `Identify` case: assert `Parsed` contains the generic base fields (e.g. stem/extension) and explicitly does NOT contain `season`/`episode`; assert `ParserName` is the base value (not `"tv-filename"`). Keep the ffprobe/pathguard/injection tests (`ffprobe_test.go`/`pathguard_test.go`/`qa_injection_test.go`) UNTOUCHED — they do not depend on parseTV.

## callers_to_update

- `plugins/base-scanner/scanner.go` — remove the `parseTV` call (`:47`), rewrite `Identify` body + doc comment (`:42-44`).
- `plugins/base-scanner/scanner_test.go` — drop the TV-field assertions (`:98-105`), assert base fields.
- (DELETE) `plugins/base-scanner/tvparse.go`, `plugins/base-scanner/tvparse_test.go`.
- Check `helpers_test.go` (`numField`/`strField`): if those helpers become unused after the tvparse_test deletion, leave them (unused package-level funcs compile) OR remove if `scanner_test.go` no longer uses them — coder's call, but do NOT break the build with an unused import.

## allowed_imports

- `context`, `errors`, `fmt`, `os`, `path/filepath` (stdlib, already imported in scanner.go)
- `github.com/mellifera/mellifera/pkg/sdk`
- `scannerv1 "github.com/mellifera/mellifera/proto/mellifera/scanner/v1"`
- (REMOVE the now-unused imports if `parseTV` removal drops them — e.g. `structpb`/`regexp`/`strconv`/`strings` were used by tvparse.go, NOT scanner.go; scanner.go itself only imports context/errors/fmt/os/path/filepath/sdk/scannerv1. Verify no unused import remains.)

## allowed_categories

- `stdlib`

## test_exclusions

- This task is itself the structural/negative AC-1 probe — it is "tested" by the grep probes in `refactoring_checklist` + the updated `scanner_test.go`. No new exported symbol (package main).

## negative_examples

- DO NOT leave a stub `parseTV` in base-scanner (the logic must be GONE from this package; the probe greps non-test code).
- DO NOT change the `IdentifyResult` proto or the `Scanner` wire shape (AC-3).
- DO NOT weaken the ffprobe/pathguard/injection behavior (unrelated to the extraction).
- DO NOT delete the moved logic — verify `plugins/tv-parser/tvparse.go` exists FIRST (Task 06 dependency).

## existing_code_snapshot

`Identify` (`plugins/base-scanner/scanner.go:42-55`) — the call to remove:
```go
// Identify is the pure unary parse of one discovered file into a structured
// guess. It runs parseTV on the file's library-relative path and returns the
// parsed Struct + confidence + parser name. No I/O beyond the request (arch §3.1).
func (s *scannerImpl) Identify(_ context.Context, req *scannerv1.IdentifyRequest) (*scannerv1.IdentifyResult, error) {
	file := req.GetFile()
	parsed, confidence, parser := parseTV(file.GetRelativePath())
	return &scannerv1.IdentifyResult{
		FileId:     file.GetFileId(),
		MediaType:  req.GetModuleType(),
		Parsed:     parsed,
		Confidence: confidence,
		ParserName: parser,
	}, nil
}
```
Post-extraction: `Parsed` = generic base Struct (stem/extension), `Confidence` = a base default, `ParserName` = `"base"` (NOT `"tv-filename"`). The wire `IdentifyResult` fields are unchanged.

## contract_test_scope

- **joint (S8):** `base-scanner Identify (base fields) -> internal/scan -> internal/enrich (TV via tv-parser)` | assert: base-scanner emits NO TV fields; the TV parse comes solely from tv-parser downstream (AC-1). Verified by the extraction grep probes here + the Task 11 integration golden (which asserts base-scanner's persisted `parsed` lacks season/episode while `sources.tv-parser` carries them).

## scope_boundary

- MODIFY `plugins/base-scanner/scanner.go` (Identify body + doc comment)
- MODIFY `plugins/base-scanner/scanner_test.go` (drop TV assertions, add base-field assertions)
- DELETE `plugins/base-scanner/tvparse.go`
- DELETE `plugins/base-scanner/tvparse_test.go`

## out_of_scope

- `plugins/tv-parser/*` (Task 06 — the destination; do not touch here)
- `internal/scan`, `internal/enrich` (Tasks 05/08)
- the ffprobe/pathguard/injection tests (unrelated; leave intact)

## line_budget

25 net (flex 2.0 — net delete; the Identify rewrite + test fixup are small but must be precise)

## acceptance_criteria

- AC-1 (parseTV fully removed from base-scanner; base-scanner media-type-agnostic — this task OWNS the structural/negative probe)
- AC-3 (IdentifyResult wire shape unchanged; scanner capability still served)

## refactoring_checklist

- **AC-1 extraction probe (this task is the owner; the reviewer re-runs it at the Acceptance Gate):**
  - `cd mellifera && grep -rnE 'season|episode|SxxExx|parseTV' plugins/base-scanner/ | grep -v _test` -> 0 hits.
  - `cd mellifera && grep -rn 'parseTV' plugins/tv-parser/` -> >= 1 hit (moved here, Task 06).
- `cd mellifera && go build ./plugins/base-scanner/... && go test ./plugins/base-scanner/...` green (no unused import from the parseTV removal).
- `make build-plugin` still builds base-scanner (plus tv-parser from Task 06).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK.
- `git diff --stat 7bcc6c9 -- proto/` empty.

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`
