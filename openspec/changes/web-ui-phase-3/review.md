# Gate record — web-ui-phase-3

## Reviewer verdict (GATE 2)

@wf-reviewer, 2026-10-08: **Pending Fixes**, resolved same day.

- Probes: 26/26 re-run from the three deltas, all exit 0; `make check` OK; dist verified to reference exactly the committed bundle.
- Diff vs deltas: scan-library 4/4 PASS, playback-progress 3/3 PASS, web-ui 8 PASS / 2 FLAG / 1 FAIL.
- UNPROBEABLE 7.3 walkthrough: 4/4 areas confirmed by the reviewer's own inspection (home grid/Continue/Next-up, hidden sidebar with scroll-independent collections list + pinned footer, photos chips-over-masonry, admin sticky table + edit overlay).
- Standards axis: api ≤8 exported symbols, pure-delegation handlers, try/catch-guarded localStorage keys, pastel accents confined to dots/chips, no plugin/enrich UI under admin, embed directive untouched. Judgement-call notes (not violations): dotClass triplication, `useAdminStatus` dead hook, GET literals inlined in queries.ts (the phase-2 shipped pattern).

## Gate-decision resolutions (operator-approved, 2026-10-08)

- **FAIL (collection header)** — the header omitted the delta's item count + updated date. FIXED in `9f0e0fc`: CollectionHeader renders "N items · updated <date>" from the summary; probes 25c42c99 + fe5d7468 re-run exit 0, vitest 78/78, dist rebuilt.
- **FLAG Q1 (sidebar SHALL)** — "detail pages SHALL highlight their parent collection entry" was unimplemented. Operator chose **implement**: done in `68270a7` (SideNav re-uses ItemDetail's `["item", id]` cache key — one item request total; disabled off `/items/:id`); two new tests; vitest 80/80.
- **FLAG Q2 (Next-up semantics)** — shipped derivation is skip-aware ("lowest strictly AFTER the highest-started"). Operator chose **accept shipped**; the requirement prose now states that reading (scenario bodies untouched — probe ids remain valid).
- Reviewer Q4/Q6 (serial option in the SPA add form; `useAdminStatus` dead hook) and the palette question (Q5: pastel dots/chips over the shipped slate base vs a full pastel retheme) are recorded as POST-archive candidates, not gate blockers.

## Session check re-derivation

- All 26 probes re-extracted from the deltas by the session and re-run after each resolution: 0 failures (final pass post-`68270a7`).
- `openspec validate web-ui-phase-3 --strict` → valid.
- Full gate `make build && make check && make test` green (16 packages, check.sh OK).

## Human archive approval

Approved by the operator, 2026-10-08 (structured gate question: "Resolve, then archive" — applied).
