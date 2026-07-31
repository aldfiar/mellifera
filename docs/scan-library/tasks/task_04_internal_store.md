- [x] Task 04 (coder): Implement internal/store (SQLite — sole owner of *sql.DB)
  target: mellifera/internal/store/doc.go, mellifera/internal/store/open.go, mellifera/internal/store/items.go, mellifera/internal/store/libraries.go, mellifera/internal/store/*_test.go | action: CREATE
  archetype: data
  skill_hint: golang-security
  feature_goal: (see T01)
  why: The store is the sole owner of `*sql.DB` and ALL SQL. It creates the full §9.1 schema (including reserved tables) + §9.2 generated columns. `PutItem` upsert-by-`file_id` is what makes re-scan idempotent. Parameterized SQL is a hard rule (golang-security). The `Document` column is opaque JSON — the store must NOT parse it (arch §3.1). Symbol count = 10 (WARN >8, <12; pre-justified R10).
  data_flow: enters from: T07 scan (constructs store.Item, calls PutItem) + T09 api (CreateLibrary/QueryItems) → transforms: parameterized SQL upsert/select over SQLite WAL + json_extract generated columns → emits to: T05 module (reads `modules` table via store), T07 scan (GetLibrary), T09 api (QueryItems → DTO), T10 cmd (store.Open wiring).
  related: producer T01 (go.mod, adds modernc.org/sqlite); consumers T05, T07, T09, T10; seams S4 (scan→store PutItem), S9 (store↔SQLite), S10 (module→store).
  imports:
    - database/sql  # stdlib interface
    - modernc.org/sqlite  # pure-Go driver (D-Q2); registers under "sqlite" DSN prefix
    - context  # ctx on every query
    - encoding/json  # json.RawMessage type only (Document is opaque — store does not marshal/parse it)
    - time  # timestamps
  allowed_imports:
    - database/sql
    - modernc.org/sqlite
    - context
    - encoding/json
    - time
    - fmt  # error wrapping only
  allowed_categories:
    - stdlib
  precondition: |
    `mellifera/go.mod` exists (T01). No `internal/store/` exists (greenfield — source_baseline.md:14). modernc.org/sqlite not yet a dep.
  behaviors:
    - B1: `Open(ctx, dsn)` sets `PRAGMA journal_mode=WAL`, runs idempotent migrations creating ALL §9.1 tables (`libraries`, `modules`, `items`, `playback_progress`, `drafts`, `enrichment_failures`, `scan_jobs`) + §9.2 generated columns (`display_title`, `display_rating`, `tmdb_id`, `kinopoisk_id`) + indexes, returns `*Store` | ac: AC-1 | kind: normal
    - B2: `CreateLibrary`/`GetLibrary` + `Library` type; `GetItem`/`PutItem`/`QueryItems` + `Item` type (fields per contracts.md §4) | ac: AC-1 | kind: normal
    - B3: `PutItem` is an UPSERT keyed by `file_id` — PutItem twice for the same file_id = exactly one row (idempotent re-scan) | ac: AC-1 | kind: normal
    - B4: `QueryItems(libraryID, limit, offset)` filters by `library_id` with LIMIT/OFFSET | ac: AC-1 | kind: normal
    - B5: ALL SQL uses `?`/`$N` placeholders — NEVER `fmt.Sprintf` into SQL (golang-security hard rule) | ac: AC-2 | kind: normal
    - B6: The `document` TEXT column round-trips arbitrary JSON including Cyrillic + deeply-nested ffprobe output; a query selecting a generated column (e.g. `display_title`) returns the extracted value | ac: AC-1 | kind: edge
    - B7: `Open` is idempotent — calling it twice (or re-running migrations) does not error and does not duplicate tables (CREATE ... IF NOT EXISTS) | ac: AC-2 | kind: edge
  invariants:
    - INV1: PARAMETERIZED SQL ONLY. No string-built queries. Every value through placeholders. (golang-security; store invariant; reviewer gate.)
    - INV2: WAL mode set at Open; single-writer transactions (arch §9.3).
    - INV3: `Document` is OPAQUE to the store — it does not parse the JSON body; it only `json_extract`s the generated-column paths defined at migration time.
    - INV4: Migrations create ALL §9.1 tables including reserved ones — additive (deprecate-don't-delete). Methods for reserved tables (RecordProgress/GetResume) are DEFERRED — do not add them.
    - INV5: `store` MAY NOT import any `internal/*`, any proto, any pkg/sdk (contracts.md §10 — store is the bottom of the stack).
    - INV6: Exported symbol count = 10 (3 types: Store/Item/Library + 7 funcs: Open/Close/CreateLibrary/GetLibrary/GetItem/PutItem/QueryItems). WARN (>8) but <12 hard-fail; PRE-JUSTIFIED (R10). Do not add more.
  postcondition: |
    (AC-1/AC-2) `internal/store` compiles with 10 symbols (WARN, justified); Open runs WAL + full §9.1/§9.2 schema idempotently; PutItem upsert-by-file_id idempotent; `go test ./internal/store/` green over t.TempDir() SQLite.
  test_seed: |
    # arrange: t.TempDir() DB. act: Open; CreateLibrary("tv","<tmp>","TV"); PutItem twice (same file_id); QueryItems. assert: exactly one row after the double PutItem; generated-column select returns the parsed title; Cyrillic title round-trips byte-equal.
  spec: |
    Signatures (contracts.md §4 — copy verbatim):
    type Store struct { /* wraps *sql.DB */ }
    type Item struct { ID string; ModuleID string; LibraryID int64; FileID string; RelativePath string; MediaType string; Document json.RawMessage; SchemaVersion int; CreatedAt time.Time; UpdatedAt time.Time }
    type Library struct { ID int64; ModuleID string; RootPath string; DisplayName string; CreatedAt time.Time }
    func Open(ctx context.Context, dsn string) (*Store, error)
    func (s *Store) Close() error
    func (s *Store) CreateLibrary(ctx context.Context, moduleID, rootPath, displayName string) (int64, error)
    func (s *Store) GetLibrary(ctx context.Context, id int64) (Library, error)
    func (s *Store) GetItem(ctx context.Context, id string) (Item, error)
    func (s *Store) PutItem(ctx context.Context, it Item) error        // upsert by file_id
    func (s *Store) QueryItems(ctx context.Context, libraryID int64, limit, offset int) ([]Item, error)

    Steps:
    1. Write `doc.go`: responsibility (sole SQLite owner), public API (10 symbols, WARN justified), invariants (parameterized SQL, WAL, opaque Document, additive schema). Apache header.
    2. `open.go`: schema constants (§9.1 DDL + §9.2 generated columns, verbatim from arch §9.1/§9.2); `Open` = open `database/sql` with `modernc.org/sqlite`, `PRAGMA journal_mode=WAL`, run migrations with `CREATE TABLE IF NOT EXISTS`, return `*Store`; `Close`.
    3. `libraries.go`: `Library` + `CreateLibrary` (parameterized INSERT) + `GetLibrary` (parameterized SELECT).
    4. `items.go`: `Item` + `GetItem` (by id) + `PutItem` (INSERT ... ON CONFLICT(file_id) DO UPDATE — upsert) + `QueryItems` (WHERE library_id=? LIMIT ? OFFSET ?).
    5. Table tests over `t.TempDir()` SQLite: Open/Close, CreateLibrary/GetLibrary, PutItem idempotency (twice = one row), QueryItems pagination, generated-column query, Cyrillic + nested-JSON round-trip.
  test_exclusions:
    - "Item / Library — plain data structs, exercised via the CRUD method table tests"
    - "Close — trivial delegator to sql.DB.Close, exercised by Open test cleanup"
  error_handling:
    - "SQL constraint violation (e.g. duplicate library on a UNIQUE(module_id, root_path))": return wrapped error; api layer maps to 4xx (T09).
    - "migration failure / malformed DDL": Open returns error; do not serve a half-migrated DB.
  callers_to_update: []
  contract_test_scope:
    - joint: internal/scan -> internal/store | assert: PutItem upsert-by-file_id is idempotent (scan re-run yields one row)
    - joint: internal/store -> SQLite | assert: WAL set; generated columns populated from Document json_extract
  negative_examples:
    - "DO NOT build SQL with fmt.Sprintf / string concatenation (golang-security)."
    - "DO NOT parse the Document JSON inside the store (it is opaque; arch §3.1)."
    - "DO NOT import any internal/*, proto, or pkg/sdk (store is the bottom)."
    - "DO NOT add RecordProgress/GetResume or other reserved-table methods this feature (DEFERRED)."
    - "DO NOT exceed 12 exported symbols (currently planned 10 — WARN, justified)."
  existing_code_snapshot: |
    (GREENFIELD — internal/store/ does not exist. evidence: source_baseline.md:14.)
  source_anchor: contracts.md:84-129 (§4 Store interface + invariants); File Map implementation_plan.md:110-116 (store rows); arch §9.1/§9.2 (schema, cited in source_baseline.md:62-63)
  scope_boundary: "This task ONLY creates files under mellifera/internal/store/ + edits mellifera/go.mod (add modernc.org/sqlite). No other files."
  out_of_scope:
    - mellifera/internal/module/  # T05 (module reads the modules table via this store's raw access — module owns the SELECT, store owns the connection)
    - any handler/orchestrator  # later tasks
  line_budget: 700
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-1 | given: a scan wrote items | when: QueryItems(library) | then: items with parsed fields + ffprobe blob returned
    - scenario: AC-2 | given: feature branch | when: check.sh + go test ./internal/store/ | then: green (store WARN-justified at 10 symbols)
  verify: cd mellifera && go test ./internal/store/... && grep -rn 'fmt.Sprintf.*SELECT\|fmt.Sprintf.*INSERT' mellifera/internal/store/ ; test $? -eq 1
