## MODIFIED Requirements

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
