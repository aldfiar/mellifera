# Task 02 — internal/store/ledger.go: `enrichment_failures` ledger methods

- **Type:** coder
- **Step:** 2 (Outline)
- **Seams:** S1 (store ledger)
- **AC trace:** AC-ledger, AC-2
- **Project scope:** `.` (root; CREATE in `internal/store`)
- **Deps:** none (leaf — the `enrichment_failures` table ALREADY EXISTS from Phase A; NO DDL)
- **Estimated LOC:** ~110 (S)

## behaviors

- **B1** `type FailureRow struct { ItemID, PluginID, Status, Reason string; Attempts int; FailedAt, NextEligibleAt time.Time }` — the ledger row DTO (arch §9.1 shape). | ac: AC-ledger | kind: normal
- **B2** `(s *Store) RecordFailure(ctx, itemID, pluginID, status, reason string, attempts int, nextEligible time.Time) error` — upsert a terminal ledger row keyed by `(item_id, plugin_id)`. On conflict it UPDATES `status`,`reason`,`attempts`,`failed_at`,`next_eligible_at` (the cooldown advances). Written ONLY on terminal failure (`exhausted`/`no_data`) — the caller (Task 05) guarantees this; the store does not police the status set (INV-value-agnostic-store). | ac: AC-ledger | kind: normal
- **B3** `(s *Store) ClearFailure(ctx, itemID, pluginID string) error` — reset-on-success: `DELETE` the row. Idempotent — no error if the row is absent (arch §4.4 reset-on-success; the hot path stays near-zero writes on success: the doc `PutItem` happens anyway + this one-row delete on recovery). | ac: AC-ledger | kind: normal
- **B4** `(s *Store) ListFailures(ctx context.Context) ([]FailureRow, error)` — return all ledger rows (admin observability + the derivation's cooldown source). Single-instance MVP: the ledger is terminal-only and small; the queue filters in-memory. | ac: AC-ledger | kind: normal
- **B5** `next_eligible_at` round-trips losslessly: `RecordFailure` persists it via `formatTime` (RFC3339Nano TEXT, `open.go:214`); `ListFailures` reads it back via `parseTime` (`open.go:217`) — a row within cooldown is distinguishable from one past eligibility by comparing `NextEligibleAt` to `now`. | ac: AC-ledger | kind: edge

## invariants

- **INV-value-agnostic-store:** the store owns the `enrichment_failures` TABLE + these METHODS; it does NOT own the status string set or the cooldown schedule. `status` is an opaque column value; the caller computes `nextEligible` (the §4.4 doubling schedule 7d→14d→28d cap 365d is owned in `internal/enrich`, Task 05). `RecordFailure` persists exactly what it is given.
- **INV-parameterized-SQL:** `?` placeholders ONLY — `status`/`itemID`/`pluginID` are NEVER interpolated (conventions.md §SQL; mirror `items.go:54,101,107`). Upsert uses `INSERT … ON CONFLICT(item_id, plugin_id) DO UPDATE SET …` mirroring `PutItem` (`items.go:51-63`).
- **INV-no-DDL:** the `enrichment_failures` table already exists (`open.go:98-107`: `item_id, plugin_id, status, reason, attempts, failed_at, next_eligible_at, PRIMARY KEY(item_id, plugin_id)`). This task adds METHODS only — NO migration, NO `open.go` edit.
- **INV-idempotent-clear:** `ClearFailure` on a missing row returns `nil` (sql.ErrNoRows is NOT an error for a DELETE that matches nothing — `sql.Result.RowsAffected` is ignored).
- **INV-rare-writes:** these methods are called ONLY on terminal failure / reset-on-success / derivation-read — never per-claim, never per-success (the queue discipline; Task 05 enforces the call sites).

## precondition

The `enrichment_failures` table EXISTS in the schema (`open.go:98-107`, created in Phase A) with columns `item_id TEXT, plugin_id TEXT, status TEXT, reason TEXT, attempts INTEGER, failed_at TEXT, next_eligible_at TEXT, PRIMARY KEY(item_id, plugin_id)`. `store.Store`, `formatTime`, `parseTime` exist (`open.go:21,214,217`). The `items.go` upsert (`items.go:42-71`) is the parameterized-SQL model to mirror.
- evidence: `internal/store/open.go:98-107` (table DDL — verbatim arch §9.1), `:21` (`Store`), `:214` (`formatTime`), `:217` (`parseTime`); `internal/store/items.go:51-63` (`PutItem` upsert model).
- evidence (no DDL needed): `architecture_review.md:79` (G2 ✓ — table EXISTS); `source_baseline.md:71-72`.
- foundational fold: the "enrichment_failures table" Foundational Setup item is satisfied by Phase A — NO migration task. Recorded in `task_interactions.md`.

## postcondition

`internal/store/ledger.go` exists with `FailureRow` + `RecordFailure`/`ClearFailure`/`ListFailures`; `internal/store/ledger_test.go` is table-driven across record/upsert-update/clear-idempotent/list-round-trip + the `next_eligible_at` cooldown distinguishability assertion. `go test ./internal/store/...` green. Store exported-symbol count: 4 → 5 (`FailureRow` is the +1; the 3 methods are methods on `*Store` and don't count per the budget convention — under the ≤8 gate, ≤12 fail).

## test_seed

Table-driven, in-package (`internal/store/ledger_test.go`), reusing the existing store test temp-DB harness (`internal/store/store_test.go` opens a temp `*Store` — mirror its setup). Cases:
- record → list round-trip: `RecordFailure(ctx,"itm_1","tv-parser","exhausted","rpc timeout",3,now+7d)` then `ListFailures` returns 1 row with all fields equal (status, reason, attempts=3, NextEligibleAt ≈ now+7d).
- upsert-update: a second `RecordFailure` for the same `(item_id,plugin_id)` with attempts=4 + later `nextEligible` → `ListFailures` still returns exactly 1 row (PK conflict → UPDATE), with the newer attempts/nextEligible.
- clear-idempotent: `ClearFailure` on a present row → `ListFailures` returns 0 rows; `ClearFailure` again on the absent row → returns `nil` (no error).
- cooldown distinguishability (the S1 joint data-level assertion): record a row with `nextEligible = now+7d`; assert `row.NextEligibleAt.After(now)` (within cooldown) and `row.NextEligibleAt.Before(now+8d)` — the data the derivation (Task 05) will compare against `now`.

## callers_to_update

(none yet — NEW file. The consumers are wired in Task 05: `enrich.Queue`'s derivation reads `ListFailures`; the dispatch calls `RecordFailure`/`ClearFailure`.)

## allowed_imports

- `context`, `database/sql`, `fmt`, `time` (stdlib — all already imported by `items.go`/`open.go`)
- (no new internal imports — `ledger.go` lives in package `store` and uses the package-local `formatTime`/`parseTime` + `s.db`)

## allowed_categories

- `stdlib`

## test_exclusions

- `FailureRow` is a data DTO — covered via the `RecordFailure`/`ListFailures` round-trip (populated/consumed), no standalone test.
- The 3 methods ARE logic (SQL + idempotency) — NOT excluded; table test required.

## negative_examples

- DO NOT add a migration / edit `open.go` — the table EXISTS (`open.go:98`). A second `CREATE TABLE` is dead code.
- DO NOT interpolate `status`/`itemID`/`pluginID` into SQL — `?` placeholders only (INV-parameterized-SQL).
- DO NOT own the cooldown schedule here — `nextEligible` is a param (caller-computed). The store is value-agnostic.
- DO NOT return an error from `ClearFailure` when the row is absent — idempotent reset-on-success.
- DO NOT call these methods per-claim or per-success — rare terminal/reset writes only (Task 05 enforces).

## existing_code_snapshot

```sql
-- internal/store/open.go:98-107 (EXISTS — do NOT re-create)
CREATE TABLE IF NOT EXISTS enrichment_failures (
  item_id          TEXT NOT NULL,
  plugin_id        TEXT NOT NULL,
  status           TEXT NOT NULL,
  reason           TEXT,
  attempts         INTEGER NOT NULL,
  failed_at        TEXT NOT NULL,
  next_eligible_at TEXT NOT NULL,
  PRIMARY KEY (item_id, plugin_id)
)
```
```go
// internal/store/items.go:51-63 (the upsert model to mirror)
_, err := s.db.ExecContext(ctx, `
INSERT INTO items (...) VALUES (?, ?, ...)
ON CONFLICT(file_id) DO UPDATE SET ...`, ...)
// internal/store/open.go:214 / :217
func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }
func parseTime(s string) (time.Time, error) { return time.Parse(time.RFC3339Nano, s) }
```

## contract_test_scope

- **joint (S1):** `internal/store ledger RecordFailure/ClearFailure/ListFailures` | assert: record→list round-trip preserves all fields; upsert (same PK) UPDATES attempts/nextEligible (no duplicate row); clear is idempotent (absent row → nil); `next_eligible_at` round-trips so a within-cooldown row is distinguishable from an eligible one. Verified in `ledger_test.go`.

## scope_boundary

- CREATE `internal/store/ledger.go` (`FailureRow` + 3 methods; parameterized SQL).
- CREATE `internal/store/ledger_test.go` (table-driven round-trip + idempotency + cooldown distinguishability).

## out_of_scope

- The cooldown DOUBLING schedule (7d→14d→28d cap 365d) — owned in `internal/enrich` (Task 05 computes `nextEligible` before calling `RecordFailure`).
- The derivation's cooldown-skip logic (Task 05 reads `ListFailures` + filters).
- Any `open.go` / migration / `ensureItemsStatus`-style edit (the table EXISTS).
- An admin HTTP route for `ListFailures` (B1-light: the method exists; route wiring is deferred — contracts §ListFailures).

## line_budget

110 (flex 1.2 — SQL + DTO + 3 methods + test)

## acceptance_criteria

- AC-ledger (loop-safety ledger substrate: record/clear/list + cooldown distinguishability)
- AC-2 (store 4→5 exported ≤8; gates green)

## refactoring_checklist

- `cd mellifera && go test ./internal/store/...` green.
- `grep -nE 'ON CONFLICT\(item_id, plugin_id\)' internal/store/ledger.go` → ≥1 hit (upsert).
- `grep -nE 'fmt.Sprintf.*SELECT|fmt.Sprintf.*DELETE|fmt.Sprintf.*INSERT' internal/store/ledger.go` → 0 hits (no SQL interpolation).
- `git diff --stat -- internal/store/open.go` → empty (NO DDL edit).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK with `internal/store` at 5 exported symbols (FailureRow added; methods don't count).

## source_anchor

CREATE `internal/store/ledger.go` (new file, package `store`). SQL target table: `internal/store/open.go:98-107`. Upsert model: `internal/store/items.go:42-71`. Time helpers: `internal/store/open.go:214,217`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`, `golang-security`
