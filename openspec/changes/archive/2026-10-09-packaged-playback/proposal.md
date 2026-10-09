# Proposal: packaged-playback — remux-only video streaming, watch-driven frontier, static token-gated serving

## Why

Video is the main goal, but the server is a weak/headless machine: any transcoding (decode/encode) is unacceptable, and the media-server pattern — a supervised ffmpeg session spun up per play (the capability ladder) — dies under TV-remote scrubbing that fires seeks seconds apart. Meanwhile browsers refuse the MKV container: library items carrying perfectly decodable h264/AAC inside MKV cannot play and can only be downloaded (the current spec states downloads-not-streams). The ask: fast playback, no transcoding, and section navigation that can skip the OP.

## What Changes

- **Direct floor (every item):** every item is playable through the token-gated playback surface at its original bytes with Range support — zero transform work, always available; originals stay read-only and the server never writes inside library directories.
- **Remux-only pack lane:** items whose codecs the browser decodes but whose container it rejects (the typical MKV+h264/AAC) are remuxed in the background to fMP4-HLS (`-c copy`, never decode/encode), carrying video+audio only; subtitle and data streams are dropped. Head-first packaging (first 600 s published and playable, playlist grows, `ENDLIST` = complete) stays in v1 and is the single cuttable unit. Artifacts publish atomically under build-nonce directories (a repack never collides with a client cache), all inside the server's own data space.
- **Play time = static file serving, always:** playlist/segments/original files are served statically from disk, byte-identical, relative URIs, no sessions, no play-time ffmpeg; gated by an HMAC media token (4 h TTL, cookie-first + query fallback, never the admin credential, never logged).
- **Verb split:** `GET /api/v1/items/{id}/playback` is the read-only descriptor (mode direct|hls, packaging state, sections, play URL — GET never mutates); `POST /api/v1/items/{id}/play` is the only mutation (`retry` re-enqueues a failed packaging run; `from_seconds` accepted and reserved, no-op in v1).
- **Sections:** scanner ffprobe gains `-show_chapters`; container chapters surface as `{kind,start,end?,title?}` sections on the descriptor (the marker namespace stays reserved for future plugins).
- **Watch-driven packaging frontier (new internal/orchestrator, pure policy):** once episode K of a serial is watched, episode K+1 packages (ordered exactly as the episodes listing); a serial with no watch progress packages its first episode eagerly; movies package only on play, never pre-warmed; boot/sweep per library gated on `streams_enabled` (default ON).
- **Budget-capped storage:** packaging artifacts live under a default 32 GB budget (`0` = off); accounting reads disk truth (orphaned directories included), eviction is LRU by watch-recency, move-aside before delete.
- **Packaging rides the enrichment queue (`__streams__` lane):** a dedicated dispatch branch (own file) over the same lease/retry/ledger machinery; terminal `pack_failed` cools down flat 30 days; no metadata-completion semantics (lifecycle states untouched); `__streams__` ledger rows are exempt from the future unregistered-plugin purge; long runs renew their lease (renew gains its real callers).
- **F1 fix (BLOCKING):** a re-scan whose base is unchanged carries `doc["streams"]` forward (packaging state and artifacts survive); a changed base drops it (changed media means stale artifacts).
- **SPA playback:** packaged items play via hls.js, direct items via the native `<video>` element; sections UI with click-to-seek (standard media seeks, so TV remotes just work); endpoint allowlist updated.
- **Non-goals (v1):** transcoding (Phase-2 capability seam), subtitle burn-in / ASS→WebVTT (the packaged lane drops subtitles as documented behavior; the direct lane keeps them), a native app (HLS + query token keep the contract client-neutral), `from_seconds` pack-from-seek (fast-follow), an admin UI for the streams toggle (v1 is API-only: PATCH /libraries with `streams_enabled`).

## Capabilities

### New Capabilities

- **`packaged-playback`** — the browser video playback contract without transforms: direct floor, four-way playback classification (direct/pack/opt_in/direct_only + the opt-in knob), remux-only packaging output with atomic/nonce publishing, head-first partial packaging, token-gated static playback serving, the playback descriptor and verb split, sections, the watch-driven frontier, budget cap with LRU eviction, and packaged-state survival across re-scans.

### Modified Capabilities

- **`media-serving`** — a boundary-sentence amendment to the "Item media endpoint" requirement: the endpoint stays pure static bytes (no transcoding, no adaptive streaming), and its "no in-browser playback capability (deferred internal/stream surface)" placeholder is fulfilled by this change — playback moves to the new packaged-playback capability while the endpoint keeps download semantics.
- **`async-enrichment`** — adds the "Packaging work rides the enrichment queue" requirement (the `__streams__` lane: same lease/retry/ledger machinery, no metadata-completion semantics, ledger rows exempt from purge); modifies "Per-item lease mutual exclusion" (long-run renew obligation) and "Enrichment-failures ledger" (`pack_failed` terminal state, flat 30 days, no doubling).
- **`web-ui`** — the "SPA consumes only pre-existing endpoints" allowlist gains the playback/play routes and the token-gated `/media` playback surface; adds "Video playback in the SPA" (hls.js/native video, section seeking, retry affordance, progress reporting unchanged).

## Impact

- **Code:** new packages `internal/stream` (classification, pack lane, tokens, /media serving, budget accounting) and `internal/orchestrator` (frontier, sweeps, GC policy); `internal/scan` carry-forward logic + `-show_chapters` in both scanners; `internal/enrich` streams lane (own file); `internal/api` new handlers (new files — handlers.go is already 969 lines); `internal/web` mounts `/media` before the SPA fallback; SPA player components + Vitest. ffmpeg/ffprobe only via `os/exec` arg-slice.
- **Storage:** no new tables, no new protos. One `ensureColumn` adds `libraries.streams_enabled`; `enrichment_failures` is reused (TEXT PK, plugin_id='__streams__'); packaging state lives under the `streams` key of `items.document`; artifact directories live in the data directory (~2,300–2,800 + 350–480 LOC).
- **Operations:** new knobs — `MELLIFERA_ORCH_BUDGET_GB` (default 32), the opt-in codec switch (default OFF), the token TTL (4 h); ffmpeg/ffprobe become server prerequisites (runbook updated post-archive).
