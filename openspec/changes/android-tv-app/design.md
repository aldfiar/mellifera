# Design

## Context

Single Go binary (chi) + embedded SPA (web/), deployed on alatoic via `compose build: .` — no gradle and no node on the NAS, ever. Everything the app rides is already shipped: pairing (device-pairing), descriptor + play verb + relative query-token play_url (packaged-playback), beacon ingest pattern (`POST /playback-events`), device registry + bind. Dev Mac: JDK 17 present, adb present, NO Android SDK, no gradle on PATH — every gradle-built duty therefore depends on the explicit SDK task (1.1). Full Go suite green at d1d2441 (the anchor commit all line citations below were verified against). The full design rationale (four failure classes, minimal-branch architecture win, pipeline/mechanics alternatives) lives in `.tmp/android-tv-app-design.md` — this file records the decisions and the cross-group interfaces only. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- The three slices ship together as one MVP: the app, the APK-in-image + `/apk`, the SPA affordances (slice 3 without 2 probes 404, slice 2 without 1 serves an APK of nothing).
- All server deltas additive; APK-optional everything server-side; gradle confined to the dev Mac.
- T0 spike gates the app slice's device risks before any real UI work.

**Non-Goals:**
- ACRA crash reporting (route reserves kind:"crash"), SPA debug parity, app-update banner (needs a served version manifest — the filename contract deliberately wins on code count), per-device JSONL log sink.
- Leanback-view fallback (Compose for TV is falsified at T0 before any UI work), iOS or non-Android TV platforms, app-internal EPG/live features.

## Decisions

- **D1 — App architecture: the minimal branch.** One `AppViewModel` (~500 LOC, all server state; pre-committed split trigger: >~30 handlers or a second playback surface → extract a PlaybackCoordinator), ONE pure flow file `state/Playback.kt` (`reduce(state, event)`, ~15-case truth table), ONE seam `player/PlayerController` (~6 methods + readout StateFlow, the only ExoPlayer owner), player as overlay (not a screen), `when (state.screen)` navigation (no nav library), no DI framework, minSdk 23, `usesCleartextTraffic` (plain-http LAN posture; token exposure identical to the SPA). Rejected: the per-feature branch (AppGraph, per-screen VMs, repositories) — worse locality and ~15+ types vs ~9. The per-feature branch's `PlaybackService` survives ONLY as the pre-sketched one-file fallback behind PlayerController (D-OQ-T3).
- **D2 — /apk mechanics: redirect, not direct serve.** 307 with path-only relative Location (Go writes Location verbatim; RFC 7231) + HEAD on `/apk` AND `/assets/*` (chi v5 does not fold HEAD into Get — explicit mounts). Direct-serve rejected on cache law (redirect target rides immutable /assets caching); version.json rejected on code count. The `/apk` seam is build-mechanism-agnostic — disk-served is the documented escape hatch.
- **D3 — APK pipeline: local drop dir.** `android/apk/` (gitignored `*.apk` + committed `.gitkeep`); the Dockerfile dir-COPY merges it into `dist/assets` slotted between the dist COPY (Dockerfile:46) and `go build` (:47) — dir COPY MERGES, it does not replace (the :45 comment says "replaces" and is wrong; this change fixes it). Bare checkout → only .gitkeep copies → embed finds no APK → 404 → SPA hides the button. ghcr/CI images stay APK-less automatically.
- **D4 — Version contract: the filename is it.** `mellifera-tv-<version>.apk`; `make apk VERSION=x` → `assembleRelease -PversionName=x -PversionCode=$(date +%s)` → `cp -n` (no-clobber: filename↔bytes identity is what makes the immutable cache key and the SPA label sound). Server `coreVersion` (cmd/mellifera/main.go:52) untouched; server/APK cadences expected to drift.
- **D5 — Telemetry: two-tier gate, one instrumentation path.** Gate = `BuildConfig.DEBUG || profile.debug`; profile refetched on every foreground resume (the flip lands within one app-switch); beacons emitted before a profile lands are dropped. Server ingest reuses the beacon machinery's posture: per-IP fixed window (30/min), detail bound (256), closed vocab, INV4 path-only law, ONE structured INFO line per event.
- **D6 — Signing law.** `assembleRelease` REQUIRES `android/keystore.properties` (gitignored) and fails loudly without it — a debug-signed release shipped even once blocks updates on that TV forever (signature mismatch → wipe/reinstall). Keystore generated once (`keytool -genkeypair -validity 10000`) at `~/.mellifera/keys/`, backed up; debug fallback confined to `assembleDebug`.
- **D7 — Grammar-exact spine cuts vs the draft (planner's cut, draft order preserved as the seed).** (a) `make apk` moved AFTER the scaffold (task 5.2): it execs `android/gradlew`, which does not exist before 5.1 — the draft's early release-recipe intent (prove the path early) is honored by slotting it immediately after the scaffold instead. (b) The device debug flag split: server side (3.1) vs SPA toggle (6.1) — different stacks, different duties, one concern each. (c) `net/Api.kt` cut out of the pairing task into its own transport task (5.3) — browse consumes it too. (d) The boot WARN on >1 APK folded into the route task (2.1) — it is `apkTarget`'s discovery behavior, not the Makefile's. (e) The throwaway probe lives at `android-tvprobe/` (repo root), NOT under `android/` — so the `@qa` new-module mandate binds to the real module's tasks only, and the probe's deletion (by 5.1) never touches `android/`.
- **D8 — Interfaces (the cross-group contracts):**
  - **/apk URL+HEAD contract:** GET /apk → 307, Location `/assets/mellifera-tv-<version>.apk` (path-only, `Cache-Control: no-cache`); HEAD /apk → same, headers-only; HEAD /assets/* → 200, immutable cache header; absent → 404, never index.html. Implementation shape: `internal/web/apk.go` `registerApk` (pattern-matched on `swagger.go`'s registerSwagger: public, registered ahead of the SPA fallback in `web.go` Handler); discovery = sorted ReadDir over an injectable fs (fstest.MapFS tests), first `mellifera-tv-*.apk`; `contentTypeFor` gains `.apk → application/vnd.android.package-archive`.
  - **/debug-events contract:** `POST /api/v1/debug-events`, browse group (admin|client), body `{kind, mode?, phase?, item_id?, detail?}`; kind is a CLOSED SET `playback-trace|capability-snapshot|fatal|video-error|stalled` — `crash` RESERVED (documented in prose only, never an accepted value; ACRA deferred). Per-kind required fields: playback-trace → item_id + mode (direct|hls) + phase="trace" + code; capability-snapshot → detail carrying the snapshot payload (device model, Android API, app+Media3 versions, display, decoder table hevc+avc — not item-scoped, no item_id/mode/phase); fatal|video-error|stalled → the beaconRequest five-field shape (item_id, mode, phase = the kind, code, detail — playback_events.go:38-44). detail truncated server-side to the beacon bound (256); unknown kind or missing per-kind required fields → 400 bad_request; per-IP 30/min fixed window on the `playback_events.go` limiter pattern, 400/429 shapes matching the `writeError` posture, one INFO line per accepted event; INV4: no token, no URL in the line (query strings stripped client-side before send). New file `internal/api/debug_events.go`; mounted beside playback-events (router.go:261); the route is client-agnostic (SPA parity deferred, OQ-B6).
  - **Device debug contract:** `credentials.debug` column — `ensureColumn` idiom (open.go:495-498 precedent): guarded `ALTER TABLE credentials ADD COLUMN debug INTEGER NOT NULL DEFAULT 0` + the column added to the CREATE TABLE for fresh installs. `PUT /admin/devices/{id}/debug` body `{debug: bool}` → 200/404/503; additive `debug` field on the device registry DTO (pairing.go:64 deviceDTO, constructed at :269-273) and the device-kind profile answer (profile.go kinds: admin|user|device).
  - **Pairing+playback API the app rides (all shipped, consumed not modified):** POST /pair (5/5min/IP), GET /pair/{id}/wait (immediate read, TTL 5 min edge, single-use pickup — service.go:174-189), GET /libraries, GET /series?library=, GET /series/{id}/episodes (router.go:234), GET /items/{id}/playback, POST /items/{id}/play {retry} (202 on queued:true, 200 on degrade — playback.go:229-233), GET/PUT /progress[/item_id], GET /profile, POST /debug-events (this change). Bearer token auth; `play_url` relative with `?token=` (describe.go:103 hls, :117 direct); the media gate accepts the query token (serve.go:127-141); playlist URIs self-tokenized incl. EXT-X-MAP/EXT-X-MEDIA (playlist.go, idempotent). Voiceover k+1 mapping is the shipped descriptor law (api.ts:315-320).
  - **Release contract:** `make apk VERSION=x` (dev Mac only) → `android/gradlew assembleRelease -PversionName=x -PversionCode=$(date +%s)` → `cp -n` → `android/apk/mellifera-tv-x.apk`. Dockerfile `COPY android/apk/ internal/web/dist/assets/` slotted :46/:47. Deploy recipe (outside the repo): rsync source INCLUDES `android/apk/`, EXCLUDES gradle build dirs → `compose build: .` on alatoic → post-deploy smoke `curl -sI $HOST:$PORT/apk | head -1` → `HTTP/1.1 307` (AC-4 evidence) → proxy check: Location stays path-only through the proxy.
  - **App internal seams:** `PlayerController` — launch, playPause, seekBy, seekTo, selectVoiceover, end; `readout: StateFlow` out (position/buffering NEVER enter AppState — read only at the timeline leaf); one PlayerEvent in. `reduce(state, event)` pure; states Idle | Starting(item, phase, attempt, usedMaybePlay) | Active(PlaySession) | Dead(banner, no retry) | Failed(banner + retry chip); RenditionPlan SingleVariant(k→audioTrack k+1) | Rendition(native) | NoPicker(fail-open). Poll classification: playback-poll 5xx/transport → same uncapped backoff; player-level failure → beacon + Failed; pairing-wait 5xx/transport → poll to the TTL edge → expired→Dead; 404 → Dead immediately; 401 anywhere → wipe token → Pairing screen.

## Risks / Trade-offs

- [SDK install is a network-heavy one-time body (~1 GB: cmdline-tools + platform + build-tools + licenses)] → the DUTY pins only the post-state (`sdkmanager --list_installed`); the download is task 1.1's body on the dev Mac, never a duty, never the NAS. If the download exceeds what a duty-scope session may fetch, the operator runs 1.1's body manually and 1.1 still verifies the post-state — the duty never weakens silently.
- [T0 evidence is operator-assisted — no mechanical duty can prove on-device results] → task 1.3 carries `audit: true`: its duty greps the evidence marker in its six-slot file; the reviewer READS the recorded probe results at GATE 2; the on-device outcomes gate only OQ-T1..T4 below.
- [Gradle wrapper bootstrap needs gradle once] → task 5.1's body installs it one-off (brew gradle, or fetches the wrapper jar) to generate `gradlew`; every duty afterwards runs ONLY `./gradlew`.
- [First gradle builds are slow (distribution + dependency downloads)] → accepted; duties are targeted module invocations with warm caches, never clean builds.
- [JVM-only joint tests stand MockWebServer in for the server] → the fixtures mirror handler shapes pinned by the Go-side tests (internal/itest precedent); the REAL app net+flow code runs — no fake controller. The real-instance Tier-1 posture is preserved within the JVM constraint; on-device e2e stays AC-16/T0.
- [Cleartext HTTP on LAN] → accepted for MVP; revocable household device token; identical exposure to the SPA.
- [Vite wipe radius (emptyOutDir)] → the APK never sits in `internal/web/dist` on disk — only the Docker COPY bridges it; the wipe cannot eat an APK.
- [APK size budget] → accepted for v1 (Compose+Media3); disk-served variant is the escape hatch and the `/apk` seam survives the swap.

## Migration Plan

Additive-only server deltas; `credentials.debug` via `ensureColumn` — existing DBs gain the column at boot with default 0, nothing older breaks. Deploy: rsync source (incl `android/apk/`, excl build dirs) → compose build on alatoic → smoke `curl -sI $HOST:$PORT/apk` → 307 → proxy Location check. Rollback = redeploy the previous image: APK-less is a supported steady state (`/apk` 404s, SPA hides the button); no DB rollback needed (additive column, default false).

## Open Questions

T0-gated (deliberately empirical; evidence recorded in `tasks/1.3.md` by task 1.3):
- **OQ-T1** HEVC hardware decode on the actual TV box (AC-10; the capability snapshot then makes it measurable per device forever).
- **OQ-T2** Translated multi-EXT-X-MAP playlist on ExoPlayer (gates AC-13/D3 sign-off).
- **OQ-T3** Home-press media-keys horizon (N=5 min bar) — a miss ⇒ the MediaSessionService fallback enters the spine as an amendment: one-file change behind PlayerController (sketch: PlaybackService hosts controller + scope + MediaSession; PlayerScreen binds via MediaController).
- **OQ-T4** Compose for TV vs Leanback on the box's Android version — falsified at T0 before any UI work.

Build-time defaults (recorded, decide during implementation without touching specs/approach/tasks):
- **OQ-B1** APK size budget: accept v1; disk-served escape hatch.
- **OQ-B2** Long-press OK semantics: none in v1 (everything through OK-then-reveal).
- **OQ-B3** Token storage: plain app-private SharedPreferences preferred (androidx security-crypto deprecated upstream); EncryptedSharedPreferences only if frictionless.
- **OQ-B4** Trace volume vs JSONL sink: one-line posture first; per-device JSONL under the data dir is phase 2.
- **OQ-B5** ACRA deferred; route reserves kind:"crash"; v1 crash story = uncaught-handler + share button.
- **OQ-B6** SPA debug parity deferred; route client-agnostic.
- **OQ-B7** App update banner deferred (needs a served version manifest).
- Versions (AGP/Gradle/Kotlin/Compose-TV/Media3/Coil): pinned at scaffold time; JDK 17 toolchain fixed.

## AC trace

| AC | Requirement (spec) | Tasks |
|---|---|---|
| AC-1 | android-app-delivery: APK redirect route + HEAD on the APK surface | 2.1, 2.2 |
| AC-2 | APK-absent answers leak nothing + APK rides the image | 2.1, 4.1 |
| AC-3 | APK redirect route (no-cache, unauth) + APK asset content type | 2.1, 2.2 |
| AC-4 | APK rides the image (+ deploy smoke) | 4.1 + operator deploy |
| AC-5/6/7 | SPA advertises the app (gate, probe, label, pins) | 6.2 |
| AC-8 | Pairing session + 401 returns to pairing | 5.4, 7.1 |
| AC-9 | Browse is serial-first and field-driven | 5.6 |
| AC-10 | (device proof) OQ-T1 | 1.2, 1.3 |
| AC-11 | Playback flow law (Dead path) | 5.5 + 1.3 |
| AC-12 | Progress and resume | 5.7, 7.1 |
| AC-13 | Voiceover selection | 5.8 + 1.3 |
| AC-14 | D-pad navigation and media keys | 5.9, 5.10 + 1.3 |
| AC-15 | Telemetry two-tier gate + Device debug flag + Debug events ingest | 3.1, 3.2, 5.11, 6.1 |
| AC-16 | Wire joints harness (MockWebServer + real player; backgrounded keys stay manual T0) | 7.1 + 1.3 |
