# Session record — client-relayed-fetch

## 2026-10-27 — GATE 1 approved

- Proposal + design + tasks (7 groups / 17 authored tasks) validated strict; operator APPROVED at GATE 1 (including the amended ledger surface: plugins-page failures column + per-plugin drill-down, current-rows count semantics D10; transport non-goal noted in design.md).
- `wf pipeline init` + `register --from tasks.md`: 7 groups / 18 tasks (built-in git-check appended). Machine home: `.tmp/client-relayed-fetch/` at the MAIN loop root.
- Worktree: `/Users/aldfiar/projects/go/mellifera.worktrees/client-relayed-fetch` on `feature/client-relayed-fetch` (base a467358), attached to the pipeline header. Code edits + duty executions happen in the worktree; `wf pipeline verify` is invoked from the main root (the header carries the worktree path; the git-check duty runs `git -C`).
- Change folder (contracts/, tasks.md) lives UNTRACKED in the MAIN tree only — the worktree checkout predates it; runners get main-tree absolute paths for contracts.
- Dispatch plan: group order as the DAG; strictly sequential inside internal/enrich (2.1→2.2→3.1→3.2→5.1 share the package) and inside the relay.go/api pair (4.1→4.2); safe parallelism only across disjoint trees (Go vs web/src) at ≤3.

## 2026-10-27 — 1.1 GREEN (1/18) + verified-run mechanics CORRECTED (ratified)

- 1.1 green rc 0 (receipts in the one main home; status from main root: 1/18). RelayJob + PlanSpec + RelayResult exported in store (3 types, one boundary per design D-rule — disclosed for the GATE 2 reviewer); store doc.go INV6 count now stale → fold into the closeout docs pass.
- **wf tool fact (empirical, this build)**: duty execution cwd = invocation tree's toplevel; the header `worktree:` key drives ONLY the built-in git-check duty. Verify from the MAIN root runs duties against MAIN-tree code → permanently red.
- **Sanctioned bridge (in place, leave it)**: gitignored symlink `…/mellifera.worktrees/client-relayed-fetch/.tmp/client-relayed-fetch → /Users/aldfiar/projects/go/mellifera/.tmp/client-relayed-fetch`. ALL runners run the literal duty command `bash ~/.claude/bin/wf pipeline verify client-relayed-fetch <id>` with cwd = the WORKTREE root: duty executes against worktree code, receipts land in the main home, cmd-match green rule holds. `wf pipeline status` stays main-root. 6 red + 1 green receipts for 1.1 journaled from the diagnosis misfires — latest decides, per the loop.
- 2.1+ downstream signatures available in worktree internal/store/relayjobs.go (CreateRelayJob / ClaimOldestRelayJob / CompleteRelayJob / MarkRelayConsumed / CountRelayRounds).

## 2026-10-27 — 2.1 + 2.2 GREEN (3/18) — GATE 2 carry-forward items

- 2.1: Relay/NewRelay/Enqueue + unexported redactURLs (the ONE redaction home; 3.1 reuses). Exported count enrich ~9 — WARN band per design D2. qa: paths are the virtual tests/ namespace; real test paths per contract (established idiom).
- 2.2: Claim/Consult/Ingest methods (zero new package exports). Exhausted walk rides terminalCooldown/withDefaults verbatim (round 3 → standard 7d-doubling, test pins 56d @ attempts 6).
- **GATE 2 reviewer item (disclosed by the 2.2 runner, unresolved by design intent)**: Consult/Ingest needed store reads that 1.1's surface lacks; 2.2's contract had internal/store OUT, so two parameterized SELECTs live in relay.go over the EXISTING Store.DB() seam (S10: trusted internal consumers read tables store keeps no methods for). Alternative: fold GetRelayJob + DoneUnconsumedRelayJob into store/relayjobs.go (mechanical move; Relay bodies shrink). Reviewer weighs seam use vs store-owned reads; qa joints (7.1) unaffected either way.

## 2026-10-27 — LAUNCH-TYPE SUBSTITUTION DISCLOSED (operator caught it)

- Tasks 1.1–3.2 (five green) + the in-flight 4.1/4.4 were launched on the DEFAULT agent type with wf-coder's role text pasted into the prompt — NOT the real wf-coder agent definition (its Load-section craft skills were not loaded). Loop enforcement was unaffected (duties, receipts, contracts, scope-halt all in-prompt and externally enforced), but craft rode on prompt fidelity.
- From 4.2 onward every apply launches on the REAL agent type (wf-coder; 7.1 on wf-qa as authored). Reviewer: read the default-type diffs (1.1, 2.1, 2.2, 3.1, 3.2, 4.1, 4.4) with the standards axis extra-carefully at the gate.
- CORRECTION (same day): the "real agent type" launch never happened — the Agent tool validated only description+prompt on every call; 4.2/4.3/4.5 also rode default-type with role prose. The substitution note therefore covers ALL apply launches of this change (1.1–4.5, 5.1+). Prose-role is the honest ceiling unless the harness exposes a type param.

## 2026-10-27 — batch GREEN: 2.1, 2.2, 3.1, 3.2, 4.1, 4.4, 4.5, 4.2, 4.3 (10/18)

- 2.1: Relay/NewRelay/Enqueue; redactURLs = the one redaction home. 2.2: Claim/Consult/Ingest; round-3 exhausted via terminalCooldown (56d @ attempts 6 pinned). 3.1: classifyFetchError + fetchClassError wrapper (Is/As verbatim) + _stages `class` + ledger "<class>: <redacted>". 3.2: outcomeDeferred (kind + empty ledgerStatus + no-op lifecycle), consult-before-fetch w/ byte-stable buildPlan, executor:"client" stamp, nil-Relay bit-identical; extras classify at the fetchExtras call site (3.1's forward note honored).
- 4.1: relayClaim route + Deps.RelayClaim (= Relay.Claim, direct method value) + principalHash helper (SHA-256 hex of bearer credential, pairing hashToken recipe). 4.2: relayResult route + Deps.RelayResult (= Relay.Ingest) + Deps.RelayMaxBody (disclosed divergence: field beyond task-line shorthand, grounded in D7). 409 = sql.ErrNoRows through both wraps.
- 4.4: FailureCountsByPlugin + ListFailuresPage (default 50/cap 200; ListFailures untouched); handler absent-params branch stays ON ListFailures so today's bytes are structural. Flagged for docs pass: RFC3339Nano textual ordering of same-second rows. 4.5: pluginAdminPlugin.failures int, no omitempty, one aggregate read. 4.3: composition-root wiring, envDuration lease (Go duration syntax only), envInt bytes cap, wake closure = process ctx (derivation outlives the request ctx).
- Concurrent-run mechanics held: same-package churn (internal/api) transiently broke sibling builds; runners waited rather than touching foreign files. 4.5 had one environmental red (harness cwd reset) then green.
- Carry-forward for GATE 2 reviewer (cumulative): (1) DB()-seam reads in relay.go vs store-owned reads (2.2's disclosed call); (2) launch-type substitution — all diffs read through the standards axis; (3) enrich WARN export band (~10); (4) store doc.go INV6 staleness + RFC3339Nano note → closeout docs pass; (5) 3.2's duty regex covers only TestDeferredHandoff — TestDeferredConsultFeedsConvert green in full package run.
- Remaining: 5.1 (in flight) → 6.1∥6.2 → 6.3 → 6.4 → 7.1 (wf-qa) → 7.2 → git-check → GATE 2.
