# Acceptance Criteria — image-enrichment (Phase B2: image media type + EXIF enricher via exiftool subprocess)

> Image discovery + EXIF enricher are BUILT here. TMDB/auth (B3), HEIC/RAW, and
> image generated columns are OUTLINED/deferred — not asserted here. Mirrors the AC
> shape of `docs/async-enrichment/acceptance.md` (B1); AC-1=golden e2e, AC-2=build
> gates, AC-3=additive (negative), then feature-specific. 7 scenarios (< 8 gate).

## Source

User intent (enhanced_objective.md): "Add an image media type + a pure-Go
image-metadata enricher (EXIF) to Mellifera. Images flow through the SAME pipeline
as TV: discovery → base identify → the B1 async queue (unchanged) → the image
enricher (`metadata_source` plugin) attaches EXIF provenance."

**Right-sizing:** B2 is a single additive slice (reuses the B1 queue + the tv-parser
plugin pattern; adds one plugin + image discovery + a module seed; EXIF via the
system `exiftool` subprocess — NO new Go dep). No phasing needed —
`feature_too_large: false`. B3 (external enrichers) is outlined, not built.

## Lifecycle state machine (no new states — reuses B1)

Image items use the IDENTICAL B1 state machine (`internal/enrich/state.go:62-88`):
`new → pending → parsed → enriched →[settled]→ ready` (the image-enricher's single
source drives begin→parsed→enriched; the B1 settle predicate advances `enriched→ready`).
No new statuses, no new transitions. Re-scan of a changed image → `stale → pending`
(re-enrich). The sketch's `AC-queue`/`AC-states` B1 scenarios are inherited unchanged.

## Scenarios

### AC-1: image library scan → EXIF enrichment → `ready` with provenance (golden, e2e)
- **Given**: the core is running with `base-scanner` + `image-enricher` subprocesses
  loaded; a library `POST /api/v1/libraries {"module_id":"image","root_path":"<dir>"}`,
  where `<dir>` holds real `IMG_2024.jpg` (with EXIF: Make=Apple, Model=iPhone 15,
  DateTimeOriginal, Orientation, GPS), `photo.png`, `shot.webp`, and `HEIC_shot.heic`.
- **When**: `POST /api/v1/libraries/{id}/scan` is called, then (after the async
  worker drains) `GET /api/v1/libraries/{id}/items?status=ready`.
- **Then**: the scan returns non-blocking (`Discovered≥4`, `Persisted≥4`, scan HTTP
  returns before enrichment completes — AC-queue); each image item reaches
  `status="ready"`; the persisted document carries `sources.image-enricher`
  (`{width,height,format, make,model,date_taken,orientation, gps_lat,gps_lon}` for
  the JPEG; `{width,height,format}` for the EXIF-less png/webp), plus `_provenance`
  (`plugin_id="image-enricher"`), `_view`, and a `_stages` entry
  (`{stage:"metadata_source", plugin_id:"image-enricher", status:"ok"}`).
- **User intent**: "I point Mellifera at my photo library and my pictures show up
  with their camera/date/orientation/GPS — exactly like my TV shows do."
- **Verify probe (e2e)**: real go-plugin subprocesses + real image fixtures + real
  HTTP (no in-process fakes on the hot path). `curl GET …/items?status=ready | jq
  '.items[].document.sources."image-enricher"'` → non-null for each item.
- **Covers tasks**: T01, T02, T03, T04, T05, T07 (QA1 re-derives the expected EXIF field-by-field)

### AC-2: 5 build gates green + pure-Go binary (no CGO) + budget (structural)
- **Given**: the B2 code is implemented (image-enricher plugin invoking the system
  `exiftool` via `os/exec`, base-scanner image discovery, image module seed, scan
  absolute-path stamp; **no new Go module dependency**).
- **When**: the Mellifera build gate runs.
- **Then**: `go build`, `go vet`, `golangci-lint run`, the exported-symbol gate
  (`check.sh`: ≤8 warn / ≤12 fail per package), and `go test ./...` all pass; the
  Mellifera binary is still pure-Go (`CGO_ENABLED=0` — exiftool is an external process
  invoked via `os/exec`, NOT CGO); no `reflect`, no DI; parameterized SQL;
  `exec.Command` arg-slice only (exiftool AND ffprobe). (`exiftool` is a RUNTIME dep
  the operator installs, like ffmpeg/ffprobe — not asserted by the build gate.)
- **User intent**: "image support doesn't break the navigability/complexity budget or
  the single-static-binary (no-CGO) guarantee that makes Mellifera shippable."
- **Verify probe (structural/negative)**:
  `cd mellifera && CGO_ENABLED=0 go build ./plugins/image-enricher/ && go vet ./... && golangci-lint run ./... && bash .claude/skills/mellifera-build/scripts/check.sh && go test ./...` → exit 0; and
  `grep -rnE 'import "C"' plugins/image-enricher/` → 0 hits (pure-Go binary); and
  `git diff --name-only e2a7562 -- go.mod` → empty (no new Go dependency).
- **Covers tasks**: T01 (CGO_ENABLED=0 build; no Go dep), T06 (build-plugin), T07 (full gate), QA2 (structural probes)

### AC-3: additive — shipped proto/api/queue/sdk contract unbroken (negative)
- **Given**: B2 is implemented on `feature/image-enrichment` off `main` @ `e2a7562`.
- **When**: the diff against the merge base is inspected.
- **Then**: NO proto edits, NO `internal/api` edits, NO `internal/enrich` (B1 queue)
  edits, NO `pkg/sdk` edits — image-enricher implements the EXISTING
  `metadata.v1.MetadataSource`; image items consume the B1 queue unchanged.
- **User intent**: "image support is purely additive — my TV pipeline and its
  contracts are untouched."
- **Verify probe (structural/negative)**:
  `cd mellifera && git diff --name-only e2a7562 -- proto/ internal/api/ internal/enrich/ pkg/sdk/ | grep . ; echo "exit=$?"` → `exit=1` (grep no-match = 0 changed files in those trees).
- **Covers tasks**: ALL coder tasks T01-T07 (each task's `out_of_scope` enforces the no-edit rule); T07 runs the diff probe; QA2 `TestB2_Ac3Additive`

### AC-image: image media type discovered (jpg/png/webp/HEIC) + EXIF provenance namespace
- **Given**: a scan of an image library with jpg/png/webp/**heic** files (exiftool
  installed).
- **When**: base-scanner walks the library (module_type `"image"`).
- **Then**: only image extensions are discovered (a stray `.mkv` in the photo dir is
  NOT picked up — module-type-gated discovery); jpg/png carry base dimensions+format
  at `status="pending"` BEFORE enrichment (stdlib `image.DecodeConfig`); webp/HEIC are
  discovered but their stdlib base-info soft-fails (empty — INFO-1: `image/webp` is not a
  stdlib package; no stdlib HEIC decoder) — exiftool supplies full webp+HEIC data at
  enrichment;
  after enrichment the document has `sources.image-enricher` (incl. dimensions/make/
  model/date-taken/orientation/GPS where present) and the core-stamped
  `_provenance`/`_view`/`_stages` (arch §3.1, §3.2 L1/L2).
- **User intent**: "my photos — including iPhone HEIC shots — are recognized as images,
  with real dimensions and source-tagged EXIF data I can trust."
- **Verify probe (e2e)**: place a `.mkv` inside the image library root; after scan,
  `curl GET …/items | jq '.items[].relative_path'` → the `.mkv` is absent; the
  jpg/png/webp/heic are present; `jq '.items[] | select(.relative_path|test("heic")) | .document.sources."image-enricher".width'` → non-null after enrichment.
- **Covers tasks**: T01 (enricher Convert/Merge), T02 (discovery + stdlib base info), T04 (image module seed), T07 (e2e), QA1

### AC-queue: image items flow through the B1 async queue unchanged (structural + behavioral)
- **Given**: an image scan that enqueues N items as `pending`.
- **When**: the scan HTTP handler returns (non-blocking) and the B1 worker pool drains.
- **Then**: scan does NOT block on enrichment (returns once items are persisted
  `pending`); the worker leases, retries on transient failure (bounded backoff), and
  records terminal failures in the `enrichment_failures` ledger exactly as for TV;
  items settle `enriched → ready` via the B1 settle predicate. No B1 code changed.
- **User intent**: "photos enrich in the background just like TV — the scan stays
  fast and a failing EXIF read never wedges the library."
- **Verify probe (structural)**: `cd mellifera && git diff --stat e2a7562 -- internal/enrich/` → empty (B1 queue source untouched). (behavioral settle is asserted in AC-1's `?status=ready`.)
- **Covers tasks**: T03 (scan persists pending — non-blocking), T07 (e2e settle + diff probe), QA2 `TestB2_Ac3Additive` (queue-unchanged)

### AC-softfail: no/partial EXIF, exiftool missing, or corrupt image soft-fails (behavioral)
- **Given**: (a) an image library containing a valid JPEG with NO EXIF and a truncated
  JPEG; AND (b) the same library scanned on a host where `exiftool` is NOT installed.
- **When**: scanned and enriched.
- **Then**: the scan ALWAYS succeeds (one bad file / a missing tool never aborts the
  library — AC-6 philosophy). With exiftool present: the EXIF-less JPEG persists with
  base info + `{width,height,format}` in `sources.image-enricher` (clean success) and
  settles; the truncated JPEG soft-fails per-source and settles via the B1
  ledger/cooldown path. With exiftool MISSING: every image soft-fails at enrichment
  (empty namespace → B1 `no_data` terminal → cooldown → settle); jpg/png items still
  carry their stdlib base dimensions (discovered before enrichment — webp/heic base-info
  soft-fails at discovery, INFO-1, so they have no pre-enrichment dims); the scan
  returns 200 and the library is listable.
- **User intent**: "weird/old/edge-case photos — or a host without exiftool — don't
  break my library; they're just lean."
- **Verify probe (e2e)**: with exiftool present, after scan+drain `curl GET
  …/items?status=ready | jq '.items|length'` ≥ 1 for the EXIF-less JPEG. Then `mv
  $(which exiftool) /tmp/` (simulate missing), re-scan a second library, and assert the
  scan returns 200 and the items are listable (status `ready` after the no_data
  cooldown, or `pending`/`enriched` mid-cooldown) — no panic, no aborted scan.
- **Covers tasks**: T01 (exiftool soft-fail: LookPath + empty metadata + warning), T02 (probeImage soft-fail), T07 (e2e soft-fail + exiftool-missing), QA1 `TestImageE2E_SoftFail` + `TestImageE2E_ExiftoolMissing`

### AC-unicode: Unicode-safe EXIF + filenames (Cyrillic) (behavioral)
- **Given**: an image library containing `Фото.jpg` (Cyrillic filename) whose EXIF
  Model tag is a non-ASCII string.
- **When**: scanned and enriched.
- **Then**: the file is discovered (filename handling is UTF-8 throughout — the
  extension filter lowercases ASCII `.jpg` only); the EXIF Model string is preserved
  verbatim in `sources.image-enricher.model`; the item settles normally.
- **User intent**: "my Russian-language photo library works first-class, like the TV
  side already does."
- **Verify probe (e2e)**: `curl GET …/items | jq '.items[] | select(.relative_path|test("Фото")) | .document.sources."image-enricher".model'` → non-null, preserved string.
- **Covers tasks**: T01 (Convert carries non-ASCII Model verbatim), T02 (ASCII-only extension filter — Cyrillic stem discovered), T07 (e2e), QA1 `TestImageE2E_GoldenReady` (Cyrillic sub-case)

## Coverage Matrix

| Scenario | Tasks | Verified By |
|---|---|---|
| AC-1 golden e2e | T01, T02, T03, T04, T05, T07 / QA1 | reviewer (re-derives expected EXIF fields from the fixture); QA1 `TestImageE2E_GoldenReady` |
| AC-2 build gates + pure-Go | T01, T06, T07 / QA2 | reviewer (runs the gate); QA2 `TestB2_Ac2BuildGates` + `TestB2_NoCgoNoDep` + `TestB2_BuildPluginProducesAll` |
| AC-3 additive (negative) | ALL (out_of_scope enforces) / T07 probe + QA2 | reviewer (runs the git-diff probe); QA2 `TestB2_Ac3Additive` |
| AC-image discovery + namespace | T01, T02, T04, T07 / QA1 | reviewer; QA1 `TestImageE2E_ModuleTypeGating` + `TestImageBase_PendingBeforeEnrich` + `TestImage_NamespaceIsolation` |
| AC-queue B1 unchanged | T03, T07 / QA2 | reviewer (runs the diff probe + asserts settle); QA2 `TestB2_Ac3Additive` (queue-unchanged) + AC-1's `?status=ready` |
| AC-softfail | T01, T02, T07 / QA1 | reviewer; QA1 `TestImageE2E_SoftFail` + `TestImageE2E_ExiftoolMissing` |
| AC-unicode | T01, T02, T07 / QA1 | reviewer; QA1 `TestImageE2E_GoldenReady` (Cyrillic sub-case) |

> 7 scenarios — under the 8-gate. The sketch's external-enricher / HEIC / Phase-C
> items from the objective are deferred to B3+. `Covers tasks` is filled by the
> specifier; `Verified By` by the reviewer at the Acceptance Gate (reviewer
> independence: expected outcomes re-derived from Given/When/Then, not trusted from
> the coder's assertions).
