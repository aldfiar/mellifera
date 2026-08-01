# Task 03 — internal/module: model metadata_sources + seed tv-parser

> **Status: DONE (2026-07-31)** — registry.go (MetadataSourceBinding + Module.MetadataSources + parseModule decode + tvConfigJSON: tv-parser p1) + doc.go (7) + parse_test.go; module 6->7; all gates green; AC-1/AC-4 (media strings only in seed config).

- **Type:** coder
- **Step:** 4
- **Seams:** S4 (enrich↔module config-driven selection)
- **AC trace:** AC-4, AC-1
- **Project scope:** `.` (root; package `internal/module`)
- **Deps:** none (the `metadata_sources` slot is already seeded in `tvConfigJSON`; this task models it in Go + adds tv-parser to the seed)
- **Estimated LOC:** ~70 (S)

## behaviors

- **B1** New `MetadataSourceBinding` type `{PluginID, CapabilityID string; Priority int; Enabled bool; AuthMode string; Options json.RawMessage}` models one enrichment-source config slot. | ac: AC-4 | kind: normal
- **B2** `Module` gains `MetadataSources []MetadataSourceBinding` (ordered by priority); `parseModule` decodes the `metadata_sources` slot from `config_json` (currently DROPPED at `registry.go:162`). | ac: AC-4 | kind: normal
- **B3** The seeded `tvConfigJSON` (`registry.go:42-74`) is updated to list `tv-parser` as priority 1 (the local parser that runs in Phase A), with kinopoisk->priority 2 and tmdb->priority 3 retained (they soft-fail in Phase A — not loaded — AC-6). | ac: AC-1, AC-4 | kind: normal
- **B4** `internal/module` exported symbols rise 6->7 (`MetadataSourceBinding`); core selection stays strictly config-driven — NO media-type string branch anywhere. | ac: AC-4 | kind: normal

## invariants

- **INV-config-driven (AC-4):** `module` is a config entity, not code (`architecture.md:673`). Plugin selection reads `MetadataSources[]`. The strings `"tv"`/`"kinopoisk"`/`"tmdb"`/`"tv-parser"` appear ONLY in `tvConfigJSON` (seed config) and tests — never as a Go `if mediaType == "tv"` branch.
- **INV-additive-seed:** Seeding is `INSERT OR IGNORE` (`registry.go:27`); a fresh DB gets the new seed (tv-parser in the chain — AC-1). An EXISTING scan-library DB keeps its old seed (no tv-parser) — acceptable and additive: those items simply reach `parsed` (base identify) not `enriched`, no regression. The integration test (Task 11) uses a fresh temp DB.
- **INV-priority-order:** `parseModule` preserves config order; enrich (Task 05) sorts/runs by `Priority` ascending. If two sources share a priority, config order is the tiebreak (document; deterministic).

## precondition

`internal/module` ships `Module`/`ScannerBinding`/`parseModule`, and the seeded TV config ALREADY carries a `metadata_sources` array that `parseModule` currently drops.
- evidence: `internal/module/registry.go:84-89` (`Module` struct — add `MetadataSources` field); `:94-98` (`ScannerBinding` — the type to mirror for `MetadataSourceBinding`); `:162-183` (`parseModule` — the anonymous struct decodes ONLY `scanner`; add a `MetadataSources []...` field to the anonymous struct).
- evidence: `internal/module/registry.go:42-74` (`tvConfigJSON` — already carries `metadata_sources: [kinopoisk p1, tmdb p2]`; this task inserts tv-parser at p1 and shifts the others).
- evidence: `internal/module/doc.go:14-21` (6-symbol API list -> 7).

## postcondition

`Module.MetadataSources` is populated from config; `MetadataSourceBinding` is exported (7 symbols); `parseModule` decodes priority/enabled/auth_mode/options per source; the seeded TV module lists tv-parser (priority 1) + kinopoisk (2) + tmdb (3). `registry_test.go` (or a new `parseModule` table test) covers decoding incl. the dropped-slot-no-longer-dropped and priority ordering.

## test_seed

Table test for `parseModule` over several `config_json` blobs: (a) the new seeded tvConfig (assert `MetadataSources` = [tv-parser p1, kinopoisk p2, tmdb p3], each Enabled); (b) a config with NO metadata_sources (empty slice, no error); (c) a config with a source carrying opaque options (round-trips as `json.RawMessage`). Mirror the existing in-package test style (`docs/scan-library/source_baseline.md:51-65`).

## callers_to_update

- `internal/module/doc.go` — the `# Public API (6 symbols)` block (`doc.go:14-21`) MUST list `MetadataSourceBinding` (7) and note `Module.MetadataSources`.

## allowed_imports

- `context`, `encoding/json`, `fmt` (stdlib, already imported)
- `github.com/mellifera/mellifera/internal/store` (already imported; `Open` uses `s.DB()`)

## allowed_categories

- `stdlib`

## test_exclusions

- `MetadataSourceBinding` is a pure data struct (config DTO) — its field access is trivial; cover it via the `parseModule` decoding table test, not a standalone constructor/accessor test.

## negative_examples

- DO NOT branch on media type in Go (AC-4). The `tv`/`tmdb`/`kinopoisk`/`tv-parser` strings live ONLY inside `tvConfigJSON`.
- DO NOT add a typed enum for AuthMode — it is an opaque config string (Phase B interprets SERVER/CLIENT; Phase A carries it verbatim).
- DO NOT change `INSERT OR IGNORE` to `INSERT OR REPLACE` (would clobber existing scan-library module rows — AC-3).
- DO NOT drop kinopoisk/tmdb from the seed (they are the designed Phase B sources; soft-failing them in Phase A demonstrates AC-6 and preserves the designed config).

## existing_code_snapshot

`parseModule` anonymous decode (`registry.go:162-183`), the gap to fill:
```go
func parseModule(id, mediaType string, schemaVersion int, configBytes []byte) (Module, error) {
	var cfg struct {
		Scanner struct {
			PluginID     string          `json:"plugin_id"`
			CapabilityID string          `json:"capability_id"`
			Options      json.RawMessage `json:"options"`
		} `json:"scanner"`
	}
	if err := json.Unmarshal(configBytes, &cfg); err != nil {
		return Module{}, fmt.Errorf("module %q: parse config_json: %w", id, err)
	}
	return Module{ID: id, MediaType: mediaType, SchemaVersion: schemaVersion,
		Scanner: ScannerBinding{PluginID: cfg.Scanner.PluginID, CapabilityID: cfg.Scanner.CapabilityID, Options: cfg.Scanner.Options},
	}, nil
}
```
Add a `MetadataSources []struct{...}{json:"metadata_sources"}` field to the anonymous struct and map it into `[]MetadataSourceBinding` (filtering `Enabled`, preserving `Priority` order).

`tvConfigJSON` (`registry.go:56-67`) — insert tv-parser as the first `metadata_sources` entry (priority 1), shift kinopoisk->2, tmdb->3:
```jsonc
"metadata_sources": [
  { "plugin_id": "tv-parser", "capability_id": "default", "priority": 1, "enabled": true, "options": {} },
  { "plugin_id": "kinopoisk", "capability_id": "default", "priority": 2, "enabled": true, "auth_mode": "CLIENT", "options": {"language":"ru"} },
  { "plugin_id": "tmdb", "capability_id": "default", "priority": 3, "enabled": true, "auth_mode": "SERVER", "options": {"language":"en-US","include_image_types":["poster","backdrop","logo"]} }
]
```
(tv-parser is a local parser: no `auth_mode` / `required_secrets`.)

## contract_test_scope

- **joint:** `internal/module MetadataSources -> internal/enrich (Task 05 consumer)` | assert: `Module.Get("tv").MetadataSources` is non-empty and ordered; enrich reads it to drive the chain (config-driven, AC-4). Verified in Task 05 enrich test (priority-ordered chain) + Task 11 integration.

## scope_boundary

- MODIFY `internal/module/registry.go` (`MetadataSourceBinding` type + `Module.MetadataSources` field + `parseModule` decode + `tvConfigJSON` seed)
- MODIFY `internal/module/doc.go` (7 symbols)
- MODIFY/CREATE the in-package parse test (`registry_test.go` or a `parse_test.go`)

## out_of_scope

- `internal/enrich` (Task 05 — the consumer that runs the chain)
- `cmd/mellifera/main.go` (Task 10 — loads tv-parser binary; this task only seeds its config slot)
- the `display` config block (still opaque pass-through; not modeled)
- DB seed migration for existing rows (out of scope; `INSERT OR IGNORE` governs — see INV-additive-seed)

## line_budget

70 (flex 1.3)

## acceptance_criteria

- AC-1 (seeded TV module lists tv-parser so a fresh install runs the parser)
- AC-4 (config-driven selection; no media-type literals in Go)

## refactoring_checklist

- `cd mellifera && go test ./internal/module/...` green; the parse table test asserts tv-parser at priority 1.
- `grep -rnE '"(tv|tmdb|kinopoisk)"' internal/module/` hits ONLY inside `tvConfigJSON` (the seed), nowhere in Go logic (AC-4 probe subset).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK at 7 symbols.

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
