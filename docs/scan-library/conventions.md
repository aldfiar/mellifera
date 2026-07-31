# Conventions — scan-library

> Plan-specific restatement of the load-bearing conventions from
> `mellifera/docs/.project_context.json` + the `mellifera-build` skill + arch §0
> principles. The coder obeys these; the reviewer checks them. A violation is a
> redesign, not a relaxation.

## Hard rules (non-negotiable — kickoff + mellifera-build skill)

1. **≤8 exported symbols per package (12 hard fail).** `check.sh` counts. This
   feature's WARN packages (`internal/store` at 10, `internal/plugin` at 9) are
   documented exceptions, justified in the decision log + architecture_review.
   No other package may exceed 8. **Generated `.pb.go` is exempt** (vendor
   contract, not hand-written API) — see R2 for the required `check.sh` update.

2. **`doc.go` per package.** The entire public API in one file. Written BEFORE
   implementation (contract-first). Follows the module-template shape:
   responsibility, public API (≤8 symbols), invariants. See
   `.claude/skills/mellifera-build/module-template/doc.go`.

3. **`api/` is pure delegation.** Every handler does exactly: parse request →
   call ONE domain function → write response. No branching, no orchestration,
   no composing multiple domain calls. funlen ≤60 lines, gocognit ≤15. If logic
   is needed, it belongs in a domain package (`scan`, `store`, `module`);
   `api/` only routes to it. (ai-arch §3; mellifera-build skill.)

4. **No DI framework, no `reflect`.** Depguard denies both (`.golangci.yml`).
   `main.go` is a flat, readable list of constructor calls — the entire app
   graph visible in one file. No init-time branching beyond reading config.

5. **Data-type boundaries, not interface boundaries.** Structs cross packages.
   Interfaces ONLY at the plugin seam with ≥2 implementations. The single
   interface this feature ships (`sdk.Scanner`) has two real implementations:
   the subprocess client wrapper (core side) and the in-process test fake (test
   side). This justifies the interface — see R8.

6. **No shared mutable types across packages.** Cross-package data crosses a
   struct conversion. `internal/store.Item` does NOT appear in an HTTP
   response; `internal/api` has its own unexported `itemDTO` and converts at
   the boundary. (ai-arch §2 corollary.)

7. **Table-driven test for every exported symbol.** Tests are the spec AND the
   acceptance gate. If you cannot test an exported symbol with a single table,
   its API is too wide — redesign. Co-located `<pkg>/<symbol>_test.go`,
   in-package (`package <pkg>`). See module-template `greet_test.go`.

8. **Parameterized SQL ONLY.** Every value through `?`/`$N` placeholders. No
   string-built queries, no `fmt.Sprintf` into SQL. (golang-security; store
   invariant.)

9. **Apache-2.0 license headers on every `.go` file.** (D12/Q18.) SPDX short
   form. CI/lint-enforced. `LICENSE` + `NOTICE` at repo root.

10. **Path-traversal guard.** Scanner resolves + verifies every discovered path
    within the configured library root, checked pre- and post-symlink-resolve
    (TOCTOU). NO file outside root is ffprobed/read/persisted. (kickoff hard
    rule; golang-security.)

11. **`ffprobe` via `exec.Command` arg slice, NEVER shell.** No `sh -c`, no
    `bash -c`. Args passed as a slice to `exec.CommandContext`. (kickoff hard
    rule; arch §1.2; golang-security.)

12. **Downward-only dependency direction.** `api → scan → {module, plugin} →
    store`. `proto/` + `pkg/sdk` are shared leaves. No cycles. (ai-arch §4;
    contracts.md §10 import map.) Depguard / the import map is the gate.

## Naming (project-specific)

- **Packages**: short, lowercase, single word where possible (`store`,
  `plugin`, `module`, `scan`, `api`, `sdk`). Match the directory's last segment.
- **Files**: `<topic>.go` (`scanner.go`, `pathguard.go`, `ffprobe.go`,
  `tvparse.go`). One responsibility per file. `doc.go` always present.
- **Types**: the primary type in a package can be named `<Package>` (e.g.
  `store.Store`, `plugin.Manager`, `module.Registry`) OR a domain noun
  (`store.Item`, `store.Library`, `scan.Result`). Either is fine; consistency
  within a package matters.
- **Constructors**: `Open(...)` for I/O-bound things (`store.Open`,
  `module.Open`, `plugin.Open`); `New(...)` for the router (`api.New`).
  Rationale: `Open` implies Close + a resource (file/DB/subprocess); `New`
  implies a value. Match the stdlib convention (`os.Open`, `sql.Open`).
- **Methods on the primary type**: `Load`/`Start`/`Stop` (lifecycle), `Get`/
  `List`/`Query`/`Put` (CRUD), `Status`/`Health` (state).
- **Proto messages**: PascalCase as generated (`ScanRequest`, `DiscoveredFile`).
  Never rename.
- **DTOs**: unexported, `<noun><verb>Request`/`<noun>Response` (e.g.
  `createLibraryRequest`, `scanResponse`, `itemsResponse`, `itemDTO`).

## Anti-patterns (reject in review — from mellifera-build skill)

- god-objects / packages exporting >8 symbols without justification
- optional params or flags that branch behavior ("just add a bool")
- single-implementation interfaces (the `sdk.Scanner` interface is NOT one — R8)
- reaching into another package's unexported state
- logic inside `api/` handlers
- widening an API to avoid a refactor
- deep call chains (>3 hops), callback soup, implicit event wiring
- `reflect`, DI frameworks, code generation for wiring
- string-built SQL; `sh -c` for any subprocess

## File-length / complexity budget (enforced by `.golangci.yml` + `check.sh`)

| Metric | Warn | Fail | Where enforced |
|---|---|---|---|
| Exported symbols / package | >8 | >12 | `check.sh` |
| Outgoing intra-core deps / package | >4 | >6 | `check.sh` (when it lands the dep guard) / depguard |
| File length | >300 lines | >500 lines | reviewer + `check.sh` |
| Function cognitive complexity (`gocognit`) | >10 | >15 | golangci-lint |
| Function cyclomatic complexity (`gocyclo`) | — | >15 | golangci-lint |
| Function length (`funlen`) | — | 60 lines / 40 statements | golangci-lint |
| Line length (`lll`) | — | 120 chars | golangci-lint |
| Duplicate code (`dupl`) | — | threshold 100 | golangci-lint |
| Exported symbol without table test | — | any | reviewer + `check.sh` |

A failed check means **redesign**, not relax.

## Error handling convention (arch §11.6)

- **Transport errors** (plugin down, RPC timeout, auth fail, not found) → gRPC
  status codes at the plugin seam; the api layer translates to HTTP status
  (table in arch §11.6).
- **Domain errors** (the RPC returned OK but the operation failed) → canonical
  body `{"error":{"code","message","retryable"}}` with HTTP 422.
- For THIS feature (scan-library, no Mode B): handlers return simple 4xx/5xx +
  the canonical body. Domain-error richness (upstream_404, rate_limited) is
  metadata-plugin territory (deferred) — but the body shape is established NOW.
- Errors are values (`type Health struct{...}`, `type scanError struct{...}`),
  not exceptions. Wrap with `fmt.Errorf("...: %w", err)` for chain inspection.
  No `panic` in libraries.

## Logging / observability convention (arch §11.4 — light MVP)

- Structured JSON logging (stdlib `log/slog`). Request-id correlation via
  middleware-injected field (unexported middleware helper).
- Per-plugin metrics (RPC count, latency, error rate, restart count) — minimal
  in MVP; surfaced in `plugin.Status()`.
- No external metrics backend. Logs are the primary channel.

## Deprecation / evolution (arch §11.3)

- Proto fields/RPCs: additive within a major; `reserved` only at major bumps.
- Document `schema_version`: monotonic; old documents read forever; lazy
  migration on write.
- The `playback_progress`, `drafts`, `enrichment_failures` tables are CREATED
  this feature (reserved per §9.1) but their methods are DEFERRED — additive,
  no later migration needed when those features land.

## Russian-language data is first-class (arch §1.2)

- Metadata documents carry per-language fields natively (`titles.ru`,
  `titles.en`) — this is DATA i18n, not UI i18n. The TV filename parser must
  handle Cyrillic titles correctly (no English-only regex assumptions).
- Module configs use `LocalizedString` (a `map<string,string>` keyed by BCP-47).
- This feature's TV fixture should include at least one Cyrillic-title file to
  prove this (tracked in the integration test).

## Skill loading order for the coder (golang-security is project-local)

The coder loads: `mellifera-build` (NON-NEGOTIABLE), `golang-security`
(project-local), `grounding`, `contracts`, plus the stack-patterns Go section.
The specifier embeds the relevant `skill_hint` per task. Order matters:
`mellifera-build` first (it sets the structure), `golang-security` before any
SQL/exec code (it sets the injection-prevention rules).
