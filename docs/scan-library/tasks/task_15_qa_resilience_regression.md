- [x] QA-2 (qa): Resilience, security-matrix, and boundary regression — DONE 2026-07-31
  - test files landed at: mellifera/qa_auth_test.go (AC-5 edge matrix), mellifera/qa_resilience_test.go (SQL-injection + WAL concurrency), mellifera/plugins/base-scanner/qa_injection_test.go (command-injection arg-slice)
  - verify: `cd mellifera && go test -run 'TestQA_Auth|TestQA_SQLInjection|TestQA_Store_WAL|TestQA_Probe_ArgSlice' ./...` -> all PASS
  - REDUNDANCY drops (per code-quality gate #6): restart/backoff (coder manager_test.go), scan ctx-cancel + soft-fail (coder run_test.go) — referenced, not duplicated
  - DEVIATION (grounding-driven): store is single-writer by contract (arch §9.3), so the "concurrent writers" wording was adjusted to the supported pattern: 1 writer + N readers (WAL snapshot isolation)
  target: mellifera/internal/{plugin,scan,api,store} | test_file: mellifera/qa/resilience_qa_test.go (+ mellifera/qa/auth_qa_test.go) | test_type: integration + regression
  validates_tasks: [Task 04, Task 06, Task 07, Task 09]
  deps: QA-1 (shares the test harness setup)
  skill_hint: golang-security
  scenarios:
    - name: AC-5 admin-token matrix (full)
      arrange: server with admin token T via httptest (real api.New router + temp store)
      act: table over {no header, wrong scheme ("Token "), wrong token, correct Bearer T} hitting POST /api/v1/libraries
      assert: no-header/wrong-scheme/wrong-token → 401 canonical body AND no library created (store row count unchanged); correct → 2xx AND library created. Constant-time compare (not assertable directly, but the matrix proves the gate).
    - name: plugin restart/backoff (§7.3)
      arrange: Manager with an in-process fake plugin that exits on demand; observe restart state
      act: trigger an unexpected exit; trigger repeated failures
      assert: backoff increases (1s→2x→cap 60s, jittered); after 3 consecutive failed restarts state=="failed" and no further attempts without intervention; Status reports Restarts count
    - name: scan ctx-cancellation aborts cleanly
      arrange: temp store + TV module + a fake sdk.Scanner that blocks/emits slowly
      act: scan.Run with a ctx that is cancelled mid-stream
      assert: Run returns a ctx error; the channel is drained/closed; already-PutItem-ed items remain (re-scan idempotent resumes)
    - name: scan soft-fail aggregation does not abort
      arrange: fake sdk.Scanner emitting N files where Identify returns an error for one
      act: scan.Run
      assert: Run completes; the failing file is recorded as a warning; the other N-1 files are persisted
    - name: store upsert idempotency + WAL (regression)
      arrange: temp SQLite DB via store.Open
      act: PutItem twice (same file_id); concurrent readers while writing
      assert: exactly one row; readers see a consistent WAL view (no partial writes); re-Open is idempotent (migrations IF NOT EXISTS)
    - name: SQL-injection regression (parameterized only)
      arrange: temp store
      act: CreateLibrary + QueryItems with adversarial inputs (module_id = "tv'; DROP TABLE items;--", library id via crafted query)
      assert: no table dropped; inputs stored/compared literally (parameterized placeholders held the payload as a value)
    - name: command-injection regression (base-scanner ffprobe)
      arrange: a filename containing shell metacharacters (e.g. "$(id).mkv", "a; rm -rf /.mkv")
      act: probe(path) via the base-scanner path (arg-slice)
      assert: the metacharacters are passed as a single argv element to ffprobe (no shell expansion); no command executed
  behavior_coverage:
    - B5 (T09, AC-5): admin-token 401 matrix covered by scenario "AC-5 admin-token matrix"
    - B7 (T06, AC-2): restart backoff + failed-after-3 covered by scenario "plugin restart/backoff"
    - B6 (T07, AC-1): ctx cancellation aborts cleanly covered by scenario "scan ctx-cancellation"
    - B5 (T07, AC-6): soft-fail aggregation covered by scenario "scan soft-fail aggregation"
    - B3 (T04, AC-1): PutItem upsert idempotency covered by scenario "store upsert idempotency + WAL"
    - B5 (T04, AC-2): parameterized SQL covered by scenario "SQL-injection regression"
    - B4 (T08, AC-1): ffprobe arg-slice covered by scenario "command-injection regression"
    uncovered_behaviors: []  # every security/resilience behavior is covered by QA-2 or the coder's contract tests
  joints_targeted:
    - internal/api middleware -> Principal (S8): admin-token matrix
    - internal/plugin -> subprocess lifecycle (S5): restart/backoff
    - internal/scan -> store + plugin (S3/S4): cancellation + soft-fail
    - internal/store -> SQLite (S9): upsert idempotency + parameterized SQL
  boundaries_targeted:
    - ffprobe subprocess: shell-metacharacter safety (arg-slice, never shell)
    - SQLite: SQL-injection (parameterized only)
    - admin token: auth boundary (AC-5)
  input_domain_targeted:
    - admin-token parser (T09): {absent, wrong scheme, wrong token, correct} + case/whitespace edge values
    - adversarial string inputs (SQL + shell): the canonical injection payloads as equivalence-class representatives
  mock_boundaries:
    mock: [ffprobe ONLY for the cancellation scenario if a real slow probe is impractical; clock/time MAY be mocked to accelerate backoff timing]
    real: [store (temp SQLite), module, scan, api, plugin Manager — real internal instances; the fake sdk.Scanner is a real 2nd impl (R8), not a double of an internal joint]
  coverage_target: S5 (restart/backoff), S8 (admin matrix), S9 (upsert + parameterized SQL), S3/S4 (cancellation + soft-fail) all show green
  acceptance_scenarios:
    - AC-5: admin-token matrix (independent of coder's middleware table test)
    - AC-2: restart/backoff + injection regressions (shippability/security)
  verify:
    cmd: cd mellifera && go test -run 'TestQA_Resilience|TestQA_Auth|TestQA_SQLInjection|TestQA_CmdInjection' ./...
    expected: all regression + matrix scenarios pass; backoff timing accelerated via mocked clock where used
