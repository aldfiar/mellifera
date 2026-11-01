# Proposal

## Why

TV playback dead-ends in a silent spinner on unpackaged items (postmortem F8,
evidence `.tmp/playback-evidence-2026-10-31.md` at rev `44c2322`): a serial
with minutes of watch progress is excluded from packaging forever by the
frontier's whole-serial-watched skip (any `position > 0` counts as "watched",
so a mid-episode serial's tail is never proactively built), the SPA never
fires the play verb's pack-on-play half (the UI only ever sends
`{retry:true}`, so watched content has no path to a pack either), and the
direct floor hands raw Matroska+HEVC to a TV webview that cannot decode it —
and nothing in the logs says why. The server pipeline itself is healthy
(packed items play); every gate in the chain is a small, known seam.

## What Changes

- **SPA wires pack-on-play**: when the descriptor says the floor is not
  `<video>`-playable and a pack can land, the item page fires
  `POST /play {retry:false}` (the server half D-8 already exists and is
  verified live), renders an explicit "Preparing…" state instead of attaching
  the raw original to `<video>`, and polls the descriptor until the answer
  flips to `hls` or `failed` (the existing retry affordance takes over).
- **Direct-floor honesty** (postmortem F5 follow-up): the playback descriptor
  gains descriptor-only states `preparing` / `unsupported` plus an additive
  `state_reason` (`non_native_container` / `codec_not_opted_in` /
  `codec_unsupported`) whenever the direct floor's source container is not
  `<video>`-native (mp4/webm) or its codecs cannot play anywhere. The play
  URL stays (additive fields and values only — existing clients keep
  working); the SPA simply never attaches a URL the state disclaims.
- **Completion-aware watched semantics**: the frontier's watched signal
  stops counting any positive position as watched — an item counts as
  watched at 90% of its known duration or once the position reaches a
  classified credits/ending section's start (the SPA skip classifier's rule
  mirrored on stored facts; 100% is never required, and missing facts stay
  conservative), so a mid-episode serial's unwatched tail is proactively
  built instead of being excluded forever. Proactive (frontier) packaging
  stays unwatched-only: a fully watched never-packaged serial stays skipped
  — its packaging path is pack-on-play on open, never a sweep enqueue and
  never a budget-eviction pin. Explicitly out of scope: any bulk "pack
  everything packable" backfill pass (the deployed budget sits at 58/60 GiB).
- **Playback diagnostics, front and back**: one INFO decision line per
  playback descriptor GET (item, mode, state, gating reason when direct —
  unpackaged / cooldown / codec-not-opted-in / non-native container); the
  /media 401 rejection path logs credential kind + reason class + User-Agent
  (never token values); the SPA renders decode/stream failures as distinct
  actionable banners (direct-lane `video.onerror` + hls.js fatal
  type/details/HTTP status) instead of a silent eternal spinner; and a
  best-effort, rate-limited `POST /api/v1/playback-events` beacon
  (`{item_id, mode, phase, code, detail}`) that lands as one INFO line
  server-side correlating item + UA with the request log.
- **Media-gate hardening** (latent shadowing bug): the /media gate tries the
  cookie AND the query token and grants when EITHER verifies as naming the
  path item — a stale cookie naming a different item no longer shadows a
  valid `?token=`; credential-less requests still 401 (the gate itself is
  unchanged), with tests for the stale-wrong-item-cookie case.
- **Living docs**: the playback postmortem's F5 follow-up and F8 fix
  directions are marked as landed by this change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `packaged-playback`: the playback descriptor's honesty states and additive
  `state_reason`; the token gate's dual-credential resolution and the
  classified 401 rejection log; completion-aware watched semantics for the
  packaging frontier; the playback decision log; the playback-event beacon
  endpoint.
- `web-ui`: the SPA's endpoint allowlist gains the beacon route; pack-on-play
  wiring on the item page; playback failure banners in the player; the
  beacon client; the embedded build regen carrying the new surface.

## Impact

- `internal/stream` — `describe.go` (honesty states + reason projection over
  stored ffprobe facts), `serve.go` (dual-credential resolution, classified
  rejection log), tests (`media_test.go`, new honesty/rejection-log tests).
  State constants join the existing const block — no exported-surface growth
  that moves the budget.
- `internal/orchestrator` — `Frontier`'s logic and shapes are unchanged (the
  completion-aware `Watched` map arrives from the cmd closure; doc-comment
  semantics updated); no new exports.
- `internal/api` — `playback.go` descriptor wire gains `state_reason`
  (additive); new `playback_events.go` handler + router line
  (`POST /api/v1/playback-events`, browse role group) + tests.
- `cmd/mellifera` — the completion-aware watched predicate (duration +
  credits lexicon mirror, unexported) applied in the sweep's serial loop
  where episode docs are already projected, plus the Playback closure's
  decision-log line (cooldown read via the existing `streamCooldowns`); no
  wiring changes to the play verb.
- `web/src` — `lib/api.ts` (descriptor type + beacon client),
  `pages/browse/ItemDetail.tsx` (pack-on-play wiring, preparing/poll/
  unsupported surfaces), `components/playback/Player.tsx` (error banners,
  beacon edges) + their vitest files.
- `internal/web/dist` + `internal/web/api/openapi.{json,yaml}` — regenerated
  via the dev-time `make web-build` and committed (established pattern); the
  node-free Go build gate stays untouched.
- No DDL, no migrations, no new dependencies; descriptor JSON changes are
  additive; INV4 holds everywhere (token values never logged, ride
  Set-Cookie/query only; `state_reason` is data, never credentials).
