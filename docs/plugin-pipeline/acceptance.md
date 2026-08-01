# Acceptance Criteria — plugin-pipeline (Phase A)

> Refined from `enhanced_objective.md` AC sketch + the mid-planning lifecycle-state
> requirement. Phase A scope (see `implementation_plan.md` right-sizing): parser
> extraction + provenance + lifecycle state + the inline enrich orchestrator.
> External enrichers (Phase B) and post-actions (Phase C/future) are OUTLINED, not
> asserted here. **7 scenarios — under the 8-gate** (parseTV-extraction folded into AC-1).

## Source

User vision (`enhanced_objective.md`): "Generalize scan-library's single-plugin
model into a multi-stage, config-driven plugin pipeline… every piece of metadata
is tagged with its source plugin (provenance). The core stays an orchestrator."
Mid-planning add (2026-07-31): "the feature MUST track per-Item LIFECYCLE STATE
through the pipeline (new, parsed, enriched, failed, deleted, pending, etc.)."

## Lifecycle state machine (load-bearing for AC-7)

```
                 (re-scan: file changed → forward, Phase B)
   new ─► pending ─► parsed ─► pending ─► enriched
     │      │         │          │           │
     │      └─────────┴──────────┴───────────┴─► failed   (hard error; retryable → pending)
     └──────────────────────────────────────────► deleted (soft-delete; file gone on re-scan)
```

- `new` — discovered + base-identified, first record written, awaiting enrichment.
- `pending` — a pipeline stage is in-flight (persisted so a crash knows where to resume).
- `parsed` — parser-class sources ran (tv-parser wrote its namespace).
- `enriched` — all configured enrichment sources ran (soft-fails recorded); **terminal-success for Phase A**.
- `failed` — a stage hard-failed; carries last_error; `failed → pending` on retry.
- `deleted` — soft-delete: file no longer present on re-scan (data retained, deprecate-don't-delete).
- Forward (Phase B, surfaced not built): `ready` (external/async enrichment settled); `stale` (re-scan detected change → `pending`).

Enforcement: the **orchestrator** (`internal/enrich` + `internal/scan`) advances
state per stage via a pure transition function; the **store** owns the `status`
column (core-managed, like `file_id`/`created_at`). State names are
**media-type-agnostic pipeline-stage names** (arch §0 #1 holds).

## Scenarios

### AC-1: Full pipeline end-to-end with provenance + state + clean parseTV split (golden)
- **Given**: a TV library root with fixture files like `Show.Name.S01E02.1080p.mkv`, and a module config whose `metadata_sources` lists `tv-parser` (priority 1).
- **When**: `POST /api/v1/libraries/{id}/scan` runs.
- **Then**: each discovered file flows discovery (base-scanner) → enrichment (tv-parser) → persisted `Item`. base-scanner emits ONLY media-type-agnostic base fields (no `season`/`episode`); the TV parse is produced solely by the `tv-parser` subprocess. The persisted `document` contains `sources.tv-parser.{title,season,episode,...}`, a `_provenance` entry naming `tv-parser` per field, a `_view` projection, a `_stages` progress trail, and `status='enriched'`. Items are listable via `GET /api/v1/items`.
- **User intent**: "a fresh install can scan TV end-to-end, every field is tagged with where it came from, and all parsers are plugins (no hardcoded media logic in the scanner)."
- **Verify probe (e2e)**: `./mellifera-integration-pipeline` (AC-1 golden binary) → exit 0 AND asserts provenance + status fields present.
- **Verify probe (extraction, structural/negative)**: `cd mellifera && grep -rnE 'season|episode|SxxExx|parseTV' plugins/base-scanner/ | grep -v _test` → 0 hits (parseTV fully removed); `grep -rn 'parseTV' plugins/tv-parser/` → ≥1 hit (moved here).
- **Covers tasks**: [T06 tv-parser, T07 base-scanner-extract, T08 scan-integrate, T10 cmd-wiring, T11 integration] (specifier filled)

### AC-2: All build gates green
- **Given**: the codebase after Phase A.
- **When**: `make build && make build-plugin && go test ./... && golangci-lint run ./... && gofmt -l . && ./.claude/skills/mellifera-build/scripts/check.sh && go vet ./...` run.
- **Then**: all pass; `check.sh` reports OK; no package exceeds >12 exported symbols (WARN ≤12 tolerated per R10); no `reflect`; no DI framework; parameterized SQL only; `exec.Command` arg-slice only.
- **User intent**: "the codebase stays AI-navigable and within the complexity budget."
- **Verify probe**: `cd mellifera && ./.claude/skills/mellifera-build/scripts/check.sh` → prints `check.sh: OK`, exit 0.
- **Covers tasks**: [all]

### AC-3: Additive — scan-library's shipped contract unbroken (structural/negative)
- **Given**: scan-library's shipped proto/store/API surface.
- **When**: Phase A lands.
- **Then**: `scanner.v1.Scanner` (Scan/Identify) is unchanged on the wire; `plugin.v1.Plugin` unchanged; `sdk.Scanner`/`sdk.Serve` unchanged; the `items` table gains only a defaulted `status` column (existing rows queryable with the default); `GET /api/v1/items` still works (status is an additive response field + optional filter). base-scanner still serves `scanner.v1` discovery.
- **User intent**: "don't break what shipped; extend it (deprecate-don't-delete)."
- **Verify probe**: `cd mellifera && git diff --stat 7bcc6c9 -- proto/` → empty (no proto edits) ; `sqlite3 … "PRAGMA table_info(items)"` → `status` column present with default `'new'`.
- **Covers tasks**: [T-store-status, T-base-scanner-extract]

### AC-4: Orchestrator selects plugins strictly from config (structural/negative)
- **Given**: the core packages (`internal/scan`, `internal/enrich`, `internal/store`, `internal/module`, `internal/plugin`, `pkg/sdk`, `cmd/mellifera`).
- **When**: grepping core for media-type strings.
- **Then**: NO occurrence of `"tv"`, `"tmdb"`, `"kinopoisk"`, `"movie"` as media-type literals in core orchestration code (they appear only in `internal/module` seed CONFIG and tests/fixtures). Plugin selection is driven by `module.MetadataSources[]` from config, never by `if mediaType == "tv"`.
- **User intent**: "the core is an orchestrator, not a domain engine" (arch §0 #1, the scan-library INV that must hold).
- **Verify probe**: `cd mellifera && grep -rnE '"(tv|tmdb|kinopoisk|movie)"' internal/ pkg/sdk/ cmd/ | grep -vE '_test\.go|registry\.go.*tvConfig|//|secrets'` → 0 hits.
- **Covers tasks**: [T-enrich, T-scan-integrate, T-module-bindings]

### AC-5: Provenance — per-field source recorded + queryable
- **Given**: an Item enriched by tv-parser.
- **When**: reading the persisted document.
- **Then**: each enriched field has a `_provenance.<field_path>` entry `{plugin_id:"tv-parser", plugin_version, fetched_at, confidence, source_url?}`; the per-source data lives losslessly under `sources.tv-parser.*`; the store's existing generated column `$._view.title.value` is populated. The provenance is queryable via `json_extract(document,'$._provenance')`.
- **User intent**: "I can tell which plugin contributed each piece of metadata" (objective; arch principle 4).
- **Verify probe**: `sqlite3 … "SELECT json_extract(document,'$._provenance.title.plugin_id') FROM items WHERE …"` → `tv-parser`.
- **Covers tasks**: [T-enrich, T-scan-integrate]

### AC-6: Soft-fail — a failing/missing enricher does not abort the scan
- **Given**: a module config listing two enrichment sources; one (e.g. a misconfigured/absent plugin) cannot run.
- **When**: the scan runs.
- **Then**: the scan SUCCEEDS; the unavailable source's failure is recorded in `_stages` (status `failed`/`skipped` + error) and in `Result.Warnings`; the item is still persisted with whatever upstream stages produced, and advances to the furthest reached state (e.g. `parsed` if only the parser ran). One bad source never aborts the library (extension of scan-library AC-6).
- **User intent**: "enrichment is best-effort; the scan still yields usable items."
- **Covers tasks**: [T-enrich]

### AC-7: Lifecycle state tracked + queryable
- **Given**: items at different pipeline points (a fresh scan, an item whose enricher failed, a re-scan where a file disappeared).
- **When**: the pipeline runs / the API is queried.
- **Then**: every persisted `Item` has a `status` in `{new,pending,parsed,enriched,failed,deleted}`; the orchestrator advances `new→pending→parsed→(pending)→enriched` on success, `→failed` on hard error (with `last_error`), `→deleted` on soft-delete; the `status` column is indexed and filterable via `GET /api/v1/items?status=enriched`. Illegal transitions are rejected by the orchestrator's transition function.
- **User intent**: "I can see and filter where each item is in its lifecycle" (mid-planning requirement).
- **Verify probe**: `sqlite3 … "SELECT DISTINCT status FROM items ORDER BY status"` → rows ⊆ {new,pending,parsed,enriched,failed,deleted}; `curl …/items?status=failed` → only failed items.
- **Covers tasks**: [T-store-status, T-enrich, T-scan-integrate]

## Coverage Matrix

| Scenario | Tasks | Verified By |
|---|---|---|
| AC-1 full pipeline e2e + parseTV split | T06, T07, T08, T10, T11 | T11 (golden) + T12 (QA re-derive) + reviewer |
| AC-2 build gates | T01..T11 (all coder) | T11 (gate sequence) + T13 (QA gates regression) + reviewer |
| AC-3 additive contract | T04, T07 | T11 (additive probe) + T13 (QA regression) + reviewer |
| AC-4 config-driven (no media strings) | T03, T05, T08 | T13 (QA structural probe, CI-asserted) + reviewer |
| AC-5 provenance queryable | T05, T06, T08 | T11 (golden json_extract) + T12 (QA) + reviewer |
| AC-6 soft-fail | T05 | T11 (golden soft-fail) + T12 (QA) + reviewer |
| AC-7 lifecycle state | T04, T05, T08, T09 | T11 (status HTTP probe) + T12 (QA state machine) + reviewer |

## Reviewer independence (golden-test rule)

At the Acceptance Gate, the reviewer RE-DERIVES the expected outcome from each
scenario's Given/When/Then (e.g. for AC-1, re-derive the expected `season`/`episode`
from the fixture filename `Show.Name.S01E02…`) and confirms the coder's tests
assert THAT — not trust the coder's assertions. Per `docs/scan-library/acceptance.md:76-84`.
