# Proposal

## Why

Alatoic production (2026-11-07, HEAD 211665a): the frontier pin set — one
candidate episode per streams-gated serial, 74 serials — is UNBOUNDED, so all
74 builds stayed pinned (62.7G on disk against a 60G budget), the sweep sat
in permanent "budget below frontier working set" mode, and eviction ate
pinned builds the frontier immediately re-fronted and re-packed: ~5,000
evict→repack cycles per 48h on ~14 items (~4TB writes on a full system disk).
Meanwhile the enrich queue's 64-slot buffer has been full since boot, so
pack-on-play enqueues silently drop (a WARN and a fallthrough to the direct
floor) and the TV hangs on «страница обновится сама» for a pack that was
never queued. Fully-watched serials' builds linger forever (no
completion-driven cleanup), while never-watched pilots stay pinned for
weeks. The fix must SHRINK the artifact footprint and make cleanup fast and
prioritized — raising `MELLIFERA_ORCH_BUDGET_GB` is explicitly rejected.

## What Changes

- **Bounded pin set** — the frontier's working set becomes a watch-recency-ordered,
  byte-capped prefix of frontier positions (a locked fraction of the existing
  budget): only the most-recently-relevant serials' frontier positions are
  pinned AND proactively packed; serials beyond the cap get nothing
  proactive — their path to a pack is play (with the priority seam below).
- **Completion-driven demotion** — when a serial becomes fully watched, the
  sweep evicts its remaining pack builds on the next tick, unconditionally
  (never gated on budget pressure), ahead of the budget pass so the freed
  bytes count in the same pass; the packaging record is unpublished and a
  replay re-packs through pack-on-play.
- **Eviction suppresses re-front** — a build removed by a policy sweep
  (budget or demotion) is NOT re-fronted or re-packed until a real play of
  that item: the frontier skips the suppressed position, the integrity sweep
  skips the suppressed repack, and a play clears the suppression. This kills
  the evict→repack churn loop.
- **Play-priority pack dispatch + honest backpressure** — the enrich queue
  gains a preferred lane served ahead of the shared buffer; the play verb's
  pack enqueues (plain play and failed-run retry) ride it, background work
  never does. The wire contract is unchanged; the SPA stops ignoring the
  play POST's `queued:false` and renders a retryable not-queued state
  instead of promising «страница обновится сама» forever.
- Verified-working machinery is untouched: the retention sweep (10-min
  dual-anchor grace), `.trash` eviction vocabulary, `resetStreamsState`
  unpublish, `watchScanLimit`, and the budget knob (`MELLIFERA_ORCH_BUDGET_GB`
  stays 60 in production; the cap fraction is a locked constant, no new env
  knob).

**Supersession.** This change ABSORBS and SUPERSEDES the stale unopened
change `openspec/changes/2026-10-30-frontier-pinned-eviction/` (authored 30
Oct, 0/7 tasks, never registered): that change's code intent — the fronted
pin inside `Evictions`, the eviction unpublish, `sweepFrontier` returning
the working set — already landed in the live tree, but its spec half never
did (the living spec still does not describe the pin or the unpublish).
This change's deltas bring the spec up to that reality AND refine it (the
pin becomes bounded and suppressed; demotion and play-priority are new).
The old change folder itself is the session's/user's to archive — this
change neither edits nor deletes it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `packaged-playback`: the watch-driven frontier's working set becomes a
  bounded, watch-recency-ordered, byte-capped pin set with
  eviction-suppression semantics; budget eviction of a named build marks the
  suppression; a new completion-driven demotion requirement evicts
  fully-watched serials' builds on the next tick; the budget requirement
  documents the pin as eviction's last resort.
- `async-enrichment`: packaging dispatch gains play-priority — a preferred
  lane the workers serve ahead of the shared buffer, play-requested packs
  only, with honest backpressure (a refused enqueue returns an error, never
  a silent drop).
- `web-ui`: the pack-on-play wiring reads the play POST's `queued` answer —
  a deferred enqueue renders the retryable not-queued preparing state
  instead of the forever auto-update promise.

## Impact

- `internal/orchestrator/frontier.go` — `FrontierIn` gains recency, build
  bytes, pin cap, and suppression inputs; `Frontier` returns the bounded
  pinned set and the fully-watched demotion set beside the jobs (pure
  policy, disk-free — the composition shell feeds it).
- `cmd/mellifera/playback.go` — the sweep passes the new inputs; the
  demotion executor evicts + unpublishes ahead of the budget pass; a
  process-lifetime suppression set threads `sweepFrontier` / `sweepBudget` /
  `sweepIntegrity` and the `Deps.Play` closure; `resetStreamsState` learns
  to reset a
  partial named build (demotion's replay path).
- `cmd/mellifera/main.go` — the play closures ride the urgent enqueue seam
  and the suppression re-arm.
- `internal/enrich/queue.go` (+ `streams.go` doc surface) — the urgent lane,
  `EnqueuePackUrgent`, worker preference, `Stop` closing both lanes.
- `web/src/pages/browse/ItemDetail.tsx` (+ its test) — the `queued:false`
  honest surface with a retry control.
- `internal/itest` — one joint test for the suppression→play→republish loop.
- No API wire change (the play response shape and status codes are
  unchanged); no schema/migration; no new dependency; no env knob.
