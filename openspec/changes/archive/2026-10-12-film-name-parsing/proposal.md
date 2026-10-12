# Proposal: film-name-parsing — films in serial libraries parse to clean titles

## Why

Films living in serial libraries stay raw filenames: `serial-parser` skips every
numberless video file (no season/episode token → `applies=false`), so
`_view.title` is never written and the SPA falls back to the raw name. The
shared grammar also leaves residue on real movie names — verified by running
`pkg/releasename` on them:

- `Demon.Slayer.Kimetsu.No.Yaiba.Infinity.Castle.1080p.CR-Cassu.mkv` →
  title `"Demon Slayer Kimetsu No Yaiba Infinity Castle CR-Cassu"` (the
  dash-form group tag `CR-Cassu` survives; the trailing-group rule only cuts a
  single CamelCase word).
- `Chainsaw.Man.The.Movie.Reze.Arc.2025.1080p.AMZN.WEB-DL.H.264-EniaHD.mkv` →
  title `"Chainsaw Man The Movie Reze Arc 2025 AMZN H 264"` (`AMZN` is absent
  from the source vocabulary; the dot-form `H.264` is absent from the codec
  vocabulary and dot-splitting mangles it to `H 264`).

The user's three URLs (two movie items and their series row in library 3) are
the acceptance floor.

## What Changes

- **Film path in `plugins/serial-parser`:** a video file item with NO
  `serial_record` marker and NO extractable season/episode now APPLIES through
  the shared parser's no-season path — it emits `title` plus the structured
  release fields (resolution/source/codec/language/year), NEVER a season or
  episode key (none is fabricated), at confidence 0.6. The stage stays skipped
  only for non-video names and names yielding an empty title. The film branch
  lives in the adapter's `Match` fallthrough; the episode extraction helpers
  and their skip semantics are untouched.
- **Grammar additions in `pkg/releasename`** (base level, resource-neutral):
  `amzn` joins the source vocabulary; the dot-form codec variants `h.264`,
  `h.265`, `x.264`, `x.265` join the codec vocabulary beside their run-together
  forms; and a NARROW trailing dash-form group rule — a dash-joined two-part
  token (e.g. `CR-Cassu`) strips when it immediately follows a stripped
  release-tag or bracket-segment position at the name's end AND its first part
  is an all-caps acronym; ordinary hyphenated title text (`Spider-Man`) never
  strips, not even after a consumed tag (`Some Movie 1080p Spider-Man` keeps
  its title).
- **Year stays in film titles** (the user asked only for the technical residue
  gone); the parser also emits the year as a field.
- **itest ripple:** the serial joint e2e's file-backed-episode assertions
  (`sources.serial-parser` absent, skipped stage) are re-derived — that
  numberless file now carries the film parse — and a new joint test pins the
  film path end to end (item documents gain `sources.serial-parser` with title
  + release fields, no season/episode; `_view.title` set; numbered-episode
  control unchanged).

## Capabilities

### New Capabilities

None — every delta extends an existing capability.

### Modified Capabilities

- **`release-name-parsing`** — MODIFIED "Single shared grammar and vocabulary":
  the source role gains `amzn`, the codec role gains the dot-form variants
  (`h.264`, `h.265`, `x.264`, `x.265`), and the trailing group-tag rules gain
  the narrow dash-form rule; scenarios over the two real movie names and the
  cross-binary regression sweep.
- **`serial-library`** — MODIFIED "Episode-level enrichment in serial libraries"
  (the apply rule broadens: episode number OR the film path), MODIFIED
  "Name-driven season, episode, and title inference" (the dash-form rule joins
  the series stripping order; the numberless-filename sentence now points at
  the film path), ADDED "Film-file enrichment in serial libraries" (the
  film-path contract and its scenarios). Discovery, storage, sidecars,
  watch-flow, and additivity requirements are untouched.

## Impact

- `pkg/releasename` — `tags.go` vocabularies + the dash-form rule;
  `parse.go` title pipeline wiring; the package's grammar tables gain rows
  (`TestFilmNameParse`, `TestSeriesNameGrammar`, `TestEmissionFields`).
- `plugins/serial-parser` — `parser.go` `Match` gains the film fallthrough;
  `parser_test.go` re-derives the two numberless skip rows
  (`TestEpisodeMatch`'s `Feature.mkv`, `TestEpisodeNameGrammar`'s
  numberless + tagged-film rows) into film-apply rows and gains a film table.
- `plugins/tv-parser` — no code change; its characterization suite must stay
  green (`TestMatchAdversarialEdges` pins two known FLAG edges — leave them
  pinned).
- `internal/itest` — `qa_serial_e2e_test.go` file-backed-episode assertions
  re-derived; a new joint film-path test.
- No proto/`pkg/sdk` changes, no core package changes, no web changes (the
  footer's `season_episode` composite already skips silently when season and
  episode are absent, and `_view.title` flows through the shipped
  Merge/provenance path once the parser writes `title`).
- Out of scope (unchanged): JP↔EN title aliasing (backlog B3/TMDB), the
  enrichment restart-sweep bug (separate backlog row), tv-parser title FLAGs
  (pinned edges stay pinned).
