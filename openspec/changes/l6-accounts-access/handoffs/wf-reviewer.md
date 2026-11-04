# Handoff — wf-surveyor → wf-reviewer (l6-accounts-access)

UPDATED after amendment round 2 (2026-11-04). Supersedes the round-0 and
round-1 records. Evidence: `openspec/changes/l6-accounts-access/
integration.md` — especially its §Amendment re-run — round 2 (line-evidence
verification of the Q9/Q10 resolutions, final check verdicts, final
frontier). This record is belief; that file and the plan artifacts are
evidence.

## Audit summary (final, post-round-2)

Plan now 11 groups / **42 tasks** (ids unique, grammar verified). The
question frontier is **EMPTY**: Q1–Q10 all closed. Q1–Q8 were approved at
GATE 1 and implemented by amendment round 1 (six previously-unwired edges
owned: E20/E21 → 5.3, E22 → 10.3, E23 → 10.4, E24 → 2.2, E25 → 3.5;
compile pin at 5.3; joints 11.3/10.2/10.3/10.4/3.5/2.2). Round 2 resolved
the last two questions:

- **Q9 closed** — task **1.3** (@qa) authors the ctx viewer carrier in
  `internal/access`: unexported key + exported
  `WithViewer(ctx, v)` / `FromContext(ctx)` pair; package reaches 7 exports
  (≤8 budget, D4); **`FromContext` of a bare ctx returns the ZERO Viewer**
  (fail closed). `viewerFor` (6.1) is the ONLY production stasher;
  `principalInjector` seeds via `access.WithViewer` (test path, mirrors
  role_gating_test.go:21); 5.3's cmd legs read `access.FromContext` — the
  "cmd reads an api-unexported key" impossibility is gone. DAG holds:
  1.3 (group 1) precedes 5.3/6.1/10.1. playback-progress delta restated
  (:52 live 4-arg OnProgress, :58 carrier pair, :137 FromContext).
- **Q10 closed** — 10.1 stays **cmd/mellifera-only, ctx-read** (ZERO api
  edits, no Deps.ModulePresentation widening). Verified against live
  source: the closure is built at **cmd/mellifera/main.go:392** (design D8
  cite corrected :414→:392, exact) and invoked with the request ctx at
  **internal/api/display.go:129** inside elementTemplate (:125) — the
  closure already receives the request ctx today. All 10 namerFor (:82)
  call sites pass request ctx (art.go:521/:625; handlers.go:972/:1125/
  :1279/:1544/:1654/:1723; recs_ordering.go:492; source_admin.go:456).
  `Deps.Identity` wiring is now explicit: MUST-assign bullet in 10.1 prose
  AND duty (`go test ./cmd/mellifera -run
  'TestChainMuteClosure|TestDepsIdentityWired'` — test names in prose ==
  names in duty); design restates the obligation (:219–221, chain-layer
  :245–246). My round-1 namerFor :81 note was the doc-comment line —
  **:82 conceded on grep evidence**.

**Environment caveat (Q8, recorded):** the wf map's Go symbol layer is
EMPTY (symbols=0, importers=0 at CURRENT currency). `wf index query
callers` answers `(none in map)` for every Go symbol — ground your GATE-2
re-checks by grep over the post-change tree, as this survey did (method +
citations in integration.md §Grounding).

## Coverage verdicts (final)

- **Wiring coverage: COVERED** — no orphan nodes; every planned edge has
  an owning task.
- **QA seam coverage: COVERED** — every cross-module seam jointed:
  detector→ledger-slot (11.3 + 5.3 duties), viewer carrier itself (1.3
  @qa — the seam's own unit seam), identity adopt/cascade (3.5 @qa),
  mute floors (10.3/10.4 + 10.2 joint last in group 10),
  Deps.Identity wiring (TestDepsIdentityWired), device management on
  credentials (2.2).
- **Complexity/blast radius: consistent** — round-0 conclusions stand
  (sweep inventory ~87 non-test sites / 21 repo files inside 4.5's
  mechanism-based closure; MUST-be-true counts exact — scan/run.go ×4
  :122/:230/:399/:444, art/settle.go ×3 :145/:154/:165; zero new exports
  in capped packages beyond access's planned 7-of-8). The 5.3 compile pin
  (`go build ./...`) now runs after 1.3 authored the carrier, so it
  compiles against real symbols.

## Question frontier at write time

**EMPTY — register may proceed.** Q1–Q8 closed round 1 (implemented /
recorded caveat), Q9–Q10 closed round 2 (implemented; owning tasks 1.3,
5.3, 6.1, 10.1). Nothing was waived; the human's GATE-1 approvals plus the
amendments resolved everything.

## Gate notes for your GATE-2 re-check

- GATE-2 re-ground by grep (Q8 caveat above); re-run the orphan check on
  the threaded reads and honor the resolution table in integration.md.
- **Watch-item (not a question): non-request ctx callers.** Any future
  caller passing a bare background ctx through a cmd closure gets the
  zero Viewer → NO chain mutes on that projection. This degrades toward
  legacy-visible, never toward a leak (zero Viewer = slot-0/legacy
  semantics), but flag any NEW ModulePresentation/namerFor call site that
  does not pass a request ctx. Today all 10 sites pass request ctx
  (verified — see summary).
- Round-0 minor verification still yours at the gate: **GetLibraryChain**
  (libraries.go:264) must stay transitively gated by viewer-scoped
  GetLibrary at its request-path caller (handlers.go:655) — the chain-mute
  AND-down must cover libraries reached transitively through the chain,
  not only direct grant rows.
- On your re-read, the tasks whose wording changed in round 2 are 1.3
  (new), 5.3, 6.1, 10.1, 10.4, plus the design Interfaces bullets and the
  playback-progress delta — re-check those in the same pass.
