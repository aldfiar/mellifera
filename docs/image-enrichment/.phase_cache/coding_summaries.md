# Coder summaries — image-enrichment (B2)

One line per file changed, written between tasks (context compaction cache).

## T01 — image-enricher plugin (DONE, all gates green)
- `plugins/image-enricher/doc.go` — CREATE; package doc (RESPONSIBILITY/INVARIANTS mirror tv-parser; ARG-SLICE/SOFT-FAIL/SEPARATE-PROCESS/no-CGO stated).
- `plugins/image-enricher/main.go` — CREATE; cookie/identity consts (pluginID="image-enricher") + sdk.Serve(MetadataSourcePlugin + pluginSvcPlugin). Mirror tv-parser.
- `plugins/image-enricher/pluginsvc.go` — CREATE; pluginSvcPlugin + pluginServiceImpl (Handshake advertises ONE metadata_source capability; Health=SERVING; Shutdown nop). Verbatim mirror tv-parser.
- `plugins/image-enricher/exiftool.go` — CREATE; exiftoolTags (9 tags, output-bounded) + runExiftool (exec.LookPath soft-fail, context.WithTimeout, exec.CommandContext arg-slice, JSON []map[0]). Mirror ffprobe.
- `plugins/image-enricher/enricher.go` — CREATE; enricherImpl + Match (image by module_type/extension, carries absolute_path) + BuildRequest (nop) + Convert (runExiftool+mapExif, soft-fail) + Merge (sources.image-enricher only) + mapExif/numVal/strVal/normalizeExifDate/provenanceHints/isImageExt.
- `plugins/image-enricher/exiftool_test.go` — CREATE; TestExiftoolTags, TestMapExif (table: full jpeg/exifless png/heic/cyrillic model B10/unparseable date), TestMapExif_EmptyInput, TestRunExiftool_SoftFailMissing (passes w/o exiftool), TestRunExiftool_RealPNG (LookPath-gated; writePNG helper).
- `plugins/image-enricher/enricher_test.go` — CREATE; TestMatch (table B02), TestBuildRequest, TestMerge (B05 namespace isolation), TestConvert_SoftFailMissingExiftool (passes w/o exiftool), TestConvert_RealPNG (LookPath-gated B08).
- Validation: gofmt clean; go build/vet/test green; golangci-lint clean. go.mod untouched; no import C. exiftool invoked arg-slice only.
- DEVIATION (flag reviewer): fixtures generated in-test via stdlib image/png (not committed testdata binaries); real-exiftool cases skip locally (exiftool absent). EXIF-rich/HEIC/unicode covered by mapExif table + T07 e2e.

## T02 — base-scanner image discovery (DONE, all gates green)
- `plugins/base-scanner/image.go` — CREATE; imageMime (6 exts jpg/jpeg/png/webp/heic/heif) + isImage/imageMimeOf + probeImage (stdlib image.DecodeConfig, soft-fail). Blank-imports image/jpeg, image/png ONLY (webp NOT stdlib).
- `plugins/base-scanner/walk.go` — MODIFY; walk gained `moduleType string` param -> selects imageMime (image) else mediaMime; toDiscovered gained (extMap, imageMode) -> probeImage else probe; isMedia/mimeType -> extHas/mimeOf(extMap).
- `plugins/base-scanner/scanner.go` — MODIFY; Scan forwards req.GetModuleType() into walk.
- `plugins/base-scanner/image_test.go` — CREATE; TestProbeImage (jpeg/png dims, heic/webp/missing soft-fail), TestImageMime_IsImage (6 exts + Cyrillic stem), TestWalk_ModuleTypeGating (image-only, no cover-art, stdlib not ffprobe), TestScan_ForwardsModuleType. Helpers: writeImg/drain/rels/decodeJSON.
- DEVIATION (spec_error G1): image/webp not stdlib → webp discovered but stdlib base-info soft-fails (exiftool at enrichment).

## T03 — scan absolute_path (DONE, all gates green)
- `internal/scan/run.go` — MODIFY; +path/filepath import; runScan threads lib.RootPath -> persist(rootPath) -> assembleBaseDoc(rootPath); new parsedWithAbsolutePath stamps parsed.absolute_path=Join(root,rel). No structpb import (honors run.go:303). INV2: no media-type branch.
- `internal/scan/run_test.go` — MODIFY; line 623 assembleBaseDoc call +libRoot (so seeded baseA matches real persist stamp; unchanged-re-scan stays byte-equal).
- `internal/scan/parsed_abs_test.go` — CREATE; TestAssembleBaseDoc_StampAbsolutePath (image/tv stamped, empty-root no stamp, keys intact), TestAssembleBaseDoc_DeterministicNoFalseStale.

## T04 — image module seed (DONE, all gates green)
- `internal/module/registry.go` — MODIFY; +imageConfigJSON const (base-scanner + image-enricher priority1, local/no auth_mode) + second INSERT OR IGNORE ExecContext in Open for "image". NO new export (stays 7, INV4).
- `internal/module/registry_test.go` — EXTEND; TestOpen_ImageSeeded (+tv regression), TestOpen_IdempotentSeedImage; UPDATED TestRegistry_List_CacheOnly (2->3: image<movies<tv, incl post-wipe).

## Full-repo gate (T01-T04): gofmt clean (only pre-existing out-of-scope template flagged), CGO_ENABLED=0 go build ./... OK, go test ./... exit 0, golangci-lint run ./... exit 0, go vet ./... clean, bash check.sh: OK.
