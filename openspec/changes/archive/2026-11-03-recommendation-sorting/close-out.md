# close-out — recommendation-sorting

Archived 2026-11-03. Branch `feature/recommendation-sorting` (base main f03a3f3), worktree-attached pipeline, strict lane, 5 groups / 13 tasks + built-in git-check.

## Final receipt summary (the durable record — machine home deleted at clean)

| task | group | final rc | verified at | by | duty duration |
|---|---|---|---|---|---|
| 1.1 | model | 0 | 2026-11-02T23:41:45Z | wf-reviewer | 135 ms |
| 1.2 | model | 0 | 2026-11-02T23:41:45Z | wf-reviewer | 676 ms |
| 2.1 | learn | 0 | 2026-11-02T23:41:47Z | wf-reviewer | 1168 ms |
| 2.2 | learn | 0 | 2026-11-02T23:41:48Z | wf-reviewer | 1134 ms |
| 2.3 | learn | 0 | 2026-11-02T23:41:49Z | wf-reviewer | 1140 ms |
| 3.1 | serve | 0 | 2026-11-03T06:32:28Z | wf-reviewer | 969 ms |
| 3.2 | serve | 0 | 2026-11-03T06:32:26Z | wf-reviewer | 350 ms |
| 3.3 | serve | 0 | 2026-11-03T06:32:27Z | wf-reviewer | 341 ms |
| 4.1 | web | 0 | 2026-11-02T23:42:01Z | wf-reviewer | 2047 ms (vitest 2 files / 43 tests) |
| 5.1 | qa-closeout | 0 | 2026-11-02T23:42:09Z | wf-reviewer | 414 ms (cached; reviewer also re-ran `-count=1` — 6.5 s, 4/4 subtests) |
| 5.2 | qa-closeout | 0 | 2026-11-02T23:42:38Z | wf-reviewer | 14.9 s (swag regen + npm ci + vite build — byte-identical dist) |
| 5.3 | qa-closeout | 0 | 2026-11-02T23:42:01Z | wf-reviewer | 7 ms |
| 5.4 | qa-closeout | 0 | 2026-11-02T23:43:11Z | wf-reviewer | 20.4 s (build + check.sh export budgets + lint + web vitest 35 files/453 tests + tsc) |
| git-check | built-in | 0 | 2026-11-03T06:35:28Z | session | 70 ms (final tree, post-fix, pushed) |

38 receipts total under `.tmp/recommendation-sorting/receipts.jsonl` (deleted by `wf pipeline clean` — this table is the durable record). Red receipts journaled along the way, all honored then fixed: 5.1 (2 reds — synchronous janitor call, missing ModulePresentation wiring in the shared pbWorld harness; test bugs, not production defects), 3.2's flag-fix run (1 red — coder's own test expectation mis-derived the tag constant; code was correct).

## Suite anchors

- **Baseline** (base main f03a3f3, worktree bootstrap): `go test ./...` exit 0 — zero inherited failures; `npm ci` exit 0.
- **GATE 2 anchor**: `go test ./...` exit 0 (long pole internal/itest 259 s; only harness-plugin DEBUG noise).

## GATE 2 outcome

Reviewer verdict FLAG (one finding on 3.2: the single-item progress route under-scored a zero-position episode of a started series — startedness derived from its one-item slice) → human ruling **fix now** → fix landed (scoreItems `startedSeed` param; `seriesStartedFact` series-scoped read; pinning test both startedness legs) → reviewer spot-check **PASS** → human approved **archive + close** (2026-11-03). Full record in `review.md`.

## Commits (apply order)

a4bf5db (1.1) → 2c467e3 (1.2) → 1f7cf83 (2.2) → ee026cd (2.1) → 22ea7c1 (2.3) → 4360ea2 (3.1) → 7f72330 (3.2) → 8f1351c (3.3) → 5e0b08d (4.1) → 0d5bac9 (5.1) → f10091f (5.2) → 70fbca5 (5.3) → 5.4 no commit (gates already green on the tree) → cc8ef9f (gate records + openspec artifacts) → 9e5e2d6 (GATE 2 flag fix + gate record) → archive commit (this folder + merged spec deltas + docs pass).

## Living specs touched by the archive

- `openspec/specs/recommendation-sorting/spec.md` — created (5 requirements: score model, tag source, completion ledger, janitor task, served ordering + photo carve-out).
- `openspec/specs/playback-progress/spec.md` — 1 added (fan-out detection), 1 modified (rec_score SHALL be the entity's recommendation score).
- `openspec/specs/web-ui/spec.md` — 1 added (SPA consumes served order).

## Carry-outs / notes for the future

- P3 (pre-existing, recorded at GATE 2, unfixed by design): listing startedness derives from the FILTERED slice — a path_prefix/top_level filter hiding sibling episodes under-reports startedness in that grid view; `seriesStartedFact` is the pattern if it ever matters.
- Accepted cost: one QueryItemsBySeries point read on the single-entity progress route (never in a loop).
- enrich sits at 12 exports (WARN band) — the next enrich export should split the package.
- Two deliberate "completed" notions coexist in cmd (frontier watched: 90% OR credits-start; recs ledger: 90%-only) — single-sourced constant, spec-pinned, note only.
- Docs debt flagged 24 Oct (api-reference ~8 layers behind; project_structure pre-artwork; api/doc.go INV2/INV5 stale) remains for a dedicated docs pass — the docs actualization for THIS change covered only its own footprint.
