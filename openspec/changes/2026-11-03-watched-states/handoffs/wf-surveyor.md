# Handoff — wf-surveyor → wf-reviewer · 2026-11-03-watched-states

**ROUND 2 — rewritten 2026-11-03 after amendment round 1 (latest-wins; supersedes the round-1 record wholesale).** Still at propose phase, before GATE 1. This is BELIEF; `<change>/integration.md` and the receipts are the evidence. Map `ffc3e76` (re-verified this session: CURRENCY: CURRENT, same commit as round 1 — the amendment touched only the change folder, no code drift, all round-1 groundings carry). `openspec validate 2026-11-03-watched-states --strict`: **rc 0** (re-run this session).

## Audit summary (round 2)

All 11 round-1 recommendations **landed verbatim** in proposal.md, design.md, tasks.md, specs/web-ui/spec.md — verified by diffing against the committed round-1 artifacts at `ffc3e76`: hunks map 1:1 onto the questions, no scope creep, task ids unchanged (1.1–1.5, 2.1–2.4, 3.1–3.4, 4.1–4.2), checkbox state and group headings untouched, specs/recommendation-sorting not touched (already round-1 correct). Graph re-built against the amended plan: same node set (≈55), edges now ≈19 (17 planned relations + 3 amendment-added test edges minus resolved unknowns — per-edge status in integration.md §1).

Round-2 live spot-checks (load-bearing set): `getItem` handlers.go:1180 (body makes NO `recsFactsFor` call — sites remain :849/:920/:1101/:1460; the amended premise "composes NO facts today" matches code) · `seriesEpisodes` :1551 · `getSeries` :1505 · `useProgressList` queries.ts:270, key `["progress"]` :273, consumers Home.tsx:427/:555 + ItemDetail.tsx:1216 · `reportedRef` Player.tsx (web/src/components/playback/Player.tsx) :109/:306–309/:315 · `MarkWatchedRow` Collection.tsx (web/src/pages/collections/) def :1538, stale comment verbatim :1532–1537 · SeriesGrid :1471 / series-poster-grid :1492 / SeriesCard :1578/:1514 · ItemGrid :1809 · EpisodesView :1697 · `listProgress` :816 (`if recent {` :831 no facts; scored :849).

Verdicts (round 2 — all three PASS clean):
- **Wiring coverage: PASS** — the four route-coverage gaps closed: single-item GET (1.1+D1), single-series GET (1.2+D1), series-episodes (1.1+D1), `sort=recent` branch (1.3+D2, both branches + no-resurrect clause); `sort=path` resolved as recommended (ledger-set stamp, score absent, path order untouched, photo carve-out explicit). store layer still ZERO changes; amendment's corrected wording ("nothing new at the store layer; routes gain one batched composition of EXISTING reads") matches the code.
- **QA seam coverage: PASS** — all four dispatch joints named-tested: roundtrip (a)–(e) incl. the NEW 400-on-unknown-`include` probe (3.1) + the NEW `internal/recs/recs_test.go` leaf partition case (3.1+D7); 3.2 reworded to the real churn (TestGoldenCompletedSkipsResumeBonus order `mid, done, plain` → `mid, plain, done`, recs_ordering_test.go, progress_recs_test.go, nextup.test.ts); 3.3 incl. the `reportedRef`-bypass vitest case.
- **Complexity/blast radius: CONTAINED** — all three round-1 hidden-scope items now NAMED in task text: queries.ts in 2.1, MarkWatchedRow comment refresh in 2.4, reportedRef bypass in 2.4+3.3. No new nodes/files; the amendment added edges and test targets only. Group DAG unchanged (1→2→3→4).

## Resolved questions (all 11 — RESOLVED, zero open, zero waivers)

| Q | Where it landed (artifact · section) |
|---|---|
| Q1 `getItem` composition | design.md D1 items bullet (premise corrected verbatim) · tasks.md 1.1 · proposal.md Change 1 |
| Q1b `getSeries` stamp | design.md D1 series bullet ("wire parity with the list") · tasks.md 1.2 |
| Q2 `seriesEpisodes` stamp | design.md D1 episode-rows bullet (narrative order kept, `rec_score` absent) · tasks.md 1.1 · proposal.md Change 1 |
| Q3 `sort=recent` withdrawal+stamp | design.md D2 (both branches, opt-out must not resurrect, recent gains the batched read) · tasks.md 1.3 · proposal.md Change 2 |
| Q4 `sort=path` ledger-set stamp | design.md D1 (incl. photo carve-out note, "a field stamp never reorders") · tasks.md 1.1/1.2 · proposal.md Change 1 |
| Q5 shared `useProgressList` | design.md D2 (shared query deliberate, ItemDetail consequence spelled out) · tasks.md 2.1 (queries.ts NAMED) · proposal.md Change 2 |
| Q6 `MarkWatchedRow` semantics | design.md D6 note (already exists, becomes effective, comment refreshed, no behavior change) · proposal.md Non-goals rewrite · tasks.md 2.4 |
| Q7 live site names | design.md D5 · tasks.md 2.3 · proposal.md Change 5 · web-ui spec delta (serial-grid/tv-grid vocabulary gone everywhere) |
| Q8 3.2 churn targets | tasks.md 3.2 (the four in-code sets named; "testdata/golden carries none of these shapes") · design.md D7 |
| Q9 parse-400 + leaf case | tasks.md 3.1 · design.md D7 (e) + leaf home in recs_test.go |
| Q10 `reportedRef` bypass | design.md D3 bypass paragraph · tasks.md 2.4 ("BYPASSES ... the flag forces the write") · tasks.md 3.3 vitest case · proposal.md Change 3 |

New questions introduced by the amendment: **NONE** (every hunk audited; photo carve-out on sort=path is spec-consistent — the DTO requirement is unconditional, no UI site claims photo grids).

## Waiver list

**None.** Nothing waived — every question resolved by amendment. The question frontier is empty; GATE 1 can be requested.

## Reviewer reminders (for GATE 2 re-grounding)

- Same seam-widen orphan check as round 1: `OnProgress`'s 3-arg signature appears in router.go:72, fanOut watch_detect.go:21, both legs, main.go:373, and THREE test files construct closures (progress_test.go, watch_detect_test.go, qa_recs_roundtrip_test.go's mirror) — any caller left at 3 args is a compile break, not a silent orphan.
- The golden churn is deliberate: TestGoldenCompletedSkipsResumeBonus's order flip is the partition WORKING — review against the spec scenario "Watched entries sink below unstarted ones", not as a regression.
- NEW (round 2): tasks.md carries no `verify:` duty fields yet. Pre-existing, not amendment-introduced; the lite schema template ships none either. Precedent: they are authored between GATE 1 and register (archived 2026-11-03-recommendation-sorting/tasks.md carries 13; commit `eef95a9` in this worktree). `wf pipeline register`'s line-numbered refusal is the backstop — expect that refusal at register if duties aren't authored first.
- Recorded waivers, once any exist at GATE 1, are honored per openspec-loop §The gate; an unwaived, unimplemented edge is a FAIL.
