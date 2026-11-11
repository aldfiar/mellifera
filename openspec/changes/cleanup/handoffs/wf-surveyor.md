# Handoff — wf-surveyor → wf-reviewer · change `cleanup`

Updated 2026-11-11 AFTER amendment round 2 (confirmation pass run ONCE per round per
the amendment-round rule; every resolution verified against the amended text, not the
planner's summary). Evidence: `openspec/changes/cleanup/integration.md` (round-0 graph
+ grep trace in §1–§2; Q1–Q11 statements in §3; per-round resolutions in §5) — this
record is belief; read integration.md before the gate.

## VERDICT: question frontier EMPTY after round 2

All questions resolved in the amended text; no new questions introduced by round 2;
waiver list empty. GATE 1 may present the proposal for approval.

- **Round 1 (Q1–Q8):** all RESOLVED — 1.3 re-anchored to `ItemTags serves` (unique at
  base :503); 2.1's canonical pinned as the literal "ERROR-FLOOR LAW:" bullet in
  store/doc.go `# Invariants` with 7.1's duty grepping the anchor; 1.2 re-anchored to
  file-wide `MAY NOT` (unique at base :117, real red-at-base rung); design map gained
  store/relayjobs.go (2.1 → 5.2); 8.1 owns the integration_async_test.go:15 reword
  (duty grep red at base :15); 7.1's verify widened with 12 per-file INV greps (all 12
  gated files verified INV-carrying at base; browse/identity/access correctly
  ungated) + INV5 + seam names + the ERROR-FLOOR LAW anchor. Q3 partially resolved
  (handlers.go:639 → 4.1 contract; facets.go → 4.2) with the playback leg broken → Q9.
- **Round 2 (Q9–Q11):** all RESOLVED —
  - **Q9:** 3.1's viewer-scope clause struck (tasks.md:31 back to pure cmd scope; zero
    3.1/viewer-scope coupling remains anywhere); internal/api/playback.go owned by 4.2
    with the correct FOUR sites (:97/:114/:173/:203) in prose AND duty gofmt list;
    tasks/4.1.md cross-reference fixed ("belong to 4.2 (internal/api/playback.go's
    four sites …, facets.go)"); design.md splits playback by package (cmd side → 3.1,
    api side → 4.2). This completes Q3 — every viewer-scope site has an owning task
    with duty coverage. Collision sweep clean: group-4 internal sets disjoint (4.1 =
    router+handlers; 4.2's additions are facets+playback only), no other task touches
    either file.
  - **Q10:** tasks.md:48 byte-matches tasks/5.1.md's contract Duty (both gofmt
    internal/stream/classification.go); acceptance reads "four files". The
    register-derived duty now covers classification.go's formatting.
  - **Q11:** 2.1's prose carries the whole-file affirmative-phrasing law ("after 2.1
    no 'MAY NOT' survives anywhere in store/doc.go — 1.2's file-wide negative grep
    must hold at GATE 2"). Direction chain verified: 1.2 red at base (:117 sole
    occurrence) → green post-1.2 → stays green post-2.1 → 7.1 deletes only;
    store/doc.go is written by exactly 1.2/2.1/7.1, so no other new-text path exists.

## Notes for the reviewer's gate re-check

- Re-run every duty per cmd-match green: the amended duties (1.2, 1.3, 7.1, 8.1,
  4.2's widened gofmt list, 5.1's synced list) are the ones the register derives from
  the CURRENT tasks.md — no receipts exist pre-register, so there is no stale-green
  risk at register time.
- The textual keep-laws now mechanically guarded at 7.1: 12 INV registries + INV5 +
  internal/access + internal/relay + ERROR-FLOOR LAW. At GATE 2 every one of those
  greps must pass (all verified passing at their group positions in the plan).
- Known out-of-pipeline residue: docs/project_structure.md:687 enumerates the two
  deleted stub filenames — the @wf-docs close step owns it (not a task; Q7's in-change
  half, integration_async_test.go:15, is owned by 8.1).
- Audit model files (fsnotify.go, browse/search.go, web/swagger.go — do NOT trim)
  remain absent from every scope list including the amended ones. Verified.
- Per-file canonical model for the viewer-scope family (one canonical statement per
  file, one-line pointers at that file's remaining sites — handlers.go:639,
  facets.go, api/playback.go ×4→1): a deliberate round-1/2 design trade-off recorded
  in integration.md §3 Q9 context; not a defect, but the reviewer should expect FOUR
  surviving canonical statements across the family, not one repo-wide.
