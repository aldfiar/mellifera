# Spec Delta

## ADDED Requirements

### Requirement: Completion-aware watched semantics

The packaging frontier's watched signal SHALL be completion-aware — bare
any-positive-position SHALL never count as watched. An item counts as
watched exactly when its stored position has reached the main content's
end, judged as: the stored duration is known AND the position is at least
90% of that duration, OR the item's stored sections classify a
credits/ending section AND the position has reached that section's start.
The credits classification is the SPA skip-range classifier's rule applied
to stored facts: a chapter-kind section whose trimmed, lowercased title is
in the credits lexicon (credits / титры / ending / outro / ed) with start
and end present and end after start; its start is the credits threshold.
Watching up to the ending-credits start — or near it — counts as watched;
100% completion is NEVER required. A position below the credits start AND
below the 90% floor SHALL NOT count as watched; likewise an item whose
stored facts carry neither a usable duration nor a classifiable
credits/ending section SHALL NOT count as watched — both conservative: the
serial stays fronted and its unwatched tail is proactively built.
Proactive (frontier) packaging stays UNWATCHED-ONLY: a serial whose every
episode counts as watched under this predicate stays skipped by the
frontier even when nothing is published, and nothing of it joins the
working set — watched content's packaging path is pack-on-play when its
item is opened for play (POST /play with retry false), never a sweep
enqueue and never a budget-eviction pin. Budget-eviction recency is a
separate signal and stays any-progress-based.

#### Scenario: Reaching the credits start counts watched below the 90% floor

- **WHEN** an episode with a known duration and a classified credits section starting before the 90% point carries a position at or past that section's start but below 90% of the duration
- **THEN** the episode counts as watched and the serial's frontier position advances past it

#### Scenario: Ninety percent of a known duration counts watched without credits

- **WHEN** an episode with a known duration and no classified credits section carries a position at or past 90% of that duration
- **THEN** the episode counts as watched — a near-complete watch never waits for 100%

#### Scenario: Mid-episode below both does NOT count — the tail stays fronted

- **WHEN** a serial's episode carries a position below both its credits start (or it classifies none) and the 90% floor, or its stored facts carry neither a usable duration nor a classifiable credits section
- **THEN** the episode does not count as watched and the serial's unwatched tail stays fronted for proactive packaging — any-positive-position no longer excludes a serial from packaging

#### Scenario: Fully watched zero-build serial stays skipped; pack-on-play is its path

- **WHEN** the frontier sweeps a serial whose every episode counts as watched under the predicate and which has zero published builds
- **THEN** nothing is enqueued and nothing of the serial joins the working set — its packaging path is pack-on-play when its item is opened for play, never a sweep enqueue

#### Scenario: Mixed serial fronts its unwatched tail

- **WHEN** a serial's episodes through K count as watched under the predicate and episode K+1 does not
- **THEN** the frontier position is episode K+1 and it is proactively packaged when eligible (packable, not already packaged, outside its failure cooldown)

### Requirement: Playback decision log

Every successful playback descriptor read SHALL log exactly ONE INFO line —
the item id, the mode, the state, and, when the answer is mode `direct`, the
gating reason: `unpackaged`, `cooldown` (a live packaging-failure ledger row
gates the item), `non_native_container`, `codec_not_opted_in`,
`codec_unsupported`, or `failed`; an `hls` answer logs reason `packaged` —
correlating with the request-log middleware's line for the same request.
Token values and play URLs SHALL NEVER appear in the line (INV4: the reason
is data, never credentials), and the logging SHALL remain side-effect free —
the descriptor read stays read-only, never mutating packaging state.

#### Scenario: Descriptor GET logs one decision line

- **WHEN** playback descriptors are fetched in one session for a packaged item, an unpackaged MKV item, a `direct_only` item, and an item with a live pack-failed cooldown row
- **THEN** each fetch logs exactly one INFO line carrying the item id and mode, with reasons `packaged`, `non_native_container`, `codec_unsupported`, and `cooldown` respectively

#### Scenario: Playback logs never carry token values

- **WHEN** descriptor reads and /media rejections are logged with logging captured
- **THEN** no captured line carries a media token value, a play URL, or any credential material

### Requirement: Playback event beacon

`POST /api/v1/playback-events` in the browse role group (admin+client) SHALL
accept a best-effort playback-telemetry beacon with the JSON body
`{item_id, mode, phase, code, detail}` — all plain data strings; `mode` one
of `direct` or `hls`, `phase` one of `fatal`, `video-error`, `stalled`; no
credential field exists in the shape. The endpoint SHALL be fire-and-forget:
a well-formed beacon SHALL answer 204 with no body and SHALL be persisted
nowhere — its entire effect is ONE INFO log line carrying the beacon fields
with `detail` truncated to a bounded length, plus the client User-Agent,
correlating with the request log. A malformed body SHALL answer the
canonical 400 `bad_request`; a client over its per-client rate limit SHALL
answer 429 `rate_limited` with no log line. The endpoint SHALL perform no
store reads (an unknown `item_id` is accepted verbatim — the beacon is never
load-bearing) and SHALL never log token values (INV4).

#### Scenario: Beacon accepted and logged

- **WHEN** an authenticated client posts a well-formed beacon naming an item that does not exist in the store
- **THEN** the answer is 204 with no body, no store lookup happened, and exactly one INFO line logs the beacon fields (detail truncated) with the client User-Agent

#### Scenario: Malformed body and rate limit

- **WHEN** a beacon arrives with a malformed body, and further well-formed beacons arrive from the same client beyond its rate limit
- **THEN** the malformed beacon answers the canonical 400, the over-limit beacons answer 429 and log nothing, and a beacon from a pairing-minted client-role session is accepted like an admin one

## MODIFIED Requirements

### Requirement: Playback descriptor and verb split

`GET /api/v1/items/{id}/playback` in the browse role group SHALL be the
read-only playback descriptor — current mode (`direct` or `hls`), packaging
state, sections, and the play URL — and SHALL answer 404 for an unknown item;
it SHALL never mutate packaging state. `POST /api/v1/items/{id}/play` in the
browse role group SHALL be the only playback mutation: a `retry` request
SHALL re-enqueue a failed packaging run, and `from_seconds` SHALL be accepted
and reserved (no-op) in v1; `retry` on an item with no failed packaging run
SHALL answer 400, and an unknown item SHALL answer 404. The descriptor SHALL
trust a stored complete build only as far as it verifies: when the item's
published build fails integrity validation — a playlist-referenced file
missing at its resolved path, or a complete playlist omitting published
segments — the descriptor SHALL answer the direct floor (mode `direct`, the
original's play URL) rather than hand the player an unplayable playlist URL;
the check is read-only and never writes packaging state.

The descriptor SHALL be honest about a direct floor the requesting client
cannot decode, judged from stored facts only (the ffprobe container fact —
never a re-probe, never client input): when the floor's source container is
not `<video>`-native (mp4/webm; everything else, Matroska included, is not),
the state SHALL carry one of two descriptor-only values instead of the bare
packaging state — `preparing` when a pack can land for the item (its
classification permits packaging now: `pack`, or `opt_in` while the opt-in
codec knob is enabled) and nothing is published yet, `unsupported` when
packaging cannot help (`direct_only`, or `opt_in` with the knob off). Both
values SHALL ride an additive `state_reason` field naming why the floor is
not `<video>`-playable — `non_native_container`, `codec_not_opted_in`, or
`codec_unsupported` — while the descriptor keeps answering the direct floor's
play URL: every item keeps the direct floor and its address, and the state
disclaims its playability (the byte-serving gate is unchanged). A `failed`
state keeps its value and its retry affordance, and MAY carry
`state_reason` when the floor itself is not `<video>`-native. A
`<video>`-native floor keeps today's descriptor exactly: state as persisted
(`none`/`failed`), no `state_reason`. The changes are additive fields and
values only — existing clients keep working — and the persisted packaging
namespace never carries the new values: `preparing`/`unsupported` are
read-side projections, never stored state.

#### Scenario: Retry is the only playback mutation and GET never mutates

- **WHEN** a failed packaging run is re-requested via POST with retry, a GET descriptor is fetched for the same item, and a retry POST is sent for an item whose packaging never failed
- **THEN** the retry POST re-enqueues the failed run, the GET returns the descriptor without changing packaging state, and the second POST answers 400

#### Scenario: Broken build answers the direct floor

- **WHEN** the playback descriptor is fetched for an item whose stored packaging state is complete but whose published build fails integrity validation
- **THEN** the descriptor answers mode direct with the original's token-carrying play URL instead of the broken playlist URL, and the stored packaging state is unchanged

#### Scenario: Non-native container answers preparing with a reason

- **WHEN** the playback descriptor is fetched for an unpackaged Matroska (MKV) item whose classification permits packaging
- **THEN** the descriptor answers mode `direct`, state `preparing`, `state_reason` `non_native_container`, with the direct floor's play URL still present — and the fetch changed no packaging state

#### Scenario: Packaging-hopeless codec answers unsupported until the knob flips

- **WHEN** the descriptor is fetched for a `direct_only` item, for an `opt_in` item while the opt-in codec knob is off, and again for that same `opt_in` item after the knob is enabled
- **THEN** the first answer carries state `unsupported` with `state_reason` `codec_unsupported`, the second carries `unsupported` with `codec_not_opted_in`, and after the knob flips the same item answers state `preparing` — packaging has become possible

#### Scenario: Native container keeps the classic descriptor

- **WHEN** the playback descriptor is fetched for an unpackaged mp4 item whose codecs are browser-decodable
- **THEN** the descriptor answers mode `direct`, state `none`, with no `state_reason` and a playable play URL — byte-compatible with the pre-honesty descriptor shape

### Requirement: Token-gated playback serving

Playlist, segment, and original-file playback responses SHALL be static file
serving from disk — byte-identical responses, no sessions, no media
processes at play time. The surface SHALL be gated by a short-lived HMAC
media token that is never the admin credential; a request SHALL present the
token as the media cookie and/or the query parameter, and SHALL be granted
when EITHER credential verifies as naming the path item (a stale cookie
naming a different item never shadows a valid query token, and vice versa);
the token SHALL default to a 4-hour TTL and SHALL never appear in logs.
Playback requests without any valid media token SHALL be rejected with 401
and a static body. Every rejection SHALL log ONE diagnostic line — the
credential kind seen (`none`, `cookie`, or `query`), the reason class
(`missing`, `malformed`, `expired`, or `wrong-item`), and the client
User-Agent — never the token value; the client-facing rejection body stays
static (no reason echo).

#### Scenario: Playback requires the media token

- **WHEN** a playback URL is requested with no token, with a token signed by a foreign key, with the admin bearer credential, and then with a valid media token delivered first as a cookie and then as a query parameter
- **THEN** the first three are rejected and the two valid-token forms both serve the same bytes

#### Scenario: Tokens stay out of logs

- **WHEN** playback requests are served and rejected with logging active
- **THEN** no log line carries the media token value

#### Scenario: A stale wrong-item cookie never shadows a valid query token

- **WHEN** a playback URL for item A is requested with a cookie carrying a valid token naming item B alongside a query parameter carrying a valid token naming item A — and, separately, with that stale cookie alone
- **THEN** the dual-credential request serves item A's bytes (the query token grants), while the stale cookie alone is rejected 401

#### Scenario: A wrong-item credential is rejected with a classified log line

- **WHEN** a playback URL is requested with a valid-format token naming a different item, once via cookie and once via query parameter
- **THEN** both are rejected 401 with the static body, and each rejection logs one line naming the credential kind (`cookie`, then `query`), the reason class `wrong-item`, and the client User-Agent — with no token value anywhere in the line
