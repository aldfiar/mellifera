# Task 04 — internal/store: items.status column + index + QueryItems status filter

> **Status: DONE (2026-07-31)** — open.go (status column + idempotent ALTER + items_status index) + items.go (Item.Status, PutItem, QueryItems 5-arg, itemColumns, scanItem) + doc.go + store_test.go + 5 mechanical callers (handlers.go, run_test.go x3, qa_resilience_test.go); store stays 11; all gates green; AC-3 (additive)/AC-7 (column+filter).

- **Type:** coder
- **Step:** 5
- **Seams:** S1 (status column), S7 (scan↔store), S11 (api↔store)
- **AC trace:** AC-3, AC-7
- **Project scope:** `.` (root; package `internal/store`)
- **Deps:** none (store is a leaf; status VALUES are owned by enrich/Task 05 — store is value-agnostic)
- **Estimated LOC:** ~60 (S)

## behaviors

- **B1** The `items` table gains `status TEXT NOT NULL DEFAULT 'new'` + an `items_status` index. Fresh DBs get the column in the CREATE TABLE; EXISTING scan-library DBs get it via an idempotent `ALTER TABLE ADD COLUMN` guarded by a `PRAGMA table_info` check (so `Open` stays re-runnable). | ac: AC-3, AC-7 | kind: normal
- **B2** `Item` gains a `Status string` field; `PutItem` writes the `status` column; `itemColumns` SELECT + `scanItem` read it. | ac: AC-7 | kind: normal
- **B3** `QueryItems` signature becomes `(ctx, libraryID int64, status string, limit, offset int)`; a non-empty `status` filters `WHERE status = ?`; empty `status` = all (existing behavior). | ac: AC-7, AC-3 | kind: normal
- **B4** `internal/store` stays at 11 exported symbols — `status` is a plain `string` field, NOT a typed enum/constants set (store is value-agnostic; the status set is owned by `internal/enrich.nextState`). | ac: AC-2, AC-7 | kind: normal

## invariants

- **INV-value-agnostic-store:** Store does NOT define or validate status values. The column is `TEXT`; the DEFAULT is the literal `'new'`; `QueryItems` filters by exact string match. The canonical set `{new,pending,parsed,enriched,failed,deleted}` lives in `internal/enrich` (Task 05) and `acceptance.md` — both must use the EXACT same lowercase strings. This keeps store at 11 (conventions.md §Lifecycle state).
- **INV-idempotent-migration:** `Open` MUST remain re-runnable (`open.go:33`). The additive column uses: (a) the column in the `CREATE TABLE IF NOT EXISTS items` for fresh DBs, PLUS (b) a `PRAGMA table_info(items)` check + conditional `ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'new'` for pre-existing DBs (SQLite has no `ADD COLUMN IF NOT EXISTS`). The index is `CREATE INDEX IF NOT EXISTS items_status ON items(status)` (idempotent).
- **INV-additive (AC-3):** Existing scan-library rows read with `status='new'` (the DEFAULT). No DROP, no RENAME, no type change to existing columns. `PutItem` upsert ON CONFLICT(file_id) (`items.go:41`) is preserved; status is refreshed like the other mutable fields.
- **INV-empty-all:** `QueryItems(..., status="", ...)` returns items of ALL statuses (the scan-library listing behavior is unchanged when no filter is supplied).

## precondition

`internal/store` ships the `items` table, `Item`, `PutItem`, `QueryItems(ctx,libID,limit,offset)` (4-arg). It is at 11 WARN symbols and MUST stay there.
- evidence: `internal/store/open.go:61-76` (`CREATE TABLE IF NOT EXISTS items (...)` — add `status` column + the migration ALTER); `:117-123` (the `CREATE INDEX IF NOT EXISTS` block — add `items_status`); `:33` (schemaSQL idempotency contract); `:130-146` (`Open` — add the PRAGMA-guarded ALTER after the schemaSQL loop).
- evidence: `internal/store/items.go:15-26` (`Item` struct — add `Status string`); `:32-56` (`PutItem` INSERT/ON CONFLICT — add `status` to both the column list, VALUES, and the DO UPDATE SET); `:70-97` (`QueryItems` — add `status string` param + conditional WHERE); `:102` (`itemColumns` const — add `status`); `:109-134` (`scanItem` — scan `&it.Status`).
- evidence: callers (G2 grep) — production: `internal/api/handlers.go:124` (the ONE non-test caller); tests: `internal/store/store_test.go`, `internal/scan/run_test.go`, `integration_test.go`, `qa_resilience_test.go`.

## postcondition

`items.status` exists on fresh + existing DBs (idempotent); `Item.Status` round-trips through PutItem/scanItem; `QueryItems(ctx,libID,status,limit,offset)` filters by status (empty=all). Every `QueryItems` caller compiles (all updated to pass `""` mechanically). `store_test.go` covers the column default, the filter (empty=all, specific status), and re-Open idempotency on a pre-existing DB. `check.sh` OK at 11 symbols.

## test_seed

Table tests on a temp SQLite DB: (a) fresh Open -> `PRAGMA table_info(items)` shows `status` with default `'new'`; (b) PutItem an Item with Status="enriched" -> GetItem/QueryItems returns it; (c) QueryItems(status="enriched") returns only those, QueryItems(status="") returns all; (d) simulate a pre-status DB (create items table WITHOUT status, close, re-Open) -> the ALTER runs, rows read with 'new' (idempotent re-Open does not error). Mirror `store_test.go`'s existing temp-DB style.

## callers_to_update

ALL `QueryItems` call sites (signature 4-arg -> 5-arg). Pass `""` (empty = all) at every site; later tasks refine:
- `internal/api/handlers.go:124` — pass `""` now (Task 09 replaces `""` with the parsed `?status=` value).
- `internal/store/store_test.go` — update existing QueryItems test rows to the 5-arg form (this task owns the real status-filter assertions).
- `internal/scan/run_test.go` — mechanical: add `""` arg (the scan test lists items without filtering).
- `integration_test.go` — mechanical: add `""` arg (scan-library golden; keep its existing assertions).
- `qa_resilience_test.go` — mechanical: add `""` arg.

## allowed_imports

- `context`, `database/sql`, `fmt`, `time` (stdlib, already imported)
- `_ "modernc.org/sqlite"` (already imported)

## allowed_categories

- `stdlib`

## test_exclusions

- `Item.Status` is a plain string field (data) — covered via PutItem/GetItem/QueryItems round-trip, no standalone accessor test.
- The migration ALTER is infrastructure — covered by the re-Open-on-pre-existing-DB test above (not a separate no-op).

## negative_examples

- DO NOT define exported `Status*` constants in `store` (would inflate 11->17 and violates INV-value-agnostic-store). Statuses are plain strings.
- DO NOT use string formatting/`fmt.Sprintf` to build the WHERE clause — parameterized SQL only (`WHERE status = ?` or omit the predicate when empty). Never interpolate status into SQL.
- DO NOT DROP/RENAME existing columns or change the upsert key (AC-3; `items.go:41` ON CONFLICT(file_id) preserved).
- DO NOT validate the status value set in store (the orchestrator owns transitions).

## existing_code_snapshot

`itemColumns` + `scanItem` (`items.go:102,109-134`) — add `status` to the SELECT list and `&it.Status` to the Scan:
```go
const itemColumns = "SELECT id, module_id, library_id, file_id, relative_path, media_type, document, schema_version, created_at, updated_at"
// -> append ", status"; scanItem scans &it.Status
```
`QueryItems` (`items.go:70-80`) — the WHERE build:
```go
func (s *Store) QueryItems(ctx context.Context, libraryID int64, limit, offset int) ([]Item, error) {
	...
	rows, err := s.db.QueryContext(ctx, itemColumns+" FROM items WHERE library_id = ? ORDER BY id LIMIT ? OFFSET ?", libraryID, limit, offset)
```
-> add `status string` param; when `status != ""` use `WHERE library_id = ? AND status = ?` (args libraryID, status); else the existing predicate. (Parameterized; two query shapes gated by the empty check — do NOT build the predicate by string concatenation of the value.)
`PutItem` (`items.go:37-51`) — add `status` to the column list, VALUES placeholder, and `ON CONFLICT(file_id) DO UPDATE SET ... status = excluded.status`.

## contract_test_scope

- **joint (S7):** `internal/scan (Task 08) -> store PutItem(status)` | assert: scan sets `Item.Status` (advanced by enrich) and PutItem persists it; re-scan upsert preserves id+created_at, refreshes status. Verified in Task 08 run_test + Task 11 integration.
- **joint (S11):** `internal/api (Task 09) -> store QueryItems(status)` | assert: `?status=enriched` returns only enriched items; empty returns all. Verified in Task 09 handlers_test + Task 11 integration (AC-7 probe).

## scope_boundary

- MODIFY `internal/store/open.go` (CREATE TABLE column + idempotent ALTER + items_status index)
- MODIFY `internal/store/items.go` (`Item.Status`, PutItem, QueryItems, itemColumns, scanItem)
- MODIFY `internal/store/doc.go` (note the status column + QueryItems filter — NO new symbol)
- MODIFY `internal/store/store_test.go` (status assertions)
- MODIFY (mechanical compile-fix, pass `""`): `internal/api/handlers.go:124`, `internal/scan/run_test.go`, `integration_test.go`, `qa_resilience_test.go`

## out_of_scope

- `internal/enrich` nextState / status string set (Task 05)
- `internal/api` `?status=` parsing (Task 09 — only the mechanical `""` arg here)
- `internal/scan` setting Item.Status (Task 08)
- backfilling pre-existing rows to a non-`'new'` value (out of scope; DEFAULT 'new' is the documented Phase A choice — see acceptance.md AC-7 / decision D-8)

## line_budget

60 (flex 1.4 — the idempotent ALTER + PRAGMA check + 2 query shapes add lines)

## acceptance_criteria

- AC-3 (additive: existing rows readable with DEFAULT 'new'; no proto/API break at the store layer)
- AC-7 (status column indexed + filterable)
- AC-2 (store stays 11 symbols; build green)

## refactoring_checklist

- `cd mellifera && go build ./... && go test ./internal/store/...` green.
- `grep -rn 'QueryItems' --include='*.go' .` — EVERY call site is the 5-arg form (no stale 4-arg call remains).
- Fresh-DB probe: `sqlite3 <db> "PRAGMA table_info(items)"` shows a `status` row (default `'new'`); `sqlite3 <db> ".indexes items"` shows `items_status`.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK at 11 symbols.
- `git diff --stat 7bcc6c9 -- proto/` empty.

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
