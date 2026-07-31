- [x] Task 08 (coder): Implement plugins/base-scanner (scanner binary, package main)
  target: mellifera/plugins/base-scanner/{doc.go,main.go,scanner.go,walk.go,pathguard.go,ffprobe.go,tvparse.go,*_test.go} | action: CREATE
  archetype: external-services
  skill_hint: golang-security
  feature_goal: (see T01)
  why: The real scanner the architecture is built to prove. Walks the library root, guards every path against traversal (AC-4 security), probes each file via `ffprobe` arg-slice (NEVER shell), parses TV filenames (incl. Cyrillic) into IdentifyResult.parsed, emits DiscoveredFile/IdentifiedItem over gRPC. Soft-fails on ffprobe miss (AC-6 resilience). This binary + the Manager prove subprocess isolation end-to-end (T11).
  data_flow: enters from: T03 sdk.Serve + T02 scanner proto (served side) → transforms: filepath.WalkDir + withinRoot guard → exec.CommandContext("ffprobe", arg-slice) → parseTV → emit DiscoveredFile stream + IdentifyResult → emits to: T06 plugin.Manager (over gRPC subprocess seam S5/S6).
  related: producer T03 (sdk), T02 (proto); consumer T06 (Manager launches this binary); seams S5 (gRPC), S6 (ffprobe subprocess), S7 (path-guard); R4 (path-traversal), R5 (ffprobe resilience).
  imports:
    - github.com/mellifera/mellifera/pkg/sdk  # Serve, ScannerPlugin, Scanner
    - github.com/mellifera/mellifera/proto/mellifera/scanner/v1  # scannerv1 types
    - os/exec  # ffprobe arg-slice
    - path/filepath  # walk + withinRoot
    - context  # per-file ffprobe deadline
    - encoding/json  # parse ffprobe stdout
    - regexp  # SxxExx + title parse
    - strings
    - os
  allowed_imports:
    - github.com/mellifera/mellifera/pkg/sdk
    - github.com/mellifera/mellifera/proto/mellifera/scanner/v1
    - os/exec
    - path/filepath
    - context
    - encoding/json
    - regexp
    - strings
    - os
  allowed_categories:
    - stdlib
  precondition: |
    `pkg/sdk` (T03) + scanner proto (T02) compile. No `plugins/base-scanner/` exists (greenfield — source_baseline.md:14). base-scanner is part of the MAIN Go module this feature (R7 — decision).
  behaviors:
    - B1: `main()` is ~20 lines: build the unexported `scannerImpl`, call `sdk.Serve(...)` | ac: AC-1 | kind: normal
    - B2: `scannerImpl.Scan` walks the library root (filepath.WalkDir filtering media extensions), emits a `DiscoveredFile` per file on a bounded channel, drains at consumer speed | ac: AC-1 | kind: normal
    - B3: `withinRoot(root, candidate)` resolves the candidate + `filepath.EvalSymlinks` + verifies the resolved absolute path is under root, checked pre- AND post-symlink-resolve (closes TOCTOU); escaping paths are SKIPPED + warned, never probed/read/persisted | ac: AC-4 | kind: edge
    - B4: `probe(ctx, absPath)` runs `exec.CommandContext(ctx, "ffprobe", "-v","quiet","-print_format","json","-show_format","-show_streams", absPath)` (arg-slice, NEVER shell); stdout stored verbatim as `DiscoveredFile.ffprobe_json` bytes | ac: AC-1 | kind: normal
    - B5: ffprobe missing on PATH (`exec.LookPath` fails) OR non-zero exit OR non-JSON stdout OR ctx deadline → SOFT failure: empty `ffprobe_json` + a `warnings` entry; the file is still identified (Q6/AC-6) | ac: AC-6 | kind: error
    - B6: `parseTV(filename)` is PURE: extracts SxxExx + show title, strips resolution/group tags, emits `IdentifyResult.parsed` Struct (title/season/episode/episode_end/release_group/resolution/...); handles Cyrillic titles correctly (no English-only regex) | ac: AC-1 | kind: normal
    - B7: `scannerImpl.Identify` is unary + pure: calls parseTV on the file's relative path, returns IdentifyResult with confidence + parser_name | ac: AC-1 | kind: normal
    - B8: a subprocess smoke test builds the base-scanner binary, launches it via sdk.Serve, dials it, scans a tiny fixture — SKIPs cleanly (not fails CI) if ffprobe is absent | ac: AC-2 | kind: edge
  invariants:
    - INV1: PATH-TRAVERSAL GUARD (hard rule). Every candidate path is resolved + verified under root BEFORE ffprobe. Checked twice (pre- and post-symlink-resolve) to close TOCTOU. NO file outside root is ffprobed/read/persisted — via symlinks or `..`.
    - INV2: ARG-SLICE ONLY. ffprobe via `exec.CommandContext("ffprobe", args...)`. NEVER `sh -c`/`bash -c`. (kickoff hard rule; golang-security.)
    - INV3: SOFT-FAIL on ffprobe problems (missing/non-zero/non-JSON/timeout): empty ffprobe_json + warning, item still identified. One bad file does NOT abort the scan (Q6/AC-6).
    - INV4: per-file ffprobe ctx deadline (default 30s, Q11/D13).
    - INV5: Cyrillic titles are first-class — regex must not assume ASCII. (conventions.md §Russian-language.)
    - INV6: `plugins/base-scanner` is `package main`; it MAY import `pkg/sdk` + proto + stdlib + os/exec; MAY NOT import any `internal/*` (separate process — arch §10; R7).
  postcondition: |
    (AC-1/AC-4/AC-6/AC-2) base-scanner binary builds (`go build ./plugins/base-scanner`); withinRoot rejects all escape vectors; ffprobe soft-fails; parseTV handles SxxExx + Cyrillic; pure-function table tests + one subprocess smoke test (SKIP-if-ffprobe-absent) green.
  test_seed: |
    # arrange: a temp fixture dir w/ "Breaking Bad/Season 1/Breaking Bad S01E01.mkv", a symlink escaping root, a zero-byte file. act: scannerImpl.Scan; for each DiscoveredFile call Identify. assert: escaping symlink skipped + warned (AC-4); zero-byte file → empty ffprobe + warning + still identified (AC-6); S01E01 → parsed title="Breaking Bad", season=1, episode=1.
  spec: |
    Signatures (all UNEXPORTED except main; contracts.md §9 + File Map implementation_plan.md:144-153):
    func main()  // ~20 lines: build scannerImpl, sdk.Serve
    type scannerImpl struct { ... }  // satisfies sdk.Scanner
    func (s *scannerImpl) Scan(ctx, *scannerv1.ScanRequest) (<-chan *scannerv1.DiscoveredFile, error)
    func (s *scannerImpl) Identify(ctx, *scannerv1.IdentifyRequest) (*scannerv1.IdentifyResult, error)
    func walk(ctx, root string, opts ...) <-chan *scannerv1.DiscoveredFile  // unexported
    func withinRoot(root, candidate string) bool  // unexported, pure
    func probe(ctx context.Context, absPath string) (ffprobeJSON []byte, warning string, err error)  // unexported
    func parseTV(relPath string) (parsed *structpb.Struct, confidence float64, parser string)  // unexported, PURE

    Steps:
    1. Write `doc.go` (package main doc comment block): responsibility + invariants (path-guard, arg-slice, soft-fail, Cyrillic). Apache header.
    2. `main.go`: build `scannerImpl{}`, `sdk.Serve(cfg, &sdk.ScannerPlugin{Impl: impl})`. ~20 lines.
    3. `scanner.go`: `scannerImpl` satisfying sdk.Scanner (Scan streams via walk + probe; Identify calls parseTV).
    4. `walk.go`: filepath.WalkDir over root, filter media extensions, guard each path via withinRoot, run probe, emit DiscoveredFile (file_id = stable hash of relative_path; relative_path; size; mime; ffprobe_json bytes; warnings).
    5. `pathguard.go`: `withinRoot` — filepath.Rel(root, candidate) + filepath.EvalSymlinks + verify resolved abs under root, pre + post symlink. Table test over: symlink-out, `..` segment, absolute injection, nested symlink, root itself (AC-4).
    6. `ffprobe.go`: `probe` — exec.LookPath("ffprobe") (soft-fail if missing) → exec.CommandContext arg-slice → capture stdout → return bytes. Non-zero exit / non-JSON / ctx deadline → empty bytes + warning. Table test over fixture ffprobe JSON outputs + subprocess test (SKIP if ffprobe absent) + bad-path→warning test.
    7. `tvparse.go`: `parseTV` PURE — SxxExx regex (handles S01E01, S01E01E02), title extraction, strip resolution/group tags, emit parsed Struct. Table test over many filename shapes incl. Cyrillic title (e.g. "Игра престолов S01E01.mkv").
  test_exclusions:
    - "main() — ~20-line wiring to sdk.Serve; exercised by the subprocess smoke test"
  error_handling:
    - "ffprobe missing (LookPath fails)": soft warning + empty ffprobe_json; item still identified (B5/AC-6).
    - "ffprobe non-zero exit / non-JSON stdout / ctx deadline": soft warning + empty ffprobe_json; item still identified.
    - "path escapes root": skip + warn; never probe (B3/AC-4).
    - "scan ctx cancelled": close the channel cleanly; propagate ctx error.
  callers_to_update: []
  contract_test_scope:
    - joint: plugins/base-scanner -> ffprobe subprocess | assert: arg-slice invocation; soft-fail on miss/non-zero/timeout (AC-6); never sh -c
    - joint: plugins/base-scanner path-guard | assert: all escape vectors rejected (AC-4)
  negative_examples:
    - "DO NOT use sh -c / bash -c for ffprobe — arg-slice ONLY (golang-security)."
    - "DO NOT ffprobe/read/persist a path before withinRoot passes (pre + post symlink)."
    - "DO NOT assume ASCII in parseTV — Cyrillic titles must parse."
    - "DO NOT abort the whole scan on one bad file (soft-fail per AC-6)."
    - "DO NOT import any internal/* package (separate process)."
    - "DO NOT fail CI if ffprobe is absent — SKIP the subprocess test cleanly."
  existing_code_snapshot: |
    (GREENFIELD — plugins/base-scanner/ does not exist. evidence: source_baseline.md:14.)
  source_anchor: contracts.md:269-303 (§9 sdk — scannerImpl satisfies sdk.Scanner); File Map implementation_plan.md:144-153 (base-scanner rows); integration_map.md S6/S7 (ffprobe + path-guard seams)
  scope_boundary: "This task ONLY creates files under mellifera/plugins/base-scanner/. No other files."
  out_of_scope:
    - mellifera/internal/plugin/  # T06 launches this binary; does not modify it
    - metadata plugins (TMDB/Kinopoisk) — DEFERRED
  line_budget: 950
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-1 | given: a TV fixture | when: scan via subprocess | then: items w/ parsed title/season/episode + ffprobe blob
    - scenario: AC-4 | given: escaping symlink / `..` | when: scan | then: skipped + warned, never probed
    - scenario: AC-6 | given: an unprobeable file | when: scan | then: empty ffprobe + warning, item still present
    - scenario: AC-2 | given: feature branch | when: go test ./plugins/base-scanner/ | then: green (subprocess test SKIPs cleanly if ffprobe absent)
  verify: cd mellifera && go build ./plugins/base-scanner && go test ./plugins/base-scanner/... && grep -rn 'sh -c\|bash -c' mellifera/plugins/base-scanner/ ; test $? -eq 1
