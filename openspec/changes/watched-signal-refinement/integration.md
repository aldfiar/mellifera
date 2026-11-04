# Integration Audit — watched-signal-refinement

Propose-phase survey (@wf-surveyor), 2026-11-04; **amendment rounds 1 and 2 re-run
the same day** (Q1–Q3 resolved in round 1; Q4 resolved in round 2 — see §3/§4).
Grounded against the live source map
(`MAP: 9949db0`, CURRENCY: CURRENT) + live source grep (the map is regex-floor for
tsx/css — def/caller queries return nothing; every fact below carries a `file:line`
citation). Worktree: `feature/watched-signal-refinement` @ 9949db0.

Verdict in one line: **the question frontier is CLOSED — Q1–Q4 resolved by amendment
(rounds 1–2), zero open questions; the plan wires shut. N1 remains as gate-time
reviewer guidance, not a question.**

## 1. The graph

### Nodes (planned surface, grounded)

| Node | Task | Grounding |
|---|---|---|
| `WatchedToggle` rewrite (glyph body, one carrier form, no inline styles, no `placement`, state classes) | 1.1 | `web/src/components/WatchedStates.tsx:102-141` — props incl. `placement?` :105, `corner` :108, style object :110-125, conditional carrier :129, word span :138 |
| `WATCHED_ACCENT` const dies (literal re-lands in CSS) | 1.1 | :10 (def), :120 (use); `.watched-mark` precedent carries the same token `index.css:285-290` |
| `WatchedStates.test.tsx` — three sequential pin families | 1.1 → 2.2 → 3.1 | four `textContent` pins :252/:281/:440/:611; inline pins :259-267/:283-292; click contract :310-369; stylesheet sweep :371-401; consumer describes :403/:470/:507; heading describe :563-645; class pins :255/:619/:643 — every line citation in tasks.md verified |
| ItemDetail heading mount (dead arg + comment sweep) | 2.1 | `ItemDetail.tsx:1256-1265` (toggle tag :1261, `placement="inline"` :1264); **zero** `cardact-host` hits in file (D1 structural claim verified); holding pins `ItemDetail.test.tsx:1857-1887` |
| MovieCard mount restructure (chrome→host, meta row) | 2.2 | `Collection.tsx:1177-1289` — host div :1231, toggle :1239, Link chrome :1243 (`rounded-md border p-3 hover:bg-accent`), meta span :1265-1267, bar :1268 |
| ItemGrid mount restructure | 2.2 | `Collection.tsx:1843-1912` — li :1877 (`cardact-host relative`, no flex — hence 2.2's `flex flex-col` addition), toggle :1878, Link chrome :1886, chips row :1897-1900 stays in Link, bar :1901-1903 |
| index.css ONE appended block (row rule, state colors, D3 hover pair, D4 visibility block — state-scoped per the amendment) | 3.1 | cardact section :495-611: base :503-522 (opacity 0 at rest, 28px box), reveal :523-527 (`0,3,0`), hover :528-531 (background AND color, `0,2,0`), coarse :542-548 (opacity 1 + 40px, `0,1,0`), `--inline` :555-559 (static/opacity 1, `0,1,0`); tv clamp :778-782 (`html.tv .cardact-trigger`, `0,1,1`) |
| `tvCssContract.test.ts` — pinned untouched | 3.1 verify | slices strictly between the tv-mode markers (`tvCssContract.test.ts:26-30`); the appended block lands after the cardact section, outside the sweep |
| `Collection.test.tsx` / `ItemDetail.test.tsx` — pinned untouched | 2.1/2.2 verify | the four `line-clamp-2` className pins target inner spans/heading, never the Link (`Collection.test.tsx:2943/:2979/:3008/:3034`); :2239 filters `cardact-sentinel` (CardActions' own DOM, untouched) |
| dist regen + residual sweep | 4.1 | `internal/web/web.go:21` `//go:embed all:dist`; Makefile:72 `web-build`; the 4.1 negative grep verified today: **exactly** the four pins 1.1 flips, nothing else under `web/src` |

### Edges (planned relations, grounded)

1. **1.1 → 2.1** placement deletion → dead-arg drop. `placement` passed by exactly one production site (`ItemDetail.tsx:1264`); Collection.tsx passes none (:1239/:1878 bare).
2. **1.1 → 2.2, 3.1** class-list contract: `cardact-trigger cardact-trigger--inline wtoggle--watched|unwatched`, `<span aria-hidden="true">✓</span>`, zero inline styles (Interfaces #1).
3. **1.1 → 3.1** `WATCHED_ACCENT` dies; `#a4c8f4` re-lands in `.wtoggle--watched`.
4. **2.2 → 3.1** meta-row DOM contract: `host > [Link] + .card-meta-row > [meta?][bar?] + toggle` (Interfaces #2); row rule + `> .cardact-trigger { margin-left: auto }` land in 3.1; EpisodesView's episode cards inherit via `EpisodeCard → MovieCard` (`Collection.tsx:1818/:1827`).
5. **1.1 → 2.2 → 3.1** test-file handoff: three disjoint, additive pin families (Interfaces #4); click contract :310-369 and :371-401 never edited.
6. **3.1 → untouched-CSS proof**: zero-edits law + `:380`/`:396` sweep pins + tvCssContract text pin.
7. **Component → live wiring preserved**: aria pair, `aria-pressed`, `PUT /items/{id}/state`, stopPropagation-first, five-family invalidation — byte-identical, pinned by the untouched click describe.
8. **Deletion → live CSS restoration**: dropping the inline object re-arms base 28px (:511-512), coarse 40px (:545-546), tv clamp (:780-781), `--inline` static/visible (:555-559 — `position: static` is what makes the toggle a FLOW child in the row at all; the one-carrier form is load-bearing for D6, not just D7).
9. **`--inline` CSS consumer beyond the toggle**: `CardActions triggerClassName` at `ItemDetail.tsx:1432` — covered by the zero-edits law (:555-559 byte-identical).
10. **Dist**: 4.1 regen covers the embed; nothing Go-side keys on SPA internals.

### The post-amendment cascade arithmetic (verified)

With the hide now state-scoped `.card-meta-row .cardact-trigger.wtoggle--unwatched`
(0,3,0), against the untouched rules:

- hide (0,3,0) vs `--inline` opacity:1 (0,1,0): hide wins — unwatched hides at rest in rows. Watched: NO rule matches it — `--inline` opacity:1 holds at rest on every pointer class (D9 implemented). Heading: no `.card-meta-row` ancestor — exempt (D1).
- hide (0,3,0) vs base reveal `.cardact-host:hover .cardact-trigger` (0,3,0): TIE → the hide is appended later → **the hide wins; the base reveal is superseded for unwatched-in-row toggles.** The OWN reveals (state-scoped shape ⇒ ≥0,4,0 with the host prefix or `:focus-visible`) beat the hide outright and fire on exactly the spec's triggers (card hover/focus-within + own keyboard focus). Sound by construction — but this supersession is worth the reviewer's eye at the gate (see N1).
- coarse restore (hide's shape, inside `@media (pointer: coarse)`, later in block): ties the hide, source order wins — persistence restored; sizes keep riding the untouched `:542-548` block (the hide sets no size).
- tv restore (hide's shape under the `html.tv` prefix = 0,4,1): beats the hide outright; clamp sizes keep riding the untouched `:778-782` twin.
- D3 hover pair (0,2,0) vs hide: no property overlap. State colors (0,1,0) vs base color (0,1,0): tie-and-later, same value anyway.

## 2. Check verdicts (post-amendment)

### Wiring coverage — PASS

No orphan nodes: every planned node carries an implementing task edge; every new CSS
selector has a named markup producer (2.2) and vice versa. The cascade block — the
change's central mechanism — is now correctly specified end to end (state-scoped hide,
own reveals restoring both properties, restores in the hide's shape). Mid-loop
unstyled (2.2 → 3.1) and uncolored (1.1 → 3.1) windows are declared and duty-gated by
DOM pins (Interfaces #2), not gaps.

### Shared-file sequencing — PASS

`WatchedStates.test.tsx` is edited by 1.1 → 2.2 → 3.1 in DAG order with disjoint,
additive pin families. 1.1's whole-file vitest run is green at its point: the consumer
describes (:404/:507) key on role names + the four textContent pins it flips — no
Collection DOM pins exist until 2.2 authors them, and Collection.tsx passes no
`placement` arg. The mid-loop `tsc` window (1.1 → 2.1, dead arg at `ItemDetail.tsx:1264`)
is real, bounded to adjacent tasks, vitest-blind, and recorded in design Risks with 4.1
as the only project-wide tsc. 3.1's appended block lands outside the tvCssContract
markers; the `:397` coarse-slice pin reads the FIRST `@media (pointer: coarse)` and is
unaffected by the appended second one. No window found where an earlier task's pins
contradict a later task's edits.

### Blast radius — PASS

Callers ×3 verified (:1239/:1878/:1261); every `placement` reference lands inside a
task's contract; `--inline`'s second consumer (:1432) is protected by zero-edits; the
dist embed is covered by 4.1; the two "never edited" test files verified compatible
pin-by-pin. No edges land in files no task touches — zero hidden scope.

### QA seam coverage — PASS (residue = N1 gate-time guidance only)

No new modules → no `@qa` mandate, correct per the loop rule. The riskiest joints are
covered where jsdom can reach: DOM structure (2.2's consumer pins) and stylesheet TEXT
(3.1's readFileSync pins — the `:371-401` idiom); where jsdom cannot (media queries,
tv), the MANUAL TEST NOTE + gate human pass carries it, per house idiom. The amendments
added the load-bearing pins (watched-no-hide, restore shape + property set,
reveals-restore-both) and Interfaces #4's inventory now lists them all (round 2).
No residual under-pinning; N1 is gate-time eyeball guidance, not a pin gap.

### Spec delta ↔ tasks consistency — PASS

The amendment closed the one hole: "The watched ✓ SHALL be visible at rest on every
pointer class" now has an implementing law (no rule matching the watched state sets
opacity/pointer-events) and a pin. Glyph law, meta-row flow (ItemGrid's missing meta
text is covered by the delta's own empty-meta sentence + design Interface #2), ring
retirement, hit twins (restored by deletion: base :511-512 / coarse :545-546 / tv
:780-781 — sizing needs no new rule; the appended restores carry opacity/pointer-
events persistence), D1 heading exemption (structural, verified), ⋯ law untouched,
CardActions cross-ref, tab-order accepted delta (matches the new DOM order: link →
toggle → ⋯) — all trace to task edits + pins.

## 3. Questions

### Q1 — D4 hide selector omits the D9 state split — **RESOLVED BY AMENDMENT (round 1, 2026-11-04)**

Original finding: the authored hide `.card-meta-row .cardact-trigger` hid BOTH states
at rest on fine pointers, contradicting the spec delta, D9, and the proposal bullet.
Resolution: the hide is now `.card-meta-row .cardact-trigger.wtoggle--unwatched`
(0,3,0) — tasks.md 3.1(d), design.md D4 + Interfaces #3 + the D7+D1 co-resolution all
carry the state-scoped form; the watched-no-hide pin added ("no rule matching
`.wtoggle--watched` sets opacity 0 or pointer-events none"). Verified consistent
across all four artifacts.

### Q2 — restores' selector forms unpinned vs the hide — **RESOLVED BY AMENDMENT (round 1, 2026-11-04)**

Original finding: the appended hide out-ranks the existing coarse (0,1,0) and tv
(0,1,1) restores inside their contexts, and the plan's own restores were unpinned and
presence-pinned only. Resolution: both restores are now authored in the hide's
selector shape (coarse: tie-and-later; tv: `html.tv`-prefixed, 0,4,1 — beats outright),
with the correct rationale ("the EXISTING coarse restore at 0,1,0 loses to the 0,3,0
hide regardless of media queries") and the sizing correctly kept on the untouched
existing blocks; the restore-shape pin added. Residual: the restores' pointer-events
leg is stated in prose (Interfaces #3 "restoring opacity + pointer-events
persistence"; the coarse parenthetical "opacity 1 + pointer-events auto") but asserted
by no pin — folded into Q4.

### Q3 — wrong stated reason for the own reveal selectors — **RESOLVED BY AMENDMENT (round 1, 2026-11-04)**

Original finding: "the appended hide ties with the base reveal at equal specificity"
was false (0,2,0 vs 0,3,0), and the real gap was pointer-events, not opacity.
Resolution: the false sentence is gone; D4 + tasks.md 3.1(d) now state the corrected
rationale ("the base reveal ... sets opacity ONLY — never pointer-events — so a
hover-revealed toggle would stay visible but unclickable") and the reveals-restore-
BOTH pin added. Note the arithmetic has since FLIPPED with the state-scoping: the hide
(0,3,0) now genuinely ties the base reveal (0,3,0) and, appended later, wins — the
base reveal is superseded for unwatched-in-row toggles and the own reveals (≥0,4,0 by
shape) are the operative reveal path. The construction is sound; see N1.

### Q4 — Interfaces #4's pin inventory omits one authored pin; the restores' pointer-events leg is unasserted — **RESOLVED BY AMENDMENT (round 2, 2026-11-04)**

Original finding (P3, documentation completeness): design.md Interfaces #4 listed
3.1's pin family as six items, omitting the reveals-restore-BOTH pin that tasks.md 3.1
authors and design.md D4 marks "(pinned)"; and no pin asserted each restore's
`pointer-events: auto` leg (Interfaces #3 carried it in prose only — an opacity-only
restore would pass every pin while leaving the unwatched toggle visible-but-untappable
at rest; TV Chrome reports pointer: fine — `index.css:773-775` — so the tv restore is
the operative one there).
Resolution (both recommended one-line fixes applied, verified on disk): Interfaces #4
now lists "the reveals restoring BOTH opacity 1 AND pointer-events auto" between the
watched-no-hide and restores clauses — the inventory matches tasks.md 3.1's authored
pin family item for item; and tasks.md 3.1's restore-shape pin now asserts "each
restore carries the `.card-meta-row` state-scoped shape AND its body sets BOTH
`opacity: 1` AND `pointer-events: auto`", with the TV-Chrome-reports-pointer-fine
rationale stated in the pin's own parenthetical.

### N1 — apply-time note (not a question)

The base reveal (`index.css:523-527`) is superseded for unwatched-in-row toggles by
the appended hide (tie at 0,3,0, later wins). Expected and harmless — the own reveals
fire on the same triggers — but the reviewer should eyeball at the gate that the
authored reveals land at ≥0,4,0 (state-scoped + host prefix / `:focus-visible`), not
at a bare 0,3,0 placed before the hide. The house MANUAL TEST NOTE on the visibility
block covers the visual confirmation.

## 4. Resolutions

- **2026-11-04, amendment round 1 (pre-GATE 1):** Q1, Q2, Q3 resolved by amendment —
  @wf-planner applied the surveyor's recommended answers; design.md (D4, Interfaces
  #3, #4, D7+D1 co-resolution) and tasks.md 3.1(d) rewritten; spec delta unchanged;
  `openspec validate --strict` rc 0 (per the coordinating session). Surveyor re-ran
  the survey on the amended plan: resolutions verified against the amended artifacts
  on disk (this file's §3 records the verification). Waived: none.
- **2026-11-04, amendment round 2 (pre-GATE 1):** Q4 resolved by amendment — the two
  recommended one-line fixes applied exactly: Interfaces #4's inventory gained the
  reveals-restore-BOTH clause; tasks.md 3.1's restore-shape pin now asserts the
  state-scoped shape AND both `opacity: 1` + `pointer-events: auto` per restore body,
  with the TV-Chrome-reports-pointer-fine rationale. Verified on disk by the surveyor;
  `openspec validate --strict` rc 0 (per the coordinating session); nothing else
  changed. Waived: none.
- **Frontier status: CLOSED.** Zero open questions at write time. N1 remains as
  gate-time reviewer guidance (the own reveals should land at ≥0,4,0 — eyeball at the
  gate), not a question. The proposal is ready for GATE 1 approval from the
  integration-audit side.
