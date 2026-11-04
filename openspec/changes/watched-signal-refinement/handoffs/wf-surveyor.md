# Handoff — wf-surveyor → wf-reviewer (watched-signal-refinement)

Written 2026-11-04 at propose phase; **updated after amendment rounds 1 and 2 the same
day** (latest-wins — this record reflects the CLOSED-FRONTIER state). The evidence
lives in `openspec/changes/watched-signal-refinement/integration.md` (graph, per-check
verdicts, grounding citations, the amendment record) — this record is belief; read
the audit file and the artifacts before trusting anything here. Grounded against map
`MAP: 9949db0, CURRENCY: CURRENT` + live-source grep.

## Audit summary (frontier CLOSED)

Graph: 11 nodes, 14 planned edge families, all grounded (no UNVERIFIED nodes). The
central mechanism (one carrier form `cardact-trigger cardact-trigger--inline` +
context-scoped, STATE-scoped visibility) is internally consistent across design.md
D4/D7+D1/D9, Interfaces #1–#4, tasks 1.1/2.1/2.2/3.1, and the spec delta.

**Q1–Q4 ALL RESOLVED BY AMENDMENT (rounds 1–2, verified against disk):**

- **Q1 (round 1)** — the hide is now `.card-meta-row .cardact-trigger.wtoggle--unwatched`
  (0,3,0); the watched ✓ carries NO hide-at-rest rule and the watched-no-hide pin
  exists. D9/spec now implemented.
- **Q2 (round 1)** — the coarse/tv restores are authored in the hide's selector shape
  (coarse tie-and-later; tv `html.tv`-prefixed 0,4,1 beats outright), with the correct
  existing-restores-lose rationale and sizing kept on the untouched blocks.
- **Q3 (round 1)** — the false "ties with the base reveal" sentence is gone; the
  corrected pointer-events rationale is in D4 + tasks 3.1(d); reveals-restore-BOTH pin
  exists.
- **Q4 (round 2)** — Interfaces #4's inventory now lists "the reveals restoring BOTH
  opacity 1 AND pointer-events auto" (verified between the watched-no-hide and
  restores clauses); tasks.md 3.1's restore-shape pin now asserts the state-scoped
  shape AND both `opacity: 1` + `pointer-events: auto` per restore body, with the
  TV-Chrome-reports-pointer-fine rationale in the pin's parenthetical. Inventory
  matches tasks 3.1's authored pin family item for item.

**New arithmetic the amendments created (verified sound, worth your gate eye — N1):**
the state-scoped hide (0,3,0) TIES the base reveal `.cardact-host:hover
.cardact-trigger` (0,3,0) and, appended later, WINS — the base reveal is superseded
for unwatched-in-row toggles; the OWN reveals (state-scoped shape ⇒ ≥0,4,0) are the
operative reveal path and fire on exactly the spec's triggers. Confirm at the gate
that the authored reveals land at ≥0,4,0, not a bare 0,3,0 placed before the hide.

## Checks (final)

- Wiring coverage: PASS (cascade block correctly specified end to end).
- Shared-file sequencing: PASS (three additive pin families; tsc window bounded +
  recorded; tvCssContract markers safe).
- Blast radius: PASS (callers ×3 verified Collection.tsx:1239/:1878,
  ItemDetail.tsx:1261; `--inline`'s second consumer ItemDetail.tsx:1432 protected by
  zero-edits; dist via `//go:embed all:dist` + 4.1 regen; both "never edited" test
  files verified pin-by-pin).
- QA seam coverage: PASS — no residual under-pinning; N1 is gate-time guidance only.
- Spec delta ↔ tasks: PASS (all SHALL sentences trace to task edits + pins).

## Open at write time

NONE — the question frontier is closed. N1 (reveal specificity eyeball at the gate)
is reviewer guidance, not a question.

## Waiver list

None — no waivers granted at any round; every question closed by amendment.

## For your gate re-check (GATE 2)

Re-ground every planned edge against the post-change map per integration.md §1;
specifically: (a) the visibility block's final selectors — hide state-scoped,
reveals ≥0,4,0 restoring BOTH properties (N1), restores in the hide's shape carrying
both `opacity: 1` and `pointer-events: auto` (now pin-covered); (b) the
watched-at-rest behavior per D9; (c) the appended block outside the tv-mode markers
(tvCssContract green); (d) the four flipped textContent pins and zero surviving
`toBe("watched")`/`getByText("watched")` forms (4.1's grep); (e) the orphan check —
the ⋯ CardActions law pins (:380/:396) and the `--inline` rule still byte-identical
for ItemDetail.tsx:1432's sake.
