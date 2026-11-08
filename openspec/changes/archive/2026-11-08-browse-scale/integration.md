# Integration audit — browse-scale

Surveyor: wf-surveyor · dispatched under openspec-loop (§Propose step 4)
Surveyed at: **211665a** (PR #31, l6-accounts) · source map: CURRENT at 211665a (fp=234bf79a)
Artifacts audited: proposal.md, design.md, tasks.md (6 groups / 18 tasks), specs/ deltas
(global-search, home-continue, library-facets, recommendation-sorting, web-ui)

Method note: the live map at HEAD carries file membership only (`stats`: files=520,
`symbols=0` — this install's backend extracts no symbol rows), so symbol-level grounding
was done by direct live-source reads per the code-search miss protocol (G1/G2, lost
precision noted); every fact below cites `file:line` at HEAD. Artifacts were authored
2026-11-03 against ~6c89cb9; main moved 174 commits since — the audit is the
authored-then-drifted check.

---

## 1. The planned integration graph

### Nodes

Planned-new (verified absent from disk — not yet built):
- `internal/naming` — the composer core (tasks 1.1/1.2)
- `internal/browse` — RAM read model (tasks 2.1–2.3)
- `web/src/components/SearchPalette.tsx` (5.1), `web/src/components/FacetChips.tsx` (5.2)

Planned-touched (all verified present at HEAD):
- `internal/api/display.go` (578 lines; composer + `namerFor` :107 + `elementTemplate` :151
  + `withSeriesOverride` :476)
- `internal/api/metadata.go` (167 lines; `metadataFor` :40, `aboutBlock` :109 — design's
  line refs still exact here)
- `internal/api/recs_ordering.go` (rec-sorting, shipped 81bc6f0 — consumed by 3.3,
  touched by the extraction; see F1)
- `internal/api/handlers.go` (DTO seam `Metadata:` stamps :2059/:2132; `titleSourceBinding`
  :180; poke sites putItemTitle/deleteItemTitle per router :448-449, identify route in the
  wire + `Deps.IdentifySeries` :108)
- `internal/api/router.go` (Deps struct; browse group :334-336; OnProgress :77;
  OnSourceGateChanged :146; `Identity *identity.Service` :232 — l6-accounts D9)
- `cmd/mellifera/main.go` + `cmd/mellifera/janitor.go` (registry :11-23 now carries the
  rec-sorting-era `wake` field; tasks registered :528-536; `jan.runBoot` :547 runs before
  handler/server construction :551-558 — boot-warm pre-serve precedent intact)
- `internal/store/open.go` (`display_title` generated column :82), `internal/store/series.go`
  (`QueryItemsBySeries` :205, `queryItemsBySeriesDirectory` :223 — the substr prefix scan,
  drifted from the design's :188-193 but intact)
- `web/src/pages/home/Home.tsx` (the home surface — note the path is `pages/home/Home.tsx`;
  tasks.md says just "Home.tsx"), `web/src/lib/nextup.ts`, `web/src/lib/api.ts`,
  `web/src/lib/queries.ts`
- `internal/web/api/openapi.json` + embedded dist (6.1 — `/search`, `/facets`, `/home`
  currently absent, grep count 0: the 6.1 greps are red until regen, correct posture)
- `GLOSSARY.md` (6.2 — the three entries currently absent, correct)
- Boundary nodes: `internal/store` (READ-ONLY constraint), `internal/enrich` (its private
  `episodeFacts` duplicate, now at `episode_titles.go:209`, stays — non-goal holds),
  `internal/access` (consumed — see F3/Q2)

### Edges (each grounded at HEAD)

| # | Edge | Task | Grounding at HEAD |
|---|---|---|---|
| E1 | display.go composer core → moves to `internal/naming`; `titleSourceBinding` becomes alias | 1.1 | all 18 listed symbols exist in display.go (`seriesName` :176 … `intField` :568); `titleSourceBinding` handlers.go :180; golden pin `TestGoldenTitleVectors` golden_title_vectors_test.go:131 |
| E2 | metadata.go projection → moves to naming; About DTO seam keeps calling it | 1.2 | `metadataFor` :40, `aboutBlock` :109, call sites handlers.go:2059/:2132; pin `TestMetadataProjection` metadata_test.go:22 |
| E3 | naming → store (row types only; dependency direction api→naming→store) | 1.1 | store types consumed as values; note store methods now take `access.Viewer` (F3) |
| E4 | browse imports nothing internal — cmd-built Deps closures | 2.1–2.3 | design D2; package absent (correct) |
| E5 | GET /search handler → browse serve closures via api.Deps | 3.1 | browse group mount point router.go :334-336 |
| E6 | GET /libraries/{id}/facets + genre/kind/status params on /series, /items | 3.2 | `/series` :364, `/items` :345; in-Go filter precedent `allFilteredItems(ctx, v, …)` recs_ordering.go:196 |
| E7 | GET /home orders by the recs score seam | 3.3 | `scoreProgress(ctx, v access.Viewer, …)` :480, `orderByScoreRecency` :458, `scoredServe[T]` :402 — the seam exists (rec-sorting shipped) |
| E8 | /home + /search compose names live through `namerFor` | 3.1/3.3 | `namerFor(ctx, libraryID, mutes)` display.go:107 — signature now carries l6-accounts' mutes param (F3) |
| E9 | /home next pick — tuple parity with the watch page derivation | 3.3 | store prefix scan series.go :205-:228; client twin `nextEpisodeAfter` nextup.ts:215 |
| E10 | `Deps.OnTitleChange` nil-safe closure fired on title-override PUT+DELETE and identify | 3.4 | idiom precedents OnProgress :67-77, OnSourceGateChanged :137-146; routes :448-449 (+ series title + identify routes in the wire) |
| E11 | cmd janitor task `browse` (boot-warm + 60 s tick, interval≤0 disables) | 3.5 | registry janitor.go :11-23; boot order main.go :547→:551; recs task precedent with wake main.go :536 |
| E12 | scan-complete fan-out wake to browse | 3.5 | `janitorTask.wake` field exists FIRST-CLASS since rec-sorting (janitor.go :18-23) — simpler than design D4 assumed (verified-consistent) |
| E13 | gate-flip poke beside OnSourceGateChanged | 3.5 | seam :146 intact |
| E14 | browse + naming Deps closures into api.New | 3.5 | api.Deps closure-field idiom, router.go :29-:232 |
| E15 | three new routes mount in the browse group (admin+client) | 3.1–3.3 | `requireRole(RoleAdmin, RoleClient)` :336 — l6-accounts did NOT reshape the groups; viewer threading is per-handler (verified-consistent) |
| E16 | SearchPalette → GET /search typed call | 5.1 | web/src/lib/api.ts exists; DialogShell.tsx exists |
| E17 | FacetChips → /facets + filter params | 5.2 | — |
| E18 | Home.tsx → single GET /home request; deletes the client derivation | 5.3 | Home.tsx :30-32 imports nextUpEntries/seriesKey/startedSeries; `module_id === "tv"` gate at nextup.ts:108 — still the ONLY production site (design's uniqueness claim holds) |
| E19 | nextup.ts trim — remove startedSeries/nextUpEntries/seriesKey | 5.4 | production consumers at HEAD: Home.tsx only (removed by 5.3) + nextup.test.ts + Home.test.tsx:12-13 (the "their tests"); keep-side consumers InfoColumn.tsx:7, AutoNext.tsx:7, ItemDetail.tsx:53-57 import only episodeFacts/nextEpisodeAfter/EpisodeFacts — trim is clean given 5.3 first (verified-consistent) |
| E20 | OpenAPI + dist regen (swag) | 6.1 | three paths absent today — red until regen |
| E21 | GLOSSARY 3 entries | 6.2 | absent today |
| E22 | task 4.1 joint itest over the internal/api test seam | 4.1 | seam = real `mountV1Routes` + authMiddleware(AdminToken, Store, Identity) :335 + synthetic-principal injection (role_gating_test.go:53, qa_roles_test.go:36) — shape CHANGED under l6-accounts (F4) |
| E23 | golden vectors + metadata-projection pins pin byte-identity | 1.1/1.2 | both pins exist in api package and move/re-point with the extraction |
| E24 | **Viewer threading on the three new routes (VisibleLibraryIDs + ChainMutes)** | — | **MISSING from tasks** — the finding F3/Q2; note `scoreProgress` and `allFilteredItems` both already take `access.Viewer`, so the seams 3.2/3.3 reuse mechanically force a viewer argument |

nodes=20 · edges=24

---

## 2. Check verdicts

### Wiring coverage
Every planned edge grounds at HEAD except the authored-graph gaps below: no orphan
nodes (each new node carries an implementing task), no dead scope. Three findings:
F1 (recs-era methods on the moved type), F2 (move-list omissions), F3 (the deferred
per-user dimension landed first). All seams the design names exist — OnProgress,
OnSourceGateChanged, janitor registry + boot order, recs score seam, prefix scan,
browse group, test seam — at drifted line numbers (recorded, not questioned).

### QA seam coverage
Every cross-module seam has a covering task: naming seams pinned by 1.1/1.2 qa lists
(new-file test names — existence deliberately unchecked per the loop contract; the
EXISTING pins TestGoldenTitleVectors/TestMetadataProjection verified present), browse
seams by 2.1–2.3 qa lists, api seams by 3.1–3.4 duties, the joint seam by 4.1. Finding
F4: 4.1's seam changed shape under l6-accounts and has no authored six-slot contract
naming the new auth mechanics; F3 adds the invisible-library case the joint itest
should cover.

### Complexity
Per-module edge load is modest (api carries the most: 5 handlers-adjacent edges).
Blast radius outside named files: recs_ordering.go (F1 — hidden scope: no task names
it, yet the extraction cannot compile without re-homing two of its methods) and
internal/access (E24 — hidden dependency of every browse-group read at HEAD). No
planned cycles; dependency direction holds (nothing imports api). The three-PR merge
plan is unaffected.

---

## 3. Findings (ranked)

**F1 · Wiring · HIGH — rec-sorting added methods on `namer` that the move breaks.**
`itemTags` (recs_ordering.go:339) and `genresFor` (:358) are methods declared on `namer`
in package api — landed with rec-sorting (81bc6f0, 3 Nov) AFTER the design froze its
symbol inventory against 6c89cb9. Go forbids declaring methods on a type defined in
another package, so once `namer` moves to internal/naming (even behind an api-side
alias — aliases don't host methods), both fail to compile. Neither appears in task
1.1's move list nor in any keep list, and both are load-bearing for task 3.3: `/home`
orders through `scoreProgress`/`scoreItems`, which call them. They are also the api's
own projection of the About-resolver genre rule — the exact "one resolver" surface the
design wants naming to own.

**F2 · Wiring · MEDIUM — the verbatim move lists omit transitive pure helpers and one
api-side keeper.** Task 1.1's list omits `elementTokens` (display.go:328 —
`composeItemName`'s parameter type; cannot stay behind), `withSeriesOverride` (:476 —
an app method over `a.storedTitle`; must be NAMED as an api-side keeper, it is neither
in the move nor the keep list). Task 1.2 names only `metadataFor` + `aboutBlock`, but
`metadataFor` calls `castBlock` (:128), `episodeBlock` (:140), `verbatimMember` (:158),
`metadataFactKeys` (:30) — all four must move with it. A literal execution of the
authored lists cannot compile.

**F3 · Wiring · HIGH — the design's deferred per-user dimension has already landed.**
Design Non-Goal: "No per-user dimension (L6 accounts inserts a query-time
visible-library allow-list on all three routes…)". L6 accounts SHIPPED 6 Nov
(211665a) — before this change builds. At HEAD: store reads take `access.Viewer` and
are visibility-conjunct by default (`QuerySeries` series.go:129 + `andVisible`),
`namerFor` takes the calling viewer's `mutes` and every browse-group serving site
threads `v.ChainMutes` (handlers.go :1108/:1265/:1427/:1699/:1813/:1886,
recs_ordering.go:499), and the living recommendation-sorting spec (`openspec/specs/
recommendation-sorting/spec.md:213`) MANDATES "All ledger consumption on serving paths
SHALL be viewer-scoped AND visibility-conjunct — rows for libraries outside the
caller's visible set SHALL NOT leak existence through badges, watched flags, or the
continue rail." `/home` IS the continue rail's new serving path; `/search` and
`/facets` serve row existence too. No task threads the Viewer on the three routes, and
the home-continue delta carries no visibility clause. The shared/full index (design
D2, built via access.System()) stays right — the gap is serve-side scoping and the
mute-threading that keeps served names consistent with every other route.

**F4 · QA seam · MEDIUM — task 4.1's itest seam changed shape under l6-accounts.**
The joint itest mounts real `mountV1Routes`, which at HEAD runs
`authMiddleware(h.deps.AdminToken, h.deps.Store, h.deps.Identity)` (:335) — requests
need the synthetic-principal injection the role-gating tests use
(role_gating_test.go:53, qa_roles_test.go:36-45, handlers_viewer_test.go:93). Task 4.1
(authored pre-accounts) doesn't name this, and Q2's visibility case needs a
two-viewer fixture. 4.1 carries no `file:` six-slot contract to hold any of it.

**F5 · Spec-delta merge · HIGH — the living web-ui spec contradicts the delta's
single-request home.** The delta's MODIFIED requirement targets
"Continue and Next up surfaces" (name verified verbatim at
`openspec/specs/web-ui/spec.md:712` — mergeable). But rec-sorting ALSO shipped a
second requirement, "Continue and Next up consume served scores" (:2329), whose text
mandates "The SPA's Continue row SHALL render the served `GET /progress` order" and a
client Next up ordered by served rec_score. The delta mandates exactly one
`GET /api/v1/home` request with "no `/progress` listing" (its Single-request home
render scenario) and no client derivation. The delta set does not touch :2329 — at
archive both requirements coexist and directly contradict on whether home fetches
/progress.

**F6 · Spec-delta merge · MEDIUM — home-continue delta silent on the visibility
mandate.** The living rec-sorting requirement (:213) already binds ALL continue-rail
serving to viewer-scoped, visibility-conjunct ledger consumption. The home-continue
delta's ADDED requirement defines /home serving (bounds, ordering, honest duration,
next pick) without carrying that clause forward — the delta should state it so the
archived spec records the obligation on the new route.

**F7 · Drift · LOW — design line anchors stale, seams intact.** namerFor :76→:107;
browse routes :259-260→:334-336; OnProgress :64-71→:67-77; OnSourceGateChanged
:128-140→:137-146; titleSourceBinding :170→:180; metadataFor/aboutBlock call sites
handlers.go:1515/:1588→:2059/:2132; store prefix scan :188-193→:205-228; enrich
episodeFacts :203→:209; janitor refs →:11-23/:45-53, main.go:573-577→:528-547;
nextup.ts:102→:108. Every named seam exists; no action needed (the executor grounds
through the live index per the launch contract). Recorded so GATE 1 reads the design's
evidence column as historical.

---

## 4. Numbered questions (recommended, never decided)

**Q1 — Do tasks 1.1/1.2 amend to the full transitive closure of the move, including
the two recs-era methods on `namer`?**
Finding F1+F2. `itemTags`/`genresFor` cannot stay in api once `namer` moves (Go
method rules), and they are the same first-carrier resolver rule the design wants as
naming's one home; `elementTokens`, `castBlock`, `episodeBlock`, `verbatimMember`,
`metadataFactKeys` cannot stay behind either; `withSeriesOverride` (+ its
`a.storedTitle` dependency) must be named an api-side keeper.
**Recommendation: amend task 1.1 to add itemTags, genresFor, elementTokens to the move
list; amend task 1.2 to add castBlock, episodeBlock, verbatimMember, metadataFactKeys;
name withSeriesOverride (and namerFor/elementTemplate, already named) as the api-side
keepers. This also serves task 3.3 — the recs tags then live where /home's ordering
can call them without an api-internal second resolver.** Pre-register amendment (no
receipts yet), then re-survey per the loop rule.

**Q2 — Do tasks 3.1–3.3 thread the calling Viewer (VisibleLibraryIDs scoping +
ChainMutes into namerFor), and do the deltas carry the visibility clause?**
Finding F3+F6. The deferral inverted: L6 accounts landed BEFORE browse-scale, the
living rec-sorting spec already binds the continue rail to visibility-conjunct
serving, and the seams 3.2/3.3 reuse (`scoreProgress`, `allFilteredItems`) take
`access.Viewer` mechanically. The index stays shared/full via access.System() at
rebuild (design D2 unchanged) — only serve-side scoping and mute-threading are in
question.
**Recommendation: amend 3.1/3.2/3.3 to thread the viewer (scope hit ids/rows to the
caller's visible libraries; pass v.ChainMutes so /home and /search names mute exactly
like every other browse-group route at HEAD); add the visibility-conjunct clause to
the home-continue delta (and one sentence to global-search); add the invisible-library
case to task 4.1's joint itest.**

**Q3 — Does the web-ui delta gain a second MODIFIED requirement superseding the home
clauses of "Continue and Next up consume served scores"?**
Finding F5. The living requirement at openspec/specs/web-ui/spec.md:2329 mandates the
Continue rail renders the served `GET /progress` order; the delta mandates a single
/home request and no /progress listing on home. Unmodified, archive merges a
contradiction into the living spec.
**Recommendation: add a MODIFIED requirement to the change's web-ui delta that scopes
"Continue and Next up consume served scores" to the surfaces that keep client
derivations (the watch page's nextEpisodeAfter ordering, collection grids) and records
the home-rail supersession — mirroring what the rec-sorting delta already does at the
api side.**

**Q4 — Does task 4.1 gain a `file:` six-slot contract naming the post-accounts seam
mechanics?**
Finding F4. The joint itest must authenticate through authMiddleware(AdminToken,
Store, Identity) with synthetic-principal injection (the role_gating_test.go
precedent), and Q2's visibility case needs two viewers.
**Recommendation: author the six-slot contract for 4.1 naming the seam helpers and the
two-viewer fixture; keep the duty as authored.**

## 5. Verified already-consistent (so GATE 1 sees both sides)

- The MODIFIED target "Continue and Next up surfaces" exists verbatim in the living
  web-ui spec (:712) — that half of the delta merges clean.
- The rec-sorting living spec has NO home-rail requirement yet — the change's ADDED
  delta merges clean against it; its :213 "continue rail" ordering statement remains
  true under the delta.
- l6-accounts did NOT reshape the route groups: the browse group
  (requireRole(RoleAdmin, RoleClient), :336) is exactly where 3.1–3.3 mount; viewer
  threading is per-handler, so nothing about the planned mounts is stale.
- The recs score seam exists and matches task 3.3's contract: scoreProgress
  (rec_score desc + updated_at tiebreak via orderByScoreRecency), scoredServe generic.
- The janitor gained a first-class `wake` channel (rec-sorting D5) — task 3.5's
  scan-complete/gate-flip pokes have a cheaper mechanism than design D4's table
  assumed; boot-warm-before-serve order intact (main.go :547 before :551).
- Task 5.4's trim is safe at HEAD given 5.3 first: the only production consumer of the
  doomed exports is Home.tsx; keep-side (InfoColumn/AutoNext/ItemDetail) imports
  survive untouched; watchedRows.ts mentions the pipeline in comments only.
  (Home.test.tsx:12-13 imports the doomed exports — covered by "their tests" removal /
  5.3's rewrite.)
- The `module_id === "tv"` gate remains unique to nextup.ts (:108) — D6's deletion
  claim holds.
- /search, /facets, /home are absent from committed openapi.json and the GLOSSARY
  lacks the three entries — 6.1/6.2's greps are correctly red-until-done.
- enrich's private episodeFacts duplicate still exists (episode_titles.go:209) and the
  non-goal leaving it alone still holds.
- 12-export budget premise: enforced mechanically by 6.3's check.sh gate; extraction
  shrinks the api surface as designed (no count drift observed that would invert it).

## 6. Resolutions (recorded by the human at GATE 1)

| Question | Resolution (amend / waive + why) | Recorded |
|---|---|---|
| Q1 | AMEND per recommendation — task 1.1 move list gains elementTokens/itemTags/genresFor, task 1.2 gains the four metadataFor transitive helpers, withSeriesOverride named an api-side keeper; duties untouched | 2026-11-06 (planner amendment round) |
| Q2 | AMEND per recommendation — tasks 3.1–3.3 thread the caller's Viewer (visible-id scoping + v.ChainMutes into namerFor; index stays access.System()-built per D2), home-continue delta gains the visibility-conjunct clause + leak scenario, global-search delta gains the one-sentence clause, task 4.1 gains the invisible-library two-viewer case; duties untouched | 2026-11-06 (planner amendment round) |
| Q3 | AMEND per recommendation — web-ui delta gains the second MODIFIED requirement scoping "Continue and Next up consume served scores" to the watch page + collection grids and recording the home-rail supersession by /home | 2026-11-06 (planner amendment round) |
| Q4 | AMEND per recommendation — task 4.1 gains `file: contracts/4.1-joint-itest.md` (six-slot contract naming the authMiddleware seam, the synthetic-principal precedents, the two-viewer fixture, the seam files); duty untouched | 2026-11-06 (planner amendment round) |
| Q5 | AMEND per recommendation — design.md Non-Goal reworded (:72-77: no per-user dimension IN THE INDEX, serve-time Viewer threading in scope, records that l6-accounts landed without inserting any allow-list here); Interfaces constructor inventory carries mutes (display.go:66-74) + moduleID (:75-80); the :149 migration-point line untouched per the scope guard. Verified landed round 2 | 2026-11-06 |
| Q6 | AMEND per recommendation — library-facets delta: endpoint requirement gains the visibility-conjunct sentence (denied library-scoped view — no counts, no keys, no existence leak), new scenario "A library outside the viewer's visible set serves nothing", filtering requirement scoped to the caller's visible libraries. Verified landed round 2 | 2026-11-06 |

Waiver list: empty — no waived-priority items found.

---

## 7. Re-survey round 1 (post-amendment, 2026-11-06)

Context: GATE 1 answered all four questions AMEND; wf-planner applied the round
directly to the artifacts (pre-register; `openspec validate browse-scale --strict` →
valid, re-run by the surveyor). HEAD still 211665a, map CURRENT — the round touched
change-folder artifacts only; all code anchors below re-verified against live source.

### 7.1 Per-question verification (F1–F6 disposition)

- **Q1 / F1+F2 — LANDED CORRECTLY.** tasks.md 1.1 now names `elementTokens`
  (display.go:328 + rationale), `itemTags` (:339) / `genresFor` (:358) with the exact
  compile rationale (methods on namer cannot stay in api once the type moves), and
  names `withSeriesOverride` (:476, the app method over a.storedTitle) among the
  api-side keepers; 1.2 names `metadataFactKeys` :30 / `castBlock` :128 /
  `episodeBlock` :140 / `verbatimMember` :158 with the transitivity note. All six
  anchors re-verified at HEAD this round. F1+F2 CLOSED by amendment.
- **Q2 / F3+F6(part) — LANDED CORRECTLY.** Tasks 3.1/3.2/3.3 prose threads the
  caller's Viewer: visible-library-id scoping of hit ids (3.1), facet counts +
  filtered results (3.2), progress rows through the caller's Viewer citing
  scoreProgress's access.Viewer signature (3.3); v.ChainMutes into namerFor named in
  3.1 and 3.3 ("the browse-group serving convention"); the shared/full index posture
  preserved via access.System() at rebuild (D2 unchanged). Deltas: home-continue
  carries the visibility-conjunct clause (:26-29) + ChainMutes sentence + the new
  scenario "Invisible libraries never leak through the rail" (:51); global-search
  carries the visible-set/leak sentence + ChainMutes (:22-24). F3 CLOSED by
  amendment; F6 CLOSED for home-continue and global-search — the library-facets delta
  remains clause-less (→ ruling b, Q6).
- **Q3 / F5 — LANDED CORRECTLY.** The web-ui delta gained the second MODIFIED
  requirement "Continue and Next up consume served scores" (:89) — same requirement
  name as the living spec's :2329 requirement, so archive REPLACES it: the text scopes
  the served-scores rule to the watch page's nextEpisodeAfter derivation and collection
  grids, states "The home surface is superseded by GET /api/v1/home … the
  `/progress`-ordering clause no longer applies to the home surface" (:97-100), and
  every scenario is re-scoped (the validator-forced restatement is what makes the
  supersession merge-safe). F5 CLOSED by amendment.
- **Q4 / F4 — LANDED CORRECTLY.** Task 4.1 carries the invisible-library two-viewer
  case in prose and the grammar-valid `  file: contracts/4.1-joint-itest.md` field
  line; the contract names the seam mechanics (authMiddleware at router.go:335,
  requireRole :336) and the injection precedents. All contract anchors re-grounded at
  HEAD this round: `access.User(userID, visibleLibraryIDs, chainMutes)` viewer.go:55
  and `access.System()` :45 exact; `principalInjector` role_gating_test.go:22 and
  `principalViewerInjector` :37 exact; handlers_viewer_test.go — the contract cites
  :93 for the seam (the enclosing mount line) while `scopedRouter` sits at :99-100; a
  6-line offset inside a test helper, harmless (the executor grounds through live
  source per the launch contract). F4 CLOSED by amendment.

### 7.2 Rulings on the planner's two flagged items

**(a) design.md stale prose — surveyor recommends AMEND (open as Q5).**
The Non-Goal line at design.md:72-73 ("No per-user dimension (L6 accounts inserts a
query-time visible-library allow-list on all three routes; the index stays
shared/full)") is falsified at both ends since the round: L6 landed (211665a) and did
not insert the allow-list on these routes (they did not exist), and the amended tasks
3.1–3.3 now thread exactly that allow-list. Left standing, GATE 2's reviewer reads a
rationale record that contradicts the amended tasks and deltas. The same stale-prose
class sits in the Interfaces section: the naming-constructor list ("group style,
active template, series-by-path map, title sources, language prefs, source chain")
omits the two namer fields that exist at HEAD — `mutes map[string]bool` (l6-accounts
10.4, display.go:66-74) and `moduleID` (rec-sorting photo carve-out, :75-80) — and the
moved struct's exported constructor is exactly what task 1.1 builds from that section.
Scope guard: design.md:149's "the named L6 migration point — per-user progress forces
persistence then" stays future-true (L6 shipped per-user LEDGERS, not per-user
progress rows) — no-action. One prose touch covers both stale spots; no duty or shape
change, same amendment lane as round 1.

**(b) library-facets delta carries no visibility clause — surveyor recommends AMEND
(open as Q6).**
Verified this round: grep for visible/Viewer/invisible over
specs/library-facets/spec.md → zero hits. The behavior now lives ONLY in task 3.2
prose ("an invisible library contributes nothing"). The deltas are the behavioral
record that archives into the living spec — the exact F6 class already closed on
home-continue and global-search, still open on the third delta, and the F5 lesson
applies: the reviewer's gate check is diff-against-deltas, so behavior absent from a
delta is unreviewable at GATE 2. Minimal fix: one sentence in the endpoint
requirement (a library outside the caller's visible set serves like every other
denied library-scoped view — no counts, no keys, existence never leaks) + one
scenario, and half a sentence on the filtering requirement (the /series + /items
filter scoped to the caller's visible libraries — 3.2's prose already states it).

### 7.3 Frontier

Round 3 (landing check, 2026-11-06): the human answered Q5/Q6 AMEND; planner round 2
landed both and the surveyor verified against live artifact text this round — design.md
Non-Goal :72-77 reworded as ruled (index shared/full via access.System() vs serve-time
Viewer threading, the l6-accounts correction recorded), constructor inventory carries
mutes + moduleID at the cited anchors, migration-point line untouched; library-facets
delta carries the endpoint visibility sentence, the grant-based scenario, and the
filtering clause; tasks.md consistent with round-1 bytes; strict validate clean.
**Frontier: EMPTY.** Q1–Q6 all resolved AMEND and verified landed. No open questions,
no waivers.
