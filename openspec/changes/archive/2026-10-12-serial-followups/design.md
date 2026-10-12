# Design: serial-followups

## Context

Two flag sites from the parent change's GATE-2 review (motivation in
proposal.md — Why):

- `plugins/serial-parser/serialparse.go` `bareEpisodeNumberOf` (:183): the
  `<N> серия` branch (:184-186) and the pure-number edge-bracket branch
  (:187-195) return the captured number ungated, while the function's own
  trailing-standalone branch (:201) gates `n > 0` and its doc comment
  (:181-182) already states "a number below 1 is no number". The scanner's
  mirror grammar `plugins/serial-scanner/sidecar.go` `episodeNumberOf`
  (:146) gates ALL three bare forms (:152, :159, :165) and feeds the
  sidecar-match episode index (`walk.go:211` — `ok=false` indexes nothing).
- `plugins/serial-parser/releasetags.go` encodes the resolution vocabulary
  twice: `resolutionRe` (:22) and `releaseTagTokens["resolution"]`
  (:46-48). The regex feeds `bareEpisodeNumberOf`'s reducer
  (serialparse.go:196); the table feeds title stripping and the bracket
  mask. A value dropped from the regex while the table keeps it turns e.g.
  "Title - 01 360p.mkv" into episode 360 (`bareNumberRe` matches "360",
  last-number-wins).

## Goals / Non-Goals

- Goals: parser/scanner parity for below-1 episode numbers, pinned in both
  test surfaces; one source of truth for the resolution vocabulary.
- Non-Goals: no change to SxxExx handling (both binaries accept any SxxExx
  token today, E00 included — parity already holds there; see Open
  Questions); no cross-binary vocabulary sharing (plugins are package-main
  binaries — the sidecar's own `resolutionRe` copy stays); no itest churn
  (no e2e fixture carries a below-1 number).

## Decisions

- D-1 Gate-and-stop, not gate-and-fall-through. A gated branch returns
  not-found immediately — exactly the scanner's shape (`sidecar.go:152`
  and `:159` return `ok = n > 0` at once, never falling through to the
  next form). "Title 0 серия.mkv" is numberless even though a later form
  could see no number either way; parity with the scanner is the contract.
- D-2 The token table is the single source; the regex is derived at init.
  `resolutionRe` becomes a builder over `releaseTagTokens["resolution"]`
  (tokens sorted by length descending for safe alternation order),
  following the file's established `buildReleaseTagPatterns` pattern
  (:148-165). The derived alternation is exactly the 7-form table
  `(?i)(?:2160p|1080p|1080i|720p|480p|360p|4k)`; no token is a prefix of
  another, so alternation order cannot change a match. Single-sourcing
  forced a vocabulary decision: the retired literal also matched `720i`
  (its `720[pi]` arm — 8 match forms) with no table entry behind it
  (`1080i` WAS table-backed — both `1080p` and `1080i` are entries — but
  `720i` never was), so the derived regex no longer strips `720i` from the
  bare-number reducer. Adjudicated PASS-with-FLAG at GATE 2: rare
  interlaced form, no fixture anywhere, and the delta's SHALL clause holds
  under the mechanical reading — the table IS the resolution vocabulary.
  Package-var init order is dependency-driven (Go spec), which
  `releaseTagSet`/`releaseTagPatterns` already rely on.
  Rejected: keeping both literals plus an equality test — a test drifts as
  easily as the literals; structural single-sourcing cannot.
- D-3 The delta modifies the LIVING requirement (full block copied per the
  schema's modified-requirements workflow) and states the n≥1 rule as a
  cross-grammar sentence, giving the scanner parity rows their spec anchor.
  The positive bare-number grammar stays anchored by the UNCHANGED
  "Bare-number episode filenames" scenario (byte-identical to the living
  spec, so its probe id survives archive). Each box carries its OWN
  scenario and probe id — one scenario per box, never a shared id: wf's
  `change tick` hard-refuses an id linked to more than one box
  ("ambiguous"). Rejected: one extended scenario whose probe ran both
  surfaces and covered all three boxes — GATE-1 found exactly that
  refusal at apply time. Per-box shape: 1.1 → "Below-1 episode numbers are
  numberless" (`-run TestEpisodeNameGrammar`), 1.2 → "Below-1 episodes
  index no sidecar" (`-run TestBareNamedEpisodeSidecar`), 2.1 →
  "Resolution tokens never yield an episode number" (full parser package —
  the zero-behavior-change floor).

## Risks / Trade-offs

- [Derived regex silently weakens if the table loses a value] → the table
  is a package literal (compile-time input); the unbracketed-resolution
  grammar row (`Show - 01 360p.mkv` → episode 1) fails loudly if stripping
  stops covering a value.
- [Alternation order matters only for future tokens] → length-descending
  sort in the builder; today's seven values are order-insensitive.

## Open Questions

- SxxExx tokens with a 0 episode (`S01E00`): accepted by BOTH binaries
  today (parser `serialparse.go:164-169`, scanner `sidecar.go:147-149`).
  Tightening them is a further behavior change — out of scope here;
  surfaced to the human gate as a possible follow-up.
- The sidecar binary keeps its own `resolutionRe` copy (sidecar.go:60) —
  and post-change that copy now diverges CONCRETELY: it still carries the
  `720[pi]` arm the parser's derived regex dropped, so `Title 720i.mkv` is
  episode-720 to the parser (the 7-form regex no longer strips `720i`;
  `bareNumberRe` last-match takes "720") but numberless to the scanner
  (its copy strips `720i`; nothing remains). That is a cross-binary
  divergence of exactly the class this change's motivation closes for
  below-1 numbers. Backlog decision space, two candidate resolutions:
  (a) `720i` enters the resolution vocabulary in BOTH binaries — the
  parser's `releaseTagTokens["resolution"]` and the scanner's side (which
  has no table today, regex only); or (b) the bare-number reducer learns
  suffix discrimination (a digit run followed by a resolution-style suffix
  is not a bare episode number). Candidate for a future change, not this
  one.
