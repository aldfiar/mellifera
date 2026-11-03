# Integration audit — 2026-11-03-watched-states

Surveyor: wf-surveyor · propose phase · **ROUND 2 — re-run after amendment round 1** · 2026-11-03 · map `ffc3e76` fingerprint `ad193dd9…` **CURRENCY: CURRENT** (re-verified this session; identical commit as round 1 — the amendment touched only this change folder, no code drift, every round-1 grounding carries). `openspec validate 2026-11-03-watched-states --strict` re-run this session: **rc 0**.

**Amendment verification (this round's job):** all 11 round-1 recommendations landed verbatim in proposal.md, design.md, tasks.md, specs/web-ui/spec.md. Verified by diffing the working tree against the committed round-1 artifacts at `ffc3e76`: the four amended files' hunks map 1:1 onto Q1–Q10 (+Q1b) — no scope creep, task ids 1.1–1.5 / 2.1–2.4 / 3.1–3.4 / 4.1–4.2 unchanged, checkbox state untouched, group headings unchanged, register grammar intact. specs/recommendation-sorting was NOT touched by the round (its withdrawal / `include=watched` / 400-strict-parse text was already round-1 correct). Per-question verdicts: §3 — **all RESOLVED, zero open questions, zero waivers**.

Residual operational note (not a question, not amendment-introduced): tasks.md carries no `verify:` duty fields yet. The lite schema template ships none either; the shipped precedent authors them between GATE 1 and register (archived `2026-11-03-recommendation-sorting/tasks.md` carries 13; commit `eef95a9` "verify duties" in this worktree's history). `wf pipeline register`'s line-numbered refusal is the mechanical backstop — nothing for GATE 1 to decide.

Round-2 live spot-checks (the load-bearing set, `file:line`): `getItem` handlers.go:1180 (`func (a *app) getItem`; its body makes NO `recsFactsFor` call — the call sites remain :849 (listProgress scored), :920 (getProgress), :1101 (listItems scored), :1460 (listSeries) — the amended premise "composes NO facts today" verified) · `getSeries` :1505 · `seriesEpisodes` :1551 (comment block :1534) · `useProgressList` queries.ts:270, `queryKey: ["progress"]` :273, three consumers Home.tsx:427 / Home.tsx:555 / ItemDetail.tsx:1216 · `reportedRef` web/src/components/playback/Player.tsx :109 (decl) / :306–:309 (dedupe guard) / :315 (drift check) · `MarkWatchedRow` web/src/pages/collections/Collection.tsx def :1538, stale rail comment verbatim :1532–1537 ("position=duration does NOT leave the item on the Continue rail") · `SeriesGrid` :1471 / class `series-poster-grid` :1492 / `SeriesCard` def :1578, usage :1514 · `EpisodesView` :1697 · `ItemGrid` :1809 · `listProgress` :816 (`if recent {` :831 — no facts on that branch; scored-branch facts :849) · `listItems` :1039 (photo carve-out comment ~:1070). Round-1 anchors for Player/Collection shift by a few lines (recorded here); no symbol moved.

Scope: proposal.md Changes 1–5 · design.md D1–D7 · tasks.md groups 1–4 · specs/recommendation-sorting + specs/web-ui deltas. Read-only audit; every contradiction is a numbered question with a recommended answer — the human decides at GATE 1.

---

## 1. The planned integration graph (round 2 — round-1 groundings re-validated)

### Nodes (all grounded; none improvised; unchanged by the amendment — same node set, no new modules)

**internal/api — wire shapes and conversions**

| Node | Grounding | Plan touch |
|---|---|---|
| `itemDTO` | handlers.go:414 | +`watched,omitempty` (1.1, D1) |
| `seriesDTO` | handlers.go:299 | +`watched,omitempty` (1.2, D1) |
| `progressDTO` | handlers.go:263 | +`watched,omitempty` (1.1, D1) |
| `progressRequest` | handlers.go:253 (`PositionSeconds *int64`, pointer-presence) | +`completed` (1.4, D3) |
| `toItemDTO` | handlers.go:1714 | stamps Watched (1.1) |
| `toSeriesDTO` | handlers.go:1789 | stamps Watched (1.2) |
| `toProgressDTO` | handlers.go:1828 | stamps Watched (1.1) |
| `listItems` (GET /items) | handlers.go:1039; scored branch facts+scoredServe :1101–1106; sort=path branch composes NO facts :1074–1077 | stamp + partition input (1.1, 1.5); **sort=path now stamped too (1.1, amended)** |
| `getItem` (GET /items/{id}) | handlers.go:1180; composes NO facts today (verified round 2 — no `recsFactsFor` in body) | **gains `recsFactsFor` composition (1.1, amended)** |
| `listSeries` (GET /series) | handlers.go:1470 scoredServe over `scoreSeries` | series stamp (1.2) |
| `getSeries` (GET /series/{id}) | handlers.go:1505 — no facts today | **stamp added (1.2, amended)** |
| `seriesEpisodes` (GET /series/{id}/episodes) | handlers.go:1551 — `itemDTOs`, no facts today | **gains composition (1.1, amended); narrative order kept, `rec_score` absent** |
| `listProgress` (GET /progress) | handlers.go:816; recent branch `if recent {` :831 reads NO facts; scored branch facts :849 | withdrawal + `?include=watched` + 400 in BOTH branches (1.3, D2 — amended) |
| `getProgress` (GET /progress/{item_id}) | handlers.go:891; already composes `recsFactsFor` :920 | watched stamp (1.1) |
| `putProgress` (PUT /progress/{item_id}) | handlers.go:761; seam fire :785–786 | pass `completed` (1.4) |
| `recsFacts` / `recsFactsFor` | recs_ordering.go:63 / :99 — `watched` map :66, built from `ListWatched` :116–124 | the stamp source D1 names — GROUNDED |
| `parseSort` | recs_ordering.go:132–141 (opt-out + 400-on-unknown) | the precedent 1.3 names — GROUNDED |
| `scoreSeries` | recs_ordering.go:229 — eps walk reads `f.completed(ep.ID)` :234; `episodesBySeries` :268 | watched derivation site (1.2, D1) |
| `scoredServe[T]` | recs_ordering.go:343 — production callers exactly two: handlers.go:1106, :1470 | carry Watched into Entry (1.5) |
| `Deps.OnProgress` | router.go:72 — `func(ctx, itemID string, position int64)`; nil-safe fire handlers.go:785 | +`completed` (1.4, D3) — signature widen |

**internal/recs + internal/store**

| Node | Grounding | Plan touch |
|---|---|---|
| `recs.Entry` | recs.go:96 (`ID`, `DisplayName`, `Score`) | +`Watched` (1.5, D4) — a struct field, not a symbol |
| `recs.Order` | recs.go:105–116 — score desc → name → id | partition watched last (1.5, D4) |
| `Store.ListWatched` | store/recs.go:54 (`[]string`) | EXISTS — read only |
| `Store.InsertWatched` | store/recs.go:30 | EXISTS — detector reuse |

**cmd/mellifera — the seam fan-out**

| Node | Grounding | Plan touch |
|---|---|---|
| `fanOut` | watch_detect.go:21 | signature widen (1.4) |
| `newWatchDetect` | watch_detect.go:40; floor check :57; no-duration early return :53–56; insert + `notifyRecs()` :60–66 | completed bypasses floor AND duration (1.4; spec: "intent needs no duration") |
| `newThumbRegrab` / `thumbRegrabber.onProgress` | thumb.go:74 / :84 | signature widen (1.4) |
| main wiring | main.go:373 `OnProgress: fanOut(newThumbRegrab(st, mgr), newWatchDetect(st))` | arg shapes (1.4) |
| `notifyRecs` | recs_janitor.go:38 | EXISTS — wake poke, unchanged |
| `watchedDurationFloor` | watched.go:30 (`= 0.9`) | EXISTS — the floor 1.4 bypasses |
| recs boot backfill | recs_backfill.go | UNCHANGED (spec delta re-states it; no task touches it — consistent) |

**web/src**

| Node | Grounding | Plan touch |
|---|---|---|
| `ItemDTO` / `SeriesDTO` / `ProgressDTO` | api.ts:218 / :354 / :166 | +`watched?` (2.1) |
| `putProgress` | api.ts:1153; production callers: Player.tsx:310 (`report`), Collection.tsx:1541 (`MarkWatchedRow`) | +`completed` (2.1, 2.4) |
| `listProgress` | api.ts:998; consumed only via `useProgressList` | +`include=watched` (2.1) |
| `useProgressList` | queries.ts:270, key `["progress"]` :273; THREE consumers: Home.tsx:427, Home.tsx:555, ItemDetail.tsx:1216 | query gains `include=watched` (2.1 — **queries.ts now NAMED in the task**, amended) |
| `useSeriesEpisodes` | queries.ts:310 — key `["series-episodes", seriesId]`; EpisodesView's data source | unchanged; watched arrives server-side via the amended seriesEpisodes stamp |
| `ContinueRow` / `ContinueCard` | Home.tsx:426 / :485 | filter watched rows (2.2, D2) |
| `NextUpRow` (`startedSeries`/`nextUpEntries`) | Home.tsx:555; nextup.ts | UNCHANGED — consumes all rows (2.2, D2) |
| `EpisodesView` | Collection.tsx (web/src/pages/collections/) :1697 | tri-state rows (2.3, D5) |
| `SeriesGrid` / `SeriesCard` (+`series-poster-grid`) | Collection.tsx :1471 / :1578 (usage :1514) / :1492 | tri-state series cards (2.3, D5) — **live names now in the plan** (amended) |
| `ItemGrid` | Collection.tsx :1809 | the film/tv card grid (2.3, D5 — amended; TV mode = `html.tv` CSS layer) |
| ItemDetail heading + resume row | ItemDetail.tsx h1 ~:1245; resume row `useProgressList` :1216 | ✓ beside heading (2.3); resume row inherits the shared query (2.1 — amended) |
| `Player` report/edges | web/src/components/playback/Player.tsx :299–330 (`report` dedupe via `reportedRef` :306–309; `onEdge` shared pause+ended :322); ended-state :346–363; unmount flush :328–330 | ended edge fires `completed: true` (2.4, D3); **bypass of `reportedRef` now PINNED (2.4 + 3.3, amended)** |
| `SkipChip` → `onSkip={seekTo}` | Player.tsx:417; SkipChip.tsx:44 | credits activation fires `completed: true` (2.4) |
| `MarkWatchedRow` | Collection.tsx :1538 (def), stale comment :1532–1537 (verbatim, verified round 2) | **comment refresh pinned in 2.4 (amended)** — no behavior change, floor-crossing write kept |

**Docs**: README.md (exists — 4.1); OpenAPI annotations on listProgress/putProgress (handlers.go:810–812, :755–756) regenerate via `make web-build` (3.4).

### Edges (planned relations — amendment closures marked **[NOW PLANNED]**)

1. `listItems` scored branch → `recsFactsFor` → `ListWatched` → `itemDTO.Watched` + `Entry.Watched`
2. `listItems` sort=path branch → ledger-set stamp only (no score composition, `rec_score` absent, path order untouched) — **[NOW PLANNED: 1.1 + D1]** (photo carve-out rides the same branch, D1 explicit)
3. `getItem` → new `recsFactsFor` composition — **[NOW PLANNED: 1.1 + D1]** (was Q1)
4. `getSeries` → same facts, wire parity — **[NOW PLANNED: 1.2 + D1]** (was Q1b)
5. `seriesEpisodes` → facts composition; narrative order kept, `rec_score` absent — **[NOW PLANNED: 1.1 + D1]** (was Q2)
6. `listSeries` → `scoreSeries` eps walk → `seriesDTO.Watched`
7. `listProgress` scored branch → facts → withdrawal + `progressDTO.Watched`
8. `listProgress` recent branch → gains batched ledger read + withdrawal + stamp; opt-out must not resurrect — **[NOW PLANNED: 1.3 + D2]** (was Q3)
9. `getProgress` → facts (:920) → `progressDTO.Watched`
10. `putProgress` → `progressRequest.Completed` → `OnProgress(ctx, id, pos, completed)` → `fanOut` → `newWatchDetect` (bypasses floor+duration) → `InsertWatched` + `notifyRecs`; → `newThumbRegrab` (ignores the flag)
11. `scoredServe` → `recs.Entry{Watched}` → `recs.Order` partition → stamped order at both callers (handlers.go:1106, :1470)
12. SPA `useProgressList` → `listProgress(include=watched)` → ContinueRow filter / NextUpRow unchanged / ItemDetail inherits — **[NOW PLANNED with queries.ts named in 2.1]** (was Q5)
13. EpisodesView → `useSeriesEpisodes` → `seriesEpisodes` — watched arrives via edge 5 (now planned)
14. Player `ended` listener → `putProgress(id, seconds, completed: true)` **bypassing the `reportedRef` dedupe** — **[BYPASS NOW PINNED: 2.4 + 3.3 vitest case + D3]** (was Q10)
15. SkipChip activation (`onSkip` → `seekTo`) → `putProgress(..., completed: true)`
16. `MarkWatchedRow` → `putProgress(id, duration)` → crosses 0.9 floor → ledgered (inherits watched semantics) — **[ACKNOWLEDGED + comment refresh pinned: D6 + proposal Non-goals + 2.4]** (was Q6)
17. `parseSort` precedent → new `include` strict parse (400 on unknown), both branches of `listProgress`
18. Test edges (amendment-added): 3.1 names the 400-on-unknown-`include` probe and the `internal/recs/recs_test.go` leaf partition case; 3.2 names the four in-code churn targets; 3.3 names the `reportedRef`-bypass vitest case

### Test seams (existing, to be touched)

`internal/itest/qa_recs_roundtrip_test.go` (TestRecsRoundtrip :689; `qaRecsWatchDetect` seam mirror :311/:367 — inherits the signature widen) · `internal/api/recs_golden_test.go` (TestGoldenCompletedSkipsResumeBonus :126; asserted order `mid, done, plain` :163 → becomes `mid, plain, done` — now named in 3.2) · `internal/api/recs_ordering_test.go` (:340) · `internal/api/progress_recs_test.go` + `progress_test.go` · `internal/recs/recs_test.go` (leaf partition case — **now named in 3.1**) · `cmd/mellifera/watch_detect_test.go`, `thumb_test.go` · web: Home.test.tsx, Player.test.tsx, SkipChip.test.tsx, api.test.ts, nextup.test.ts (:84/:327 — named in 3.2). `testdata/golden/` carries none of these shapes (verified round 1, restated in 3.2/D7).

---

## 2. Per-check verdicts (round 2)

### Wiring coverage — PASS (round-1 gaps all closed)

Every planned node resolves in live source; no phantom symbols, no orphan new modules. The four route-coverage gaps are closed by the amendment: single-item GET (1.1 + D1), single-series GET (1.2 + D1), series-episodes (1.1 + D1), `sort=recent` rail branch (1.3 + D2, both branches + no-resurrect clause). The `sort=path` stamping question is resolved the recommended way (ledger-set stamp, score stays absent, path order untouched — 1.1/1.2 + D1, photo carve-out explicitly covered). internal/store still needs ZERO changes (no new tables, no new store methods — the amendment corrected the weaker round-1 "no new store reads" wording to "nothing new at the store layer; routes that compose no facts today gain one batched composition of EXISTING reads", which matches the code reality).

### QA seam coverage — PASS (round-1 gaps closed)

The four dispatch joints: (1) `completed` on the OnProgress seam — 1.4 + 3.1(b) roundtrip extension + spec scenario "An explicit completed write finishes the episode"; (2) `?include=watched` parse — implementation 1.3 + **the 400-on-unknown probe now named in 3.1**; (3) Order partition — 3.1(c) at the api joint + **the pure-leaf unit case now named in `internal/recs/recs_test.go` (3.1 + D7)**; (4) DTO stamps — 3.2 reworded to the real churn set (TestGoldenCompletedSkipsResumeBonus order flip, recs_ordering_test.go, progress_recs_test.go, nextup.test.ts) + 3.3 SPA vitest incl. the `reportedRef`-bypass case.

### Complexity / blast radius — CONTAINED (round-1 hidden scope now named in task text)

Hub remains `internal/api` (~15 modified nodes). cmd/mellifera signature ripple unchanged (fanOut, both legs, main wiring, three test files). The three round-1 hidden-scope items are now IN the tasks: `web/src/lib/queries.ts` named in 2.1; `MarkWatchedRow`'s comment refresh pinned in 2.4; the `reportedRef` bypass pinned in 2.4 + 3.3. No planned cycles; group order 1→2→3→4 is a clean DAG. No new files, no new nodes vs round 1 — the amendment added edges and test targets only.

---

## 3. Numbered questions — ROUND 2 DISPOSITIONS (all resolved by amendment; recommend, never decide)

**Q1 — RESOLVED.** `getItem` facts composition is now planned. design.md D1 items bullet: "The single-item GET (`getItem`) composes NO facts today — its route never carries `rec_score` (the scored single-record route is `getProgress`) — so it gains the same `recsFactsFor` composition getProgress already runs" (premise corrected exactly as recommended). tasks.md 1.1: "single-item GET (gains a `recsFactsFor` composition: it reads no facts today)". proposal.md Change 1 names the single-item GET. Live-verified round 2: handlers.go:1180 body composes no facts; the premise text now matches the code.

**Q1b — RESOLVED.** design.md D1 series bullet: "The single-series GET (`getSeries`) stamps the same flag from the same facts — wire parity with the list". tasks.md 1.2: "stamped on the list, the single-series GET (same facts, wire parity with the list)". Live: handlers.go:1505.

**Q2 — RESOLVED.** design.md D1 new episode-rows bullet: "`GET /series/{id}/episodes` (`seriesEpisodes`) composes no facts today — it gains the composition so episode rows stamp `watched`; the route keeps its narrative order and `rec_score` stays absent there". tasks.md 1.1 names the route with the same constraints. proposal.md Change 1 names the series-episodes listing. Live: handlers.go:1551.

**Q3 — RESOLVED.** design.md D2: "in BOTH branches: the scored default AND the `sort=recent` opt-out (the opt-out must not resurrect rows the default withdrew; the recent branch gains the batched ledger read it makes none of today)". tasks.md 1.3 carries both branches + the no-resurrect clause + the recent-branch read/stamp. proposal.md Change 2: "in BOTH branches (scored and `sort=recent`)". Live: `if recent {` :831 (no facts), scored facts :849.

**Q4 — RESOLVED.** design.md D1: "The `sort=path` listing branches (and the photo carve-out, which rides the same branch) stamp from the ledger set ALONE: no score composition, `rec_score` stays absent exactly as today, and path order is untouched (a field stamp never reorders)". tasks.md 1.1/1.2 carry the ledger-set-only stamps. proposal.md Change 1: "the `sort=path` collection branches gain the composition or the ledger set".

**Q5 — RESOLVED.** design.md D2: "`?include=watched` rides the SHARED `useProgressList` query (queries.ts, key `["progress"]`) — deliberate: that one query feeds the Continue rail, the Next-up anchors, AND ItemDetail's resume row, so all three keep today's exact row set (a Home-only query key would drop ItemDetail to the withdrawal default...)". tasks.md 2.1 names `web/src/lib/api.ts` + `web/src/lib/queries.ts` and the shared query. proposal.md Change 2: "the param rides the SHARED progress query (queries.ts)". Live: queries.ts:270/:273; consumers Home.tsx:427/:555, ItemDetail.tsx:1216.

**Q6 — RESOLVED.** The recommended option (keep the floor-crossing write, refresh the stale comment) was adopted. design.md D6 note: MarkWatchedRow "ALREADY exists ... its full-duration write crosses the 0.9 floor and ledgers the item ... the row's stale in-code comment ... is refreshed to state the now-effective semantics — no behavior change". proposal.md Non-goals rewritten accordingly (the round-1 "rides the same future route" out-of-scope line removed). tasks.md 2.4 pins the comment refresh. Live: stale comment verbatim at Collection.tsx:1532–1537.

**Q7 — RESOLVED.** The fictional "serial-grid"/"tv-grid" vocabulary is gone from all four artifacts, replaced with live names: design.md D5 ("`SeriesCard` cards in `SeriesGrid` (class `series-poster-grid`; all-watched series), `ItemGrid` cards (the film/tv card grid — TV mode is the `html.tv` CSS layer over the same grids, not a separate tree)"), tasks.md 2.3, proposal.md Change 5, web-ui spec delta sites list. Live: SeriesGrid :1471, series-poster-grid :1492, SeriesCard :1578/:1514, ItemGrid :1809, EpisodesView :1697.

**Q8 — RESOLVED.** tasks.md 3.2 reworded to the real churn: "TestGoldenCompletedSkipsResumeBonus order `mid, done, plain` → `mid, plain, done` (the partition WORKING — recs_golden_test.go), `recs_ordering_test.go` watched-film page assertions, `progress_recs_test.go` rail rows under the withdrawal, SPA wire pins in `nextup.test.ts` (testdata/golden carries none of these shapes)". design.md D7 restates the same list.

**Q9 — RESOLVED.** tasks.md 3.1 now includes "the 400-on-unknown-`include` strict parse" and "the partition's pure-leaf unit case in `internal/recs/recs_test.go`". design.md D7 adds (e) and names the leaf home ("the comparator's unit home").

**Q10 — RESOLVED.** design.md D3: "Both edges fire through the player's one write helper, which dedupes by floor-second (`reportedRef`) — the completed-flagged write BYPASSES that guard (the flag forces the write even at an already-reported second)". tasks.md 2.4 pins the bypass; 3.3 names the vitest case ("the flagged write fires at an already-reported second"); proposal.md Change 3 states it ("the flagged write bypasses the player's position dedupe so the edge cannot be swallowed"). Live: reportedRef Player.tsx:109/:306–309/:315.

**New questions introduced by the amendment: NONE.** Every amendment hunk was audited for newly introduced contradictions: the photo carve-out riding the sort=path ledger-set stamp is spec-consistent (the recommendation-sorting delta's `watched,omitempty` requirement is unconditional; no web-ui site claims photo grids; D1 pins "a field stamp never reorders"); "all-watched series" on SeriesCard matches the D1 series derivation; the `verify:` absence noted in the header is pre-existing with a mechanical register backstop, not a plan contradiction.

---

## 4. Human resolutions (recorded at GATE 1)

| Q | Resolution | Decided by / date |
|---|---|---|
| Q1–Q10 (+Q1b) | **AMENDED** — all 11 surveyor recommendations adopted verbatim by @wf-planner in amendment round 1 (2026-11-03); artifacts re-validated strict rc 0. Formal ratification of the amended proposal pending GATE 1 approval. | @wf-planner per the round-1 recommendations; human approval at GATE 1 |

Waiver list: **none** — nothing was waived; every question was resolved by amendment. The question frontier is empty.
