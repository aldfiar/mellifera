# Gate record — change `design`

## Verdict

- **GATE 2 review (full change): GATE-PASS** — @wf-reviewer, 2026-10-16. All 30 probed scenarios green (`wf change check` re-run twice, uncached); branch diff conforms to the spec deltas; standards axis clean (one P3: stale MoviesBody docstring — fixed post-verdict).
- **Re-gate (post-gate amendment): RE-GATE-PASS** — @wf-reviewer, 2026-10-16. Mechanics green (check rc=0 at 13 done probes; `openspec validate --strict` valid); amendment substance verified (probe id 84a36128157ac9fd independently recomputed; add-chips append-to-END semantics; scoped pill sentence); no regression (delta since the verdict confined to the sanctioned files).
- **UNPROBEABLE scenario** "Coarse pointers see the menu without hover": confirmed by inspection (web/src/styles/index.css:492-507 + the MANUAL TEST NOTE in the CSS comment). Box 1.4 remains unticked — the installed wf build has no tick path for `[unprobeable]` boxes; the user approved gate-inspection acceptance as the disposition.

## Human dispositions (2026-10-16)

- **FLAG 1 — Identify attach affordance**: FIXED via amendment. Box 2.4 + scenario "Tapping an add chip appends the parser to the draft" (probe 84a36128157ac9fd); commit 360bbba; dist regen d16ffd2 (box 4.1's canonical output). GATE 1 re-approval granted in the same disposition.
- **FLAG 2 — lifecycle-pill sentence breadth**: SCOPED. The delta sentence now binds menu-bearing/series/episode cards only; the generic ItemGrid status chip (pre-existing, untouched) is no longer contradicted.
- **Pre-existing itest repair** (user-approved, out of change scope): three scrub-orphaned additive-proto baseline pins re-pinned to the post-scrub tree (58a1130/7bcc6c9/e2a7562 → cf9b47c; commits fab6b…/450f8c8). Main's suite fails identically until this branch merges.

## Archive approval

- Archive approved by the user (2026-10-16): dispositions for FLAG 1 and FLAG 2 answered in-session together with explicit approval of `openspec archive design --yes` once the re-gate returned PASS and the check stayed green.
