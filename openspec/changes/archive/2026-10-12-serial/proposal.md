# Proposal: serial — season/episode inference for real serial layouts

## Why

The shipped serial grammar recognizes only two season shapes (standalone
`Sxx`, `Nth Season`) and requires an episode filename to carry an SxxExx
token — but the user's real libraries name seasons as roman-numeral sequel
suffixes (`Black_Clover_II`), `TV <N>` tags (`Aria TV 1`), dot-delimited
release names (`From.S02.WEBDL.720p.Rus.Eng`), and arc titles, and name
episodes with bare numbers (`[01]`, `- 01`, `01 серия`). Those serials
today parse to polluted titles ("From WEBDL 720p Rus Eng",
"Bleach (1080p) [C48E56C8]") or get no season/episode at all (the episode
parser stage skips, `applies=false`). The user's six named layouts are the
acceptance floor for this change.

## What Changes

- **Series name grammar (`plugins/serial-parser`):** the display title
  strips, in order — bracketed `[...]`/`(...)` segments, whole-token
  release tags (resolution/source/language), a trailing single-CamelCase
  group tag after a separator (`- AniLiberty`), a trailing `TV <N>`, a
  trailing roman-numeral sequel suffix (II–IX), and — for a file-backed
  name — the trailing video extension; separator normalization
  (non-ASCII-preserving) is unchanged. The season is ALWAYS written: the
  explicit marker's value when one is present, else 1 ("S1" or no season
  in the name → season 1). The tag-mask vocabulary (bracket segments,
  whole-token release tags, the group-tag shape rule) lives in one
  dedicated neutral file of the parser plugin
  (`plugins/serial-parser/releasetags.go`), named and keyed
  resource-agnostically, so the per-resource plugins arriving as separate
  projects can extract or replace it without renaming a brand through the
  parser; real-world strings like `- AniLiberty` remain only as test input
  data. The test tables additionally carry derived rows sourced from the
  operator's real anime collection — an authoring-time inventory only
  (probes never touch the volume), with titles and group names neutralized
  and the folder/episode structure preserved byte-for-byte
  (design.md D-8).
- **Episode name grammar (`plugins/serial-parser`):** the episode number
  comes from the filename stem's first of — an SxxExx token (with the
  optional SxxExxEzz end), a `<N> серия` marker, a pure-number `[NN]`
  bracket at the stem's start or end, or the trailing standalone number
  after tag stripping (the sidecar bare-number convention: last number
  wins, 1–3 digits). The episode's season falls back: filename marker →
  the series directory's inference (via the `series_relative_path` fact
  the episode documents already carry) → 1. Match applies to an episode
  iff a number is extracted; a numberless filename stays a skipped stage
  (never an error).
- **Scanner alignment (`plugins/serial-scanner`):** the sidecar
  association's episode index recognizes the same episode-name shapes the
  parser does, so an episode named without SxxExx (`[01]`-bracketed,
  `- N`, `N серия`) stays sidecar-matchable by its bare number.
- **itest ripple:** `TestQASerial_JointLibraryE2E` expectations re-derived
  for the new grammar (stripped titles; season present on every row).

## Capabilities

### New Capabilities

None — every delta extends an existing capability.

### Modified Capabilities

- **`serial-library`** — MODIFIED "Series-level enrichment" (the parse
  always carries a season: marker value, else 1), MODIFIED "Episode-level
  enrichment in serial libraries" (the apply-rule broadens from SxxExx-only
  to any extractable episode number, with the season fallback chain),
  MODIFIED "Sidecar association" (the episode index recognizes the
  parser's episode-name shapes), and ADDED "Name-driven season, episode,
  and title inference" carrying the grammar rules and the six-layout
  acceptance scenarios. Discovery, storage, queue/ledger, API, watch-flow,
  and additivity requirements are untouched.

## Impact

- `plugins/serial-parser` — `serialparse.go` grammar + `parser.go` Match
  (episode apply-rule, season fallback, updated reasons); `parser_test.go`
  churns deliberately (`TestSeriesTitleParse` rows for bracket stripping
  and season-default; `TestEpisodeMatch`'s bare-number row now applies and
  is replaced by a numberless non-match row) and gains table-driven
  `TestSeriesNameGrammar` / `TestEpisodeNameGrammar`.
- `plugins/serial-scanner` — `associateSidecars` episode index + a
  replicated grammar helper (the established no-cross-import convention,
  cited) + `serial_test.go` addition `TestBareNamedEpisodeSidecar`.
- `internal/itest/qa_serial_e2e_test.go` — expectation rows only (titles,
  always-present season); no harness changes.
- No proto/`pkg/sdk` changes, no core package changes (the enrichment
  tests fake the parser), no new dependencies, no web changes.
