# release-name-parsing Specification

## Purpose
One shared release-name parser at the base/core level: a single start-to-end
pass over a release name extracting title, season, episode, episode_end,
resolution, source, codec, languages, and year behind a role-keyed,
resource-brand-neutral vocabulary — consumed by the parser plugins and the
serial scanner as thin adapters, so every binary parses release names
identically and a future standalone resource plugin can import the same seam.

## Requirements

### Requirement: Single shared grammar and vocabulary

One package SHALL own the release-name grammar: the role-keyed whole-token
vocabulary (source, resolution, language, type, codec — the resolution role
including `720i`, the source role including `amzn`, the codec role including
the dot-form variants `h.264`, `h.265`, `x.264`, and `x.265` beside their
run-together forms), the two-part bracket rule with its release masks, the
anchored season-marker set (`Nth Season`, `Season N`, standalone `Sxx`,
`TV <N>`, trailing romans II–IX), the bare episode-number reducer, and the
trailing group-tag rules — and both title stripping and field emission SHALL
derive from that one vocabulary. The trailing group-tag rules are: a trailing
single CamelCase word after a separator, and the narrow dash-form rule — a
trailing dash-joined token of two ASCII letter-word parts (e.g. `CR-Cassu`)
SHALL strip when it immediately follows a stripped release-tag token or
bracketed-segment position at the name's end AND its first part is an all-caps
acronym; a dash-joined token whose first part is an ordinary capitalized word
or that has title text before it (e.g. `Spider-Man`) SHALL stay in the title,
even after a consumed release tag. A name carrying no season and no episode
SHALL parse as the degenerate film case: title plus release fields, with no
season and no episode. The grammar SHALL be resource-brand-neutral: no
resource brand in any identifier, comment, or vocabulary key.

#### Scenario: The shared grammar reproduces the serial corpus

- **WHEN** the shared package's grammar tables run over the existing serial corpus (season markers, release decoration, roman sequels, bare-number forms) plus the new canonical shapes — a film name with release tags and no season/episode, a trailing-decoration bracket, and a whole-token `720i`
- **THEN** every row parses to the corpus's expected title, season, episode, and release fields, and the package carries no resource brand in code or vocabulary

<!-- wf:probe id=499a5238610f2219 -->
```bash
set -e
go test ./pkg/releasename -run 'TestSeriesNameGrammar|TestEpisodeNameGrammar|TestFilmNameParse'
! grep -rniE 'kinopoisk|tmdb' pkg/releasename --include='*.go'
```
<!-- /wf:probe -->

#### Scenario: The vocabulary additions strip the real film residue

- **WHEN** the shared package parses `Chainsaw.Man.The.Movie.Reze.Arc.2025.1080p.AMZN.WEB-DL.H.264-EniaHD.mkv` and a name carrying hyphenated title text after a consumed tag (`Some.Movie.1080p.Spider-Man.mkv`)
- **THEN** the first parses to title "Chainsaw Man The Movie Reze Arc 2025" with year 2025, source web-dl, codec h.264, and resolution 1080p — `AMZN` and the dot-form `H.264` leave no title residue — and the second keeps the title "Some Movie Spider-Man" whole: hyphenated title text never strips, not even after a consumed release tag

<!-- wf:probe id=1e06684476d17d30 -->
```bash
set -e
go test ./pkg/releasename -run TestFilmNameParse
```
<!-- /wf:probe -->

#### Scenario: The dash-form group token strips after a consumed tag

- **WHEN** the shared package parses `Demon.Slayer.Kimetsu.No.Yaiba.Infinity.Castle.1080p.CR-Cassu.mkv`
- **THEN** it parses to title "Demon Slayer Kimetsu No Yaiba Infinity Castle" with resolution 1080p and no season and no episode — the dash-joined `CR-Cassu` token strips because it directly follows the consumed `1080p` position at the name's end and its first part is an all-caps acronym

<!-- wf:probe id=c83cde2f5ddf8046 -->
```bash
set -e
go test ./pkg/releasename -run TestFilmNameParse
```
<!-- /wf:probe -->

#### Scenario: The grammar additions regress no binary

- **WHEN** the full grammar suites of the shared package and the three binaries run — each binary's tables carrying the new canonical shapes (the tagged Chainsaw name and the dash-form Demon Slayer name)
- **THEN** all four packages pass: the tv-parser characterization suite keeps its two pinned adversarial edges, and the serial-parser and serial-scanner suites stay green beside the added vocabulary

<!-- wf:probe id=ca52f025aa95b9c7 -->
```bash
set -e
go test ./pkg/releasename ./plugins/serial-parser ./plugins/tv-parser ./plugins/serial-scanner
```
<!-- /wf:probe -->

### Requirement: Structured parse result

The parser SHALL return a structured result carrying the extracted fields:
title, season (with an explicit-marker flag), episode, episode_end,
resolution, source, codec list, language list, and year. Singular roles SHALL
take the last matching token; list roles SHALL keep token order; a season
with no marker SHALL be absent (0) with the flag false; an episode number
below 1 SHALL be absent (0); release fields with no matching token SHALL be
absent values, never zeroed stand-ins.

#### Scenario: The parse result carries the release fields

- **WHEN** names carrying release decoration are parsed (`From.S02.WEBDL.720p.Rus.Eng`, `Show II - 01 [WEBRip 1080p HEVC] - FanGroup`, a name with a bare year)
- **THEN** the result carries title, the explicit season, the episode where present, and the structured release fields — resolution, source, codecs, languages, year — with absent fields absent, singular roles last-wins, and lists in token order

<!-- wf:probe id=65f00f37dc65e786 -->
```bash
set -e
go test ./pkg/releasename -run TestEmissionFields
```
<!-- /wf:probe -->

### Requirement: Thin adapters over the shared parser

The resource parser plugins and the serial scanner SHALL derive their
release-name parsing from the shared package — no binary re-replicates the
grammar or the vocabulary. Each adapter SHALL keep its own namespace keys,
its Match/apply rule, its skip semantics, and its confidence semantics; the
tv-parser release-group rule SHALL stay adapter-local.

#### Scenario: The tv adapter gains structured fields without changing apply semantics

- **WHEN** the tv-parser parses release names through the shared package — a tagged episode name, a multi-episode name with a release group, and a movie-style name with no season/episode token
- **THEN** the adapter emits the structured release fields beside its existing title/season/episode keys, still applies only when a season/episode token is present, and keeps its release-group extraction and confidence tiers unchanged

<!-- wf:probe id=ce462e11edef346d -->
```bash
set -e
go test ./plugins/tv-parser
```
<!-- /wf:probe -->

### Requirement: Cross-binary consistency

The same release name SHALL parse to consistent season, episode, and
resolution values in every binary that parses release names (tv-parser,
serial-parser, serial-scanner); the binaries' grammar tables SHALL carry the
same canonical shapes, so a cross-binary divergence fails a test in each
binary instead of surfacing in a user's library.

#### Scenario: The same name parses consistently in every binary

- **WHEN** the full grammar suites of the shared package and the three binaries run — each table carrying the same canonical shapes (the trailing-decoration bracket, the whole-token `720i`, the tagged film name)
- **THEN** all four packages pass, with no binary's grammar disagreeing with another's on any canonical shape

<!-- wf:probe id=ea1eb2c2f359f9a5 -->
```bash
set -e
go test ./pkg/releasename ./plugins/serial-parser ./plugins/tv-parser ./plugins/serial-scanner
```
<!-- /wf:probe -->
