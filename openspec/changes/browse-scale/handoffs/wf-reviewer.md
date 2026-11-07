# wf-reviewer → session — browse-scale GATE 2 verdict

Written: 2026-11-07 · reviewer re-runs at HEAD 079f743, worktree `/Users/aldfiar/projects/go/mellifera.worktrees/browse-scale`
Evidence: 20 verify receipts `--by wf-reviewer` (19 green, 1 red — git-check, artifact), the diff at 079f743 (70 files, +11616/−2851), the five spec deltas, integration.md, handoffs. Belief lives here; receipts + diff are evidence.

## Verdict

**Overall: APPROVED** (human archive approval may be requested).
- **Spec axis: PASS** — every delta requirement/scenario verified landed, including the AMENDED additive-only facet reading.
- **Standards axis: FLAG** — five judgement-call findings (below), zero hard violations; none blocking.

## Obligation 1 — verify re-runs (20/20 invoked, receipts `--by wf-reviewer`)

19 GREEN: 1.1 1.2 2.1 2.2 2.3 3.1 3.2 3.3 3.4 3.5 3.6 4.1 5.1 5.2 5.3 5.4 6.1 6.2 6.3 (6.3 rc 0: go test cache-hit green — tree byte-identical to the 08:28 full-suite run, input-keyed cache sound; check.sh OK live; web vitest 52 files / 697 tests live; tsc live).

**git-check RED — read before acting.** The re-run failed ONLY on the loop's own gate-phase handoff records: `M handoffs/session.md` (the session's Wave-12/GATE-2 record, authored AFTER the 08:31:22 green receipt) and `?? handoffs/wf-reviewer.md` (this file). Not one product file. The task's substance — tree committed @ 079f743, branch pushed — verified directly: `git status -sb` = `## feature/browse-scale...origin/feature/browse-scale` (0 ahead / 0 behind). Task verdict: PASS on substance; the red receipt honestly journals the current tree and resolves itself in the close choreography (commit the handoff records, re-verify git-check green). **Close requires that re-run — do not close off my red receipt.**

## Obligation 2 — diff vs spec deltas: PASS

- **global-search**: route in the browse group (router.go); empty q → 200 empty before any read (search.go:153-158); photos excluded by corpus walk (`MediaType == "image"` skip, browse_wiring.go); visibility conjunct via viewer-scoped GetSeries/GetItem with silent ErrNoRows drop + v.ChainMutes (search.go:166-202, 208-218); tiers prefix>substring>alternate + name/id tiebreak + 8+8 bound (browse/search.go:32-36, 150-185); one shared fold ё→е at write+query (search.go:65-71); honesty backstop (ids → live rows → live composition); freshness = boot-warm janitor + OnTitleChange pokes on put/delete/identify (titles.go ×2, identify.go ×1, all nil-safe after confirmed writes) + scan/gate wakes + two-part epoch (max updated_at + row count → deletes converge).
- **library-facets**: same-resolver aggregates (cmd resolver wraps `Namer.MetadataFor`; browse/facets.go buildFacets); winner-without-genres contributes nothing; absent key omitted; count-0 structurally impossible; photo → empty non-nil; denied library → 404 not_found exactly like getLibrary (facets.go:79-86); **AMENDED reading landed**: full trio on /series (handlers.go:1719/:1737), /items genre/kind only with `facets.status` explicitly blanked (handlers.go:1263-1264/:1317), /items' own `status` untouched (enrichment-lifecycle); unknown value → 200 empty; intersection preserves fetched order (composes with library/path/sort). openapi.json spot-check: /series params genre/kind/status; /items params genre/kind + its own status.
- **home-continue**: ≤50 cut AFTER score order (home.go:48, 131-138); row shape byte-matches the delta; ordering scoreProgress→orderByScoreRecency; honest duration floors (home.go:420-446); live composition; Viewer-scoped + visibility-conjunct + ChainMutes; next pick strictly-after tuple parity, films never carry next (homeNextPick :392-411); watched-rows posture documented in the file header (:20-26) — deltas silent, needed for next anchors: consistent.
- **recommendation-sorting delta**: /home serves scored rows server-side; `/progress` contract untouched — zero diff hunks touch progress handlers; recs_ordering.go changes purely mechanical (type/method moves + one commented inline strField read).
- **web-ui delta**: single /home request pinned by test (Home.test.tsx — exactly-ONE home call + zero /progress URLs at :302); served bytes verbatim; bar only with duration_seconds; next affordance = served label → next.item_id; no client derivation (NextUpRow/NextUpCard, startedSeries/nextUpEntries/seriesKey, `module_id === "tv"` all zero-hit in web/src); badge-only on absent artwork (isServedArtPath gate); shared empty state; watch page untouched (nextup.ts keeps episodeFacts/EpisodeFacts/NextUpEntry/nextEpisodeAfter; InfoColumn/AutoNext/ItemDetail imports intact); second MODIFIED requirement (served-scores re-scope) present in the delta — archive-safe.
- All six GATE-1 resolutions verified landed in the artifacts (move closure, viewer threading, web-ui supersession, 4.1 contract, design Non-Goal reword, facets-delta visibility clause).

## Obligation 3 — removed/renamed symbols: no caller outside the diff

Map carries no Go symbol rows (backend limitation, documented in integration.md) → grep sweep per the code-search miss protocol, `wf index query callers` attempted first (none-in-map ×12):
- metadataFor/aboutBlock/castBlock/episodeBlock/verbatimMember/metadataFactKeys: live only inside internal/naming, in-package callers; api/metadata.go deleted as a tracked rename (`internal/{api => naming}/metadata.go`); About seam calls `Namer.MetadataFor` (handlers.go:2122/:2195).
- startedSeries/nextUpEntries/seriesKey/StartedSeries: zero code refs — comments only (watchedRows.ts:10, watchedRows.test.ts:9, nextup.test.ts:11 tombstone, nextup.ts:8). NextUpRow/NextUpCard + `module_id === "tv"`: zero hits.
- Renamed surface: namer→naming.Namer ripple all in-diff; itemTags/genresFor → ItemTags/GenresFor with in-diff callers (recs_ordering.go:260/:304).

## Obligation 4 — integration.md re-ground: holds

E7 (scoreProgress: home.go:126 + pre-existing handlers.go:1039), E8 (namerFor + v.ChainMutes on all three new routes and every existing browse route), E24 (viewer threading verified live + the joint invisible-library clause). Orphan check clean: every naming export consumed outside the package (Namer 48 refs, DocMap 16, ItemName 12, SeriesName 5, EpisodeFacts 2, TitleSourceBinding 2); every browse export consumed (Deps/Entry/Kind/Epoch in wiring, Service/NewService at main.go:273, search core in-package); api keepers present (namerFor display.go:61, elementTemplate :105, withSeriesOverride :127, alias handlers.go:182). Dependency direction holds: browse imports only encoding/json+sync; naming→store; api→naming; nothing imports api. **Waivers: recorded EMPTY (§6 + §7.3), verified on disk. Frontier: EMPTY, verified.** Joint-test spot-reads: the invisible-library clause is the anti-tautology shape (denied viewer still hits its OWN library; 404 on /facets; raw-byte leak scan on /home); the gate-flip clause pins dormancy (no poke on disable) and scoping (libDeny facets survive); no sleep-bound waits.

## Obligation 5 — Standards axis: FLAG (judgement calls, none blocking)

Recorded deviations, judged:
1. **browse 11 exports vs D2's ≤8** (mechanical gate warn>8/fail>12; check.sh OK) — design-goal miss, honestly recorded in browse/doc.go:27-29; the hard gate is >12. Judgement call: ACCEPT with note; a future consolidation (SearchIndex/NewSearchIndex/Hits folding into the Service surface) would close it.
2. **977-line joint test file vs the 500-line limit** — test file, single-test-name duty (`-run TestBrowseScaleJoint`), bulk is the byte-faithful cmd-mirror fixture glue. Judgement call: ACCEPT; flag fixture extraction as follow-up hygiene.
3. **/home watched-rows-NOT-withdrawn posture** (documented home.go:20-26) — deltas silent; /progress untouched; completed rows are the next anchors. PASS.
4. **1.1 runner deviations** — exported-field Namer + direct naming.Namer signatures (design Interfaces licenses "spellings settle at build"); qa tests in-package (no `tests/` dir in this repo; ALL 19 qa-named test nodes verified present, duties re-run green). PASS.
5. **3.6 walk-entry placement** — sound: corpus delegates to walk; the clear covers corpus/changed/liveIDs passes under mu; multi-pass test pins reconvergence. PASS.

New findings from my own sweep (route to follow-ups, none gate-blocking):
6. **watchedRows.ts is now dead production code** — 5.3 removed its last consumer (unwatchedRows/isWatchedRow have zero imports anywhere; only its own 8-test file remains, green in the suite) and its header comment describes the retired architecture. P2 → delete module + test in a follow-up.
7. Stale comments referencing retired derivations (watchedRows.ts:1-10, watchedRows.test.ts:9). P3 → sweep with #6. (nextup.test.ts:11 is a deliberate tombstone — fine.)
8. New long functions (homeLibRows ~158, walk ~105 lines) — consistent with the house norm (pre-existing handlers run 100-273 lines). Judgement call: no action.
9. `s01e02` grammar acceptance has no dedicated test pin — mechanically guaranteed (composed names carry SxxEyy; substring tier folds through). P3 note.
10. /home next-pick started-max derives from the bounded (≤50) response rows — a >50-row viewer whose highest-started row falls outside the window could be re-offered a started episode. Design-consistent (D5 bounds deliberately; the window mirrors what the old client derivation read). P3 observation, no v1 action.

## Per-task verdicts

1.1 PASS · 1.2 PASS · 2.1 PASS · 2.2 PASS · 2.3 PASS · 3.1 PASS · 3.2 PASS (amended reading verified in code + openapi) · 3.3 PASS · 3.4 PASS · 3.5 PASS · 3.6 PASS · 4.1 PASS · 5.1 PASS · 5.2 PASS · 5.3 PASS · 5.4 PASS · 6.1 PASS · 6.2 PASS · 6.3 PASS · git-check PASS on substance (re-run red on gate-phase handoff records only; committed+pushed verified directly — re-derive green at close).

## Handoff threads

`wf handoff inbox browse-scale --role wf-reviewer`: 0 open items (rc 0). No blocking thread.

**Gate line: Approved.** Close note for the session: commit the handoff records, re-run `verify browse-scale git-check` to green, then human archive approval per the loop.
