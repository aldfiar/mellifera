# Proposal

## Why

Every list surface is alphabetical-by-path and Home is a flat Continue rail. On
a grown library (design size: 10k items / 1k series / ≤50 progress rows)
nothing says "this has a new episode", nothing finds a title without walking
collections, and genre/kind/status live in the About panel only. Two hard
constraints shape the fix: the embedded SQLite's SQL `LIKE`/`lower()` are
ASCII-only (a Cyrillic library can never be matched by SQL), and per-keystroke
read-time composition decodes whole-library documents (~50 MB JSON per
keystroke at 10k items) — so search and facets need a small RAM read model
built once by the same composer that serves display names, not more SQL. Now,
because recommendation-sorting reorders the same surfaces and `/home` inherits
its ordering contract (its D8 amendment already records this change as the
home rail's supersession).

## What Changes

- NEW `GET /api/v1/search` (browse group): server-side search over COMPOSED
  served names — never the `display_title` generated column, which misses
  title overrides, template composition, and the title walk. Grouped bounded
  results (series ≤8 + items ≤8), Cyrillic-capable via Go Unicode fold plus a
  bidirectional ё→е fold, match tiers (composed-prefix > composed-substring >
  walk alternates), empty query → 200 empty lists, photos excluded in v1,
  optional `library=` / `limit=` params.
- NEW `GET /api/v1/libraries/{id}/facets`: genre/kind/status values verbatim
  with counts, computed at rebuild time by the SAME resolver as the About
  panel (one implementation for About, facets, and rec-sorting tags); plus
  additive filter params — the full `?genre=` / `?kind=` / `?status=` trio on
  `/series`, genre and kind only on `/items` (the `/items` `status` param
  name is pinned to the enrichment-lifecycle filter by the living specs —
  plugin-pipeline "Item status over the API" and async-enrichment's
  `GET /api/v1/items?status=` passthrough — so facet-status has no additive
  home there).
- NEW `GET /api/v1/home`: the home continue rail in one round-trip — ≤50
  server-bounded ContinueRow entries (series, current item with position and
  honest duration, optional next-episode pick), ordered by the rec-sorting
  contract (rec_score desc + recency tiebreak).
- NEW `internal/naming`: the pure display-composer core extracted verbatim
  from `internal/api/display.go` + `metadata.go` (byte-identical wire, pinned
  by the golden title vectors); `namerFor`/`elementTemplate` stay api-side.
- NEW `internal/browse`: the RAM read model (search entries + facet
  aggregates) built once at boot by the janitor, kept fresh by pokes plus a
  60 s reconcile; imports nothing internal (cmd-built Deps closures); NO new
  tables, NO FTS5, NO migrations (~3.3 MB RAM at design size). The index
  decides only WHICH ids match — display bytes are always composed live (the
  honesty backstop).
- cmd: janitor task `browse` (boot-warm synchronous pre-serve + 60 s tick),
  scan-complete and source-gate-flip pokes, Deps wiring into the api.
- SPA: ⌘K search palette (debounced, abortable), facet chips on serial/film
  grids, Home swaps the 1+N progress/episodes fan-out for the single `/home`
  call (the client Next-up derivation leaves the home surface; the watch
  page's derivation is untouched).
- OpenAPI + embedded SPA dist regenerated; GLOSSARY gains Search index /
  Facet / Continue row.

## Capabilities

### New Capabilities

- `global-search`: `GET /search` — composed-name matching (tiers, ё→е fold,
  walk alternates), bounded grouped results, index freshness and the
  honesty backstop.
- `library-facets`: `GET /libraries/{id}/facets` plus the additive filter
  params — genre/kind/status on `/series`, genre/kind on `/items` —
  About-consistent facet values, honest absence, additive filtering.
- `home-continue`: `GET /home` — one-round-trip continue rows, the inherited
  rec-sorting order, the next-episode pick contract.

### Modified Capabilities

- `recommendation-sorting`: the capability's spec gains the home-rail serving
  requirement — the home continue rail is served by `GET /home` (score desc +
  recency tiebreak, composed server-side) instead of a client derivation over
  the `/progress` listing (the D8 supersession, home rail only); the
  `/progress` contract itself is unchanged.
- `web-ui`: the home surface renders served `/home` rows in a single request;
  the client Continue/Next-up derivation and its per-series episode fan-out
  are removed from home; the watch-page next-episode derivation is untouched.

## Impact

- Code: `internal/naming` (new), `internal/browse` (new), `internal/api`
  (three routes + filter params + `OnTitleChange` poke + composer extraction),
  `cmd/mellifera` (janitor task + pokes + Deps closures), `web/src` (palette,
  chips, Home rewire, nextup.ts trim), `internal/store` (READ-ONLY — no DDL,
  no new methods required by this change's core).
- Wire: three additive GET routes + the additive facet filter params
  (genre/kind/status on `/series`; genre/kind on `/items`) in the browse
  group (admin+client); nothing existing changes shape; **no breaking
  changes**.
- Docs: `GLOSSARY.md` (3 entries); committed `internal/web/api/openapi.*` +
  embedded SPA dist regenerated via `PATH="$HOME/go/bin:$PATH" make
  web-build`.
- Budgets (ACs): keystroke→paint ≤200 ms p95 · `/home` ≤50 ms server p95 ·
  facets ≤10 ms · index build ~300-800 ms boot, off the read path (~3.3 MB
  RAM).
- Sequencing: lands after `recommendation-sorting` (0/13, untracked) — its
  score model is `/home`'s ordering input and its D8 amendment names this
  change as the home-rail supersession. One openspec change, three PRs at
  merge time (A: naming extraction; B: browse + api + cmd; C: SPA).
