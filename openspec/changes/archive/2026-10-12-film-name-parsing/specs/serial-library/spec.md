## ADDED Requirements

### Requirement: Film-file enrichment in serial libraries

Within a serial library, `serial-parser` SHALL apply to a video file item that
carries no `serial_record` marker and whose filename yields no season and no
episode number — the film path: the shared grammar's no-season parse of the
filename. The film parse SHALL write `title` and the structured release fields
it extracted (resolution, source, codec, language, year) into
`sources.serial-parser` of the item document, and SHALL NOT write a season key
or an episode key — none is fabricated, and a season marker in a film filename
(e.g. a season pack without an episode number, `Show.S01.mkv`) is never
emitted on the film path. The film path SHALL apply at confidence 0.6, and
SHALL stay a skipped parser stage when the filename is not a video name or the
parse yields an empty title. No namespace other than `sources.serial-parser`
SHALL be touched, and the core stamps `_provenance`, `_view`, and `_stages`
per the shipped rules — so the parsed title reaches the SPA through
`_view.title` without any web change.

#### Scenario: Film items enrich with clean titles through the joint pipeline

- **WHEN** a serial library carries a serial directory whose direct video files are named `Demon.Slayer.Kimetsu.No.Yaiba.Infinity.Castle.1080p.CR-Cassu.mkv` and `Chainsaw.Man.The.Movie.Reze.Arc.2025.1080p.AMZN.WEB-DL.H.264-EniaHD.mkv`, and the library scans and drains through the real subprocess pipeline
- **THEN** each item document gains `sources.serial-parser` carrying the clean title and the structured release fields — "Demon Slayer Kimetsu No Yaiba Infinity Castle" with resolution 1080p; "Chainsaw Man The Movie Reze Arc 2025" with year 2025, source web-dl, and codec h.264 — with NO season key and NO episode key on either document, and `_view.title` carries the parsed title so the SPA shows it instead of the raw filename

<!-- wf:probe id=44deab64a16b300e -->
```bash
set -e
out=$(go test ./internal/itest -run 'TestQAFilm_JointItemParse' -count=1 -v 2>&1)
echo "$out" | grep -q "^=== RUN   TestQAFilm_JointItemParse$"
echo "$out" | grep -q "^--- PASS: TestQAFilm_JointItemParse"
```
<!-- /wf:probe -->

#### Scenario: The film path applies per filename at the adapter

- **WHEN** the parser Match runs over numberless video filenames — the two real movie names, a season marker without an episode number (`Show/Show.S01.mkv`), and a bare name (`Show/Feature.mkv`) — and over a non-video name (`Show/Credits.ass`)
- **THEN** each video name applies at confidence 0.6 with its cleaned title and the release fields it carries and NO season key and NO episode key (the `S01` marker is never emitted on the film path), and the non-video name stays a skipped stage with a reason

<!-- wf:probe id=40e32905140a5594 -->
```bash
set -e
go test ./plugins/serial-parser -run TestFilmMatch
```
<!-- /wf:probe -->

## MODIFIED Requirements

### Requirement: Episode-level enrichment in serial libraries

Within a serial library, each plugin SHALL self-select per document at Match, per
the shipped chain pattern: `serial-parser` SHALL apply to an episode document
when its filename yields an episode number — an SxxExx token or a bare-number
form per the name-driven inference requirement — and SHALL write the parsed
episode fields (the episode from the filename; the season from the filename's
marker, else the series directory's inference, else 1) into
`sources.serial-parser` of the EPISODE document; a video file item whose
filename yields no episode number SHALL follow the film path per the
film-file enrichment requirement; `frame-grabber` SHALL apply
only to episode documents carrying a video absolute path; a plugin that does not
apply SHALL be recorded as a skipped stage, not an error. Episode documents SHALL
NOT receive series-level metadata: the series' show metadata lives only in the
series document's namespaces.

#### Scenario: Episode enriched with its own parse

- **WHEN** an episode item named `Show.S01E02.1080p.mkv` in a serial library drains into the queue
- **THEN** the episode document gains `sources.serial-parser` carrying season 1 and episode 2, and the series' show-level namespace is untouched by the episode run

<!-- wf:probe id=5661e7491a9d1caa -->
```bash
set -e
go test ./plugins/serial-parser -run TestEpisodeParse
```
<!-- /wf:probe -->

#### Scenario: Bare-number episode enriches with its own parse

- **WHEN** an episode item named without an SxxExx token (e.g. `Mairimashita_Iruma-kun_4th_Season_[01].mkv` under its `4th Season` directory) drains into the queue
- **THEN** the episode document gains `sources.serial-parser` carrying season 4 and episode 1, while a non-video filename (e.g. `Credits.ass`) keeps the parser a skipped stage

<!-- wf:probe id=a3aa570dd9916eba -->
```bash
set -e
go test ./plugins/serial-parser -run TestEpisodeNameGrammar
```
<!-- /wf:probe -->

### Requirement: Name-driven season, episode, and title inference

The serial parser grammar SHALL be the shared release-name grammar (the
release-name-parsing capability): one role-keyed vocabulary and one
start-to-end pass shared with tv-parser and the serial scanner, inferring
season, episode number, and display title from raw serial directory and file
names. For a SERIES (a serial
record's raw directory name, or a file-backed serial's raw file name) the
display title SHALL have stripped from it, in order: bracketed `[...]` and
`(...)` segments; a season marker — `Nth Season`, a standalone `S<N>` that
is not an `S<N>E<N>` token, a trailing `TV <N>`, or a trailing
roman-numeral sequel suffix (II–IX, whole final token after a separator);
whole-token release-tag tokens (resolution, source, and language tags,
case-insensitive — the resolution vocabulary including `720i`, whose
whole-token title stripping is a behavior change owned here: a file-backed
`Title 720i.mkv` parses to title "Title", and an episode
`Show/Title 720i.mkv` stays episode-less where it previously
parsed as episode 720 (it now follows the film path)); a trailing single
CamelCase word after a separator (a
release-group tag, e.g. `- AniLiberty`); a trailing dash-joined two-part token
that directly follows a stripped release-tag or bracketed-segment position at
the name's end, its first part an all-caps acronym (the narrow dash-form rule:
`Demon.Slayer.Kimetsu.No.Yaiba.Infinity.Castle.1080p.CR-Cassu.mkv` parses to
title "Demon Slayer Kimetsu No Yaiba Infinity Castle" — the `CR-Cassu` token
strips after the consumed `1080p`; ordinary hyphenated title text such as
`Spider-Man` never strips, not even after a consumed tag); and, for a
file-backed name, the trailing video extension — followed by the shipped
separator normalization (non-ASCII preserved). The series season SHALL be the
explicit marker's number when one is present and SHALL be 1 otherwise
("S1" or no season in the name → season 1); a standalone bare year in the
name is not a release tag and SHALL stay in the title. For an EPISODE the
episode number SHALL come from the filename stem's first of: an SxxExx
token (with its optional SxxExxEzz end); a `<N> серия` marker; a
pure-number `[NN]`/`(NN)` bracket anywhere in the stem, the rightmost one
winning so a trailing release-decoration bracket never displaces the episode
bracket (`Show_Name_II_[01]_[HEVC].mkv` parses to episode 1 — a behavior
change owned here, the live defect where the bracket had to sit at the
stem's edge); the trailing
standalone 1–3 digit number after bracketed segments and resolution tokens
are stripped (last number wins, the sidecar bare-number convention). Every
bare extraction form SHALL treat an episode number below 1 as no number —
a `<N> серия` marker or a pure-number `[NN]`/`(NN)` bracket whose number is
below 1 leaves the filename numberless, matching the scanner grammar's gate
on every bare form — and resolution tokens, bracketed or not, SHALL never
yield an episode number. The episode's season SHALL come from the stem's
own season marker, else from the series directory's inference, else 1. A
filename that yields no episode number SHALL parse through the film path per
the film-file enrichment requirement when it names a video, and SHALL remain
a skipped parser stage otherwise.

#### Scenario: Roman-numeral suffix and no-season default

- **WHEN** serial names carry a trailing roman-numeral sequel suffix (the loose top-level file `Black_Clover_II_[01].mkv`) or a `TV <N>` tag instead of a season marker (`Aria TV 1`)
- **THEN** the file-backed serial parses to title "Black Clover" with season 2 and episode 1 from the bracketed number, and `Aria TV 1` parses to title "Aria" with season 1 — "TV 1" is neither a title word nor a false season or episode source

<!-- wf:probe id=d4167ca009f50671 -->
```bash
set -e
go test ./plugins/serial-parser -run TestSeriesNameGrammar
```
<!-- /wf:probe -->

#### Scenario: Season markers and release decoration stripping

- **WHEN** the directories `From.S02.WEBDL.720p.Rus.Eng`, `Mairimashita! Iruma-kun 4th Season - AniLiberty [WEB-DL 1080p]`, and `Kimi ga Shinu made Koi wo Shitai [WEB-DL 1080p]` are parsed
- **THEN** the titles are "From", "Mairimashita! Iruma-kun", and "Kimi ga Shinu made Koi wo Shitai" with seasons 2, 4, and 1 — bracketed tags, release-tag tokens, the season markers, and the trailing `- AniLiberty` group tag are stripped while the non-ASCII-preserving cleanup is untouched

<!-- wf:probe id=ce10a0d2a6656bf4 -->
```bash
set -e
go test ./plugins/serial-parser -run TestSeriesNameGrammar
```
<!-- /wf:probe -->

#### Scenario: Dash-form group token after a consumed tag

- **WHEN** a file-backed serial name carries a dash-joined group token after its resolution (`Demon.Slayer.Kimetsu.No.Yaiba.Infinity.Castle.1080p.CR-Cassu.mkv`)
- **THEN** it parses to title "Demon Slayer Kimetsu No Yaiba Infinity Castle" with season 1 (the no-marker default) — the dash-form token strips after the consumed `1080p` while hyphenated title text keeps, and the same canonical shape parses identically in the shared package's film table

<!-- wf:probe id=991faa9e3dd95611 -->
```bash
set -e
go test ./plugins/serial-parser -run TestSeriesNameGrammar
```
<!-- /wf:probe -->

#### Scenario: Bare-number episode filenames

- **WHEN** episode files are named with a bracketed number (`Mairimashita_Iruma-kun_4th_Season_[01].mkv`), a dash number (`Kimi ga Shinu made Koi wo Shitai - 01 [1080p AVC AAC].mkv`), or a Cyrillic marker (`[01] Aria TV 1 01 серия.mkv`, `[Erai-raws] Kimetsu no Yaiba - Yuukaku Hen - 01.mkv`)
- **THEN** each parses to episode 1 with season 4 from the filename marker, 1 from the series directory default, 1 from the `TV 1` marker, and 1 from the no-marker default — and the `[Erai-raws]` group tag and the trailing `[1080p AVC AAC]` tags never yield a false episode number

<!-- wf:probe id=142510dd698d7b6c -->
```bash
set -e
go test ./plugins/serial-parser -run TestEpisodeNameGrammar
```
<!-- /wf:probe -->

#### Scenario: Below-1 episode numbers are numberless

- **WHEN** episode files carry a below-1 number in a bare extraction form (`Show/[00] Title.mkv` with a pure-number edge bracket, `Show/Title 0 серия.mkv` with a Cyrillic marker)
- **THEN** both stay episode-less — every bare form treats a number below 1 as no number — and parse through the film path per the film-file enrichment requirement (a cleaned title, never a fabricated episode number); the below-1 episode gate itself is unchanged

<!-- wf:probe id=7bb663978eac2254 -->
```bash
set -e
go test ./plugins/serial-parser -run 'TestEpisodeNameGrammar|TestFilmMatch'
```
<!-- /wf:probe -->

#### Scenario: Below-1 episodes index no sidecar

- **WHEN** a serial directory holds a `[00]`-bracket-named episode video and a `0 серия`-named episode video beside a numbered companion sidecar (`Episode - 01.srt`)
- **THEN** neither below-1 episode indexes a sidecar — the scanner's episode-number grammar gates every bare form at n ≥ 1 — so the numbered companion falls serial-level, never episode-linked

<!-- wf:probe id=34a9318571c0de5b -->
```bash
set -e
go test ./plugins/serial-scanner -run TestBareNamedEpisodeSidecar
```
<!-- /wf:probe -->

#### Scenario: Resolution tokens never yield an episode number

- **WHEN** an episode stem carries an unbracketed resolution token beside its number (`Show/Show - 01 360p.mkv`)
- **THEN** the resolution token never yields an episode number — the file parses to episode 1 from the dash number, not 360 — and the full existing name-grammar surface (series and episode tables, confidence shapes, episode namespace) passes unchanged

<!-- wf:probe id=027e73182dc02afb -->
```bash
set -e
go test ./plugins/serial-parser
```
<!-- /wf:probe -->

#### Scenario: A pure-number bracket before trailing decoration stays the episode number

- **WHEN** an episode stem carries a pure-number bracket followed by a further bracketed release tag (`Show_Name_II_[01]_[HEVC].mkv` — the live defect shape whose whole series previously skipped as "no episode number")
- **THEN** the file parses to episode 1 from the `[01]` bracket with season 2 from the trailing roman sequel — the decoration bracket never displaces the episode bracket, and the start-bracket and below-1 gate rows keep their values beside it

<!-- wf:probe id=a5362e81143f9a52 -->
```bash
set -e
go test ./plugins/serial-parser -run TestEpisodeNameGrammar
```
<!-- /wf:probe -->

#### Scenario: 720i is release decoration, not an episode number

- **WHEN** names carry a whole-token `720i` (the episode `Show/Title 720i.mkv`, the file-backed serial `Title 720i.mkv`)
- **THEN** neither name yields an episode number — `720i` stays release decoration — and both parse through the film path to title "Title" (the episode with the resolution 720i carried as a release field), the same reading the scanner already applied, with the cross-binary alignment kept

<!-- wf:probe id=26ac24af91160840 -->
```bash
set -e
go test ./plugins/serial-parser -run 'TestSeriesNameGrammar|TestFilmMatch'
```
<!-- /wf:probe -->

#### Scenario: The new naming shapes pass the joint e2e

- **WHEN** the serial joint e2e runs over the real subprocess graph with its naming-shape expectations re-derived (stripped titles, season present on every row including the defaulted file-backed row)
- **THEN** it passes ffprobe-gated as part of the itest suite: the series rows carry the stripped titles and the always-present season, and the episode rows parse their SxxExx tokens unchanged

<!-- wf:probe id=16778b8ef0faece4 -->
```bash
set -e
out=$(go test ./internal/itest -run 'TestQASerial_JointLibraryE2E' -count=1 -v 2>&1)
echo "$out" | grep -q "^=== RUN   TestQASerial_JointLibraryE2E$"
echo "$out" | grep -q "^--- PASS: TestQASerial_JointLibraryE2E"
```
<!-- /wf:probe -->
