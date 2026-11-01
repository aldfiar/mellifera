# Review — client-relayed-fetch (GATE 2)

2026-10-27 · reviewer pass run in-session (the Agent tool is unavailable post-compaction; wf-reviewer duties executed by the session — disclosed, see handoffs/session.md substitution note).

## Scope

- Diff axis: `git diff a467358..HEAD` on `feature/client-relayed-fetch` (commit 5cb34a7 + the gate-ruled split commit) vs the four spec deltas (client-relayed-fetch NEW; async-enrichment, web-ui, plugin-admin MODIFIED).
- Duty axis: all 18 registered duties re-run from the worktree root against the committed/refactored tree.
- Standards axis: check.sh (golangci-lint + exported-symbol budget), gofmt, parameterized-SQL, pure-core/thin-shell, Russian operator copy, redaction coverage.

## Duty axis

- 1.1–7.1 (16 authored Go/web tasks): **green on re-run** after the gate-ruled split — receipts fresh 2026-10-27.
- 7.2 + git-check: re-verified after the split commit (artifacts regen carried in the same commit).
- Full vitest: 409 tests / 32 files green (web untouched by the split).
- Full go test: green including `TestWeb_Integration/ac7_gates` (the repo meta-gate) and `TestRelayJoint` (9.2 s, real graph, device-token pairing → claim → result → `executor:"client"` → ledger cleared).

## The gate finding and its ruling

The first full-suite run surfaced `TestWeb_Integration/ac7_gates` FAIL: `make check`'s exported-symbol budget — internal/store 15, internal/enrich 13 vs fail >12 (main baseline store 12, enrich 11; the change's +3 types / +2 core symbols crossed it). The scoped duties never run check.sh — this is exactly the gate's job.

**Ruling: GATE-ruled split, budget untouched** ("Redesign; do not relax the budget"):

1. NEW `internal/relay` vocabulary package — `PlanSpec` / `RelayJob` / `RelayResult` (3 exports), the descriptor shapes shared by store (JSON blob columns), enrich (the deferred handoff), api (the claim/result wire). The SQL stayed in store **methods** (outside the budget's top-level count): task 1.1's duty command runs verbatim, no plan re-registration.
2. enrich sheds `NewRelay`: `Relay` carries exported fields (Store/LeaseTTL/Cool/Notify); zero knobs take their defaults **at use** via unexported `lease()`/`cool()` accessors (the `withDefaults` precedent — a zero knob never disables); cmd/mellifera constructs the literal. Duties 2.1/2.2 run verbatim.

Result: store 12, enrich 12, relay 3, api 12 (pre-existing WARN) — `check.sh: OK` rc 0; ac7 PASS; every Go duty re-green on the refactored tree; artifacts regen (OpenAPI def keys `store.PlanSpec` → `relay.PlanSpec`; dist byte-identical).

## Spec axis

- NEW client-relayed-fetch: classifier (network|upstream|protocol|spec, only network relay-eligible) ✓; deferred outcome + retry short-circuit ✓; relay_jobs durable store, single-claimant conditional UPDATE, lease lazy-expiry ✓; claim/result routes, 2 MiB cap, 409 refusal shape ✓; ledger loop-safety (relayed flat 10m → clear-on-done + wake; 3 failed rounds → terminal exhausted via the standard doubling, 56d @ attempts 6 pinned) ✓; consult-before-fetch with plan byte-equality ✓; search-over-relay 60s budget, no ledger row ✓; redaction (userinfo+query+fragment, unparseable → wholesale [redacted]) ✓; `executor:"client"` stamp ✓; MELLIFERA_RELAY_* knobs ✓.
- MODIFIED async-enrichment: `relayed` vocabulary + optional plugin_id/limit/offset on the failures list (absent params = today's bytes) ✓.
- MODIFIED web-ui: relay loop in the authenticated shell (15s poll, idle backoff, 401 stop), failures column + drill-down, Russian copy ✓.
- MODIFIED plugin-admin: additive `failures` count (current rows) ✓.

## Standards axis + carry-forward rulings

1. **DB()-seam reads** (Consult SELECT + relayJobMeta in enrich/relay.go): STAY. Documented, S10-sanctioned, parameterized; the budget ruling makes growing store's top-level surface MORE expensive, so store-owned read methods are a future pass, not a gate item.
2. **Launch-type substitution**: all apply launches rode default-type agents with role prose (operator-caught); this review itself ran in-session. Process disclosure, journaled; no code consequence found on the standards axis.
3. **enrich export band**: now formally 12 = WARN (matches store/sdk/orchestrator) — the design's "~10" estimate was low; accepted band, no FAIL.
4. **gofmt**: chain.go/chain_test.go FIXED in the split pass; `qa_display_naming_joint_test.go`/`qa_episode_titles_joint_test.go` flags are PRE-EXISTING main debt (1a3e359) → closeout docs pass. store doc.go INV6 staleness + RFC3339Nano ordering note → docs pass.
5. **3.2 duty regex** covers TestDeferredHandoff only; TestDeferredConsultFeedsConvert verified green in full-package runs.
6. **Grounded divergences** — accepted: body base64 unconditional (Go []byte JSON is strictly base64); useInfiniteQuery new to the codebase (load-more semantics); Deps.RelayMaxBody field beyond the task-line shorthand (D7); search job keying without an Enqueue row id; extras fetched server-side once before defer.

## Verdict

**PASS** — zero FAIL findings outstanding; flags above ride to the closeout docs pass. Human archive approval requested from the operator.
