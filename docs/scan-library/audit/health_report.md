# Health Check: scan-library
Date: 2026-07-30 | Mode: health-check | Stack: go 1.25.3 / chi v5 / SQLite / go-plugin gRPC
Files changed (greenfield): 41 Go source + 1 integration test | Files with issues: 0

> Greenfield scope: the entire Go implementation under `mellifera/{cmd,internal,pkg,plugins}/`
> plus `mellifera/integration_test.go` is new/changed this feature. All findings are therefore
> `origin: feature` by construction. This report audits code HEALTH (not functional correctness,
> which the reviewer already PROCEED'd).

## Summary
Findings: **P0: 0 | P1: 0 | P2: 0** | Non-blocking observations (P3-class): 3, informational only
Overall verdict: **HEALTHY — PROCEED** (no P0; no P1; no feature-origin finding matching a negative AC intent)

## Gate re-run (read-only confirmation of the healthy baseline)

| Gate | Command | Result |
|---|---|---|
| Format | `gofmt -l cmd internal pkg plugins integration_test.go` | **clean** (0 files) |
| Build | `CGO_ENABLED=0 go build ./...` | **OK** (exit 0) |
| Test | `CGO_ENABLED=0 go test ./...` | **all ok** (9 packages incl. the golden integration test, 3.2s) |
| Lint | `golangci-lint run ./...` (funlen, gocognit, gocyclo, lll, dupl, depguard, unused, …) | **clean** (0 diagnostics) |
| Budget | `bash .claude/skills/mellifera-build/scripts/check.sh` | **check.sh: OK** |

All five gates green. `check.sh` enforces the complexity budget (exported-symbol count, funlen/gocognit/gocyclo/lll/dupl, depguard, exported-without-test); `golangci-lint`'s `unused` linter (the authoritative replacement for the deprecated deadcode/structcheck/varcheck) is clean.

## Changed-files inventory

| Package | .go files | Largest file (lines) | Exported symbols | Intra-core deps |
|---|---|---|---|---|
| `cmd/mellifera` (main) | 1 | 171 | 0 (composition root) | api, module, plugin, scan, store, sdk |
| `internal/api` | 5 | handlers.go 190 | 3 | scan, store |
| `internal/scan` | 3 | run.go 219 | 3 | module, plugin, store, sdk |
| `internal/module` | 3 | registry.go 183 | 6 | store |
| `internal/plugin` | 5 | lifecycle.go 305 | **9 (WARN)** | sdk |
| `internal/store` | 5 | open.go 164 | **11 (WARN)** | — (leaf) |
| `pkg/sdk` | 4 | scanner.go 132 | 7 | — (leaf) |
| `plugins/base-scanner` (main) | 10 | scanner_test.go 124 | 0 (plugin binary) | sdk, proto |
| root | 1 | integration_test.go 567 | — | black-box e2e |

Legend: exported symbols counted top-level funcs/types/vars/consts + exported methods (check.sh method). WARN = >8 but <12 (documented exception); **store=11 / plugin=9 are the pre-justified WARN packages — both confirmed under the 12 hard-fail.** Every other package ≤8. Largest non-test file is 305 lines (<500 fail). Max outgoing intra-core deps = 4 (`scan`, <6 fail). Dependency direction strictly downward: `api → scan → {module, plugin} → store`, with `sdk`/`store` as shared leaves; **no cycles**.

## Per-package health assessment

- **cmd/mellifera** — Flat composition root, the whole app graph in one `main()` as explicit constructor calls. No DI container, no reflect. Shutdown path runs each step via `logErr` so all steps get a chance. Slowloris guard (`ReadHeaderTimeout`). **Healthy.**
- **internal/api** — Pure delegation confirmed: every handler does parse-request → ONE domain call → write-response; no branching/orchestration. Boundary struct conversion enforced (`store.Item` never serialized; unexported `itemDTO`). Canonical error body (`{error:{code,message,retryable}}`). Pagination clamp is pure request parsing. **Healthy.**
- **internal/scan** — Clean orchestrator. AC-6 soft-fail is correct: `persist` appends a warning and returns `ctx.Err()` (nil unless cancelled) so one bad file never aborts the scan; a cancelled context is the only hard return mid-stream. `scannerResolver` is an unexported test seam (does not count toward the symbol budget). **Healthy.**
- **internal/module** — Config-driven cache. SQL fully parameterized (`?` placeholders). Get/List are cache-only/pure; List returns a defensive copy. Parse-at-boundary via anonymous struct extracting only the scanner slot (rest is opaque pass-through). `errNotFound` unexported sentinel keeps the symbol count at budget. **Healthy.**
- **internal/plugin** — Subprocess lifecycle + typed capability accessor. `exec.Command(binaryPath)` at lifecycle.go:244 is the go-plugin substrate launch (single-arg, **not** a shell, go-plugin owns the process). Restart loop is re-entrancy-guarded with exponential backoff + jitter. **Healthy.**
- **internal/store** — Parameterized SQL only (PutItem upsert preserves id/created_at on conflict; GetItem/QueryItems via `?` placeholders + LIMIT/OFFSET). Unexported `scanner` interface unifies `*sql.Row`/`*sql.Rows` (idiomatic, not a cross-package seam). **Healthy.**
- **pkg/sdk** — The single interface `Scanner` ships with **≥4 real implementations** (production `scannerGRPC` client; `scannerImpl` base-scanner server; test fakes in scan/plugin), fully justifying the interface at the plugin seam (R8). No single-impl interfaces elsewhere. **Healthy.**
- **plugins/base-scanner** — Security-critical paths verified: `withinRoot` does **pre- and post-symlink** checks (closes the TOCTOU window; rejects dotdot/absolute/symlink-chain escapes). `ffprobe` runs via `exec.CommandContext` **arg-slice** (never a shell); every failure mode is soft (AC-6). `tvparse` is a pure parser with focused single-purpose regexes, Cyrillic-safe (ASCII digit classes). **Healthy.**

## Findings

### P0 — (none)
### P1 — (none)
### P2 — (none)

No garbage/tautological tests, no dead/backward-compat code, no DRY/SOLID violations, no complexity-budget breaches, no convention breaches were found. Evidence for each category:

- **Garbage/tautology tests** — Verified by deep-reading 6 test files (integration_test.go, scan/run_test.go, base-scanner pathguard/tvparse/scanner tests) + a sweep of all 30 test functions. The integration test builds real binaries, drives real HTTP + a real ffprobe subprocess, and asserts EXACT reviewer-re-derived parsed title/season/episode (the golden rule) plus AC-4/AC-6/idempotency. Sweep result: **0 zero-assertion tests, 0 skip-only tests, 224 assertion statements across 30 tests** (~7.5/test). The coder's per-test tautology-sweep claim holds.
- **Dead/backward-compat** — Greenfield (no compat shims by definition). `golangci-lint` `unused` linter clean. No unreachable branches, no commented-out code, no scaffolding markers (TODO/FIXME/placeholder), no `panic` in non-test source. No unused exports.
- **DRY/SOLID** — `dupl` (threshold 100) clean. `api/` pure delegation. Data-type boundaries enforced. The only two interfaces (`sdk.Scanner`, unexported store `scanner`) each have ≥2 implementations. Downward-only deps, no cycles, no coupling magnets.
- **Complexity budget** — `check.sh` OK (funlen 40 stmts, gocognit/gocyclo 15, lll 120, dupl 100). No package breaches the ≤8/12 symbol budget; largest file 305 < 500; max deps 4 < 6.
- **Convention breaches** — Apache-2.0 SPDX headers on **all 41** .go files (0 missing). Parameterized SQL throughout. Exec arg-slice only (no `sh -c`). Zero `reflect` usage in code (matches in comments only, explaining its absence). Zero DI-framework imports. `doc.go` present in every package.

## AC reconciliation
Feature is greenfield → every file is `origin: feature`. There are **no findings** to reconcile against the negative/structural ACs. AC-2 (five gates green, ≤8 symbols with documented WARNs, headers, no reflect, no DI, table tests) is independently confirmed green by the gate re-run above. Per the OriginTag rule, the BLOCK-reach conditions (any P0, or any `origin: feature` finding matching a negative AC intent) are not triggered.

## Non-blocking observations (informational, P3-class — NOT findings, no action required)

These are deliberate, documented design decisions surfaced for completeness. They are cosmetic and do not affect health or the verdict.

1. **Reserved always-nil error returns.** `plugins/base-scanner/ffprobe.go:probe` and `internal/module/registry.go:List` return `(T, error)` where `error` is today always `nil`, reserved for forward-compatible caller-fatal signals. Both are documented inline as deliberate. Style-level only.
2. **Epoch-timestamp seed constant.** `internal/module/registry.go:seedCreatedAt = "1970-01-01T00:00:00Z"` avoids importing `time` (outside this task's allowed_imports). Honest, documented constraint adherence.
3. **Documentation drift (1 symbol).** `conventions.md` §1 records the store WARN at 10 exported symbols; the actual count (and the task brief) is 11. Both are well under the 12 hard-fail. Suggest updating conventions.md for accuracy so the WARN package's proximity to the limit is correctly tracked.

## Verdict
**0 P0. 0 P1. 0 P2.** No feature-origin finding matches a negative AC intent. → **PROCEED.**

The scan-library vertical slice is code-healthy: gates green, conventions honored, tests real and exact, no dead/compat/DRY/SOLID/complexity debt in the changed files. The 3 P3 observations are informational and non-blocking.
