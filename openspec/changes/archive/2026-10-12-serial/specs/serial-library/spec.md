## ADDED Requirements

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
are stripped (last number wins, the sidecar bare-number convention). The
episode's season SHALL come from the stem's own season marker, else from
the series directory's inference, else 1. A filename that yields no
episode number SHALL remain a skipped parser stage.

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

## MODIFIED Requirements

### Requirement: Series-level enrichment

The async enrichment queue SHALL derive `(series, plugin)` tasks for series rows
under the same predicates as items — the source is queueable (enabled, auth mode
not CLIENT), the plugin's `sources.<plugin_id>` namespace is absent from the
series document, and the pair is not in ledger cooldown — keyed by the series row
id (which never collides with an item id). The per-item lease, retry/backoff,
failure ledger, and settle rules SHALL apply to series unchanged, and a series
SHALL settle to `ready` independently of its episodes. The metadata_source chain
SHALL run over the series document with the raw directory facts as the Match
context; `serial-parser` SHALL write its parse (the name-driven display title
and the season — the explicit marker's value, else 1 — per the name-driven
inference requirement) ONLY into `sources.serial-parser`, and the
core SHALL stamp `_provenance`, `_view`, and `_stages` per the shipped rules.

#### Scenario: Series enriched through the parser namespace

- **WHEN** a scanned series with a noisy release-name directory (season marker and release tags included) drains into the queue
- **THEN** the series document gains `sources.serial-parser` carrying the cleaned display title and the season (marker value, else 1), a `_provenance` entry naming `serial-parser`, a `_view` projection, and a `_stages` entry — and no other namespace

<!-- wf:probe id=8dd31906c160d5d3 -->
```bash
set -e
go test ./internal/enrich -run TestSeriesEnrichedViaParser
```
<!-- /wf:probe -->

#### Scenario: Series settles ready independently of episodes

- **WHEN** every queueable source of a series reached a terminal outcome while its episodes are still enriching
- **THEN** the series row settles to `ready` and is listable via its status, without waiting for episodes

<!-- wf:probe id=1689a5e8b66761f3 -->
```bash
set -e
go test ./internal/enrich -run TestSeriesSettlesIndependently
```
<!-- /wf:probe -->

### Requirement: Episode-level enrichment in serial libraries

Within a serial library, each plugin SHALL self-select per document at Match, per
the shipped chain pattern: `serial-parser` SHALL apply to an episode document
iff its filename yields an episode number — an SxxExx token or a bare-number
form per the name-driven inference requirement — and SHALL write the parsed
episode fields (the episode from the filename; the season from the filename's
marker, else the series directory's inference, else 1) into
`sources.serial-parser` of the EPISODE document; `frame-grabber` SHALL apply
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
- **THEN** the episode document gains `sources.serial-parser` carrying season 4 and episode 1, while a filename yielding no episode number at all keeps the parser a skipped stage

<!-- wf:probe id=465cf3040d12d464 -->
```bash
set -e
go test ./plugins/serial-parser -run TestEpisodeNameGrammar
```
<!-- /wf:probe -->

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
stays sidecar-matchable by its number; the association SHALL be stamped into that episode's scanned facts
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
