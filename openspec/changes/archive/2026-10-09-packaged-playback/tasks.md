<!-- wf: source_fingerprint=b6e2fd5331784ea7d66a6c0c8272ea85cd0d823256814d5379efd8649c48b8f3 -->
# Tasks: packaged-playback

Probe CWD is the repo root. All probes are `go build`/`go test` + greps over
`internal/`, `plugins/`, `web/src`; the two ffmpeg-dependent probes guard
`command -v ffmpeg` first and fail loudly (ffmpeg is a declared server
prerequisite post-change; tests generate lavfi fixtures in-process). Probe
bodies live in the spec deltas (`specs/*/spec.md`); each box links one. Group
dependencies (DAG): 1 → 2 → 3 → 4 (linear; max concurrency 1). Head-first
partial packaging (2.2) is the designated cut unit — de-scoping it removes
exactly that box + its requirement without touching anything else.

## 1. Groundwork: carry-forward, chapters, classification

- [x] 1.1 F1 (BLOCKING): scan persist carries `doc["streams"]` forward when the identity-bearing base is unchanged and drops it when the base changed; table-driven tests over the carry/drop branches [probe:80a987cfa7028716]
- [x] 1.2 `-show_chapters` added to both scanner ffprobe invocations (base-scanner + serial-scanner); chapters ride the verbatim ffprobe blob into stored facts [probe:f6d562ae89f4c360]
- [x] 1.3 Playback classification as a pure core over stored ffprobe facts: direct / pack / opt_in (knob, default off) / direct_only; table-driven tests with synthetic ffprobe JSON [probe:6c39c5af9b9e07fb]

## 2. Stream mechanism + serving + lane (internal/stream, enrich, web mount)

- [x] 2.1 Pack lane: one ffmpeg exec site (arg-slice only), stream-copy remux to fMP4-HLS with `-map 0:v:0 -map 0:a -sn -dn`, atomic publish (.tmp sibling → move), build-nonce directories (repack never collides; playlists byte-identical per nonce) [probe:f9e6ec5d9a440008]
- [x] 2.2 Head-first partial packaging: 600 s first chunk published and playable first, growing EVENT playlist, ENDLIST on completion (cut unit — see header) [probe:750761395b927c06]
- [x] 2.3 Media tokens (HMAC, cookie-primary + query fallback, 4 h TTL, never the admin secret, excluded from logs) + `/media` static playback surface (playlists, segments, direct originals with Range) mounted in `web.Options` before the SPA fallback [probe:bd3cab860208a495]
- [x] 2.4 Verb split API in new handler files (handlers.go is over the line limit): `GET /api/v1/items/{id}/playback` read-only descriptor (mode direct|hls, packaging state, sections, play URL; 404 unknown) + `POST /api/v1/items/{id}/play` (retry re-enqueues failed pack; from_seconds reserved no-op; 400 nothing-failed; 404 unknown) [probe:0e71a0af8e1c3eb0]
- [x] 2.5 `__streams__` lane in enrich (own file): dedicated dispatch branch over Deps func-fields, lease renew during long runs, `pack_failed` flat 30-day cooldown under the ledger shape, zero metadata-completion semantics; descriptor sections projection + media token mint live here so the API stays pure delegation [probe:05847a1e4d6f6b44]

## 3. Orchestrator policy + SPA playback

- [x] 3.1 `internal/orchestrator` (policy only — never executes ffmpeg, never writes item docs): serial frontier K+1-after-watched (episodes ordered as the episodes endpoint), eager pilot E1, movies pack-on-play, boot sweep + ≥60 s ticker, per-library `streams_enabled` gate (one ensureColumn + PATCH /libraries field) [probe:329a4f043a1380c3]
- [x] 3.2 Budget accounting (default 32 GB, `0` off, disk truth incl. orphaned dirs) + LRU eviction by playback-progress recency (.trash sibling then delete; originals never evicted) [probe:afb6d2ff79cb0935]
- [x] 3.3 SPA playback: packaged items play the stream playlist via hls.js (light build candidate), direct items via native `<video>` at the minted URL, sections list with click-to-seek (standard media seeks for TV remote), retry affordance wired to POST /play with retry, progress keeps reporting via PUT /progress; playback/play clients + allowlist re-synced if element-pages archived meanwhile [probe:09c51040619755c7]
- [x] 3.4 Player Vitest coverage: packaged attach + section seek + partial-vs-complete attach + direct native path + retry affordance [probe:387dd052d5bc3e83]

## 4. QA + delivery

- [x] 4.1 Joint itest (hermetic, ffmpeg-guarded fixture): scan → frontier enqueue → package → descriptor + token-gated serve round trip joining the existing `internal/itest` harness (`TestPlaybackRoundTrip`) [probe:fd57f27e12ae6ebe]
- [x] 4.2 Joint itest: lane ↔ stream ↔ scan — pack_failed cooldown, lease renew under an injected long run, rescan carry-forward end-to-end (`TestStreamsJoint`) [probe:4c95d3b2b0ed233c]
- [x] 4.3 Regenerate committed `internal/web/api/openapi.{json,yaml}` + rebuild committed `internal/web/dist` carrying the player; endpoint-allowlist audit re-run [probe:a237658c3f429594]
- [x] 4.4 Manual walkthrough: browser playback of a packaged MKV (partial head-first → complete), TV-remote seek within a section, chapter jump, budget eviction observable in logs [unprobeable] — approved on probe + inspection evidence per review.md (beats deferred by operator, 2026-10-09); joint itest drives the same graph end to end incl. tail-phase pack
