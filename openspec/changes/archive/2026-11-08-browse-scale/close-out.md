# close-out — browse-scale

Closed 2026-11-08 · strict lane · worktree `feature/browse-scale` (final head `2a4cae5`, merged from 211665a main) · loop root = worktree (re-anchored wave 1 — this wf install executes duties at the cwd git toplevel; the header `worktree:` key reaches only git-check).

## What shipped

`GET /api/v1/search`, `GET /api/v1/libraries/{id}/facets` (+ additive facet filter params — genre/kind/status trio on `/series`, genre/kind only on `/items`, whose `status` name stays pinned to enrichment-lifecycle), and `GET /api/v1/home` over the new RAM read model: `internal/naming` (the pure composer core, extracted byte-identical from internal/api, golden-vector pinned) and `internal/browse` (search index with fold tiers alternate < composed-substring < composed-prefix, facet aggregates resolved through the SAME `naming.Namer.MetadataFor` as About, two-part epoch, buffered-1 wake, 60 s janitor reconcile, honesty-backstop id-only serving, 2.0 MB retained heap at 10k items vs the 3.3 MB budget). cmd wiring: boot-warm janitor, scan/gate fan-out wakes, OnTitleChange pokes, per-Corpus-pass namer-cache clear (task 3.6 — the wf-qa-flagged defect). Web: SearchPalette (⌘K, 120 ms debounce, full abort lifecycle, one-request-per-keystroke pinned), FacetChips (once-per-view fetch, additive-only wiring, photo-absence by mount shape), Home.tsx single-/home rewrite (the 1+N fan-out deleted), nextup.ts trim. GLOSSARY: Search index / Facet / Continue row. OpenAPI + embedded dist regenerated.

Living specs after archive: global-search (created), home-continue (created), library-facets (created), recommendation-sorting (updated), web-ui (updated) — +8 requirements, ~2 modified, −0.

## Final receipt summary (45 events, 20/20 green; durable record — the machine home `.tmp/browse-scale/` is deleted at clean)

| task | apply attempts | first green | reviewer re-run |
|---|---|---|---|
| 1.1 naming extraction | 1 | 889 ms | 9.4 s |
| 1.2 metadata projection | 1 | 1133 ms | 1.5 s |
| 2.1 browse search core | 2 | 2004 ms | 166 ms |
| 2.2 facet aggregates | 1 | 591 ms | 589 ms |
| 2.3 index service | 1 | 741 ms | 164 ms |
| 3.1 /search | 1 | 1785 ms | 1.0 s |
| 3.2 /facets + filters | 1 | 383 ms | 1.2 s |
| 3.3 /home | 1 | 2003 ms | 1.2 s |
| 3.4 OnTitleChange pokes | 1 | 1116 ms | 1.0 s |
| 3.5 cmd wiring | 1 | 352 ms | 2.4 s |
| 3.6 namer-cache fix | 1 | 1169 ms | 1.1 s |
| 4.1 joint itest (@wf-qa) | 1 | 1024 ms | 413 ms |
| 5.1 SearchPalette | 1 | 1330 ms | 2.2 s |
| 5.2 FacetChips | 1 | 2186 ms | 1.5 s |
| 5.3 Home rewrite | 1 | 1537 ms | 1.3 s |
| 5.4 nextup trim | 2 | 3328 ms | 3.3 s |
| 6.1 openapi/dist regen | 1 | 12 ms | 11 ms |
| 6.2 GLOSSARY | 1 | 10 ms | 9 ms |
| 6.3 GATE anchor | 1 | 353.3 s | 16 s (cache-hit) |
| git-check (session act) | 2 | 59 ms | 45 ms |

Honest red journal (3 events, all resolved): 2.1 attempt 1 — the pre-re-anchor topology red (duty executed at the main tree while the code lived in the worktree; fixed by re-anchoring the loop root, receipt journals the failure); 5.4 attempt 1 — the duty's negative grep caught the retired export's name in the runner's own new header comment (comment reworded, duty untouched); git-check reviewer re-run — the gate-phase handoff records themselves (session log + reviewer verdict authored post-receipt; substance PASS, restored all-green at 2a4cae5).

GATE-2 anchor: `CGO_ENABLED=0 go test ./...` 30 packages ok; check.sh OK (lint clean; 6 budget WARN lines, none over the >12 fail bar — internal/browse at 11); web vitest 52 files / 697 tests (−7 vs the 704 baseline = exactly 5.4's authored trim); tsc clean. Baseline anchor was taken pre-task at 211665a (Go rc 0, vitest 704, tsc rc 0).

## Gates

- **GATE 1** — APPROVED 2026-11-06 (explicit gate answer "Approve — register and build") after 3 surveyor rounds / 6 questions, all AMEND, frontier emptied. Mid-apply narrowing amendment (human-approved via gate question): facet-status landed additive-only on /series — /items' `status` param name is pinned by living specs (plugin-pipeline, async-enrichment).
- **GATE 2** — APPROVED (reviewer @ 079f743; spec PASS, standards FLAG 5 judgement calls none blocking; human archive approval 2026-11-08 recorded in review.md).

## Deviations and follow-ups (reviewer-seeded, non-blocking)

- internal/browse ships 11 exports vs design D2's ≤8 (honestly recorded in its doc.go; mechanical gate warn>8/FAIL>12). Future: fold SearchIndex/NewSearchIndex/Hits into the Service surface.
- The 977-line joint test file (mandated byte-faithful cmd-mirror glue) — fixture extraction as follow-up hygiene.
- `web/src/lib/watchedRows.ts` is now DEAD production code (5.3 removed its last consumer) — delete the module + its 8-test file; stale comments there reference the retired derivations.
- P3 notes: s01e02 grammar has no dedicated test pin (mechanically guaranteed by composed-substring matching); /home's next pick derives started-max from the bounded ≤50 rows (>50-row edge could re-offer a started episode — design-consistent).
- Known pre-existing debt untouched: docs/api-reference layers behind (dedicated docs pass, per docs-debt record).

## Handoff hygiene

`handoffs/` deleted post-archive per loop law (records were belief; the receipts summary above is the durable record). Machine home `.tmp/browse-scale/` deleted by `wf pipeline clean`.
