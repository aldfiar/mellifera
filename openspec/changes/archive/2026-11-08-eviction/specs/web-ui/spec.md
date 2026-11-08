# Spec Delta

## MODIFIED Requirements

### Requirement: Pack-on-play wiring

When the playback descriptor of a video item answers mode `direct` with state
`preparing` and `state_reason` `non_native_container`, the item page SHALL
fire the play verb `POST /play` with `{retry:false}` ONCE per preparing
descriptor instance (a mutation keyed on the descriptor — never per poll
tick), and SHALL NOT hand the descriptor's play URL to the player while the
preparing state stands: the preparing state renders an explicit "Preparing…"
surface in the player's place instead of attaching the raw original to the
media element. The page SHALL refetch the descriptor on a short interval
until the state leaves `preparing`: mode `hls` mounts the ordinary packaged
player, state `failed` hands over to the existing retry affordance, and a
bounded poll window without progress SHALL render an honest still-preparing
stall state — the poll stops, the page stays explorable, and the stall is
beaconed. An `unsupported` state SHALL render the honest not-playable banner
carrying the `state_reason`'s meaning — never a player attach, never a
spinner. The play POST's canonical error surfaces inline without auto-retry.

The page SHALL read the play POST's `queued` answer instead of ignoring it:
when the POST answers `queued:false` for a preparing descriptor — the server
deferred the enqueue under honest backpressure — the page SHALL render the
not-queued preparing state, a variant of the preparing surface that names
the deferral (the packaged version was not queued — the build queue is
busy) and carries a retry control that re-fires `POST /play {retry:false}`;
it SHALL NOT render the "the page updates itself" promise for a pack that
was never enqueued, and SHALL NOT poll as though a build were in flight.
`queued:true` keeps the bounded poll and the stall state exactly as before;
a successful re-queue from the retry control hands back to that poll.

#### Scenario: Preparing descriptor fires pack-on-play once and shows Preparing

- **WHEN** the item page opens on a video item whose descriptor answers mode `direct`, state `preparing`, `state_reason` `non_native_container`
- **THEN** the page POSTs `/play` with `{retry:false}` exactly once for that descriptor instance, renders the "Preparing…" surface instead of attaching the play URL to the media element, and starts polling the descriptor

#### Scenario: A deferred enqueue renders the retryable not-queued state

- **WHEN** the preparing play POST answers `queued:false` — the server deferred the enqueue
- **THEN** the page renders the not-queued preparing state naming the deferral with a retry control, does not promise the auto-update, and does not poll as though a build were in flight; activating the retry control re-fires `POST /play {retry:false}` once per activation, and a `queued:true` answer hands back to the ordinary preparing poll

#### Scenario: Flip to hls mounts the player; flip to failed shows retry

- **WHEN** a polled descriptor refetch answers mode `hls`, and separately a polled refetch answers state `failed` on the same item
- **THEN** the first mounts the ordinary packaged player from the new descriptor, and the second hands over to the existing retry affordance wired to `POST /play {retry:true}`

#### Scenario: Unsupported renders the honest reason banner

- **WHEN** the item page opens on a video item whose descriptor answers state `unsupported` with a `state_reason`
- **THEN** the page renders the not-playable banner naming the reason's meaning — no player attach, no spinner, no polling

#### Scenario: Poll window exhausts into an honest stall

- **WHEN** the descriptor keeps answering `preparing` past the bounded poll window after a `queued:true` play (for example the packaging lane is busy)
- **THEN** the polling stops, the page renders the still-preparing stall state naming what to do next, and the stall is reported through the beacon — the page never spins forever and never pretends progress
