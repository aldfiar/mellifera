# tasks - tv-playback-unblock

# All verify duties run from the repo root in one shot (no setup, no context);
# targeted tests first per the preferred-forms ladder. Groups appear in
# dependency order: server truth (1-3) before the SPA consumer (4), joints
# and living docs last (5).

## 1 - honest descriptor and hardened media gate (internal/stream, internal/api, cmd)

- [ ] 1.1 Descriptor honesty: internal/stream Describe answers state preparing/unsupported + additive state_reason (non_native_container / codec_not_opted_in / codec_unsupported) from stored ffprobe container+classification facts for non-native direct floors; play_url retained; api.Playback + playbackResponse gain state_reason (additive wire, hls/native answers unchanged)
  verify: set -e; go test ./internal/stream -run TestDescribeHonesty || exit 1; go test ./internal/api -run TestPlaybackVerbs || exit 1
  file: tasks/1.1.md
- [ ] 1.2 Dual-credential media gate: internal/stream serve collects cookie AND query tokens and grants when EITHER verifies as naming the path item; credential-less still 401; table cases incl. stale wrong-item cookie + valid query granted, stale cookie alone rejected
  verify: set -e; go test ./internal/stream -run TestMediaToken || exit 1
- [ ] 1.3 /media 401 rejection diagnostics: one log line per rejection with credential kind (none/cookie/query), reason class (missing/malformed/expired/wrong-item) and User-Agent via an unexported verify-reason refinement; client body stays static; token values never logged (captured-log test)
  verify: set -e; go test ./internal/stream -run TestMediaRejectionLog || exit 1
- [ ] 1.4 Playback decision log: cmd/mellifera Playback closure logs one INFO line per descriptor GET (item, mode, state, reason packaged/unpackaged/non_native_container/codec_not_opted_in/codec_unsupported/cooldown/failed; cooldown via the existing streamCooldowns read); no token or play URL in the line (captured-log test)
  verify: set -e; go test ./cmd/mellifera -run TestPlaybackDecisionLog || exit 1

## 2 - completion-aware watched semantics (cmd/mellifera, internal/orchestrator)

- [ ] 2.1 Completion-aware watched semantics: the frontier's watched signal stops being any-position>0 — the cmd/mellifera sweep's serial loop (where episode docs are already projected) derives per-episode duration from the stored ffprobe format.duration and credits-start from stored chapter-kind sections (trimmed lowercase title in the exact credits lexicon credits/титры/ending/outro/ed, start+end present with end > start — mirroring web/src/lib/skipSections.ts) and computes watched = (duration known AND position >= 90% of duration) OR (credits start known AND position >= credits start); missing duration AND missing credits = not watched (conservative — tail stays fronted); orchestrator input stays the plain FrontierIn.Watched map, Frontier logic and shapes unchanged, fully-watched zero-build serials stay skipped with pack-on-play as their path, budget-eviction recency stays any-progress-based; table cases: credits-start below the floor counts watched, >=90% counts without credits, mid-episode below both fronts the tail, missing-facts conservative, fully-watched zero-build stays skipped, mixed serial fronts unwatched tail, recency untouched
  verify: set -e; go test ./cmd/mellifera -run TestWatchedSemantics || exit 1; go test ./internal/orchestrator -run TestFrontier || exit 1

## 3 - playback-event beacon endpoint (internal/api)

- [ ] 3.1 POST /api/v1/playback-events in the browse role group: shape-validated {item_id, mode, phase, code, detail} (mode direct|hls, phase fatal|video-error|stalled), 204 no body, canonical 400 bad_request, per-client in-process rate limit answering 429 rate_limited with no log line, one INFO line per accepted beacon (fields + truncated detail + UA, no store read, INV4); swag annotations; tests incl. role gating (client-role accepted) and rate limit
  verify: set -e; go test ./internal/api -run TestPlaybackEvents || exit 1
  file: tasks/3.1.md

## 4 - SPA pack-on-play wiring and error surfacing (web/src)

- [ ] 4.1 web/src/lib/api.ts: PlaybackDescriptor type gains state_reason + the preparing/unsupported state values; sendPlaybackEvent client through the authenticated wrapper (swallow-everything posture); api.test coverage for the new shapes
  verify: set -e; cd web && npx vitest run src/lib/api.test.ts || exit 1; npx tsc --noEmit || exit 1
- [ ] 4.2 ItemDetail pack-on-play wiring: descriptor preparing+non_native_container fires POST /play {retry:false} once per descriptor instance, Preparing surface replaces the player attach, bounded descriptor poll exits to hls (player mounts) / failed (existing retry affordance) / stall (honest still-preparing state); unsupported renders the reason banner, never a spinner; play POST canonical error inline
  verify: set -e; cd web && npx vitest run src/pages/browse/ItemDetail.test.tsx || exit 1
  file: tasks/4.2.md
- [ ] 4.3 Player error surfacing: direct-lane video error event renders the media-error-class banner (source-not-supported = undecodable container) and hls.js fatal errors render type/details/HTTP-status banner; banners clear on re-attach, progress reporting unaffected; failure edges send one best-effort beacon each (send failures swallowed)
  verify: set -e; cd web && npx vitest run src/components/playback/Player.test.tsx || exit 1
- [ ] 4.4 Embedded build regen: make web-build (swag + vite) and commit internal/web/dist + internal/web/api/openapi.{json,yaml} listing /playback-events; node-free Go gate untouched
  verify: set -e; test -f internal/web/dist/index.html || exit 1; grep -qF '/playback-events' internal/web/api/openapi.json || exit 1; grep -qF '/playback-events' internal/web/api/openapi.yaml || exit 1; grep -qrs 'playback-events' internal/web/dist/assets || exit 1; (cd web && npm run build >/dev/null 2>&1); test -z "$(git status --porcelain internal/web/dist)" || exit 1

## 5 - joints and living docs

- [ ] 5.1 Joint itest for the two cross-group wire contracts over real instances, no mocks: (a) descriptor honesty wire — a store-seeded item document carrying matroska ffprobe facts answers the real GET /items/{id}/playback with state preparing + state_reason non_native_container and the floor play_url; (b) beacon wire — the exact SPA payload shape posts through the real router to 204 with the INFO line captured @qa
  verify: set -e; go test ./internal/itest -run TestPlaybackUnblockJoint || exit 1
  file: tasks/5.1.md
  qa: tests/internal/itest/playback_unblock_joint_test.go::TestPlaybackUnblockJoint, tests/internal/api/playback_events_test.go::TestPlaybackEvents
- [ ] 5.2 Living docs: docs/playback-postmortem-2026-10-31.md — F5 follow-up and F8 fix directions marked landed by this change (tv-playback-unblock), remaining open lines (cooldown classification, in-flight ownership) stay open
  verify: set -e; grep -q "tv-playback-unblock" docs/playback-postmortem-2026-10-31.md || exit 1
