## MODIFIED Requirements

### Requirement: Sidecar association

The `serial-scanner` plugin SHALL discover sidecar files — subtitle extensions
(`.srt`, `.ass`, `.ssa`, `.sub`) and audio-track extensions (`.mka`, `.m4a`,
`.mp3`, `.flac`, `.aac`, `.ogg`, `.opus`, `.wav`) — at any depth under a serial
directory, without probing them or creating items for them. An episode-linked
sidecar SHALL be matched to an episode by an SxxExx token in the sidecar filename
first, falling back to a bare episode number when the sidecar filename has no
SxxExx token; the episode index the fallback matches against SHALL recognize the
same episode-name shapes the parser recognizes (SxxExx and the bare-number
forms), so an episode named without SxxExx (e.g. `Show II/[01] Episode.mkv`)
stays sidecar-matchable by its number; the sidecar grammar SHALL be the
shared release-name grammar — a pure-number bracket anywhere in a sidecar
stem is a number candidate, and the resolution vocabulary (720i included)
matches the parser's exactly; the association SHALL be stamped into that episode's scanned facts
(relative sidecar path, kind, language, and match basis). The sidecar language
SHALL come from the containing folder name (case-insensitive, e.g. `Eng`, `Rus`)
or a filename language tag, and SHALL be empty when neither is present. A sidecar
that matches no episode SHALL be attached to the serial record's scanned facts as
a serial-level sidecar — never dropped silently. Sidecar folders MAY nest several
levels deep (e.g. `SerialDir/OST/`), and sidecars are OPTIONAL per serial (a
serial with none scans cleanly).

#### Scenario: Srt sidecar matched via SxxExx and folder language

- **WHEN** a serial directory contains `Eng/` and `Rus/` folders whose `.srt` filenames carry SxxExx tokens matching episodes
- **THEN** each episode's scanned facts carry the matched subtitle with its folder-derived language and the SxxExx match basis

<!-- wf:probe id=38d51abe09bfbf7d -->
```bash
set -e
go test ./plugins/serial-scanner -run TestSrtAssociation
```
<!-- /wf:probe -->

#### Scenario: Bare-number ass fallback

- **WHEN** a sidecar folder holds `.ass` files with no SxxExx token, only a bare episode number (e.g. `Show - 01 (1080p) [C48E56C8].ass`)
- **THEN** the file associates to the episode with that number via the bare-number fallback basis

<!-- wf:probe id=2195ddd74fa953fd -->
```bash
set -e
go test ./plugins/serial-scanner -run TestBareNumberFallback
```
<!-- /wf:probe -->

#### Scenario: Serial-level OST attaches to the series record

- **WHEN** a serial directory contains an `OST/` folder, nested several levels deep, holding audio files that match no episode number
- **THEN** the audio files are attached to the serial record's scanned facts as serial-level sidecars, are not discovered as items, and are not attached to any episode

<!-- wf:probe id=e805b89e8eea4ac1 -->
```bash
set -e
go test ./plugins/serial-scanner -run TestSerialLevelOST
```
<!-- /wf:probe -->

#### Scenario: Bracketed-number episode stays sidecar-matchable

- **WHEN** a serial directory holds an episode named without an SxxExx token (`Show II/[01] Episode.mkv`) beside a numbered `.srt` sidecar
- **THEN** the sidecar associates to that episode via the bare-number fallback basis, exactly as it would for an SxxExx-named episode

<!-- wf:probe id=b5d78250688f037a -->
```bash
set -e
go test ./plugins/serial-scanner -run TestBareNamedEpisodeSidecar
```
<!-- /wf:probe -->

#### Scenario: A sidecar number bracket before decoration still associates

- **WHEN** a serial directory holds the episode `Show_II_[01]_[HEVC].mkv` beside the mirrored sidecar `Show_II_[01]_[HEVC].ass`
- **THEN** the sidecar associates to the episode via the bare-number basis — the shared grammar reads the number bracket through the trailing decoration in both binaries

<!-- wf:probe id=ebe5aa0c28353849 -->
```bash
set -e
go test ./plugins/serial-scanner -run TestBareNamedEpisodeSidecar
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
`Show/Title 720i.mkv` stays a numberless skipped stage where it previously
parsed as episode 720); a trailing single CamelCase word after a separator (a
release-group tag, e.g. `- AniLiberty`); and, for a file-backed name, the
trailing video extension — followed by the shipped separator
normalization (non-ASCII preserved). The series season SHALL be the
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
filename that yields no episode number SHALL remain a skipped parser stage.

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
- **THEN** both stay numberless skipped parser stages (applies=false with a reason) — every bare form treats a number below 1 as no number, exactly as the scanner grammar already treats every bare form

<!-- wf:probe id=e5e4a73d6b92dc66 -->
```bash
set -e
go test ./plugins/serial-parser -run TestEpisodeNameGrammar
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
- **THEN** the episode stays a numberless skipped parser stage (previously episode-720) and the file-backed serial parses to title "Title" with the 720i token stripped — the same reading the scanner already applied, closing the cross-binary divergence

<!-- wf:probe id=ac55132080b9c765 -->
```bash
set -e
go test ./plugins/serial-parser -run 'TestSeriesNameGrammar|TestEpisodeNameGrammar'
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

## ADDED Requirements

### Requirement: Structured release-field emission

The serial parser SHALL emit the release fields it extracts — resolution,
source, codec, languages, and year, when a name carries them — into
`sources.serial-parser` beside the existing fields, for series documents and
episode documents alike. Fields with no matching token SHALL be omitted,
never zeroed; the existing keys, the skip semantics, and the confidence
semantics SHALL be unchanged; and no namespace other than
`sources.serial-parser` SHALL be touched.

#### Scenario: Episode and series namespaces gain the release fields

- **WHEN** a series directory carrying release tags (`From.S02.WEBDL.720p.Rus.Eng`) and an episode file carrying codec and source tags (`Show II - 01 [WEBRip 1080p HEVC].mkv`) enrich through the parser
- **THEN** both documents' `sources.serial-parser` carry the structured release fields beside the existing title/season/episode keys — the resolution and languages on the series, the resolution and codec on the episode — while a name with no release tags emits no new keys and the skip and confidence behavior is unchanged

<!-- wf:probe id=7646c4fa3a9bee99 -->
```bash
set -e
go test ./plugins/serial-parser -run TestNamespaceEmission
```
<!-- /wf:probe -->
