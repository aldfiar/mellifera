# Task 04 — internal/module seeds the `image` module (config row)

> Step Outline 8. MODIFY `internal/module/registry.go`; EXTEND `internal/module/registry_test.go`.
> The image module is a CONFIG ENTITY (data, not code — INV1/INV2): an `imageConfigJSON`
> const + a second idempotent `INSERT OR IGNORE` seed row in `Open`. Adds ZERO exported
> symbols (`internal/module` stays at 7).

## Context

- **feature_goal:** (shared) image media type + EXIF enricher.
- **why:** a fresh install must scan image libraries out-of-the-box. The module registry resolves `module_id="image"` to a config binding `base-scanner` (scanner) + `image-enricher` (priority 1). This is data, not code — the core never branches on media type.
- **data_flow:** `POST /api/v1/libraries {"module_id":"image",...}` → `scan.runScan` → `mods.Get("image")` returns the seeded Module → scanner resolves to `base-scanner`, the B1 queue derives `(item, image-enricher)` work from `Module.MetadataSources`.
- **rationale (D-4):** mirror the TV module seed. Pure EXIF — NO filename-date/camera fallback (images have no reliable filename convention analogous to TV's `SxxExx`).

## Type

MODIFY `internal/module/registry.go`; EXTEND `internal/module/registry_test.go`.

## Seams owned

- **S5** image module seed. (Joint test → Task 07; registry unit test here.)

## behaviors

- B01: A new `imageConfigJSON` const binds `base-scanner` (scanner, capability `default`) + `image-enricher` (priority 1, enabled, local — no `auth_mode`) under `media_type:"image"`, schema_version 1, with `display_name` carrying Russian first-class. | ac: AC-1, AC-image | kind: normal
- B02: `Open` runs a SECOND idempotent `INSERT OR IGNORE` seed for the `image` module (`id="image"`, `media_type="image"`, `imageConfigJSON`, ...) right after the existing `tv` seed. `modules.media_type UNIQUE` accepts `"image"` (it is distinct from `"tv"`). | ac: AC-1, AC-image | kind: normal
- B03: After `Open`, `List` returns BOTH modules in id order (`"image"` < `"tv"` lexicographically — order is harmless); `Get("image")` returns a Module whose `Scanner.PluginID=="base-scanner"` and whose `MetadataSources` contains `image-enricher` priority 1. | ac: AC-1, AC-image | kind: normal
- B04: Seeding is idempotent — running `Open` twice does not error and does not duplicate rows (`INSERT OR IGNORE` skips on conflict). | ac: AC-1 | kind: normal
- B05: The package's exported-symbol count stays at 7 (the image seed is an unexported `const` + a second `ExecContext` — adds NO exported symbol). | ac: AC-2 | kind: normal

## invariants

- CONFIG ENTITY, NOT CODE (INV1/INV2): the image module is a DB seed row + a JSON const, not a Go type or interface. The core never branches on `media_type`.
- IDEMPOTENT SEED: `INSERT OR IGNORE` (the existing `seedModulesSQL`, `registry.go:27-29`) — safe to run repeatedly; re-`Open` never errors and never duplicates.
- NO `auth_mode` for image-enricher (it is a LOCAL parser; `auth_mode` is empty/absent — D-Q1: queueable because AuthMode != CLIENT).
- PARAMETERIZED SQL ONLY: the seed uses the existing `seedModulesSQL` with `?` placeholders (`registry.go:27-29`); NO string-interpolated SQL.
- SYMBOL BUDGET: `internal/module` stays at 7 exported (`doc.go:14` INV4). The new `imageConfigJSON` is unexported.

## postcondition

`Open` seeds both `tv` and `image` module rows idempotently; `Get("image")`/`List` resolve the image module binding base-scanner + image-enricher; no exported symbol is added.

## existing_code_snapshot (G2-verified @ `e2a7562`)

`internal/module/registry.go:27-29` (the idempotent seed SQL — reused unchanged):
```go
const seedModulesSQL = `INSERT OR IGNORE INTO modules
  (id, media_type, config_json, schema_version, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`
```
`internal/module/registry.go:44-81` (`tvConfigJSON` — the pattern to mirror for `imageConfigJSON`):
```go
const tvConfigJSON = `{
  "id": "tv",
  "schema_version": 1,
  "display_name": {"ru": "Сериалы", "en": "TV Series"},
  "media_type": "tv",
  "scanner": {
    "plugin_id": "base-scanner",
    "capability_id": "default",
    "options": {
      "filename_format": "SxxExx",
      "exclude_patterns": ["*.nfo", "*.jpg", "*.srt"],
      "follow_symlinks": false
    }
  },
  "metadata_sources": [
    { "plugin_id": "tv-parser", "capability_id": "default", "priority": 1, "enabled": true, "options": {} },
    ...
  ],
  ...
}`
```
`internal/module/registry.go:125-131` (`Open` — the single `tv` seed ExecContext to mirror):
```go
func Open(ctx context.Context, s *store.Store) (*Registry, error) {
	db := s.DB()
	if _, err := db.ExecContext(ctx, seedModulesSQL,
		"tv", "tv", tvConfigJSON, 1, 1, seedCreatedAt, seedCreatedAt,
	); err != nil {
		return nil, fmt.Errorf("module: seed: %w", err)
	}
```

## test_seed

Extend `internal/module/registry_test.go` (the existing "List after seed" test at `registry_test.go:95-113` per source_baseline):
- After `Open`, `List` returns BOTH `"image"` and `"tv"` (B03).
- `Get("image")` returns a Module with `MediaType=="image"`, `Scanner.PluginID=="base-scanner"`, `Scanner.CapabilityID=="default"`, and `MetadataSources` containing one entry `{PluginID:"image-enricher", CapabilityID:"default", Priority:1, Enabled:true, AuthMode:""}` (B03).
- Idempotency: call `Open` twice on the same store; `List` length is unchanged (2 modules) and no error (B04).
- TV module regression: `Get("tv")` is unchanged (the new seed did not alter the tv row — `INSERT OR IGNORE`).

## spec

### File to MODIFY: `internal/module/registry.go`

1. Add `imageConfigJSON` const right after `tvConfigJSON` (after `registry.go:81`). Mirror the tv shape:
   ```go
   const imageConfigJSON = `{
     "id": "image",
     "schema_version": 1,
     "display_name": {"ru": "Фотографии", "en": "Photos"},
     "media_type": "image",
     "scanner": {
       "plugin_id": "base-scanner",
       "capability_id": "default",
       "options": {
         "exclude_patterns": ["*.thm", "*.xmp"],
         "follow_symlinks": false
       }
     },
     "metadata_sources": [
       { "plugin_id": "image-enricher", "capability_id": "default", "priority": 1, "enabled": true, "options": {} }
     ]
   }`
   ```
   Notes: `exclude_patterns` is advisory (base-scanner defers enforcement — `walk.go:48-49`); keep a minimal, sensible list (do NOT exclude `*.jpg`). `metadata_sources` has exactly ONE entry (image-enricher, priority 1, enabled, NO `auth_mode` — local parser, D-4). `display_name` carries Russian first-class (arch §1.2). No `display` block (image has no display-priority sources in B2).
2. In `Open` (`registry.go:127-131`), add a second `ExecContext` immediately after the tv seed:
   ```go
   if _, err := db.ExecContext(ctx, seedModulesSQL,
       "image", "image", imageConfigJSON, 1, 1, seedCreatedAt, seedCreatedAt,
   ); err != nil {
       return nil, fmt.Errorf("module: seed image: %w", err)
   }
   ```
   (Reuse `seedCreatedAt` and the existing `seedModulesSQL`; parameterized `?` placeholders. `modules.media_type UNIQUE` accepts `"image"` since it differs from `"tv"`.)
3. No other change — `listModulesSQL`, `parseModule`, `Get`, `List` are media-type-agnostic and already serve the new row.

### Steps (ordered)
1. Add `imageConfigJSON`.
2. Add the second seed `ExecContext` in `Open`.
3. Extend `registry_test.go` per `test_seed`.
4. `cd /Users/aldfiar/projects/go/mellifera && go build ./internal/module/ && go test ./internal/module/`.

## allowed_imports

(existing `internal/module` imports — unchanged set)
- stdlib: `context`, `encoding/json`, `fmt`
- `github.com/mellifera/mellifera/internal/store`

NO new import.

allowed_categories: stdlib

## callers_to_update

NONE. `Open`'s signature is unchanged; `imageConfigJSON` is unexported; the new seed is internal to `Open`. `mods.Get("image")` is a runtime call from `internal/scan/run.go:120` (already works for any module id — no edit). evidence: `internal/module/registry.go:125` (`Open` signature unchanged); `internal/scan/run.go:120` (`mods.Get(lib.ModuleID)` — module_id is an arbitrary string).

## negative_examples

- DO NOT add a Go type/interface for the image module (it is a CONFIG row — INV1/INV2).
- DO NOT add a `filename_format`/filename-parse option for images (no filename fallback — D-4).
- DO NOT add `auth_mode` to the image-enricher binding (local parser — would make it non-queueable per D-Q1).
- DO NOT export `imageConfigJSON` (symbol budget — stays at 7).
- DO NOT string-interpolate SQL (use the existing parameterized `seedModulesSQL`).
- DO NOT edit `internal/scan`, `internal/enrich`, `proto/**`, `pkg/sdk/**`.

## out_of_scope

- `internal/scan/**` (Task 03), `cmd/mellifera/**` (Task 05 — loads the image-enricher plugin the seed references by string id).
- `plugins/**` (Tasks 01/02).
- `internal/store/**` (the `modules` table DDL is unchanged — `media_type TEXT NOT NULL UNIQUE` already accepts "image").

## scope_boundary

MODIFY `internal/module/registry.go` (add `imageConfigJSON` const + second seed `ExecContext`); EXTEND `internal/module/registry_test.go`. No other file.

## project_scope

.

## line_budget

60  (imageConfigJSON ~25 lines; Open +5; tests +~30)
line_budget_flex: 1.1

## test_exclusions

- `imageConfigJSON` / `tvConfigJSON` (data/config constants — framework-shaped JSON, like the existing tvConfigJSON which has no dedicated unit test of its own beyond parseModule coverage).

## refactoring_checklist

- [ ] `grep -n 'imageConfigJSON\|"image", "image"' internal/module/registry.go` shows the new const + seed.
- [ ] `go test ./internal/module/ -run TestOpen` (or equivalent) asserts `Get("image")` + `List` len 2.
- [ ] Exported-symbol count unchanged: `bash .claude/skills/mellifera-build/scripts/check.sh` green (module stays at 7).
- [ ] `Open` called twice → no error, no duplicate rows (idempotency).

## skill_hint

- grounding (G2 the seed pattern + that `media_type` UNIQUE accepts "image"; `mods.Get` already arbitrary-id)
- mellifera-build (exported-symbol budget — the load-bearing constraint for this package)

## deps

(none — independent; the seed references `image-enricher` by STRING id, so it does not require the plugin binary to exist at seed time. Runtime resolution requires Task 05 to load image-enricher.)

## verify

```
cd /Users/aldfiar/projects/go/mellifera
go build ./internal/module/
go vet ./internal/module/
go test ./internal/module/
```
