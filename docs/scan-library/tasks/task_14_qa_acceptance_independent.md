- [x] QA-1 (qa): Independent acceptance re-derivation (reviewer-independence golden rule) — DONE 2026-07-31
  - test_file landed at: mellifera/qa_acceptance_test.go (package mellifera_test, module root)
  - verify: `cd mellifera && go test -run 'TestQA_Acceptance' ./...` -> PASS (3.4s e2e; AC-1/AC-4/AC-6/idempotency) + TestQA_Acceptance_ProtoVerbatim PASS (AC-3)
  target: mellifera/internal/api + mellifera/cmd/mellifera (the AC-1/AC-4/AC-6 user flows) | test_file: mellifera/qa/acceptance_qa_test.go | test_type: e2e
  validates_tasks: [Task 02, Task 04, Task 05, Task 06, Task 07, Task 08, Task 09, Task 10, Task 11]
  deps: Task 11 (coder golden test exists; QA writes an INDEPENDENT test, not a copy)
  skill_hint: stack-patterns
  scenarios:
    - name: AC-1 independent — exact parsed values re-derived from fixture filenames
      arrange: a fixture dir with known TV filenames (e.g. "Breaking Bad/Season 1/Breaking Bad S01E01.mkv", "Игра престолов S01E01.mkv"); temp DB; built server + base-scanner binaries; admin token T. QA INDEPENDENTLY derives expected parsed fields from the filenames BEFORE reading the coder's assertions.
      act: start server; POST /api/v1/libraries (Bearer T, root=fixture); POST /api/v1/libraries/{id}/scan; wait for completion; GET /api/v1/items?library={id}
      assert: items carry title="Breaking Bad", season=1, episode=1 (re-derived from the filename, not copied from coder); Cyrillic title parsed correctly; each item has a non-empty ffprobe blob (SKIP if ffprobe absent); scan response reports the count
    - name: AC-4 independent — path-traversal rejected
      arrange: fixture with an escaping symlink (target outside root) + a `..`-segment path
      act: scan the library
      assert: escaping entries produce NO persisted item; a warning is recorded in the scan result; no file outside root is probed (assert via the absence of out-of-root ffprobe output / a sentinel)
    - name: AC-6 independent — unprobeable file soft-fails
      arrange: one valid media file + one unprobeable file (zero-byte or unrecognized container)
      act: scan
      assert: BOTH items persisted; the unprobeable item has empty ffprobe + a warning; the valid item has the full ffprobe blob; scan completes (does not abort)
    - name: AC-1 independent — re-scan idempotency
      arrange: a scanned library (first scan done)
      act: POST /scan a second time; GET /items
      assert: item count unchanged (PutItem upsert by file_id); no duplicate file_ids
    - name: AC-3 spot-check — proto verbatim (cheap independent check)
      arrange: the four .proto files + arch §2
      act: diff each .proto against its arch §2 block
      assert: verbatim within protoc whitespace tolerance (no renamed fields)
  behavior_coverage:
    - B5 (T11, AC-1): exact parsed title/season/episode covered by scenario "AC-1 independent"
    - B6 (T11, AC-1): Cyrillic parsing covered by scenario "AC-1 independent"
    - B7 (T11, AC-4): path-traversal reject+warn covered by scenario "AC-4 independent"
    - B8 (T11, AC-6): unprobeable soft-fail covered by scenario "AC-6 independent"
    - B9 (T11, AC-1): re-scan idempotency covered by scenario "AC-1 independent — re-scan"
    - B4 (T02, AC-3): ffprobe_json is bytes — covered by scenario "AC-3 spot-check" + coder's proto diff
    uncovered_behaviors: []  # all AC-1/AC-4/AC-6 behaviors covered by QA-1 or the coder's contract tests; QA-2 covers AC-5 + resilience
  joints_targeted:
    - whole system (S-integration): the full API → module → plugin → base-scanner subprocess → store → list path returns the architecturally-correct outcome
    - internal/api -> deps.Scan (S1): handler delegates exactly once
  boundaries_targeted:
    - ffprobe subprocess: missing/non-zero/timeout → soft-fail (AC-6); SKIP cleanly if absent
    - filesystem (library root): path-traversal boundary (AC-4)
  input_domain_targeted:
    - parseTV (T08): equivalence classes — SxxExx, SxxExxEyy (episode_end), Cyrillic title, resolution/group tags to strip, multi-season nesting; edge values: season 0/missing, episode 0/missing, no-extension, dotfiles
  mock_boundaries:
    mock: [ffprobe subprocess ONLY when asserting the absent-path; otherwise use the REAL ffprobe if on PATH]
    real: [all internal modules — store, module, plugin, scan, api, base-scanner subprocess — NO doubles between joints]
  coverage_target: the S-integration joint shows green; the base-scanner subprocess boundary is exercised for real (not stubbed)
  acceptance_scenarios:
    - AC-1: independent e2e scan with exact re-derived parsed values
    - AC-4: path-traversal reject+warn
    - AC-6: unprobeable soft-fail
    - AC-3: proto verbatim spot-check
  verify:
    cmd: cd mellifera && go test -run 'TestQA_Acceptance' ./...
    expected: all QA acceptance scenarios pass (SKIP cleanly when ffprobe absent); assertions use QA-derived expected values, not the coder's
