# integration.md — home-rail integration survey (wf-surveyor, propose step 4)

Surveyed 2026-11-09 against worktree base fa3c254. Trigger: T1 (design.md
exists). Artifacts audited: proposal.md, design.md, specs/ ×3, tasks.md,
tasks/1.1.md, tasks/1.2.md, tasks/2.1.md, plus design inputs
`.tmp/home-rail-series-grain-design.md` (converged, HOLDS-WITH-CHANGES Q1–Q7)
and `.tmp/recs-watched-rail-2026-11-08.md` (diagnosis — both faithfully
carried into the change artifacts; no contradiction found). Read-only audit;
the human decides amend or waive.

## Index anomaly (RECORDED — GATE 2 will hit the same wall)

`wf index build` from the worktree cwd exits ok (551 files, fp=8a4dc6f3, map
at `.tmp/.source_map.json`), but `wf index query stats` reports
`symbols=0 | tests=287` — the symbol table is EMPTY. The planner's
observation is confirmed and reproducible after a fresh build. **Fallback
used throughout this audit:** every node/edge below is grounded by grep +
direct source reads with `file:line` citations; no `wf index query
def/callers` results were used (none exist to use). GATE 2's reviewer
re-ground step (`wf index query callers` on removed/renamed symbols) must
fall back to `grep -rnw` the same way; its orphan check is grep-based here.

## The planned graph

### Nodes (grounded; "task" = implementing task, "—" = verified no change needed)

| # | Node | Today | Task |
|---|------|-------|------|
| N1 | `home()` handler | internal/api/home.go:113-145 | 1.2 rewire |
| N2 | `continueRow` + `Current continueCurrent` | home.go:60-77 (field :71) | 1.2 pointer + omitempty |
| N3 | home.go header prose (resume/next contract) | home.go:4-26 | 1.2 rewrite |
| N4 | `homeRows` composer (+ `homeLoad` :150) | home.go:168-201 | 1.2 rework per entity |
| N5 | `homeLibRows` per-library legs (artwork :272-304, storedTitle :338, ep-title :351-359, duration :361, next loop :367-379) | home.go:225-383 | 1.2 re-anchor per entity, legs preserved |
| N6 | `homeNextPick` | home.go:392-411 | — UNCHANGED (D4; signature pinned) |
| N7 | `homeDurationSeconds` | home.go:420-446 | — UNCHANGED |
| N8 | `homeEntities` | NEW | 1.1 |
| N9 | `scoreHomeEntities` | NEW | 1.1 |
| N10 | `orderHomeEntities` | NEW | 1.1 |
| N11 | `scoreProgress` | recs_ordering.go:425-459 | — UNTOUCHED (callers: home.go:126 [removed by 1.2], handlers.go:1039 [/progress, keeps]) |
| N12 | `scoreSeries` | recs_ordering.go:281-308 | — UNTOUCHED; 1.1 adds a caller; existing caller handlers.go:1777 (series grid) unaffected |
| N13 | `scoreItems` | recs_ordering.go:238-264 | — UNTOUCHED; existing callers handlers.go:1134/:1337, recs_ordering.go:453 unaffected |
| N14 | `recsFactsFor` | recs_ordering.go:104-127 | — UNCHANGED (facts.rows = full positive set) |
| N15 | route registration `r.Get("/home", h.home)` | internal/api/router.go:435 | — UNCHANGED (handler sig holds) |
| N16 | `TestHomeRoute` (6 subtests: :162/:209/:287/:349/:385/:425) + `rowHasDuration` probe :128-142 | home_test.go | 1.1 (new entity subtests) + 1.2 (deref nil-guards + probe extension) |
| N17 | `TestBrowseScaleJoint` — `home_answers_in_one_request` :785-826 (Current derefs :800, :814-817, :823) AND `invisible_library_two_viewers` :834-886 (/home :859-885, Current deref :869, count pins :869/:883) | browse_scale_joint_test.go | 1.2 (file in scope; duty runs the whole function) |
| N18 | openapi artifacts | internal/web/api/openapi.{json,yaml} | 3.1 regen; consumed by internal/web/swagger.go (embeds :14-20; public routes /openapi.yaml, /openapi.json, /docs/*) — bytes-only drift, no edit |
| N19 | embedded dist | internal/web/dist/ (assets/, index.html) | 3.1 regen + commit |
| N20 | `ContinueCurrent`/`ContinueRow` types | web/src/lib/api.ts:1373, :1398-1406 (`current: ContinueCurrent` :1404) | 2.1 → `current?` |
| N21 | `getHome` | api.ts:1419-1421 | — UNCHANGED |
| N22 | `ENDPOINTS.home` | api.ts:1124 | — UNCHANGED (sole consumer: getHome :1420) |
| N23 | `useHome` (keyed ["home"]) | web/src/lib/queries.ts:313-322 | — UNCHANGED |
| N24 | `ContinueRail` shell | web/src/pages/home/Home.tsx:306-330 | — UNCHANGED |
| N25 | `ContinueCard` (five `cur` derefs: :345 display, :347 duration, :360 item_id Link, :371 ep-title, :375 position) | Home.tsx:342-406 | 2.1 branch on `row.current` |
| N26 | React key `row.current.item_id` | Home.tsx:325 | 2.1 → `series_id \|\| current?.item_id` |
| N27 | Home.test.tsx (describe :246+; /home mocks at :183/:259/:356/:426/:486) | Home.test.tsx | 2.1 anchor fixture + key-law pins |

Verified no-consumer surfaces (grepped, zero hits): plugins/, scripts/,
web/e2e (no e2e dir exists), nextup.ts (watch-page derivation, no `/home`
dependency), `ContinueCurrent` outside api.ts, `.Current` derefs outside
home.go non-test Go, `/api/v1/home` outside the files above. Docs mentions
(docs/project_structure.md:388, :484) are recorded docs debt — explicitly
out of this change (proposal Impact; not touched by `make web-build`).

### Edges (planned; kind; grounding)

| # | Edge | Kind | Grounding |
|---|------|------|-----------|
| E1 | router.go:435 → N1 | registration | router.go:435 (holds unchanged) |
| E2 | N1 → N14 `recsFactsFor` | call (unchanged) | home.go:118; recs_ordering.go:104 |
| E3 | N1 → N8/N9/N10 | call (NEW; 1.1 defines, 1.2 consumes) | tasks/1.1.md Handoff ("task 1.2 rewires home() to consume exactly this layer") + design §Interfaces |
| E4 | N9 → N12 `scoreSeries` (eps map UNIONED with touched items) | call (NEW caller) | design D5; recs_ordering.go:281 sig |
| E5 | N9 → N13 `scoreItems` (films) | call (NEW caller) | design D5; recs_ordering.go:238 |
| E6 | N8 → store.GetItem walk + naming.EpisodeFacts + pre-cut store.QueryItemsBySeries | call/data (NEW) | design D7; walk shape = scoreProgress's, recs_ordering.go:429 |
| E7 | N8 → N6 `homeNextPick` (serve-law survival from the SAME pick) | call (NEW caller, sig unchanged) | design D2/D4; home.go:392 |
| E8 | N1 → N4 → N5 | call (reworked; per-library legs preserved) | home.go:139/168/186; design §Interfaces composition |
| E9 | N4/N5 → N6/N7 | call (preserved) | home.go:376, :361 |
| E10 | N2 → wire JSON `/api/v1/home` (`current` ABSENT on anchor rows) | wire (1.2 pins via the :128 probe extended to the current block) | tasks/1.2 done-when; home_test.go:135 |
| E11 | 3.1 swag regen → N18 → swagger.go embed/serve | artifact flow (content-only) | Makefile:73-75 (`-ot json,yaml`, mv renames — exactly two files); internal/web/swagger.go:14-33 |
| E12 | 3.1 npm build (tsc-gated) → N19 dist | artifact flow | Makefile:72-76 |
| E13 | N21 getHome → N22 → `/api/v1/home` | call (unchanged) | api.ts:1420/:1124 |
| E14 | N23 useHome → N21 | call (unchanged) | queries.ts:319-322 |
| E15 | N24 → N23; N25 branches on `row.current` | render (2.1) | Home.tsx:307, :344 |
| E16 | N20 `current?` ← mirror of home.go:71 | type mirror (2.1; hand-mirrored, "drift = bug") | api.ts:1404 ↔ home.go:71 |
| E17 | N27 fixtures ← mirror of 1.2 wire shapes | test mirror (2.1; the REVIEW seam — tasks/2.1.md Handoff names the 1:1 field-presence mirror) |
| E18 | N8/N9/N10 carried state (started-max, resume-max row, max updated_at, film-fallback flag, served flag) ↔ design §Interfaces | data contract | tasks/1.1.md Handoff ("change it only together with that section") |

## Check 1 — Wiring coverage: **COVERED (frontier empty)**

Every node carries an implementing task or is verified no-change-needed;
no orphan nodes (both new functions N8-N10 are consumed by 1.2's rewire —
E3 — and the layer contract is pinned by the six-slot handoff + design
§Interfaces). Every consumer of every touched surface is enumerated above
and none is wired-but-untasked: the only Go consumers of the wire struct
are home.go + the two test files (grep: `.Current` outside home.go
non-test = zero hits; `continueCurrent` outside home.go = zero hits); the
only SPA consumers are api.ts/queries.ts/Home.tsx/Home.test.tsx
(`ENDPOINTS.home` sole consumer getHome; `/api/v1/home` in no other web
file); no plugins/scripts/e2e consumers exist; router.go needs no edit;
`useHome`/`getHome` are shape-compatible (the `continue` array carries
fewer, optional-`current` rows) and take no edit. `/progress` keeps its
composition byte-for-byte (handlers.go:1032-1060 — `withdrawWatched` then
`scoreProgress` at :1039, both untouched). The locked web-ui behavior
("a fully-watched series still surfaces its next unwatched episode") is
carried by the web-ui delta's anchor scenarios (:87-95, :171-178). **No
numbered questions from this lens.**

## Check 2 — QA seam coverage: **BOTH SIDES PINNED AT THE RIGHT JOINT; the cross-side joint itself is review-time → Q1**

The seam's three halves: (a) wire JSON with `current` absent — pinned
Go-side by 1.2's omitempty probe (home_test.go:128-142 `rowHasDuration`
extended to the current block; nil-map read makes the extension safe) plus
the route-level anchor pins; (b) TS optional type — `current?` (2.1) +
`tsc --noEmit` across the whole SPA in 2.1's duty (verified sufficient:
`ContinueCurrent` is referenced only in api.ts; `row.current` is derefed
only at Home.tsx:325/:344 — zero other sites exist to catch); (c) client
branch — 2.1's anchor fixture + key-law cases. What NO automated test
does is cross the seam: nothing asserts that what the Go route marshals
for an anchor row equals what the TS fixture feeds the client — that
agreement rides the hand-mirror law (api.ts is hand-mirrored, "drift =
bug"), 1.2's `audit: true` wire-contract prose at the gate, 2.1's handoff
note naming the 1:1 field-presence mirror as "the review seam", and GATE 2
re-running both sides. 2.1 carries no `@qa`/`qa:` annotation (it is not a
new-module task, so the strict-lane mandate does not mechanically fire),
and the repo has no e2e tier to host a joint test (no web/e2e dir;
browse-scale set this exact dual-side precedent for this same rail). This
is the ONE integration joint not closed by a single runnable artifact →
**Q1** below. The secondary joint (anchor rows must carry non-empty
`series_id` for the key law) is pinned server-side by 1.2's anchor pins
("series fields + artwork + next present") and client-side by 2.1's
key-law cases — same seam, same answer.

## Check 3 — Complexity / blast radius: **CONTAINED**

- Edges per module: internal/api carries the rewrite (home.go densest —
  composer + wire + header; entity helpers beside the scorers); web edits
  confined to api.ts + Home.tsx + Home.test.tsx. No new modules, no new
  deps, no migrations (matches proposal Impact).
- `go test ./...` (GATE 2) forecast: the ONLY Go files referencing the
  route/struct are home_test.go and browse_scale_joint_test.go (grep over
  all of internal/ `*_test.go` — exactly two hits). Both are named by 1.2's
  duty pattern. Existing fixtures are progress-only (no ledger writes in
  the home or joint fixtures — no ApplyWatched/PutWatched hits), so every
  existing row keeps `Current` non-nil: no silent nil panic in unedited
  assertions. The joint fixture's row counts survive entity grain (libFix's
  aria rows = ONE series entity → 1 card; libDeny's hidden = 1 card; total
  2 — matches the :796/:883 pins). The planner's "6 TestHomeRoute
  subtests" count VERIFIED (:162/:209/:287/:349/:385/:425; the :287
  next-pick subtest calls `homeNextPick` directly and never touches
  Current). `recs_ordering_test.go` is reused (seedRecsSeries/seedRecsItem)
  but needs no edit. No other package moves.
- Full vitest (GATE 2) forecast: only Home.test.tsx touches the rail (the
  only test importing ContinueRow/getHome; its other /home mocks at
  :183/:356/:426/:486 serve `current`-carrying or empty fixtures and stay
  green under the optional type). 2.1's `tsc --noEmit` duty is
  whole-tree — sufficient per the zero-other-derefs grep.
- swag regen drift: `make web-build`'s swag leg writes EXACTLY
  internal/web/api/openapi.{json,yaml} (Makefile:73-75 — `-ot json,yaml`,
  then the two mv renames; no docs.go emitted). `docs/` is not touched by
  `make web-build` — the api-reference debt stays out, as proposal Impact
  records. swagger.go consumes the bytes without edits. dist regen
  rewrites internal/web/dist/assets/* + index.html (committed) — the
  proposal's "internal/web/dist/*" phrasing is honest about the multi-file
  artifact.
- Hidden-scope check: no edge lands in a file no task touches. The one
  under-listing: 1.2's context pointers cite the joint deref singularly
  (:785/:800) while the file also derefs Current at :869 and pins /home
  counts in a second subtest (:834-886) — duty-covered (the `-run`
  pattern runs the whole function; the file is in 1.2's scope) → **Q2**.

## Numbered questions (recommendations — the human decides)

**Q1 — the server↔web anchor-card seam has no automated joint test.**
1.1/1.2 pin the Go side (route + omitempty probe), 2.1 pins the TS side
(optional type + anchor fixture + key law), but no runnable artifact
asserts the two sides describe the SAME anchor-card wire shape; the
agreement is enforced only by the hand-mirror law + review inspection +
the GATE 2 dual re-run.
*Recommended answer:* amend task 2.1 with `@qa` + a two-entry `qa:` list
naming the joint pair, e.g. `qa: internal/api/home_test.go::TestHomeRoute/<anchor subtest>, web/src/pages/home/Home.test.tsx/<anchor-card test>`
— makes the seam register-visible and gives GATE 2 a named re-run pair
without writing any new test. *Alternative:* explicit waive, rationale:
no e2e tier exists in the repo, the dual-side pins + 1.2 `audit: true` +
2.1's 1:1-mirror handoff note + the gate re-run are the browse-scale
precedent this rail already ships under. Either resolution closes the
question; silence at GATE 1 does not.

**Q2 — the joint test's SECOND /home subtest is under-listed in 1.2's
context pointers.** tasks/1.2.md names browse_scale_joint_test.go:785 and
"the TestBrowseScaleJoint deref" (:800), but `invisible_library_two_viewers`
(:834-886) also exercises /home (denied :859-876 leak sweep + count :869;
granted count :883) and derefs Current at :869. No coverage gap — the
duty pattern compiles and runs the whole function and the file is in 1.2's
scope.
*Recommended answer:* no amendment needed; record the second subtest on
GATE 2's re-ground list (it is a deref + row-count site the reviewer must
re-check post-change). Waive-able as-is.

**Observation O1 (not a question — zero integration consequence).**
proposal.md Impact places the "entity walk, entity scoring and ordering"
under home.go AND "entity helpers beside the existing scorers" under
recs_ordering.go; task 1.1 names no target file. Same package either way
(one import graph, one diff). Recommended reading: design §Interfaces
("the entities live in the api package beside the existing scorers") —
recs_ordering.go — and let the coder note the chosen file in the six-slot.

## Human resolutions — amendment round 1 (planner applied, surveyor verified 2026-11-09)

**Q2 — RESOLVED as recommended.** tasks/1.2.md Audit slot (:67-72) now
carries the GATE 2 re-ground sentence with exactly the grounded facts:
invisible_library_two_viewers, browse_scale_joint_test.go:834-886, the
denied viewer's Current deref at :869, the granted viewer's count pin at
:883, plus the body-bytes leak clause. No task or duty change, matching
the recommendation.

**O1 — RESOLVED (binding artifact).** tasks.md task 1.1 (:5) now names the
entity layer's home explicitly: "in internal/api/recs_ordering.go (beside
the existing scorers)" — the recommended reading per design §Interfaces.
Residual noted: proposal.md Impact (:82-84) keeps its older two-placed
phrasing (home.go "entity walk, entity scoring and ordering" +
recs_ordering.go "entity helpers"); home.go remains correctly described as
the rework site for composer/wire/header, the binding task line now pins
recs_ordering.go for the entity layer, and both files are package api —
zero integration consequence. Cosmetic; no further action required.

**Q1 — SEMANTICS MATCH; ENCODING DEVIATES → still OPEN.** The planner
amended task 2.1 exactly as recommended in substance: `@qa` on the task
line (tasks.md:17) and a `qa:` list (tasks.md:20) naming BOTH joint sides,
cross-anchored by name — tasks/1.2.md:41-42 anchors the Go subtest
`watched_series_serves_anchor_card` ("the name the 2.1 qa: joint cites");
tasks/2.1.md:33-36 anchors the exact it() title ("the exact name the
task's qa: joint cites"); tasks/2.1.md Handoff (:64-67) requires both to
exist under those names at the gate. This closes the seam conceptually.

However, the qa: ENCODING will hard-refuse at `wf pipeline register`
(rc 1, naming tasks.md line 20) under the installed register grammar:

- Evidence: `/Users/aldfiar/.claude/tools/wf/pipeline.py:113` —
  `QA_ENTRY_RE = re.compile(r"^tests/\S+::\S+$")`; `:578` — the tasks.md
  grammar parser runs every qa: field line through `_parse_qa`; `:653-658`
  — `_parse_qa` refuses any entry not matching the regex ("not
  tests/...::node-shaped"), naming the line.
- Entry 1 (`internal/api/home_test.go::TestHomeRoute/watched_series_
  serves_anchor_card`) fails the literal `^tests/` prefix (it starts
  `internal/`). The subtest name itself is whitespace-free — only the
  prefix is missing.
- Entry 2 (`web/src/pages/home/Home.test.tsx::renders the anchor card —
  …`) fails the prefix AND the `\S+$` no-whitespace rule (the it() prose
  title carries spaces). NO encoding of that prose title can pass the
  regex — whitespace-free is a hard requirement for the node part.
- The comma-split is safe (no commas inside either name) and `_unquote`
  strips quotes without relaxing the shape (pipeline.py:648-651).
- openspec `validate --strict` does NOT exercise this check — it validates
  the openspec schema, not the wf register grammar — so its rc 0 is real
  but not probative for this line. The grammar is enforced at register,
  i.e. AFTER GATE 1 approval; unfixed, it burns a post-approval amendment
  round (register refuses → fix tasks.md → re-register → re-approve).

*Recommended exact fix (keeps the seam semantics intact, grammar-legal):*

1. Entry 1 → `tests/internal/api/home_test.go::TestHomeRoute/watched_series_serves_anchor_card`
   (add the `tests/` prefix; the grammar's path convention is literal,
   existence is deliberately unchecked — pipeline.py:650).
2. Give the anchor-card it() block a whitespace-free title (e.g.
   `renders-anchor-card-current-absent`), set entry 2 to
   `tests/web/src/pages/home/Home.test.tsx::renders-anchor-card-current-absent`,
   and update tasks/2.1.md's Done-when anchor (:33-36) and the Handoff
   sentence (:64-67) to the same name — so qa:, six-slot, and the actual
   it() stay one name.
3. Re-run openspec validate --strict after the edit (cheap hygiene).

Frontier after round 1: wiring — empty (unchanged); Q2 — resolved; O1 —
resolved; **Q1 — open on encoding only**. Nothing else blocks GATE 1, but
the Q1 re-encoding should land BEFORE approval to avoid reopening the
gate post-register.

## Amendment round 2 (planner re-encoded, surveyor verified 2026-11-09) — Q1 RESOLVED

**Q1 — RESOLVED: encoding fixed, semantics unchanged.** Verified on disk:

- tasks.md:20 now reads `qa:
  tests/internal/api/home_test.go::TestHomeRoute/watched_series_serves_anchor_card,
  tests/web/src/pages/home/Home.test.tsx::renders-anchor-card-current-absent`.
  The surveyor re-ran the EXACT register regex (pipeline.py:113
  `^tests/\S+::\S+$`) against both entries: PASS / PASS. The comma-split
  is safe (one separator comma; no commas inside either name). The `@qa`
  annotation remains on the task line (:17).
- tasks/2.1.md:33-36 — the Done-when bullet anchors the it() title
  `renders-anchor-card-current-absent` with the executor mandate ("MUST
  create the test under this exact it() title"); :67 — the Handoff
  sentence still requires both joint names to exist at the gate. The
  fixture semantics (current absent, series fields + artwork + next, no
  bar/position/Play-into-current) are unchanged from round 1.
- tasks/1.2.md:41-42 — the Go-side anchor `watched_series_serves_anchor_card`
  unchanged (verified round 1).

The server↔web anchor-card seam is now: pinned on both sides at the wire
joint (1.2's omitempty probe + route pins; 2.1's optional type +
whole-tree tsc + anchor fixture + key law), register-visible via the
@qa/qa: joint, with both named tests enforced into existence by the
tasks' duties and re-run by GATE 2. Nothing further required on this
seam.

**FINAL FRONTIER: CLOSED.** Wiring — empty; Q1 resolved (round 2); Q2
resolved (round 1); O1 resolved (round 1). Waivers: none needed. No
unwaived, unimplemented edge remains. The audit imposes nothing further
on GATE 1; the standing obligations are GATE 2's re-ground checklist
(above) and the index-anomaly fallback it documents.
