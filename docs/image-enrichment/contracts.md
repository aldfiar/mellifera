# Contracts — image-enrichment (Phase B2)

> Image media type + an EXIF enricher (`metadata_source` plugin that invokes the
> system `exiftool` subprocess via `os/exec`, mirroring the ffprobe pattern — NO new
> Go module dependency). Additive on
> shipped Phase A + B1 (`main` @ `e2a7562`): no proto/api/queue/sdk edits (AC-3);
> image items consume the B1 async queue UNCHANGED. The image-enricher mirrors
> `plugins/tv-parser` structurally; only the capability body differs (filename parse
> → EXIF extraction). Mirrors the `docs/async-enrichment/contracts.md` layout.

## Target: mellifera (single project)

### Module Boundaries

- **`plugins/image-enricher`** (NEW, package main) — the EXIF `metadata_source`
  subprocess. Implements the EXISTING `sdk.MetadataSource`. STATELESS between RPCs
  (arch §0.2). Extracts EXIF by invoking the **system `exiftool`** binary via
  `os/exec` arg-slice (NEVER shell — the same pattern as base-scanner's `ffprobe`).
  Imports `pkg/sdk` + proto + stdlib ONLY (`os`, `os/exec`, `encoding/json`,
  `context`, `fmt`, `time`, `path/filepath`, `strings`) — MAY NOT import any
  `internal/*` (arch §10, R7), and adds NO third-party Go module. INV-separate-process.
- **`plugins/base-scanner`** (MODIFY, package main) — gains image discovery
  (module-type-gated extension selection) + a stdlib image base-info probe. Stays
  media-type-aware ONLY as a plugin (the core never branches — INV2).
- **`internal/scan`** (MODIFY) — stamps the reconstructed absolute file path into
  `doc["parsed"]` so the enricher can open the file. Generic, media-type-agnostic
  (INV2 preserved). INV-downward preserved (no import of api/plugin).
- **`internal/module`** (MODIFY) — seeds an `image` module config row. Config entity,
  not code (INV1/INV2). Stays at 7 exported symbols.
- **`cmd/mellifera`** (MODIFY) — loads/starts/stops the image-enricher subprocess.
- **`internal/enrich` / `internal/store` / `internal/api` / `pkg/sdk` / `proto/**`**
  — UNCHANGED (no_seam; AC-3). Image items flow through the B1 queue; the store is
  media-type-agnostic; the API already accepts an arbitrary `module_id`.

### Imports Map

#### plugins/image-enricher (NEW)
```
github.com/mellifera/mellifera/pkg/sdk                       # MetadataSource adapter, HandshakeConfig, Serve
github.com/mellifera/mellifera/proto/mellifera/metadata/v1    # the 4 RPCs (Match/BuildRequest/Convert/Merge) — EXISTING service
github.com/mellifera/mellifera/proto/mellifera/common/v1      # MediaDocument, ViewBinding, Provenance
github.com/mellifera/mellifera/proto/mellifera/plugin/v1      # Plugin service (Handshake/Health/Shutdown)
os, os/exec, encoding/json, context, fmt, time, path/filepath, strings  # stdlib only — invokes system `exiftool`
google.golang.org/protobuf/types/known/structpb               # metadata Struct + Query
google.golang.org/protobuf/types/known/timestamppb            # provenance fetched_at
# NO third-party Go module — exiftool is a system runtime dep (like ffmpeg/ffprobe), invoked via os/exec.
```

#### plugins/base-scanner (MODIFY — additive)
```
# existing (unchanged)
github.com/mellifera/mellifera/pkg/sdk
github.com/mellifera/mellifera/proto/mellifera/scanner/v1
google.golang.org/protobuf/types/known/structpb
# NEW (stdlib only — no third-party dep added to base-scanner)
image/jpeg, image/png               # blank-imported stdlib decoders for image.DecodeConfig (base dims/format at discovery)
# NOTE (INFO-1): image/webp is NOT a stdlib package in Go 1.25 — webp decoding lives in
# golang.org/x/image/webp (third-party, forbidden by the no-new-Go-dep rule AC-2/S8).
# So ONLY jpeg/png get stdlib base dims. webp (and heic/heif) stay DISCOVERED (imageMime)
# but stdlib base-info soft-fails at discovery; exiftool supplies full data at enrichment.
```

#### internal/scan (MODIFY — additive)
```
# existing (unchanged) + path/filepath (already transitive via stdlib) for filepath.Join(root, rel)
# NO new third-party import. NO import of plugins/* or internal/enrich internals beyond the existing enrich.Deps.
```

#### internal/module, cmd/mellifera, internal/enrich, internal/store, pkg/sdk
Unchanged import sets (cmd adds the image-enricher Load/Start/Stop calls but no new import).

### Shared Types

The image-enricher (package main) has NO exported symbols (mirrors tv-parser). Its
unexported types/funcs:

```go
// enricherImpl satisfies sdk.MetadataSource (compile-time assert, mirror parser.go:20).
type enricherImpl struct{}            // stateless

// exiftool.go — the enricher's EXIF helper. Invokes the SYSTEM exiftool binary
// via os/exec arg-slice (NEVER a shell; mirrors plugins/base-scanner/ffprobe.go probe).
// runExiftool runs `exiftool -j -n <selected tags> <absPath>` with a bounded timeout,
// parses the JSON array (one object), and maps known tags to the namespace keys.
// EVERY failure (missing binary, non-zero exit, timeout, non-JSON) is SOFT: returns
// an empty map + a human-readable warning (AC-6; the caller yields an empty namespace
// -> B1 no_data terminal). Fields absent from the output are simply absent.
func runExiftool(ctx context.Context, absPath string) (tags map[string]any, warning string)
```

```go
// plugins/base-scanner/image.go (NEW) — mirrors probe's (data, warning, err) soft-fail signature.
// probeImage decodes the image header via STDLIB (image.DecodeConfig) and returns
// {"width","height","format"} JSON. HEIC/RAW soft-fail (stdlib has no decoder).
func probeImage(ctx context.Context, absPath string) (data []byte, warning string, err error)
```

Parsed-document keys (free-form, `IdentifyResult.Parsed`):
- `relative_path`, `extension` — base-scanner (existing, `scanner.go:62-65`).
- `absolute_path` — NEW, stamped by scan (`filepath.Join(lib.RootPath, rel)`); the
  enricher reads it to open the file. Additive; tv-parser ignores it.

EXIF namespace (`sources.image-enricher`), lowercase snake_case, absent-when-missing:
```json
{ "width": 4000, "height": 3000, "format": "jpeg",
  "make": "Apple", "model": "iPhone 15",
  "date_taken": "2024-07-30T14:21:05Z",
  "orientation": 6,
  "gps_lat": 55.7558, "gps_lon": 37.6173 }
```

### Interface Contracts

#### `(*enricherImpl) Match(ctx, *metadatav1.MatchRequest) (*metadatav1.MatchResult, error)`
- **Purpose:** decide whether this item is an image this enricher handles; carry the
  file location into the chain's Query.
- **Precondition:** `req.Item.Parsed` may carry `absolute_path`, `relative_path`,
  `extension`; `req.ModuleType` is the module's media type.
- **Postcondition:** `Applies=true` iff `ModuleType=="image"` OR the lowercased
  `extension` is an image extension (jpg/jpeg/png/webp). On applies, `Query` carries
  `absolute_path` (+ `format` hint from extension); `Confidence=1.0`. No I/O. On
  non-image: `Applies=false` (skipped — never an error, AC-6).
- **Source:** mirror `plugins/tv-parser/parser.go:38-51`.

#### `(*enricherImpl) BuildRequest(ctx, *metadatav1.BuildRequestRequest) (*metadatav1.BuildRequestResponse, error)`
- **Purpose:** acknowledge; no external fetch (the local EXIF "fetch" is the file read
  done in Convert).
- **Postcondition:** returns an empty `RequestSpec` (mirror `parser.go:58-60`).

#### `(*enricherImpl) Convert(ctx, *metadatav1.ConvertRequest) (*metadatav1.ConvertResult, error)`
- **Purpose:** run `exiftool` on the file at `Query.absolute_path`, parse its JSON
  output, and return the metadata.
- **Precondition:** `Query.absolute_path` is present (Match carried it). The system
  `exiftool` binary SHOULD be on PATH; if not, this is a soft-fail (below).
- **Command:** `exec.CommandContext(ctx, "exiftool", "-j", "-n", "-ImageWidth",
  "-ImageHeight", "-FileType", "-Make", "-Model", "-DateTimeOriginal", "-Orientation",
  "-GPSLatitude", "-GPSLongitude", absPath)` — arg-slice ONLY (absPath is one argument;
  NEVER a shell — golang-security), bounded by a per-file timeout (mirrors
  `ffprobe.go:33-43`). Tags are explicitly selected to bound output (no megabytes of
  makernotes); the set is extensible.
- **Postcondition:** `Metadata` is the mapped namespace (`width/height/format` always
  when exiftool succeeds on a valid image; `make/model/date_taken/orientation/
  gps_lat/gps_lon` when present) + per-field `Provenance` hints. A non-empty namespace
  → clean success (not a spurious `no_data`, `retry.go:53-55`). On exiftool-missing /
  non-zero / timeout / non-JSON: return EMPTY `Metadata` + a `Warnings` entry (soft) →
  the empty namespace → B1 `no_data` terminal → 30-day cooldown → settle (AC-6/AC-softfail).
- **Throws:** exiftool failures are SOFT (empty metadata + warning, NOT a gRPC error);
  only a cancelled context is hard. HEIC/RAW are read natively by exiftool (no special
  handling).
- **Source:** mirror shape `parser.go:68-74`; exec pattern `ffprobe.go:29-53`; D-2.

#### `(*enricherImpl) Merge(ctx, *metadatav1.MergeRequest) (*metadatav1.MergeResult, error)`
- **Purpose:** write the metadata into `document.sources["image-enricher"]` ONLY.
- **Postcondition:** `Document.Data = {"sources": {"image-enricher": metadata}}`;
  proposes `View` bindings (one per field, `Reason:"priority"`). Never touches
  `_provenance/_view/_stages` (core-stamped + validated, `chain.go:104-122`).
- **Source:** verbatim mirror of `parser.go:83-103` (only `pluginID` differs).

#### `plugins/base-scanner.probeImage(ctx, absPath) (data, warning, err)`
- **Purpose:** gather image base info (dimensions/format) at discovery via stdlib.
- **Precondition:** `absPath` is within the resolved library root (already verified by
  `withinRoot`, `walk.go:67`).
- **Postcondition:** on success returns JSON `{"width":W,"height":H,"format":"jpeg"|"png"}`
  — ONLY jpeg/png have stdlib decoders (`image/jpeg`+`image/png` are blank-imported).
  webp/heic/heif/RAW reach here only by extension match but have NO stdlib decoder, so
  `image.DecodeConfig` errors and they **soft-fail** (INFO-1: `image/webp` is not a stdlib
  package; `golang.org/x/image/webp` is third-party, forbidden by AC-2). exiftool supplies
  their data at enrichment. EVERY failure (missing/unreadable/undecodable/corrupt/unknown
  format) is SOFT: empty `data` + a human-readable `warning` + nil `err` (mirror
  `ffprobe.go:29-53` INV3).
- **Source:** mirrors `probe` (`ffprobe.go:29-53`); uses `image.DecodeConfig`.

#### `internal/scan.assembleBaseDoc(... absPath string)`
- **Purpose:** stamp the reconstructed absolute path into `doc["parsed"]`.
- **Precondition:** `absPath = filepath.Join(lib.RootPath, f.RelativePath)`.
- **Postcondition:** `doc["parsed"]` additionally contains `absolute_path`. Existing
  keys (`relative_path`, `extension`) and the rest of the document are unchanged.
- **Source:** extends `run.go:334-352`.

### Constants

- No new item lifecycle statuses (B2 reuses B1's `new/pending/parsed/enriched/ready/
  stale/failed`; `state.go:11-20`).
- Plugin identity: `pluginID="image-enricher"`, `pluginVersion="0.1.0"`, `sdkVersion="v1"`,
  `minCoreVersion="0.1.0"`, `metadataProtoFQN="mellifera.metadata.v1.MetadataSource"`
  (mirrors `tv-parser/main.go:16-24`).
- Image extensions (base-scanner `imageMime`): `.jpg/.jpeg→image/jpeg`,
  `.png→image/png`, `.webp→image/webp`, `.heic/.heif→image/heic` — ALL discovered for an
  `image` module. (RAW — `.cr2/.nef/.arw/.dng` — is cheap to add later since exiftool reads
  them; held back to keep B2's extension set bounded.) base-scanner stdlib base-info yields
  dims for **jpeg/png only**; **webp/heic/heif/RAW soft-fail at discovery** (no stdlib
  decoder — INFO-1: `image/webp` is not a stdlib package); exiftool supplies their full
  data at enrichment.
- Runtime deps: `exiftool` (system-installed; `brew install exiftool` /
  `apt install libimage-exiftool-perl`) alongside `ffmpeg`/`ffprobe`. NOT a Go module
  dep; NOT a build dep (the `check.sh` gate is unchanged).

### Error Types

- **Soft-fail (per file / per source — AC-6):** an unreadable image, an undecodable
  image, a missing EXIF block, a namespace proposal that violates `sources.<own_id>`
  → the file/item is NOT aborted; a warning is recorded and the item settles via the
  B1 path. (Existing pattern: `ffprobe.go:29-53`, `enrich.go:52`.)
- **Hard-fail:** only a cancelled context (the B1 invariant — `enrich.go:75-77`,
  `retry.go:47-48`). The image-enricher is stateless; a crash loses no in-flight work.
- **Terminal-fail (B1):** a source that exhausts retries (`exhausted`) or runs clean
  but yields no metadata (`no_data`) → ledger + cooldown → settle. The image-enricher
  avoids spurious `no_data` by always returning ≥ `{width,height,format}` for a
  decodable image.

## Deferred — B3 (NOT built in this plan)

- External image enrichers (reverse-image-search, online EXIF/object detection) —
  that is a B3-style external `metadata_source` with `auth_mode` + a real fetch
  between BuildRequest and Convert.
- RAW discovery (`.cr2/.nef/.arw/.dng/…`) — exiftool reads RAW natively, so adding the
  extensions to `imageMime` is the only change needed; held back from B2 to keep the
  extension set bounded (judgment; cheap to add).
- Image generated columns (`width`/`height`/`date_taken`) in the store for indexed
  dimension queries — deferred (data lives in the opaque document for B2).
