# Close-out — tv-style-parity (archived 2026-11-26)

**21/21 tasks green; GATE 2 approved; archived as `2026-11-26-tv-style-parity`.**
Branch `feature/tv-style-parity` @ a5c2a78+ (pushed). Zero server delta, zero
SPA delta, zero wire changes — Android Kotlin + one session-side probe script.

## Per-task receipt summary (final)

All 20 authored tasks green + built-in git-check green. Red-then-green cycles
(all resolved, none outstanding): 16.1 (HALT — compose Trace seam; fixed by the
session-owned test-only android/os/Trace.kt shadow), 18.2 (×2 test-authoring
mis-transcriptions, fixed in-test), 19.1 (×1 KeyRouting expected-value
mis-derivation, fixed against the law), 22.1 + 20.1 (×1 each — transient
shared-tree compile interference from a parallel apply; both healed, each
receipt journals its own green run). Reviewer re-ran all 21 duties rc 0.

Full-suite anchors: Android JVM 305 tests / 52 classes / 0 fail; go 29 pkgs rc 0
(incl. chore 01fe9a4, the pre-existing TestPairingJointFlow baseline repair);
web skipped (zero SPA delta).

## The durable rulings

- **Peek identity**: AUTO plans height-first — the exact-fill identity makes the
  AUTO peek 0 for ANY reserves (floor-derived columns); peek > 0 only at
  overrides. The draft's peek sketches were structurally impossible; design D2 +
  spec corrected.
- **Season chip**: the wire serves NO season on series rows (the draft's :313
  citation was the HOME DTO). In force: score-only compact caption. Seeded
  follow-up: read-time `season` on seriesDTO + one-line passthrough.
- **Player bar**: TWO-LEG identity line (SxxEyy · title) — SPA-true; spec
  amended from the over-described three-leg text.
- **Overscan**: a centered modal's internal padding is not a page-edge inset —
  the settings overlay keeps its own dialog padding law.
- **Q13 canaries**: 7 per-token getter canaries guard the 68-site sweep — the
  one invisible-failure class in the change, closed by named tests.
- **Trace shadow lesson**: compose 1.7.x traces composition unguarded; the JVM
  mockable android.jar throws on beginSection. A test-only `android.os.Trace`
  shadow (no-op statics) wins the classpath dispatch — load-bearing for every
  future JVM composition pin in this repo.

## Residual seeds

In review.md (this folder): rowCardTrack retirement, TYPE_* val deletion +
KDoc fix, stale crop docs ×2, chipsRowConsumesUp retirement sweep (Q9 waiver),
photo prefs override note, EPISODE chrome reserve re-measure, Крупный
taller-viewport tier, season-chip server follow-up. Known docs debt unchanged:
the machine page remains OUT OF CONTRACT (wf index regen refuses — hand-authored
narrative sections); the docs pass this close is best-effort narrative only,
the contract repair stays a dedicated pass.

## Deploy

Redeploy ordered in-session (operator): APK build → alatoic docker rebuild →
health check → on-device walk session (tv-debug relays) per the layout-parity
precedent. The server binary/dist are unchanged; the deploy ships the new APK
through the apk-distribution endpoint.
