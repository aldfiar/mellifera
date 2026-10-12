# Gate record: serial-followups

## Verdict (GATE 2 step 1 — @wf-reviewer)

**GATE PASS** — 3/3 boxes PASS, zero FAIL.

Probe evidence (all re-run uncached by the reviewer, exit codes observed):
- e5e4a73d6b92dc66 `go test ./plugins/serial-parser -run TestEpisodeNameGrammar` → EXIT=0
- 34a9318571c0de5b `go test ./plugins/serial-scanner -run TestBareNamedEpisodeSidecar` → EXIT=0
- 027e73182dc02afb `go test ./plugins/serial-parser` (full package) → EXIT=0

Spec axis: box 1.1 gate-and-stop verified in code (serialparse.go:185-187/:192-194, no fall-through; three skip rows pinned); box 1.2 scanner pin-only with strictly-stronger fixtures (00-companions, sidecar.go:152/:159/:165 gates pre-existing); box 2.1 derived builder verified (defensive copy, length-desc sort, QuoteMeta; literal retired; 360p drift row pinned) and empirically shown stripping 360p identically. The living spec's "Bare-number episode filenames" scenario restored byte-identical post-GATE-1 re-author (id 142510dd698d7b6c reproduces; sha256-verified). Parent D-7 holds (zero brand content added).

720i adjudication: PASS-with-FLAG. The retired literal carried `720[pi]`; the table never held "720i", so the derived regex no longer strips it — the REAL divergence shape is a resolution-only name ("Title 720i.mkv" → episode 720 now, numberless before; "Title - 01 720i" parses episode 1 under both). No behavior-neutral fix exists (single-sourcing forced a vocabulary decision); materiality is a rare interlaced form; the delta's SHALL holds under the mechanical reading (the table IS the vocabulary). Recorded in docs/backlog.md with both resolution paths; design.md Open Question names the instance.

Standards axis: PASS — 0 new exported symbols, no new deps (sort is stdlib), table-driven idiom, no shims, the change IS the DRY fix.

Reviewer-required corrections (both applied pre-archive):
1. design.md D-2's false "match-identical to the literal 1080[pi] form" claim — reworded to the truthful 8-vs-7-form statement.
2. Open Question now names the concrete 720i cross-binary instance and the decision space.

## Human archive approval (GATE 2 step 3)

Approved by the human, 2026-10-12: "approve".

GATE PASS (step 1) + `wf change check serial-followups` exit 0 (step 2, 3/3 re-verified) + approval above (step 3) → `openspec archive serial-followups --yes` authorized.
