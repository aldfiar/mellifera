# Mellifera — AI-Navigable Architecture

**Status:** Companion to `architecture.md` and `prior-art.md`.
**Purpose:** Define the codebase structure that lets AI agents — including small and medium models — build and maintain Mellifera. The structure is a *property of the codebase*, enforced by the `mellifera-build` skill (`.claude/skills/mellifera-build/`) and a complexity budget. It cannot be retrofit; it is decided now, before code.

## 1. The problem

AI agents fail on large codebases for structural reasons, not volume:

- **Call-graph fan-out** — tracing a behavior hops through many objects/interfaces.
- **Hidden control flow** — DI containers, reflection wiring, interface dispatch, callbacks, event buses. The model cannot *see* what calls what; it must *infer*.
- **Wide APIs** — a package exporting 40 symbols forces reasoning about all of them to change one.
- **Implicit shared state** — mutable types passed across boundaries mean a change anywhere might break anything.

A small model can fix a bug if the whole change is local to one package and one test. It fails the moment it must trace behavior across many objects.

## 2. Six principles

| # | Principle | Effect for a small model |
|---|---|---|
| 1 | **Context locality** — one module = one self-contained directory | Whole module fits in context; no tree traversal |
| 2 | **Narrow public API** — ≤8 exported symbols/package, in one `doc.go` | One file = the whole surface |
| 3 | **Shallow data pipelines** — `result := transform(input)` | Linear traces, no hop blowup |
| 4 | **Pure core, thin shell** — logic is pure; I/O only at edges | Tests are `input → output`, no fixture sprawl |
| 5 | **Explicit wiring** — flat `main.go`, no DI/reflection | The app graph is readable in one file |
| 6 | **Tests as the spec** — every exported symbol has a table test | Tests are the examples *and* the acceptance gate |

Corollaries: **data-type boundaries, not interfaces** (interfaces only at the plugin seam, ≥2 implementations — never single-impl interfaces); **bounded contexts** (cross-package data crosses a struct conversion, never a shared mutable type).

## 3. `api/` is pure delegation

`internal/api` holds **zero logic**. A handler does exactly three things:

1. parse the request,
2. call **one** domain function,
3. write the response.

No branching, no multi-call orchestration, no business rules. Logic lives in `store/`, `enrich/`, `module/`, etc.; `api/` only routes to it. This makes the largest-dependency package also the simplest, and means behavior changes almost never touch `api/` — which in turn means the hardest-to-navigate package (the HTTP surface) stays trivial.

## 4. Module map (authoritative — keep in sync with the skill)

Realized by the `scan-library` feature (foundational slice) + the additive
`plugin-pipeline` Phase A layer. Counts are exported symbols; `WARN` = >8 but
≤12 (pre-justified R10); all others ≤8. Reserved-table methods
(`RecordProgress`/`GetResume`) are deferred — the tables exist but no method
ships yet. Phase A deltas are marked **[A]**.

| Package | Owns | Public API (≤8; WARN noted) | Depends on |
|---|---|---|---|
| `cmd/mellifera` | wiring (flat `main.go`) — **[A]** loads base-scanner + tv-parser, constructs `enrich.Deps` | — | all (read-only) |
| `internal/store` | SQLite: documents + control tables + reserved `playback_progress`/`scan_jobs` — **[A]** + indexed `items.status` column (default `"new"`); `QueryItems` gained additive `status` filter (`""` ⇒ all) | `Open`, `Close`, `DB`, `CreateLibrary`, `GetLibrary`, `GetItem`, `PutItem`, `QueryItems` (+ `Store`/`Item`/`Library`) — **11 WARN** | — (bottom) |
| `internal/plugin` | subprocess lifecycle + gRPC clients + capability routing — **[A]** caps-driven launch; `MetadataSource` accessor | `Open`, `Load`, `Start`, `Stop`, `Status`, `Scanner`, `MetadataSource` (+ `Manager`/`Deps`/`Health`) — **10 WARN** | proto, sdk |
| `internal/module` | config-driven module registry — **[A]** `metadata_sources` chain (`Module.MetadataSources[]`); tv-parser seed | `Open`, `Get`, `List` (+ `Registry`/`Module`/`ScannerBinding`/`MetadataSourceBinding`) — **7** | store |
| `internal/scan` | scan-side orchestration (resolve module → scanner → stream → identify → **[A]** enrich → PutItem) | `Run`, `Deps` (`.Enrich` field), `Result` | store, module, plugin, enrich |
| `internal/enrich` | **[A] metadata-side serial orchestrator** (4-RPC chain Match→BuildRequest→Convert→Merge over `metadata.v1.MetadataSource`; pure `nextState`; provenance/`_view` assembly) | `Enrich`, `Deps`, `Result` — **3** | store, module, plugin |
| `internal/api` | HTTP (chi) — **pure delegation, no logic** — **[A]** additive `itemDTO.Status` + `?status=` filter | `New`, `Deps`, `Principal` | scan, store |
| `pkg/sdk` | plugin SDK (ships in the MAIN Go module for MVP — R7) — **[A]** capability-2 adapter | `Serve`, `ScannerPlugin`, `Scanner`, `MetadataSourcePlugin`, `MetadataSource`, `HandshakeConfig`, `Capability` — **7** | proto, go-plugin |
| `plugins/base-scanner` | one subprocess binary — **[A]** media-type-agnostic (walk + ffprobe + withinRoot; parseTV extracted to tv-parser) | per-capability (scanner.v1 + plugin.v1) | sdk, proto |
| `plugins/tv-parser` | **[A]** first `metadata_source` subprocess binary (parseTV moved here verbatim; serves `metadata.v1.MetadataSource`) | per-capability (metadata.v1 + plugin.v1) | sdk, proto |
| `internal/stream` | range-request file serving — **DEFERRED** | — | — |
| `internal/janitor` | cleanup cron — **DEFERRED** | — | — |

`internal/enrich` is now realized as the metadata-side analog of `internal/scan`
(both sit at the same level). Dependency direction points **down** only:
`api → scan → enrich → {module, plugin} → store` (enrich between scan and
{module, plugin}; scan calls enrich between Identify and PutItem). `proto/` and
`pkg/sdk` are shared leaves. No cycles.

**Accepted deviations realized by `plugin-pipeline` Phase A** (reviewer ACCEPT,
health-check HEALTHY; see `docs/plugin-pipeline/reviews/review_coder.md` §4):
zero new protos — tv-parser + the enrich chain implement the already-generated
`metadata.v1.MetadataSource` (decision D-1, capability mapping); plugin launch is
caps-driven (base-scanner's client set byte-identical to scan-library — AC-3);
`_view` is Phase-A last-writer (Phase B adds arbitration); `_stages.stage` is
`"metadata_source"` (the contract example `"parse"` was illustrative); parseTV
moved verbatim (base-scanner Identify now media-type-agnostic); `enriched` = ≥1
success ∧ 0 failed (partial stays at furthest-valid). Phase B (external TMDB
enricher + `AuthContext` + async queue) and Phase C (post-action) remain
**deferred/outlined**.

**Accepted deviations realized by scan-library** (reviewer/health-check ACCEPT;
see `docs/scan-library/reviews/review_coder.md` §5):
- `store.DB()` shares the live `*sql.DB` with `internal/module` (seam S10) so the
  registry runs its own parameterized reads; store stays the sole opener/closer.
- `api.Deps.AdminToken` makes the whole router injectable through one `New` point.
- The scan-minted item id is the deterministic composite `itm_<libraryID>_<fileID>`
  (MVP substitute for the contracts §4 ULID; idempotency + uniqueness preserved).
- `plugins/base-scanner` ships in the MAIN module (R7; arch §10 "separate modules"
  revisited at Phase 2) and serves scanner.v1 **and** plugin.v1 on one gRPC server.
- `scripts/check.sh` is portable (bash 3.2 + 4+; no `mapfile`) and excludes
  generated `*.pb.go`/`*.gen.go` from the symbol count; thresholds (≤8 WARN /
  >12 FAIL) are unchanged.
- Protos are extracted verbatim from arch §2; two genuine cross-package compile
  fixes (§2.1.3 `AuthContext` qualified, §2.2.2 `HealthStatus`→`HealthResponse`)
  are applied in `architecture.md`.

## 5. Complexity budget (enforced by `scripts/check.sh` + `.golangci.yml`)

| Metric | Warn | Fail |
|---|---|---|
| Exported symbols per package | >8 | >12 |
| Outgoing intra-core deps per package | >4 | >6 |
| File length | >300 lines | >500 (funlen gates functions) |
| Function cognitive complexity | >10 | >15 (`gocognit` / `gocyclo`) |
| Exported symbol without a table test | — | any |

A failed check means **redesign**, not relax. This budget is what keeps small models effective as the codebase grows; relaxing it under deadline pressure is exactly the failure mode the gate exists to prevent.

## 6. How a fix lands (the locality guarantee)

1. Locate the owning package (module map). One package.
2. Read its `doc.go` + `*_test.go`.
3. Edit pure functions; run the one test.
4. `api/` is untouched unless the route itself changes.

If a fix routinely ripples across packages, the structure has failed — tighten the boundary (a stable data-type contract) rather than widen the change.

## 7. Tooling

- `.claude/skills/mellifera-build/` — the skill: rules, module map, module template, and this gate.
- `.golangci.yml` — lint thresholds (`funlen`, `gocognit`, `gocyclo`, `lll`, `dupl`, `depguard` denying `reflect` and DI frameworks).
- `.claude/skills/mellifera-build/scripts/check.sh` — exported-symbol counts + lint; run before finishing any change.

> Note: `.claude/skills/` lives inside the Mellifera project directory, so the skill is discovered when Claude Code is opened **in `mellifera/`** (the intended working root for implementation).
