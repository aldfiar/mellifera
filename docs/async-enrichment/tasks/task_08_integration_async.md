# Task 08 — integration_async_test.go: the AC-1 async golden (scan → pending → drain → ready)

- **Type:** coder (integration)
- **Step:** 9 + 10 (Outline) — VERIFY `internal/api` no-edit + CREATE the async golden
- **Seams:** S9 (?status= passthrough), S-integration
- **AC trace:** AC-1, AC-async, AC-states, AC-3
- **Project scope:** `.` (root; CREATE `integration_async_test.go` in `package mellifera_test`)
- **Deps:** Tasks 01-07 all landed (the full async substrate + wiring)
- **Estimated LOC:** ~180 (M)

## behaviors

- **B1** `TestIntegrationAsyncPipeline` is the AC-1 golden: it drives the FULL async pipeline (api → scan → `PutItem(pending)` → `Notify` → `enrich.Queue` worker pool → tv-parser subprocess → store) with REAL go-plugin subprocesses (base-scanner + tv-parser) + REAL ffprobe over a TV fixture, and asserts each item reaches `status='ready'` with `sources["tv-parser"]` + a `_provenance` entry naming `tv-parser` + `_view` + `_stages`. | ac: AC-1 | kind: normal
- **B2 (AC-async — non-blocking)** the scan HTTP response returns BEFORE items reach `ready`: immediately after `POST /scan` returns, `GET /items?status=pending` returns ≥1 item (the scan did not block on enrichment); after a bounded poll, all items reach `ready`. | ac: AC-async | kind: normal
- **B3 (AC-1 — no inline enrich remains)** the integration confirms (observably) that enrichment is async: the scan response is prompt and items transition `pending → ready` over time via the background pool, not inline. | ac: AC-1 | kind: normal
- **B4 (AC-states — ?status= filters)** `GET /items?status=ready` lists settled items (post-drain); `?status=pending` lists in-flight items (mid-drain). Both pass through the unchanged `?status=` handler (`handlers.go:126`). | ac: AC-states, AC-1 | kind: normal
- **B5 (AC-3 additive — response shape unchanged)** the scan response carries `{library_id, discovered, persisted, warnings}` (the Phase A `scanResponse` shape, `handlers.go:47-52`) — asserted by the same DTO the existing harness deserializes. | ac: AC-3 | kind: normal
- **B6 (lease/ledger observable consequences)** the golden asserts the observable consequences of the lease + unavailable-source handling: NO duplicate `_stages` entries for one item (the lease serialized within-item) and `sources.tmdb` is ABSENT (tmdb is SERVER→queued→derived, but its plugin is unloaded → `outcomeUnavailable` → no namespace + no ledger; the item still reaches `ready` because tv-parser succeeded). | ac: AC-1, AC-lease | kind: edge
- **B7 (clean skip)** the test skips cleanly under `-short` or missing `ffprobe`/`ffmpeg` / missing plugin binaries (mirror the existing `integration_test.go` skip rules — INV-skip-clean). | ac: AC-1 | kind: edge

## invariants

- **INV-real-subprocesses:** REAL go-plugin subprocesses (base-scanner + tv-parser) + REAL ffprobe + REAL HTTP client driving the REAL server subprocess. No in-process fakes at this layer (the unit tests in Tasks 03-05 cover the fakes; this is the black-box proof). Reuses the scan-library harness (`buildBinary`, `startServer`, `waitForReady`, `doRequest`, `scanLibrary`, `listItems`, `parseDoc` — `integration_test.go`).
- **INV-poll-bounded:** the "wait for ready" poll is BOUNDED (e.g. `for deadline { if allReady { return }; time.Sleep(poll) }` then fail with a timeout + the last observed statuses). Never an unbounded hang.
- **INV-skip-clean:** under `-short`, missing `ffprobe`, or missing plugin binaries → `t.Skip` with a clear reason (mirror `integration_test.go`). An environment without the deps does not FAIL the suite.
- **INV-no-api-edit:** this task makes NO edit to `internal/api` — it only VERIFIES the `?status=` passthrough (S9) via the existing endpoint. If the test reveals an api gap, HALT (do not edit `internal/api` without a new task — AC-3 additivity).
- **INV-async-is-the-point:** the test does NOT treat "items pending at scan return" as a failure — it ASSERTS it (AC-async). The Phase A integration test (`integration_pipeline_test.go`) asserted items were enriched at scan return; B1 inverts that (items pending at return, ready after drain).

## precondition

Tasks 01-07 landed and the binary builds. The scan-library integration harness exists in `package mellifera_test` (`integration_test.go`: `buildBinary:106`, `startServer:195`, `waitForReady:246`, `doRequest:276`, `createLibrary:320`, `scanLibrary:339`, `listItems:363`, `parseDoc:399` + the fixture writers). `ffprobe`/`ffmpeg` + the built plugin binaries (`bin/base-scanner`, `bin/tv-parser`) are the runtime deps (skip-if-missing). Phase A `integration_pipeline_test.go` is the structural analog (the AC-1 serial golden this inverts to async).
- evidence: `integration_test.go:53` (`TestIntegrationScanLibrary`), `:106` (`buildBinary`), `:195` (`startServer`), `:246` (`waitForReady`), `:276` (`doRequest`), `:339` (`scanLibrary`), `:363` (`listItems`), `:399` (`parseDoc`); `integration_pipeline_test.go` (the analog).
- evidence (api no-edit): `internal/api/handlers.go:120-128` (`listItems` — `?status=` already passes any value); `:97` (`scanLibrary`).

## postcondition

`integration_async_test.go` exists in `package mellifera_test`; it reuses the harness, asserts the AC-1 golden + AC-async + AC-states + AC-3, skips cleanly when deps are missing, and polls boundedly for `ready`. `go test ./...` green (integration runs when deps present, skips otherwise). `internal/api` is UNCHANGED (verified by `git diff`).

## test_seed

Reuse the harness; do NOT duplicate `startServer`/`buildBinary`. Structure:
- `TestIntegrationAsyncPipeline`: build binaries (server + base-scanner + tv-parser) via `buildBinary`; `startServer` on a temp DB + free port; `waitForReady`; create a TV library over a fixture dir (SxxExx media via the harness fixture writers); `POST /scan`.
- immediately (AC-async): `GET /items?status=pending` → assert ≥1 item (scan returned without blocking on enrich); assert the scan response shape (`discovered`/`persisted` non-zero, AC-3).
- bounded poll (AC-1): loop until every item's `status == "ready"` (use `parseDoc` on each `listItems` row) or a ~10s deadline; on deadline fail with the last observed statuses.
- post-drain assertions (AC-1): for each item, `doc["sources"]["tv-parser"]` is present; `doc["_provenance"]["<field>"]["plugin_id"] == "tv-parser"` for at least one field; `doc["_view"]` non-empty; `doc["_stages"]` has an `ok` entry for `tv-parser`; `status == "ready"`.
- AC-states: `GET /items?status=ready` returns all items; `?status=pending` returns none post-drain (both via the unchanged handler).
- AC-lease observable: no item has TWO `_stages` entries with the same `plugin_id`+`started_at` (the lease serialized within-item); `sources.tmdb` is absent (unloaded → unavailable, no namespace).
- skip rule: `testing.Short()` OR missing `ffprobe`/`ffmpeg`/binaries → `t.Skipf(...)` (mirror `integration_test.go`).
- (B2 unit-covered, referenced): the lease mutual-exclusion race + the fail→exhausted→ledger chain are unit-tested in `internal/enrich/queue_test.go` (Task 05) — the integration test asserts their observable consequences (B6), not the race/ledger directly, because B1's seeded config has no failing source.

## callers_to_update

- (none — NEW test file. It consumes the existing harness helpers in `integration_test.go` and the server built by Task 07's wiring.)

## allowed_imports

- `context`, `encoding/json`, `net/http`, `os`, `os/exec`, `path/filepath`, `strconv`, `strings`, `testing`, `time` (stdlib — match the existing integration test's imports)
- (NO internal-package imports — this is `package mellifera_test`, a black-box HTTP driver. It does NOT import `internal/enrich`/`internal/scan`/etc.; it drives the server over HTTP + reads `itemDTO`/`scanResponse` wire shapes declared in the test file, mirroring `integration_test.go`.)

## allowed_categories

- `stdlib`

## test_exclusions

- Integration tests are not subject to the per-symbol co-located-test rule (they are black-box scenarios, not symbol tests). The per-symbol rule is satisfied by the unit tests in Tasks 01-05.

## negative_examples

- DO NOT edit `internal/api` (INV-no-api-edit — AC-3 additivity; the `?status=` passthrough already works).
- DO NOT treat "items pending at scan return" as a failure — ASSERT it (INV-async-is-the-point).
- DO NOT write an unbounded poll — bound it + fail with diagnostics on timeout (INV-poll-bounded).
- DO NOT duplicate `startServer`/`buildBinary`/`scanLibrary` — reuse the harness.
- DO NOT import `internal/*` (black-box; `package mellifera_test`).
- DO NOT assert the ledger race directly in e2e — B1's seeded config has no failing source; assert the observable consequences (B6) + rely on the unit test (Task 05).

## existing_code_snapshot

```go
// integration_test.go (the harness — reused, NOT duplicated)
//   func buildBinary(t, tmp, name, pkg) string                 // :106
//   func startServer(t, serverBin, scannerBin, tvParserBin, tmp, token) string  // :195
//   func waitForReady(baseURL) bool                            // :246
//   func doRequest(t, c, method, url, token, body, out) int    // :276
//   func scanLibrary(t, c, baseURL, token, id) scanResponse    // :339
//   func listItems(t, c, baseURL, token, id) []itemDTO         // :363
//   func parseDoc(t, it) itemDoc                               // :399
// integration_pipeline_test.go (the Phase A serial AC-1 golden — the structural analog this INVERTS to async)
// internal/api/handlers.go:120-128 (listItems — ?status= passthrough, UNCHANGED)
// internal/api/handlers.go:47-52 (scanResponse shape — UNCHANGED, AC-3)
```

## contract_test_scope

- **joint (S9):** `internal/api ?status= -> store.QueryItems` | assert: `?status=ready` lists settled items; `?status=pending` lists in-flight — both via the unchanged handler. Verified here (black-box).
- **joint (S-integration):** the full async vertical (api → scan → queue → tv-parser → store) | assert: AC-1 golden (drain to ready + provenance) + AC-async (non-blocking). Verified here.

## scope_boundary

- CREATE `integration_async_test.go` (package `mellifera_test`).
- VERIFY (no edit) `internal/api/handlers.go` — the `?status=` passthrough + `scanResponse` shape.

## out_of_scope

- Editing `internal/api` (forbidden — AC-3; if a gap appears, HALT for a new task).
- The lease race / ledger-exhaustion as direct e2e assertions (unit-tested in Task 05; this task asserts observable consequences only).
- Image/TMDB sources (B2/B3 — deferred).
- Modifying the existing `integration_test.go` / `integration_pipeline_test.go` (reuse only).

## line_budget

180 (flex 1.2)

## acceptance_criteria

- AC-1 (golden async e2e: scan → pending → drain → ready + provenance + sources.tv-parser)
- AC-async (scan returns before ready; ≥1 pending at return)
- AC-states (?status=ready/pending filters)
- AC-3 (scan response shape unchanged; api unedited)

## refactoring_checklist

- `cd mellifera && go test -run TestIntegrationAsyncPipeline ./...` green (when deps present; skips cleanly otherwise).
- `git diff --stat -- internal/api/` → empty (NO api edit — AC-3).
- `grep -nE 't\.Skip' integration_async_test.go` → ≥1 hit (INV-skip-clean).
- `grep -nE 'for .*ready|deadline|timeout' integration_async_test.go` → ≥1 hit (INV-poll-bounded).
- `grep -nE 'status.*pending' integration_async_test.go` → ≥1 hit (AC-async assertion present).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (integration test co-located; no symbol-budget impact — it is `_test` + `package mellifera_test`).

## source_anchor

CREATE `integration_async_test.go` (repo root, `package mellifera_test`). Harness: `integration_test.go:106,195,246,276,339,363,399`. Analog: `integration_pipeline_test.go`. Verified-no-edit: `internal/api/handlers.go:47-52,120-128`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
