# Health Check: image-enrichment (B2)
Date: 2026-08-04 | Mode: health-check | Stack: Go 1.25.3 / golangci-lint v1.64.8 | Files changed: 18 | Files with issues: 3 (P2 only)

Scope: the B2 diff vs base `e2a7562` (working tree on `feature/image-enrichment`; HEAD == e2a7562, so all B2 work is uncommitted).
Reviewer already PROCEED'd on correctness — this audit is CODE HEALTH only (garbage tests, dead/backward-compat, DRY/SOLID, complexity, conventions).

## Overall verdict: HEALTHY — PROCEED
P0: 0 | P1: 0 | P2: 3 (all design-acknowledged, optional) | P3: 1
No blocking issues. No garbage/tautology tests. No dead code. No convention breach. All read-only gates green.
The 3 P2 findings are intentional structural mirrors ("image-enricher mirrors tv-parser" is the B2 design) and all sit BELOW the project's `dupl`-100 / `check.sh` actionable thresholds — they are optional DRY/file-size cleanups, not defects.

---

## Changed-files inventory

### CREATE (new, 11 .go + docs)
| File | LOC | Role |
|------|-----|------|
| plugins/image-enricher/doc.go | 51 | package doc / invariants |
| plugins/image-enricher/main.go | 49 | plugin process entrypoint (sdk.Serve) |
| plugins/image-enricher/pluginsvc.go | 77 | domain plugin.v1 service stub (Handshake/Health/Shutdown) |
| plugins/image-enricher/exiftool.go | 66 | exiftool arg-slice invocation + soft-fail |
| plugins/image-enricher/enricher.go | 246 | MetadataSource capability (Match/BuildRequest/Convert/Merge) |
| plugins/image-enricher/enricher_test.go | 262 | Match/BuildRequest/Merge/Convert unit tests |
| plugins/image-enricher/exiftool_test.go | 211 | tag-set + mapExif + runExiftool unit tests |
| plugins/base-scanner/image.go | 93 | image extension map + stdlib probeImage |
| plugins/base-scanner/image_test.go | 235 | probeImage + module-type-gating tests |
| internal/scan/parsed_abs_test.go | 128 | absolute_path-stamp + determinism tests |
| integration_image_test.go | 503 | AC-1 async image golden (real subprocesses + exiftool) |

### MODIFY
| File | Δ | Change |
|------|---|-------|
| cmd/mellifera/main.go | +9/-1 | load+start+stop image-enricher; imageEnricherPath config + env |
| internal/module/registry.go | +41/-0 | imageConfigJSON + idempotent image seed |
| internal/module/registry_test.go | +90/-7 | 3-module List; TestOpen_ImageSeeded; idempotent-seed test |
| internal/scan/run.go | +34/-8 | stamp absolute_path into parsed; thread rootPath through persist |
| internal/scan/run_test.go | +4/-2 | test reconciled to new persist signature |
| plugins/base-scanner/scanner.go | +1/-1 | forward req.ModuleType into walk |
| plugins/base-scanner/walk.go | +37/-14 | module-type-gated ext map; probeImage vs probe dispatch |
| Makefile | +9/-0 | build-plugin builds image-enricher; runtime-deps note |
| integration_test.go | +14/-5 | startServer gains imageEnricherBin param + env |
| integration_async_test.go | +2/-1 | startServer call reconciled |
| qa_acceptance_test.go | +4/-2 | qaStartServer gains imageEnricherBin param + env |
| qa_async_acceptance_test.go | +2/-1 | qaStartServer call reconciled |
| .gitignore | +1 | (build-output ignore) |

---

## Per-package / per-file health assessment

**plugins/image-enricher (new, package main)** — HEALTHY. Stateless MetadataSource + plugin.v1 stub; pure-Go (no `import "C"`); imports only pkg/sdk + proto + stdlib (+ structpb/timestamppb). The Merge/Convert/Match bodies are documented verbatim mirrors of tv-parser (intentional — see P2 S-02). exiftool.go uses exec arg-slice only, every failure is soft-fail. No exported symbols (package main) → exported-symbol budget ~0. Tests are real table tests with strong assertions, no tautologies.

**plugins/base-scanner (MODIFY + new image.go)** — HEALTHY. Module-type-gated discovery cleanly refactored: `isMedia`/`mimeType` renamed to `extHas`/`mimeOf(extMap,...)` taking the selected map; image files dispatch to `probeImage` (stdlib header decode), video to ffprobe — ffprobe never invoked for images. media-type-agnostic core preserved (TV path unchanged bar the map indirection). No stale callers of the old `isMedia`/`mimeType` (full build + `unused` linter clean).

**internal/scan** — HEALTHY. `assembleBaseDoc` gains a pure helper `parsedWithAbsolutePath` (unmarshal → stamp → re-marshal) that is media-type-agnostic (TV items stamped identically, no branch); determinism preserved (baseChanged unaffected). `persist` threads `lib.RootPath`. Parameterized SQL unchanged (seed uses `ExecContext` args). Tests cover the additive stamp + no-false-stale invariant.

**internal/module** — HEALTHY. `imageConfigJSON` is a config-entity mirror of `tvConfigJSON`; second idempotent `INSERT OR IGNORE` seed for "image". Stays at 7 exported symbols (no budget breach).

**cmd/mellifera/main.go** — HEALTHY. Flat composition-root wiring extended by one constructor block; no DI, no reflection. Plugin loaded before serve (INV-start-before-serve); Stop added to shutdown.

**integration_image_test.go** — HEALTHY (size at the edge, see P2 S-03). Real-subprocess golden: builds server + base-scanner + tv-parser + image-enricher into a temp dir, real exiftool over stdlib-encoded fixtures (jpeg/png + exiftool-stamped EXIF + ffmpeg webp + sips heic), asserts async settle + real EXIF provenance/_view/_stages + soft-fail + unicode + HEIC. Skips cleanly under -short / missing exiftool. No tautologies.

**Reconciled goldens** (integration_test.go, integration_async_test.go, qa_acceptance_test.go, qa_async_acceptance_test.go) — HEALTHY. Mechanical startServer/qaStartServer signature reconciliation (+ imageEnricherBin param + MELLIFERA_IMAGE_ENRICHER env); full suite passes, so all call sites are consistent.

---

## P2 — DRY / file-size (all optional, design-acknowledged)

| ID | File:Line | Pattern | origin | Description | Fix |
|----|-----------|---------|--------|-------------|-----|
| S-01 | plugins/image-enricher/pluginsvc.go:24-77 (vs plugins/tv-parser/pluginsvc.go:24-77; plugins/base-scanner/pluginsvc.go:57) | dry-violation | feature | `pluginSvcPlugin` + `pluginServiceImpl` (Handshake/Health/Shutdown) are a near-verbatim mirror: image-enricher vs tv-parser differ by exactly ONE non-comment line (the `GRPCClient` error string); base-scanner differs only in the advertised capability `Type` ("scanner" vs "metadata_source"). Clean DRY win exists without breaking per-plugin-binary isolation: extract a constructor into the already-imported `pkg/sdk`, e.g. `sdk.NewPluginServiceStub(pluginID, version, capType, capProtoFQN)`. NOTE: this is the design-acknowledged "image-enricher mirrors tv-parser" boilerplate; `dupl`-100 does NOT flag it (below threshold). Optional. | extract-function (to pkg/sdk) |
| S-02 | plugins/image-enricher/enricher.go:127-147 & 234-246 (vs plugins/tv-parser/parser.go:83-103 & 141-153) | dry-violation | feature | `Merge` body and `provenanceHints` body are byte-for-byte identical to tv-parser (the coder documents them as "verbatim mirror of parser.go:…"). This is the namespace-write + per-field-provenance PROTOCOL — duplicated knowledge that must stay in sync, not pure wiring boilerplate. Clean win: extract `sdk.MergeNamespace(req, pluginID)` and `sdk.PerFieldProvenance(meta, pluginID, version)` into pkg/sdk (already imported by both; preserves isolation, arch §10). `dupl`-100 does NOT flag it. Optional. | extract-function (to pkg/sdk) |
| S-03 | integration_image_test.go:1-503 | complexity (file size) | feature | 503 LOC, 3 over the 500-line file budget. At the edge; the bulk is fixture-generation helpers (imgEncode/imgSolid/imgStampEXIF/imgGenWebP/imgGenHEIC/imgGenViaFFmpeg, lines ~380-485). check.sh is green (the 500 limit is not a failing gate here, and this is a test file). Any future AC case will push it further over. Consider moving the fixture helpers into a sibling `integration_image_fixtures_test.go`. Optional. | extract-file |

## P3 — cosmetic / acceptable-as-is

| ID | File:Line | Pattern | origin | Description | Fix |
|----|-----------|---------|--------|-------------|-----|
| S-04 | plugins/image-enricher/exiftool.go:40-66 (vs plugins/base-scanner/ffprobe.go:29-53) | dry-violation (idiom) | feature | `runExiftool` and `probe` share the LookPath → WithTimeout → CommandContext → soft-fail switch skeleton. INCIDENTAL structural similarity of an exec-soft-fail idiom — the two encode DIFFERENT binaries/args/return-types ([]byte vs tag-map), so this is not duplicated knowledge that must stay in sync. Acceptable as-is; a shared `runBinSoftFail` (returning raw []byte, callers parse) would be a marginal win at the cost of a less-direct soft-fail path. Lowest priority. | none / optional |

## No findings (verified clean)
- **Garbage / tautological tests:** NONE. Sampled every new test fn — all assert real behavior (Match gating, namespace-isolation INV-namespace-write, EXIF field mapping incl. Cyrillic/HEIC/unparseable-date, baseChanged determinism, async-settle + provenance/_view/_stages). No `x==x`, no pojo-only, no assertion-on-source-text (T-12) probes.
- **Dead / backward-compat code:** NONE. `unused` linter clean; old `isMedia`/`mimeType` fully replaced (no stale callers); no unreachable branches; no deprecated shims.
- **Convention breaches:** NONE. Apache-2.0 SPDX header present on all 11 new .go files; exec arg-slice ONLY (exiftool/ffmpeg/sips — no `sh -c`/`bash -c`); no reflect; no DI; no `import "C"` (pure-Go); base-scanner stays media-type-agnostic; seed SQL parameterized.
- **Complexity budget:** NO HARD BREACH. exported symbols/pkg within limits (image-enricher package main ~0; module 7 ≤ 8 warn); funlen 60/40, gocognit 15 enforced green by golangci-lint; the only over-budget metric is integration_image_test.go file length (S-03, marginal, not a gate).

## Gate re-run results (read-only)
| Gate | Result |
|------|--------|
| `gofmt -l .` | CLEAN (only `.claude/skills/mellifera-build/module-template/doc.go` flagged — a skill template, NOT B2) |
| `CGO_ENABLED=0 go build ./...` | OK |
| `go vet` (changed pkgs) | CLEAN |
| `make build-plugin` | OK (builds base-scanner + tv-parser + image-enricher) |
| `go test ./...` | ALL PASS |
| `golangci-lint run ./...` | CLEAN |
| `bash .claude/skills/mellifera-build/scripts/check.sh` | OK (golangci-lint funlen/gocognit/gocyclo/lll/depguard/dupl + exported-symbol count) |

## AC reconciliation
Health-check origin tags: all 3 P2 + 1 P3 findings are `origin: feature` (inside B2-touched files). No `acceptance.md` negative AC prohibits structural mirrors or sets a hard file-size limit on test files — `acceptance.md` ACs are behavioral/structural (async-settle, EXIF provenance, namespace-write, media-type-agnostic, no-CGO/additive diff) and are all satisfied. The P2 mirrors are NOT AC regressions (no AC forbids the mirror; the design explicitly sanctions it). **Verdict: PROCEED** — no `origin: feature` finding matches a negative AC intent.

## Deletable / rewritable estimate
Lines deletable: 0. Tests deletable: 0. Tests rewritable: 0. (P2 findings are optional refactors, ~70 LOC of duplicated Merge+provenanceHints could consolidate, but none is dead/wrong.)
