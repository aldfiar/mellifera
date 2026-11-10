# Close-out — tmdb-enrichment

Closed 2026-11-10 · GATE 1 approved 9 Nov ("fold all 4 in") · GATE 2 APPROVED after four rounds (HEAD 9e13497) · human archive approval "Approve + close" 10 Nov · archived as `2026-11-10-tmdb-enrichment` (spec deltas merged: tmdb-enrichment created +6, async-enrichment +2, plugin-admin +2).

## What shipped

The TMDB metadata source end to end: `plugins/tmdb` (the shikimori structural mirror — match dispatch, SERVER request contract with `server:`-scoped api_key refs, RU-first namespace with cast + per-episode title/description contributions, namespace-only merge, search pair); core SERVER-mode auth plumbing (Manager.RequiredSecrets over the retained handshake, `server:` substitution at resolveVariables serving fetch + search + relay descriptors alike, mode-only AuthContext — secret values never enter the plugin process, derivation dormancy conjunct + interactive pre-action checks with the typed ErrUnconfiguredSource); the admin secret surface (PUT /admin/modules/{module_id}/sources/{plugin_id}/options over Registry.SetBindingOptions — the Registry's first mutation path, RWMutex-guarded with a -race proof; per-binding required_secrets verdicts; served-options secret redaction); PUT /items/{id}/identify (the series identify law generalized over loadRow); serial seed v4 (tmdb binding at priority 4, third guarded UPDATE); the shared leaf `internal/sourcestate` carrying the two cross-layer sentinels. Films and serials enrich from TMDB; unconfigured = dormant + visible; zero SPA edits; zero proto edits.

## Final receipt summary (the durable record once the machine home is gone)

- **Plan**: 9 groups, 33 authored tasks + built-in git-check. Final state 34/34 green, `wf pipeline status` rc 0.
- **Receipt ledger**: 95 receipt events; **9 red receipts, every one superseded green or by design**:
  - 1.2, 1.3 (wf-coder) — honest reds from the compile-coupling lesson: a NEW package whose skeleton carries the compile-time full-interface assertion makes all its tasks' verifies compile-coupled; superseded when 1.7 (the interface-completing task) landed. Loop lesson: dispatch the interface-completing task first in a new package's group.
  - 5.1 ×2 (wf-qa) — the joint HALTed twice and both reds are the change's crown jewels: round 1 wire-proved **4 product defects** every unit-green task missed (anchored-plan URLs composed "&" onto bare paths; tmdb missing from sourceCatalog so the aggregate had no tmdb row; SearchSource fetching SERVER specs without resolved secrets + a latent relay seam handing out placeholder plans; the season fact never reaching Match so anchored series took the movie path) → fixed as group 6 and re-proven on the wire; round 2 reds were three test-side bugs in the QA agent's own joint file (double-recording middleware, append-only stage assert, a pacing race) — fixed honestly by the same agent.
  - git-check ×5 (1 wf-coder, 4 wf-reviewer) — all EXPECTED-RED-pending-push per the close order (push sanctioned only after human archive approval); green at close (262bd9f push).
- **Gate history**: round 1 NOT APPROVED (boot regression + AC-4 literals, 600s timeout marginal) → group 7; round 2 NOT APPROVED (depguard reflect + stale seed-v4 wantChain, both masked by the boot chaos) → group 8; round 3 NOT APPROVED (check.sh stage 2, the exported-symbol complexity budget — api/enrich at 13 vs fail >12, masked rounds 1–2 behind the stage-1 lint failure) → group 9; round 4 APPROVED (anchor fully green: 28 packages, zero FAILs, itest 420.8s inside 30m; all three check.sh stages green).
- **Design flags authored during the loop**: flag 7 (season fact rides core-side, proto untouched), flag 8 (AC-4 probe vs frozen receipt greps — the unique comment-anchor shape, ruled PASS by the reviewer: not literal gaming), flag 9 (complexity budget → the sourcestate leaf; the mid-round single-sentinel amendment ruled PASS on process and substance).

## Loop lessons (this install)

1. **Scoped duties never hit `make check`** — third occurrence this change (PR #21 → group 8 → group 9). Group 9's fix adds the structural receipt: a duty that runs the gate's own counting rule over the touched packages.
2. **The complexity budget's counter sees only keyword-led single-line declarations** — grouped `var (` blocks are invisible to it. Law landed this change: no NEW counter-invisible declaration ships; regrouping is counter-gaming, not redesign.
3. **A package at exactly 12 exports has zero slack** — the budget WARN (>8) is a real signal; this change ignored two standing WARNs and paid a fix round. Future surface additions to api/enrich FAIL until one splits or lands in a leaf.
4. **The frozen-grep conflict class**: when a receipted duty greps a byte form the gate's own invariant forbids in code, the comment-text anchor (the probe's own de-counted class) is the sanctioned resolution — document it as a design flag so the gate judges informed.
5. **Mid-apply amendment integrity**: re-register with a journaled `--reason` BEFORE dispatching the amended task; the receipts ledger's ordering is the process proof the reviewer audits.
6. **itest harnesses and fail-fast plugin loads**: every server-booting harness must pin every unconditionally-loaded plugin's binary env; the fallback-pin pattern (explicit binary wins, helper fills the empty case) kept the 5.1 joint's own binary authoritative.

## Follow-up seeds (carried to docs/backlog.md by the docs sweep)

Standing export-budget pressure (api/enrich at 12/12 — future exports FAIL until a split); optional P4 unify the api-local ErrUnconfiguredSource twin into sourcestate + collapse cmd's translation hops; P3 SearchSource double-resolve; P3 mixed-type options object → all-secrets-unprovided dormancy; pre-existing: kinopoisk seeded-but-uncataloged, /items?library= serial-module listing asymmetry, non-2xx upstream bodies reach plugin Convert unclassified; comment-staleness notes (source_admin.go ~:264 plural docstring; three main.go closure doc comments' "enrich-side sentinel" prose); the dedicated api-reference reconciliation pass (docs-debt known state).

## Environment notes

ENOSPC mid-loop: the disk-full incident hit the planner mid-authoring; the operator authorized Go+npm cache cleanup only (23Gi freed); nothing else touched.
