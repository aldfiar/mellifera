# Handoff: wf-surveyor → wf-reviewer (tombstone-lifecycle)

Written: 2026-11-09 · Base: fa3c254 · Full record: `openspec/changes/tombstone-lifecycle/integration.md`
**RE-RUN 4 (third amendment round — post-red). The 2.4 joint ran RED and falsified D4's identity assumption; the amendment (tasks 2.5/2.6/2.7 + the D4 design note + amended deltas) is AUDITED. Frontier: 2 questions (Q11, Q12) — both plan-text fixes on unreceipted artifacts, neither blocking the amendment's code tasks or duties.**

## Environment anomaly (re-ground the same way)

`wf index build` exits ok (551 files, fp=8a4dc6f3) but reports `symbols=0` — def/callers queries all miss. All structure in the audit was grounded via grep + direct source reads (`file:line` in integration.md §1). Verify claims the same way; do not trust the index this session.

## Round-4 verdicts (per the dispatch's 7 surface points)

1. **Bridge edges: VERIFIED.** `GetSeriesByPath` exists (internal/store/series.go:109-121), status-unfiltered (visibility clause only) — the tombstoned series doc resolves. `parsed.series_relative_path` read on both sides via `EpisodeFacts` (display.go:398-401). Parser-composed title real: serial-parser Match→Convert→Merge writes `sources["serial-parser"].title` on every settled serial series doc (plugins/serial-parser/parser.go:64-80/:143-151/:155-183). Rename-stability for the bracketed-year shape proven through pkg/releasename (`stripBracketSegments` tags.go:20 strips `(...)`, `cutSeasonMarker` strips `S01` → "Anchor Point S01" and "Anchor Point S01 (2024)" both parse to "Anchor Point"; the fixture constants pin exactly this shape, qa_tombstone_adoption_joint_test.go:89-90). Grounding wording defect → Q11.
2. **Derive-walk exclusion: VERIFIED.** `allItems`/`allSeries` (queue.go:568/:586) feed EXACTLY `deriveLibrary` (queue.go:414/:418) + `reenrichScope` (reenrich.go:94/:98) — grep incl. tests found no other caller. Self-heal safe (strip never hits dead rows; heal is scan-side; healed rows re-enter); 1.1's select, settle, and Notify untouched; explicit-rowIDs reenrich bypasses the walks by design (pre-existing, unchanged — boundary note, not a gap).
3. **Fire guard: VERIFIED.** Fire site queue.go:750/:758; `queueRow.status` field queue.go:635 (loaded :704); `statusDeleted` state.go:17. Composition with the self-move guard covers the mid-run tombstone race (integration.md E23; residual dead→dead move lands in R2's harmless posture).
4. **Self-move guard: VERIFIED.** The cited bug is real in receipted code (BeginTx first at store/adopt.go:40/:85, unconditional DELETE :60-61/:108-109); guard placement as pinned is implementable; the moves' only non-test caller is scan/adopt.go:75/:80 — from==to reachable only via the self-candidate path.
5. **Coherence: VERIFIED modulo Q11/Q12.** 2.5's six-test duty includes the three receipted 2.3 names (byte-identical tasks.md ↔ contract); 2.6's four names match; 2.7 carries @qa + grammar-shaped node; D4 amendment rulings match the contracts point-for-point; amended 3.2 + write-routes clause consistent with all four deltas (packaged-playback's 404s are unknown-item only; web-ui is banner-only). Receipted lines 1.1–2.4 byte-untouched — verified field-by-field against the registered pipeline.yaml rows (drift gate will pass).
6. **Cross-task interactions: VERIFIED.** 2.5 and 2.6 share no files (scan vs enrich/store) — concurrent under the ≤3 cap; 2.7 depends on both; 2.4's receipted line untouched and its duty can only go green after 2.5+2.6.
7. **Strict validate: PASS, zero failures** (`npx --yes -p @fission-ai/openspec@1.14.0 openspec validate tombstone-lifecycle --strict` → "valid"; pin from openspec/config.yaml:3).

## Question ledger (round 4)

- Q1–Q10: resolved in rounds 1–2 (integration.md §3a) — unchanged, receipted work stands.
- **Q11 (LOW, new)** — the bridge-floor citation "SeriesName's parser legs in fact order" is wrong about live code: `SeriesName` has ONE parser leg (serial-parser, display.go:105); the serial→tv order is `factNamespaces` (:419-441, the FACTS law); tv-parser never writes series docs (Match gated on an episode filename, plugins/tv-parser/doc.go:15), so its title leg is a dead fallback. Behavior unaffected. **Recommended:** name the single serial-parser leg (drop the dead fallback) in tasks.md:21 + contract 2.5 + design.md:63 + playback-progress delta :52 — all unreceipted text.
- **Q12 (MEDIUM, new)** — playback-progress delta carries the stale pre-amendment scenario trio at :84-97 beside the amended :54-77 set: the old "renamed directory" scenario omits the bridge clause (contradicts its amended copy); the other two are byte-duplicates. Strict validate cannot see it (no uniqueness rule), but archive merges deltas into the living spec. **Recommended:** delete :84-97 before the re-register.
- Waiver list: empty. Q11/Q12 are plan-text fixes on unreceipted artifacts; recommended to fold both into one pre-register pass.

## GATE-1 standing (surveyor recommendation, human decides)

The amendment is ADDITIVE (new task ids 2.5/2.6/2.7; amended unreceipted 3.2; extended deltas) with receipted lines byte-untouched — the freeze law reopens the gate only on deleted scope. The standing GATE 1 approval covers proceeding straight to re-register (drift gate passes mechanically) + apply 2.5/2.6 (concurrent), then 2.7; record the human's acknowledgment of this amendment round (as rounds 1–2 were) and resolve Q11/Q12 in the same pass.

## GATE 2 pointers

- Re-ground the r4 edges E22–E26 from integration.md §1 (all grep-verified this run; the index is unusable).
- The audit:true contracts to read at the gate now include 2.5 and 2.6 (post-red) beside 2.2/2.3/3.1/3.2.
- 2.4's RED receipt is expected state until 2.5+2.6 land; its re-green plus 2.7's joint is the cross-series + stock-survival proof.
