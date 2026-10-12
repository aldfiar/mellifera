# GATE 2 record — film-name-parsing (2026-10-12)

## Verdict: PASS

Reviewer (@wf-reviewer, independent session): **PASS, must-fix-before-archive: none.**

- Spec axis 4/4 requirements PASS. Every probe block re-run green (18/18 blocks,
  13 distinct commands, both ffprobe-gated e2e probes in full mode — no SKIPs).
- `wf change check film-name-parsing` OK: 6/6 boxes ticked, re-run green,
  coverage requirements=4 probe_backed=4 unprobeable=0 gaps=0.
- `go vet ./...` rc 0; `go build ./...` OK; `go test -short -count=1 ./...`
  19 packages ok. Standards axis: no violations.
- Mid-apply amendment verified consistent: option A (title keeps the year —
  "Chainsaw Man The Movie Reze Arc 2025" + year field) applied to 6 normative
  spots per the GATE-1-approved "year stays in film titles"; design.md D-6
  mechanism claim corrected; two probe ids re-minted
  (baf248f57f0ae517→1e06684476d17d30, c3f1b288df118c54→44deab64a16b300e);
  all 18 ids audit-clean.
- In-scope deviation accepted on its merits: `bareEpisodeNumberOf` grammar gate
  (stripReleaseTagTokens + blankSeasonTokens before the number scan) — required
  by the film-path acceptance (`Show.S01.mkv`, `H.264`'s `264`); season
  attribution reads the original stem and is unaffected; every episode row green.
- Pinned tv-parser edges byte-untouched (`TestMatchAdversarialEdges`); plugin
  absent from the diff.
- Backlog-routable notes (not gating): N2 — pkg/releasename/parse.go at 450
  lines, split the title pipeline out on the next grammar addition; N3 — pin
  the ≥2-letter acronym floor with a `Some.Movie.1080p.X-Files.mkv` keeps-whole
  row; N1 — lastConsumedSpanEnd micro-inefficiency, no action.
- Working-tree discipline at commit: stage ONLY this change's files
  (pkg/releasename/{parse,tags,parse_test}.go,
  plugins/serial-parser/{parser,parser_test}.go,
  internal/itest/{qa_serial_e2e_test,qa_film_joint_test}.go) + the change
  folder (+ regenerated docs/.source_map.json if precedent) — the web/* dirty
  files belong to the user's separate fix-episode-playback-start change.

## Human archive approval

Archive approved by the user, 2026-10-12 — GATE 2 summary presented (verdict
PASS, backlog notes listed, commit staging plan stated); user replied
"approve".
