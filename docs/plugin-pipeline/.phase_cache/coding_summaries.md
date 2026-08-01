# Coder phase — per-file summaries (plugin-pipeline Phase A, T01-T11 — CODER PHASE COMPLETE)

One line per file changed; full handoff in `coding_handoff.json`.

## T01 — pkg/sdk MetadataSource capability client + adapter (sdk 5->7)
- `pkg/sdk/metadata.go` (CREATE): `MetadataSource` interface (4 unary RPCs Match/BuildRequest/Convert/Merge over metadatav1 msgs) + `MetadataSourcePlugin` dual-side go-plugin adapter (`GRPCServer` registers `metadatav1.MetadataSourceServer` via `metadataServer`; `GRPCClient` returns `metadataGRPC` wrapping `metadatav1.NewMetadataSourceClient`). Mirrors ScannerPlugin, unary-only (no channel pump).
- `pkg/sdk/metadata_test.go` (CREATE): `TestMetadataSourcePlugin_RoundTrip` table test (seam S9) — bufconn in-process gRPC; `fakeMetadataSource` is the R8 second impl; asserts GRPCClient returns `sdk.MetadataSource`, GRPCServer registers the service, all 4 RPCs forward intact.
- `pkg/sdk/doc.go` (MODIFY): Public API 5->7 symbols; INV1 reframed to cover both Scanner + MetadataSource (>=2 impls each).

## T03 — internal/module model metadata_sources + seed tv-parser (module 6->7)
- `internal/module/registry.go` (MODIFY): added `MetadataSourceBinding{PluginID,CapabilityID,Priority,Enabled,AuthMode,Options}` + `Module.MetadataSources`; `parseModule` now decodes the `metadata_sources` slot (previously dropped) into bindings in config order (Enabled carried, no pre-filter); seeded `tvConfigJSON` lists tv-parser p1 + kinopoisk p2 + tmdb p3.
- `internal/module/doc.go` (MODIFY): Public API 6->7; INV4 updated.
- `internal/module/parse_test.go` (CREATE): `TestParseModule_MetadataSources` pure-function table (seeded chain; no-slot empty; opaque options raw round-trip).

## T04 — internal/store items.status column + index + QueryItems filter (store stays 11)
- `internal/store/open.go` (MODIFY): `status TEXT NOT NULL DEFAULT 'new'` in items CREATE TABLE; new `ensureItemsStatus` (PRAGMA table_info-guarded ALTER for pre-existing scan-library DBs + `CREATE INDEX IF NOT EXISTS items_status`); called from Open after the schemaSQL loop.
- `internal/store/items.go` (MODIFY): `Item.Status string`; unexported `defaultStatus="new"`; `PutItem` writes status (defaults empty->new; ON CONFLICT refreshes it); `QueryItems` 5-arg `(ctx,libID,status,limit,offset)` with two parameterized query shapes (empty=all); `itemColumns`+`scanItem` carry status; added `database/sql` import.
- `internal/store/doc.go` (MODIFY): Item + QueryItems bullets note status (no new symbol).
- `internal/store/store_test.go` (MODIFY): existing QueryItems calls ->5-arg; +3 tests (StatusColumn_Default, ItemsStatus_RoundTrip, ItemsStatus_Migration).
- `internal/api/handlers.go` (MODIFY): listItems QueryItems ->5-arg (pass "").
- `internal/scan/run_test.go` (MODIFY): 3 QueryItems calls ->5-arg (pass "").
- `qa_resilience_test.go` (MODIFY): 1 QueryItems call ->5-arg (pass "").
- (integration_test.go listed as a caller but has only a comment, no QueryItems call — untouched.)

## Validation (all three tasks, run from mellifera/)
- `gofmt -l .` clean for hand-written (one pre-existing skill-template file flagged, not touched).
- `CGO_ENABLED=0 go build ./...` OK.
- `go vet ./...` OK.
- `go test ./...` 8 packages pass, 0 failures.
- `golangci-lint run ./...` exit 0 (funlen/gocognit/gocyclo/lll/dupl/depguard/govet/ineffassign/misspell clean).
- `bash .claude/skills/mellifera-build/scripts/check.sh` -> OK.
- AC probes: no proto edits vs 7bcc6c9; media strings only in tvConfigJSON seed config + tests; no reflect.

## Grounding-driven deviations (flagged for reviewer)
1. metadata_test uses bufconn+insecure (test-only gRPC utilities) to avoid a dupl clone with the scanner go-plugin harness.
2. PutItem defaults empty Status -> 'new' (AC-7 invariant; store owns only the column default, value-agnostic on the set).
3. parseModule CARRIES Enabled (no pre-filter) so the field stays meaningful; enrich (T05) sorts/runs by Priority.
4. acceptance AC-4 probe's line-based grep exclusion doesn't filter the multi-line tvConfigJSON raw string -> surfaces seed-config lines (AC-4 holds substantively); T13 refines the probe.

## T11 — AC-1 golden integration test + AC-2 gates (coder capstone; root test pkg, 0 package symbols)
- `integration_pipeline_test.go` (CREATE): the AC-1 golden — `package mellifera_test`, stdlib-only black-box. `TestIntegrationPipeline` builds REAL cmd/mellifera + base-scanner + tv-parser binaries, boots the server (temp SQLite + free port + admin token + BOTH plugin envs + fixture TV library), drives `POST /libraries` -> `POST /scan` -> `GET /items` with a real HTTP client. Reuses integration_test.go's harness; ip-prefixed helpers; `ipDeriveShow` derives season/episode/title from the fixture filename (strings-only, INV-reviewer-independence). 4 AC subtests: AC1_golden_provenance_state (sources.tv-parser + _provenance + _view + _stages + status=enriched + Cyrillic preservation), AC1_parseTV_split (base-scanner parsed has NO season/episode; sources.tv-parser carries them — B3 structural/negative), AC6_soft_fail (corrupt.mkv empty ffprobe; kinopoisk+tmdb unavailable in _stages/warnings; items still enriched), AC7_status_filter (`?status=enriched` returns exactly the 2 TV-parsed items, each with queryable provenance). Skips under -short / missing ffprobe|ffmpeg (INV-skip-clean).
- `integration_test.go` (MODIFY): B6 reconcile — added ONE additive `Status string` field to the shared test `itemDTO` so status is decodable package-wide (api already returns it; the test struct omitted it). Minimal; existing TestIntegrationScanLibrary does not read Status.

## Validation (T11, run from mellifera/)
- `gofmt -l .` clean for module source (only pre-existing .claude skill TEMPLATE flagged).
- `make build` (CGO_ENABLED=0 go build ./...) OK; `make build-plugin` -> both binaries.
- `go vet ./...` OK; `golangci-lint run ./...` exit 0; `check.sh` -> OK (exit 0).
- `go test ./...` all 9 packages pass (root pkg 9.9s incl all 3 goldens + TestIntegrationPipeline 4 subtests PASS).
- AC probes: AC-1 extraction (base-scanner 0 / tv-parser 12); AC-3 (proto diff empty, status DEFAULT 'new'); AC-4 (7 hits all in module seed tvConfigJSON config + doc comment, ZERO media-type branching in core — invariant holds); go.mod diff empty.

## Grounding-driven deviations (flagged for reviewer)
1. Reused integration_test.go harness (DRY per delegation); all new symbols ip-prefixed; *_test.go -> 0 package-symbol impact.
2. _stages 'parse stage': impl records stage:'metadata_source' + advanced_to (NOT 'parse'); golden asserts via plugin_id/advanced_to/status (grounded shape). The 'enriched' terminal lives in the status column, not a _stages entry.
3. AC-4 probe is line-based+loose (reports 7 sanctioned seed-config VALUES, not violations); ZERO media-type branching verified in core. Pre-existing, owned by T03/T05/T08 + T13; NOT introduced by T11 (test-only).

## CODER PHASE COMPLETE (11/11). Next: REVIEWER phase.

