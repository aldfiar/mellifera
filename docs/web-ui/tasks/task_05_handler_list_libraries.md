# Task 05 — api/handlers: `listLibraries` handler + `libraryDTO`/`librariesResponse`; mount `GET /libraries`

- **Type:** coder
- **Step:** 4 (Outline)
- **Seams:** S-list-libraries (api side)
- **AC trace:** AC-3
- **Project scope:** `.` (root; MODIFY `internal/api`)
- **Deps:** Task 02 (`store.ListLibraries`)
- **Estimated LOC:** ~40 (S)

## behaviors

- **B1** `(*app).listLibraries(w, r)` calls `a.deps.Store.ListLibraries(r.Context())` and writes `200 librariesResponse{Items []libraryDTO}` — one domain call (pure delegation, INV1). | ac: AC-3 | kind: normal
- **B2** `libraryDTO` is the boundary conversion of `store.Library` carrying `id`, `module_id`, `root_path`, `display_name` (INV4 — no `store.Library` over the wire; `CreatedAt` intentionally omitted, mirroring `itemDTO` time-omission at `handlers.go:60-62`). | ac: AC-3 | kind: normal
- **B3** A store error → `500 internal_error` via `writeError` (`handlers.go:193`). | ac: AC-3 | kind: error
- **B4** The route `GET /api/v1/libraries` is mounted (inside the `/api/v1` route block). At THIS task it sits alongside the existing routes under whatever middleware Task 04 left (the global `authMiddleware`); Task 08 re-classifies it into the browse (admin+client) group. | ac: AC-3 | kind: normal

## invariants

- **INV1-pure-delegation:** `listLibraries` is parse (nothing) → ONE domain call (`Store.ListLibraries`) → write. No branching. `funlen≤60`, `gocognit≤15`.
- **INV4-boundary-conversion:** `toLibraryDTOs` (or inline conversion) maps `[]store.Library`→`[]libraryDTO`. Mirrors `toItemDTOs` (`handlers.go:156-172`).
- **INV-empty-items-array:** because `store.ListLibraries` returns empty-not-nil (Task 02 B2), the handler emits `{"items":[]}` not `{"items":null}` (acceptance AC-3 implied — the admin panel renders an empty list).

## precondition

Task 02 landed: `store.ListLibraries(ctx) ([]Library, error)`. `internal/api/handlers.go` defines `app{deps}` (`:19`), the `writeJSON`/`writeError` helpers (`:186`/`:193`), and `libraryResponse` (`:39` — the SINGLE-library create response). `internal/api/router.go:41-44` mounts the 3 existing routes under `/api/v1`.
- evidence: `internal/store/libraries.go` (`ListLibraries` after Task 02); `internal/api/handlers.go:19,39,156-172,186-195`; `internal/api/router.go:41-44`.

## postcondition

`handlers.go` defines `libraryDTO`, `librariesResponse`, `(*app).listLibraries`, and a `toLibraryDTOs` helper (or inline). `router.go` mounts `r.Get("/libraries", h.listLibraries)` inside `/api/v1`. `go build ./internal/api && go test ./internal/api` green.

## test_seed

Add a `list_libraries` subtest to `TestNew_Routes` (`router_test.go:68`): open a fresh store, `POST` two libraries, then `GET /api/v1/libraries` with the admin token → assert 200 + decode `librariesResponse` + assert `len(Items)==2`, fields `id/module_id/root_path/display_name` round-trip, and ordering `id ASC` (Task 02's store guarantee observed end-to-end). ALSO a `list_libraries_empty` subtest: fresh store → `GET /api/v1/libraries` → assert `200` + `Items` is `[]` not `null` (decode into a map and check the JSON key is present as an empty array — B3/INV-empty).

## callers_to_update

- `internal/api/router.go:41-44` — add `r.Get("/libraries", h.listLibraries)` inside the `r.Route("/api/v1", ...)` block. (Task 08 will move it into the browse group; this task only adds the mount.)

## allowed_imports

- (already imported in `handlers.go`) `encoding/json`, `net/http`, `strconv`, `github.com/go-chi/chi/v5`, `internal/store`
- (already imported in `router.go`) `context`, `net/http`, `chi`, `internal/scan`, `internal/store`

## allowed_categories

- `stdlib`

## test_exclusions

- `libraryDTO` / `librariesResponse` are DTO structs — excluded.
- `toLibraryDTOs` is a mechanical boundary conversion (mirror of `toItemDTOs`) — exclude; the route subtest covers it end-to-end.
- `listLibraries` IS logic (the one domain call + write) → covered by the route subtest.

## negative_examples

- DO NOT leak `store.Library` over the wire (INV4 — convert to `libraryDTO`).
- DO NOT add query params (`?module=` etc.) — not in scope; `GET /libraries` lists ALL (AC-3).
- DO NOT paginate `ListLibraries` (no `limit`/`offset` — the library set is small; defer until needed).
- DO NOT add a `created_at` field to `libraryDTO` (mirror itemDTO time-omission; the document is the source of truth).

## existing_code_snapshot

```go
// internal/api/handlers.go:38-44 (libraryResponse — the SINGLE-library shape; this task adds the PLURAL)
type libraryResponse struct {
	ID          int64  `json:"id"`
	ModuleID    string `json:"module_id"`
	RootPath    string `json:"root_path"`
	DisplayName string `json:"display_name"`
}

// internal/api/handlers.go:54-57 (itemsResponse — the plural-list pattern to mirror)
type itemsResponse struct {
	Items []itemDTO `json:"items"`
}

// internal/api/handlers.go:154-172 (toItemDTOs — the boundary-conversion pattern to mirror)
func toItemDTOs(items []store.Item) []itemDTO {
	out := make([]itemDTO, len(items))
	for i, it := range items {
		out[i] = itemDTO{ ID: it.ID, /* ... */ }
	}
	return out
}

// internal/api/router.go:41-45 (route block — gains r.Get("/libraries", ...))
r.Route("/api/v1", func(r chi.Router) {
	r.Post("/libraries", h.createLibrary)
	r.Post("/libraries/{id}/scan", h.scanLibrary)
	r.Get("/items", h.listItems)
})
```

## contract_test_scope

- **joint (S-list-libraries, api side):** `GET /libraries -> store.ListLibraries -> librariesResponse` | assert: 2 libraries created → GET returns them id ASC with full fields; empty store → `{"items":[]}`. Covered by the `list_libraries` + `list_libraries_empty` subtests.

## scope_boundary

- MODIFY `internal/api/handlers.go` (`libraryDTO`, `librariesResponse`, `(*app).listLibraries`, `toLibraryDTOs` helper).
- MODIFY `internal/api/router.go:41-45` (add the `r.Get("/libraries", h.listLibraries)` mount).
- MODIFY `internal/api/router_test.go` (add the two subtests to `TestNew_Routes`).

## out_of_scope

- The browse/admin route-group classification (Task 08).
- `store.ListLibraries` itself (Task 02).
- swag annotations on `listLibraries` (Task 09).

## line_budget

40 (flex 1.2)

## acceptance_criteria

- AC-3 (an admin can list libraries)

## refactoring_checklist

- `grep -n 'func (a \*app) listLibraries\|type libraryDTO\|type librariesResponse' internal/api/handlers.go` → 3 hits.
- `grep -n 'r.Get("/libraries"' internal/api/router.go` → 1 hit.
- `cd mellifera && go test ./internal/api -run TestNew_Routes -v` green incl. the new subtests.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK (all new symbols unexported).

## source_anchor

MODIFY `internal/api/handlers.go:38-44` (add plural DTOs near the singular), `:154-172` (add `toLibraryDTOs` near `toItemDTOs`), append `listLibraries` after `listItems` (`:134`). MODIFY `internal/api/router.go:41-45` (one mount line). Contract: `contracts.md §New endpoints` + `§DTOs`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
