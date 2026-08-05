# Task 06 — api/handlers: `getItem` handler + `itemResponse`; mount `GET /items/{id}`; 404 on missing

- **Type:** coder
- **Step:** 6 (Outline)
- **Seams:** S-get-item
- **AC trace:** AC-4
- **Project scope:** `.` (root; MODIFY `internal/api`)
- **Deps:** none (consumes existing `store.GetItem`, `items.go:74`)
- **Estimated LOC:** ~35 (XS)

## behaviors

- **B1** `(*app).getItem(w, r)` reads `chi.URLParam(r, "id")`, calls `a.deps.Store.GetItem(r.Context(), id)`, and on success writes `200 itemResponse{Item: itemDTO}` where the `itemDTO.Document` is the FULL §3.1 document (sources/view/provenance/stages, precision preserved). | ac: AC-4 | kind: normal
- **B2** `store.GetItem` returning a wrapped `sql.ErrNoRows` (missing/unknown id) → `404 not_found` via `writeError` (`handlers.go:193`) with the canonical `{error:{code,message,retryable}}` body. | ac: AC-4 | kind: error
- **B3** Any other store error → `500 internal_error` via `writeError`. | ac: AC-4 | kind: error
- **B4** The route `GET /api/v1/items/{id}` is mounted inside `/api/v1` (Task 08 classifies it into the browse group). | ac: AC-4 | kind: normal

## invariants

- **INV1-pure-delegation:** parse (`chi.URLParam`) → ONE domain call (`Store.GetItem`) → write. No branching beyond the error-mapping `errors.Is` check. `funlen≤60`, `gocognit≤15`.
- **INV-full-document:** `itemDTO.Document json.RawMessage` (`handlers.go:63-73`) ALREADY carries the full §3.1 document opaque — no stripping, no "metadata summary" shape (open-question-5 resolution; contracts §DTOs). The `getItem` handler reuses `itemDTO` as-is; it does NOT project/filter the document.
- **INV-reuse-itemDTO:** `itemResponse{Item itemDTO}` reuses the EXISTING `itemDTO` (`handlers.go:63`) + the existing `toItemDTOs` conversion logic (factor a single-item `toItemDTO(store.Item) itemDTO` if DRY-helpful, or inline the field copy — mirror `toItemDTOs` at `handlers.go:156-172`).
- **INV4-boundary:** `store.Item` is never serialized directly (convert to `itemDTO`).

## precondition

`internal/store/items.go:74` defines `GetItem(ctx, id string) (Item, error)` (wraps `sql.ErrNoRows` on missing — `:78`). `internal/api/handlers.go:63-73` defines `itemDTO` (carries `Document json.RawMessage`); `:156-172` defines `toItemDTOs`. `internal/api/handlers.go` imports `database/sql`? — VERIFY: it does NOT today (handlers.go imports only `encoding/json`,`net/http`,`strconv`,`chi`,`store`). This task MUST add `database/sql` + `errors` to map `sql.ErrNoRows`. `router.go:41-44` has the `/api/v1` block.
- evidence: `internal/store/items.go:74-81`; `internal/api/handlers.go:63-73,156-172`; `internal/api/handlers.go:6-14` (current imports — NO `database/sql`/`errors`); `internal/api/router.go:41-44`.

## postcondition

`handlers.go` defines `itemResponse`, `(*app).getItem`, and (if added) a `toItemDTO(store.Item) itemDTO` helper that `toItemDTOs` is refactored to call (DRY). `handlers.go` imports `database/sql` + `errors`. `router.go` mounts `r.Get("/items/{id}", h.getItem)`. `go build ./internal/api && go test ./internal/api` green.

## test_seed

Add subtests to `TestNew_Routes` (`router_test.go:68`): (a) `get_item_full_document` — create a library, run a scan OR `store.PutItem` a ready item with a known `{_view, _provenance, _stages, sources.<plugin>}` document → `GET /api/v1/items/{id}` → assert 200 + decode `itemResponse` + assert `Item.Document` deep-equals the input document (precision preserved — no field dropped). (b) `get_item_not_found` — `GET /api/v1/items/nonexistent` → assert 404 + decode `errorBody` + assert `Error.Code == "not_found"`. (Use the existing `openAPIStore` + `doRequest` helpers at `router_test.go:24,40`.)

## callers_to_update

- `internal/api/router.go:41-44` — add `r.Get("/items/{id}", h.getItem)` inside `/api/v1`. (Task 08 moves it into the browse group.)
- `internal/store/items.go:74` `GetItem` — NOT modified (this task is the first API CALLER, not a change to the method — S-get-item "additional caller, not a change").

## allowed_imports

- (already imported in `handlers.go`) `encoding/json`, `net/http`, `strconv`, `github.com/go-chi/chi/v5`, `internal/store`
- (NEW, required for ErrNoRows mapping) `database/sql`, `errors` — both stdlib, allowed.

## allowed_categories

- `stdlib`

## test_exclusions

- `itemResponse` is a DTO struct — excluded.
- `toItemDTO` (single-item conversion) is a mechanical boundary conversion — exclude; the route subtest covers it.
- `getItem` IS logic → covered by the route subtests (B1 happy + B2 404).

## negative_examples

- DO NOT project or filter the document (INV-full-document — the full §3.1 document goes on the wire; open-question-5).
- DO NOT parse `id` as an integer — it is a string UUID (`store.Item.ID string`, `items.go:17`). `chi.URLParam` returns the raw string.
- DO NOT return 404 with a non-canonical body — use `writeError(w, 404, "not_found", ..., false)` (arch §11.6).
- DO NOT leak `store.Item` (INV4 — convert to `itemDTO`).

## existing_code_snapshot

```go
// internal/api/handlers.go:6-14 (imports — gains database/sql + errors)
import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/mellifera/mellifera/internal/store"
)

// internal/api/handlers.go:54-57 (itemsResponse — sibling plural; this task adds itemResponse singular)
type itemsResponse struct {
	Items []itemDTO `json:"items"`
}

// internal/api/handlers.go:59-73 (itemDTO — REUSED, carries Document json.RawMessage)
type itemDTO struct {
	ID            string          `json:"id"`
	ModuleID      string          `json:"module_id"`
	LibraryID     int64           `json:"library_id"`
	FileID        string          `json:"file_id"`
	RelativePath  string          `json:"relative_path"`
	MediaType     string          `json:"media_type"`
	Document      json.RawMessage `json:"document"`
	SchemaVersion int             `json:"schema_version"`
	Status        string          `json:"status"`
}

// internal/api/handlers.go:156-172 (toItemDTOs — factor a single-item helper here for DRY)
func toItemDTOs(items []store.Item) []itemDTO {
	out := make([]itemDTO, len(items))
	for i, it := range items { out[i] = itemDTO{ /* fields */ } }
	return out
}

// internal/store/items.go:74-81 (GetItem — consumed UNCHANGED)
func (s *Store) GetItem(ctx context.Context, id string) (Item, error) {
	row := s.db.QueryRowContext(ctx, itemColumns+" FROM items WHERE id = ?", id)
	it, err := scanItem(row)
	if err != nil {
		return Item{}, fmt.Errorf("store: get item %q: %w", id, err)
	}
	return it, nil
}
```

## contract_test_scope

- **joint (S-get-item):** `GET /items/{id} -> store.GetItem -> itemResponse{Item itemDTO full document}` | assert: ready item → full document (deep-equal); missing → 404 not_found canonical body. Covered by the `get_item_full_document` + `get_item_not_found` subtests.

## scope_boundary

- MODIFY `internal/api/handlers.go` (imports `database/sql`+`errors`; `itemResponse`; `(*app).getItem`; optional `toItemDTO` helper + DRY refactor of `toItemDTOs`).
- MODIFY `internal/api/router.go:41-44` (add `r.Get("/items/{id}", h.getItem)` mount).
- MODIFY `internal/api/router_test.go` (add the two subtests).

## out_of_scope

- `store.GetItem` (exists, unchanged).
- The browse/admin route-group classification (Task 08).
- swag annotations on `getItem` (Task 09).

## line_budget

35 (flex 1.2)

## acceptance_criteria

- AC-4 (a client can view an item's full metadata document)

## refactoring_checklist

- `grep -n 'func (a \*app) getItem\|type itemResponse' internal/api/handlers.go` → 2 hits.
- `grep -n 'r.Get("/items/{id}"' internal/api/router.go` → 1 hit.
- `grep -nE '"database/sql"|"errors"' internal/api/handlers.go` → ≥2 hits (new imports for ErrNoRows mapping).
- `cd mellifera && go test ./internal/api -run TestNew_Routes -v` green incl. the new subtests.
- Confirm the happy-path subtest asserts the FULL document (deep-equal, not a subset) — INV-full-document.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK.

## source_anchor

MODIFY `internal/api/handlers.go:6-14` (imports), `:54-57` (add `itemResponse` near `itemsResponse`), `:156-172` (factor `toItemDTO` + DRY), append `getItem` after `listItems` (`:134`). MODIFY `internal/api/router.go:41-44` (mount). Contract: `contracts.md §getItem` + `§DTOs`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
