# Spec Delta

## ADDED Requirements

### Requirement: Play-priority pack dispatch

Packaging jobs requested by an actual play (the play verb's enqueue seam —
a plain pack-on-play and a failed-run retry alike) SHALL dispatch through a
dedicated preferred lane that the worker pool serves ahead of the shared
dispatch buffer, so a play's pack never starves behind a backlog of
background work. Background packaging jobs — the sweep's frontier
enqueues, the integrity repack, the descriptor's lazy re-heal — SHALL keep
the shared buffer and SHALL NEVER enter the preferred lane. A preferred-lane
enqueue that cannot be accepted (the lane is full, or the queue is not
running) SHALL return an error to the caller — honest backpressure the
caller surfaces (the play verb answers `queued:false`); it SHALL NOT
silently drop and SHALL NOT spill into the shared buffer. The shared
buffer's contract is unchanged: non-blocking drop-on-full, exactly as
before. The preferred lane's capacity is a locked constant — no new env
knob.

#### Scenario: A play-requested pack dispatches ahead of queued background work

- **WHEN** the shared buffer holds a backlog of background packaging tasks draining under a busy worker pool, and a play enqueues a pack through the preferred lane
- **THEN** the play's pack is taken by a worker ahead of the backlog's head — the viewer's pack starts building while the background tasks wait

#### Scenario: An idle queue wakes a parked worker for the play pack

- **WHEN** the queue is idle — the shared buffer empty and every worker parked waiting on the shared dispatch receive — and a play enqueues a pack through the preferred lane
- **THEN** a parked worker wakes and dispatches the play's pack without any shared-lane work arriving first — the play never waits on background traffic to be discovered

#### Scenario: A full preferred lane refuses the play enqueue honestly

- **WHEN** the preferred lane is full (or the queue is stopped) and a play attempts its enqueue
- **THEN** the attempt returns an error naming the refusal, nothing is buffered, the shared buffer is untouched, and the play verb answers `queued:false` — the honest deferral the client renders, never a silent drop

#### Scenario: Background work never enters the preferred lane

- **WHEN** the sweep fronts a pilot, the integrity sweep re-enqueues a broken build, and a descriptor GET arms its lazy re-heal, all while the preferred lane sits empty
- **THEN** all three land in the shared buffer and none in the preferred lane — the lane stays reserved for plays
