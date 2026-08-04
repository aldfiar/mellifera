# Task 02 — base-scanner image discovery (module-type-gated extensions + stdlib base info)

> Step Outline 4 + 5 + 6. CREATE `image.go` + MODIFY `walk.go` + MODIFY `scanner.go`.
> base-scanner stays a discovery + base-info scanner (media-type-aware ONLY as a
> plugin — the core never branches, INV2). ffprobe stays the video probe; images
> use the Go stdlib for `{width,height,format}`.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher.
- **why:** discovery must recognize image extensions for an `image` module and gather base dimensions/format so a photo is listable with real dimensions BEFORE enrichment. A union (video+image) filter is REJECTED — it would discover TV cover-art `*.jpg` as junk (R-I4); the extension set is selected by `ScanRequest.module_type`.
- **data_flow:** `Scan` forwards `req.GetModuleType()` → `walk(ctx, root, moduleType, opts)` selects the extension map (`image`→`imageMime`, else video `mediaMime`) → per file, `toDiscovered` branches image→`probeImage` (stdlib `image.DecodeConfig`) / video→`probe` (ffprobe) → base info rides the opaque `FfprobeJson` field.
- **rationale (D-1/D-5):** stdlib for image base info keeps ffprobe as the video-only probe and adds no external binary to the image path. Module-type selection is sanctioned by `scanner.proto` ("Module type … Guides the scanner's parsing heuristics").

## Type

CREATE `plugins/base-scanner/image.go`; MODIFY `plugins/base-scanner/walk.go`, `plugins/base-scanner/scanner.go`.

## Seams owned

- **S1** base-scanner ext selection.
- **S2** base-scanner image probe.

(Joint tests → Task 07.)

## behaviors

- B01: `walk(ctx, root, moduleType, opts)` selects the extension map: `moduleType=="image"` → image extensions (`.jpg/.jpeg/.png/.webp/.heic/.heif`); otherwise → the existing video `mediaMime`. `isMedia`/`mimeType` key off the SELECTED map. | ac: AC-image, AC-3 | kind: normal
- B02: An image library discovers ONLY image files; a stray `.mkv` in a photo dir is NOT discovered (image map selected → `.mkv` absent). | ac: AC-image | kind: edge
- B03: A TV/movie library (module_type != "image") is byte-identical to today — the video `mediaMime` is selected, `.jpg` cover-art is NOT discovered (R-I4 no-regression). | ac: AC-3, AC-image | kind: edge
- B04: `toDiscovered` branches: image extension → `probeImage` (stdlib `image.DecodeConfig`); video extension → `probe` (ffprobe). ffprobe is NEVER invoked for images. | ac: AC-image | kind: normal
- B05: For **jpg/png only**, `probeImage` decodes the header via `image.DecodeConfig` and returns JSON `{"width":W,"height":H,"format":"jpeg"|"png"}` into the opaque `FfprobeJson` field, listable at `status=pending` BEFORE enrichment. **RECONCILED (INFO-1):** `image/webp` is NOT a stdlib package (Go 1.25) — webp stays DISCOVERED (`imageMime`) but, like HEIC, its stdlib base-info soft-fails at discovery; exiftool supplies full webp data at enrichment (Task 01). Only jpeg/png get stdlib base dims. | ac: AC-image | kind: normal
- B06: HEIC/HEIF are discovered (extension match) but their stdlib base-info soft-fails (empty) — Go's stdlib has no HEIC decoder; exiftool supplies full data at enrichment (Task 01). | ac: AC-image | kind: edge
- B07: EVERY `probeImage` failure (missing/unreadable/undecodable/corrupt/unknown format) is SOFT: empty `data` + a human-readable `warning` + nil `err` (mirrors `ffprobe.go:29-53` INV3). A bad image never aborts the walk. | ac: AC-softfail | kind: error
- B08: A Cyrillic-named image (e.g. `Фото.jpg`) IS discovered — the extension filter lowercases the ASCII dotted extension only (`.jpg`); the non-ASCII stem is untouched. | ac: AC-unicode | kind: edge
- B09: `Scan` forwards `req.GetModuleType()` into `walk`. | ac: AC-image | kind: normal

## invariants

- MEDIA-TYPE BRANCHING LIVES IN THE PLUGIN, NOT THE CORE (INV2). base-scanner is a plugin; it MAY be media-aware. `internal/scan` and the rest of the core never branch on media type.
- SELECTION BY `module_type`, NOT a union filter (R-I4): the image map is reachable ONLY for `module_type=="image"`. The existing video set is the fallback for every other value (including empty).
- SOFT-FAIL SIGNATURE: `probeImage` has the SAME `(data []byte, warning string, err error)` shape as `probe` (`ffprobe.go:29-53`); `err` is reserved/always-nil today (INV3 makes every image-decode problem a soft-fail).
- OPAQUE PROBE FIELD: image base info rides `DiscoveredFile.FfprobeJson` (opaque — the core does not structurally inspect it, `scanner.pb.go:113-119`); only the MIME/type via `mimeType` and the selected extension map differ.
- withinRoot re-verification (AC-4) is unchanged — every candidate is still re-verified before probing (`walk.go:67`).
- STALE-ON-RESCAN SAFE: adding image base info to `FfprobeJson` is deterministic for a given file → `baseChanged` (run.go) compares `parsed+ffprobe` byte-stably; no false-stale.

## postcondition

base-scanner discovers image extensions (incl. HEIC) for an `image` module only, gathers stdlib base `{width,height,format}` for **jpg/png only** into the opaque probe field (webp/HEIC/unknown soft-fail — INFO-1; exiftool supplies their data at enrichment), never invokes ffprobe for images, and leaves TV/movie scans byte-identical to today.

## existing_code_snapshot (G2-verified @ `e2a7562`)

`plugins/base-scanner/walk.go:50` (current signature — `opts` unused):
```go
func walk(ctx context.Context, root string, _ *structpb.Struct) <-chan *scannerv1.DiscoveredFile {
```
`plugins/base-scanner/walk.go:64-66` (isMedia gate, single map):
```go
			if !isMedia(path) {
				return nil
			}
```
`plugins/base-scanner/walk.go:71` (toDiscovered call, no moduleType):
```go
				case ch <- toDiscovered(ctx, root, path, d):
```
`plugins/base-scanner/walk.go:84-105` `toDiscovered` — calls `data, warning, _ := probe(ctx, path)` at `:93`; `MimeType: mimeType(path)` at `:98`; `FfprobeJson: data` at `:99`.
`plugins/base-scanner/walk.go:115-123`:
```go
func isMedia(path string) bool {
	_, ok := mediaMime[strings.ToLower(filepath.Ext(path))]
	return ok
}
func mimeType(path string) string {
	return mediaMime[strings.ToLower(filepath.Ext(path))]
}
```
`plugins/base-scanner/scanner.go:47` (walk call):
```go
	return walk(ctx, absRoot, req.GetOptions()), nil
```
`plugins/base-scanner/ffprobe.go:29-53` `probe` — the soft-fail `(data, warning, err)` signature + exec/JSON-valid pattern that `probeImage` mirrors (NOT modified here).

## test_seed

In-package tests under `plugins/base-scanner/`:
- `image_test.go`:
  - `probeImage` on a tiny committed jpg/png fixture → JSON `{width,height,format}` matching `image.DecodeConfig`; on a HEIC fixture (or truncated bytes, or a `.webp`) → empty data + a warning + nil err (soft-fail, B06/B07 — webp has no stdlib decoder, INFO-1); on a missing file → soft-fail (B07).
  - `imageMime` covers the 6 extensions; `isImage`/extension helpers lowercase ASCII only (B08 — feed a Cyrillic-stemmed `.jpg`, assert true).
- `walk_test.go` (extend if present, else add): drive `walk(ctx, root, "image", nil)` over a temp tree containing `a.jpg`, `b.mkv` → only `a.jpg` emitted (B02); drive `walk(ctx, root, "tv", nil)` over a tree with `cover.jpg` + `show.mkv` → only `show.mkv` emitted (B03 — no cover-art regression); assert the image walk does NOT call ffprobe (use a fake/flag if the existing test harness allows, else assert `FfprobeJson` carries stdlib dimensions for a jpg and is empty for a `.webm`-named... — keep the assertion to the image map's behavior).
- `scanner_test.go` (extend if present): `Scan` with `req.ModuleType="image"` forwards moduleType into walk (assert discovered set is image-only for an image fixture tree).

## spec

### File to CREATE: `plugins/base-scanner/image.go`

```go
// SPDX-License-Identifier: Apache-2.0
// Code generated by humans, not boilerplate; see LICENSE.

package main

import (
	"context"
	"encoding/json"
	"errors"
	// stdlib image decoders (pure-Go) for base dimensions/format at discovery.
	// ONLY jpeg/png: image/webp is NOT a stdlib package (INFO-1) — webp/heic/heif/
	// RAW are discovered (imageMime) but stdlib base-info soft-fails (no decoder);
	// exiftool supplies their full data at enrichment (Task 01 / image-enricher).
	_ "image/jpeg"
	_ "image/png"
)

// imageMime maps a lowercased image extension to its MIME type. A file whose
// extension is absent here is not an image. Selected by walk only when
// ScanRequest.module_type == "image" (module-type-gated discovery — D-1; a UNION
// filter would discover TV cover-art jpgs as junk, R-I4).
var imageMime = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".webp": "image/webp",
	".heic": "image/heic",
	".heif": "image/heic",
}

// isImage reports whether path's lowercased extension is an image extension.
func isImage(path string) bool {
	_, ok := imageMime[strings.ToLower(filepath.Ext(path))]
	return ok
}

// imageMimeOf returns the MIME type for path's image extension ("" if not image).
func imageMimeOf(path string) string {
	return imageMime[strings.ToLower(filepath.Ext(path))]
}

// probeImage decodes the image header via the STDLIB (image.DecodeConfig) and
// returns JSON {"width":W,"height":H,"format":"jpeg"|"png"} — ONLY jpeg/png have
// stdlib decoders. EVERY failure (missing/unreadable/undecodable/unknown format —
// incl. webp/heic/heif/RAW, for which the stdlib has no decoder — INFO-1) is SOFT:
// empty data + a human-readable warning + nil err (mirrors probe / ffprobe.go:29-53
// INV3). exiftool supplies webp/HEIC/RAW data at enrichment. absPath is within the
// resolved library root (withinRoot, walk.go:67).
func probeImage(ctx context.Context, absPath string) (data []byte, warning string, err error)
```
`probeImage` steps: `os.Open(absPath)` (use `context`-aware open via `os.Open` — the per-file timeout pattern is optional here since `DecodeConfig` reads only the header, but keep the soft-fail shape); `image.DecodeConfig(f)`; on any error → `return nil, "image decode failed: <err>", nil`; on success build `map[string]any{"width": cfg.Width, "height": cfg.Height, "format": <format-of(cfg)>}` where format is derived from `cfg.Model`'s package (`"jpeg"|"png"` ONLY — webp/heic/heif/RAW have no stdlib decoder so they never reach success; unknown → soft-fail with `"image format not supported at discovery"`); `json.Marshal` → return bytes, `""`, nil. Keep under funlen 60.

### File to MODIFY: `plugins/base-scanner/walk.go`

1. Signature: `func walk(ctx context.Context, root, moduleType string, _ *structpb.Struct) <-chan *scannerv1.DiscoveredFile` (add `moduleType string`).
2. Add a local selector at the top of `walk` (or as a helper): `extMap := mediaMime; if moduleType == "image" { extMap = imageMime }`. Pass `extMap` (or `moduleType`) down to `isMedia`/`mimeType`/`toDiscovered`. (Preferred: a small `type extSet map[string]string` or just pass the selected map + a bool `imageMode` to `toDiscovered`. Keep the change minimal and the functions under funlen 60.)
3. `isMedia(path)` / `mimeType(path)` → `isMediaFor(path, extMap)` / `mimeTypeFor(path, extMap)` (parameterize; keep the existing no-arg wrappers calling with `mediaMime` for any other internal caller — verify there are none beyond `walk` via grep; `callers_to_update` lists the result).
4. `toDiscovered(ctx, root, path, d, imageMode bool)`: when `imageMode && isImage(path)` → `data, warning, _ = probeImage(ctx, path)` and `MimeType = imageMimeOf(path)`; else → existing `probe(ctx, path)` + `mimeType(path)` (video). `FfprobeJson: data` and the `Warnings` carry-through are unchanged.

### File to MODIFY: `plugins/base-scanner/scanner.go`

`scanner.go:47` — change `return walk(ctx, absRoot, req.GetOptions()), nil` → `return walk(ctx, absRoot, req.GetModuleType(), req.GetOptions()), nil`. (One-line forward — Estimate XS.)

### Steps (ordered)
1. Write `image.go` (`imageMime`, `isImage`, `imageMimeOf`, `probeImage`).
2. Edit `walk.go`: add `moduleType` param + selected-map threading + image/video branch in `toDiscovered`.
3. Edit `scanner.go`: forward `req.GetModuleType()`.
4. Grep for other callers of `isMedia`/`mimeType`/`walk`/`toDiscovered` in this package; update signatures consistently (see callers_to_update).
5. Add/extend the `*_test.go` files in `test_seed`.
6. `cd /Users/alldfiar/projects/go/mellifera && CGO_ENABLED=0 go build ./plugins/base-scanner/ && go test ./plugins/base-scanner/`.

## allowed_imports

(existing base-scanner imports carry forward) +
- `github.com/mellifera/mellifera/pkg/sdk`
- `github.com/mellifera/mellifera/proto/mellifera/scanner/v1` (as `scannerv1`)
- `google.golang.org/protobuf/types/known/structpb`
- stdlib: `context`, `encoding/json`, `errors`, `fmt`, `os`, `path/filepath`, `strings`, `io/fs`, `crypto/sha256`, `encoding/hex`
- NEW stdlib (image base info): `image`, `image/jpeg`, `image/png` (blank-imported jpeg/png decoders + `image.DecodeConfig`). **NOT `image/webp`** — it is not a stdlib package (INFO-1); webp is discovered via `imageMime` but stdlib base-info soft-fails.

allowed_categories: stdlib

## callers_to_update

In-package (same package `main`, same directory) — update signatures together:
- `plugins/base-scanner/walk.go:50` (`walk` signature), `:64` (`isMedia` call site), `:71` (`toDiscovered` call site), `:84` (`toDiscovered` signature), `:93` (`probe` call — branch), `:98-99` (`mimeType`/`FfprobeJson`), `:115-118` (`isMedia`), `:121-123` (`mimeType`).
- `plugins/base-scanner/scanner.go:47` (`walk` call — forward `req.GetModuleType()`).
- Any in-package test that calls `walk`/`toDiscovered`/`isMedia`/`mimeType` directly (`grep -n 'walk(\|toDiscovered(\|isMedia(\|mimeType(' plugins/base-scanner/*_test.go`) → update to the new signatures.

evidence: `plugins/base-scanner/walk.go:50,64,71,84,93,98,99,115,121`; `plugins/base-scanner/scanner.go:47`.

## negative_examples

- DO NOT build a UNION `mediaMime` (video+image) without module-type gating (R-I4 — discovers cover-art junk).
- DO NOT use ffprobe for images (ffprobe is the video probe; image base info is stdlib — D-5).
- DO NOT add an EXIF/CGO dependency to base-scanner (base = discovery; enricher = enrichment — conventions "Boundary rules").
- DO NOT branch on media type in the core (`internal/scan`) — selection is in the plugin only (INV2).
- DO NOT edit `proto/**`, `internal/**`, `pkg/sdk/**`.

## out_of_scope

- `plugins/image-enricher/**` (Task 01).
- `internal/scan/**` (Task 03 — scan stamps absolute_path; base-scanner does NOT stamp it).
- `internal/module/**` (Task 04), `cmd/mellifera/**` (Task 05), `Makefile` (Task 06).
- `go.mod` (stdlib image decoders are NOT a new module dep).

## scope_boundary

CREATE `plugins/base-scanner/image.go`; MODIFY `plugins/base-scanner/walk.go`, `plugins/base-scanner/scanner.go`, and in-package `*_test.go` that call the changed signatures. No other package is modified.

## project_scope

.

## line_budget

120  (image.go ~60; walk.go +~30 branch; scanner.go +1 line)
line_budget_flex: 1.1

## test_exclusions

- `imageMime` / `mediaMime` maps (data constants — framework-shaped).
- `imageMimeOf` / `mimeType` accessors (pure map lookups).

## refactoring_checklist

- [ ] `grep -n 'func isMedia\|func mimeType\|func walk\|func toDiscovered' plugins/base-scanner/*.go` shows the parameterized signatures; every call site compiles.
- [ ] `grep -rn 'probeImage\|image.DecodeConfig' plugins/base-scanner/` → image base info via stdlib.
- [ ] A TV-tree walk still selects `mediaMime` (assert via test: `cover.jpg` NOT discovered for `module_type="tv"`).
- [ ] `go test ./plugins/base-scanner/` green; `CGO_ENABLED=0 go build ./plugins/base-scanner/` exits 0.

## skill_hint

- mellifera-build (CGO_ENABLED=0; funlen-60 factoring)
- grounding (G2 the walk/scanner call sites + that no OTHER package calls the unexported `walk`/`toDiscovered` — package-main scope)
- stack-patterns (Go: blank-import stdlib image decoders for `image.DecodeConfig` to register formats)

## deps

(none within coder queue — independent of Task 01; base-scanner change is self-contained)

## verify

```
cd /Users/alldfiar/projects/go/mellifera
CGO_ENABLED=0 go build ./plugins/base-scanner/
go vet ./plugins/base-scanner/
go test ./plugins/base-scanner/
```
