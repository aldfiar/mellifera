# wf-surveyor → wf-reviewer — tmdb-enrichment integration audit

Written at propose (openspec-loop §Propose step 4); **updated after amendment round 1** — the
survey re-ran ONCE over the amended artifacts (tasks.md, design.md, specs/ all edited) and all
four questions resolved by amendment. Belief record — the evidence home is
`openspec/changes/tmdb-enrichment/integration.md` (+ the live tree it cites at `file:line`).
Re-ground every planned edge post-change per the gate contract (`wf index query callers`; the
map currently extracts no symbols in this tree — grounding fell back to file reads, noted in
integration.md).

## Audit summary (post-amendment)

- Graph: 28 planned nodes (5 groups; +2 since round 0: the IdentifySeries pre-write check, the
  cmd closure translation edits), 21 planned edges — all grounded through file reads with
  `file:line` evidence; every round-0 and amended citation verified on the live tree.
- **Wiring coverage: COVERED** — no orphan nodes; the two round-0 caveats are resolved (E9's
  synchronization lands in 3.1; E12's producer chain is complete via 2.3's IdentifySeries
  pre-write check + 3.4's cmd translation).
- **qa seam coverage: COVERED** — 8 @qa tasks, non-empty `qa:` lists; amendments added
  `TestRegistryConcurrentReadersAndWriter` (under `-race`, in 3.1's duty) and
  `TestIdentifySeriesUnconfiguredWritesNothing` (2.3), so the registry-concurrency and
  series-identify-unconfigured seams now carry named tests on both sides.
- **Complexity/blast radius: CLEAN** — the amendments' two new surfaces checked: the Registry
  RWMutex adds RLock to the enumerated reader set (cmd main.go:449/:1130/:1335; enrich
  queue.go:450/:463/:735) with behavior unchanged; the cmd closure translation is branch-scoped
  to the unconfigured sentinel so all existing passthroughs (ErrNoRows→404,
  ErrSearchUnsupported→400, unknown-plugin→400, raw→500/502) stay byte-identical.
- Zero-UI-cost claim verified against the live tree (Synopsis.tsx / InfoColumn.tsx /
  api.ts:189-216 / Plugins.tsx field-driven render); the amended per-binding aggregate field is
  additive and covered by 5.2's regen.

## Per-question resolution verdicts (all RESOLVED-BY-AMENDMENT)

- **Q1 Registry concurrency — RESOLVED, holds.** 3.1 lands the Registry's first synchronization
  (RWMutex or snapshot swap guarding ordered/byID across Get/List AND the write) + the `-race`
  concurrent-readers-plus-writer proof in the duty itself (tasks.md:40-41; design.md:20/:62).
  Verified the hazard is real on the live tree (registry.go:237-240 lock-free today).
- **Q2 seriesIdentify producer — RESOLVED, holds.** 2.3's IdentifySeries pre-write check produces
  the enrich sentinel before ANY write (`TestIdentifySeriesUnconfiguredWritesNothing`,
  tasks.md:33-34; D3 design.md:48); the producer→translator→classifier chain is complete through
  newIdentifyClosure (3.4) → seriesIdentify 503. The async delta's requirement sentence
  (spec.md:17) needed no further change.
- **Q3 sentinel placement under INV2 — RESOLVED, holds.** Enrich-side sentinel declared in 2.3,
  api-local twin + cmd `%w` translation in 3.4, same translation in 4.3's closure at
  construction; 3.4's duty greps the translation into cmd (tasks.md:46-47). Citations
  `main.go:1153/:1158/:1172` verified EXACT. One grounding correction: the identify-side `%w`
  pattern is `main.go:1178`, not the amended ":1181" — off-by-3 digit, same closure and
  mechanism; not a contradiction.
- **Q4 verdict granularity — RESOLVED, holds.** 3.3 per-binding verdicts keyed by module_id +
  `RequiredSecretsStatus(moduleID, pluginID) → name→provided` (tasks.md:44); plugin-admin delta
  reworded with the two-modules-disagree scenario and "a plugin row itself carries NO single
  provided verdict" (specs/plugin-admin/spec.md:31-47); design.md:63/:71 carry the same law.
  `plugin_admin.go:30` citation exact.

## Waiver list

Empty — nothing waived.

## Question frontier state

**EMPTY** — no open questions after amendment round 1; the re-run surfaced no new contradictions.
Ready for GATE 1 approval. If further amendments land, the surveyor re-runs once per round.
