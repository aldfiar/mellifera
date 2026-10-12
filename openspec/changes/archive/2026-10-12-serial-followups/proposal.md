# serial-followups

## Why

The parent change `serial`'s GATE-2 review left two approved follow-ups.
First, the parser and scanner disagree on episode numbers below 1: the
parser accepts `[00] Title.mkv` and `Title 0 серия.mkv` as episode 0, while
the scanner treats every bare form with a number below 1 as numberless —
the same file is episode-linked by one binary and numberless by the other.
Second, `releasetags.go` encodes the resolution vocabulary twice (a regex
and a token table); drift between them would surface false episode numbers
through the parser's bare-number reducer.

## What Changes

- Gate every bare episode-number extraction in the parser to n ≥ 1: a
  `<N> серия` marker or a pure-number `[NN]`/`(NN)` bracket whose number is
  below 1 is numberless (a skipped parser stage), matching the scanner
  grammar's existing gate. **Behavior change.**
- Derive `resolutionRe` in `releasetags.go` from
  `releaseTagTokens["resolution"]` — the token table becomes the single
  source of truth for the resolution vocabulary. Zero behavior change.
- Pin both sides: `TestEpisodeNameGrammar` below-1 skip rows plus an
  unbracketed-resolution drift row, and scanner parity rows in
  `TestBareNamedEpisodeSidecar`.

## Capabilities

- **New Capabilities:** none.
- **Modified Capabilities:** `serial-library` — the "Name-driven season,
  episode, and title inference" requirement tightens: n ≥ 1 across every
  bare extraction form, below 1 is numberless, and resolution tokens never
  yield an episode number.

## Impact

- `plugins/serial-parser/serialparse.go` (the gate),
  `plugins/serial-parser/releasetags.go` (derived regex),
  `plugins/serial-parser/parser_test.go` and
  `plugins/serial-scanner/serial_test.go` (rows only).
- No itest/e2e expectation churn: no e2e fixture carries a below-1 number,
  and the refactor is behavior-identical.
