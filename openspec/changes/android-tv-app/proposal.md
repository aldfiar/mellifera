# Proposal

## Why

TV browsers cannot play what the server serves: HEVC remux fMP4 HLS fatals in every webview MSE, MKV originals are never playable there, HLS splits across two HTTP stacks, and every density fight costs SPA rounds. A native Android TV client (hardware HEVC decode, Matroska extractor, one HTTP stack, TV-native layout) dissolves all four classes — and shipping the client alongside the server (APK in the image, short `/apk` route) with SPA download affordances makes it reachable from the TV that needs it.

## What Changes

- **NEW `android/` module** — minimal native Android TV app (Kotlin + Compose-TV + Media3, minSdk 23): pair → browse → play. One AppViewModel + one pure playback reduce + one PlayerController seam, D-pad + MediaSession, two-tier debug telemetry. A throwaway T0 probe app (`android-tvprobe/`) gates device risk first and is deleted by the real scaffold.
- **`/apk` serving family (internal/web, additive)** — unauthenticated GET/HEAD `/apk` redirect (307 path-only Location into immutable `/assets`), explicit HEAD on `/assets/*` (chi does not fold HEAD), `.apk` content-type row, absent-APK 404 that never leaks index.html.
- **Release mechanics** — Dockerfile `COPY android/apk/` slot between the dist copy and go build (plus the wrong "replaces" comment fix at Dockerfile:45); `make apk VERSION=x` target with the cp -n no-clobber filename law; `.gitignore`/`.dockerignore` entries. Builds stay green APK-less; ghcr/CI images stay APK-less automatically.
- **Debug telemetry (server, additive)** — `POST /api/v1/debug-events` beacon-knobbed ingest (per-IP limiter, detail truncation, one structured INFO line per event); per-device debug flag (credentials column migration + `PUT /admin/devices/{id}/debug` + additive profile field) with the SPA admin toggle.
- **SPA download affordances** — TV-mode banner + login footer + settings placements, `HEAD /apk` probe with version label parsed from the redirect target.
- **Contract regen + glossary** — swag/openapi regen rides `make web-build`; GLOSSARY gains `pack` and `beacon`.

All server deltas are additive — no existing-law modifications, no BREAKING changes.

## Capabilities

### New Capabilities

- `android-app-delivery`: shipping the Android TV client binary alongside the server — the `/apk` route family, image packaging, the versioned-filename contract — and the SPA affordance that advertises it.
- `android-tv-client`: the native TV app's behavior contract — pairing session, browse, the playback flow law, D-pad/media keys, telemetry gating.
- `device-telemetry`: authenticated server-side ingest of device debug diagnostics as bounded structured INFO log lines.

### Modified Capabilities

- `device-pairing`: ADDED requirement — a per-device debug flag on the credential row (admin flip route, registry field, additive device-kind profile field) so a paired client can gate its debug telemetry.

## Impact

- **Code**: `android/` (new module), `android-tvprobe/` (new, deleted by the scaffold), `internal/web` (apk route family, assets HEAD, contentType row), `internal/api` (debug-events route, admin device debug route, additive profile/device fields), `internal/store` (ensureColumn migration on credentials), `Dockerfile`, `Makefile`, `.gitignore`, `.dockerignore`, `web/src` (Pairing admin toggle + download affordances), `GLOSSARY.md`.
- **APIs**: `GET/HEAD /apk` (new, unauthenticated), `HEAD /assets/*` (new method on existing route), `POST /api/v1/debug-events` (new, authenticated), `PUT /admin/devices/{id}/debug` (new, admin), additive `debug` fields on the device registry and device-kind profile. Everything else the app rides (pairing, browse, playback, progress) is already shipped.
- **Systems**: image builds stay green without any APK (bare-checkout/CI); the deployed image carries the APK when `android/apk/` is populated; deploy recipe gains the `android/apk/` rsync include; gradle never runs on the NAS.
- **Tooling**: one-time Android SDK + gradle-wrapper bootstrap on the dev Mac (explicit task); JDK 17 already present.
