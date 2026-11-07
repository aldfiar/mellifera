# Design

## Context

See proposal.md — Why. Ground truth this design stands on (all re-verified
against this worktree at base 6c89cb9; `evidence: file:line`):

- `items.display_title` is a generated column over `$._view.title.value` only
  (`internal/store/open.go:80-81`) — it misses title overrides, template
  composition, and the title walk. Search over it is wrong, not just lossy.
- display_name is composed at read time in `internal/api/display.go` (doc
  block :4-8; `namerFor` :76 = GetLibrary + ONE whole-library
  `QuerySeries(libraryID, "")` :84; composition decodes each row's document,
  `docMap` :246-254). Per-keystroke whole-library composition is genuinely
  expensive (~50 MB JSON decode at 10k items) — the read-time walk is
  refuted; an index built ONCE by the same composer is mandatory.
- The metadata projection the About panel renders lives beside the composer as
  `namer` methods: `metadataFor` (`internal/api/metadata.go:40`) and
  `aboutBlock` (:109); the DTO seam calls them at `handlers.go:1515/:1588`.
  Facets must run the SAME resolver or they diverge from About.
- `titleSourceBinding` is the exported-field pair at `handlers.go:170`; the
  composer's inputs ride it through slices, so a type alias keeps the wire
  byte-identical.
- Browse-group routes are `requireRole(RoleAdmin, RoleClient)`
  (`internal/api/router.go:259-260`, routes :262-303); all three new routes
  mount there; nothing is admin-gated.
- Home is 1+N today: `GET /progress` + per-started-series
  `GET /series/{id}/episodes` (`web/src/lib/nextup.ts:131-135`); that store
  read is a `substr(relative_path,…)` prefix scan carrying FULL documents
  (`internal/store/series.go:188-193`). The SPA's `module_id === "tv"` literal
  sits at `nextup.ts:102` — its only site.
- Janitor registry (`cmd/mellifera/janitor.go:17-21`): `janitorTask{name,
  interval, fn}`, boot-run SYNCHRONOUS before ListenAndServe (`runBoot`
  :39-46; `cmd/mellifera/main.go:573-577` registers `streams`+`art`, boot-runs,
  then serves); `interval<=0` disables one task. Boot-warm rides this
  precedent — no new knob.
- Nil-safe closure idiom (`router.go:64-71` OnProgress, :128-140
  OnSourceGateChanged): cmd-built closures keep api free of new imports; L5
  pokes ride the same pattern. Zero new api exports.
- Enrich keeps a private `episodeFacts` duplicate
  (`internal/enrich/episode_titles.go:203`) — it STAYS; consolidation is a
  flagged follow-up, never smuggled into this change.
- Store and api sit at the 12-export budget (mellifera-build check.sh); the
  extraction MOVES symbols out of api (surface shrinks), and `internal/browse`
  arrives at ≤8 exports.

Design size (all budgets quoted against it): 10k items / 1k series / ≤50
progress rows (dev DB today: 989 episodes / 88 series).

## Goals / Non-Goals

**Goals:**

- Search, facets, and home serve from a RAM read model built once at boot by
  the composer itself; SQL matching is never asked to do Unicode work.
- The index never lies: it decides only WHICH ids match; every served display
  byte is composed live at request time (stale index can degrade recall,
  never display).
- One composer implementation serves display names (api), search entries and
  facet values (browse), and rec-sorting tags — no second resolver.
- Store stays untouched: no new tables, no FTS5, no migrations, no new store
  methods in the core path.
- Budgets hold at design size and are pinned by tests (see ACs).

**Non-Goals:**

- No photos in search v1 (reopening path named: filename as a second match
  leg).
- No next-up cache: `/home` computes picks live (budget headroom is huge);
  index-served next-up would need progress invalidation that does not exist.
- No pagination on search (fixed 8+8; `offset` is the named L7-TV seam).
- No per-user dimension in the INDEX (the index stays shared/full, built via
  access.System() at rebuild — design D2 unchanged). Per-user visibility IS
  in scope at SERVE time: tasks 3.1–3.3 thread the caller's Viewer on all
  three routes — visible-library scoping on hits/counts/rows and
  `v.ChainMutes` into `namerFor` (amended after l6-accounts shipped: it
  landed without inserting any allow-list here — these routes did not exist
  yet).
- No enrichment `episodeFacts` consolidation (follow-up, flagged).
- No L7 TV input handling, no tmdb-enrichment code (films ride the same
  composer/resolver with zero extra core code when they arrive).

## Decisions

- **D1 — Extract `internal/naming` first (mechanical, behavior-free).** The
  pure composer core moves verbatim out of `internal/api/display.go` +
  `metadata.go`: the `namer` struct (:37-65), `seriesName` (:143),
  `sourceTitle` (:179), `pickLanguage` (:211), `docMap` (:246), `strField`,
  `sourceStr`, `intField`, `itemName` (:372), `elementName`, `elementFacts`,
  `episodeFacts` (:455), `factNamespaces`, `composeItemName`,
  `validElementTemplate`, `pad2`, `lastSegment`, `viewTitle`, **plus
  `metadataFor`/`aboutBlock`** (metadata.go:40/:109 — OQ2 default: they move
  too; keeping them api-side would make browse depend on api). The api-side
  `titleSourceBinding` (:170) becomes `type titleSourceBinding =
  naming.TitleSourceBinding` — aliases are transparent through slices, wire
  byte-identical. `namerFor`/`elementTemplate` stay api-side (they read
  `app.deps`). Dependency direction: `api → naming → store`, nothing imports
  api. Golden title vectors (`TestGoldenTitleVectors`) + metadata projection
  tests pin byte-identity. Alternative declined: leave the composer in api
  and let browse import api — inverts the dependency, busts the api export
  budget, and couples a pure package to the HTTP edge.
- **D2 — `internal/browse` RAM read model.** One new package, ≤8 exports,
  doc.go, table tests per export, `-race` tested; imports NOTHING internal —
  all store/naming access arrives as cmd-built `Deps` closures (recs-D6
  posture). Index state: search entries (series + items of media libraries)
  carrying per entity the composed served name as top tier PLUS the walk's
  unpicked alternates (other languages, parser title, `dir_name_raw`) at
  lower match rank (reviewer Q1: a ru-pref module composes «Ария» via
  pickLanguage, so composed-name-only makes "aria" a miss). Match tiers:
  alternate-names match < composed-substring < composed-prefix; alphabetical
  (display_name asc, then id) tiebreak. Matching = Go Unicode fold +
  bidirectional ё→е — the ONE shared transform applied at index-write and
  query-time. Facet aggregates per library (genres/kind/status) are counted
  by RUNNING the same naming resolver per series document at rebuild time
  (reviewer Q5: a naive first-namespace-with-genres walk diverges from About
  when an earlier namespace carries description but no genres); no carrier →
  facet key absent; count 0 → value omitted. Alternatives declined:
  FTS5 + persisted projection + epoch table (buys recall-at-scale we don't
  need; DDL + external-content sync vs a 3 MB RAM model; violates the
  derived-not-persisted precedents — enrichment "no queue table", recs "score
  never persisted") and search over `display_title` (wrong, not just lossy —
  misses overrides/composition).
- **D3 — Never-lies serving (the honesty backstop).** The index decides only
  WHICH ids match; the handler maps hits → live rows → existing DTO
  composition via `namerFor`, memoizing ONE namer per DISTINCT RESULT LIBRARY
  per request (reviewer Q7 — the bound is "distinct result libraries", not
  ≤2; the cost is ≈ one grid page render, which does strictly more).
  Artwork resolves at query time over the bounded hit set.
- **D4 — Invalidation: janitor owns correctness, pokes own latency.**

  | Seam | Mechanism | Latency |
  |---|---|---|
  | Boot | janitor boot-warm, synchronous pre-serve (janitor.go:39-46 precedent) | before serve |
  | Scan complete | cmd fan-out → browse wake (OnProgress pattern) | ≤1 rebuild |
  | Enrichment merges, source-gate flips | 60 s tick reconcile: watermark walk over changed rows + orphan sweep (re-identify mints new ids) | ≤60 s |
  | Naming-config drift (library PATCH, prefs, modules, title_overrides) | two-part scalar epoch (max updated_at **+ row count** — reviewer Q3: deletes trip the count) recomputed per tick from cheap scalar reads; drift ⇒ slice/full rebuild | ≤60 s |
  | Title override PUT/DELETE, identify | `Deps.OnTitleChange` poke (nil-safe closure, fires on DELETE too — Q3) | ~immediate |

  Named decision (reviewer Q4): gate flips change the chain with zero row
  writes (seam exists: OnSourceGateChanged :128-140) — recall for
  config-driven name changes may lag ≤60 s BY DESIGN; display never lags
  (backstop). The gate-flip poke is added anyway since the seam is free.
- **D5 — `/home` is its own read model, recs-ordered.** One route composes ≤50
  ContinueRows server-side: progress rows ordered by the rec-sorting score
  (rec_score desc, `updated_at` desc tiebreak — contract inheritance), per row
  the series + current item through `namerFor`, duration taken from the
  stored ffprobe fact (absent → field omitted, honest), artwork resolved at
  query time over the bounded set, and the next pick = the lowest
  `(season, episode)` strictly after the highest-started one — tuple parity
  with the watch page's `nextup.ts` derivation pinned by test. Alternatives
  declined: `?group=series` on `/progress` (shape-branching param smell;
  /progress stays recs-owned) and a persisted `series_progress` aggregate
  (user-scale data, flat under 10× growth; the designed shape is the named
  L6 migration point — per-user progress forces persistence then, wire
  unchanged).
- **D6 — SPA consumes served bytes only.** `SearchPalette.tsx` (DialogShell
  overlay, ⌘K/Ctrl+K, 120 ms debounce + AbortController — the itest asserts
  BOTH the request count AND the abort path, reviewer Q9b; ↑↓↵Esc; rows
  render served arrays verbatim; honest empty/no-result/canonical-error with
  retry:0, the identify idiom), `FacetChips.tsx` (served values verbatim,
  active chip = color change, absent for photo libraries, fetched once per
  view), Home.tsx (single `/home` call; progress bar only when duration
  exists; deletes the `module_id === "tv"` literal; nextup.ts keeps
  `episodeFacts`/`nextEpisodeAfter` for the watch page and drops the
  home-only derivation exports).
- **D7 — Wire (3 new routes, browse group, additive only).**

  ```
  GET /api/v1/search?q=<q>&library=&limit=
  → {"series":[…≤8…], "items":[…≤8…]}          // bounded 8+8, ranked server-side
    empty q → 200 empty lists (browsing is facets' job — Q9a)
    photos excluded v1; s01e02 grammar accepted; no-match → empty, not error

  GET /api/v1/libraries/{id}/facets
  → {"facets":[{"key":"genres"|"kind"|"status","values":[{value,count}…]}]}
    absent key = no chips; photo libraries → empty list (honest)

  GET /api/v1/home
  → {"continue":[ContinueRow…]}                // ≤50 progress rows bounded
    ContinueRow {series_id, series_display_name, library_id, library_name,
                 artwork?,
                 current:{item_id, display_name, season?, episode?,
                          episode_title?, position_seconds, duration_seconds?},
                 next?:{item_id, label}}       // omitted when none
    ordering: rec_score desc, recency tiebreak (contract inheritance)
  ```

  Facet filtering: additive `?genre=/kind=/status=` on `/series` and
  `/items`, resolved via browse id-set + in-Go filter (whole-library raw scan
  ≈10-30 ms at design size — tolerable; the ~2k-filterable-rows escalation
  trigger, a write-time `items.series_id` column, applies to ITEMS too —
  Q9d). Composes with library/path_prefix/sort params (PR #19 precedent).

- **D8 — Budgets (ACs), verbatim.** keystroke→paint ≤200 ms p95 (120 ms
  debounce + server ≤10 ms + LAN + render) · `/home` ≤50 ms server p95 ·
  facets ≤10 ms · index build ~300-800 ms boot, off the read path (~3.3 MB
  RAM) · CI: loose timing smoke on a 10k-item fixture; hermetic itests assert
  request counts (1/keystroke, 1/home).

## Interfaces (cross-group)

- `internal/naming` (group 1 → consumed by 2, 3): exported composer surface —
  `naming.Namer` + constructor over (group style, active template,
  series-by-path map, title sources, language prefs, source chain, mutes
  map[string]bool [l6-accounts 10.4 — the calling Viewer's ChainMutes,
  display.go:66-74], moduleID [rec-sorting photo carve-out — the library
  row's bound module id, display.go:75-80]),
  `naming.TitleSourceBinding`, and the name/metadata methods the api DTO seam
  calls (SeriesName / ItemName / MetadataFor spellings settle at build).
  `namerFor`/`elementTemplate` remain api-side and construct the namer.
- `internal/browse` (group 2 → consumed by 3): ≤8 exports — the Deps struct of
  cmd-built closures (compose inputs: library rows, series rows, item rows,
  the naming resolver; NO internal imports), the index service (build, wake,
  reconcile, epoch), and the serving queries (search hit ids, facet
  aggregates). api receives its serve closures through `api.Deps` (cmd-built,
  the fact-7 idiom) — api gains NO new imports and NO new exports.
- cmd (group 3): janitor task `browse` (boot-warm + 60 s tick; `interval<=0`
  disables the whole task — OQ4), scan-complete + gate-flip pokes,
  `Deps.OnTitleChange` poke fired api-side on title-override PUT/DELETE and
  identify, Deps closures into `api.New`.
- Wire (group 3 → consumed by 4, 5): D7's three routes + filter params; OpenAPI
  + dist regen closes the loop (`PATH="$HOME/go/bin:$PATH" make web-build`).
- SPA (group 5): palette/chips/Home per D6; `web/src/lib/api.ts` +
  `queries.ts` gain the three typed calls.

## Risks / Trade-offs

- [Index staleness ≤60 s on config-driven changes] → honesty backstop (D3)
  keeps display fresh; pokes cover the hot seams; the lag is a named,
  reviewer-ruled decision (Q4).
- [RAM growth at 10× library] → ~3.3 MB at design size measured by fixture
  test; the ~2k-filterable-rows trigger forces the write-path escalation
  (items.series_id) for facets AND items alike (Q9d).
- [Extraction drift] → move is verbatim; golden title vectors +
  metadata-projection tests pin byte-identity; enrich's duplicate is NOT
  consolidated here.
- [swag/regen drift] → committed openapi greps for the three paths in the
  regen task's duty.
- [cmd coupling] → browse imports nothing internal (Deps closures); api gains
  only nil-safe closure fields — the export budget holds.
- [ё→е fold surprises] → one shared transform, table-tested bidirectionally at
  index-write and query-time.

## Migration Plan

Sequencing: lands after `recommendation-sorting` (its score model is `/home`'s
ordering input; its D8 + task 4.1 already carry the amendment recording this
change as the home-rail supersession — no further edits to that change). One
openspec change, three PRs at merge time (OQ3): PR A = naming extraction (no
wire change, golden vectors green); PR B = `internal/browse` → cmd wiring →
api routes/filter params/pokes → joint itest; PR C = SPA + regen + glossary +
gates. No DDL anywhere — rollback is per-PR revert; the wire is additive only,
so clients built against the old surface keep working throughout.

## Open questions (all resolved to their stated defaults)

- **OQ1 Photos in search**: excluded v1 (media libraries only); reopening path
  = filename as second match leg. — RESOLVED: exclude.
- **OQ2 metadataFor placement**: moves WITH the composer into internal/naming
  (facets must call it; keeping it api-side would make browse depend on api).
  — RESOLVED: moves.
- **OQ3 One change vs three**: one openspec change `browse-scale`, three PRs.
  — RESOLVED: one.
- **OQ4 Sweep cadence**: 60 s tick; the janitor's `interval<=0` disables the
  whole task (no separate warm flag — Q9c). — RESOLVED: 60 s.
- **OQ5 `library=` param on /search**: optional scope, omit = all; L6 replaces
  with the allow-list. — RESOLVED: ship it.
- **OQ6 Search bound**: fixed 8+8, no pagination; revisit only if L7 TV needs
  pages (`offset` on the same arrays). — RESOLVED: 8+8.
- **OQ7 D8 amendment timing**: done — recorded in rec-sorting's D8 + task 4.1
  while that change is untracked. — RESOLVED: already applied upstream.
