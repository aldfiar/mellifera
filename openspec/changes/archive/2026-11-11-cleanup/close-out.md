# cleanup — close-out

Closed 2026-11-11. Branch `feature/cleanup` (base 792031a), archived as
`openspec/changes/archive/2026-11-11-cleanup/`. Strict lane, `skip_specs: true`
(comment-only change — no spec deltas existed to merge).

## What shipped

Repo-wide Go comment-noise cleanup executing the 11 Nov six-agent wf-auditor
audit (`.tmp/comment-noise-audit.md` in the main tree): 4 P0 stale/misleading
docs fixed, comment-DRY pinning (one canonical home per invariant, one-line
ID pointers at replicas), essay compressions, doc.go catalog strips, itest
debt removal. Net −1,891 lines across 100 modified .go files (3403
insertions / 5294 deletions), proven comment-only by token-stream
normalization at the gate — zero code-line changes.

- Group 1 — the 4 P0s + 3 micro stale-docs: web.go stale SPA-gap clause,
  store/doc.go INV5 rewritten affirmative (both sanctioned seams named),
  viewer.go calling-pattern tutorial deleted, seriesStartedFact doc
  reattached to the real def, notLoadedErr / EXPECTED-TO-FAIL / "later
  tasks" fixes.
- Group 2 — comment-DRY pinning: D7 ledger-scoping canonical at
  store/viewer.go's ledgerSlotWhere; ERROR-FLOOR LAW bullet in
  store/doc.go's Invariants (affirmative phrasing; file-wide zero
  "MAY NOT"); ensure*-mechanics canonical at ensureColumn; cmd D3
  suppression canonical at suppressionSet + process-ctx canonical at
  main.go's first site; tmdb secret + image-enricher soft-fail canonicals
  in each plugin's doc.go.
- Groups 3–6 — essay trims: cmd (main.go −332, playback.go −137,
  browse_wiring.go −71 incl. the law's own cited BAD example), api/module
  (router.go 73%→56.5%, handlers.go −436, EXPORT-BUDGET LAW canonical at
  Deps.SourceInventory, viewer-scope four-canonical family per design),
  store/stream mega-docs (Describe 65→24, Pack 45→30, embedded-audio
  canonical, matroska canonical at containerNative + classification
  cross-reference), enrich/scan/naming (~380 lines).
- Group 7 — 15 doc.go Public-API catalogs stripped (−295), INV registries
  kept everywhere; plugin/pkg residuals (21 files, ~215).
- Group 8 — two retired itest stubs deleted (symbol-free confirmed),
  86/82-line headers compressed to house idiom, integration_async_test.go
  reworded.

## Final per-task receipts (durable record)

33 rows in the machine home: 16 coder greens + 1 superseded red + 16
reviewer re-runs. First green + reviewer re-run per task:

| Task | First green | Reviewer re-run |
|---|---|---|
| 1.1 stale P0 pair | wf-coder 2223ms | 1786ms |
| 1.2 INV5 affirmative | wf-coder 178ms | 99ms |
| 1.3 seriesStartedFact reattach | wf-coder 380ms | 180ms |
| 1.4 micro trio | wf-coder 373ms | 326ms |
| 2.1 store pinning | wf-coder 175ms | 94ms |
| 2.2 cmd pinning | wf-coder 313ms | 918ms |
| 2.3 plugin pinning | wf-coder 1008ms (red once: baseline gofmt debt) | 1029ms |
| 3.1 cmd trims | wf-coder 323ms | 308ms |
| 4.1 router+handlers | wf-coder 179ms | 187ms |
| 4.2 api/module residual | wf-coder 177ms | 177ms |
| 5.1 mega-doc sites | wf-coder 121ms | 120ms |
| 5.2 store/identity/pack residual | wf-coder 229ms | 98ms |
| 6.1 enrich/scan/naming | wf-coder 186ms | 184ms |
| 7.1 doc.go catalog strips | wf-coder 2210ms | 1381ms |
| 7.2 plugin/pkg residuals | wf-coder 1021ms | 1003ms |
| 8.1 itest debt | wf-coder 444ms | 455ms |
| git-check | — (built-in; green at close, post-push) | |

The one red receipt: task 2.3's duty glob swept
`plugins/shikimori/convert_test.go`, committed unformatted at base —
baseline debt fixed session-side (commit 55d8fd8, whitespace-only) after a
worktree-wide sweep confirmed it was the only gofmt offender across every
duty-globbed path.

## Gate record

GATE 1: APPROVED with all surveyor recommendations ("Amend per recs, then
go") — 2 amendment rounds, frontier EMPTY at approval. GATE 2: PASS, zero
FAIL (see review.md): 16/16 duties re-ran green; token-stream proof of
comment-only across all 100 files; swaggo 178=178; keep-law greps green;
deleted symbols orphan-free; integration.md's 12 edges landed in group
order. Human archive approval recorded in review.md (2026-11-11).

## Residuals (P3, non-blocking — seeded for a future pass)

- Three canonical invariant homes exceed the 1–3-line aspirational shape by
  design (Describe ~24, ReenrichSource ~18, migrateLedgersUserScoped ~15) —
  the six-slot exception class; do not "fix" mechanically.
- Secondary CODE findings from the audit remain outside this change's
  comment mandate: releasename regex-table duplication, enrich/queue.go
  dead alias, episode_titles/display factNamespaces near-dup (verify INV2
  seam sanction first).
- go-clean-code skill density anchors are stale (pack.go cited at 30%, now
  internal/stream/pack.go at 31%, internal/pack/pack.go at 66% pre-trim) —
  session updates the skill in the main tree post-merge (untracked there).
