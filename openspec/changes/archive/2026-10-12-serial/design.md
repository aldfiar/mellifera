# Design: serial — season/episode inference for real serial layouts

## Context

The serial grammar lives in two package-main plugin binaries that cannot
import each other. `plugins/serial-parser/serialparse.go` holds
`parseSeriesDir` (bracket-blind: knows `Nth Season` and standalone `Sxx`
only; writes season only when a marker is present) and
`parseEpisodeFilename` (SxxExx-only; `ok=false` otherwise, which makes
`Match` skip the stage — `parser.go:76-79`). `plugins/serial-scanner/sidecar.go`
holds the sidecar grammar with the established disambiguation pattern —
`bracketRe` strips `[...]`/`(...)` segments, `resolutionRe` keeps
`1080p` out, the LAST standalone 1–3 digit number wins — and
`walk.go:203-218` indexes episodes for sidecar matching via
`seasonEpisodeOf` else `bareNumberOf`, which strips ALL brackets and so
cannot see a `[01]`-named episode. Episode documents already carry the
`series_relative_path` fact (walk.go:132 registers `seriesRel`; the parser
declares the fact name at parser.go:38), so an episode can resolve the
series directory's season without any new plumbing. The enrichment core
tests fake the parser (internal/enrich/series_queue_test.go), so the blast
radius of a grammar change is the two plugins plus the real-graph itest
expectations in `internal/itest/qa_serial_e2e_test.go`.

## Goals / Non-Goals

Goals: the user's six named layouts parse correctly (title, season,
episode); the season is always present on series and episode parses
(default 1); sidecar association keeps working for the same naming shapes.
Non-Goals: no TMDB/online enrichment (the B3 backlog — example 6's
English-title reduction is a translation problem, not a parsing one), no
episode-document titles (display reads the series document), no changes to
discovery, storage, queue/ledger, API, web, proto, or the tv/base-scanner
grammar, no sidecar-FILENAME grammar extension (sidecar stems keep the
shipped SxxExx/bare rules).

## D-1 — One grammar pipeline order in parseSeriesDir

Strip in a fixed order, each step cutting the matched span and splicing
the remainder (the existing `parseSeriesDir` pattern):
1. bracketed `[...]`/`(...)` segments (sidecar.go:64 semantics — kills
   `[WEB-DL 1080p]`, `(1080p)`, `[C48E56C8]`, and the episode-number
   bracket of a file-backed name);
2. `Nth Season` (nthSeasonRe, existing) then standalone `Sxx` that is not
   an SxxExx token (seasonTokenIndex, existing);
3. whole-token release tags, case-insensitive, delimiter-bounded: source
   tags (`WEB-DL`, `WEBDL`, `WEBRip`, `BluRay`, `BDRip`, `HDTV`, `HDRip`,
   `DVDRip`), resolutions (the `resolutionRe` family), language tags (the
   `languageFolders` set, replicated — `Rus`, `Eng`, …);
4. trailing `TV <N>` (a 1–2 digit number after a whole `TV` token at the
   name's end) — season marker, cut from the title;
5. trailing roman-numeral sequel suffix II–IX (the FINAL whole token after
   a separator, checked after steps 1/3 so `Show.II.WEBDL` still hits) —
   season marker, cut;
6. a trailing single CamelCase word after a separator (contains both upper
   and lower case ASCII letters, ≥3 chars) — release-group tag
   (`- AniLiberty`); a single-case word (`Remastered`, `Arc`) never
   matches, so `Demon Slayer - Kimetsu no Yaiba Entertainment District
   Arc` is preserved whole;
7. a file-backed name's trailing video extension (the `videoMime`
   extension set, replicated);
8. `cleanTitle` (unchanged).

Alternative rejected: a generic release-pattern parser (guessit-style) —
out of scale for a plugin-local grammar and unfalsifiable against the six
ground-truth layouts.

## D-2 — Season is always written; the explicit flag only steers confidence

`parseSeriesDir` keeps returning `(title, season, explicit bool)`, but
`season` is now always ≥ 1 (marker value, else 1) and `Match` always
writes it. The existing confidence semantics stay: 1.0 explicit, 0.6
defaulted (parser.go:61-65) — downstream, the absence of a season key no
longer exists as a state. Bare years are NOT release tags
(`…Attorney Woo 2022` keeps `2022` — the Unicode contract row stays
byte-stable), while parenthesized `(2008)` IS a bracket segment and goes.

## D-3 — Episode number and season: first-match rules plus a three-step season fallback

Episode number, tried in order on the stem: SxxExx (with SxxExxEzz end,
existing); `<N> серия` (case-insensitive); a PURE-number `[NN]`/`(NN)`
bracket at the stem's start or end (pure digits only, so `[1080p]` and
`[C48E56C8]` never match); the trailing standalone 1–3 digit number after
bracket segments and resolution tokens are stripped (the sidecar
bare-number convention: last number wins). Episode season: the stem's own
season marker (D-1 rules 2/4/5), else `parseSeriesDir` over the
`series_relative_path` fact the episode document already carries, else 1.
`Match` applies iff a number was extracted; the skip reason changes from
"no SxxExx token in filename" to a numberless-filename reason. The
namespace shape is unchanged: season, episode, optional episode_end.

## D-4 — The scanner mirrors the episode-number grammar (replicated, cited)

Plugins are package-main binaries in one root module — no cross-import
(the precedent is written into sidecar.go:48-52: grammar replicated
verbatim with a citation). The scanner gains a small replicated helper
returning `(season, number, ok)` for an episode stem, and
`associateSidecars` indexes episodes with it exactly where it used
`seasonEpisodeOf` else `bareNumberOf` — `byToken` keyed {season, number},
`byNumber` keyed number. Sidecar-FILENAME grammar is untouched; only the
episode-index side widens, so `TestSrtAssociation`, `TestBareNumberFallback`,
and `TestSerialLevelOST` keep passing unchanged.

## D-5 — Conservative token rules (the false-positive budget)

Romans II–IX only: single-letter `I`/`V`/`X` are excluded (pronoun
"I"; `Mega Man X`). The trailing CamelCase rule needs BOTH letter cases
(`AniLiberty` strips; `Remastered`/`Arc` stay). Brackets yield numbers
only when the whole bracket is 1–3 digits. The tag list is a small
table-driven set, extended by editing the table. `Show 2 - 05` keeps the
shipped last-number-wins convention (episode 05).

## D-6 — No episode-document titles; example 6's title alternatives stay out of scope

Example 6's English candidate ("Demon Slayer - Entertainment District
Arc") requires bilingual title reduction — TMDB-enrichment territory
(backlog B3). The parse-level guarantee for that layout: season 1 (no
marker anywhere) and episode 1 from `- 01`, with the folder title
preserved whole by D-1 rule 6. The romaji candidate is what an online
source will later overwrite the view with.

## D-7 — The release/tag vocabulary lives in one neutral, extractable mask file

The vocabulary D-1's steps 1, 3, and 6 draw on — the bracket-segment
patterns, the whole-token release-tag tables (source/resolution/language),
and the group-tag shape rule — is centralized in ONE dedicated file inside
`plugins/serial-parser`, `releasetags.go`, named and keyed neutrally:
role/shape-based identifiers, comments, and mask keys (a
`releaseTagTokens` table keyed by role, plus the case-shape rule for group
tags), with NO resource brand (no "AniLiberty") in any identifier,
comment, or mask key. `serialparse.go`'s grammar logic references the
file's tables rather than inlining masks. Rationale (the gate-1
amendment): per-resource plugins arrive as separate git projects next; the
mask file must be extractable/replaceable without renaming a brand through
the parser. Acceptance TEST ROWS are input DATA, not vocabulary: the
user's literal `- AniLiberty` string stays as a `TestSeriesNameGrammar`
row exercising the shape rule (and the spec delta's scenario text is
fixture-level input, byte-stable). Alternative rejected: inline tables in
`serialparse.go` — extraction into a separate project would force a
brand-named rename through the parser.

## D-8 — Derived acceptance rows from the real collection inventory (neutralized)

Beyond the six literal acceptance rows, the test tables gain rows DERIVED
from the operator's real anime collection. Sourcing is AUTHORING-TIME ONLY:
the inventory below was harvested once from `/media/inrat/anime` and
lives here as source material — no probe, no test, and no runtime path
reads the volume (probes stay self-contained Go table tests).

Neutralization rule: titles and group names in derived rows are invented
neutral inventions ("Azure Harbor", "Crimson Vale"; groups like
`[Bluewave]`, `[KTX]`) while the folder/episode STRUCTURE is preserved
byte-for-byte — separators, bracket shapes, marker positions, casing
quirks, whitespace damage. The six human-literal rows keep their real
strings per D-7 (fixture data, not vocabulary).

Harvested shape inventory (real form → derived row family):
- FOLDER shapes: `Title TV 1` (space form); `Title TV-2` (hyphen form);
  `[TV-1] [2023] [WEBRip] [1080p] [RUS + ENG] [Multi5-Subs]` (bracket
  train with TV-1 inside); `Title II` (×3 real cases); `Title Season 2`
  (word form); `Title S02` + dotscape `Title.S01.1080p.StudioBand`;
  `[Group] Title [BDRip 1080p x265 FLAC]` (leading group + rip bracket);
  `Title [WEB-DL 1080p] [ADN]` (multi-bracket with source tag); Cyrillic
  title + bracket (non-ASCII preserved); trailing-space
  `Title - Heaven's Feel ` and double-space
  `Title  Unlimited Blade Works` (normalization rows).
- TENSION rows: `Nekomonogatari_(Shiro)`; `Steins;Gate 0`;
  `Danganronpa_3_The_End…`.
- EPISODE shapes: `[01] Title 01 серия.mkv` (+ same-shape `.ass` sidecar);
  `[Group] Title II 01 [BDrip 1920x1080 x264 FLAC].mkv` (roman in the
  episode filename); `Title Season 2 - 01 [1080p].mkv`;
  `[Group] Title - 01 [BDRip 1080p x265 FLAC].mkv`.

Rulings the inventory forces (D-8 refines D-1 step 1 and D-5's budget):

- **Two-part bracket rule:** a bracket/paren segment at the NAME'S START
  is group-tag position and strips as a group tag regardless of inner
  shape (`[Erai-raws]`, `[Group]`, `[Bluewave]`); a segment elsewhere
  strips only when its content matches a release mask — a tag token
  (source/resolution/language/type such as ONA or OVA/codec), a year
  (`(2008)`), a pure number (`[01]`), CRC-like hex (`[C48E56C8]`), a
  subs/dub combinator (`RUS + ENG`, `Multi5-Subs`), an all-caps acronym
  of ≤5 letters (`[ADN]`, `[KTX]`), a CamelCase group shape (≥2
  capitals), or a rip-combinator segment CONTAINING any of those
  (`[BDRip 1080p x265 FLAC]`, `[1080p AVC AAC]`). A non-leading segment
  matching NO mask is PRESERVED with inner separators normalized —
  `Nekomonogatari_(Shiro)` parses to title "Nekomonogatari (Shiro)",
  season 1. (A trailing unbracketed group-shaped token still strips per
  D-1 step 6: `- AniLiberty`.)
- **`Season <N>` word form is a season marker** (cut, season = N) beside
  the existing `Nth Season` ordinal form, and `TV` markers accept space,
  hyphen, or dot separators (`TV 1`, `TV-2`, `TV-1`).
- **Trailing bare Arabic numerals are never season markers:**
  `Steins;Gate 0` parses to title "Steins;Gate 0", season 1 (negative
  row); the roman rule stays II–IX letters only.
- **Marker forms are anchored:** a digit inside a multi-word title
  (`Danganronpa_3_The_End…` → "Danganronpa 3 The End…", season 1) is
  never a marker; only the anchored forms match.
- **Bare episode numbers below 1 are no number** (the shipped `n > 0`
  sidecar posture), so a file-backed `Title 0` stays a skipped episode
  stage.
- **Empty-title fallback row:** a folder that is ONLY a bracket train
  (`[TV-1] [2023] …`) strips to empty and falls back to the shipped
  raw-cleaned-name title (serialparse.go's existing fallback), with the
  TV-1 marker still yielding season 1.

## Interfaces (cross-group)

- Fact names are unchanged: `serial_record`, `dir_name_raw`,
  `series_relative_path`, `relative_path` (parser.go:35-40). No new
  facts; no proto/sdk change.
- Grammar contract between groups 1 and 2: both binaries derive the same
  (season, episode-number) pair from the same episode filename stem —
  group 2's replicated helper mirrors group 1's rules and cites them (the
  sidecar.go:48-52 convention). Drift between the two is caught by
  `TestBareNamedEpisodeSidecar` (group 2) mirroring
  `TestEpisodeNameGrammar` rows (group 1).
- Match query shapes are unchanged: series →
  `{title, season, dir_name_raw}`; episode →
  `{season, episode[, episode_end]}`. Only the apply-rule and the
  always-present season change.
- Group 3 (qa) consumes groups 1–2 through the real subprocess graph and
  re-derives `TestQASerial_JointLibraryE2E`'s hand-derived expectations —
  no harness or fixture-layout changes, only the expected-title/season
  rows and the retirement of the absent-season sentinel.

## Risks / Trade-offs

- [A title genuinely ending in a CamelCase word after a separator is stripped]
  → the shape requires mixed case in the final token; the removal is
  visible in the parsed `dir_name_raw` (kept verbatim) and fixable with
  the shipped title override.
- [`Show 2 - 05`-style names rely on last-number-wins] → shipped sidecar
  convention, now shared by the parser; documented in the spec text.
- [Existing libraries keep their old parses until enrichment re-runs]
  → the queue is namespace-keyed (`sources.serial-parser` present = skip);
  documents refresh on the shipped staleness/identity rules. The title
  override remains the immediate remedy for a specific serial.
- [itest expectations churn by design] → the churn is the acceptance:
  `Bleach (1080p) [C48E56C8]` → `Bleach`, `The Ribbon Hero [ONA] FulL
  mkv` → `The Ribbon Hero`, absent-season rows → season 1.

## Migration Plan

None — no schema, proto, config, or dependency changes. The behavior
applies on the next scan/enrichment of a serial library; rollback is a
plain revert of the two plugins and the itest rows.

## Open Questions

None deferred — the two judgment calls are resolved in-design and worth a
human glance at the gate: `TV <N>` sets the season to N (alternative:
strip with the season defaulting — identical output on the ground-truth
layout), and the roman range is II–IX (extend by table edit).
