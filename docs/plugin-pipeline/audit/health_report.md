# Health Check: plugin-pipeline (Phase A)
Date: 2026-08-01 | Mode: health-check | Scope: plugin-pipeline diff vs `7bcc6c9` (scan-library shipped tip)
Stack: go 1.25 / golangci-lint v1.64.8 / go-plugin / SQLite | Branch: `feature/plugin-pipeline`

> READ-ONLY audit. Code HEALTH only (correctness was reviewer-PROCEED'd). All
> branch-tip `7bcc6c9` is the shipped scan-library; the entire plugin-pipeline
> change set is in the working tree (uncommitted).

## Verdict

**HEALTHY — PROCEED.** 0 P0, 0 P1, 1 P2 (non-blocking build-hygiene). No
feature-origin finding matches a negative-AC intent, so the BLOCK rule is not
reached.

## Changed-files inventory (vs `7bcc6c9`)

**NEW (CREATE)** — 11 source/test files:
- `internal/enrich/` — `doc.go`, `enrich.go`, `chain.go`, `provenance.go`, `state.go`, `enrich_test.go`
- `plugins/tv-parser/` — `doc.go`, `main.go`, `parser.go`, `pluginsvc.go`, `tvparse.go` (verbatim move), `parser_test.go`
- `pkg/sdk/metadata.go` (+ `metadata_test.go`), `internal/module/parse_test.go`, `integration_pipeline_test.go`

**MODIFY** — `cmd/mellifera/main.go`, `Makefile`, `internal/{api/handlers.go, api/router_test.go, module/{doc.go,registry.go}, plugin/{doc.go,lifecycle.go,manager.go,manager_test.go}, scan/{doc.go,run.go,run_test.go}, store/{doc.go,items.go,open.go,store_test.go}}`, `pkg/sdk/doc.go`, `plugins/base-scanner/{scanner.go,scanner_test.go,smoke_test.go}`, `integration_test.go`, `qa_acceptance_test.go`, `qa_resilience_test.go`

**DELETE-MOVE** — `plugins/base-scanner/tvparse.go` + `tvparse_test.go` → `plugins/tv-parser/` (byte-for-byte move; extraction, AC-1).

## Gate re-run (read-only) — all GREEN

| Gate | Result |
|---|---|
| `gofmt -l .` (new files) | clean |
| `CGO_ENABLED=0 go build ./...` | exit 0 |
| `go test ./...` | all packages `ok` (enrich, tv-parser, sdk, module, scan, store, plugin, api, base-scanner, root integration) |
| `golangci-lint run ./...` | exit 0 (funlen/gocognit/gocyclo/lll/depguard/dupl/unused) |
| `bash .claude/skills/mellifera-build/scripts/check.sh` | `check.sh: OK` (exported-symbol budget ≤12, dupl, complexity) |
| `make build-plugin` | exit 0 (bin/base-scanner, bin/tv-parser) |

## Per-package / per-file health assessment

| Package | Symbols (new) | Health | Notes |
|---|---|---|---|
| `internal/enrich` | `Deps`,`Result`,`Enrich` (3 export) | **Clean** | Clock injected (`now` seam); pure state-machine `nextState` (table-tested every legal+illegal transition); `validateNamespace` parse-at-boundary; soft-fail furthest-valid design. |
| `plugins/tv-parser` | `main` only | **Clean** | Stateless (arch §0.2); compile-time `var _ sdk.MetadataSource`; writes only `sources["tv-parser"]`; verbatim move of 4 regexes + parseTV. |
| `pkg/sdk` | `MetadataSource`,`MetadataSourcePlugin` (+2; pkg=7) | **Clean** | Dual-side adapter mirrors `ScannerPlugin`; justified incidental similarity (merging needs banned generic Call/reflect). Interface has ≥2 impls (subprocess client + in-process fake). |
| `internal/plugin` | `MetadataSource` accessor, `hasMetadataCapability`, `clientPluginSet`, `adapterFor`, `assignCapability` | **Clean** | Caps-driven PluginSet; no reflect; arg-slice `exec.Command`; per-capability accessor pattern (OCP-dispatch over 2 types). |
| `internal/store` | `Status` field, `defaultStatus`, `ensureItemsStatus` (pkg=11 WARN) | **Clean** | Parameterized SQL only (status gated by empty-check, never interpolated — INV1); additive PRAGMA-guarded idempotent migration. |
| `internal/module` | `MetadataSources`,`MetadataSourceBinding`,`parseModule` chain | **Clean** | Config-driven; media strings only in `tvConfigJSON` seed (AC-4 verified). |
| `internal/scan` | `Enrich` dep, `enricher`/`prodEnricher` seams | **Clean** | Enrich wired between Identify→PutItem; soft-fail preserved; `assembleBaseDoc`/`marshalDoc` refactor sound. |
| `internal/api` | `status` DTO field, `?status=` passthrough | **Clean** | Pure delegation; api does not validate status set (store/enrich own it). |
| `cmd/mellifera` | tv-parser load/start/stop, enrich.Deps wiring | **Clean** | Symmetric lifecycle; explicit constructor calls, no DI/reflect. |

## Findings

### P0 — (none)
### P1 — (none)

### P2 — build hygiene

| ID | File:Line | Pattern | origin | Description | Fix |
|----|-----------|---------|--------|-------------|-----|
| X-01 | `mellifera/.gitignore` (gap; binary surfaces at `mellifera/tv-parser`) | naming/convention-breath | feature | The new tv-parser plugin's natural binary name is **not** gitignored. `.gitignore` covers `/base-scanner`, `/mellifera`, `/bin/`, `*.exe`, `*.test` but **not** `/tv-parser`. `mellifera/tv-parser` is currently an untracked Mach-O arm64 binary (confirmed via `file(1)`). The canonical `make build-plugin` output goes to `bin/tv-parser` (covered by `/bin/`), so this is latent rather than active — but the scan-library precedent (gitignoring each plugin's root binary name, e.g. `/base-scanner`) was not extended to the new plugin, so a `go build -o tv-parser ./plugins/tv-parser` from the module root leaks into `git status` and risks an accidental commit. | add `/tv-parser` to `mellifera/.gitignore` (1 line; mirrors the `/base-scanner` entry) |

No other findings. Specifically:

- **Garbage/tautological tests — none.** Every new test asserts a real contract. `enrich_test.go` drives the resolver seam with configurable fakes (applies/skip, namespace-violation reject+revert, convert domain-error soft-fail, unloaded-source unavailable, cancelled-context hard-fail) and a full legal+illegal state-machine table. `parser_test.go` does a real go-plugin **subprocess** round-trip (`TestTVParserSubprocess` builds the binary + full 4-RPC chain + Handshake/Shutdown). `metadata_test.go` documents its own stub-sweep ("a stubbed adapter fails every per-field assertion"). `integration_pipeline_test.go` is the AC-1 golden deriving expected values independently (`ipDeriveShow`, reviewer-independence). `module/parse_test.go` documents its "BUG CATCH".
- **Dead / backward-compat code — none.** No unused exports (golangci-lint `unused` clean). No unreachable branches, no commented-out blocks, no scaffolding. `QueryItems` signature change cleanly propagated to all 3 call sites (handlers.go, run_test.go, store_test.go) — no stale residue. `parseTV` extraction leaves zero dangling references in base-scanner.
- **DRY / SOLID — no violations.** tv-parser vs base-scanner plugin-service boilerplate is the acceptable per-capability shared pattern (dupl threshold 100 — check.sh dupl clean). The enrich chain vs scan orchestrator use distinct, justified seams. Interfaces exist only at the plugin seam, each with ≥2 implementations.
- **Complexity-budget — no breach.** All packages ≤12 exported symbols (store at 11 = WARN, not fail); enrich=3, sdk=7, plugin=10, module=7, scan=3, api=3. funlen 60/40, gocognit 15, gocyclo all green via check.sh. No file >500 lines.
- **Conventions — all adhered.** Apache-2.0 header on every new `.go` file (verified). Parameterized SQL only. `exec.Command` arg-slice only (lifecycle + test builds). No `reflect` in production (depguard clean; `reflect.DeepEqual` appears only in `enrich_test.go`, which depguard exempts). No DI framework. Core media-type-agnostic (AC-4 probe: 0 media-type branches outside module config).

## AC reconciliation (negative/structural ACs vs feature-origin findings)

| Negative AC | Probe | Result |
|---|---|---|
| AC-1 parseTV fully removed from base-scanner | `grep -rnE 'season\|episode\|SxxExx\|parseTV' plugins/base-scanner/ \| grep -v _test` | **0 hits — PASS** (and `parseTV` present in tv-parser: 12 hits) |
| AC-3 additive contract (wire `IdentifyResult` shape + `GET /items?status=` additive) | reviewer-PROCEED'd; `status` is a defaulted nullable addition; store.QueryItems internal refactor | unchanged wire shape — PASS |
| AC-4 config-driven (no `if mediaType=="tv"` in core) | `grep -rnE 'mediaType\s*==\s*"\|MediaType\s*==\s*"' internal/ cmd/` | **0 hits — PASS**; media strings only in `registry.go tvConfigJSON` seed + tests |

The single P2 finding (X-01, gitignore gap) is **build hygiene** and does **not** match any negative-AC intent (the negative ACs concern parseTV extraction, additive proto contract, and media-type-agnosticism). It is non-blocking.

## Deletable estimate
~0 lines / ~0 tests deletable. No garbage tests, no dead code.

## Recommended next step
None blocking. Optional one-line cleanup (P2 X-01): add `/tv-parser` to `mellifera/.gitignore`. Can be folded into the next coder touch or done standalone; does not gate QA.
