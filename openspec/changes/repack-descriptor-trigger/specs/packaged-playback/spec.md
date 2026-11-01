# Spec Delta

## MODIFIED Requirements

### Requirement: Lazy repack of legacy-layout builds

A published build predating the composed master SHALL heal by repack, and
the playback descriptor GET SHALL be its trigger: when the playback
descriptor is served for an item (`GET /items/{id}/playback` — the verb
every playback actually hits, since the SPA mounts the player from the
descriptor's play_url and `POST /play` is only the failed-state retry
affordance) whose packaging state is `complete` with a build nonce but
whose namespace lacks the build-generation marker — `master: true`, written
by the lane's success persist (every build this lane publishes carries the
composed master, so the marker is honest by construction; the playlist is
never re-read to decide) — the descriptor closure SHALL enqueue exactly ONE
repack through the ordinary enqueue path and its per-item lease, judging
the same stale-build condition the play verb runs, and SHALL still answer
the descriptor for the current old build unchanged — the GET never mutates
packaging state and never blocks on the decision. Repeated GETs while the
repack runs SHALL be lease-absorbed, not re-enqueued per request; the play
verb SHALL keep its own lazy-repack wiring unchanged. The enqueue SHALL
ride the pack gate unchanged: an item the gate refuses SHALL NOT enqueue,
SHALL keep answering its existing build, and SHALL log one INFO refusal
line — no packaging-state change, no ledger row. A current-layout build
(marker present) SHALL NOT re-enqueue, and a failed lazy repack SHALL
inherit the lane's ordinary failure contract — the persisted `failed`
state and its retry affordance — never a retry loop. No library-wide
sweep SHALL requeue legacy builds, and no serving path SHALL rewrite
published bytes.

#### Scenario: A complete legacy-layout build repacks on play

- **WHEN** the playback descriptor GET is served for an item whose packaging state is complete with a build nonce whose namespace predates the build-generation marker, and the pack gate is open
- **THEN** the descriptor closure enqueues exactly one repack through the ordinary enqueue path while still answering the descriptor for the current old build, a repeated GET while the repack runs enqueues nothing (the lane's per-item lease absorbs it), and the repacked build publishes a fresh nonce carrying the composed master and the marker

#### Scenario: A current-layout build does not re-enqueue

- **WHEN** the playback descriptor GET is served for the repacked item — and repeatedly while any repack it triggered is still running
- **THEN** the descriptor closure enqueues nothing: the marker closes the decision window once the build publishes, and the descriptor answers per the ordinary flow

#### Scenario: A gate-closed legacy build keeps playing and skips the repack

- **WHEN** the playback descriptor GET is served for a legacy-layout item the pack gate refuses (the opt-in codec knob disabled on an HEVC item)
- **THEN** the descriptor closure logs one INFO refusal line naming the item and the gate token, enqueues nothing, changes no packaging state, charges no ledger row, and the item keeps answering its existing build
