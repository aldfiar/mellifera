---
name: mellifera-build
description: How to build and maintain Mellifera — an AI-navigable, modular Go media server. Load before editing Go code, adding a module, or fixing a bug. Enforces narrow APIs, pure functions, pure-delegation HTTP handlers, and a complexity budget so small/medium models can navigate the codebase.
---

# Building Mellifera

Mellifera is built by AI agents, including small and medium models. The codebase is structured so a fix touches **one package** and **one test**. Follow this skill or the structure rots and models can no longer navigate it.

Companion docs: `docs/architecture.md` (contracts), `docs/ai-architecture.md` (why this structure), `docs/prior-art.md` (lessons). Composes with the general `contracts`, `coding-principles`, and `software-design` skills — those carry the theory; this skill carries Mellifera-specifics.

## Runtime dependencies (operators)

These are NOT Go module dependencies and are NOT required to BUILD Mellifera
(the binary is pure-Go, `CGO_ENABLED=0`). They are required at RUNTIME by plugin
subprocesses (invoked via `os/exec` arg-slice — never a shell):

- `ffmpeg`/`ffprobe` 7.1.1 — video probe (base-scanner). Install: `brew install ffmpeg` (macOS) / `apt install ffmpeg` (Debian).
- `exiftool` — image EXIF (image-enricher, Phase B2). Install: `brew install exiftool` (macOS) / `apt install libimage-exiftool-perl` (Debian/Ubuntu).

A missing binary is a per-source SOFT-FAIL (empty metadata → B1 `no_data` →
settle); the scan always succeeds and the build is unaffected. See
`docs/architecture.md` §1.2 and the operator runbook
(`docs/image-enrichment/operator_runbook.md`); the Makefile `build-plugin` target
also documents these.

## The module map

Realized by the `scan-library` feature. Counts are exported symbols; `WARN` = >8
but <12 (pre-justified R10); all others ≤8.

| Package | Owns | Public API (≤8 symbols; WARN noted) | Depends on |
|---|---|---|---|
| `cmd/mellifera` | wiring only (flat `main.go`) | — | all (read-only) |
| `internal/store` | SQLite: documents + control tables + reserved `playback_progress`/`scan_jobs` | `Open`, `Close`, `DB`, `CreateLibrary`, `GetLibrary`, `GetItem`, `PutItem`, `QueryItems` (+ `Store`/`Item`/`Library`) — **11 WARN** | — |
| `internal/plugin` | subprocess lifecycle + gRPC clients + capability routing | `Open`, `Load`, `Start`, `Stop`, `Status`, `Scanner` (+ `Manager`/`Deps`/`Health`) — **9 WARN** | proto, sdk |
| `internal/module` | config-driven module registry | `Open`, `Get`, `List` (+ `Registry`/`Module`/`ScannerBinding`) | store |
| `internal/scan` | scan-side orchestration (resolve module → scanner → stream → identify → PutItem) | `Run`, `Deps`, `Result` | store, module, plugin |
| `internal/api` | HTTP (chi) — **PURE DELEGATION, no logic** | `New`, `Deps`, `Principal` | scan, store |
| `pkg/sdk` | plugin SDK (ships in the MAIN Go module for MVP — R7) | `Serve`, `ScannerPlugin`, `Scanner`, `HandshakeConfig`, `Capability` | proto, go-plugin |
| `plugins/base-scanner` | one subprocess binary (walk + ffprobe (video) + stdlib image base info; module-type-gated discovery; parseTV extracted to tv-parser) | per-capability | sdk, proto |
| `plugins/tv-parser` | `metadata_source` subprocess (parseTV moved here verbatim); serves `metadata.v1.MetadataSource` | per-capability | sdk, proto |
| `plugins/image-enricher` | `metadata_source` subprocess (EXIF via the system `exiftool` binary — `os/exec` arg-slice, no Go dep); structural mirror of tv-parser; serves `metadata.v1.MetadataSource` | per-capability | sdk, proto |
| `internal/enrich` | queue + dispatch (Match→Build→Convert→Merge) — **DEFERRED** (not built this feature) | — | — |
| `internal/stream` | range-request file serving — **DEFERRED** | — | — |
| `internal/janitor` | cleanup cron (orphaned data, drafts, ledger) — **DEFERRED** | — | — |

`proto/` holds the gRPC contracts shared by core + plugins (`docs/architecture.md` §2). `internal/scan` is the scan-side analog of the deferred `internal/enrich`. Dependency direction points **down** only: `api → scan → {module, plugin} → store`. No cycles.

> The generic `plugin.Call`/`Health` names from the pre-implementation map are realized as the typed accessor `plugin.Scanner(pluginID, capID)` and `plugin.Status` (avoids the name collision with the `Health` return type). Accepted deviations live in `docs/ai-architecture.md` §4 + `docs/scan-library/reviews/review_coder.md` §5.

## Before you edit

1. **Find the ONE package** that owns the behavior (table above). If a change needs logic in >1 package, the task is too big — split it. (`api/` is never the answer for logic — it only delegates.)
2. **Read that package's `doc.go`** — that is the entire public API. Do not exceed **8 exported symbols** (12 is a hard fail).
3. **Read its `*_test.go`** — the test IS the usage example and the acceptance spec.

## Rules (non-negotiable)

- **Pure core, thin shell.** Logic = pure functions (`input → output`; no I/O, no hidden state). I/O (DB, HTTP, subprocess, filesystem) lives only in `store/`, `plugin/`, `stream/`, `api/`, `janitor/` edges.
- **`api/` is pure delegation.** A handler does exactly three things: parse the request, call **one** domain function, write the response. No branching logic, no composing multiple domain calls, no business rules. If logic is needed, it belongs in a domain package; `api/` calls it.
- **No DI framework, no reflection wiring.** `main.go` is a flat, readable list of constructor calls — the entire app graph visible in one file.
- **Data-type boundaries, not interface boundaries.** Pass structs across packages. Use interfaces ONLY where there are ≥2 real implementations (the plugin seam). No single-implementation interfaces.
- **No shared mutable types across packages.** Cross-package data crosses a struct conversion.
- **Every exported symbol has a table-driven test.** If you cannot test an exported symbol with a single table, its API is too wide — redesign before writing more.
- **Keep it shallow.** Prefer `result := transform(input)` pipelines over object collaboration. If tracing a behavior takes >3 hops, refactor.

## Anti-patterns (reject in review — these strand small models)

- god-objects / packages exporting >8 symbols
- optional params or flags that branch behavior ("just add a bool")
- interfaces with a single implementation
- reaching into another package's unexported state
- logic inside `api/` handlers
- widening an API to avoid a refactor
- deep call chains, callback soup, implicit event wiring

## Before finishing

```bash
./.claude/skills/mellifera-build/scripts/check.sh
```

Fails the change if any complexity budget is exceeded (exported-symbol count, dependency direction, file length, cyclomatic complexity, exported-without-test). A fail means **redesign** — do not relax the budget. Numbers and rationale in `docs/ai-architecture.md`.

## Adding a new module

1. `cp -r .claude/skills/mellifera-build/module-template internal/<yourmodule>`
2. Rename the package `greet` → `<yourmodule>` in all files.
3. **Write the `doc.go` contract first** (responsibility, public API ≤8 symbols, invariants) — before implementation.
4. Implement pure functions; push I/O to `store/plugin/stream/api/janitor`.
5. Add a table-driven test for every exported symbol.
6. Add the package to the module map above and in `docs/ai-architecture.md`.
7. Run `check.sh`.
