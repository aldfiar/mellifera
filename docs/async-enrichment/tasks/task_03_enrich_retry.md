# Task 03 — internal/enrich/retry.go: per-source retry/backoff wrapper

- **Type:** coder
- **Step:** 3 (Outline)
- **Seams:** S3 (retry/backoff)
- **AC trace:** AC-ledger, AC-1, AC-2
- **Project scope:** `.` (root; CREATE in `internal/enrich`)
- **Deps:** none (leaf — wraps the existing `runSource` `chain.go:49`)
- **Estimated LOC:** ~90 (S-M)

## behaviors

- **B1** `runSourceRetryable(ctx context.Context, resolve metadataResolver, src module.MetadataSourceBinding, mod module.Module, base *scannerv1.IdentifyResult, cfg QueueConfig) (sourceResult, ledgerStatus string, attempts int)` — loop the existing `runSource` (`chain.go:49`) with exponential backoff up to `cfg.MaxAttempts`. | ac: AC-ledger | kind: normal
- **B2** Success short-circuits: the first `runSource` returning `outcomeSucceeded` returns immediately with `ledgerStatus == ""` (no ledger write) and `attempts` = the successful attempt number. The namespace/provenance/view from `runSource` are carried through unchanged. | ac: AC-ledger, AC-1 | kind: normal
- **B3** Transient failure retries: a `runSource` returning `outcomeFailed` (an RPC error / namespace violation — `chain.go:130` `failOutcome`) sleeps `cfg.Backoff << (attempt-1)` (exponential, capped per §4.4) and retries, IF `ctx` is not done and `attempts < cfg.MaxAttempts`. | ac: AC-ledger | kind: normal
- **B4** Exhaustion is terminal: after `cfg.MaxAttempts` transient failures, return the last `sourceResult` with `ledgerStatus == "exhausted"` — the caller (Task 05 dispatch) writes the ledger via `store.RecordFailure`. The retry wrapper itself does NOT touch the store. | ac: AC-ledger | kind: error
- **B5** No-data is terminal-immediate: if `runSource` returns `outcomeSucceeded` BUT with a nil/empty namespace (the chain ran clean but produced no metadata), return `ledgerStatus == "no_data"` without further retry. (B1 note: tv-parser does not emit this path — it either parses or RPC-errors; the classification exists for §4.4 completeness and is unit-tested with a fake.) | ac: AC-ledger | kind: edge
- **B6** Skipped/unavailable sources are NOT failures: `outcomeSkipped` (disabled, or `Match.applies==false`) and `outcomeUnavailable` (plugin not loaded) return `ledgerStatus == ""` with `attempts` = 1 — the derivation considers the pair done, no ledger write, no retry. | ac: AC-ledger | kind: edge
- **B7** `ctx.Done()` is the only hard abort: a cancelled context returns the in-flight `sourceResult` with `ledgerStatus == ""` (the queue's hard-fail path, `enrich.go:190`, owns the `failed` transition — not the retry wrapper) and `attempts` = however far it got. | ac: AC-ledger | kind: error

## invariants

- **INV-bound-MaxAttempts:** in-memory retries are BOUNDED by `cfg.MaxAttempts` (default 3). There is NO infinite loop — exhaustion is terminal (§4.4 loop-safety). Per-SESSION only: the counter does not persist (restart resets it; the ledger owns durability — Task 05).
- **INV-backoff-idiom:** exponential backoff (`cfg.Backoff * 2^(attempt-1)`) — reuse the idiom from `plugin.exponentialBackoff` (lifecycle.go restart loop, `state.json key_decisions stack_patterns_resolved`). The sleep is bounded by the `context` (a `select` on `ctx.Done()` / `time.After`, never a bare `time.Sleep` that ignores cancellation).
- **INV-no-store-here:** the retry wrapper is a PURE transform over `runSource` — it returns a classification; it does NOT import `store` or write the ledger. The dispatch (Task 05) maps `ledgerStatus` → `RecordFailure`/`ClearFailure`. This keeps `retry.go` single-concern and testable with a fake resolver alone.
- **INV-classification-set:** `ledgerStatus ∈ {"", "exhausted", "no_data"}`. Empty = no ledger write (success/skipped/unavailable/cancelled). The non-empty values are the ONLY statuses `store.RecordFailure` accepts (contracts §RecordFailure).
- **INV-4rpc-preserved:** `runSource` is called unchanged — the retry loop wraps it, never short-circuits its internal 4-RPC sequence (the Match→BuildRequest→Convert→Merge contract from Phase A holds).

## precondition

Phase A `internal/enrich/chain.go` exists with `runSource` (`chain.go:49`), the `sourceResult` struct + `outcomeKind` consts (`chain.go:20-41`: `outcomeSucceeded/outcomeFailed/outcomeUnavailable/outcomeSkipped`), and `failOutcome`/`skipOutcome` (`chain.go:130,139`). `metadataResolver` (`enrich.go:29`) is the resolver type. `module.MetadataSourceBinding`, `module.Module`, `scannerv1.IdentifyResult` exist.
- evidence: `internal/enrich/chain.go:49` (`runSource`), `:20-41` (`outcomeKind`/`sourceResult`), `:130` (`failOutcome`), `:139` (`skipOutcome`); `internal/enrich/enrich.go:29` (`metadataResolver`).
- evidence (backoff idiom): `internal/plugin/lifecycle.go` `exponentialBackoff` (`state.json key_decisions stack_patterns_resolved`).

## postcondition

`internal/enrich/retry.go` exists with the unexported `runSourceRetryable` wrapper; `retry_test.go` is table-driven with an in-package fake `metadataResolver` (the R8 second-impl pattern, mirror `enrich_test.go`) covering success-short-circuit, transient→backoff→exhausted, no-data-immediate, skipped/unavailable-no-retry, and ctx-cancel-abort. `go test ./internal/enrich/...` green. No new exported symbol (the wrapper is unexported — enrich stays at its pre-Task-05 count).

## test_seed

In-package fake `metadataResolver` returning a fake `sdk.MetadataSource` whose `Match/Convert/Merge` results are scripted per attempt (mirror the `enrich_test.go` fake pattern). Inject via the resolver seam (no real subprocess). Cases:
- success on attempt 1 → `ledgerStatus==""`, `attempts==1`, namespace carried.
- failure 3× (scripted) with `cfg.MaxAttempts=3`, `cfg.Backoff=1ms` (fast for tests) → `ledgerStatus=="exhausted"`, `attempts==3`; assert the backoff slept (use a package clock / `time.Now` delta OR a channel signaling sleeps — keep deterministic).
- success on attempt 2 (scripted fail-then-succeed) → `ledgerStatus==""`, `attempts==2` (recovery short-circuits).
- `applies==false` (outcomeSkipped) → `ledgerStatus==""`, `attempts==1`, no retry.
- plugin-not-loaded (resolve returns err → outcomeUnavailable) → `ledgerStatus==""`, `attempts==1`, no retry.
- empty-namespace success (fake Merge returns empty doc) → `ledgerStatus=="no_data"`, `attempts==1`, no retry.
- ctx cancelled mid-backoff → returns promptly with `ledgerStatus==""`, no panic.

## callers_to_update

(none yet — NEW file, unexported symbol. The consumer is Task 05's dispatch loop.)

## allowed_imports

- `context`, `time` (stdlib)
- `github.com/mellifera/mellifera/internal/module`
- `github.com/mellifera/mellifera/pkg/sdk`
- `github.com/mellifera/mellifera/proto/mellifera/scanner/v1` (scannerv1 — `IdentifyResult`)
- (NO `store` import — INV-no-store-here. `QueueConfig` is defined in Task 05; to avoid a forward dependency, this task references `QueueConfig` via the SAME package — `retry.go` and `queue.go` are both package `enrich`. If Task 05 is not yet landed, gate the compile on the package-level build, not this file alone.)

## allowed_categories

- `stdlib`

## test_exclusions

- `runSourceRetryable` IS logic (the retry loop + classification) — NOT excluded; table test required.

## negative_examples

- DO NOT import `internal/store` here — the wrapper classifies; the dispatch writes the ledger (INV-no-store-here).
- DO NOT use a bare `time.Sleep` that ignores `ctx` — use `select { case <-ctx.Done(): ...; case <-time.After(backoff): }`.
- DO NOT retry forever — `MaxAttempts` bounds the loop (INV-bound-MaxAttempts).
- DO NOT retry `outcomeSkipped`/`outcomeUnavailable` — they are not failures (B6).
- DO NOT mutate `runSource` or the 4-RPC sequence — wrap it (INV-4rpc-preserved).
- DO NOT persist the retry counter — per-session in-memory only (durability is the ledger's job, Task 05).

## existing_code_snapshot

```go
// internal/enrich/chain.go:20-41 (the outcome kinds + sourceResult — consumed unchanged)
const (
	outcomeSucceeded   outcomeKind = iota
	outcomeFailed
	outcomeUnavailable
	outcomeSkipped
)
type sourceResult struct { kind outcomeKind; pluginID string; namespace map[string]any; /* ... */ }
// internal/enrich/chain.go:49 (the wrap target — signature unchanged)
func runSource(ctx context.Context, resolve metadataResolver, src module.MetadataSourceBinding, mod module.Module, base *scannerv1.IdentifyResult) sourceResult
```

## contract_test_scope

- **joint (S3):** `internal/enrich.runSourceRetryable -> runSource` | assert: a transient failure retries with exponential backoff then either recovers (`ledgerStatus==""`, success) or exhausts (`ledgerStatus=="exhausted"`); success short-circuits; no_data is terminal-immediate. Verified in `retry_test.go` with a fake resolver. (The fail→ledger→derivation-skip CHAIN is verified end-to-end in Task 05/Task 08 — this task owns the classification joint.)

## scope_boundary

- CREATE `internal/enrich/retry.go` (`runSourceRetryable` + any unexported backoff helper).
- CREATE `internal/enrich/retry_test.go` (table-driven, fake resolver).

## out_of_scope

- `QueueConfig` definition (Task 05 owns the exported `QueueConfig`; this file references it as a same-package type). If reviewers prefer, the wrapper may take `(maxAttempts int, backoff time.Duration)` as two params instead of `QueueConfig` to remove the forward reference — the coder MAY make that mechanical choice; either way the values come from `QueueConfig` at the call site.
- The ledger write (Task 05) and the derivation cooldown-skip (Task 05).
- Real HTTP fetch / no_data from an external source (B3 — tv-parser does not produce no_data in B1).

## line_budget

90 (flex 1.2)

## acceptance_criteria

- AC-ledger (transient→backoff→exhausted classification; bounded, no infinite loop)
- AC-1 (success path produces the namespace the worker applies)
- AC-2 (file <500; funlen/gocognit green; no new exported symbol here)

## refactoring_checklist

- `cd mellifera && go test ./internal/enrich/...` green.
- `grep -nE 'time\.Sleep' internal/enrich/retry.go` → 0 hits (use `select`+`time.After`, ctx-aware).
- `grep -nE '"github.com/mellifera/mellifera/internal/store"' internal/enrich/retry.go` → 0 hits (INV-no-store-here).
- `grep -nE 'for.*attempt|for.*;.*attempt' internal/enrich/retry.go` → ≥1 hit (the bounded retry loop); confirm the loop bound references `cfg.MaxAttempts` (or the param) — no `for {}` without a break condition.
- `./.claude/skills/mellifera-build/scripts/check.sh` OK.

## source_anchor

CREATE `internal/enrich/retry.go` (package `enrich`). Wrap target: `internal/enrich/chain.go:49` (`runSource`). Outcome types: `internal/enrich/chain.go:20-41`. Resolver type: `internal/enrich/enrich.go:29`.

## skill_hint

`mellifera-build`, `grounding`, `stack-patterns`
