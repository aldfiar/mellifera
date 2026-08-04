# Task Interactions — image-enrichment (Phase B2)

> Cross-task dependency map for the 11 tasks. Grounded in the plan's File Map +
> Step Outline + integration_map seams (all G2-verified @ `e2a7562`).

## Symbol Ownership

| Symbol / data | Owner Task | Consumer Tasks | Shared Type? |
|---|---|---|---|
| `enricherImpl` (`sdk.MetadataSource` impl) | T01 | T05 (loads binary), T07 (e2e), QA1 | no (package main, ~0 exports) |
| `runExiftool(ctx, absPath)` | T01 | T07/QA1 (via Convert) | no (unexported) |
| `sources.image-enricher` (namespace) | T01 (Merge writes) | T07/QA1 (assert), core `validateNamespace` (unchanged) | no (core validates, no branch) |
| `absolute_path` (`doc["parsed"]` key) | T03 (scan stamps) | T01 (enricher reads via `base.Parsed`), T07/QA1 (e2e) | yes (free-form parsed key — `scanner.pb.go:267-272`) |
| `imageMime` / `probeImage` / `isImage` | T02 | T02 (internal: walk/toDiscovered), T07/QA1 (via discovered items) | no (unexported, package main) |
| module-type-selected `walk(ctx, root, moduleType, opts)` | T02 | T02 (scanner.Scan calls), T07/QA1 (via Scan RPC) | no (unexported) |
| `imageConfigJSON` + image module seed | T04 | T04 (Open), T07/QA2 (Get("image") resolves), T05 (runtime — module references image-enricher by string) | no (unexported const + DB row) |
| `cfg.imageEnricherPath` / `MELLIFERA_IMAGE_ENRICHER` | T05 | T05 (main loads), T06 (default path matches `bin/image-enricher`), T07 (e2e points env at built binary) | no |
| `bin/image-enricher` (binary) | T06 (Makefile builds) + T01 (package) | T05 (loads at runtime), T07/QA1 (e2e) | no |
| `metadata.v1.MetadataSource` (interface) | (existing — `pkg/sdk/metadata.go:23`) | T01 (impl), core (unchanged) | YES (existing shared contract; image-enricher is a new impl — AC-3) |

## Order Dependencies

| Task | Must Complete Before | Reason |
|---|---|---|
| T01 (image-enricher plugin) | T05, T06, T07 | T05 loads the binary; T06 builds `./plugins/image-enricher`; T07 e2e needs it |
| T02 (base-scanner image discovery) | T07 | T07 golden e2e scans an image lib (needs module-type-gated discovery) |
| T03 (scan absolute_path) | T07 | T07 e2e needs `absolute_path` round-tripped for the enricher to run exiftool |
| T04 (image module seed) | T07 | T07 e2e needs `Get("image")` to resolve (the library's module_id) |
| T05 (cmd wiring) | T07 | T07 e2e starts the real core (needs image-enricher Load/Start wired) |
| T06 (Makefile build-plugin) | T07 | T07 runs `make build-plugin` to produce the binaries |
| T07 (e2e + gates) | QA1, QA2, DOCS1, DOCS2 | QA/Docs run after coder is green |
| T01 + T06 | DOCS02 | DOCS02 documents exiftool (the runtime dep T01 invokes + T06 Makefile-comments) |
| T01/T02/T04/T05 | DOCS01 | DOCS01 describes the module map (what they built) |

Independent (can proceed in parallel within the coder queue, no compile-time dep between them): T01, T02, T03, T04. (T05/T06 soft-depend on T01 for a clean build; T07 depends on all.)

Recommended linear execution order (matches task numbering): **T01 → T02 → T03 → T04 → T05 → T06 → T07**.

## Potential Conflicts

| Tasks | Shared File | Risk | Mitigation |
|---|---|---|---|
| T01, T02 | none (different packages: `plugins/image-enricher` vs `plugins/base-scanner`) | none | — |
| T02, T07 | `plugins/base-scanner/*_test.go` (T02 adds image tests; T07 may add base-scanner assertions) | low — different test functions | T07 prefers e2e-level assertions; coordinate test filenames |
| T03, T07 | `internal/scan/*_test.go` (T03 extends; T07 may add scan assertions) | low | T07 asserts at the HTTP/store level, not re-testing assembleBaseDoc |
| T04, QA2 | `internal/module/registry_test.go` (T04 extends; QA2 adds B2 structural tests) | low — QA2 uses distinct `TestB2_*` names | QA2 names tests `TestB2_*` to avoid collisions |
| T05, T07 | `internal/api/*_test.go` (T07 adds the golden e2e) | low — T07 is the sole adder | — |
| DOCS1, DOCS2 | `docs/architecture.md`, `docs/project_structure.md`, `.claude/skills/mellifera-build/SKILL.md` | medium — both edit overlapping files (different SECTIONS) | DOCS1 edits §1.4/§2.4.1/§4 module-map/entry-points; DOCS2 edits §1.2 runtime-deps/Stack/Q29-D21/runtime-deps subsection — disjoint sections; land sequentially |

## Circular Dependencies

none found. Resolution order is a clean DAG: foundational packages (T01 plugin, T02 discovery, T03 scan stamp, T04 module seed) → composition (T05 cmd) → build (T06 Makefile) → integration capstone (T07) → QA/Docs. The dependency direction points DOWN only (api → scan → enrich → {module, plugin} → store; proto/ + pkg/sdk are shared leaves — unchanged).

## Cross-Project Tasks

N/A — single project (`project_scope: .` for every task). Mellifera is one Go module.

## Heuristic/Archetype Task-Skeleton mapping (B2 archetype: external-services subprocess + data-pipeline)

The B2 image-enricher is a `metadata_source` subprocess (mirrors tv-parser) feeding the B1 async data pipeline. Applicable task families → emitted tasks:
- Subprocess plugin skeleton (Handshake/Health/Shutdown + capability) → **T01** (image-enricher main/pluginsvc/doc).
- External-binary exec helper (arg-slice, soft-fail, JSON parse) → **T01** (exiftool.go, mirroring ffprobe).
- Capability RPC body (Match/Convert/Merge) → **T01** (enricher.go).
- Discovery/extension-selection → **T02** (base-scanner image.go + walk).
- Document/payload stamping → **T03** (scan absolute_path).
- Config-entity seed → **T04** (image module).
- Composition-root wiring → **T05** (cmd main.go).
- Build target → **T06** (Makefile).
- Golden e2e + structural gate → **T07**.
- (skipped family) "external auth fetch" (BuildRequest→real fetch) — deferred to B3 (noted in T01 BuildRequest nop + plan D-4). No task emitted; reason: B2 is local-EXIF only.
