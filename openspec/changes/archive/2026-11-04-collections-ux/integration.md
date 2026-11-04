# Integration audit — collections-ux

Surveyor: wf-surveyor · audited at propose, worktree HEAD 949f39a (baseline suite green) ·
source map `.tmp/.source_map.json` fingerprint 4e5dac5e…, CURRENCY: CURRENT at 949f39a.

Method note: the live map indexes all 464 files (lang/role/lines) but carries **zero symbol
rows** for go/ts/tsx (backend richness — python3-ast is the only def/callers-producing
backend in this install). Every node and edge below is therefore grounded by direct
`grep`/`sed` against the worktree source at 949f39a with `file:line` evidence, per
code-search G1–G6; the map grounded file existence and currency. No claim below rests on
prompt memory.

## 1. The planned graph

### Nodes (19 — every NEW or TOUCHED module/class/method the artifacts name)

**Backend (Go)**

| # | Node | Kind | Task | Grounding |
|---|------|------|------|-----------|
| N1 | `Store.DeleteWatched(ctx, itemID string) error` | NEW method, `internal/store/recs.go` beside `InsertWatched` | 1.1 | 0 hits repo-wide (planned-new confirmed); neighbor `InsertWatched` at `internal/store/recs.go:30` |
| N2 | `TestDeleteWatchedResetsPosition` | NEW test, `internal/store/recs_test.go` | 1.1 | file exists (`TestInsertWatchedIdempotent` recs_test.go:68) |
| N3 | `putItemState` handler (+ typed state constants, exhaustive switch) | NEW, `internal/api/handlers.go` | 1.2 | style precedent `putProgress` `handlers.go:789` (def verified); swag annotation idiom handlers.go:781–788; strict-parse posture comment handlers.go:838 ("unknown sort is 400 — the same parse posture") |
| N4 | route `r.Put("/items/{id}/state", h.putItemState)` | NEW registration, browse group | 1.2 | browse-group block `router.go:341–343` (`r.Put("/progress/{item_id}", h.putProgress)` at :343, cited exactly); sibling item PUTs live at :387/:396/:408 — no `/state` collision |
| N5 | `itemStateDTO{item_id, state, position_seconds, completed_at,omitempty}` | NEW DTO + swag | 1.2 | `progressDTO` echo idiom handlers.go:884–890 |
| N6 | `internal/api/item_state_test.go` — `TestPutItemStateWatched` / `TestPutItemStateUnwatched` / `TestPutItemStateValidation` | NEW wire tests | 1.2 | new file; package test conventions established |
| N7 | `internal/itest/qa_item_state_joint_test.go` — `TestQaItemStateRoundtrip` | NEW Tier-1 joint itest | 4.1 | precedent `internal/itest/qa_recs_roundtrip_test.go:725` (`func TestRecsRoundtrip`) on a real store; `internal/itest/` harness live (46 files) |
| N8 | Closeout regen — swag → `internal/web/api/openapi.json/.yaml` + SPA dist | 4.2 | `Makefile:72 web-build` exists; `internal/web/api/openapi.json` + `.yaml` exist on disk |

**Frontend (TS/React)**

| # | Node | Kind | Task | Grounding |
|---|------|------|------|-----------|
| N9 | `putItemState` client + `ItemStateDTO` type | NEW, `web/src/lib/api.ts` | 2.1 | idiom source `putProgress` api.ts:1188–1192 (cited exactly) |
| N10 | `useSetItemState` mutation (retry: 0, invalidate 5 families) | NEW, `web/src/lib/queries.ts` | 2.1 | 0 hits (planned-new confirmed); target keys live: `["item", id]` queries.ts:260, `["progress"]` :277, `["items", params]` :290, `["series", libraryId]` :304, `["series-episodes", seriesId]` :319 — the five prefixes element-wise prefix-match exactly those caches (no cross-family over-match: `["item"]` ≠ `["items"]`, `["series"]` ≠ `["series-episodes"]`) |
| N11 | `WatchedToggle` (`<button>`, served-flag target state, stopPropagation, aria-pressed) | NEW component in `web/src/components/WatchedStates.tsx` | 2.2 | file exists: `isWatchedElement`:18, `watchedPercent`:26, `WatchedMark`:42, `InProgressBar`:54 — the leaves it composes |
| N12 | `WatchedStates.test.tsx` extensions (three-state renders, PUT body per state, no navigation, invalidation fired) | EXTEND | 2.2 | file exists (references the tvCssContract pin at :25) |
| N13 | `Collection.tsx` — toggle mounts at item-grid cards (~1241) and episode rows (~1904); **delete `MarkWatchedRow`** (def :1588, sole usage :1258–1262) and retarget the test describe (:1071) | TOUCH + DELETE | 2.3 | `WatchedMark` at :1241 and :1904 verified; `MarkWatchedRow` def :1588 / usage :1261 verified; describe block Collection.test.tsx:1071, tests :1110–:1177 verified |
| N14 | `ItemDetail.tsx` — toggle mount at the element heading (h1 :1247, mark at :1252) + heading pin in `ItemDetail.test.tsx` | TOUCH | 2.3 | h1 at :1247 with `WatchedMark` at :1252 verified |
| N15 | `Collection.test.tsx` retarget + clamp describe; `ItemDetail.test.tsx` clamp pins | EXTEND | 2.3 / 3.2 | files exist; mounting helpers per design §Risks |
| N16 | `index.css` — `.scard .scard-title` clamp (2 lines, ellipsis) beside `overflow-wrap: anywhere` | TOUCH | 3.1 | rule at `web/src/styles/index.css:482` (cited exactly); cardact disclosure law `.cardact-trigger` at :496–535 incl. `@media (pointer: coarse)` block; `html.tv .cardact-trigger` twin at :771 (both cited exactly) |
| N17 | `web/src/lib/clampCssContract.test.ts` (readFileSync CSS contract) | NEW | 3.1 | idiom precedent `web/src/lib/tvCssContract.test.ts:6` exists (plus overlayContract/density readFileSync tests) |
| N18 | Tailwind clamp sites — flow-header `h2` (Collection.tsx:1806), item-card title span (~1242), episode-row titles (~1907), element heading `h1` (ItemDetail.tsx:1247); native `title` attr on each | TOUCH | 3.2 | all four verified at the cited lines (`<h2 className="text-xl font-semibold">` :1806; title span :1242; row span :1907–1912; h1 :1247) |
| N19 | `Synopsis` gains a `clamped` prop — set ONLY at the Collection flow-header mount (Collection.tsx:1807) | TOUCH, `web/src/components/metadata/Synopsis.tsx:23` | 3.2 | def verified; exactly two mounts live: Collection.tsx:1807 (flow header) and `InfoColumn.tsx:157` (watch view — keeps its full paragraph, untouched by every task) |

### Edges (21 — planned relations, each grounded)

**Route → handler → store chain**

| # | Edge | Owner | Grounding |
|---|------|-------|-----------|
| E1 | browse group registers N4 → N3 | 1.2 | router.go:341–343 posture comment ("writing a position is a viewer action, not an operator mutation") — the state write mirrors it (design D1) |
| E2 | N3 → `Store.GetItem` (reads `ModuleID`/`LibraryID`/`Document`) | 1.2 | `internal/store/items.go:73`; struct fields ModuleID :17, LibraryID int64 :18, Document json.RawMessage :22 — all three reads the plan needs exist on the returned `Item` |
| E3 | N3 photo gate → `photoModuleID` (`"image"`) | 1.2 | package const `internal/api/recs_ordering.go:45` (same package as handlers.go — accessible; cited exactly) |
| E4 | N3 `watched` branch → `InsertWatched(itemID, it.LibraryID, seriesPath, now)` | 1.2 | sig `recs.go:30` `(ctx, itemID string, libraryID int64, seriesPath string, completedAt time.Time)` — `it.LibraryID` is int64 (:18), types line up; `ON CONFLICT(item_id) DO NOTHING` idempotence :38–42 |
| E5 | N3 `unwatched` branch → N1 `DeleteWatched` | 1.2 | cross-task edge 1.1→1.2, same group, DAG order holds |
| E6 | N1 → one tx: `watched_items` DELETE + `playback_progress` zero-upsert | 1.1 | statement shape `PutProgress` progress.go:33–48 (`INSERT … ON CONFLICT(item_id) DO UPDATE SET position_seconds = excluded.position_seconds`, cited exactly); `CHECK (position_seconds >= 0)` is the storage backstop (progress.go:30–31 comment) — a zero upsert is legal |
| E7 | (live, unchanged) boot backfill: `ListProgressAll` → `InsertWatched` | pinned by 4.1 | `cmd/mellifera/recs_backfill.go:44` (sole live caller of ListProgressAll) → `:73`; positive-only `WHERE p.position_seconds > 0` progress.go:90 — a zeroed row can never re-ledger; `ListProgress` same WHERE :110–112 |
| E8 | (live, unchanged) detector: `watch_detect.go:67` `InsertWatched(… watchSeriesPath(doc) …)` | cited by 1.2/D3 | :67 and `watchSeriesPath` def :87 — both citations exact; reads `doc["parsed"]["series_relative_path"]`; the handler's inline mirror has in-package precedent (`display.go:464`, `recs_ordering.go:312` strField idiom); `watchSeriesPath` stays cmd-private, correctly not imported |
| E9 | N3 → post-write position read for the DTO echo | 1.2 | natural primitive `GetProgress` progress.go:60 — reads zero rows fine (no positive filter) — **but absence is an ERROR, not a zero** (Scan → sql.ErrNoRows → wrapped error): see Q3 |
| E10 | (live) default rail withdrawal: listProgress → `ListWatched` + `withdrawWatched` | pinned by 1.2 test | handlers.go:880–884 |
| E11 | (live) ledger readers whose outputs change by design after N1: flags at handlers.go:1193/:1592, score at recs_ordering.go:116, backfill ledgered-set recs_backfill.go:35 | none needed (read-time derived) | all read `ListWatched` (recs.go:54); delete changes outputs, breaks no reader — blast-radius-checked |

**SPA mutation → invalidation → surfaces chain**

| # | Edge | Owner | Grounding |
|---|------|-------|-----------|
| E12 | N10 → N9 client → PUT `/api/v1/items/{id}/state` (E1's route) | 2.1 (client) / 1.2 (server) | api.ts:1192 idiom; route shape `{id}` matches the items-route convention (router.go:340 `r.Get("/items/{id}/playback")`) |
| E13 | N10 invalidates the five families → live caches | 2.1 | queries.ts:260/:277/:290/:304/:319 (see N10 grounding) |
| E14 | N11 → N10 (`useSetItemState`, served-flag target, stopPropagation) | 2.2 | 2.2 owns the wiring; card-click navigation is the `<Link>` wrapper at Collection.tsx:1240–1256 |
| E15 | N11 mounted at N13 (cards :1241, rows :1904) and N14 (heading :1252) | 2.3 | all four live `WatchedMark` sites censused: :1241 → toggle, :1904 → toggle, ItemDetail :1252 → toggle, :1676 → **stays passive** (SeriesCard — the plan's explicit v1.1 carve-out) |
| E16 | deletion: `MarkWatchedRow` → `putProgress(itemId, duration)` callership dies | 2.3 | Collection.tsx:1591 is the ONLY `position=duration` caller in the SPA; the player's `putProgress(itemId, seconds, {completed: true})` edge (Player.tsx:167–168) is untouched and additive per the delta |
| E17 | N19 consumed at Collection.tsx:1807 only | 3.2 | sole other mount InfoColumn.tsx:157 untouched |
| E18 | test edges: N2→N1 (1.1), N6→N3/N4/N5 (1.2), N7→N1/N3/E7 joint (4.1), N15→N13/N14 (2.3), N17→index.css readFileSync (3.1) | 1.1/1.2/4.1/2.3/3.1 | all grounded above |
| E19 | N8 regen ← N3's swag annotations; dist ← groups 2–3 | 4.2 | `@Router /items/{id}/state [put]` annotation → openapi path; 4.2's `grep -qF "/items/{id}/state"` pins it |
| E20 | E13 refetch surfaces: `["progress"]` readers = Home rail (queries.ts:277; Home.tsx:434 `unwatchedRows`) + Collection card flags (:1127/:1869); `["items"/"series"/"series-episodes"/"item"]` = the grids/flow/heading | 2.1 | prefix-match adds refetches to exactly the watched-flag surfaces; `["series"]` does not element-match `["series-episodes"]` — no over-invalidation |
| E21 | `CardActions` `rows?:` prop survives the deletion (optional prop; series card keeps its own `rows` — the Постер row at :1697–1704) | no edit needed | `web/src/components/manage/ManageActions.tsx:99–105` (`rows?: ReactElement`) — prop NOT orphaned by 2.3 |

## 2. Coverage verdicts

### Wiring coverage — PASS

Every planned-new node carries an edge into the live system that a named task owns: N1
wired by 1.2's unwatched branch; N3/N4/N5 into the browse group by 1.2; N9/N10 into the
route and the five live caches by 2.1; N11 into three live mount sites by 2.3; N16/N18/N19
into live surfaces by 3.1/3.2; N7 exercises the route→store→backfill loop on a real store
by 4.1; N8 lands N3's annotations in the wire docs by 4.2. No orphan nodes. Cross-task
dependencies (1.1→1.2, 2.1→2.2→2.3, 1.x/2.x/3.x→4.1/4.2) all run forward in group order —
the group order is a valid DAG order.

### QA seam coverage — PASS

Every cross-module joint has a named test owner:

- route→handler→store parse/branch seams → 1.2's three wire tests (watched / unwatched /
  validation incl. photo + 404).
- store→ledger→backfill joint (the unwatch-vs-boot-scan invariant) → 4.1
  `TestQaItemStateRoundtrip`, annotated `@qa` with a non-empty `qa:` naming the test — the
  strict-lane mandate is satisfied, and the `tests/internal/itest/…::Test…` shape matches
  the house convention exactly (cf. archive 2026-10-31-tv-playback-unblock tasks.md:48).
- SPA mutation→route + invalidation seam → 2.2 component tests (PUT body per state,
  invalidation fired); mount→no-navigation seam → 2.3 retargeted Collection tests +
  ItemDetail heading pin.
- clamp law two-layer pin → 3.1 fs-contract + 3.2 DOM asserts (design D8's law).
- store seam locally → 1.1's table-driven test (row gone, GetProgress 0,
  ListProgressAll omits, fresh insert succeeds).

### Complexity / blast radius — PASS, with the findings in §3

- **Edges per module**: the only concentration is `Collection.tsx` (2 toggle mounts, 1
  deletion, 2 clamp sites, the Synopsis cap) — it is the hub surface by design; everything
  else lands ≤ 2 edges per file.
- **Cycle risk**: none — both chains are linear (route→handler→store;
  toggle→mutation→client→route).
- **Hidden scope (edges landing in files no task touches)**: none found. `progress.go` is
  cited for its statement shape but edited by nobody (the zero-upsert is written inside
  recs.go's new method — correct); `watch_detect.go`, `InfoColumn.tsx`,
  `ManageActions.tsx` (CardActions), and all ledger readers (E11) are referenced-only and
  need no edit.
- **Census of the touched surfaces**: all four live `WatchedMark` mounts accounted for
  (E15); the only `position=duration` caller is the row being deleted (E16); the
  `CardActions rows` prop keeps a live user (E21); route namespace collision-free (N4);
  zero-upsert legal against the CHECK (E6).

## 3. Numbered questions (recommended answers — the surveyor recommends, never decides)

**Q1 — Does the WatchedToggle mandate reach Continue rail rows?** The web-ui delta's
MODIFIED "Watched element states" carries the tri-state site list ending "…and Continue
rail rows", then mandates "On every VIDEO element the ✓ SHALL be a `WatchedToggle`
button". Live reality: rail rows render **no ✓ mark at all** — watched rows are withdrawn
from the rail (`Home.tsx:434` `unwatchedRows`; visible rows render only the progress bar,
`Home.tsx:526`), so there is no mark slot to convert, and task 2.3 mounts at exactly three
sites. Strictly read, the delta demands a toggle the tasks never mount. **Recommended
answer:** scope the toggle to the three named sites and amend the delta with one sentence
("Continue rail rows carry no toggle — watched rows are withdrawn there and the row has no
mark slot; the bulk/rail affordance rides v1.1") — OR record a waiver if the operator
reads "every video element" as the mark-slot surfaces only. Decides GATE 1 presentation
scope, not wiring.

**Q2 — The invalidation citation is a union, not a precedent.** Task 2.1 justifies the
five-family invalidation as "the same key set the watched stamps ride". No single existing
mutation invalidates those five: today's mutations invalidate narrow caller-chosen sets
(`PosterOverlay`'s `invalidate` prop — `["items"]` Collection.tsx:1191,
`["series", libraryId]` :1741, `["series-episodes", seriesId]` :1854, `["item", id]`
ItemDetail.tsx:1433), and `Player.tsx` invalidates nothing after its completion write. The
five-family set is nevertheless the correct **union** of every query that serves the
watched flag (queries.ts:260/:277/:290/:304/:319 — grounded). **Recommended answer:** no
behavioral change; optionally reword the task prose to "the union of the watched-flag
readers' key sets" so the citation stops implying an existing five-key mutation. Cosmetic.

**Q3 — The post-write position read has an absence case the task prose doesn't cover.**
Task 1.2 echoes `position_seconds` "from the post-write progress read". The natural
primitive, `GetProgress` (progress.go:60), is **not** absence-tolerant: a JOINed
`row.Scan` on a missing row returns sql.ErrNoRows → wrapped error — and a `watched` write
against an item that never started playing has no progress row. `GetProgress` reads zero
positions fine once a row exists, and the unwatched branch always finds its row (the
zero-upsert creates it), so only the watched-on-fresh-item case errors. **Recommended
answer:** pin it in 1.2's prose — the handler maps a no-progress-row read to
`position_seconds: 0` (swag notes it), or unwatched echoes 0 without a read while watched
tolerates absence. One-line amendment to task 1.2; the wire tests in N6 should carry the
fresh-item case.

**Q4 — The CardActions delta's retired scenario keeps a stale heading.** In the web-ui
delta, the scenario that replaces the Mark-watched row is still headed "#### Scenario:
Mark watched is gated on a known duration" while its WHEN/THEN body describes the row's
absence ("no Mark watched row exists at any duration … the row is gone"). The body is
right; the heading preserves the retired gate's name and will read misleadingly in the
merged living spec. **Recommended answer:** retitle the scenario (e.g. "No Mark watched
row exists at any duration") before archive — editorial, one line, no behavior.

## 4. Human resolutions (recorded at GATE 1)

**Re-audit round 1 (post-amendment).** All amendments verified against the amended
artifacts on disk (worktree; the change folder is untracked at HEAD, so the comparison ran
against the first-pass reads in full, not narration). The three changed seams re-censused
clean: the fresh-item scenario's surface (handler→`GetProgress` absence path,
progress.go:60–71 — the no-row → 0 mapping is now pinned at three altitudes: delta SHALL +
fifth scenario, design D5, task 1.2); the narrowed scope text (delta "On exactly three
mounted surfaces" == task 2.3's three mounts, one-to-one; the rail sentence matches the
grounded reality — Home.tsx:434 withdraws watched rows, :526 renders only a percent bar;
no residual "every VIDEO element"/rail-toggle language anywhere in the delta); the
fresh-item test's seam (`TestPutItemStateWatchedFreshItem` prefix-matches the unchanged
1.2 duty pattern `TestPutItemState`; route-level mapping logic adequately covered by the
1.2 wire test — 4.1's itest keeps the ledger/backfill loop). Graph delta: E9 gains its
absence-mapping pin; N6 names four tests (was three); node/edge counts unchanged (19/21).
All three coverage verdicts stand. Labeling caution (not a question): design.md's own
"Q1–Q6" are the planner's operator questions — unrelated to the surveyor's Q1–Q4 below.

| # | Question | Resolution (amend / waive + notes) | Decided by |
|---|----------|------------------------------------|------------|
| Q1 | Rail rows under the toggle mandate | **Resolved by amendment** — web-ui delta "Watched element states" re-scoped: Sites list now ends at the element page heading + explicit sentence "Continue-rail rows render no mark — watched rows are withdrawn from the rail by default"; the toggle mandate now opens "On exactly three mounted surfaces" (item-grid cards, series-flow rows, element heading) == task 2.3's mounts exactly | Human (GATE 1 amendment round 1) |
| Q2 | "watched stamps ride" citation | **Resolved by amendment** — task 2.1 and design D6 now read "the union of the watched-flag readers (the five query families whose served rows carry the watched flag)"; the nonexistent-precedent phrasing is gone | Human (GATE 1 amendment round 1) |
| Q3 | GetProgress absence on the echo read | **Resolved by amendment** — task 1.2 pins the post-write `GetProgress` read with no-row → `position_seconds: 0` (never an error), swag-noted; wire tests gain `TestPutItemStateWatchedFreshItem` (duty pattern still prefix-matches); playback-progress delta gains the SHALL sentence + fifth scenario "A watched write on a never-started item reads position zero" (grammar-valid: 4-hashtag heading, WHEN/THEN); design D5 pins the same mapping | Human (GATE 1 amendment round 1) |
| Q4 | Stale CardActions scenario heading | **WAIVED with reason** — scenario headings are immutable under the pinned openspec 1.14.0 (planner proved from the pinned tool's dist source: no scenario-level RENAMED; MODIFIED must carry every current heading or archive refuses). Heading "Mark watched is gated on a known duration" verified unchanged on disk (web-ui delta:150); the rewritten body carries the operator's intent (no row exists at any duration; the WatchedToggle is the only manual path) | Human (GATE 1 amendment round 1) |

**Frontier at re-audit close: EMPTY** — Q1–Q3 resolved by amendment and re-verified here;
Q4 explicitly waived with the tool-immutability reason. New questions surfaced by the
amendments: **none**. GATE 1 approval may be requested.
