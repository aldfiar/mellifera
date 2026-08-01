# Task 05 — internal/enrich: inline serial enrichment orchestrator (THE load-bearing package)

- **Type:** coder
- **Step:** 3 (the deferred `enrich` engine — `architecture.md:1534`)
- **Seams:** S3 (enrich↔tv-parser gRPC), S5 (enrich↔document provenance)
- **AC trace:** AC-4, AC-5, AC-6, AC-7
- **Project scope:** `.` (root; NEW package `internal/enrich`)
- **Deps:** Task 01 (`sdk.MetadataSource`), Task 02 (`plugin.Manager.MetadataSource`), Task 03 (`module.MetadataSources`); status strings agreed with Task 04 store
- **Estimated LOC:** ~300-400 (M-L) — split across `doc.go` + `enrich.go` + unexported helper files

## behaviors

- **B1** `Enrich(ctx, deps Deps, mod module.Module, doc map[string]any, base *scannerv1.IdentifyResult) (map[string]any, string, Result, error)` runs the configured `metadata_source` chain for ONE item in `mod.MetadataSources` Priority order, serial within the item (D8), no hybrid/parallel mode (D14). | ac: AC-4 | kind: normal
- **B2** Per source it drives the full 4-RPC chain `Match -> BuildRequest -> [fetch STUB] -> Convert -> Merge`. The fetch between BuildRequest and Convert is a **no-op stub** returning an empty `raw_response` (Phase A has no external fetcher; tv-parser's Convert derives metadata from `Match.query`). ALL 4 RPCs are called (preserves the Phase B contract, R-8). `BuildRequest` receives an EMPTY `AuthContext` in Phase A (D-7). | ac: AC-5 | kind: normal
- **B3** `Match.applies == false` skips the remaining RPCs for that source (records a `skipped` stage) and continues to the next source — not an error. | ac: AC-6 | kind: edge
- **B4** Provenance stamping: after Convert, write the source's metadata losslessly under `sources.<plugin_id>`; stamp `_provenance.<field_path>` (`common.v1.Provenance{plugin_id, plugin_version, fetched_at, confidence}`) per enriched field; recompute `_view.<field>` (recomputable cache). | ac: AC-5 | kind: normal
- **B5** Append a `_stages[]` entry per source `{stage, plugin_id, status, advanced_to, started_at, finished_at, error?}` (bounded — one per configured source, R-6). | ac: AC-5, AC-7 | kind: normal
- **B6** Namespace enforcement (arch §3.3): after Merge, validate the plugin wrote ONLY `sources.<its_own_plugin_id>`. A foreign-namespace write is **rejected + reverted + recorded** as a `failed` stage (the document reverts to its pre-source state) and soft-fails — NOT a scan abort (AC-6). | ac: AC-6 | kind: error
- **B7** Soft-fail (AC-6): a source's RPC error, a namespace violation, or an unresolvable/unloaded source is appended to `Result.Warnings` + a `_stages` failed/skipped entry; the item still returns with whatever upstream stages produced and advances to the furthest VALID state. One bad source never aborts the item or the scan. | ac: AC-6 | kind: error
- **B8** Hard-fail: the module cannot be resolved OR `ctx` is cancelled -> return `(doc, status, partial Result, error)`; the stage is recorded `failed` and `status=failed` carries `_error{stage,code,message,retryable}`. (Phase A records; Phase B does `failed->pending` retry.) | ac: AC-6, AC-7 | kind: error
- **B9** `nextState(current, event)` is a PURE function with an explicit transition table; it advances state per stage and REJECTS illegal transitions (return error; do not persist). It owns the canonical status string set `{new,pending,parsed,enriched,failed,deleted}` (agreed verbatim with Task 04 store). | ac: AC-7 | kind: normal
- **B10** Per-source isolation (R-4): operate on a document COPY for each source so a crash/violation mid-chain leaves the pre-source document intact; `ctx.Err()` precedence (a cancelled context is returned as the hard error even if a soft failure coincided). | ac: AC-6 | kind: normal
- **B11** `internal/enrich` exports exactly 3 symbols (`Enrich`, `Deps`, `Result`); the 4-RPC dispatch, namespace validator, view recomputer, provenance stamper, and `nextState` are UNEXPORTED helpers. | ac: AC-2, AC-4 | kind: normal

## invariants

- **INV-downward:** `internal/enrich` imports ONLY `store`, `plugin`, `module`, `pkg/sdk`, `scannerv1`, `metadatav1`, `commonv1`, stdlib. It is CALLED BY `scan`; it NEVER imports `api` or `scan` (no cycle; contracts §4).
- **INV-serial-priority:** Sources run in `MetadataSources` `Priority` ascending (config order as tiebreak, deterministic). Serial within an item (D8). No parallel/hybrid mode (D14).
- **INV-4rpc-contract:** All 4 RPCs are invoked per applying source (Match short-circuits only when `applies==false`). The fetch is stubbed but the RPC sequence is intact so Phase B swaps in a real fetcher with NO signature change (R-8).
- **INV-namespace (R-2):** A plugin writes ONLY `sources.<own_plugin_id>`. Any write to `sources.<other>` or any other top-level key => reject + revert to pre-source doc + record `failed` stage + soft-fail. This is the correctness-critical validator (table test with a malicious fake plugin).
- **INV-status-owner (R-5):** `nextState` + the status string literals live HERE (not in store). Legal transitions (acceptance.md state machine):
  - `new --begin--> pending`
  - `pending --parsed--> parsed`
  - `parsed --begin--> pending` (next source)
  - `pending|parsed --enriched--> enriched` (terminal-success for Phase A)
  - `new|pending|parsed|enriched --failed--> failed`
  - `failed --retry--> pending` (Phase B; Phase A may define but not exercise)
  - `* --deleted--> deleted` (scan-level soft-delete; enrich does not initiate)
  - All other transitions are ILLEGAL -> return error (do not advance, do not persist). Every legal+illegal transition is a table-test row.
- **INV-furthest-valid:** Under soft-fail, the item advances to the furthest state the SUCCESSFUL stages justify (e.g. if only the parser ran and later sources soft-failed -> `parsed`, not `enriched`; if none ran -> the start state). Never advance past what was actually achieved.
- **INV-funlen-filelen (R-9):** `Enrich` and every helper < 60 lines (`funlen`) / < 15 cognitive complexity. If `enrich.go` approaches 300 lines, split unexported helpers into `chain.go` (4-RPC dispatch), `state.go` (`nextState`), `namespace.go` (validator), `provenance.go` (stamp+view). Exported surface stays 3 symbols regardless of file count.

## precondition

`sdk.MetadataSource`, `plugin.Manager.MetadataSource`, and `module.MetadataSources` exist (Tasks 01-03). The generated metadata/common protos are imported by no Go source yet (this task begins importing `metadatav1`/`commonv1`).
- evidence: `proto/mellifera/metadata/v1/metadata.proto:12-169` (the 4-RPC service + messages: `MatchRequest`/`MatchResult.applies/query`, `BuildRequestRequest.auth`, `ConvertRequest.raw_response`/`ConvertResult.metadata/provenance/error`, `MergeRequest.document/plugin_id/policy`/`MergeResult.document/view`); `proto/mellifera/common/v1/common.proto:26-32` (`Provenance{plugin_id,plugin_version,fetched_at,confidence,source_url}`); `architecture.md:772-839` (document model), `:883-890` (namespace enforcement §3.3).
- evidence (the consumer shape): `internal/scan/run.go:51,116-128` (Run + persist: identify -> [enrich inserts here] -> PutItem); `:188-212` (`assembleDocument` builds `{file_id,module_type,schema_version,parsed,ffprobe}` — enrich extends this doc).
- evidence (analog): `internal/scan/run.go` (~220 lines) is the structural analog; `scan.scannerResolver` seam (`run.go:60`) is the test-injection pattern to mirror for an in-process fake `MetadataSource` (R8 second impl).

## postcondition

`internal/enrich/{doc.go,enrich.go[,+helper files],enrich_test.go}` exist. `Enrich` mutates the passed `doc` (`sources`/`_provenance`/`_view`/`_stages`/`_error`), returns the advanced status string + a `Result{Stages,Succeeded,Warnings}`. `enrich_test.go` is table-driven across: priority ordering, Match-skips, namespace-violation reject+revert, soft-fail furthest-valid-state, hard-fail (ctx cancel), every nextState transition (legal+illegal), and provenance/view/stages shape. `check.sh` OK (enrich at 3 symbols).

## test_seed

In-process fake `sdk.MetadataSource` (the R8 second impl) injected via a seam (mirror `scan.scannerResolver`). Table cases:
- happy path: one applying source -> `sources.tv-parser` present, `_provenance.title.plugin_id=="tv-parser"`, `_view.title` populated, `_stages` has 1 ok entry, status `enriched`.
- two sources priority-ordered -> runs in Priority order (assert call order).
- `applies==false` -> skipped stage, no namespace write, chain continues.
- malicious fake writing `sources.OTHER` -> rejected + reverted (doc lacks the foreign key) + `failed` stage + `Result.Warnings` non-empty + soft-fail (no error returned).
- one source errors mid-chain -> soft-fail; upstream output kept; furthest-valid status.
- ctx cancelled -> hard error returned; `ctx.Err()` precedence over a concurrent soft failure.
- `nextState` table: every legal transition yields the documented next state; every illegal transition returns a non-nil error.
- namespace validator unit: a MergeResult touching `sources.<x>` for `x != plugin_id` is flagged.

## callers_to_update

(none — NEW package. The single consumer, `internal/scan`, is wired in Task 08.)

## allowed_imports

- `context`, `encoding/json`, `fmt`, `sort`, `time` (stdlib)
- `github.com/mellifera/mellifera/internal/store`
- `github.com/mellifera/mellifera/internal/plugin`
- `github.com/mellifera/mellifera/internal/module`
- `github.com/mellifera/mellifera/pkg/sdk`
- `github.com/mellifera/mellifera/proto/mellifera/scanner/v1` (scannerv1 — `IdentifyResult`)
- `github.com/mellifera/mellifera/proto/mellifera/metadata/v1` (metadatav1)
- `github.com/mellifera/mellifera/proto/mellifera/common/v1` (commonv1 — `Provenance`)

## allowed_categories

- `stdlib`

## test_exclusions

- `Deps` and `Result` are data structs — covered via the `Enrich` table tests (populated/consumed), not standalone tests.
- `nextState` IS logic (not excluded) — full legal/illegal table test required.

## negative_examples

- DO NOT import `api` or `scan` (downward-only; enrich is called BY scan).
- DO NOT branch on media type (AC-4); selection is `mod.MetadataSources` only.
- DO NOT perform a real HTTP fetch (Phase B; Phase A's fetch is the empty-`raw_response` stub).
- DO NOT let a plugin write outside `sources.<own_id>` silently — reject+revert+record (arch §3.3).
- DO NOT define exported status constants (the set is unexported string literals here; store is value-agnostic).
- DO NOT collapse/average fields (precision — arch §0 #4); `_view` is a recomputable cache, never authoritative.
- DO NOT put orchestration in `api/` or beyond scan's per-item call.

## existing_code_snapshot

There is no existing `internal/enrich` (NEW). The forward contract is `contracts.md §3d`:
```go
type Deps struct { Store *store.Store; Plugins *plugin.Manager; Modules *module.Registry }
type Result struct { Stages int; Succeeded int; Warnings []string }
func Enrich(ctx context.Context, deps Deps, mod module.Module, doc map[string]any, base *scannerv1.IdentifyResult) (map[string]any, string, Result, error)
```
The document shape to produce (`contracts.md §3c`):
```jsonc
{ "...existing...": "",
  "sources":     { "tv-parser": { "title":"...","season":1,"episode":2 } },
  "_provenance": { "title": { "plugin_id":"tv-parser","plugin_version":"0.1.0","fetched_at":"...","confidence":1.0 } },
  "_view":       { "title": { "value":"...","source":"tv-parser" } },
  "_stages":     [ { "stage":"parse","plugin_id":"tv-parser","status":"ok","advanced_to":"parsed","started_at":"...","finished_at":"..." } ],
  "_error":      { "stage":"...","code":"...","message":"...","retryable":true }
}
```

## contract_test_scope

- **joint (S3):** `internal/enrich -> tv-parser subprocess (Task 06)` | assert: the 4-RPC chain drives a real `metadata_source` plugin over gRPC and integrates its `sources.tv-parser` namespace + provenance. Verified in Task 06 parser_test (server side) + Task 11 integration (full subprocess).
- **joint (S5):** `internal/enrich -> document (scan Task 08)` | assert: enrich's doc mutations (`sources`/`_provenance`/`_view`/`_stages`) are persisted by scan.PutItem and queryable via `json_extract(document,'$._provenance.title.plugin_id')` == `tv-parser` (AC-5 probe). Verified in Task 08 + Task 11.

## scope_boundary

- CREATE `internal/enrich/doc.go` (contract doc: 3 symbols + INV-downward + INV-namespace + INV-status-owner)
- CREATE `internal/enrich/enrich.go` (`Enrich`/`Deps`/`Result` + orchestration; may delegate to unexported helpers)
- CREATE unexported helper file(s) as needed (`chain.go`/`state.go`/`namespace.go`/`provenance.go`) to respect funlen/file-length (R-9)
- CREATE `internal/enrich/enrich_test.go` (the table tests above)

## out_of_scope

- `internal/scan` wiring of `Enrich` (Task 08)
- `plugins/tv-parser` (Task 06 — the first real subprocess consumer)
- real HTTP fetch + AuthContext secret injection (Phase B)
- the `enrichment_failures` ledger / async queue (Phase B)
- post-action capability (Phase C)

## line_budget

350 (flex 1.3 — the load-bearing package; helpers may push file count but exported surface stays 3)

## acceptance_criteria

- AC-4 (config-driven chain; no media-type branch)
- AC-5 (per-field provenance + lossless sources namespace + recomputable _view)
- AC-6 (soft-fail; namespace violation reject+revert; furthest-valid state; ctx precedence)
- AC-7 (nextState transition table; status set)
- AC-2 (3 symbols <= 8; funlen/file-length green)

## refactoring_checklist

- `cd mellifera && go build ./internal/enrich/... && go test ./internal/enrich/...` green.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK with `internal/enrich` at 3 symbols AND every exported symbol has a co-located table test.
- `awk 'END{print NR}' internal/enrich/enrich.go` — if > 300, helper files exist (R-9); `golangci-lint run ./internal/enrich/...` clean (funlen/gocognit/gocyclo).
- `grep -rnE '"(tv|tmdb|kinopoisk|movie)"' internal/enrich/` -> 0 hits in non-test code (AC-4).
- `git diff --stat 7bcc6c9 -- proto/` empty.

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`, `software-design`
