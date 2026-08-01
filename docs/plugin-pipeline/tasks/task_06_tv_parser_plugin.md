# Task 06 — plugins/tv-parser: first metadata_source plugin (parseTV verbatim move)

- **Type:** coder
- **Step:** 8
- **Seams:** S3 (enrich↔tv-parser gRPC subprocess)
- **AC trace:** AC-1, AC-5
- **Project scope:** `.` (root; NEW `package main` at `plugins/tv-parser/`)
- **Deps:** Task 01 (`sdk.MetadataSourcePlugin`, `sdk.Serve`, `sdk.HandshakeConfig`); precondition: `plugins/base-scanner/tvparse.go` exists (the verbatim-move source)
- **Estimated LOC:** ~220 (M) — four files, package main (0 exported symbols)

## behaviors

- **B1** `plugins/tv-parser` is a standalone subprocess binary that serves `metadata.v1.MetadataSource` (the 4-RPC chain) AND `plugin.v1.Plugin` (Handshake/Health/Shutdown) on one shared gRPC server, launched via `sdk.Serve`. | ac: AC-1 | kind: normal
- **B2** The domain `Handshake` advertises ONE capability `{type:"metadata_source", id:"default", proto_service:"mellifera.metadata.v1.MetadataSource"}` + identity (plugin_id `tv-parser`, version, sdk_version, min_core_version). | ac: AC-1 | kind: normal
- **B3** `Match`: runs the (moved) `parseTV` on the item's relative path; `applies=true` with a `query={title,season,episode,...}` when a season/episode token is found, else `applies=false` (the source is skipped — not an error). | ac: AC-1, AC-6 | kind: normal
- **B4** `BuildRequest`: returns an empty/nop `RequestSpec` (Phase A has no external fetch; tv-parser is a local parser). Carries the `query` through. | ac: AC-1 | kind: normal
- **B5** `Convert`: derives normalized metadata `{title, season, episode, episode_end?, resolution?, release_group?, year?}` from the `query` (ignoring the empty `raw_response`) and returns it with per-field `provenance` (`common.v1.Provenance{plugin_id:"tv-parser", plugin_version, fetched_at, confidence}`). | ac: AC-1, AC-5 | kind: normal
- **B6** `Merge`: writes the metadata into `document.sources["tv-parser"]` ONLY (never any other namespace — arch §3.3), returns the updated document + `_view` bindings (`{field_path, source:"tv-parser", reason:"priority"}`). | ac: AC-1, AC-5 | kind: normal
- **B7** Cyrillic titles parse correctly (the moved regexes are ASCII-anchored on the season/episode token; `Игра престолов S01E01.mkv` -> title `Игра престолов`). | ac: AC-1 | kind: edge
- **B8** `tvparse.go` is a BYTE-FOR-BYTE verbatim move of `plugins/base-scanner/tvparse.go` (the 4 regexes + `parseTV`/`cleanTitle`/`parentDir`/`atoi`); only the license header + package are unchanged. | ac: AC-1 | kind: normal

## invariants

- **INV-stateless-subprocess:** tv-parser holds NO state between RPCs (arch §0 #2); all output is a pure function of the request. A crash loses no in-flight work (core replays via enrich's per-source doc copy, Task 05 INV-namespace/R-4).
- **INV-namespace-write:** Merge writes ONLY `document.sources["tv-parser"]`. Touching any other key is a violation the core rejects (Task 05). tv-parser MUST NOT write `_provenance`/`_view`/`_stages` itself — those are core-stamped (enrich owns the document schema; the plugin returns metadata + provenance map + view bindings and the core places them).
- **INV-verbatim-move:** `tvparse.go` is MOVED, not reimplemented. Do NOT rewrite the regexes or helpers. Cite `plugins/base-scanner/tvparse.go:1-112` as the source. (Task 07 deletes the original.)
- **INV-handshake-mirror:** `pluginsvc.go` mirrors `plugins/base-scanner/pluginsvc.go:22-74` (the `pluginSvcPlugin` + `pluginServiceImpl` Handshake/Health/Shutdown shape); `main.go` mirrors `plugins/base-scanner/main.go:29-42` (`sdk.Serve(...)` with the cookie pair). Cookie values MUST match the core (`MELLIFERA_MAGIC_COOKIE`/`mellifera-plugin-v1`).

## precondition

`sdk.MetadataSourcePlugin` + `sdk.Serve` exist (Task 01). The generated `metadatav1` server interface (`MetadataSourceServer`) + messages exist. `base-scanner` is the structural template.
- evidence: `plugins/base-scanner/tvparse.go:1-112` (the verbatim-move source — `seasonEpisodeRe`/`resolutionRe`/`releaseGroupRe`/`yearRe` + `parseTV`/`cleanTitle`/`parentDir`/`atoi`).
- evidence: `plugins/base-scanner/main.go:15-42` (constants + `sdk.Serve` wiring to mirror); `plugins/base-scanner/pluginsvc.go:22-74` (`pluginSvcPlugin`/`pluginServiceImpl` to mirror — change the capability declaration from `scanner` to `metadata_source`).
- evidence: `proto/mellifera/metadata/v1/metadata_grpc.pb.go:101` (`MetadataSourceServer` interface to implement); `metadata.proto:33-169` (the 4 RPC request/result messages); `common.proto:26-32` (`Provenance`).
- evidence: `proto/mellifera/metadata/v1/metadata.proto:107-108` comment — "The core wraps this into document['sources'][plugin_id] during Merge" (guides Merge's write target).
- evidence (build): `Makefile:29-31` (`build-plugin` builds only `bin/base-scanner` — generalize to also build `bin/tv-parser`).

## postcondition

`plugins/tv-parser/{main.go,pluginsvc.go,parser.go,tvparse.go,parser_test.go,doc.go}` exist; `make build-plugin` produces BOTH `bin/base-scanner` and `bin/tv-parser`. tv-parser serves `metadata_source`; a table test exercises Match (applies/not-applies incl. Cyrillic), BuildRequest (empty spec), Convert (metadata+provenance shape), Merge (writes only `sources.tv-parser`, returns view bindings). The package is `package main` (0 exported symbols; check.sh symbol rule N/A but a co-located test is still required by check.sh for any tested behavior).

## test_seed

`parser_test.go` (table-driven, mirrors base-scanner's parser tests):
- Match: `Show.Name.S01E02.1080p.mkv` -> applies=true, query has title `Show Name`, season 1, episode 2; a movie-style name -> applies=false.
- Convert: the SxxExx query -> metadata `{title,season,episode,resolution:"1080p"}` + provenance `plugin_id=="tv-parser"`.
- Merge: given a document, the returned document has `sources["tv-parser"]` populated and NO other top-level key added by the plugin (INV-namespace-write); view bindings list the fields with source `tv-parser`.
- Cyrillic: `Игра престолов S01E01.mkv` -> title `Игра престолов`, season 1, episode 1.

## callers_to_update

- `Makefile` — generalize the `build-plugin` target (`Makefile:29-31`) to build both `./plugins/base-scanner` and `./plugins/tv-parser` (foundational fold->step 8; the binary must exist for Task 10 to load it and Task 11 to test it).

## allowed_imports

- `context`, `path/filepath`, `regexp`, `strconv`, `strings`, `time` (stdlib)
- `google.golang.org/protobuf/types/known/structpb` (Struct, for metadata/query) — already used by the moved tvparse.go
- `google.golang.org/protobuf/types/known/timestamppb` (for `Provenance.fetched_at`) if stamping here; else omit
- `github.com/mellifera/mellifera/pkg/sdk`
- `github.com/mellifera/mellifera/proto/mellifera/plugin/v1` (pluginv1 — Handshake/Health/Shutdown)
- `github.com/mellifera/mellifera/proto/mellifera/metadata/v1` (metadatav1)
- `github.com/mellifera/mellifera/proto/mellifera/common/v1` (commonv1 — Provenance)
- `github.com/hashicorp/go-plugin`, `google.golang.org/grpc` (for the pluginSvc adapter, mirroring base-scanner/pluginsvc.go)

## allowed_categories

- `stdlib`

## test_exclusions

- `tvparse.go` is a verbatim move of ALREADY-tested logic — do NOT re-test `parseTV` internals here (they remain covered by base-scanner's tests until Task 07 deletes the original; after deletion the Cyrillic/parse cases are re-homed in this package's `parser_test.go` Match/Convert rows). The move itself is verified by the Task 07 extraction grep probes.

## negative_examples

- DO NOT reimplement the regexes/helpers — `tvparse.go` is a verbatim MOVE (INV-verbatim-move).
- DO NOT write `_provenance`/`_view`/`_stages` from the plugin — the core (enrich) owns those; the plugin returns metadata + a provenance map + view bindings (INV-namespace-write).
- DO NOT write to any `sources.<other>` namespace (arch §3.3; the core rejects it).
- DO NOT perform HTTP I/O (Phase A; BuildRequest returns an empty spec).
- DO NOT hardcode media-type strings in logic — tv-parser applies by filename structure (SxxExx), not by `if module_type=="tv"`.

## existing_code_snapshot

The verbatim-move source is `plugins/base-scanner/tvparse.go` (full file, 112 lines): the 4 regexes (`seasonEpisodeRe`/`resolutionRe`/`releaseGroupRe`/`yearRe`), `parseTV(relPath string) (*structpb.Struct, float64, string)`, `cleanTitle`, `parentDir`, `atoi`. The new `plugins/tv-parser/tvparse.go` is this file UNCHANGED (same package `main`).

`plugins/base-scanner/pluginsvc.go:51-63` `Handshake` capability declaration to mirror (change type):
```go
Capabilities: []*pluginv1.CapabilityDeclaration{{Type: "scanner", Id: "default", ProtoService: scannerProtoFQN}},
```
-> tv-parser declares `{Type: "metadata_source", Id: "default", ProtoService: "mellifera.metadata.v1.MetadataSource"}`.

`plugins/base-scanner/main.go:29-42` `main()` to mirror:
```go
impl := &scannerImpl{}
sdk.Serve(sdk.HandshakeConfig{...}, &sdk.ScannerPlugin{Impl: impl}, &pluginSvcPlugin{})
```
-> tv-parser: `sdk.Serve(cfg, &sdk.MetadataSourcePlugin{Impl: &parserImpl{}}, &pluginSvcPlugin{})`.

## contract_test_scope

- **joint (S3):** `internal/enrich (Task 05) -> tv-parser subprocess` | assert: enrich's 4-RPC chain drives tv-parser end-to-end and integrates `sources.tv-parser` + provenance. Verified in Task 11 integration (real subprocess, AC-1 golden). The server-side RPC behavior is covered here in `parser_test.go`.

## scope_boundary

- CREATE `plugins/tv-parser/main.go` (`sdk.Serve` wiring + cookie/identity constants)
- CREATE `plugins/tv-parser/pluginsvc.go` (`pluginSvcPlugin` + `pluginServiceImpl` declaring `metadata_source`)
- CREATE `plugins/tv-parser/parser.go` (`parserImpl` implementing `sdk.MetadataSource` Match/BuildRequest/Convert/Merge)
- CREATE `plugins/tv-parser/tvparse.go` (VERBATIM move from `plugins/base-scanner/tvparse.go`)
- CREATE `plugins/tv-parser/doc.go` (package contract)
- CREATE `plugins/tv-parser/parser_test.go` (table tests)
- MODIFY `Makefile` (`build-plugin` builds both binaries)

## out_of_scope

- DELETING `plugins/base-scanner/tvparse.go` + removing the call site (Task 07 — the extraction's delete half; this task only creates the destination)
- `internal/enrich` (Task 05 — the driver)
- `cmd/mellifera/main.go` Load/Start of tv-parser (Task 10)
- external fetch / AuthContext (Phase B)

## line_budget

220 (flex 1.3 — 4 source files + test; package main so no symbol-budget pressure)

## acceptance_criteria

- AC-1 (tv-parser is a plugin subprocess producing TV parse output; parseTV fully lives here after Task 07)
- AC-5 (per-field provenance `plugin_id=="tv-parser"`)

## refactoring_checklist

- `cd mellifera && go build ./plugins/tv-parser/... && go test ./plugins/tv-parser/...` green.
- `make build-plugin` -> both `bin/base-scanner` and `bin/tv-parser` exist.
- `diff <(sed '1d' plugins/base-scanner/tvparse.go) <(sed '1d' plugins/tv-parser/tvparse.go)` -> empty (the moved file is byte-identical modulo the header) BEFORE Task 07 deletes the original.
- `grep -n 'metadata_source' plugins/tv-parser/pluginsvc.go` >= 1 (capability declared).
- `./.claude/skills/mellifera-build/scripts/check.sh` OK.
- `git diff --stat 7bcc6c9 -- proto/` empty.

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
