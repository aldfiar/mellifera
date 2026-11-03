# Integration survey — recommendation-sorting

Surveyor record, propose phase (openspec-loop §Propose step 4). Source map
CURRENT at f03a3f3 (worktree `recommendation-sorting`, base main). Plan
artifacts: proposal.md, design.md, tasks.md (13 tasks / 5 groups), specs/
deltas (recommendation-sorting, playback-progress, web-ui). Read-only audit;
findings cite `file:line` or the map. The surveyor recommends, never decides —
resolutions are the human's at GATE 1.

**RE-RUN (amendment round 2026-11-03):** the human adopted all seven answers;
the planner amended design.md (Interfaces: enrich resolver home; D6/D7
score-then-window; wake = select-on-ctx, no close), tasks.md (2.2 enrich
resolver, 3.1 handler-side windowing, 3.3 ModuleID branch, 5.4 bare path
dropped, 1.1/1.2 `@qa` + `qa:` lists, all 13 `verify:` duties), and the
recommendation-sorting delta (photo carve-out SHALL + scenario) — all
validated strict. This record is refreshed in place: §3 questions carry the
re-run status, §4 holds the adopted answers, §5 holds the re-verification
evidence. Map note: rebuilt this round, fingerprint unchanged, but the index
carries 427 files with `symbols=0` — no Go symbol rows — so every Go anchor
below is grounded by targeted live-source grep, not map rows.

## 1. Planned graph

### Nodes — NEW (planned)

| # | Node | Task | Grounding |
|---|---|---|---|
| n1 | `internal/recs` pure package: Score fn, tag normalization (casefold+trim), ordering helper, tier constants (≤8 exports) | 1.1 | new path — nothing on disk (re-verified 2026-11-03: absent); design D6 |
| n2 | store table `watched_items` (item_id PK, library_id, nullable series_relative_path, completed_at, nullable applied_at) | 1.2 | new DDL; additive anchor `internal/store/open.go:38` (schemaSQL) |
| n3 | store table `tag_weights` (tag PK normalized, weight, updated_at) | 1.2 | new DDL, same anchor |
| n4 | store methods `InsertWatched` / `ListUnappliedWatched` / `ApplyTagWeights` / `ListTagWeights` (primitive signatures) | 1.2 | planned-new; budget idiom verified: `.claude/skills/mellifera-build/scripts/check.sh:21-46` (warn >8, fail >12; counts top-level `func/type/var/const [A-Z]` only — exported methods are budget-free, re-verified 2026-11-03) |
| n5 | cmd watch detector — OnProgress fan-out sibling of `newThumbRegrab` | 2.1 | planned-new; seam exists: `internal/api/router.go:72`, fired `internal/api/handlers.go:769-770` |
| n6 | cmd recs wake channel (poke on completion insert) | 2.1/2.2 | planned-new machinery; wake precedent `cmd/mellifera/main.go:238-241` (library-notify), `:538`/`:546` |
| n7 | cmd janitor task `recs` (boot-run + 60 s tick + wake; sweep→resolve→+1 tx→stamp) | 2.2 | registry exists: `cmd/mellifera/janitor.go:17-34` (janitorTask/newJanitor), day-one tasks `streams`+`art` (`:23-28`) |
| n8 | api scored composition in `listSeries` | 3.1 | `internal/api/handlers.go:1256`, route `router.go:327` |
| n9 | api scored composition in `listItems` (+ `sort=path` opt-out, rec_score on itemDTO) | 3.1 | `internal/api/handlers.go:923`, route `router.go:308` |
| n10 | api progress `rec_score` + score/recency order + `sort=recent`, single-item route carries rec_score | 3.2 | `handlers.go:790` (listProgress), `:824` (getProgress), route `router.go:338-340` |
| n11 | web Next up orders by served rec_score; Continue renders served order (no-op today) | 4.1 | `web/src/lib/nextup.ts` (nextUpEntries), `web/src/pages/home/Home.tsx:424` (ContinueRow) |
| n12 | joint itest enrich→watch→apply→serve | 5.1 | harness verified, §3 |

### Nodes — TOUCHED (live anchors)

| # | Anchor | Grounding |
|---|---|---|
| t1 | `Deps.OnProgress func(ctx, itemID string, position int64)` | `internal/api/router.go:65-72` — matches the invocation's "~line 65-72" |
| t2 | seam fire after successful PutProgress, nil-safe | `internal/api/handlers.go:769-770`; nil-check `:769` |
| t3 | `OnProgress: newThumbRegrab(st, mgr)` wiring | `cmd/mellifera/main.go:371` (design cited :364 — cosmetic drift, anchor real) |
| t4 | janitor named registry | `cmd/mellifera/janitor.go:17-73`; tick-only loop `:50-73` — NO wake machinery today (new-authored, n6) |
| t5 | `PutProgress` :33 / `GetProgress` :60 / `ListProgress` :79 (`ORDER BY p.updated_at DESC, p.item_id` :85) | `internal/store/progress.go` |
| t6 | `QuerySeries` — `ORDER BY relative_path` :125/:130, unpaged (all rows of a library) | `internal/store/series.go:118-153` (design cited :125-156 — holds) |
| t7 | `QueryItems` — def :94, `limit <= 0` → nil,nil :95-97, `ORDER BY id LIMIT ? OFFSET ?` :115, SQL-windowed | `internal/store/items.go:94-130` (re-verified 2026-11-03 from live source) |
| t8-t11 | handlers listProgress :790 / listItems :923 / listSeries :1256 / getProgress :824 | `internal/api/handlers.go`; routes `router.go:308,327,338,339` |
| t12 | DTOs: progressDTO :260 (`item_id, position_seconds, updated_at` — matches the delta shape), seriesDTO :295 (carries `display_name` :310-311 — the tie-break anchor; `artwork,omitempty` / `metadata,omitempty` — the additive-omitempty precedent), itemsResponse :281 | `internal/api/handlers.go` |
| t13 | `schemaSQL` additive DDL anchor | `internal/store/open.go:38` |
| t14 | `ContinueRow` renders `progress.data?.items` verbatim — NO client re-sort today | `web/src/pages/home/Home.tsx:424-426` (task 4.1's "drop client re-sort if any" → none exists; the row is already a served-order renderer) |
| t15 | `nextUpEntries` — per started series in PROGRESS RECENCY order today; `nextEpisodeAfter` watch-page sibling untouched per D8 amendment | `web/src/lib/nextup.ts:123-181` |
| t16 | `ProgressDTO` wire type | `web/src/lib/api.ts:162`; fetcher `:988`; queries `web/src/lib/queries.ts:270` (useProgressList), `:295` (useSeries), `:310` (useSeriesEpisodes) |
| t17 | itest harness boots real binaries | `internal/itest/integration_test.go:227` (`startServer`); full-joint precedent `qa_playback_roundtrip_test.go` (scan→enqueue→package→serve) |

Also grounded (referenced by the plan):

- `Item.Document json.RawMessage` + `CreatedAt time.Time` — `internal/store/items.go:14-27`; `Series.Document` + `CreatedAt` — `internal/store/series.go:24-32`. The ffprobe blob rides the document (no ffprobe column — grep open.go: none); NEW_WINDOW's `created_at` anchor real.
- Genres carrier rule today: `internal/api/metadata.go:30` (`metadataFactKeys` — genres ride the synopsis group), `:40-98` (`metadataFor` first-carrier walk over `namer.chain`, chain gate-resolved CMD-side via `enrich.ResolveGates`). Unexported, method on `namer` (`internal/api/display.go:37,64`).
- INV2 import wall: `internal/api/doc.go:54` — api MAY NOT import `internal/enrich` (also `internal/api/enrich_admin.go:24`). cmd imports enrich freely (`main.go` ModulePresentation).
- enrich headroom (re-run): 11 top-level exports today (live grep, no generated .go in the package) — the Q1 resolver export lands it at 12, inside the fail bar (>12 fails), WARN band (>8).
- Episode→series join precedent: `internal/api/display.go:389-457` (server-side, `parsed.series_relative_path`), SPA-side `web/src/lib/nextup.ts:15-22`.
- Per-series episode table: dedicated route `GET /series/{id}/episodes` — `router.go:329` → `handlers.go:1343`; backing read `ORDER BY relative_path` — `internal/store/series.go:205`. NOT served by listItems → narrative order untouched by the grid default.
- Library row carries `ModuleID` — `internal/store/libraries.go:21` (photo-kind detection anchor; re-verified 2026-11-03: `ModuleID string` at :21; `internal/api/libraries.go` does not exist — the Q3 correction's premise).
- `make check` wraps the real script — `Makefile:26-27` → `bash .claude/skills/mellifera-build/scripts/check.sh`. **`scripts/check.sh` does not exist in this tree** (`ls scripts/` → dev.sh only).
- Living-spec delta anchors: `Progress read endpoints` exists at `openspec/specs/playback-progress/spec.md:75` (MODIFIED valid); `Continue and Next up consume served scores` absent from living web-ui (ADDED valid); `recommendation-sorting` absent from `openspec/specs/` (new capability valid).

### Edges (planned)

| # | Edge | Task | Anchor status |
|---|---|---|---|
| e1 | handlers PutProgress → Deps.OnProgress → fan-out{newThumbRegrab (existing), newWatchDetect (new)} | 2.1 | GROUNDED (t1-t3) |
| e2 | watch detector → `store.GetItem` → parse doc `ffprobe.format.duration` → ≥90% → `InsertWatched` (idempotent PK) → poke wake | 2.1→n2/n4/n6 | GROUNDED (Item.Document; ffprobe readers precedent in `internal/stream/describe.go` et al.) |
| e3 | janitor task `recs` → `ListUnappliedWatched` → resolve tags via the enrich resolver (genres-of-winning-document beside `ResolveGates`, `internal/enrich/gates.go:25`; episode→series join via `parsed.series_relative_path` + library_id) → `ApplyTagWeights` one tx → stamp `applied_at` | 2.2→n2-n4/n7 | GROUNDED (Q1 resolved: home = internal/enrich; design Interfaces + task 2.2 amended; api keeps its unexported namer projection) |
| e4 | `listSeries` → batched reads (QuerySeries + progress + watched + weights) → recs.Score → sort score-desc, ties display_name/id → seriesDTO.rec_score | 3.1→n1/n8 | GROUNDED (t6, t12; QuerySeries unpaged — scoring all rows is cheap) |
| e5 | `listItems` → same composition → itemDTO.rec_score, `sort=path` opt-out; score-then-window per D7: full filtered set → recs score+sort in Go → offset/limit in the handler | 3.1→n1/n9 | GROUNDED (Q2 resolved: no SQL-window collision — the score order never reaches QueryItems' SQL, items.go:115; full-set read is NEW machinery — `limit <= 0` returns nil today, items.go:95-97 — as an api-side QueryItems paging loop it stays inside task 3.1's scope, or a budget-free store method per n4) |
| e6 | `listProgress` → rec_score per row → order score-desc/recency (`sort=recent`); `getProgress` → rec_score | 3.2→n1/n10 | GROUNDED (t5, t8, t11); note: score-order must apply before the SQL LIMIT — full-row fetch then cut (progress table is one row per item, bounded) |
| e7 | SPA `useProgressList` → ContinueRow renders served order (unchanged code) ; Next up orders by served rec_score of the series' latest progress row, ties recency | 4.1→n11 | GROUNDED (t14-t16); D8 amendment pins the interim shape (browse-scale GET /home supersedes the home rail later) |
| e8 | joint itest: scan/enrich → PUT progress ≥90% → detector insert + wake → janitor pass → GET /series,/items,/progress assert scored order + ledger idempotency | 5.1→all | GROUNDED (t17; harness shape §3) |
| e9 | swagger + SPA dist regen (rec_score fields + sort params on three GET routes) | 5.2 | GROUNDED (@Param precedent handlers.go:911-921; web-build target Makefile:72) |
| e10 | janitor registration: task `recs` after `art` in the `newJanitor(...)` call | 2.2→n7 | GROUNDED (janitor.go:34; registration site in main.go beside streams/art) |

## 2. Check verdicts

### Wiring coverage — PASS (re-run: both grounded gaps RESOLVED)

Every planned node carries an edge into the live system a task implements:
n1 consumed by n8-n10 (e4-e6); n2-n4 written by n5/n7 and read by n8-n10;
n5 rides the existing seam (t1-t3); n7 rides the existing registry (t4).
Orphan check: none — no new module lacks a caller. The two original grounded
gaps are resolved by the amendment round: the resolver home is named
(internal/enrich beside `ResolveGates`, gates.go:25 — Q1) and the pagination
composition is score-then-window in the handler (D7 + task 3.1 — Q2, no
SQL-window collision, see e5). Note (unchanged): the wake channel (n6) is
NEW machinery — the janitor loop is ticker-only (`janitor.go:50-73`); tasks
2.1/2.2 author it, with the `main.go:238-241` library-notify wake as the
in-tree precedent; the wake send is select-on-ctx, never a close (Q6
resolved).

### qa seam coverage — PASS via the dedicated cross-module QA task

Task 5.1 is the dedicated cross-module QA task (enrich→watch→apply→serve,
Tier-1 joint) and the harness shape supports it: `startServer` boots real
binaries (`integration_test.go:227`); `qa_playback_roundtrip_test.go` is the
scan→serve full-joint precedent; the progress PUT route exists
(`router.go:340`); the wake poke (e2) makes the janitor pass prompt in-test
(no 60 s sleep needed); enriched-fixture precedent
(`qa_media_data_joint_test.go`). Seam-local joints carry their own tasks:
2.3 (cmd↔store restart/idempotency probes), 3.3 (api↔recs ordering goldens),
1.1 in-task table-driven tests. The mandate-level note (Q7) is RESOLVED:
tasks 1.1 and 1.2 now carry `@qa` + non-empty `qa:` lists — five
internal/recs test nodes, four internal/store test nodes (tasks.md:7-12).

### Complexity / blast radius — PASS (re-run: all findings resolved or gate-recorded)

- Edge density lands in: cmd/mellifera (main.go, janitor.go — t3, t4),
  internal/api (handlers.go, router.go — t1, t8-t12), internal/store
  (open.go, new recs store file), web (Home.tsx, nextup.ts, api.ts). All in
  the task file contracts. Hidden-scope check (re-run): none — the Q2
  full-set read stays inside task 3.1's api scope (QueryItems paging loop)
  or adds a budget-free store method (n4); the Q1 resolver lands in
  internal/enrich, which cmd already imports.
- Photo libraries: RESOLVED (Q3) — the delta now carries the mechanism
  carve-out SHALL ("a library served by a photo-scanner module SHALL always
  serve path order... by mechanism, not by tie-break accident") plus a
  WHEN/THEN scenario, and task 3.3 names the branch on the library row's
  ModuleID (anchor re-verified: internal/store/libraries.go:21;
  internal/api/libraries.go does not exist).
- Cross-branch: the tv-mode branch (PR #24 open, deployed to TV test)
  consumes `/progress` + Home/nextup shape; this change lands first on main,
  so the TV surfaces inherit the scored default at integration — ACCEPTED
  as sequencing (Q5), recorded in review.md at the gate.
- Wake close hazard: RESOLVED (Q6) — design Interfaces now specify a
  select-on-ctx send, no channel close.
- 5.4 path: RESOLVED (Q4) — the bare `scripts/check.sh` is gone; the duty
  is `make build && make check && make lint && (cd web && npx vitest run &&
  npx tsc --noEmit)`; every named target exists (Makefile build:14, test:18,
  lint:22, check:26, web-build:72) and web carries vitest + tsc binaries.
- Cosmetic drift (no questions): design cites main.go:364 (actual :371);
  task 1.2's `ListTagWeights` appears in its qa: list but design Interfaces
  still name three store methods — "naming settled at build" covers it.
  New note: task 4.1's prose names Home.tsx + Home.test.tsx while its
  verify also gates `web/src/lib/nextup.test.ts` (the file exists today,
  0 rec_score hits — red as intended); a coder following the prose alone
  costs at most one red-verify loop.

## 3. Numbered questions (recommended answers; the human decides)

**RE-RUN STATUS (2026-11-03): all seven questions RESOLVED — the human
adopted every recommended answer and the planner amended the artifacts
accordingly (all validated strict). The question frontier is CLOSED: no new
human-only question was raised by the re-run. §4 records the adopted
answers; §5 holds the re-verification evidence. The original question text
below is retained as the historical record.**

**Q1 — Where does the janitor's tag resolver live?** D1/task 2.2 say
"resolve tags via the gate-resolved chain genres", but the first-carrier
genres walk exists only as `namer.metadataFor`/`aboutBlock` — unexported,
package api (`internal/api/metadata.go:40-121`). cmd/mellifera cannot call
it; exporting from api spends the hard export budget (check.sh fails >12;
api sits at it per design Context). INV2 bars api from importing enrich
(`internal/api/doc.go:54`), which is exactly why the chain arrives
cmd-resolved today. *Recommendation:* put the genres-of-winning-document
walk in `internal/enrich` beside `ResolveGates` (cmd already imports enrich;
api is unaffected and keeps its own projection), and have task 2.2 compose
`ResolveGates` + the enrich resolver. Amend design Interfaces + task 2.2 to
name that home. Alternatives: export a narrow helper from api (budget risk),
or duplicate the ~15-line walk in cmd (two first-carrier implementations —
drift risk the served contract cannot afford).

**Q2 — How does score-desc ordering compose with listItems pagination?**
`QueryItems` windows in SQL (`ORDER BY id LIMIT ? OFFSET ?`,
`internal/store/items.go:115`; API default 50, max 200 — handlers.go:923
`parsePagination`). A score-desc default ordered within each SQL page only
would mis-order across pages (page 2 could outrank page 1). *Recommendation:*
score-then-window — the handler fetches the FULL filtered set (a new
primitive-signature store read, or QueryItems with an unwindowed sentinel —
`limit <= 0` currently returns nil, items.go:98-100), scores via recs, sorts,
then applies offset/limit in Go. RAM = one library's items (583 in dev), the
posture browse-scale's RAM model supersedes later. Series listing is already
unpaged (`QuerySeries`, series.go:118) — unaffected.

**Q3 — How do image libraries keep path order under the score-desc default?**
The spec (recommendation-sorting delta, Served ordering) and task 3.3 require
photo libraries untouched, but listItems serves photo libraries too
(chip lanes via `path_prefix` — `web/src/pages/collections/Collection.tsx:1040-1049`):
all-zero scores tie-break by `display_name` asc then id — NOT today's
path/insertion order. The plan names no detection mechanism. *Recommendation:*
server-side — branch on the library row's module kind (the row carries
`ModuleID`, `internal/store/libraries.go:21`; the handler already fetches the
library row via `namerFor`) and force path order for photo-scanner modules
regardless of the `sort` default; spell it in task 3.1 and the delta. SPA-side
`sort=path` passing would work but leaves the server contract violated for
non-SPA clients.

**Q4 — Task 5.4 names `scripts/check.sh`, which does not exist.** G2
relocated target: the export-budget/gate script is
`.claude/skills/mellifera-build/scripts/check.sh`, wrapped by `make check`
(`Makefile:26-27`). The 5.4 line already lists `make check` separately, so
the bare path is both wrong and redundant. *Recommendation:* amend the 5.4
line to drop `scripts/check.sh` (make check already runs the real script) —
cheap now, pre-approval.

**Q5 — tv-mode branch consumes the reordered surfaces.** PR #24 (open,
deployed to TV test) reshapes Home/nextup and consumes `/progress` on its
branch; this main-based change flips the `/progress` default order and grid
defaults. At integration the TV kiosk inherits scored ordering. *Recommendation:*
accept — served order IS the product intent — and sequence it: land
recommendation-sorting first, rebase tv-mode onto it, TV retest covers the
ordering shift; record the accepted consequence in review.md at GATE 2. The
D8 amendment already pins the watch-page `nextEpisodeAfter` tuple parity,
which is the TV-critical derivation.

**Q6 — "Wake channel closed on process exit" is a send-on-closed hazard.**
Design Interfaces close the channel at exit; the watch detector pokes it on
every completion insert — a PUT in flight at shutdown can send on a closed
channel (panic) under the fan-out's log-and-skip contract. The janitor loop
already exits on ctx.Done (`janitor.go:62-68`) and the in-tree wake
precedent (`main.go:238-241`) carries no close. *Recommendation:* drop the
close — the poke does a select-on-ctx send and the channel is garbage with
the process; amend one line in design Interfaces.

**Q7 — @qa annotations on the new-module tasks are absent.** Strict-lane
mandate: new-module tasks carry `@qa` + a non-empty `qa:` list naming the
tests that WILL cover the joint; tasks 1.1/1.2 (new package, new tables)
carry neither — cross-module coverage rests on the dedicated task 5.1 plus
probes 2.3/3.3. The register cannot detect the mandate; GATE 1's human
checks it. *Recommendation:* annotate 1.1/1.2 (and optionally 2.1/2.2) with
`@qa` + `qa:` entries naming 5.1's itest and the task-local test
procedures — or record here the human's explicit decision that 5.1 + 2.3 +
3.3 constitute the QA coverage and waive the annotation.

## 4. Human resolutions

Recorded at the amendment round (2026-11-03; waiver authority is the human
only — no waivers granted, all seven adopted as recommended).

| # | Resolution (approved / amended / waived + note) |
|---|---|
| Q1 | APPROVED — resolver home = `internal/enrich` beside `ResolveGates` (genres-of-winning-document walk, exported for cmd; api keeps its unexported namer projection). Homes: design.md Interfaces (internal/enrich bullet) + task 2.2 prose. Re-verified: gates.go:25; enrich 11→12 top-level exports, inside the fail bar. |
| Q2 | APPROVED — score-then-window in the handler: full filtered set, score+sort via recs, offset/limit in Go, never SQL-window order under the score default; series listing unpaged, unaffected. Homes: design.md D6/D7 + task 3.1 prose. Re-run: no QueryItems collision (its windowing, items.go:115, never receives the score order); the full-set read is new machinery — api-side paging loop (inside task 3.1's scope) or a budget-free store method. |
| Q3 | APPROVED — server-side mechanism carve-out: photo-scanner-module libraries serve path order regardless of score. Homes: recommendation-sorting delta (carve-out SHALL + "Photo libraries keep path order regardless of score" scenario) + task 3.3 (ModuleID branch). Anchor corrected to internal/store/libraries.go:21 — verified; internal/api/libraries.go does not exist. |
| Q4 | APPROVED — task 5.4 drops the bare `scripts/check.sh` path (RELOCATED target, absent from the tree); duty = make build/check/lint + web vitest + tsc, no full suite. All named targets verified present. |
| Q5 | ACCEPTED as sequencing — recommendation-sorting lands first, tv-mode rebases onto it, the TV retest covers the ordering shift; recorded in review.md at the gate (no artifact edit, by design). |
| Q6 | APPROVED — wake-channel close dropped; design Interfaces specify a select-on-ctx send (no close; the janitor loop exits on ctx.Done; the in-tree wake precedent carries no close). |
| Q7 | APPROVED — tasks 1.1/1.2 carry `@qa` + non-empty `qa:` lists (five internal/recs nodes; four internal/store nodes; tasks.md:7-12). |

## 5. Re-run verification (amendment round 2026-11-03)

Against the amended artifacts and live source at HEAD f03a3f3 (tree
unchanged since the original survey; map rebuilt, fingerprint unchanged):

- **Q1 seam real.** `ResolveGates` sits exactly at
  `internal/enrich/gates.go:25` — `func ResolveGates(mod module.Module,
  prefs []store.MetadataSourcePref, libraryID int64)
  []module.MetadataSourceBinding`; the genres-of-winning-document walk can
  live beside it; cmd already imports enrich; api is doubly barred (INV2 +
  export budget) and untouched. Headroom: enrich carries 11 top-level
  exports (live grep, no generated .go in the package) → 12 with the
  resolver, inside the >12 fail bar, WARN band.
- **Q2 no collision.** `QueryItems` windows in SQL (`ORDER BY id LIMIT ?
  OFFSET ?`, items.go:115) and returns nil for `limit <= 0` (items.go:95-97)
  — so no full-set read exists today and the amended D7 correctly forbids
  pushing the score order into SQL. The handler-side fetch-score-sort-window
  composition is coherent; the full-set read is new machinery whose natural
  shapes are a QueryItems paging loop (api-side, inside task 3.1's scope) or
  a new store method (budget-free — check.sh counts top-level declarations
  only, exported methods never count).
- **Q3 anchor verified.** `ModuleID string` at internal/store/libraries.go:21;
  `internal/api/libraries.go` does not exist (the correction's premise
  holds). The delta carries the carve-out SHALL + scenario; task 3.3 names
  the ModuleID branch.
- **13 duties mechanically sound and red today.** All 13 tasks carry exactly
  one `verify:` line. Every targeted-test duty's `test -f` gate is red: all
  nine named new test files absent (incl. `internal/recs/recs_test.go` — the
  package itself absent). 4.1's grep gates red: both test files EXIST
  (`web/src/lib/nextup.test.ts`, `web/src/pages/home/Home.test.tsx`) with 0
  `rec_score` hits. 5.2's grep red: `internal/web/api/openapi.json` exists
  (132 KB, 0 hits) and `make web-build` regenerates it (Makefile:72-75).
  5.3's greps red: GLOSSARY.md, 0 hits for both entries. 5.4's targets all
  present (build:14, test:18, lint:22, check:26, web-build:72) and web
  carries vitest + tsc binaries.
- **Q7 grammar satisfied.** 1.1 `@qa` + 5-entry `qa:` list; 1.2 `@qa` +
  4-entry `qa:` list (tasks.md:7-12) — non-empty as the strict lane mandates.

Residual notes (non-blocking; no question raised):

1. enrich lands at exactly 12 top-level exports with the resolver — inside
   the fail bar, WARN band; any further enrich export splits the package.
2. Task 4.1's prose names Home.tsx + Home.test.tsx while its verify also
   gates `web/src/lib/nextup.test.ts` (file exists, 0 hits — red as
   intended); at most one red-verify loop for the coder.
3. The source map indexes 427 files but extracts zero Go symbols
   (`symbols=0` after a fresh build, fingerprint unchanged) — every Go
   anchor above is grounded by targeted live-source grep with `file:line`;
   wf-reviewer should re-ground Go edges the same way at the gate.
4. Q5's resolution lives in review.md at the gate, not in an artifact — by
   design (a sequencing record, not a plan edit).
