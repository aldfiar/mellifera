# unified-parser

## Why

One shared release-name parser, per the user direction (2026-10-12): using the
current season/episode parsing knowledge, build ONE base-level parser that
walks a name start-to-end extracting the common elements — title, season,
episode, quality/resolution, source, codec, language — with the SPA presenting
the parsed fields under human names ("Season 2 · Episode 1", not raw parser
keys). Today the grammar lives in three binaries (serial-parser's
`releasetags.go`/`serialparse.go`, tv-parser's `parseTV`, the serial-scanner's
sidecar copies) with a recorded cross-binary divergence (the 720i split —
backlog §serial follow-ups), and a LIVE defect proves the cost: the shape
`Show_Name_II_[01]_[HEVC].mkv` (real case `Katainaka_no_Ossan_Kensei_ni_Naru_II_[01]_[HEVC].mkv`,
60 items, one whole series) skips the parser entirely — the pure-number
edge-bracket rule requires `[NN]` at the stem's end, and the bare-number
reducer's bracket strip then destroys the `[01]` bracket itself, so the file
parses numberless ("no episode number in filename") and the series' pages sit
empty in the SPA.

## What Changes

- New `pkg/releasename` — the shared release-name parser: the role-keyed
  vocabulary (source/resolution/language/type/codec) as the single source for
  BOTH stripping and emission, one start-to-end pass returning a structured
  result (title, season, episode, episode_end, resolution, source, codec,
  languages, year).
- **Behavior change (owned)**: `720i` joins the resolution vocabulary —
  whole-token title stripping removes it, so `Title 720i.mkv` parses to title
  "Title" and an episode `Show/Title 720i.mkv` stays NUMBERLESS (previously
  episode-720 in serial-parser; numberless in serial-scanner already — the
  divergence closes on the stricter reading).
- **Behavior change (owned, the live defect)**: a pure-number `[NN]`/`(NN)`
  bracket is an episode-number candidate wherever it occurs in the stem
  (rightmost wins) — a trailing decoration bracket (`_[HEVC]`) no longer
  displaces the episode bracket. Flows to sidecar association through the
  living parity rule (the scanner index matches the parser's shapes).
- `serial-parser` and `tv-parser` become thin adapters: grammar code moves to
  the shared package; namespace keys, Match/apply rules, skip semantics, and
  confidence semantics are preserved; both namespaces gain the structured
  release fields (resolution/source/codec/language/year) beside their existing
  keys. tv-parser's release-group dash rule stays adapter-local (design D-7).
- `serial-scanner`'s own `resolutionRe` copy dissolves into the shared package
  (the backlog §serial follow-ups cross-binary row closes).
- SPA labels: the serial seed's serial-parser `display_fields` gains the
  declared composite `season_episode` — rendered "Season N · Episode M" — via
  the parser-display composite mechanism (the camera/dimensions precedent).
- `_view` arbitration stays last-writer-with-provenance: the decision is
  recorded (design D-5), the rule lands with B3 when a real second title
  writer exists.

## Capabilities

- **New Capabilities:** `release-name-parsing` — the shared parser's contract:
  one grammar + vocabulary, the structured result shape, the thin-adapter
  rule, and cross-binary consistency.
- **Modified Capabilities:** `serial-library` — the "Name-driven season,
  episode, and title inference" requirement becomes the shared grammar with
  the two owned behavior changes; "Sidecar association" inherits the shared
  grammar; a new "Structured release-field emission" requirement covers the
  serial namespaces' new fields. `parser-display` — the serial seed's
  `display_fields` declaration gains the `season_episode` composite and its
  render contract.

## Impact

- New: `pkg/releasename/` (vocabulary, grammar, result, tables).
- Modified: `plugins/serial-parser/` (adapter; `releasetags.go`/
  `serialparse.go` move), `plugins/tv-parser/` (adapter; `tvparse.go` grammar
  moves), `plugins/serial-scanner/sidecar.go` (copies dissolve), the three
  packages' test tables, `internal/module/registry.go` (serial seed
  display_fields), `web/src/components/metadata/ParserFooter.tsx` (+ its
  test).
- Unchanged: proto contracts, `pkg/sdk`, core packages (`internal/scan`,
  `internal/enrich` — no media-type literals, no queue changes), all existing
  green behavior (the full name-grammar tables, confidence shapes, scanner
  sidecar tests, `TestQASerial_JointLibraryE2E`).
- Out of scope: the enrichment restart-sweep bug (a separate /fix change —
  backlog §"Enrichment restart sweep is vacuous on fresh boot"); expanding
  tv-parser's apply rule to film names (films stay title-only skips there);
  per-field confidence; `release_group` in the shared result; emitting the
  `type` role (ona/ova/oad) as a field.
