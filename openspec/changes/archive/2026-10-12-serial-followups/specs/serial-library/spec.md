## MODIFIED Requirements

### Requirement: Name-driven season, episode, and title inference

The serial parser grammar SHALL infer season, episode number, and display
title from raw serial directory and file names. For a SERIES (a serial
record's raw directory name, or a file-backed serial's raw file name) the
display title SHALL have stripped from it, in order: bracketed `[...]` and
`(...)` segments; a season marker — `Nth Season`, a standalone `S<N>` that
is not an `S<N>E<N>` token, a trailing `TV <N>`, or a trailing
roman-numeral sequel suffix (II–IX, whole final token after a separator);
whole-token release-tag tokens (resolution, source, and language tags,
case-insensitive); a trailing single CamelCase word after a separator (a
release-group tag, e.g. `- AniLiberty`); and, for a file-backed name, the
trailing video extension — followed by the shipped separator
normalization (non-ASCII preserved). The series season SHALL be the
explicit marker's number when one is present and SHALL be 1 otherwise
("S1" or no season in the name → season 1); a standalone bare year in the
name is not a release tag and SHALL stay in the title. For an EPISODE the
episode number SHALL come from the filename stem's first of: an SxxExx
token (with its optional SxxExxEzz end); a `<N> серия` marker; a
pure-number `[NN]`/`(NN)` bracket at the stem's start or end; the trailing
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
