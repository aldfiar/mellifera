# Task 09 — internal/api: item status field + optional ?status= filter

- **Type:** coder
- **Step:** 10
- **Seams:** S11 (api↔store status filter)
- **AC trace:** AC-7, AC-3
- **Project scope:** `.` (root; package `internal/api`)
- **Deps:** Task 04 (`QueryItems(ctx,libID,status,limit,offset)` — the call site at `handlers.go:124` currently passes `""` from Task 04's mechanical fix)
- **Estimated LOC:** ~20 (XS)

## behaviors

- **B1** `itemDTO` gains a `Status string` field (json `"status"`); `toItemDTOs` populates it from `store.Item.Status`. | ac: AC-7, AC-3 | kind: normal
- **B2** `listItems` parses the optional `?status=` query param and passes it to `QueryItems(ctx, id, status, limit, offset)`; an absent/empty `?status=` passes `""` (all statuses — the existing behavior). | ac: AC-7 | kind: normal
- **B3** No new route — the filter is a query param on the existing `GET /api/v1/items` (`router.go:44`). The response shape is ADDITIVE (existing clients see a new `status` field; the filter is optional). | ac: AC-3 | kind: normal
- **B4** `internal/api` stays at 3 exported symbols; pure delegation (parse -> ONE domain call -> write) — no logic added beyond reading the query param. | ac: AC-2 | kind: normal

## invariants

- **INV-pure-delegation:** `api/` parses the request, makes ONE domain call (`store.QueryItems`), writes the response. No status-value logic, no validation of the status set (store/enrich own that). (ai-arch §3; conventions.md §api-pure-delegation.)
- **INV-additive (AC-3):** The `?status=` param is OPTIONAL (absent = all). The `status` response field is additive. Existing scan-library clients keep working. `GET /api/v1/items` route is unchanged.
- **INV-empty-all:** `?status=` absent or empty -> `""` -> all statuses (matches Task 04 INV-empty-all).

## precondition

`QueryItems` already takes a `status` arg (Task 04); the `handlers.go:124` call currently passes `""`. `Item.Status` is persisted (Task 04/08).
- evidence: `internal/api/handlers.go:63-72` (`itemDTO` — add `Status string json:"status"`); `:115-130` (`listItems` — parse `?status=` + pass to QueryItems); `:135-148` (`parsePagination` — the param-parsing pattern to mirror for `?status=`); `:150-167` (`toItemDTOs` — set `Status: it.Status`).
- evidence: `internal/api/router.go:40-45` (the three routes — `GET /items` UNCHANGED, no new route); `:16-20` (3-symbol API; no new symbol).

## postcondition

`GET /api/v1/items?status=enriched` returns only enriched items; absent/empty returns all; every itemDTO carries `status`. `handlers_test.go` (or a new list-items test) covers the filter + the status field. `check.sh` OK at 3 symbols.

## test_seed

Table test for `listItems` (httptest): (a) no `?status=` -> QueryItems called with `""`, response items carry `status`; (b) `?status=enriched` -> only enriched items returned; (c) `?status=` (empty) -> all. Assert the response JSON has a `status` key per item. Mirror the existing in-package handler test style.

## callers_to_update

- `internal/api/handlers.go` — `itemDTO` (+field), `listItems` (parse `?status=`, pass to QueryItems), `toItemDTOs` (+`Status`).
- `internal/api/handlers_test.go` (or new list test) — the filter + status-field assertions.

## allowed_imports

- `encoding/json`, `net/http`, `strconv` (stdlib, already imported)
- `github.com/go-chi/chi/v5` (already)
- `github.com/mellifera/mellifera/internal/store` (already)

## allowed_categories

- `stdlib`

## test_exclusions

- `itemDTO` is a wire DTO (data) — covered via the list-items handler test, not a standalone test.

## negative_examples

- DO NOT add a new route (the filter is a query param on the existing route).
- DO NOT validate the status value set in api (store/enrich own it; api is pure delegation).
- DO NOT change the existing response fields (AC-3; `status` is additive).
- DO NOT branch on media type.

## existing_code_snapshot

`itemDTO` (`handlers.go:63-72`) — add the field:
```go
type itemDTO struct {
	ID            string          `json:"id"`
	ModuleID      string          `json:"module_id"`
	LibraryID     int64           `json:"library_id"`
	FileID        string          `json:"file_id"`
	RelativePath  string          `json:"relative_path"`
	MediaType     string          `json:"media_type"`
	Document      json.RawMessage `json:"document"`
	SchemaVersion int             `json:"schema_version"`
	Status        string          `json:"status"`   // [NEW] additive
}
```
`listItems` (`handlers.go:117-130`) — the QueryItems call:
```go
items, err := a.deps.Store.QueryItems(r.Context(), id, limit, offset)   // Task 04 made this pass ""
```
-> read `status := r.URL.Query().Get("status")` and pass it: `QueryItems(r.Context(), id, status, limit, offset)`. (Empty/absent -> "" -> all.)

## contract_test_scope

- **joint (S11):** `internal/api ?status= -> store QueryItems(status)` | assert: `?status=enriched` filters; absent returns all; response carries `status`. Verified here + Task 11 integration (AC-7 HTTP probe `curl .../items?status=failed`).

## scope_boundary

- MODIFY `internal/api/handlers.go` (itemDTO, listItems, toItemDTOs)
- MODIFY `internal/api/handlers_test.go` (or add a list-items test)
- (NO router.go change — the route is unchanged)

## out_of_scope

- `internal/store` QueryItems (Task 04)
- `internal/scan`/`internal/enrich` status advancement (Tasks 05/08)
- `cmd/mellifera/main.go` (Task 10)
- a `GET /items/{id}` single-item endpoint (not in scope; out of Phase A)

## line_budget

20 (flex 1.5)

## acceptance_criteria

- AC-7 (status fielded + filterable over HTTP)
- AC-3 (additive; existing clients unaffected)
- AC-2 (api stays 3 symbols)

## refactoring_checklist

- `cd mellifera && go build ./internal/api/... && go test ./internal/api/...` green.
- `grep -n 'status' internal/api/handlers.go` shows the DTO field + the query-param read + the QueryItems arg (3 sites).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK at 3 symbols.
- `git diff --stat 7bcc6c9 -- proto/` empty.

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
