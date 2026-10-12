# Design: unified-parser

## Context

Three binaries carry release-name grammar today, none importable from the
others (plugins are package-main binaries — the no-cross-import convention is
cited inside `plugins/serial-scanner/sidecar.go:48-52`):

- `plugins/serial-parser/releasetags.go` — the role-keyed vocabulary
  (`releaseTagTokens`, roles source/resolution/language/type/codec), the
  derived `resolutionRe` (serial-followups D-2), the two-part bracket rule,
  the CamelCase group-tag shape. Strips tags; emits nothing.
- `plugins/serial-parser/serialparse.go` — the serial grammar: always-season
  series parse, anchored season markers, trailing romans II–IX,
  `bareEpisodeNumberOf` (SxxExx → `<N> серия` → pure-number edge bracket →
  last standalone number), the series-dir season fallback.
- `plugins/tv-parser/tvparse.go` — the older simpler grammar (`parseTV`):
  SxxExx, title from the pre-token region, resolution/year/release_group,
  4-tier confidence.
- `plugins/serial-scanner/sidecar.go` — replicated copies
  (`seasonEpisodeRe`, `resolutionRe` at :60 still carrying `720[pi]`,
  `cyrillicEpisodeRe`, the edge-bracket pair, `bareNumberOf`,
  `episodeNumberOf`).

The live defect (diagnosed against the real grammar, 2026-10-12): for
`Katainaka_no_Ossan_Kensei_ni_Naru_II_[01]_[HEVC].mkv` —

1. `edgeBracketNumberReEnd` (`serialparse.go:48`) requires the pure-number
   bracket at the stem's END; the trailing `_[HEVC]` displaces it → no match.
2. The bare-number reducer (`serialparse.go:202`) strips ALL bracket segments
   — including the `[01]` episode bracket itself — before scanning:
   reduced = `Katainaka_no_Ossan_Kensei_ni_Naru_II_ _ ` → no digit remains →
   `ok=false` → the whole file skips ("no episode number in filename"). 60
   items, one whole series, empty pages.

The 720i divergence (backlog §serial follow-ups, adjudicated at the
serial-followups gate): `Title 720i.mkv` is episode-720 to serial-parser
(the 7-form derived regex no longer strips 720i; `bareNumberRe` last-match
takes "720") but numberless to serial-scanner (its copy strips 720i).

See proposal.md — Why for motivation; the spec deltas own the behavior
changes.

## Goals / Non-Goals

- Goals: one shared grammar + vocabulary at a public seam; structured
  emission beside stripping; the two owned behavior changes; the scanner
  divergence closed mechanically; the SPA season/episode presentation under
  human labels; every existing green row kept green.
- Non-Goals: no proto/sdk changes; no core (`internal/scan`, `internal/enrich`)
  changes; no `_view` rule change (D-5); no expansion of tv-parser's apply
  rule to film names; no per-field confidence; no `release_group` in the
  shared result (D-7); no emission field for the `type` role (ona/ova/oad —
  stays strip-only v1); the enrichment restart-sweep bug (separate /fix).

## Decisions

- D-1 Home: `pkg/releasename` (new shared leaf). The user's D-7 rule keeps
  resource plugins separate future git projects, so shared parsing must be
  importable by them — `internal/` is wrong for that, and a NEW base plugin
  is heavier than needed (the adapters stay in the existing plugin binaries;
  plugin code cannot be imported by anything, which is exactly why the
  grammar cannot live in any one plugin). `pkg/releasename` joins the
  shared-leaf set (`proto/` and `pkg/sdk` — project_structure.md dependency
  note) and imports nothing project-internal; plugins and any future
  standalone project import it downward.
- D-2 Emission shape: one `Result` struct — Title; Season + SeasonExplicit;
  Episode; EpisodeEnd; Resolution; Source; Codecs; Languages; Year. Singular
  roles (resolution/source/year) take the LAST matching token (the grammar's
  established last-wins convention); list roles (codec/language) keep token
  order. Season honesty: no marker → Season 0, SeasonExplicit false — the
  adapters own their defaults (serial maps 0 → 1 with confidence 0.6, exactly
  its always-season rule; tv treats 0 as no season → title-only skip,
  preserving its apply rule). Episode honesty: no number or a below-1 bare
  number → 0 (the n ≥ 1 gate is preserved — serial-followups parity holds).
  Namespace mapping (serial + tv): `resolution`/`source`/`year` as scalars,
  `codec`/`language` as arrays, beside the existing keys; absent fields are
  omitted, never zeroed (the footer skip-silent posture). Confidence stays
  adapter-computed from the result's flags (serial 1.0/0.6; tv's 4-tier
  unchanged) — per-field confidence is speculative until a consumer exists.
- D-3 720i: decision-space option A from the backlog row — `720i` enters the
  resolution table ONCE, in the shared package; both binaries inherit it.
  Whole-token title stripping then removes 720i everywhere: `Show/Title
  720i.mkv` stays a numberless skipped stage (was episode-720), a file-backed
  `Title 720i.mkv` parses title "Title" (was "Title 720i"), and tv-parser
  film titles lose trailing 720i tokens. serial-scanner behavior does not
  change (its copy already stripped 720i) — the divergence closes on the
  stricter reading, which is the point: one vocabulary. Rejected: teaching
  the bare-number reducer suffix discrimination (option B) — it keeps two
  grammars alive, the exact disease this change cures.
- D-4 Pure-number bracket anywhere (the live defect): a pure-number
  `[NN]`/`(NN)` bracket (pure digits, 1–3 — years and CRC hex never match the
  shape) is an episode-number candidate WHEREVER it occurs in the stem; the
  rightmost pure-number bracket wins. Existing rows keep their values: the
  stem-start `[01] Title.mkv` case is unchanged (only one candidate), and
  `[00]` stays gated numberless by the n ≥ 1 gate. The trailing-decoration
  family (`Show_Name_II_[01]_[HEVC].mkv` → episode 1, season 2 from the
  trailing roman) becomes parseable. Flows to sidecar association through the
  living parity sentence (the scanner index recognizes "the same episode-name
  shapes the parser recognizes") — a mirrored sidecar now associates.
- D-5 `_view` arbitration: KEEP last-writer-with-provenance. No live second
  title writer exists today (kinopoisk is CLIENT Mode-B; tmdb is a
  seeded-but-unloaded slot), so any smarter rule is untestable speculation —
  and the core's `_view` recompute is authoritative over plugin proposals
  already. Revisit trigger recorded for B3: when tmdb (or any external
  source) becomes a real concurrent title writer, THAT change owns the
  explicit-beats-inferred rule. Zero core code in this change.
- D-6 SPA labels: a declared composite `season_episode` — the parser-display
  composite mechanism (camera = make + model, dimensions = width × height is
  the shipped precedent), extended with a label-aware join rendering
  "Season N · Episode M" (season part alone renders "Season N"; episode part
  alone "Episode M"; neither present → the pair skips silently). The serial
  seed's serial-parser binding declares `["display_title", "season_episode",
  "parsed_from"]`; a series document (no episode fact) renders "Season 2", an
  episode document "Season 2 · Episode 1". The SxxEyy eyebrow and
  `identity_fields` stay untouched (compact identity is a different surface);
  the tv seed's display_fields stay untouched (its new namespace fields are
  stored losslessly and display on a later declaration if wanted).
- D-7 Adapters stay thin, semantics stay put: each plugin keeps its namespace
  keys, Match/apply rule, skip reasons, and confidence semantics; its test
  table rows stay verbatim (the living spec's scenario probe ids survive on
  byte-identical scenarios). tv-parser's release-group rule (`-RG` dash
  suffix) stays ADAPTER-LOCAL deliberately: the shared strict CamelCase group
  shape does not strip "RG" (2 letters < 3), so sharing it would break
  `Show.S01E01E02.1080p.WEB-DL.x264-RG.mkv`, while adopting tv-parser's loose
  dash rule shared-wide would eat real title words ("Title - Sequel"). The
  shared result carries no group field v1.

## Interfaces

`pkg/releasename` (package `releasename`) — signatures only; the shared
surface every adapter consumes:

```go
// Result is the structured emission of one start-to-end parse (D-2).
type Result struct {
    Title          string
    Season         int    // 0 = no marker; always >= 1 when SeasonExplicit
    SeasonExplicit bool   // marker (incl. trailing roman II-IX) was present
    Episode        int    // 0 = no episode number (incl. below-1 bare forms)
    EpisodeEnd     int    // 0 = no multi-episode end
    Resolution     string // last resolution token, e.g. "1080p"
    Source         string // last source token, e.g. "web-dl"
    Codecs         []string
    Languages      []string
    Year           int    // 0 = none
}

// ParseName parses a raw series/film NAME (a serial directory name, or a
// file-backed serial's raw file name — extension stripped) start-to-end.
func ParseName(name string) Result

// ParseEpisodeName parses a library-relative EPISODE path: the stem's episode
// grammar, with the season falling back to the series directory's inference,
// else 0 (the adapter decides its default).
func ParseEpisodeName(relPath, seriesDir string) Result

// EpisodeNumberOf is the scanner-side episode index entry point: season,
// number, sxxexx basis, ok — the sidecar association grammar.
func EpisodeNumberOf(stem string) (season, number int, sxxexx, ok bool)
```

Adapter contract (what each binary keeps): namespace keys and shapes, the
Match/apply rule, skip reasons, confidence computation, and its test rows —
everything D-7 lists. What each binary drops: every replicated regex/table
(`sidecar.go:53-76` copies dissolve; `tvparse.go`'s `resolutionRe`/
`seasonEpisodeRe` move; `serialparse.go`/`releasetags.go` move).

## Risks / Trade-offs

- [The grammar move shifts a title an e2e asserts] → tables move with rows
  verbatim; the qa group re-runs the full four-package suite and the serial
  joint e2e (box 4.2) before archive; the e2e fixtures carry no 720i and no
  decoration-displaced brackets (checked: `qa_serial_e2e_test.go`,
  `qa_async_acceptance_test.go`, `qa_acceptance_test.go`).
- [The anywhere-bracket rule misreads a numbered bracket that is not an
  episode] → the shape is pure digits, 1–3 (years/CRC/resolution tokens never
  match), and the rightmost-wins order matches the trailing-number
  convention; the grammar rows pin both the new shape and the `[00]` gate.
- [720i title stripping changes a tv-module expectation] → the tv fixtures
  place tags after the SxxExx token (`Better Call Saul S02E06 720p-RG.mkv`,
  `Mandalorian.S02E03.720p.WEB-DL.mkv`); their titles are pre-token regions
  and do not change.
- [Config declares `season_episode` before the renderer knows it] → one box
  ships both; an undeclared-to-the-renderer composite resolves null and skips
  silently, so even a partial deploy degrades to the old footer, never a
  broken one.
- [Package tables and plugin tables duplicate rows] → deliberate (D-7):
  plugin rows stay verbatim for probe-id stability; the package tables gate
  the shared grammar; box 4.1 mirrors the canonical shapes so a divergence
  fails in each binary.

## Migration Plan

None — additive. No persisted-state shape changes (namespaces gain keys; the
document JSON is schemaless), no migrations, no config-entity changes beyond
the serial seed's `display_fields` declaration (a config value, applied at
seed — existing installs re-seed via `INSERT OR IGNORE` semantics only on
fresh boots; the renderer skips an unknown composite silently, so an un-updated
SPA shows the old footer). Rollback is a plain revert; both owned behavior
changes revert cleanly.

## Open Questions

None blocking. (SxxExx tokens with a 0 episode — `S01E00` — remain accepted
by both binaries, carried from the serial-followups gate as a possible future
tightening; out of scope here.)
