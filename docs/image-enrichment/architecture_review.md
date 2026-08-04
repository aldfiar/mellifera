# Architecture Review — image-enrichment (Phase B2)

> Self-review of the plan against shipped Phase A + B1 source. Risk register (R-Ix) +
> grounding audit (G1/G2/G5) + complexity-budget rationale + Generation Self-Audit.
> Every claim cites `file:line` verified against live source on
> `feature/image-enrichment` (@ `e2a7562`).

## Right-sizing / P0 flag

`feature_too_large: false`. B2 is a single additive pass: it reuses the B1 async
queue, the tv-parser plugin pattern, and the ffprobe exec/soft-fail pattern; it adds
one plugin + image discovery (incl. HEIC) + a module seed, and reads EXIF via the
system `exiftool` subprocess (NO new Go module dependency). 11 steps (< 15 gate), 7
ACs (< 8 gate), every package ≤ 8 exported symbols. **No P0 split needed; no P0
issue open.** B3 (external enrichers / RAW) is outlined.

## Risk register

### R-I1 EXIF via external `exiftool` — no-CGO holds; new runtime dep + missing soft-fail — P1
- **Risk (no-CGO):** none — exiftool is invoked via `os/exec` (an external process),
  NOT linked as CGO, so Mellifera's pure-Go/single-static-binary guarantee is intact.
  **Risk (runtime dep):** `exiftool` is a NEW system runtime dependency (operators must
  install it); if absent, image enrichment cannot run.
- **Mitigation:** `exec.LookPath("exiftool")` on each use; a missing/failing exiftool is
  a per-source SOFT-FAIL (empty metadata → B1 `no_data` → settle — mirrors ffprobe's
  AC-6 soft-fail, `ffprobe.go:30-31`). The dep is documented in the Makefile + runbook
  alongside ffmpeg/ffprobe. `go.mod` is untouched (no Go module dep).
- **Verification:** `CGO_ENABLED=0 go build ./plugins/image-enricher/` → exit 0 (no
  CGO); `git diff --name-only e2a7562 -- go.mod` → empty (no Go dep); AC-softfail
  asserts a scan succeeds on an exiftool-less host (items listable, no panic).

### R-I2 Additivity — no proto/api/queue/sdk edits — P0 (additivity, AC-3)
- **Risk:** an accidental edit to `proto/`, `internal/api/`, `internal/enrich/`, or
  `pkg/sdk/` breaks the shipped B1 contract.
- **Mitigation:** the image-enricher implements the EXISTING `metadata.v1.MetadataSource`;
  image items consume the B1 queue unchanged; `internal/store` is media-type-agnostic.
  All four trees are listed `no_seam` in `integration_map.md`.
- **Verification:** `git diff --name-only e2a7562 -- proto/ internal/api/ internal/enrich/ pkg/sdk/` → empty (AC-3 probe).

### R-I3 The file-location channel (`absolute_path` in `parsed`) — P1 (SURFACED)
- **Risk:** the B1 chain passes an EMPTY document to Merge (`chain.go:79`) and
  reconstructs the base from `doc["parsed"]` only (`chain.go:115-122`); if the
  enricher cannot obtain the file path it cannot read EXIF.
- **Mitigation:** scan stamps `absolute_path = filepath.Join(lib.RootPath, rel)` into
  `doc["parsed"]` for ALL items (D-6); the enricher reads it from `base.Parsed`. This
  is the only channel that avoids a proto edit or a B1 change. SURFACED for plan-review.
- **Verification:** unit test asserts `doc["parsed"].absolute_path` is set; golden e2e
  asserts EXIF fields land in `sources.image-enricher` (proves the path round-trips).

### R-I4 Module-type gating regression (TV cover-art) — P1
- **Risk:** a UNION extension filter (video+image) would discover `*.jpg` cover art
  inside TV libraries as junk items (tv config excludes `*.jpg`, `registry.go:54`, but
  base-scanner does not yet enforce `exclude_patterns`, `walk.go:48-49`).
- **Mitigation:** D-1 — base-scanner selects the extension map by `module_type`
  (`"image"`→image exts; else video). TV/movie scans are byte-identical to today.
- **Verification:** AC-image probe (`.mkv` absent from an image library); plus a
  tv-library scan asserts `.jpg` is NOT discovered.

### R-I5 Empty-namespace settle / spurious `no_data` — P1
- **Risk:** if the enricher returned an empty namespace for a valid image (with
  exiftool present), B1 would classify it terminal `no_data` (`retry.go:53-55`) → a
  spurious ledger row for a good image. (An empty namespace is CORRECT when exiftool is
  missing/fails — that is the intended soft-fail.)
- **Mitigation:** when exiftool SUCCEEDS on a valid image it returns `ImageWidth`/
  `ImageHeight`/`FileType`, which Convert maps to `{width,height,format}` → non-empty
  namespace → clean success. Empty metadata is returned ONLY for missing-exiftool /
  failure / corrupt-image (the intended `no_data` soft-fail).
- **Verification:** unit test: Convert with exiftool present on a valid EXIF-less png
  returns a non-empty `{width,height,format}` namespace; e2e AC-softfail asserts those
  items reach `ready` cleanly (not via a no_data ledger row).

### R-I6 exiftool output parsing robustness — P1
- **Risk:** exiftool's JSON shape varies across versions/hosts (tag presence, numeric
  vs. string, array values for some tags); a brittle parser could drop fields or panic.
- **Mitigation:** parse defensively (`[]map[string]any`, take `[0]`); read each tag with
  a type-assertion + ok-guard (absent tags are simply absent — the `Parsed` "consumers
  must not assume presence" rule). Use `-n` (numeric) so GPS/orientation are scalar;
  request tags explicitly so the shape is bounded and predictable.
- **Verification:** unit tests on fixtures with varying tag sets (full EXIF, EXIF-less,
  GPS-less, HEIC); assert no panic and only-present fields appear.

### R-I7 exiftool output size / slow process — P2 (refine)
- **Risk:** an unbounded exiftool invocation could emit megabytes (makernotes) or hang
  on a pathological file.
- **Mitigation:** tags are explicitly selected (`-ImageWidth … -GPSLongitude`) so output
  is small and bounded; the call runs under a per-file `context.WithTimeout` (mirrors
  `ffprobe.go:33`); a timeout/non-zero exit is a soft-fail.
- **Verification:** unit test asserts the command uses the explicit tag list (grep the
  arg-slice); e2e on a large image stays within the timeout.

### R-I8 Cyrillic / non-ASCII EXIF + filenames — P2 (refine)
- **Risk:** non-ASCII camera model strings or Cyrillic filenames are mangled.
- **Mitigation:** exiftool emits UTF-8 JSON; strings are carried verbatim; filenames
  are UTF-8 throughout and the extension filter lowercases ASCII dotted extensions only.
- **Verification:** AC-unicode e2e (`Фото.jpg` + non-ASCII EXIF Model preserved).

### R-I9 base-scanner symbol/complexity budget — P2 (budget)
- **Risk:** adding image discovery to base-scanner breaches funlen (60) or the
  exported-symbol gate (≤8/≤12).
- **Mitigation:** new `image.go` holds `probeImage` (<60 lines, mirrors `probe`); the
  image-enricher is package main (~0 exports); `internal/module` stays at 7. Package
  main exports are ~0 in both plugins.
- **Verification:** `check.sh` + `golangci-lint run` green (AC-2).

## Grounding audit (G1/G2/G5)

Every MODIFY target verified to exist NOW on `feature/image-enrichment` (@ `e2a7562`):
- `plugins/base-scanner/walk.go:25-123` — `mediaMime`/`walk`/`toDiscovered`/`isMedia`/`mimeType` (the discovery surface extended). G2 ✓
- `plugins/base-scanner/scanner.go:38-48` — `Scan` (forwards moduleType). G2 ✓
- `plugins/base-scanner/ffprobe.go:29-53` — `probe` (the soft-fail signature `probeImage` mirrors). G2 ✓
- `internal/scan/run.go:116,179-193,334-352` — `runScan` (has `lib.RootPath`), `persist`, `assembleBaseDoc`. G2 ✓
- `internal/module/registry.go:44-81,125-160` — `tvConfigJSON`, `Open`, `seedModulesSQL` (the seed pattern mirrored). G2 ✓
- `cmd/mellifera/main.go:88-91,148-151,181` — tv-parser Load/Start/Stop + env path (the block mirrored). G2 ✓
- `Makefile:33-40`, `go.mod:7-34` — build-plugin target + current deps (no EXIF lib present). G2 ✓

Every claimed caller/importer transcribed from source (not inferred):
- `MetadataSource` interface + adapter: `pkg/sdk/metadata.go:23-55`; driven by `internal/enrich/chain.go:49-97` (Match/BuildRequest/Convert/Merge at `:58,65,70,77`); empty Merge document at `chain.go:79`; namespace validation `chain.go:104-122`; base reconstruction `chain.go:115-122`. G2 ✓
- B1 settle/ledger: `internal/enrich/retry.go:53-55` (empty→no_data), `worker.go:297-334` (settle), `state.go:62-88` (transitions). G2 ✓
- tv-parser mirror source: `plugins/tv-parser/{main,parser,pluginsvc,doc}.go` (Match `parser.go:38-51`, Convert `:68-74`, Merge `:83-103`, pluginsvc Handshake `:54-66`). G2 ✓
- API additivity: `internal/api/handlers.go:77-94` (`createLibrary` takes arbitrary `module_id`), `:97-110` (scan). G2 ✓
- Store media-type-agnosticism: `internal/store/items.go:42-126` (PutItem/QueryItems), `open.go:62-78` (items DDL). G2 ✓

Patterns cited (G5): soft-fail per file/source (`ffprobe.go:29-53`, `enrich.go:52`);
opaque probe field (`scanner.pb.go:113-119`); config-entity module (`registry.go`,
`doc.go` INV1/INV2); flat plugin wiring (`main.go:79-91`); stateless subprocess +
namespace-write (`parser.go:32-103`, arch §0.2/§3.3). Zero `UNVERIFIED:`/`UNCERTAIN:`
tokens.

## Complexity-budget rationale

Resolution order applied: **existing-convention → archetype → framework-canonical →
stack-to-pattern → general.** Every B2 element extends a shipped convention rather
than introducing a novel abstraction:
- image-enricher = the tv-parser archetype (subprocess + `MetadataSource` + namespace write).
- `probeImage` = the `probe` archetype (soft-fail `(data, warning, err)`).
- image module seed = the tv-module seed archetype (`INSERT OR IGNORE` config row).
- plugin loading = the existing flat `mgr.Load/Start/Stop` constructor calls.

**Simpler-design check (rejected alternatives):**
- *base-scanner embeds EXIF bytes / does all image decoding:* rejected — wrong layer
  (base = discovery; enricher = enrichment), duplicates the EXIF dep, and base-scanner
  would need the EXIF lib.
- *change `reconstructBase` to carry `doc["ffprobe"]` into the base:* rejected —
  touches B1 (`internal/enrich`), violating AC-3.
- *a UNION `mediaMime` filter:* rejected — discovers TV cover-art junk (R-I4).
- *ffprobe for images:* rejected — adds an external binary to the image path and
  muddies base-scanner's video-probe role.
- *filename-date fallback for images:* rejected — no reliable convention; noise (D-4).
- *a pure-Go EXIF library (e.g. `bep/imagemeta`) instead of the `exiftool` subprocess:*
  this was the planner's first proposal; the user's plan-review direction chose
  `exiftool` instead (field-standard reader; HEIC/RAW + makernotes for free; matches
  the existing ffprobe exec pattern; NO Go module dep). The pure-Go lib is documented
  as a deliberate REJECTED alternative (D-2) — it would avoid the runtime dep but
  trades it for a Go-module dep + decoder-coverage limits. The two are interchangeable
  at the `runExiftool`/`readEXIF` helper boundary if the decision is ever revisited.

The chosen design is the meaningfully-simplest one that meets every AC and extends
existing patterns without a novel abstraction or a B1/proto change.

## Generation Self-Audit

- [x] Every MODIFY file → ≥1 seam with non-empty `After` + `Contract` + `evidence`
  (integration_map S1-S8; `no_seam` reasons for proto/api/enrich/store/sdk).
- [x] Every seam → one owner task + one joint test (Coverage Matrix populated with
  owner-task + joint-test + ACs; specifier fills the TBD task ids).
- [x] Every task → precondition + postcondition + allowed_imports + an AC trace
  (contracts.md Interface Contracts; Step Outline carries `(AC-n)` + `[Sn]`).
- [x] Every `## Foundational Setup` item → an emitted task or an explicit
  precondition fold (migration/proto/CI/Go-dep = none; runtime-dep/env/makefile folded
  to steps 9/10).
- [x] **No `UNVERIFIED:` token remains** in the final plan (grounding audit above).
- [x] Complexity budget examined; simpler-design check done (above).
- [x] Step Outline ≤15 (11 steps); ACs ≤8 (7); symbol budgets under gate (image-enricher
  package main ~0; `internal/module` 7→7; base-scanner package main ~0).
- [x] `feature_too_large: false` (no P0 phasing split).
- [x] Load-bearing risks flagged (R-I1 exiftool runtime/missing, R-I2 additivity,
  R-I3 path channel, R-I6 output parsing) with verification per AC.

> 9 risks total: 1 P0 (R-I2 additivity — mitigated + gated by the AC-3 git-diff probe,
> not open), 5 P1 (R-I1, R-I3, R-I4, R-I5, R-I6 — flagged for plan-review), 3 P2
> (R-I7, R-I8, R-I9 — refine). **0 blocking; plan ready for plan-review.**
