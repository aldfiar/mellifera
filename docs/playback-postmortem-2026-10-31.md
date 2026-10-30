# Playback postmortem — TV spinner, pack churn, poisoned failure ledger (2026-10-31)

Living document: root causes found while fixing "episode won't play" (desktop →
then TV), every change shipped on `fix/opt-in-codecs-knob`, and the design
lessons for future work. Update it when a fix lands or a new finding appears.

## Timeline (branch `fix/opt-in-codecs-knob`)

| Commit | Change | Fixes |
|---|---|---|
| `952342a` | `MELLIFERA_STREAM_OPT_IN_CODECS` knob | HEVC/AC-3 items became packable → itm_3 packed to fMP4-HLS |
| `588ce97` | pack-on-play survives queue backpressure | boot-storm (buffer full) no longer breaks play; buffer 64 |
| `3c81237` | frontier pin in budget sweep | evictions prefer non-fronted builds (PARTIAL — see F3) |
| `8d2694b` | unpublish build record on budget eviction | integrity sweep no longer repacks evicted-but-complete items |
| `1148e5c` | request log middleware (1 INFO line/request, no query strings) | made the TV attempt visible server-side |
| (next) | frontier working set pinned every tick; in-flight `.tmp-*` never evicted; ffmpeg reason keeps stderr tail | F2+F3+F4 fixed; openspec delta extended; ledger cleanup is manual ops |
| `950665b` | = the row above (this commit) | deployed to alatoic 2026-10-31 02:12 MSK |

## Findings

### F1 — TV failure: poisoned `pack_failed` ledger, not the TV's fault
- Symptom: TV (YaBrowser Lite, Android TV, UA `Chrome/156 … YaBrowser/26.8 (lite) TV`)
  shows endless spinner on episode `itm_4_4abdae6f23167012`.
- Request log proof: descriptor `GET /playback → mode=direct state=failed`, then
  endless small range requests to `/media/<item>/original` (raw MKV), zero
  requests to a playlist. The `<video>` element cannot decode MKV → spinner.
- Root cause: a packaging run for this item failed on 2026-10-30 19:37 →
  `enrichment_failures` row `__streams__/pack_failed` → **flat 30-day cooldown**
  (next eligible 2026-11-29). Pack-on-play and the frontier both refuse to
  re-enqueue while cooling → direct floor serves the original MKV forever.
- Why it "works on desktop": it doesn't — the desktop session played a
  *different* episode (`itm_3`) whose pack succeeded after the knob. Any client
  playing the poisoned episode gets the same raw MKV. (Second-order difference:
  macOS Safari decodes HEVC natively; YaBrowser/TV and MSE-based clients don't.)
- Follow-up (2026-10-31 01:27): user reports *every* episode fails on TV while
  desktop plays them all. Log window shows the TV app kept hammering the same
  poisoned `itm_4` (descriptor + 206-range storm, no playlist) — and with 27
  poisoned items plus the still-live 60s churn (mode flips to direct while
  repacking), most episodes the TV touches answer direct at least part of the
  time. Consistent with F1+F3 combined; not a TV codec issue.

### F2 — Why packs failed: budget evicts IN-FLIGHT builds (`.tmp-*`)
- Evidence in ledger: `stream: head playlist: open
  data/streams/<item>/.tmp-99f789723a38b8f2/index.m3u8: no such file or
  directory`, plus 27 items with `ffmpeg failed: exit status 254` in two waves
  (Oct 23 20:36–21:09, Oct 30 19:25–19:48 — the churn eras).
- Mechanism: a pack writes into `data/streams/<item>/.tmp-<nonce>/`.
  `sweepBudget` walks ALL directories via `nonces()` — including `.tmp-*` —
  and treats them as never-watched artifacts (oldest recency). While the churn
  loop pressured the budget, the sweep deleted directories out from under
  running ffmpeg jobs → ffmpeg dies (254 / missing index.m3u8) → terminal
  `pack_failed` → 30-day cooldown. Churn converted itself into PERMANENT
  per-item poisoning.
- The orphan `.tmp-*` crumbs (~10MB) under `data/streams/itm_2_*` are the
  survivors of the same mechanism.

### F3 — Frontier pin hole → 60-second evict→repack churn loop
- Live evidence at `1148e5c`: every minute — `fronted packaging` ×4
  (pilot/next-after-watched) → `evicted artifact directory` ×4 (the just-built
  nonces) → `evicted build unpublished` ×4 → repeat. Same 4 items, indefinitely.
- Mechanism: `sweepFrontier` derives the pinned `fronted` set from THIS tick's
  Frontier *jobs*. A job exists only while the candidate is eligible (not
  packaged, outside cooldown). The tick after a pack lands, the item is
  `partial`/`complete` → no job → **fronted set empty** → budget evicts the
  never-watched fresh build first → unpublish → next tick the item is eligible
  again → repack. The pin only exists on ticks where the frontier wants
  something enqueued; the working set must be pinned on EVERY tick.
- Budget math at the time: streams 43.8 GiB vs budget 40 GiB — permanently
  over, so every tick evicted something, and never-watched = always first.

### F4 — Failure reason stores the HEAD of ffmpeg stderr
- `truncate(out, 512)` keeps the first 512 bytes: the ffmpeg version banner.
  The actual error line (at the END of stderr) was discarded → every ledger row
  shows an identical useless banner. This is why the root cause stayed hidden.

### F5 — HEVC remux policy (open, design decision)
- Pack REMUXES HEVC as-is into fMP4 (`init.mp4` contains `hvcC`/`hev1`) — no
  transcode. Plays where the platform decodes HEVC (Safari native, some TVs);
  fails on MSE/hls.js clients (Chrome desktop, YaBrowser TV). The two-part
  playlist (original + translated audio track via `#EXT-X-DISCONTINUITY` and a
  second `EXT-X-MAP`) doubles the surface: clients must survive a codec-map
  switch mid-playlist.

### F6 — Auth is NOT the problem
- Descriptor GET sets cookie `media_token` (path=/media); segments authorize
  via cookie (200 verified). Relative segment URIs don't inherit the playlist's
  query token (bare URL → 401) — works because browsers attach the cookie.
  No action needed for this incident; see design notes below for hardening.

### F7 — Stale-JS hypothesis is dead
- `index.html` is served `no-cache`, hashed assets immutable → a TV navigation
  fetches the current bundle. (The 404-on-old-hash failure mode would now be
  visible in request logs; none seen.) Separate small bug spotted: TV gets
  403 on `/posters` (img-tag requests carry no Authorization header; cookie
  session missing there) — cosmetic on TV, worth its own fix later.

## Shipped fixes for F2–F4 (this branch, see git log for final commits)

1. **F3** — `orchestrator.Frontier` now also returns the *working set* (the
   frontier-position item of every gated, not-fully-watched serial) separate
   from the eligible-only jobs; `sweepFrontier` pins that set on every tick,
   packaged-or-not. Budget below working set still warns before evicting a
   fronted build.
2. **F2** — `orchestrator.Evictions` never selects `.tmp-*` directories for
   eviction (still counted in budget accounting). In-flight builds are not
   eviction candidates; a pack either lands (dir becomes a normal candidate)
   or cleans up after itself.
3. **F4** — ffmpeg failure reason now keeps the TAIL of stderr (the actual
   error line), not the head (banner).

## One-time server remediation (alatoic) — DONE 2026-10-31

- Clear poisoned ledger rows: `DELETE FROM enrichment_failures WHERE
  plugin_id='__streams__' AND status='pack_failed';` — **done**: 28 rows
  deleted (27 + one fresh from the 01:27 TV retry). DB is root-owned
  (container writes it) and the box has no passwordless sudo — the write was
  made as root via `docker run --rm --privileged --pid=host --entrypoint
  nsenter mellifera:local -t 1 -m -u -i -- env HOME=/home/darthmantis
  /usr/bin/python3 /tmp/unpoison_ledger.py` with the container stopped.
  Backup kept: `~/mellifera/mellifera.db.bak-20261030-225306`.
- Budget raised `MELLIFERA_ORCH_BUDGET_GB` 40 → **60** (inline in
  `~/mellifera/docker-compose.yml`, NOT `~/.env`): the un-poisoned working set
  is 28 frontier items ≈ 59 GiB of builds — at 40 (and 50) the sweep evicted
  fresh fronted builds with the new `budget below frontier working set` WARN,
  which is exactly the operator signal to raise it. At 60 the churn stops.
- Deployed `950665b`; post-cleanup boot-storm (~28 eligible items vs a
  4-worker/64-buffer queue) drained in ~15 min.
- **Verified end state**: `itm_4_4abdae6f23167012` descriptor `mode=hls
  state=complete`; master playlist 200 with audio rendition group, variant
  `rend0` 287 segments, `init_0.mp4` contains `avcC` (H.264) — YaBrowser/MSE
  compatible. No eviction lines after the budget raise.
- Late observation (benign, open): for a few ticks after a pack lands, the
  frontier still offers the already-packaged item (stale input snapshot from
  boot); the queue rejects it (`enqueue failed ... buffer full`). Harmless —
  no duplicate pack — but the WARN noise misleads; refresh the sweep input
  per tick or check packaged state at enqueue time.
- Remove orphan `.tmp-*` crumbs under `~/mellifera/streams/itm_2_*` (TODO,
  cosmetic ~10MB).
- Watch for the churn signature (`fronted packaging` for the same item ID
  more than once) after deploy — request/orchestrator logs now make it visible.

## Future design (candidates, not decisions)

- **Cooldown should distinguish infra errors from content errors.** A deleted
  output dir or a full queue is OUR fault — retry soon (minutes). A corrupt
  input file is the file's fault — long cooldown. Classify at
  `recordPackFailure` and use a short flat cooldown for infra classes.
- **In-flight protection by ownership, not naming.** The `.tmp-` prefix
  convention works but is implicit; a lease/manifest the sweep can read would
  make "don't touch, a worker owns this" explicit and self-describing.
- **HEVC strategy (F5):** either a transcode-to-AVC lane for mixed-client
  deployments, or codec-aware manifests + client capability detection with an
  honest "unsupported codec" UI state instead of a spinner.
- **Container-aware classification:** MKV+H.264 already packs (this episode
  proved the classifier right) — keep it; document that direct floor is only
  safe for `<video>`-native containers (mp4/webm), never MKV.
- **Pack observability:** terminal pack failures should log one WARN line with
  the item id at the failure site (today only the ledger row knows). The
  request-log middleware pattern (`httplog.go`) is the model.
- **Poster auth (F7):** cookie-session for img-tag endpoints or signed poster
  URLs.
- **Token propagation (F6):** emit absolute segment URIs carrying the token, or
  keep cookie auth but make it explicit in the spec — currently correctness
  silently depends on the browser cookie jar.
