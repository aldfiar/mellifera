# Task 01 — image-enricher plugin (subprocess serving MetadataSource + plugin.v1; EXIF via exiftool)

> Step Outline 1 + 2 + 3 + the package `doc.go`. CREATE package. This is the image
> analog of `plugins/tv-parser`. Emits the loadable `bin/image-enricher` binary
> consumed by Task 05 (cmd wiring) and Task 07 (golden e2e).

## Context

- **feature_goal:** add an image media type + an EXIF enricher to Mellifera so photos flow through the SAME pipeline as TV (discovery → base identify → B1 async queue → enricher attaches EXIF provenance).
- **why:** Mellifera has no image support. The image-enricher is the `metadata_source` subprocess that attaches EXIF provenance (make/model/date_taken/orientation/GPS + authoritative dimensions/format) to image items, exactly as tv-parser attaches filename-parse provenance to TV items.
- **data_flow:** B1 worker leases `(item, image-enricher)` → `Match(item)` (image? carry `absolute_path`) → `BuildRequest` (nop) → `Convert(query)` runs `exiftool -j -n <tags> <absPath>` arg-slice → parses JSON array `[0]` → maps tags → `Metadata` + per-field `Provenance` hints → `Merge` writes `document.sources["image-enricher"]` ONLY → core stamps `_provenance/_view/_stages` and the B1 settle predicate advances `enriched→ready`.
- **rationale (decision D-2):** EXIF is read by invoking the **system `exiftool` binary** via `os/exec` arg-slice — the SAME pattern Mellifera uses for `ffprobe` (`plugins/base-scanner/ffprobe.go:29-53`). This adds NO Go module dependency and reads HEIC/RAW natively. The earlier pure-Go `bep/imagemeta` choice was redirected at plan-review.

## Type

CREATE (new package `plugins/image-enricher`, package main).

## Seams owned

- **S3** image-enricher MetadataSource (Coverage Matrix → joint test in Task 07).
- **S8** EXIF dependency (no Go dep; exiftool via os/exec — proven by this task's build).

## behaviors

- B01: The image-enricher subprocess loads via go-plugin with the cookie pair `MELLIFERA_MAGIC_COOKIE`/`mellifera-plugin-v1`; `Handshake` advertises exactly ONE capability `{type:"metadata_source", id:"default", proto_service:"mellifera.metadata.v1.MetadataSource"}` + identity (plugin_id `image-enricher`, plugin_version `0.1.0`, sdk_version `v1`, min_core_version `0.1.0`). | ac: AC-1 | kind: normal
- B02: `(*enricherImpl) Match` applies iff `req.ModuleType=="image"` OR the lowercased `extension` (from `req.Item.Parsed`) is one of `.jpg/.jpeg/.png/.webp/.heic/.heif`; on applies it carries `absolute_path` (+ a `format` hint derived from the extension) in `Query` and sets `Confidence=1.0`. Non-image → `Applies=false` with a reason (skipped, NEVER an error — AC-softfail). No I/O in Match. | ac: AC-1, AC-image | kind: normal
- B03: `(*enricherImpl) BuildRequest` returns an empty `RequestSpec` (nop — the local EXIF "fetch" is the file read done in Convert; mirrors `parser.go:58-60`). | ac: AC-1 | kind: normal
- B04: `(*enricherImpl) Convert` runs `runExiftool(ctx, Query.absolute_path)`; when exiftool succeeds on a decodable image the returned `Metadata` is NON-EMPTY with at least `{width,height,format}` (so a valid image is a clean success, not a spurious `no_data` — `retry.go:53-55`), plus `make/model/date_taken/orientation/gps_lat/gps_lon` when exiftool returns those tags; each present field gets a per-field `Provenance` hint `{plugin_id, plugin_version, fetched_at}`. | ac: AC-1, AC-image | kind: normal
- B05: `(*enricherImpl) Merge` writes `Document.Data = {"sources": {"image-enricher": incoming}}` ONLY and proposes one `ViewBinding` per metadata field (`Reason:"priority"`). It NEVER writes `_provenance/_view/_stages` or any other source namespace (core-stamped + validated — `chain.go:104-122`). | ac: AC-1 | kind: normal
- B06: When exiftool is MISSING / non-zero / timeout / non-JSON, `Convert` returns EMPTY `Metadata` + a `Warnings` entry (a soft-fail, NOT a gRPC error) → the empty namespace → B1 `no_data` terminal → cooldown → settle. Only a cancelled context is a hard error. | ac: AC-softfail | kind: error
- B07: `exec.LookPath("exiftool")` runs on every Convert use; a missing binary is the soft-fail path above (a missing exiftool is NEVER a startup/build failure — exiftool is a runtime dep). | ac: AC-softfail | kind: normal
- B08: A valid EXIF-less image (e.g. a plain PNG) still yields `{width,height,format}` from exiftool's `-ImageWidth/-ImageHeight/-FileType` → clean success (not `no_data`). | ac: AC-softfail | kind: edge
- B09: HEIC/HEIF items are read natively by exiftool (no special branch) — Convert returns the full EXIF+dimensions namespace for them. | ac: AC-image | kind: edge
- B10: Non-ASCII EXIF strings (e.g. a Cyrillic/non-ASCII camera `Model`) are carried VERBATIM in `sources.image-enricher.model` (exiftool emits UTF-8 JSON; strings are not re-encoded). | ac: AC-unicode | kind: edge
- B11: The package builds under `CGO_ENABLED=0 go build ./plugins/image-enricher/` (exiftool is an external `os/exec` process, NOT CGO); there is NO `import "C"` and NO new Go module dependency (`go.mod` untouched). | ac: AC-2 | kind: normal

## invariants

- STATELESS SUBPROCESS (arch §0.2): `enricherImpl{}` has no fields; every RPC output is a pure function of the request. A crash loses no in-flight work (core replays via enrich's per-source document copy).
- NAMESPACE WRITE: Merge writes ONLY `document.sources["image-enricher"]`; any other key is a core-rejected violation (mirrors `parser.go:83-103`).
- COOKIE PAIR matches core + sibling plugins (`MELLIFERA_MAGIC_COOKIE`/`mellifera-plugin-v1`); a mismatch is fatal at substrate handshake.
- SEPARATE PROCESS: imports `pkg/sdk` + `proto/**` + stdlib ONLY; MAY NOT import any `internal/*` (arch §10, R7). Adds NO third-party Go module.
- ARG-SLICE ONLY: exiftool is invoked via `exec.CommandContext(ctx, "exiftool", "-j", "-n", <tags>, absPath)` — `absPath` is ONE argument, NEVER a concatenated command string, NEVER a shell (golang-security; a hostile filename cannot inject). This mirrors `ffprobe.go:33-43`.
- EXIFTOOL ORDERING: Convert MUST run `runExiftool` and map `{ImageWidth→width, ImageHeight→height, FileType→format}` BEFORE considering optional tags, so a decodable image always yields a non-empty namespace (prevents the R-I5 spurious-`no_data` regression).
- OUTPUT BOUNDING: the tag list is exactly `-ImageWidth -ImageHeight -FileType -Make -Model -DateTimeOriginal -Orientation -GPSLatitude -GPSLongitude` (one-line-extensible); `-j` JSON, `-n` numeric (GPS/orientation scalar). No unbounded makernote dump.
- NO filename-date fallback: images are purely EXIF-based (D-4); Convert never guesses make/model/date from the filename.

## postcondition

A loadable `plugins/image-enricher` subprocess binary exists that implements the EXISTING `metadata.v1.MetadataSource` (Match/BuildRequest/Convert/Merge) + `plugin.v1.Plugin` (Handshake/Health/Shutdown) on one gRPC server, reads EXIF via the system `exiftool` arg-slice, soft-fails (empty namespace) when exiftool is missing/fails, builds pure-Go under `CGO_ENABLED=0`, and adds no Go module dependency.

## test_seed

In-package tests under `plugins/image-enricher/`:
- `enricher_test.go` (table-driven, REAL `exiftool` on small committed fixtures under `testdata/` — gate skips with `t.Skip` when `exec.LookPath("exiftool")` fails, mirroring the soft-fail contract):
  - Match: image item (module_type=image) → Applies=true, Query carries absolute_path; TV item (.mkv) → Applies=false; image by extension only (module_type empty, .jpg) → Applies=true.
  - Convert: a fixture JPEG WITH EXIF → metadata has width/height/format + make/model/date_taken/orientation/gps_lat/gps_lon (all that the fixture carries); a fixture PNG WITHOUT EXIF → metadata has exactly {width,height,format} and is NON-EMPTY (asserts B08 — no spurious no_data); a HEIC fixture → full namespace (B09); a fixture whose EXIF `Model` is a non-ASCII string → preserved verbatim (B10).
  - Merge: writes ONLY `sources.image-enricher` (no `_provenance/_view/_stages`, no other source); proposes one ViewBinding per field.
  - Soft-fail: exiftool-missing path is covered by asserting Convert returns empty Metadata + a non-empty Warnings entry when `runExiftool` yields no tags (use a fixture path that does not exist OR a test that monkeypatches via a helper that returns empty — see existing_code_snapshot note).
- `exiftool_test.go`: `runExiftool` arg-slice shape (assert the command uses `-j -n` and the explicit tag list — capture via a `Cmd` whose path is overridden OR by asserting the constructed arg slice on a small local helper that builds it), JSON-array `[0]` parsing, and that a corrupt/missing file yields an empty map + warning (soft-fail) with nil error.
- `pluginsvc_test.go` (optional, mirror tv-parser if it has one): Handshake advertises exactly one metadata_source capability with the right FQN.

`existing_code_snapshot` for the mirror: `plugins/tv-parser/main.go:16-47` (cookie/identity consts + `sdk.Serve`), `plugins/tv-parser/pluginsvc.go:24-77` (`pluginSvcPlugin` + `pluginServiceImpl`), `plugins/tv-parser/parser.go:32-153` (Match/BuildRequest/Convert/Merge + `provenanceHints`/`structFromQuery`/`pathFromParsed`), `plugins/base-scanner/ffprobe.go:29-53` (`probe` — the exec/soft-fail/JSON-valid pattern `runExiftool` mirrors), `plugins/tv-parser/doc.go:1-39` (package-doc shape).

## spec

### Files to CREATE (all under `plugins/image-enricher/`)

`doc.go` — package doc (responsibility, public API = `func main()`, invariants). Mirror `plugins/tv-parser/doc.go`. Apache-2.0 header. States: serves `metadata.v1.MetadataSource` + `plugin.v1.Plugin`; Match applies iff image + carries absolute_path; Convert runs the system `exiftool` arg-slice; Merge writes `sources.image-enricher` ONLY; STATELESS SUBPROCESS; NAMESPACE WRITE; COOKIE PAIR; SEPARATE PROCESS (pkg/sdk + proto + stdlib only; no `internal/*`); EXIF via external `exiftool` (runtime dep, NOT CGO).

`main.go` — entrypoint. Const block (mirror `tv-parser/main.go:16-24`): `magicCookieKey="MELLIFERA_MAGIC_COOKIE"`, `magicCookieValue="mellifera-plugin-v1"`, `pluginID="image-enricher"`, `pluginVersion="0.1.0"`, `sdkVersion="v1"`, `minCoreVersion="0.1.0"`, `metadataProtoFQN="mellifera.metadata.v1.MetadataSource"`. `func main()` builds `impl := &enricherImpl{}` and calls `sdk.Serve(sdk.HandshakeConfig{...}, &sdk.MetadataSourcePlugin{Impl: impl}, &pluginSvcPlugin{})`. (Mirror `tv-parser/main.go:34-47`, only `pluginID` differs.)

`pluginsvc.go` — verbatim structural mirror of `plugins/tv-parser/pluginsvc.go:24-77`: `pluginSvcPlugin` (with `NetRPCUnsupportedPlugin`), `GRPCServer` registers `pluginv1.PluginServer`, `GRPCClient` returns `"image-enricher is a server-only plugin"`, `pluginServiceImpl` with `Handshake` (advertises the one `metadata_source` capability), `Health=SERVING`, no-op `Shutdown`.

`exiftool.go` — `runExiftool`:
```go
const exiftoolBin = "exiftool"
const exiftoolTimeout = 30 * time.Second // per-file deadline (mirrors ffprobe probeTimeout)

// runExiftool runs `exiftool -j -n <selected tags> <absPath>` (arg-slice ONLY,
// NEVER a shell) and returns the first JSON object as a tag map. EVERY failure
// (missing binary / non-zero / timeout / non-JSON / empty array) is SOFT: returns
// an empty map + a human-readable warning + nil error (AC-softfail; the caller
// yields an empty namespace -> B1 no_data terminal). Mirrors probe (ffprobe.go:29-53).
func runExiftool(ctx context.Context, absPath string) (tags map[string]any, warning string)
```
Steps: `exec.LookPath(exiftoolBin)` → miss → `return map[string]any{}, "exiftool not found on PATH", nil`; `context.WithTimeout(ctx, exiftoolTimeout)`; build the arg slice `["-j","-n","-ImageWidth","-ImageHeight","-FileType","-Make","-Model","-DateTimeOriginal","-Orientation","-GPSLatitude","-GPSLongitude", absPath]`; `exec.CommandContext(pctx, exiftoolBin, args...)` (NEVER shell); `cmd.Output()`; switch on `DeadlineExceeded`/`err`/`!json.Valid(out)` → soft-fail; parse `[]map[string]any`; if empty array → soft-fail; else return `[0]`, `""`. (Factor the tag-list into a package var `exiftoolTags` so the unit test can assert it without hardcoding — keeps `runExiftool` under funlen 60.)

`enricher.go` — `enricherImpl` + the 4 RPCs + helpers:
```go
var _ sdk.MetadataSource = (*enricherImpl)(nil)   // compile-time assert (mirror parser.go:20)
type enricherImpl struct{}                         // stateless

func (*enricherImpl) Match(_ context.Context, req *metadatav1.MatchRequest) (*metadatav1.MatchResult, error)
func (*enricherImpl) BuildRequest(_ context.Context, _ *metadatav1.BuildRequestRequest) (*metadatav1.BuildRequestResponse, error)
func (*enricherImpl) Convert(_ context.Context, req *metadatav1.ConvertRequest) (*metadatav1.ConvertResult, error)
func (*enricherImpl) Merge(_ context.Context, req *metadatav1.MergeRequest) (*metadatav1.MergeResult, error)
```
- `Match`: read `req.GetItem().GetParsed()`; if `req.GetModuleType()=="image"` OR `isImageExt(parsed.Fields["extension"].GetStringValue())` → `Applies=true`, build `Query` struct carrying `absolute_path` (and `relative_path`/`extension`/`format` hint); else `Applies=false, Reason:"not an image"`.
- `BuildRequest`: return `&BuildRequestResponse{Spec: &RequestSpec{}}` (mirror `parser.go:58-60`).
- `Convert`: `absPath := req.GetQuery().GetFields()["absolute_path"].GetStringValue()`; `tags, warning := runExiftool(ctx, absPath)`; `meta := mapExif(tags)` (maps `ImageWidth→width`, `ImageHeight→height`, `FileType→format` (lowercase the FileType, e.g. `JPEG→jpeg`), `Make→make`, `Model→model`, `DateTimeOriginal→date_taken` (normalize to RFC3339 when parseable, else carry verbatim), `Orientation→orientation`, `GPSLatitude→gps_lat`, `GPSLongitude→gps_lon`; absent tags simply absent); build `Metadata` via `structpb.NewStruct(meta)`; on `warning != ""` OR empty `meta` append a `Warnings` entry (soft); return `&ConvertResult{Metadata: meta, Provenance: provenanceHints(meta), Warnings: ...}`. Keep Convert under funlen 60 by factoring `mapExif` out.
- `Merge`: verbatim mirror of `parser.go:83-103` (only the namespace id is `image-enricher` via `req.GetPluginId()` / fallback `pluginID`).
- `provenanceHints`: verbatim mirror of `parser.go:141-153`.
- `isImageExt(ext string) bool` and the `format` hint helper: lowercase the dotted extension, check against `{".jpg",".jpeg",".png",".webp",".heic",".heif"}`; `format` hint `jpeg/png/webp/heic` (best-effort; FileType from exiftool is authoritative at Convert).

### Steps (ordered)
1. Write `doc.go`.
2. Write `main.go` (consts + `sdk.Serve`).
3. Write `pluginsvc.go` (mirror tv-parser).
4. Write `exiftool.go` (`runExiftool` + `exiftoolTags`).
5. Write `enricher.go` (`enricherImpl` + 4 RPCs + `mapExif` + `provenanceHints` + `isImageExt`).
6. Commit small binary-safe image fixtures under `plugins/image-enricher/testdata/` (a tiny JPEG with EXIF, a tiny EXIF-less PNG, a tiny HEIC — see Task 07 / fixtures note; if HEIC is hard to hand-author, the HEIC unit case may be covered by the e2e fixture in Task 07 instead and skipped here with a referenced TODO).
7. Write the `*_test.go` files listed in `test_seed`.
8. Run `cd /Users/alldfiar/projects/go/mellifera && CGO_ENABLED=0 go build ./plugins/image-enricher/ && go test ./plugins/image-enricher/`.

## allowed_imports

- `github.com/mellifera/mellifera/pkg/sdk`
- `github.com/mellifera/mellifera/proto/mellifera/metadata/v1` (as `metadatav1`)
- `github.com/mellifera/mellifera/proto/mellifera/common/v1` (as `commonv1`)
- `github.com/mellifera/mellifera/proto/mellifera/plugin/v1` (as `pluginv1`)
- `google.golang.org/protobuf/types/known/structpb`
- `google.golang.org/protobuf/types/known/timestamppb`
- stdlib: `context`, `os`, `os/exec`, `encoding/json`, `fmt`, `time`, `path/filepath`, `strings`, `errors`
- (tests only) stdlib `testing`

allowed_categories: stdlib (implicit).

## allowed_categories

stdlib

## negative_examples

- DO NOT import any `internal/*` package (arch §10, R7; the enricher is a separate process).
- DO NOT add any third-party Go module dependency (no `bep/imagemeta`, no EXIF lib — exiftool is the system binary via `os/exec`). `go.mod` MUST stay untouched.
- DO NOT invoke exiftool via a shell or concatenated command string — `exec.Command`/`exec.CommandContext` arg-slice ONLY, `absPath` is one argument.
- DO NOT use `import "C"` or any CGO (exiftool is an external process).
- DO NOT write `_provenance`/`_view`/`_stages` or any source namespace other than `sources.image-enricher` from Merge.
- DO NOT guess make/model/date from the filename (no filename fallback — D-4).
- DO NOT return a gRPC error for missing-exiftool / non-zero-exit / timeout / non-JSON — those are soft-fails (empty Metadata + Warnings).
- DO NOT edit `go.mod`, `go.sum`, any `proto/**`, `internal/**`, or `pkg/sdk/**`.

## out_of_scope

- `go.mod` / `go.sum` (NO new Go dep — S8).
- `proto/**`, `internal/api/**`, `internal/enrich/**`, `internal/scan/**`, `internal/module/**`, `internal/store/**`, `pkg/sdk/**` (additive-only — AC-3 / AC-queue).
- `plugins/base-scanner/**` (Task 02 owns image discovery).
- `cmd/mellifera/**` (Task 05 owns plugin loading).
- `Makefile` (Task 06 owns the build-plugin target).

## scope_boundary

CREATE only files under `plugins/image-enricher/` (`doc.go`, `main.go`, `pluginsvc.go`, `exiftool.go`, `enricher.go`, `*_test.go`, `testdata/` fixtures). No other package is modified.

## project_scope

.

## callers_to_update

NONE (package main, ~0 exported symbols — mirrors tv-parser). The binary is consumed at runtime by `cmd/mellifera` (Task 05) via a filesystem path + the `metadata_source` capability declaration, and by the B1 worker (`internal/enrich/chain.go:49-97`) over gRPC — neither is a Go-import caller. Compile-time consumer: `sdk.MetadataSourcePlugin{Impl: &enricherImpl{}}` in this package's own `main.go`.

## line_budget

360  (5 source files + tests; structural mirror of tv-parser + ffprobe, not novel code)
line_budget_flex: 1.2

## test_exclusions

- The cookie/identity `const` block (configuration constants — mirror `tv-parser/main.go:16-24`).
- `pluginServiceImpl.Handshake/Health/Shutdown` (verbatim mirror of `pluginsvc.go:54-77`; framework-shaped stubs).
- `BuildRequest` (nop returning an empty `RequestSpec` — mirror `parser.go:58-60`).
- `main()` (composition only — wires `sdk.Serve`).

## refactoring_checklist

- [ ] `cd /Users/aldfiar/projects/go/mellifera && CGO_ENABLED=0 go build ./plugins/image-enricher/` exits 0 (pure-Go binary — AC-2 / S8).
- [ ] `grep -rnE 'import "C"' plugins/image-enricher/` → 0 hits.
- [ ] `git diff --name-only -- go.mod go.sum` → empty (no new Go dependency).
- [ ] `grep -rn 'shell' plugins/image-enricher/exiftool.go` → no shell invocation; exiftool invoked via `exec.CommandContext(...)` arg-slice with `absPath` as one argument.
- [ ] `go test ./plugins/image-enricher/` green (real exiftool cases skip cleanly when exiftool absent).
- [ ] Exported-symbol count of the package is ~0 (`package main`; `check.sh` N/A for main but the package must not grow exports).

## skill_hint

- golang-security (exec.Command arg-slice — the load-bearing constraint for `runExiftool`)
- mellifera-build (CGO_ENABLED=0 pure-Go build + the gate)
- grounding (G1/G2 every referenced symbol — `sdk.Serve`, `sdk.MetadataSourcePlugin`, the 4 RPC message types — confirmed in `pkg/sdk/metadata.go` + tv-parser)

## deps

(none — first task; produces the binary Task 05 loads and Task 07 exercises)

## verify

```
cd /Users/aldfiar/projects/go/mellifera
CGO_ENABLED=0 go build ./plugins/image-enricher/
go vet ./plugins/image-enricher/
go test ./plugins/image-enricher/
git diff --name-only -- go.mod go.sum | grep . ; echo "go.mod_unchanged_exit=$?"  # expect exit=1
```
