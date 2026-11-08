# Close-out — eviction (archived 2026-11-08)

**What shipped** (branch feature/eviction; GATE 2 APPROVED 8 PASS / 1 FLAG / 0 FAIL; PR pending):

- **Bounded frontier pin set** (`internal/orchestrator/frontier.go`): recency-ordered working set capped at `budgetBytes*3/5` (locked constant, no env knob); overflow positions emit nothing, join no pin, contribute no bytes; suppressed positions checked before cap accounting.
- **Completion-driven demotion** (`sweepDemotion`): fully-watched serials' builds evicted unconditionally each sweep; `resetStreamsState(demoted)` resets complete-always / partial-only-when-demoted.
- **Eviction suppresses re-front** (in-memory suppression set, process lifetime): budget-named evictions mark; frontier consult skips suppressed; integrity skips with ONE INFO; a real play clears the mark at the closure seam before any pack decision (restart re-fronts once, bounded by the cap — D3).
- **Play-priority lanes** (`internal/enrich`): urgent lane cap 16, drop-on-full identical to `EnqueuePack`; worker loop = ONE blocking select, urgent first (3.3 fix — the original non-blocking pre-check + bare shared receive left an idle-parked worker unwakeable by an urgent send; found by the 5.1 joint test, fixed under the amendment); play closures ride `EnqueuePackUrgent`, descriptor/sweep/lazy re-heal stay on the shared lane.
- **Honest preparing surface** (web): `queued:false` → retryable not-queued preparing state («Упакованная версия не поставлена в очередь — очередь сборки занята.» + retry = one POST per activation), no polling while deferred; `queued:true` path byte-unchanged (poll, stall, single-POST law).
- **Joint itest** `TestEvictionSuppressionPlayJoint`: evict → suppressed (control-paired) → play re-arm under saturated shared buffer → repacked, over the real lane (real scan, real store, real ffmpeg).

**Receipt summary** (22 receipts; final receipt per task green; status rc 0 at close):

| Task | Runs | All-green | Notes |
|---|---|---|---|
| 1.1 frontier pin set | 2 | yes | |
| 1.2 play closure + suppression seam | 2 | yes | |
| 2.1 sweep order + demotion + suppression wiring | 2 | yes | |
| 3.1 urgent lane | 3 | yes | incl. post-3.3 re-run on amended code |
| 3.2 main.go lane wiring | 2 | yes | |
| 3.3 idle-lane wake fix | 2 | yes | red-first proof was pre-register (grammar-coherent, not journaled) |
| 4.1 SPA deferral surface | 3 | yes | |
| 5.1 joint itest (@wf-qa) | 2 | yes | ffmpeg-mandatory; RUN-not-SKIP verified by the reviewer |
| git-check | 4+ | latest green | two honest reds at gate phase (residue: session/review records written after the run) — both resolved by commits + fresh greens |

**Amendment trail**: 5.1 joint finding (idle queue: urgent send cannot wake a worker parked in the bare shared receive; harness repro pending=1/inflight=0, 60s window) → planner amendment (task 3.3 + design.md D4 mechanism correction + delta scenario "An idle queue wakes a parked worker for the play pack") → register re-run (9 tasks, drift gate clean, receipted lines byte-identical) → apply green.

**GATE 2**: APPROVED — 8 PASS / 1 FLAG / 0 FAIL. All 9 duties re-run by wf-reviewer; full-suite anchor green (`go test ./...`, web 50 files/706 vitest + tsc, `make check` incl. exported-symbol budget); validate --strict rc 0; E1–E16 grounded; orphans clean; waivers empty. Verdict record: the reviewer handoff; approval: `review.md`.

**Follow-ups seeded**: stale mechanism comment `cmd/mellifera/urgent_lane_test.go:29-30` (P3, pre-3.3 wording — PR nit); sanctioned shell-mirror duplication in `internal/itest/eviction_shell_test.go` (future extraction candidate); suppressed-set is process-lifetime (restart re-fronts once by design, D3) — revisit only if boot churn reappears in logs.

**Ops**: production context — alatoic data at /mnt/onlas/mellifera-data since 7 Nov; budget stays 60G; the thrash (≈5,000 evict/repack cycles per 48h, ~4TB writes, queue buffer full since boot) continues until this deploys. Human directive at close: update main → rebase → deploy alatoic to verify → PR.
