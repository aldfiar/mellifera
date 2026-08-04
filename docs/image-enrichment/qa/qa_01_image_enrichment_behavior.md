# QA 01 — image enrichment end-to-end behavior (independent acceptance re-derivation)

> **Status: DONE — 2026-08-04.** Implemented in `mellifera/qa_image_e2e_test.go`:
> `TestQAImage_E2EIndependentRederive` (7 green sub-tests; EXIF re-derived via an
> INDEPENDENT exiftool oracle over a DIFFERENT Canon/EOS R6 fixture — Paris GPS,
> orient 3, 96x64, Cyrillic "Камера" / "Снимок.jpg") + `TestQAImage_ExiftoolMissingSoftFail`
> (reviewer INFO-2: full exiftool-missing integration sim via stripped PATH). All
> gates green. Coverage map: `qa/.joint_coverage.md`.

> Independent acceptance re-derivation for the image-enrichment FEATURE behavior:
> scan an image library → base discovery → B1 queue → image-enricher EXIF → ready
> with provenance. Covers AC-1 (golden), AC-image (discovery + namespace + HEIC),
> AC-softfail (no/partial EXIF, exiftool-missing, corrupt), AC-unicode. QA writes
> integration/e2e tests that RE-DERIVE the expected EXIF fields from the fixtures
> (not trusted from the coder's unit-test assertions) and assert the full user flow
> across module joints.

## Context

- **feature_goal:** (shared) image media type + EXIF enricher — photos flow through the SAME pipeline as TV and show up with camera/date/orientation/GPS.
- **why:** the coder unit tests (Tasks 01-04) prove modules in isolation; the coder golden e2e (Task 07) proves one happy path. QA independently re-derives the EXPECTED `sources.image-enricher` content per fixture (field-by-field, from the fixture's known EXIF) and asserts the cross-joint user flow, including the load-bearing edge/error cases the user named (exiftool-missing soft-fail, HEIC, provenance, Unicode). This is the independent safety net against forgotten/dropped functionality.
- **joints_targeted:** (from implementation_plan data flow) `base-scanner (discovery) → internal/scan (absolute_path stamp, S4) → store (PutItem pending) → B1 queue/worker (UNCHANGED) → image-enricher (Match→Convert→Merge, S3) → store (status=ready + _provenance/_view/_stages)`. The seams S1, S2, S3, S4 are exercised here; S5-S8 (module/cmd/build) are covered structurally in QA 02.
- **mock_boundaries:** mock ONLY the external filesystem (temp dirs + committed fixtures) and the wall clock for settle polling. Use the REAL `cmd/mellifera` server + REAL `bin/base-scanner` + REAL `bin/image-enricher` subprocesses (no in-process fakes on the scanner/enricher RPCs — AC-1 Verify probe). The store is a real temp SQLite.

## validates_tasks

- Task 01 (image-enricher plugin — Match/Convert/Merge + exiftool)
- Task 02 (base-scanner image discovery — module-type gating + stdlib base info)
- Task 03 (scan absolute_path stamp — the file-location channel)
- Task 04 (image module seed — `Get("image")` resolves)
- Task 07 (golden e2e — QA extends/derives independently)

## behavior_coverage (MANDATORY — independent re-derivation)

The full B-id set for the feature behaviors this QA task covers (re-derived from `acceptance.md` + the coder `behaviors`; every B-id MUST have a test here or be listed in `uncovered_behaviors`):

| B-id | Behavior | Derived expected result | Test |
|---|---|---|---|
| B01 (T07) | image library scan → ready with sources.image-enricher + _provenance/_view/_stages | each image item `status=="ready"`; `document.sources."image-enricher"` non-null; `_provenance` has `plugin_id=="image-enricher"`; a `_stages` entry `{stage:"metadata_source",plugin_id:"image-enricher",status:"ok"}` | e2e_jpg_ready |
| B02 (T01) | Match applies iff image; carries absolute_path | enricher applies for image items; the e2e proves the path round-trips (EXIF lands) | e2e_jpg_ready (round-trip) |
| B03/B04 (T01) | Convert maps exiftool tags → ≥{width,height,format}+EXIF; non-empty namespace | JPEG-with-EXIF item: `sources."image-enricher"` has width/height/format/make/model/date_taken/orientation/gps_lat/gps_lon (the fixture's known values) | e2e_exif_fields |
| B05 (T01) | Merge writes sources.image-enricher ONLY | no other source namespace; `_provenance/_view/_stages` present (core-stamped) | e2e_namespace_isolation |
| B06 (T01) | exiftool missing/fail → empty metadata + warning → no_data settle | (covered structurally in B11/e2e_exiftool_missing) | e2e_exiftool_missing |
| B08 (T01) | EXIF-less image → {width,height,format} clean success (no no_data) | plain PNG/WEBP item reaches `ready` WITHOUT a no_data ledger row; sources has exactly {width,height,format} | e2e_plain_png_ready |
| B09 (T01) + B04 (T02) | HEIC discovered + exiftool supplies full data | HEIC item discovered; after enrich `sources."image-enricher".width` non-null | e2e_heic |
| B10 (T01) + B07 (T02) | Unicode: non-ASCII Model preserved; Cyrillic filename discovered | `Фото.jpg` discovered; `sources."image-enricher".model` == the fixture's non-ASCII string verbatim | e2e_unicode |
| B02 (T02) + B03 (T02) | module-type gating: only image exts for image module; .mkv NOT discovered; TV unaffected | `.mkv` in image lib absent from items; (regression) `.jpg` in a TV lib not discovered | e2e gating + QA02 regression |
| B05/B06 (T02) | stdlib base info {width,height,format} at pending (jpg/png/webp); HEIC soft-fails | items listable at `status=pending` with base dims BEFORE enrich (jpg/png/webp); HEIC pending has empty base info | e2e_pending_base_info |
| B07 (T02) + B05 (T03) | corrupt image soft-fails at discovery; scan not aborted | scan returns 200; library listable; corrupt item settles via ledger/cooldown | e2e_corrupt_softfail |
| B06 (T07) | exiftool-missing → scan 200, items listable, settle via no_data | second lib scanned with image-enricher env PATH devoid of exiftool: scan 200, items listable | e2e_exiftool_missing |

`uncovered_behaviors:` none — every behavior this QA task owns is covered above. (Build/cmd/module-structural behaviors B11-B21 are owned by QA 02.)

## mock_boundaries (detailed)

- REAL: `cmd/mellifera` server (ephemeral port, temp SQLite), `bin/base-scanner`, `bin/image-enricher` subprocesses, the B1 queue/worker, the store, the committed image fixtures.
- MOCK/STUB: temp library root directories (real filesystem, temp); the wall clock for bounded `?status=ready` polling (real `time.Sleep`/retry with a bounded deadline — no clock injection needed unless the existing harness already provides one).
- EXTERNAL TOOL: `exiftool` — present on the host for the EXIF-asserting cases; the exiftool-missing case overrides the image-enricher subprocess's PATH (or `t.Skip` with a clear message if the harness cannot isolate PATH, documenting the gap).

## test_plan

Joint tests (≤4) — each crosses ≥2 module joints:
1. `TestImageE2E_GoldenReady` (AC-1, AC-image, AC-unicode): real server + subprocesses; scan an image lib; poll `?status=ready`; assert every item's `sources."image-enricher"` (field-by-field for the EXIF JPEG; {width,height,format} for png/webp; full for HEIC; non-ASCII Model for `Фото.jpg`) + `_provenance`/`_stages`. Re-derive expected EXIF from fixtures (do NOT trust coder constants).
2. `TestImageE2E_ModuleTypeGating` (AC-image): `.mkv` NOT in image-lib items; `.jpg` NOT in a TV-lib's items (regression).
3. `TestImageE2E_SoftFail` (AC-softfail): corrupt image → scan 200 + listable + settle via ledger; EXIF-less PNG → clean ready (no no_data row).
4. `TestImageE2E_ExiftoolMissing` (AC-softfail): PATH-stripped image-enricher → scan 200 + listable + settle via no_data cooldown (skip with clear message if PATH isolation infeasible).

Boundary tests (≤2):
1. `TestImageBase_PendingBeforeEnrich` (AC-image): items carry stdlib base `{width,height,format}` at `status=pending` BEFORE the worker drains; HEIC pending has empty base info (stdlib soft-fail).
2. `TestImage_NamespaceIsolation` (AC-1): `sources."image-enricher"` present; no other source; `_provenance`/`_view`/`_stages` core-stamped (Merge never touched them).

Property test (≤1):
1. `TestImage_IdempotentRescan` (AC-1/AC-queue): re-scan the same image lib → items stay `ready` (no regression to pending/stale); `absolute_path` deterministic → `baseChanged` false.

## refactoring_validation

- Re-derive the expected EXIF field set PER FIXTURE from the fixture's actual EXIF (run `exiftool -j -n <fixture>` during test setup and compare — proves the enricher maps tags faithfully, not that it echoes a hardcoded constant).
- Regression: assert a TV-library scan still discovers ONLY video exts (`.jpg` cover-art absent) — guards R-I4.

## skill_hint

- grounding (G1/G2 every symbol + fixture; re-derive EXIF from fixtures)
- mellifera-build (the gate; build subprocesses in-test)

## deps

- All coder tasks (01-07) must be complete before QA runs.

## verify

```
cd /Users/alldfiar/projects/go/mellifera
make build-plugin
go test ./internal/api/ -run 'TestImageE2E|TestImageBase|TestImage_Namespace|TestImage_Idempotent' -v
```
