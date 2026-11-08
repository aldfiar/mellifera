# Spec Delta

## MODIFIED Requirements

### Requirement: Watch-driven packaging frontier

Packaging work SHALL be decided off the play path by a watch-driven frontier,
swept periodically and at boot per library gated on that library's
streams-enabled state (default enabled): the next episode of a serial packages
once its predecessor is watched (episodes ordered exactly as the episodes
listing orders them); a serial with no watch progress packages its first
episode while the working set below has room for it; a movie packages only
when played, never pre-warmed. Items already packaged, currently packaging,
or inside their packaging failure cooldown SHALL NOT be re-enqueued. An item
whose stored packaging state is complete but whose published build fails
integrity validation — a playlist-referenced file missing at its resolved
path, or a complete playlist omitting published segments — SHALL be treated
as not packaged: the sweep re-enqueues it for repackaging into a fresh build
directory.

The frontier's working set — the frontier-position item of every gated,
not-fully-watched serial — SHALL be BOUNDED, because an unbounded pin set on
a large library pins more bytes than the storage budget holds and turns the
budget sweep into the churn's engine. Serials SHALL be ordered by watch
recency — the most recent playback-progress stamp among the serial's
episodes, a serial with no stamps sorting oldest, the sweep's input order
breaking ties — and the working set SHALL be the PREFIX of frontier
positions whose accumulated on-disk build bytes fit the pin cap: a locked
fraction of the existing storage budget (never a second budget knob, and
never a reason to raise the budget). A serial whose position would overflow
the cap SHALL NOT be fronted: no job is enqueued for it, it is not pinned,
and its path to a pack is play. Watching an episode stamps the recency that
orders this set, so the serial being watched is always at the front of it.

A build removed by a policy sweep SHALL NOT be silently rebuilt: an item
whose document-named build was evicted by the budget sweep or the
completion-driven demotion (that requirement) is EVICTION-SUPPRESSED until
its next real play (POST /play — plain or retry). A suppressed frontier
position SHALL emit no job, SHALL join no working set, and SHALL consume
none of the pin cap; the integrity sweep SHALL NOT re-enqueue a suppressed
item's repack (one INFO line names the suppression — the gate-refusal
pattern); a real play clears the suppression, and the item's pack then
dispatches through the play-priority seam (the async-enrichment
requirement).

#### Scenario: Watching an episode fronts the next one

- **WHEN** the frontier sweeps a serial whose episode K carries watch progress and episode K+1 is not packaged
- **THEN** episode K+1 is enqueued for packaging and no other episode of the serial is

#### Scenario: Fresh serial fronts its pilot and movies wait for play

- **WHEN** the frontier sweeps a serial with no watch progress and a movie library with untouched container-hostile items, and the working-set cap has room for the pilot
- **THEN** the serial's first episode is enqueued while no movie is enqueued until its play is requested

#### Scenario: The working set is a recency-ordered byte-capped prefix

- **WHEN** the frontier sweeps a library whose serials' positions carry on-disk builds whose accumulated bytes exceed the pin cap, the serials ordered by their most recent episode stamp with a stampless serial last
- **THEN** exactly the cap-fitting prefix of positions is pinned and enqueued for proactive packaging, the pin cap is a locked fraction of the storage budget, and the set never exceeds the cap in build bytes

#### Scenario: A serial beyond the cap is not fronted until its recency earns a pin

- **WHEN** an old never-watched serial's position falls outside the cap prefix, and later a watch on that serial stamps a recency newer than a pinned serial's
- **THEN** the position is not fronted and not pinned while it sits beyond the cap, and after the watch re-orders the prefix the serial's frontier position is pinned and its next episode enqueued — recency, never age alone, decides

#### Scenario: A budget-evicted build is not re-fronted until a real play

- **WHEN** the budget sweep evicts a document-named build, and the frontier sweeps on each of the following ticks while the item receives no play
- **THEN** the first post-eviction sweep emits no job for the item, joins it into no working set, and the integrity sweep skips its repack with one INFO line naming the suppression — and a POST /play for the item clears the suppression so the pack enqueues through the play-priority seam

#### Scenario: Streams-disabled library is skipped at the gate

- **WHEN** a library's streams-enabled state is switched off and the frontier sweeps that library
- **THEN** nothing in it is enqueued for packaging while its items keep the direct floor

#### Scenario: Broken build is re-enqueued at the sweep

- **WHEN** the sweep passes an item whose stored packaging state is complete but whose published build fails integrity validation, alongside healthy packaged items, in-flight packaging, and cooldown-gated failures
- **THEN** only the broken item is re-enqueued for packaging, and the repack publishes a fresh build directory whose playlists satisfy the complete-build contract

#### Scenario: Sweep healing repacks a corrupted build end to end

- **WHEN** the joint harness packages an episode through the real pack lane, corrupts its published complete build (a deleted tail segment file and a playlist truncated to its last window), and the integrity snapshot drives the repack judge into the real packaging enqueue
- **THEN** the descriptor answers the direct floor while the build is corrupt, and after the repack lands the fresh build directory satisfies the complete-build contract and the descriptor answers hls again

### Requirement: Budget-capped artifacts

Stored packaging artifacts SHALL live under a storage budget (default 32 GB,
`0` disables the cap). Accounting SHALL read the artifact directories on disk
as the truth — including directories orphaned by moved or deleted library
files — and eviction SHALL be least-recently-watched first (by playback
progress recency), moving the artifact aside before deleting it. Originals
SHALL never be evicted. Retained superseded build directories count against
the budget like any other artifact directory and SHALL be reclaimed before
current builds when the budget demands space — stale nonces first, ahead of
watch recency, regardless of their retention grace — because reclaiming a
superseded directory unpublishes nothing while reclaiming a current build
forces a re-pack; only a build directory that is not the item's
document-named build (and any directory of an item whose row is gone or
deleted) is stale for this precedence.

The frontier's working set (the bounded pin set the Watch-driven packaging
frontier requirement defines) SHALL be eviction's last resort: pinned builds
fall to eviction only when the budget cannot be met from every non-pinned
artifact alone, whatever their recency — the churn break — and the sweep
SHALL log one loud warning naming the pinned eviction (the operator's signal
that the disk holds more than the budget plus the working set). A budget
eviction of a document-named build SHALL eviction-suppress the item (the
Watch-driven packaging frontier requirement) so the eviction is not silently
undone by a re-pack on the next tick.

#### Scenario: Over-budget eviction reaps least-recently-watched and orphans

- **WHEN** artifact directories on disk exceed the budget, including one orphaned by a moved library file, and the least-recently-watched item's artifact and the orphan are oldest by watch recency
- **THEN** eviction removes those artifact directories first and accounting afterwards reports within budget

#### Scenario: Budget pressure reclaims retained builds before current ones

- **WHEN** the budget demands space and a recently watched item still holds a retained superseded build directory past its grace eligibility while an unwatched item's current build is next by recency
- **THEN** eviction takes the retained superseded directory first — the grace never shields an artifact from budget pressure — and the current build is evicted only if the budget still cannot be met

#### Scenario: A pinned eviction is the last resort, warned and suppressed

- **WHEN** the budget cannot be met from non-pinned artifacts alone and the sweep must evict a pinned build
- **THEN** the sweep evicts it last, logs one loud warning naming the pinned item, suppresses re-fronting of the item until its next real play, and unpublishes the build record so the descriptor answers the direct floor instead of a gone playlist

## ADDED Requirements

### Requirement: Completion-driven demotion

When a serial becomes fully watched — every one of its episodes counts as
watched under the completion-aware predicate (the Completion-aware watched
semantics requirement) — the sweep SHALL evict the serial's remaining pack
builds on its next tick, unconditionally: demotion is never gated on budget
pressure and never waits for the budget to demand space. The demotion SHALL
run ahead of the budget pass in the same sweep so the bytes it frees count
in that pass's accounting. Each evicted build SHALL move aside and delete
with the existing eviction vocabulary, and the evicted item's packaging
record SHALL be unpublished — a document-named build in state complete OR
partial SHALL reset the streams record so it no longer names a build the
disk lacks; a fully-watched serial with a partial build therefore replays
through pack-on-play exactly like one with a complete build. Demotion SHALL
eviction-suppress the items it evicts (the Watch-driven packaging frontier
requirement). A serial with at least one unwatched episode SHALL NOT be
demoted, whatever its builds' size; the direct floor serves every item
throughout, and a demoted episode's packaging path stays pack-on-play —
never a sweep enqueue.

#### Scenario: A fully-watched serial's builds die on the next tick

- **WHEN** a serial's every episode counts as watched under the completion-aware predicate and the serial still holds published builds, while the disk sits within budget
- **THEN** the next sweep tick evicts those build directories, unpublishes their packaging records, and the budget accounting of the same pass reflects the freed bytes — the cleanup is fast, never queued behind budget pressure

#### Scenario: A demoted episode replays through pack-on-play

- **WHEN** a demoted episode's item is opened for play (POST /play)
- **THEN** the stored packaging state is none, the play enqueues the pack through the play-priority seam, and the fresh build publishes — the replay does not meet a stale record naming a gone directory

#### Scenario: A serial with an unwatched tail is never demoted

- **WHEN** a serial's episodes count as watched through K but episode K+1 does not, and the serial holds builds
- **THEN** demotion touches nothing of the serial — its unwatched tail's packaging is the frontier's business under the bounded working set, not the demotion's
