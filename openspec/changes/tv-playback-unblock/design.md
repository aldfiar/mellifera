# Design

## Context

See proposal.md — Why. Ground truth this design builds on (verified at rev
`44c2322`, live-checked 2026-10-31; full chain in
`.tmp/playback-evidence-2026-10-31.md`):

- The failing item answers `{"mode":"direct","state":"none","play_url":"/media/<id>/original?token=…"}` — the SPA (`web/src/pages/browse/ItemDetail.tsx`) renders that `play_url` straight into the Player's `<video>`; the TV webview cannot decode Matroska → spinner + a 1/sec 206-range storm.
- The play verb's `!retry` branch (`cmd/mellifera/main.go` Play closure → `packOnPlay`, `cmd/mellifera/playback.go`) enqueues any unpackaged packable item and answers 202 — verified live: a hand-issued POST flips the descriptor to `mode=hls`. The SPA never sends it (`playItem(id, {retry:true})` is the only call site).
- The frontier's watched signal is any `position > 0` progress row — the cmd
  sweep's `watchState` builds `FrontierIn.Watched` — and the whole-serial-watched
  skip sits at `internal/orchestrator/frontier.go` (`last == len(sr.Episodes)-1 →
  continue`); minutes into episode one therefore exclude a serial's tail forever.
  The same sweep's serial loop already projects every episode document
  (`episodeFromDoc`), so the predicate's facts (ffprobe duration, stored
  chapters) are in hand exactly where `Watched` is built; the orchestrator's
  shapes and skip logic stay unchanged.
- `Describe` (`internal/stream/describe.go`) is pure over stored facts: the ffprobe blob carries the container fact (`format_name`), and `stream.Classify` already judges codec packability with the opt-in knob folded in. Honesty states need no new probing and no store reads.
- The /media gate (`internal/stream/serve.go` `mediaToken`) is cookie-primary with a SINGLE verify: a stale cookie naming item B shadows a valid `?token=` for path item A. `verify` collapses every failure into `errBadToken` — the 401 path cannot say what it saw today.
- The api playback surface is the anti-corruption seam: `api.Playback` (`internal/api/playback.go`) + the Deps closures in `cmd/mellifera/main.go`; `internal/api` never imports `internal/stream`. The request-log middleware (`cmd/mellifera/httplog.go`) already emits one INFO line per request without query strings.
- Exported-symbol budget: the touched packages sit at/below the warn bar; every addition here is either a const-block member, a struct field, an unexported function, or a method — no new top-level exported symbols in any package.

## Goals / Non-Goals

**Goals:**

- Any packable video item reaches HLS from the play button: the SPA triggers the pack, shows honest progress, and lands on a playable stream or an actionable failure.
- The silent-spinner class dies at BOTH ends: the server disclaims unplayable floors (`preparing`/`unsupported` + `state_reason`), the SPA never attaches a disclaimed URL and surfaces decode failures.
- Every playback failure is legible in the logs: decision line per descriptor GET, classified 401 lines, beacon lines correlating client-side failures with the request log.
- The token gate's credentials stop shadowing each other without weakening the gate.
- Watched semantics are completion-aware: proactive (frontier) packaging is
  unwatched-only — watched content reaches HLS through pack-on-play on open,
  never a sweep enqueue.

**Non-Goals:**

- No bulk backfill pass ("pack everything packable") — the deployed budget sits at 58/60 GiB. And no proactive packaging of watched content either: a fully watched serial stays skipped by the frontier even when nothing is published; watched titles reach HLS through pack-on-play on open.
- No transcode lane, no codec-aware manifests (postmortem F5's bigger design — the honesty states make the CURRENT reality legible instead).
- No transcode/HEVC policy change: packs stay remux-only; `direct_only` stays never-packaged.
- No beacon persistence, analytics store, or batching: the beacon is one log line, fire-and-forget.
- No change to the direct floor's byte-serving gate or INV4's delivery rules (token rides Set-Cookie + self-authorizing playlists; never a body field, never a log value).
- No cooldown policy change (infra-vs-content classification stays a named postmortem follow-up).

## Decisions

- **D1 — Honesty lives in the descriptor `state` vocabulary, not a parallel field.** `state` gains two descriptor-only values: `preparing` (floor not `<video>`-native, but a pack CAN land — classification `pack`, or `opt_in` with the knob on, and nothing published yet) and `unsupported` (packaging cannot help — `direct_only`, or `opt_in` with the knob off). The persisted packaging namespace is never written: `none`/`partial`/`complete`/`failed` remain the lane's vocabulary; `preparing`/`unsupported` are read-side projections of `none`-state items, exactly like the existing D5 integrity guard re-answers `direct` for broken builds. Alternative declined: a boolean `playable` field — two states carry more information (why a pack could start vs can never start) and the SPA's three surfaces (Preparing / Retry / unsupported banner) map one-to-one onto states it already renders.
- **D2 — `play_url` stays on `preparing`/`unsupported` answers.** The descriptor change is additive fields and values only: every item keeps the direct floor AND its address (INV-floor, `Describe`'s own contract); the `state` disclaims playability and the SPA (fixed in the same release; `index.html` is no-cache so the TV picks the new bundle immediately) never attaches a disclaimed URL. Alternative declined: omitting `play_url` for those states — that is a removal for existing clients and breaks the floor's addressability, for no benefit the SPA side of this same change needs.
- **D3 — Honesty reads stored facts only, and stays cooldown-blind.** The native-container set is the ffprobe `format_name` fact (mp4/webm native; Matroska and everything else not — postmortem: "direct floor is only safe for `<video>`-native containers"). `Describe` keeps its signature (doc-only, no store reads): cooldown facts live in the failure ledger, not the document, and a `preparing` item whose pack would be cooldown-refused simply stalls honestly (D6's bounded poll + the beacon's stall event make that visible). Judging cooldown inside `Describe` would drag a store read into a pure function for a rare row-state.
- **D4 — Dual-credential media gate: try cookie AND query, grant on EITHER.** `mediaToken` becomes "collect both credentials"; the grant requires one of them to verify as naming the path item. The gate is unchanged for credential-less requests (401, static body). This fixes the shadowing bug (stale wrong-item cookie hiding a valid query token) at no security cost: either credential alone already grants today when it is the only one present. The rejection classification (kind `none`/`cookie`/`query`, class `missing`/`malformed`/`expired`/`wrong-item`, User-Agent) needs `verify` to say WHY it failed — an unexported reason refinement inside the stream package; the client-facing 401 body stays the static string, the reason goes to exactly one log line, and the token value never appears anywhere.
- **D5 — Completion-aware watched predicate, computed at the seam that already holds the facts.** `watched(item) := (duration known AND position >= 90% of duration) OR (a classified credits/ending section exists AND position >= its start)` — 100% is never required (the human's ruling: watching up to the credits start, or near the end, counts). Missing duration AND missing credits section ⇒ `false` (conservative: the tail stays fronted and is proactively built). The predicate is applied where `FrontierIn.Watched` is built — the cmd sweep's serial loop, which already projects every episode document — so the orchestrator's input stays the plain `Watched` map (`itemID → bool`) and `Frontier`'s logic, skip, and shapes are unchanged. The credits half mirrors the SPA classifier's exact rule (`web/src/lib/skipSections.ts`: chapter-kind section, start+end present with end > start, trimmed-lowercased title in the exact lexicon {credits, титры, ending, outro, ed} — no substrings) as a small unexported Go lexicon; drift is safe by construction — a missed credits section only downgrades to the 90% rule, and a false positive requires an exact lexicon title. Budget-eviction recency deliberately stays any-progress-based: the amendment re-scopes the frontier's watch signal, not the LRU clock. Alternative declined (the pre-amendment shape): the carve-out fronting fully-watched zero-build serials — proactive packing of watched titles would spend the 58/60 GiB budget on things nobody is waiting to play; watched content is pack-on-play's job. Also declined: judging the predicate inside `Frontier` — it would drag document facts into the policy input.
- **D6 — The SPA's preparing flow is one POST, then poll, then honesty about stalling.** The item page fires `POST /play {retry:false}` ONCE per preparing-descriptor instance (a mutation keyed on the descriptor, not on poll ticks), renders "Preparing…", and refetches the descriptor on a short interval. **Amended at GATE 2 (live-TV evidence 2026-10-31):** the descriptor instance key is `state + <play_url path without query>` (`descriptorInstanceId`) — the query token is re-minted on every GET, so the full URL cannot be identity; keying on it re-fired the POST every poll tick (six POSTs for one TV page-open) and rebuilt the Player's hls.js/MSE on every refetch until the webview answered a fatal `mediaSourceRequiresReset`. The Player's attach effects key on the same tokenless path. Exits: `hls` → the ordinary player mounts; `failed` → the existing retry affordance takes over; a bounded window (constant, ~5 min) without progress → an honest still-preparing stall state + a `phase=stalled` beacon — covering the real dead ends (queue backpressure deferral on `queued=false`, cooldown-refused enqueue) without pretending progress. The POST's failure (canonical error) surfaces inline via the existing error path; no auto-retry.
- **D7 — The beacon is a route, not a subsystem.** `POST /api/v1/playback-events` joins the browse role group (admin+client — the TV's pairing-minted client session must reach it), validates shape only (no store read — an unknown `item_id` is accepted verbatim), rate-limits per client in-process (a bounded burst; over-limit answers 429 and logs nothing), and its entire effect is one INFO line (beacon fields + UA, `detail` truncated to a bounded length). The SPA sends it best-effort from the failure edges it already observes (fatal hls error, direct-lane `<video>` error, preparing stall) and swallows every failure. Alternative declined: riding diagnostics onto the existing progress PUT — progress is load-bearing and rate-shaped differently; mixing telemetry into it would couple their failure modes.
- **D8 — The decision log lives in the composition root's Playback closure, not in `internal/api` or `internal/stream`.** The closure already sees mode/state/reason and has the store for the cooldown ledger (`streamCooldowns`); `internal/api` stays pure delegation (no logging policy), `Describe` stays pure. One INFO line per successful descriptor GET: item, mode, state, reason (`packaged` for hls; `unpackaged` / `non_native_container` / `codec_not_opted_in` / `codec_unsupported` / `cooldown` / `failed` for direct). The hls case also logs (reason `packaged`) so the log reads as a complete decision record, not a failure-only one.

## Interfaces

Cross-group contracts this change adds (the single home for their shapes;
specs carry the behavior, tasks carry the file map):

- **Descriptor (Describe → api → SPA), additive:**
  - `GET /api/v1/items/{id}/playback` body gains `state_reason?: string`
    (absent/omitted on hls answers and native-container direct answers;
    one of `non_native_container` | `codec_not_opted_in` |
    `codec_unsupported` when present).
  - `state` vocabulary on the wire gains `preparing` | `unsupported`
    (read-side projections; the persisted `doc["streams"].state` namespace
    never carries them — only `none`/`partial`/`complete`/`failed`).
  - Plumb: `stream.Describe` returns the reason as a 6th value →
    `api.Playback.StateReason` (+ `playbackResponse.state_reason`) →
    `PlaybackDescriptor` TS type. `api.Playback` gains the field; no new
    exported symbols anywhere on the path.
- **Media gate (internal/stream, serve-side):** `mediaToken` collects
  `{cookie, query}` credentials; grant = any credential verifying as the
  path item; rejection logs `{kind, class, ua}` — classification from an
  unexported verify-reason refinement. Client-facing 401 body unchanged.
- **Beacon wire (SPA → api), new:**
  - `POST /api/v1/playback-events` (browse role group; bearer-gated like
    every browse route). Request body:
    `{item_id: string, mode: string, phase: string, code: string,
    detail: string}` — all required strings, `mode` one of `direct|hls`,
    `phase` one of `fatal|video-error|stalled`; `detail` free text,
    truncated server-side to a bounded length. Responses: `204` accepted
    (no body), `400` canonical `bad_request` (malformed shape/enum),
    `429` `rate_limited`, auth via the standard middleware (401/403).
  - Server effect: one INFO line `playback event` with item_id, mode,
    phase, code, truncated detail, UA. No store read, no persistence.
  - SPA client: `sendPlaybackEvent(payload)` in `lib/api.ts` through the
    authenticated fetch wrapper; every failure swallowed.
- **Decision log (cmd closure):** `slog.Info("playback: descriptor",
  "item", id, "mode", mode, "state", state, "reason", reason)` — reason
  vocabulary `packaged | unpackaged | non_native_container |
  codec_not_opted_in | codec_unsupported | cooldown | failed`; cooldown
  judged via the existing `streamCooldowns(ctx, st)` read. Token values and
  play URLs never logged (INV4).
- **Frontier (internal/orchestrator):** `Frontier(in)` signature, `Job`, and
  the working-set shapes unchanged; `FrontierIn.Watched` semantics become
  completion-aware — the predicate is applied by the cmd closure before the
  call, so the map stays `itemID → bool` and the whole-serial-watched skip
  itself is untouched. No new reason constants, no new exports.

## Risks / Trade-offs

- [A `preparing` item that can never actually pack (cooldown row with state
  `none`, persistent queue backpressure on a movie) stalls the SPA at the
  poll bound] → the stall state is honest and actionable (message names what
  to do: retry later / check the server), and the `stalled` beacon makes the
  dead end visible server-side. Accepted: rarer and far cheaper than making
  `Describe` ledger-aware.
- [The descriptor `state` vocabulary now overloads "packaging state" with
  descriptor projections] → the delta text pins the split explicitly
  (persisted namespace vs read-side projection, same pattern as the D5
  integrity guard); `state_reason` disambiguates every new value.
- [401 diagnostic lines could storm under a client retry loop] → one line
  per rejection is exactly the diagnostic the outage lacked (the TV's
  1/sec loop was invisible); the rate-limited beacon + bounded detail keep
  the beacon side bounded, and the request-log middleware already bounds
  per-request volume. Accepted as INFO.
- [Dual-credential grant widens the accepted-credential set] → strictly to
  credentials that already grant when alone (same secret, same verify, same
  item-binding); the stale-cookie case moves from false-reject to grant.
  No new failure mode exists; the gate for credential-less requests is
  untouched and tested.
- [The beacon lets a client write arbitrary strings into logs] → shape
  validation (required strings, enumerated `mode`/`phase`), server-side
  truncation of `detail`, per-client rate limit, role gating, and INV4
  discipline (no credential field exists in the shape). Log forgery risk is
  bounded to bounded-length lines from authenticated clients.
- [The credits half of the predicate false-positives an early section as
  credits and marks an item watched before its tail] → the classifier is the
  SPA lexicon mirrored exactly (exact titles only — no substrings — chapter
  kind, ordered range guards); a false positive requires a chapter literally
  titled credits/титры/ending/outro/ed, and the miss direction is
  conservative (no credits found → the 90% rule alone). The same risk is
  already accepted client-side for SkipChip presentation; here it gates only
  proactive-packing skip decisions.
- [`preparing` polling adds descriptor GET traffic while a pack builds] →
  one client, a short-interval refetch bounded by the poll window, and each
  GET is a stored-facts projection (no probing, no build validation beyond
  the existing D5 guard). Trivial against the pack's own duration.

## Migration Plan

Deploy is a normal single-binary rollout; no DDL, no data migration, no
config knob. Descriptor changes are additive (old clients keep parsing; the
only shipped client is this SPA, and `index.html` no-cache means the TV
picks up the new bundle immediately). Rollback = redeploy the previous
binary; the new `state` values and `state_reason` field simply disappear
from answers. The embedded build (`internal/web/dist` + regenerated
OpenAPI) lands committed in the same change per the established pattern
(dev-time `make web-build`).

## Open Questions

None blocking GATE 1. Two constants are named but left to the applying
task's judgment within the pinned ranges: the preparing-poll interval
(~2 s) and the poll window (~5 min) — both are SPA constants per D6, and
the beacon rate-limit burst (per-client, tens-per-minute) is an
`internal/api` constant; none changes the specs, the approach, or the task
breakdown.
