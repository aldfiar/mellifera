<!-- wf: source_fingerprint=2e973d550ff046df551c7d66fde1ef4eaa6ce05ee8b5a42bda91aeb48ff36358 -->
# Tasks: serial-followups

Probe CWD is the project root. Probes are `go test` runs over the two serial
plugin packages. Probe bodies live in the spec delta
(`specs/serial-library/spec.md`); each box links its OWN scenario probe —
one scenario per box, never a shared id (wf's tick refuses an id linked to
more than one box). Group dependencies (DAG): 1 → 2 (both groups add rows
to the same `TestEpisodeNameGrammar` table in `parser_test.go`). Max
concurrency 1: (1), then (2).

## 1. Episode-number n ≥ 1 parity

- [x] 1.1 Gate the parser's bare episode-number forms to n ≥ 1 in `plugins/serial-parser/serialparse.go` `bareEpisodeNumberOf` — the `<N> серия` branch and the pure-number `[NN]`/`(NN)` edge-bracket branch return not-found when the extracted number is below 1 (gate-and-stop per design.md D-1, matching the scanner's `episodeNumberOf` and the trailing-standalone branch's existing `n > 0`), so `Show/[00] Title.mkv` and `Show/Title 0 серия.mkv` stay numberless skipped stages (applies=false, with a reason); pin both skip rows in `TestEpisodeNameGrammar` (`parser_test.go`) beside the existing `Title 0.mkv` row [probe:e5e4a73d6b92dc66]
- [x] 1.2 Pin the scanner side of the parity: extend `TestBareNamedEpisodeSidecar` in `plugins/serial-scanner/serial_test.go` with below-1 bare-form episodes — a `[00]`-bracket-named video and a `0 серия`-named video index no sidecar (`episodeNumberOf`'s gate is already `n > 0` on every bare form; a numbered companion sidecar falls serial-level, never episode-linked) [probe:34a9318571c0de5b]

## 2. Single-source resolution vocabulary

- [x] 2.1 Derive `resolutionRe` in `plugins/serial-parser/releasetags.go` from `releaseTagTokens["resolution"]` — builder at init, tokens sorted length-descending, the literal `1080[pi]` form retired (design.md D-2) — with zero behavior change: the full existing parser surface (`TestSeriesNameGrammar`, `TestEpisodeNameGrammar`, `TestSeriesGrammarConfidence`, `TestEpisodeParse`) stays green untouched; add one `TestEpisodeNameGrammar` row pinning an unbracketed resolution token (`Show/Show - 01 360p.mkv` → episode 1, not 360) as the drift-detection row for the derived regex [probe:027e73182dc02afb]
