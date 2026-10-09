# Design: packaged-playback

Full design rationale lives in `.tmp/packaged-playback-design.md` (v3,
converged 2026-10-09, user decisions locked) — Context points there instead of
restating. All code anchors in the draft §6 were re-verified against the live
tree at HEAD 4dfdc9e on 2026-10-09 before this document was written.

## Goals / Non-Goals

Goals: no decode/encode anywhere (remux only); zero CPU at play time;
structural TV-remote seeks (segment/byte fetches, never process respawns);
storage capped under a budget, never a second library copy; sections (chapter
skip) in v1; wire contract stays client-neutral (browser SPA now, native app
reserved).

Non-Goals: transcoding (Phase-2 capability seam — the reserved door for
HEVC/Hi10P/TrueHD, which deliberately do not play in browsers in v1); subtitle
burn-in / ASS→WebVTT on the packaged lane (fast-follow; packaged lane drops
subs, direct lane keeps them — documented behavior); native app clients;
`from_seconds` pack-from-seek (field reserved, no-op); ABR/multi-rendition.

## Decisions

**D-1 — Two lanes, zero sessions (reject the capability ladder).** Media
servers run per-play direct → live remux → transcode ladders with process
supervision and nothing cached. This design deletes the rungs: transform
decision is made once off the play path, result cached under a budget, play
time degenerates to static file serving. Rejected alternative: a supervised
per-play remux rung (kills + respawns ffmpeg per seek — C4 kills it; also
violates C2 no-per-play-supervision on weak heads).

**D-2 — Classification is derived, not stored.** The four classes
(direct/pack/opt_in/direct_only) are computed per item from the verbatim
ffprobe blob already in the document (pure function in the stream package);
nothing new is persisted per class. Rejected: persisting the class at scan
(another base-vs-derived fact to carry through F1 and re-scans for no read
benefit). Opt-in knob default OFF locked; `direct_only` exists because
remuxing High10 burns budget for an unplayable stream.

**D-3 — Pack lane: `-c copy -map 0:v:0 -map 0:a -sn -dn`, fMP4-HLS.** Naive
`-c copy` fails on PGS/ASS/data streams (reviewer-verified), hence explicit
maps and drops. One ffmpeg exec site in the stream package, arg-slice only
(precedent: plugins/frame-grabber/ffmpeg.go:32-66). Subtitles dropped on the
packaged lane is documented v1 behavior (direct lane keeps them).

**D-4 — Head-first partial packaging is IN v1 (locked) and is the designated
cut unit.** First chunk 600s published before the rest; playlist is a growing
EVENT playlist; ENDLIST presence is a progress state, not a mode switch
(hls.js live-polls natively). If `/build` must de-scope, this whole
requirement + its tasks go as one piece (+350–480 LOC) without touching
anything else.

**D-5 — Atomic publish + build-nonce directories.** Artifacts written to a
`.tmp` sibling then moved; eviction moves to a `.trash` sibling then deletes.
Each run publishes under a fresh nonce directory so a repack never collides
with a client's cached playlist, and playlists are byte-identical per nonce
(HTTP caching safe).

**D-6 — Media token: HMAC, cookie-primary + query fallback, TTL 4h (locked).**
`<video>`/hls.js loaders cannot carry bearer headers; the query fallback
doubles as the native-app story (C8). Admin token is never the media secret;
tokens excluded from logs.

**D-7 — Verb split: GET never mutates.** `GET /playback` read-only
descriptor + token mint; `POST /play` the only mutation (`retry`,
`from_seconds` reserved). The loop's reviewer rejected `?retry=1` on GET.

**D-8 — Watch-driven frontier, not eager-everything (C3).** Serial frontier =
"one past the last watched" (same order as the episodes endpoint:
store/series.go:204 ≡ api/handlers.go:766-783); fresh serial ⇒ eager pilot E1
(same rule); movies = pack-on-play, never pre-warmed (a movie library's worst
case would be the whole library on disk). Boot sweep per library gated on
`libraries.streams_enabled` (one ensureColumn — idiom open.go:218-251, three
existing callers). Sweep ticker ≥60s. Rejected: eager-pack entire libraries
(budget blowout), Plex-style manual Optimize queues (manual, unbounded).

**D-9 — Artifact GC belongs to the orchestrator, not the janitor.** The
orchestrator sweeps `__streams__` ledger rows + artifact dirs against the
budget; the janitor reservation (architecture §7.5) stays intact and
`__streams__` rows are exempt from a future unregistered-plugin purge
(locked). Budget accounting reads disk truth (orphaned dirs counted —
fileID=sha256(relative_path) means moves orphan artifacts:
plugins/base-scanner/walk.go:129-131; accepted caveat, eviction reaps them).
LRU clock = playback_progress.updated_at (ListProgress ORDER BY updated_at
DESC, store/progress.go:79). Budget 32 GB default, 0 = off (locked).

**D-10 — Packaging jobs ride the enrich queue as the `__streams__` lane.**
Dedicated dispatch branch in its own file, seams via Deps func-fields wired
flat in main.go (enrich/enrich.go:34 pattern) so enrich never imports the
stream package. Whole-doc write race closed: the lane takes a lease
(lease.go:46-54), **renews during long runs** (leaseMap.renew, lease.go:78 —
zero callers today; this feature gives it its callers), and re-reads the row
fresh immediately before persist under writeMu (queue.go:571-575; persist
queue.go:541-554). `pendingSources` (queue.go:340-352) stays metadata-only.
`pack_failed` reuses the flat `no_data` cooldown shape (worker.go:68-72) at
flat 30 days, rows under `__streams__` in `enrichment_failures` (TEXT PK —
no schema change, open.go:122-131).

**D-11 — F1 carry-forward (BLOCKING) in scan.** Scan persist (run.go:235-253)
unconditionally `PutItem`s the base doc and the upsert overwrites
`document = excluded.document` (store/items.go:60) — a rescan would erase
`doc["streams"]`. Fix: when `baseChanged == false` (the comparison at
run.go:382-407 covers parsed+ffprobe only; the prior document is already
loaded via GetItem at run.go:372), carry the prior `doc["streams"]` forward;
when base changed, drop it (artifacts for changed media are stale).

**D-12 — New handlers in new files; SPA player.** handlers.go is already 969
lines (>500 fails new code) — all new API handlers live in new files with the
writeError contract (handlers.go:967). `web.Options` gains a Media handler
mounted before the SPA fallback (web.go composition, web.go:30-65),
preserving INV-single-handler (main.go:200-213). SPA: hls.js (Apache-2.0)
for packaged, native `<video>` for direct; **hls.light is the candidate
build** (artifacts are already fMP4 — alt-mux support is dead weight); final
call at implementation.

**D-13 — Capability set (deliberate deviation from draft §7).** The draft
planned deltas to media-serving + async-enrichment only. Propose splits the
new playback contract into its own `packaged-playback` capability: the
surface includes policy (frontier, budget) that does not fit media-serving's
purpose (photos/thumbs/downloads), and a delta cannot change a capability's
Purpose. media-serving keeps a one-sentence boundary amendment (fulfilling
its spec.md:23-27 deferred-surface placeholder by pointing at the new
capability). web-ui is added because the endpoint allowlist requirement would
otherwise become false — same reason element-pages had to amend it.

## Interfaces (cross-group contracts)

1. **`doc["streams"]` (scan ↔ stream ↔ enrich lane):** packaging state +
   artifact pointer stored in the item document under the `streams` key.
   Written ONLY by the streams lane's persist path (lease + renew +
   fresh-reload under writeMu); read by stream serving + the API descriptor;
   carried forward / dropped by scan per D-11. Nothing else may write it.
2. **Streams lane seam (enrich ↔ stream):** the lane defines its own Deps
   func-fields (dispatch branch, own file); main.go wires the pack function
   to the stream package — enrich stays ignorant of stream.
3. **API ↔ web (routes + token):** `GET /api/v1/items/{id}/playback`,
   `POST /api/v1/items/{id}/play` (browse group, pure delegation, new
   handler files); `/media/*` static surface mounted in `web.Options` before
   the SPA fallback, token-gated (cookie + query), never bearer.
4. **Orchestrator ↔ store:** reads `ListLibraries` (boot sweep,
   libraries.go:187), `QueryItemsBySeries ORDER BY relative_path` (frontier
   order, series.go:204), `ListProgress` (LRU clock, progress.go:79);
   enqueues into the lane via a func seam; never writes item docs and never
   touches library directories.
5. **Sections contract (scan ↔ api ↔ SPA):** both scanner probes gain
   `-show_chapters` (+1 line each, plugins/base-scanner/ffprobe.go:29-50,
   plugins/serial-scanner/ffprobe.go:42-43); chapters ride the verbatim
   ffprobe blob; the descriptor projects them to `{kind:"chapter",
   start, end?, title?}`; SPA seeks on section activation.

## Risks / Trade-offs

- [element-pages (GATE 1 approved, un-archived) also modifies the web-ui
  allowlist requirement] → base the MODIFIED block on the live spec text;
  if element-pages archives first, re-sync the allowlist enumeration at
  apply time (one mechanical edit; tasks group 3.3 carries the audit).
- [Packaging tests need ffmpeg] → ffmpeg IS a declared server prerequisite
  post-change; probes guard `command -v ffmpeg` and fail loudly rather than
  pass vacuously (mirrors the frame-grabber fixture convention, but strict).
- [Exported-symbol budget (≤8/package) under the stream package's surface] →
  keep entry points tight (classify, pack, token issue, serve handler,
  descriptor); if the budget fails the check, split serving into the api
  handler layer — a failed check means redesign, not relax.
- [Disk-truth accounting counts orphans, and eviction can reap an artifact
  for an item that would be re-derivable] → accepted by design: orphans are
  waste by definition; frontier re-packages on next watch/pilot sweep.
- [Head-first grows playlist concurrency] → byte-identical per nonce +
  atomic publish per playlist generation; no partial file is ever served
  (segments are complete files before the playlist references them).
- [Storage surprise on movie libraries] → movies never pre-warm (D-8);
  budget knob caps total; `0` disables for users who want none.

## Migration Plan

Additive: no schema change beyond one `ensureColumn`; no proto/SDK/plugin
changes; go.mod gains hls.js only on the SPA side (npm). Rollback = switch
`streams_enabled` off per library (packaging stops; existing artifacts get
reaped by budget policy) or set budget `0`; the direct floor keeps every item
playable throughout. Deploy order is single-binary as always.

## Open Questions

Genuinely deferrable only — none changes specs, approach, or task breakdown:

1. `from_seconds` (pack-from-seek) — fast-follow; field reserved now.
   Recommended: ship v1 without it.
2. ASS→WebVTT subtitle delivery on the packaged lane — fast-follow.
   Recommended: v1 ships subs on the direct lane only.
3. Native app client — reserved (locked: browser-first); HLS + query token
   keep the contract client-neutral. Revisit when an app effort starts.
4. hls.light vs full hls.js — decide at implementation against the artifact
   shape; light is the candidate (D-12).
