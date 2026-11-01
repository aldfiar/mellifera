# Proposal

## Why

Enabling `MELLIFERA_STREAM_OPT_IN_CODECS` on a live library (the alatoic
deployment, 2026-10-30) made its whole HEVC backlog packable at once: the
frontier enqueued every pilot and next-after-watched episode, the streams
dir crossed the budget, and the sweep began evicting — but a frontier build
is never-watched by construction, and eviction is least-recently-watched
first with never-watched sorting oldest. The evict→repack loop that
followed (the same one previously seen as a single-item anomaly on
`itm_4_3e944b3980c42994`) is structural: plain watch-recency order always
reaps exactly what the frontier keeps (re)packing, every 60 s tick, forever.

The budget sweep runs right after the frontier sweep in the same pass and
already holds the information needed to break the loop: the fronted set.
Only the policy lacks it.

## What Changes

- `orchestrator.Evictions` takes the frontier's working set (`fronted`) and
  pins it: non-fronted artifacts are evicted first (recency order among
  them, orphans still waste-first at equal recency), fronted builds fall to
  eviction LAST — whatever their (necessarily never-watched) recency.
- The cap still bounds the disk: when the budget cannot be met from
  non-fronted artifacts alone, fronted builds ARE evicted (in their own
  recency/path order) — and the caller (`sweepBudget`) logs a loud WARN
  ("budget below frontier working set"): the operator signal to raise
  `MELLIFERA_ORCH_BUDGET_GB` above the working set.
- `sweepFrontier` returns the fronted item-ID set (jobs the frontier wants
  built, whether or not this pass could enqueue them — a queue-full defer
  is still fronted), and `newSweep` hands it to `sweepBudget`.
- A successful eviction also unpublishes the build record: `sweepBudget`
  resets the item's `doc["streams"]` to `state=none` when the evicted
  directory is the published build (state complete, nonce match). Without
  it the integrity sweep sees state=complete against a gone directory,
  judges it corruption, and repacks — a second, independent evict→repack
  engine that frontier pinning cannot touch (observed on alatoic 2026-10-30:
  non-fronted items cycling evict→repack every tick with no WARN).
- Orphan reaping, the `0` = off knob, the within-budget no-op, and
  deterministic ordering are unchanged; existing eviction behavior for a
  nil/empty fronted set is byte-identical to before.

## Non-goals

- No change to the frontier policy itself (what gets fronted), to the
  budget accounting basis (disk truth), or to pack-on-play.
- No scheduler/priority work for pack storms (the lane buffer widening was
  a separate commit on the same branch).
