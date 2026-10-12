# Design: film-name-parsing

## Context

The shared package already parses the degenerate film case
(`pkg/releasename/parse.go:41-66` — "A name carrying no season and no episode
parses as the degenerate film case: title plus release fields, Season 0,
Episode 0"); what is missing is entirely at the adapters and in three grammar
corners. Verified by running the package on the real names (outputs quoted in
proposal.md Why):

- `plugins/serial-parser/parser.go:47-97` Match has two branches:
  `serial_record` → series parse; otherwise `parseEpisodeFilename`, and
  `ok=false` → `applies=false` ("no episode number in filename"). A numberless
  video file item — a film — dies exactly there.
- `releaseTagTokens` (`pkg/releasename/tags.go:44-57`): no `amzn` source
  token; the codec role has only run-together forms (`h264`, `h265`), and the
  flexible-separator expansion (`tags.go:158`, `parse.go:329`) only expands
  DASHES — a dot between letter and digit (`H.264`) never matches.
- `cutTrailingGroupTag` (`tags.go:192-198`) cuts a trailing SINGLE word
  clearing the CamelCase group-shape rule; the dash-joined `CR-Cassu` splits
  into `Cassu` (no interior capital → not group shape) and survives.
- Anti-case evidence: `Some.Movie.1080p.Spider-Man.mkv` parses to
  "Some Movie Spider-Man" today — a consumed-position anchor ALONE would
  strip it, so the anchor needs a shape gate too (D-3).
- The serial joint e2e pins the numberless file-backed episode as a skipped
  stage (`internal/itest/qa_serial_e2e_test.go:459-463`) and the plugin tables
  pin two numberless skip rows (`parser_test.go:206-208` `Feature.mkv`,
  `:355` + `:374` incl. the unified-parser qa 4.1 "tagged film stem stays
  skipped" canonical row) — all deliberate ripples of the film path (D-1).
- tv-parser routes through `ParseEpisodeName`/`EpisodeNumberOf`
  (`plugins/tv-parser/tvparse.go:46-47`), so the shared title helpers are its
  regression surface; `TestMatchAdversarialEdges` (`parser_test.go:341`)
  pins `-E02` (single-part tail, no consumed tag before it) and `Show-S01E02`
  — both inert under the narrow rule (D-3).

## Goals / Non-Goals

Goals: films in serial libraries show parsed titles and release fields; the
three real names parse clean; zero season/episode fabrication on the film
path; no cross-binary regression.

Non-goals: JP↔EN title aliasing (backlog B3/TMDB); the enrichment
restart-sweep bug (separate backlog row — the film parse lands on rescan);
tv-parser title FLAG edges (stay pinned); SPA changes (none needed — the
footer composite skips silently, `ParserFooter.tsx:94-119`, and `_view.title`
flows through the shipped Merge/provenance path); season inference on film
items.

## Decisions

- **D-1 — the film branch is adapter-level (Match fallthrough), not a package
  change.** `ParseName` already returns the no-season result; Match's episode
  fallthrough (`parser.go:77-81`) gains: when the episode helper says
  `ok=false`, parse `filepath.Base(relative_path)` through `ParseName`; apply
  with `{title, ...release fields}` at confidence 0.6 unless the title is
  empty. `parseEpisodeFilename` keeps its episode-only contract — the
  numberless skip rows flip at Match level only, so the episode grammar tables
  stay honest about episode extraction. The two pinned numberless rows move to
  the new film table (D-7); `TestEpisodeNameGrammar` keeps only true episode
  rows plus the non-video skip row.

- **D-2 — video-extension gate exported from the package.** The film branch
  applies to VIDEO names only ("a video item" — scope). The extension set
  lives once, in `pkg/releasename` (`parse.go:151-155`); export a small
  predicate (e.g. `HasVideoExt`) instead of replicating the set a third time
  (the scanner already replicates its own `videoExt`, `walk.go:377-379` —
  scanner code is untouched here). This keeps `Credits.ass` a skipped stage in
  `TestEpisodeMatch` and anywhere else.

- **D-3 — dash-form group rule = consumed-position anchor + shape gate.** The
  anchor alone over-strips (`Some.Movie.1080p.Spider-Man.mkv`), the shape
  alone cannot separate `CRCassu` from `SpiderMan`. The rule fires only when
  ALL hold: (a) the name ends with a dash-joined token of exactly two
  non-empty ASCII letter-word parts; (b) the text immediately before the token
  (leading separators trimmed) is a position where a release-tag token or
  bracketed segment was stripped — no title text between; (c) the token's
  first part is an all-caps acronym (letters only, ≤ 5); (d) the dash-removed
  combined form clears the existing group-shape rule (`isGroupTagShape`,
  `tags.go:123-142`). Implementation: the strip passes already know their
  spans — `scanReleaseTags` collects tag offsets (`parse.go:350-357`) and
  `stripBracketSegments` walks segment offsets (`tags.go:78-96`); track the
  LAST consumed span end over the raw name and cut the trailing token from the
  title when the trimmed remainder after that span equals exactly that token.
  Implement inside the shared title pipeline (beside
  `cutTrailingGroupTag`, called from both `ParseName` and `episodeTitle`) so
  series and episode titles read identically; the pinned tv-parser edges stay
  the regression guard (`-E02` is single-part → (a) fails; `Show-S01E02` has
  no consumed tag before the tail → (b) fails).

- **D-4 — vocabulary additions are plain literals; emission canonical form is
  the literal.** `amzn` joins the source role; `h.264`, `h.265`, `x.264`,
  `x.265` join the codec role (the dot is a quoted literal in the compiled
  pattern — no dash expansion involved). Emission keeps the table form, so
  `H.264` emits as `h.264` in the codec list. D-7 posture: role-keyed neutral
  lists, the literal is data.

- **D-5 — confidence 0.6 flat on the film path.** The series path steers by
  season-marker explicitness (`parser.go:57-61`); the film path by definition
  has no consulted marker, so there is nothing to steer with. No season or
  episode key is written even when the name carries a season marker
  (`Show.S01.mkv` → title only) — the serial module's always-season rule is
  series-scoped.

- **D-6 — year stays in film titles.** Not a release-tag token (the bare-year
  rule, serial-library "Name-driven inference"); the parser emits Year as a
  field and the title keeps the year word. The Chainsaw fixture asserts BOTH:
  "2025" in the title AND year 2025 in the field — no year-stripping rule
  exists in the pipeline (verified: consistent with the pinned
  `Some.Movie.2020.1080p.WEB-DL.x264 → "Some Movie 2020"` row).

- **D-7 — test layout.** `pkg/releasename`: new rows in `TestFilmNameParse`
  (box 1.1: Chainsaw + Spider-Man; box 1.2: Demon Slayer) and emission rows in
  `TestEmissionFields` if needed. `plugins/serial-parser`: new table
  `TestFilmMatch` (box 2.1: the two real names, `Show.S01.mkv`,
  `Feature.mkv`, `Credits.ass` skip) via the existing `runChain` helper;
  canonical dash-form rows added to `TestSeriesNameGrammar` (box 1.3, the
  file-backed shape) per cross-binary consistency. Fixture names as string
  literals only (D-8 posture: probes never read /Volumes).

## Interfaces (cross-group)

1. **`pkg/releasename` → adapters.** The grammar additions are
   behavior-compatible surface: new vocabulary entries and one new title rule;
   `Result` unchanged. Every adapter suite (`plugins/serial-parser`,
   `plugins/tv-parser`, `plugins/serial-scanner`) is part of box 1.3's probe —
   a binary drifting from the shared tables fails there.
2. **serial-parser Match → core.** The film path emits only
   `{title, resolution?, source?, codec?, language?, year?}` into
   `sources.serial-parser` through the unchanged Merge/provenance path; the
   core's `_view`/`_provenance`/`_stages` stamping is untouched (no core
   change). The SPA reads `_view.title` and the skip-silent footer composite —
   verified, no web change.
3. **itest contract.** After the change: a numberless video item under a
   serial directory carries `sources.serial-parser` (film parse) and a
   `{serial-parser ok}` stage; the file-backed-episode assertions at
   `qa_serial_e2e_test.go:459-463` flip from "absent namespace + skipped" to
   "film namespace + ok" (box 3.1), and the new `TestQAFilm_JointItemParse`
   (box 3.2) pins the two real movie files end to end.

## Risks / Trade-offs

- [Dash rule over-strips a hyphenated title that directly follows a consumed
  tag and starts with an acronym (e.g. `Title.1080p.IT-2019`)] → the gates are
  conjunctive and narrow; the accepted residue risk is bounded to
  acronym-initial dash tokens after consumed tags, which in scene naming are
  group tags. The Spider-Man rows pin the ordinary case.
- [tv-parser title drift through the shared `episodeTitle`] → box 1.3's probe
  runs the tv-parser suite; the two pinned adversarial edges are provably
  inert (D-3).
- [Film path applies to extras files inside serial dirs (a `Making Of.mkv`
  gains the title "Making Of")] → intended: the item already existed and
  showed its raw name; it now shows a cleaned title. Nothing else about the
  serial changes.
- [Vacuous probes] → the joint-test probe greps the RUN and the PASS lines (a
  SKIP — no ffprobe — fails the probe), and the unit probes name real test
  functions, not the whole package.
- [Enrichment restart-sweep: existing film items do not re-parse until
  rescanned] → known backlog row (out of scope); the operational remedy stays
  a manual rescan.

## Migration Plan

No data migration: parsed facts are derived state, recomputed on the next scan
(manual rescan until the restart-sweep backlog row lands). Rollback = revert
the binaries; no persisted schema changes.

## Open Questions

None — the scope was agreed with the user before authoring; the residual
judgment calls (dot-form x264/x265 completion of "the hevc forms as needed",
the acronym shape gate) are recorded as D-4 and D-3.
