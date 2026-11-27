# Handoff → wf-reviewer (external-jav-plugins, propose step 4)

From: wf-surveyor · integration audit at base 47e3fc4, worktree `feature/external-jav-plugins`, map fingerprint `composite:ffcdcdf5…` CURRENT. Full record: `integration.md` beside this file. Belief below; the change folder and receipts win.

## Audit summary

Planned graph: **25 nodes (16 core, 9 external), 28 edges, 3 open questions.** Ground-truth note: the source map is python-only in this environment (verified — `def PluginIDTmdb` misses, backend python-graph); every Go grounding was live-source grep against this worktree @ 47e3fc4 and go.mod read directly; the planner's substitution holds for my findings (all G2 target checks passed; go.mod byte-confirms go-plugin v1.8.0 / chi v5.3.1 / fsnotify v1.10.1 / go 1.25.0).

Verdicts:
- **Wiring coverage: PASS** (Q1 open). No orphan nodes; all four design Interfaces blocks have producers+consumers; hidden scope NONE — no task touches internal/api, internal/plugin, internal/relay, pkg/, Dockerfile, proto.
- **QA seam coverage: PASS with one escalation (Q2).** 7 @qa tasks, all strict-lane compliant. Handshake, seed↔derivation, stub leg, doc contract: covered. Trait↔relay seams: unit-only, no cross-module QA leg.
- **Complexity / blast radius: PASS.** Budgets grounded live: module 6→7 (≤8), enrich 12→12 (zero new), plugin 4→4. G1 boot regression + G3 registry-Open + G10 compose are the load-bearing risks, each pinned by a named test or the operator gate.

Verified-holding rulings (dispatch special-attention items — do not re-open):
1. Scaffold-before-consumer ordering HOLDS (5.1 `git init` creates the repo; its verify proves repo + private-module fetch; all consumers at later groups/ids).
2. G4's stub itest DOES exercise the optional-load + handshake path the external plugins take (present-binary boot, seeded dormancy → PUT → verdict flip → derive/enrich/anchors, mismatch → failed row). It does not cover the relay seams (→ Q2).
3. Deploy templates vs release artifacts: env keys, mount layout, checksums.txt/release-manifest.json names all MATCH; binary naming diverges (→ Q1).
4. Core-first deploy order HOLDS, grounded: SERVER binding dormant via unresolved required option (queueable conjunct queue.go:29/613); parser binding absent-binary rides the existing unavailable-stage law (chain.go:181, retry.go:15, worker.go attemptedNoWork) — what 3.2 pins. Residual P3: one unavailable stage per tv item per first pass while binaries are absent — bounded, no churn.
5. Spec deltas pin dormancy + byte-identical trait-absent behavior + all three relay seams; the absent-binary derivation law is unpinned (→ Q3).

Also noted (P3, no question): G5's scaffold writes machine-global config (git insteadOf + `go env -w GOPRIVATE`) outside both repos — documented in the external README; 5.1's qa: names tests 5.2 authors (harmless); T0 probe (proposal Q4) gates 7.1/7.2 fixture freeze.

## Waiver list (items a human may consciously waive)

- W1 = Q1: unrenamed release layout would silently boot `not_serving` — waivable only with a documented manual rename step in the operator runbook instead.
- W2 = Q2: trait↔relay coverage stays unit-level — waivable as unit-sufficient if the reviewer accepts mock-only coverage of the headline invariant.
- W3 = Q3: absent-binary derivation law stays test-pinned but spec-silent — waivable as test-sufficient behavioral memory.
- W4 (P3 residuals, waivable by default): machine-global git/go env writes from 5.1; bounded stage noise under absent binaries; 5.1/5.2 qa-list redundancy.

## Open questions at write time

- **Q1 (HIGH)** — release artifacts `jav-parser-vN-linux-amd64` vs compose `/app/bin-extra/current/jav-parser`; 8.2 never names a rename step → silent-dormant deploy. Recommended: rename-on-fetch to unversioned names in deploy-plugins.sh + a name grep in 8.2's verify.
- **Q2 (MEDIUM)** — no relay-seam cross-module QA leg for the "never reaches relay_jobs" invariant. Recommended: one relay-enabled stub leg in 4.1 (or 4.2) asserting zero relay_jobs rows, named in qa:.
- **Q3 (LOW)** — no spec-delta scenario for absent-binary settles-ready derivation. Recommended: one ADDED scenario in the plugin-pipeline delta.

Resolutions recorded in integration.md §Human resolutions when the human rules; amend-or-waive is theirs, never the surveyor's.
