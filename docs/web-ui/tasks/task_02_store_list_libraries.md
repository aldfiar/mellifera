# Task 02 — store: add `ListLibraries(ctx) ([]Library, error)` + table test

- **Type:** coder
- **Step:** 1 (Outline)
- **Seams:** S-list-libraries (store side)
- **AC trace:** AC-3
- **Project scope:** `.` (root; MODIFY `internal/store`)
- **Deps:** none
- **Estimated LOC:** ~30 (XS)

## behaviors

- **B1** `(*Store).ListLibraries(ctx)` returns every library row ordered `id ASC`, as `[]Library`. | ac: AC-3 | kind: normal
- **B2** An empty libraries table returns an empty non-nil slice (`[]Library{}`, NOT `nil`) so the JSON handler serializes `{"items":[]}` not `{"items":null}`. | ac: AC-3 | kind: edge
- **B3** SQL is parameterized (no interpolation); the query has no user-supplied args (a plain `SELECT ... ORDER BY id`). | ac: AC-3 | kind: normal

## invariants

- **INV-param-SQL:** mirror `QueryItems` (`items.go:88-108`) — column list literal, `?`-bound args. `ListLibraries` takes no args, so the ORDER BY is the only clause (status/id never interpolated; INV1 store).
- **INV-empty-not-nil:** postcondition is a non-nil empty slice when zero rows (Go `make([]Library, 0)`), matching the JSON contract the handler (Task 05) relies on.
- **INV-row-scan:** reuse the `scan` idiom from `GetLibrary` (`libraries.go:46-57`): `SELECT id, module_id, root_path, display_name, created_at` + `parseTime` on the created_text column.

## precondition

`internal/store/libraries.go` exists with `Library` (`:13`), `CreateLibrary` (`:24`), `GetLibrary` (`:41`). No `ListLibraries`/`QueryLibraries` exists (grep empty — source_baseline §internal/store). `store_test.go` has the `TestStore_Library` table test (`:88`) with `create_get_roundtrip` + `not_found` subtests.
- evidence: `internal/store/libraries.go:13,24,41,46-57`; `internal/store/items.go:88-108` (QueryItems param-SQL pattern); `internal/store/store_test.go:88-112` (TestStore_Library pattern).

## postcondition

`(*Store).ListLibraries(ctx) ([]Library, error)` is defined, returns `id ASC` rows, empty-not-nil on zero rows. `go build ./internal/store` + `go test ./internal/store` green. No new exported symbol count change (method on `*Store`, excluded by check.sh).

## test_seed

Add a subtest to `TestStore_Library` in `store_test.go`: `list_ordering_and_empty` — (a) call `ListLibraries` on a fresh store → assert `len==0 && items != nil`; (b) insert 3 libraries ( CreateLibrary) in non-sorted order → assert `ListLibraries` returns them `id ASC` and each field round-trips (ModuleID, RootPath, DisplayName). Mirrors the `create_get_roundtrip` assertion style at `store_test.go:92-110`.

## callers_to_update

- (none yet — the api `listLibraries` handler in Task 05 becomes the first caller. `store.ListLibraries` is a new method; no existing caller to update.)

## allowed_imports

- (already imported in `libraries.go`) `context`, `fmt`, `time`
- (already imported in `store_test.go`) `context`, `errors`, `database/sql`, `path/filepath`, `testing`

## allowed_categories

- `stdlib`

## test_exclusions

- `Library` is a data model (struct) — excluded. The `ListLibraries` METHOD is logic → table-test it (B1/B2/B3).

## negative_examples

- DO NOT interpolate the column list from a variable — literal SELECT (INV-param-SQL).
- DO NOT return `nil` on zero rows (INV-empty-not-nil — use `make([]Library, 0)`).
- DO NOT add a `status`/`library_id` filter (not in scope; `GET /libraries` lists ALL — acceptance AC-3).

## existing_code_snapshot

```go
// internal/store/libraries.go:13-19
type Library struct {
	ID          int64
	ModuleID    string
	RootPath    string
	DisplayName string
	CreatedAt   time.Time
}

// internal/store/libraries.go:41-59 (GetLibrary — the scan idiom to mirror)
func (s *Store) GetLibrary(ctx context.Context, id int64) (Library, error) {
	var (
		l           Library
		createdText string
	)
	row := s.db.QueryRowContext(ctx,
		"SELECT id, module_id, root_path, display_name, created_at FROM libraries WHERE id = ?",
		id,
	)
	if err := row.Scan(&l.ID, &l.ModuleID, &l.RootPath, &l.DisplayName, &createdText); err != nil {
		return Library{}, fmt.Errorf("store: get library %d: %w", id, err)
	}
	created, err := parseTime(createdText)
	if err != nil {
		return Library{}, fmt.Errorf("store: get library %d parse time: %w", id, err)
	}
	l.CreatedAt = created
	return l, nil
}
```

## contract_test_scope

- **joint (S-list-libraries, store side):** `store.ListLibraries -> []Library id ASC` | assert: empty→[] (not nil); N inserted (any order)→returned id ASC with full fields. Covered by the `list_ordering_and_empty` subtest.

## scope_boundary

- MODIFY `internal/store/libraries.go` (add `ListLibraries` method).
- MODIFY `internal/store/store_test.go` (add `list_ordering_and_empty` subtest to `TestStore_Library`).

## out_of_scope

- The api `listLibraries` handler + `libraryDTO` (Task 05).
- The `GET /libraries` route mount (Task 05/08).
- `DELETE`/`PUT /libraries` (deferred — out of Phase 1).

## line_budget

30 (flex 1.2)

## acceptance_criteria

- AC-3 (an admin can list libraries — the store primitive)

## refactoring_checklist

- `cd mellifera && go build ./internal/store && go test ./internal/store -run TestStore_Library` green.
- `grep -n 'func (s \*Store) ListLibraries' internal/store/libraries.go` → 1 hit.
- `grep -nE 'ORDER BY id' internal/store/libraries.go` → ≥1 hit (the new query).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (no new exported top-level symbol).

## source_anchor

MODIFY `internal/store/libraries.go:13-19` (Library type — consumed unchanged), append `ListLibraries` after `GetLibrary` (`:59`). MODIFY `internal/store/store_test.go:88` (`TestStore_Library` — add subtest). Contract: `contracts.md §store.(*Store).ListLibraries`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
