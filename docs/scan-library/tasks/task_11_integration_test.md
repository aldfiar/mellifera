- [x] Task 11 (coder): Integration test — AC-1 golden (end-to-end scan)
  target: mellifera/integration_test.go (or mellifera/cmd/mellifera/integration_test.go) | action: CREATE
  archetype: external-services
  skill_hint: stack-patterns
  feature_goal: (see T01)
  why: THE golden test. Proves the architecture end-to-end including the subprocess boundary (S5): API → module → plugin manager → base-scanner SUBPROCESS → ffprobe → store → list. If wiring is wrong, AC-1 fails here. Also covers AC-4 (path-traversal fixture) + AC-6 (unprobeable fixture). The reviewer re-derives expected parsed title/season/episode from the fixture filenames — assert EXACT values, not "some item persisted".
  data_flow: enters from: a fixture directory of TV-named files + a temp SQLite DB + a random port → transforms: build base-scanner + server binaries; start server; POST /libraries; POST /scan; GET /items → emits to: assertions on persisted items (parsed fields + ffprobe blob) + warnings.
  related: producers T08 (base-scanner binary), T10 (server wiring); seam S-integration (whole system); validates S1,S2,S3,S4,S5,S6,S7,S9,S10,S11 jointly.
  imports:
    - (test deps only) net/http, encoding/json, os/exec, path/filepath, testing, context, time, strings
    - github.com/mellifera/mellifera/internal/store  # only if seeding module directly; prefer going through the API
  allowed_imports:
    - net/http
    - encoding/json
    - os/exec
    - os
    - path/filepath
    - testing
    - context
    - time
    - strings
    - fmt
  allowed_categories:
    - stdlib
  precondition: |
    The full server builds (`go build ./cmd/mellifera`) + base-scanner builds (`go build ./plugins/base-scanner`) — T08, T10 done. ffprobe MAY be on PATH (test SKIPs the ffprobe-dependent assertions cleanly if absent, but MUST still assert identification + warnings).
  behaviors:
    - B1: builds the base-scanner binary + the server binary to temp paths | ac: AC-1 | kind: normal
    - B2: starts the server on a temp SQLite DB + random port with a known admin token; seeds the TV module | ac: AC-1 | kind: normal
    - B3: `POST /api/v1/libraries` (Bearer token, root_path = fixture dir) → 2xx + library id | ac: AC-1 | kind: normal
    - B4: `POST /api/v1/libraries/{id}/scan` → blocks/polls until scan done → scan response reports the count | ac: AC-1 | kind: normal
    - B5: `GET /api/v1/items?library={id}` → items with parsed `title="Breaking Bad"`, `season=1`, `episode=1` + a NON-EMPTY ffprobe blob (assert EXACT parsed values) | ac: AC-1 | kind: normal
    - B6: a Cyrillic-title fixture (e.g. "Игра престолов S01E01.mkv") parses title correctly (Russian first-class) | ac: AC-1 | kind: edge
    - B7: a path-traversal escape fixture (symlink out / `..`) → skipped + warned; NO item persisted for it; nothing outside root probed (AC-4) | ac: AC-4 | kind: edge
    - B8: an unprobeable fixture (zero-byte / unrecognized) → item persisted with EMPTY ffprobe + a warning; scan completes (AC-6) | ac: AC-6 | kind: error
    - B9: re-scan is idempotent — POST /scan again → same item count (PutItem upsert by file_id), no duplicates | ac: AC-1 | kind: edge
  invariants:
    - INV1: Assert EXACT parsed values derived from the fixture filenames (reviewer re-derives independently). NOT "some item was persisted". For "Breaking Bad S01E01.mkv" → title="Breaking Bad", season=1, episode=1.
    - INV2: The test MUST launch the REAL base-scanner SUBPROCESS (via the server wiring) — not an in-process fake. This is what proves arch §0 principle 2 (subprocess isolation). An in-process-only test does NOT satisfy AC-1.
    - INV3: Cyrillic fixture is mandatory (conventions.md §Russian-language — proves Russian-first-class is real).
    - INV4: ffprobe-absent → SKIP cleanly (do not fail CI). Still assert identification + warnings where ffprobe is not required.
  postcondition: |
    (AC-1/AC-4/AC-6) The golden integration test passes end-to-end: real subprocess, exact parsed values, Cyrillic handled, path-traversal rejected+warned, unprobeable soft-fails, re-scan idempotent. This is the foundational proof of the architecture.
  test_seed: |
    # arrange: fixture dir w/ Breaking Bad S01E01.mkv, Игра престолов S01E01.mkv, an escaping symlink, a zero-byte file; temp DB; built binaries. act: start server; POST libraries; POST scan; GET items. assert: items[Breaking Bad].title=="Breaking Bad", season==1, episode==1, ffprobe non-empty; Cyrillic title parsed; escape → 0 items + warning; zero-byte → empty ffprobe + warning + item present; re-scan → same count.
  spec: |
    Signatures:
    func TestIntegrationScanLibrary(t *testing.T)  // the golden test (build-tagged or separate package if needed)

    Steps:
    1. Build binaries: `go build -o <tmp>/mellifera ./cmd/mellifera`; `go build -o <tmp>/base-scanner ./plugins/base-scanner`.
    2. Fixture dir (committed under testdata/ or created in t.TempDir()): "Breaking Bad/Season 1/Breaking Bad S01E01.mkv" (small real media OR a stub — ffprobe assertions SKIP if ffprobe absent), "Игра престолов S01E01.mkv" (Cyrillic), an escaping symlink → /etc/passwd (or outside root), a zero-byte "bad.mkv".
    3. Start server: exec the mellifera binary w/ env (data dir = t.TempDir(), admin token, base-scanner path = <tmp>/base-scanner, port = random free port). Wait for readiness.
    4. Seed TV module (via the store seed from T05, or a direct API/seeding step).
    5. POST /libraries (Bearer) → capture id. POST /libraries/{id}/scan → wait for completion. GET /items?library={id}.
    6. Assert: exact parsed title/season/episode for the fixtures (INV1); Cyrillic parsed; escaping fixture → no item + warning present; zero-byte → empty ffprobe + warning + item present; re-scan → same count (idempotent).
    7. ffprobe-absent guard: `if _, err := exec.LookPath("ffprobe"); err != nil { t.Skip("ffprobe not on PATH — skipping ffprobe-blob assertions") }` — but STILL assert identification + warnings.
  test_exclusions:
    - "(none — this IS the test)"
  error_handling:
    - "server fails to start / not ready in time": t.Fatal with the server's stderr captured for diagnosis.
    - "ffprobe absent": t.Skip the ffprobe-blob assertions; keep identification + warning assertions.
  callers_to_update: []
  contract_test_scope:
    - joint: whole system (S-integration) | assert: POST /libraries → POST /scan → GET /items returns items with exact parsed fields + ffprobe blob via the real base-scanner subprocess
  negative_examples:
    - "DO NOT assert just 'some item was persisted' — assert EXACT parsed title/season/episode (reviewer re-derives)."
    - "DO NOT skip the subprocess boundary — the test MUST launch the real base-scanner binary (arch §0 principle 2)."
    - "DO NOT omit the Cyrillic fixture (Russian-first-class must be proven)."
    - "DO NOT fail CI when ffprobe is absent — SKIP cleanly."
  existing_code_snapshot: |
    (GREENFIELD — integration_test.go does not exist. evidence: source_baseline.md:14.)
  source_anchor: acceptance.md:21-25 (AC-1 scenario); integration_map.md:24 (S-integration); File Map implementation_plan.md:170 (integration_test.go row); architecture_review.md:122-128 (golden-test rule)
  scope_boundary: "This task ONLY creates mellifera/integration_test.go (+ optional testdata fixtures). No other files."
  out_of_scope:
    - enriching items with metadata (DEFERRED)
    - streaming/playback (DEFERRED)
  line_budget: 500
  line_budget_flex: 1.4
  acceptance_criteria:
    - scenario: AC-1 | given: ffprobe on PATH + fixture dir | when: POST libraries + scan + GET items | then: items w/ exact parsed fields + ffprobe blob
    - scenario: AC-4 | given: escaping fixture | when: scan | then: skipped + warned, no item, nothing outside root probed
    - scenario: AC-6 | given: unprobeable fixture | when: scan | then: empty ffprobe + warning, item present, scan completes
  verify: cd mellifera && go test -run TestIntegrationScanLibrary ./...
