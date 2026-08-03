# Task 06 — internal/scan/run.go: drop inline enrich; enqueue (`pending` + Notify)

- **Type:** coder
- **Step:** 7 (Outline)
- **Seams:** S5 (scan migrate), S2 (stale on re-scan)
- **AC trace:** AC-async, AC-1, AC-states, AC-3
- **Project scope:** `.` (root; MODIFY `internal/scan`)
- **Deps:** Task 01 (`evStale`/`statusStale`), Task 05 (`enrich.Queue.Notify` signature)
- **Estimated LOC:** ~70 (S-M)

## behaviors

- **B1** `persist` NO LONGER calls the inline `enrich(...)` — the `enrich(ctx, mod, doc, base)` call at `run.go:147` is REMOVED. Identify + assemble-base-doc + `PutItem` remain. | ac: AC-async, AC-3 | kind: normal
- **B2** `PutItem` writes the item with `status = "pending"` (the worker advances it). The persisted document is the base §3.1 doc (`assembleBaseDoc`, `run.go:221`) carrying `parsed`+`ffprobe` so the worker can reconstruct the base (D-Q2 / S7). | ac: AC-1, AC-async | kind: normal
- **B3** After the scan stream drain loop closes (`run.go:122` `case f, ok := <-ch: if !ok`), `runScan` calls the injected `Notify(ctx, libraryID)` so the queue (re)derives pending work for the library. The notify seam is a new `Deps` field (a func), mirroring the existing `Enrich` field (`run.go:30`). | ac: AC-async, AC-1 | kind: normal
- **B4** `scan.Result` shape is UNCHANGED (`{LibraryID, Discovered, Persisted, Warnings, StartedAt, FinishedAt}`, `run.go:36-43`) — only the TIMING changes (returns with items `pending`; enrichment is async). | ac: AC-async | kind: normal
- **B5 (stale on re-scan — AC-states(c) minimal)** on `PutItem` conflict (re-scan of an existing `file_id`), if the refreshed base document/identity DIFFERS from the prior persisted document, scan advances the item `* --stale--> stale` (then the queue drives `stale --rehydrate--> pending`). Minimal B1 basis: compare the refreshed base against the prior document; if changed, set status `stale` (Task 01 transition). Full mtime/size detection is a refine (R-stale). | ac: AC-states | kind: edge
- **B6 (deprecate-don't-delete)** the `enricher` unexported seam (`run.go:74`) + `prodEnricher` (`run.go:78`) are KEPT (the serial path stays available for sync/test; the queue worker calls `enrich.Enrich` too). They are simply no longer invoked from `persist`. | ac: AC-3 | kind: normal
- **B7** Hard-fail / soft-fail discipline unchanged: a cancelled context returns an error so `runScan` stops draining (`run.go:120`); Identify/PutItem errors are soft warnings (AC-6) — scan continues. | ac: AC-1 | kind: error

## invariants

- **INV-non-blocking:** `POST /scan` returns after discovery + identify + persist (items `pending`); it does NOT await enrichment. This is the feature's purpose (AC-async). `Notify` is a non-blocking handoff (the queue feeds its own channel; `Notify` does not block on drain).
- **INV-result-shape:** `scan.Result` fields are unchanged (Discovered/Persisted/Warnings/StartedAt/FinishedAt). Only timing changes — backward-compat for clients.
- **INV-persist-base:** the persisted document MUST carry `parsed` (+ `ffprobe` when present) so the worker reconstructs the base WITHOUT a re-probe (D-Q2). `assembleBaseDoc` (`run.go:221`) already does this — do not strip those fields.
- **INV-notify-seam:** `Notify` is injected via `scan.Deps` (a func field), mirroring `Enrich` — so the in-package scan test can inject a fake (R8) and `cmd/mellifera` wires `queue.Notify`. scan imports enrich ONLY for the `Notify`/`Deps` types (INV-downward preserved: enrich never imports scan).
- **INV-stale-minimal:** B1 stale-detection is the minimal "base changed → stale" comparison. If a robust signal is unavailable cheaply, fall back to re-queuing on re-scan (status→pending so the queue re-derives); the `stale` transition + literal land regardless (Task 01). (R-stale mitigation.)
- **INV-idempotent-upsert:** `PutItem` upserts by `file_id` (`items.go:51`) — a re-scan of an unchanged file preserves `id`/`created_at`; only mutable fields + `updated_at` refresh.

## precondition

Task 01 landed (`evStale`/`statusStale`/`*--stale-->stale`). Task 05 landed or its `Notify` signature is agreed (`(q *Queue) Notify(ctx context.Context, libraryID int64)` — contracts §Queue.Notify). Phase A `internal/scan/run.go` exists: `Deps` (`:26-31`), `Result` (`:36-43`), `Run` (`:57`), `runScan` (`:88`, drain loop `:117-131`), `persist` (`:141`, the inline enrich call at `:147`, `PutItem` at `:153`), `enricher`/`prodEnricher` (`:74,78`), `assembleBaseDoc` (`:221`), `newItem` (`:164`).
- evidence: `internal/scan/run.go:141-159` (`persist` — the migration point), `:147` (the inline `enrich(...)` to remove), `:153` (`PutItem`), `:117-131` (drain loop), `:74,78` (`enricher`/`prodEnricher` — kept), `:221-239` (`assembleBaseDoc`), `:36-43` (`Result`).
- evidence (Notify contract): `contracts.md §Queue.Notify`.

## postcondition

`internal/scan/run.go`'s `persist` writes items `pending` with the base doc (NO inline enrich); `runScan` calls `Deps.Notify(ctx, libraryID)` after the drain closes; re-scan of a changed file sets `stale`. `scan.Result` shape unchanged. `scan/*_test.go` extended: the inline-enrich call is gone (assert `persist` does not invoke the `enricher` seam), `PutItem` receives `status=="pending"`, and `Notify` is called once after drain (injected fake). `go test ./internal/scan/...` green.

## test_seed

In-package fakes (R8 — `scan.enricher`/`scan.scannerResolver` seams already exist): inject a fake `Notify` (a new seam) that records the `libraryID` it was called with. Cases:
- persist-writes-pending: drive `runScan` with a fake scanner emitting one file + a fake `Identify`; assert `PutItem` was called with `status=="pending"` and the document carries `parsed`; assert the fake `enricher` seam was NOT invoked (the inline call is gone).
- notify-after-drain: after the stream closes, assert the fake `Notify` was called exactly once with the correct `libraryID`; assert it was called AFTER `Persisted` was incremented (post-drain).
- result-shape-unchanged: assert `Result{Discovered,Persisted,Warnings,StartedAt,FinishedAt}` shape is identical to Phase A (the test's struct literal compiles unchanged).
- ctx-cancel: cancel mid-drain → `runScan` returns `ctx.Err()`; `Notify` is NOT called (drain did not complete).
- stale-on-rescan (minimal): pre-seed an item via `PutItem`; re-scan with a fake `Identify` returning a DIFFERENT parsed blob → the upsert sets `status=="stale"` (the minimal "base changed" basis). Re-scan with the SAME parsed blob → status stays `pending` (no spurious stale). (If the minimal comparison proves too brittle in B1, the coder MAY fall back to status→pending on every re-scan conflict and document the choice — INV-stale-minimal permits it; the `stale` literal/transition still exist from Task 01.)

## callers_to_update

- `internal/scan/run.go` — MODIFY `Deps` (add `Notify` field), `Run`/`runScan` (thread the notify seam + call it post-drain), `persist` (remove inline enrich at `:147`; write `pending`). evidence: `internal/scan/run.go:26-31,57,88,117-131,141-159`.
- `internal/scan/doc.go` — MODIFY: document the async handoff (scan persists `pending` + notifies the queue; no inline enrich). (Fold of Outline step 7's doc note.)
- `internal/scan/*_test.go` — MODIFY: the existing scan tests inject the new `Notify` seam; assert no inline enrich.
- `cmd/mellifera/main.go` — wiring updates in Task 07 (constructs the queue + passes `q.Notify` into `scan.Deps`). This task defines the `Deps.Notify` FIELD; Task 07 fills it.

## allowed_imports

- `context`, `encoding/json`, `fmt`, `time` (stdlib — already imported)
- `github.com/mellifera/mellifera/internal/enrich` (for the `Notify`/`Deps` types — `scan.Deps.Enrich` already imports `enrich`)
- `github.com/mellifera/mellifera/internal/module`
- `github.com/mellifera/mellifera/internal/plugin`
- `github.com/mellifera/mellifera/internal/store`
- `github.com/mellifera/mellifera/pkg/sdk`
- `github.com/mellifera/mellifera/proto/mellifera/scanner/v1` (scannerv1)

## allowed_categories

- `stdlib`

## test_exclusions

- `Deps` and `Result` are data structs — covered via the `Run`/`runScan` tests (populated/consumed), no standalone test.
- The `Notify` seam type is a func typedef — covered via the injected-fake test.
- `Run`/`runScan`/`persist` ARE logic — table test required (the existing scan tests are extended).

## negative_examples

- DO NOT await enrichment in `persist` / `runScan` (INV-non-blocking — AC-async).
- DO NOT change `scan.Result`'s field set (INV-result-shape — backward-compat).
- DO NOT strip `parsed`/`ffprobe` from the persisted document (INV-persist-base — the worker reconstructs from it).
- DO NOT remove the `enricher`/`prodEnricher` seam (AC-3 — deprecate-don't-delete; the serial path stays).
- DO NOT import `api` (scan→api is forbidden; api calls scan).
- DO NOT have scan construct or Start the queue — that is `cmd/mellifera`'s job (Task 07); scan only CALLS the injected `Notify`.

## existing_code_snapshot

```go
// internal/scan/run.go:26-31 (Deps — gains a Notify field; Enrich kept)
type Deps struct {
	Store   *store.Store
	Plugins *plugin.Manager
	Modules *module.Registry
	Enrich  enrich.Deps
}
// internal/scan/run.go:141-159 (persist — the migration point)
func persist(ctx, st, sc, f, mod, libraryID, enrich, res) error {
	identified, err := sc.Identify(...)              // :142 — KEEP
	...
	doc, status, er, enrichErr := enrich(ctx, mod, assembleBaseDoc(...), identified)  // :147 — REMOVE
	...
	st.PutItem(ctx, newItem(f, mod, libraryID, marshalDoc(doc), status))              // :153 — status becomes "pending"
}
// internal/scan/run.go:117-131 (drain loop — Notify fires after `if !ok` at :122)
// internal/scan/run.go:74,78 (enricher/prodEnricher — KEPT, just unused by persist now)
```

## contract_test_scope

- **joint (S5):** `internal/scan.runScan -> enrich.Queue.Notify` | assert: scan returns with items `pending`; the inline enrich call is gone; `Notify(libraryID)` is called once after the drain closes; `scan.Result` shape unchanged. Verified in `scan/*_test.go` with an injected fake Notify.
- **joint (S2 scan-half):** `internal/scan.persist -> nextState(stale)` | assert: a re-scan of a changed file sets `stale` (minimal basis). Verified in the stale-on-rescan case.

## scope_boundary

- MODIFY `internal/scan/run.go` (`Deps` + `Run`/`runScan`/`persist`; remove the `:147` inline call; post-drain Notify; minimal stale-on-rescan).
- MODIFY `internal/scan/doc.go` (document the async handoff).
- MODIFY `internal/scan/*_test.go` (inject the Notify seam; assert no inline enrich + pending status + post-drain notify).

## out_of_scope

- The `enrich.Queue` itself (Task 05) and `cmd` wiring (Task 07).
- Full mtime/size change-detection (R-stale refine — B1 minimal basis only).
- The `stale`/`ready` literals or `nextState` rows (Task 01).

## line_budget

70 (flex 1.3 — the stale comparison may add a helper)

## acceptance_criteria

- AC-async (non-blocking scan; returns with items pending)
- AC-1 (scan persists pending + base doc; notifies the queue)
- AC-states (stale on re-scan change — minimal)
- AC-3 (result shape unchanged; serial seam preserved)

## refactoring_checklist

- `cd mellifera && go test ./internal/scan/...` green.
- `grep -nE 'enrich\(ctx, mod' internal/scan/run.go` → 0 hits (the inline call at `:147` is gone).
- `grep -nE 'statusFailed|statusParsed|statusEnriched' internal/scan/run.go` → 0 hits (scan no longer drives those — it writes `pending`/`stale`).
- `grep -nE 'Notify' internal/scan/run.go` → ≥2 hits (the `Deps` field + the post-drain call).
- `grep -nE 'type Result struct' internal/scan/run.go` → unchanged field set (AC-3 backward-compat).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK.

## source_anchor

MODIFY `internal/scan/run.go:26-31` (Deps), `:57,88` (Run/runScan thread Notify), `:117-131` (drain → Notify), `:141-159` (persist: remove `:147`, write `pending`), `:164-176` (`newItem` carries status). MODIFY `internal/scan/doc.go`. Test seam model: `internal/scan/run.go:74,78` (`enricher`/`prodEnricher`).

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
