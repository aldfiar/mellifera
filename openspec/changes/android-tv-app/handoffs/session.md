# Handoff — session (android-tv-app)

GATE 1 APPROVED (pre-authorization): the user instructed "run till gate 2, if
there are issues pinpointed by wf-surveyor, fix and repeat plan amends" —
propose → surveyor (2 rounds, frontier EMPTY after round 2) → register all
executed under that authority. Proposal shape: 8 groups / 24 tasks (23 + built-in
git-check), spec deltas = 3 new capabilities (android-app-delivery,
android-tv-client, device-telemetry) + 1 modified (device-pairing), design.md D1–D8.
**Waiver to surface at GATE 2:** Q4 — keystore-failure path (assembleRelease
without keystore.properties) has NO automated green receipt by design; reviewer
inspects the signing block in 5.1's output (audit note in tasks/5.1.md).
Baseline: GREEN (go test ./... rc 0, 29 pkgs ok; npm ci done). Worktree:
/Users/aldfiar/projects/go/mellifera.worktrees/android-tv-app on
feature/android-tv-app (base d1d2441), attached to the pipeline header.
Environment facts for runners: JDK 17 (Corretto); adb present; NO gradle on
PATH (brew gradle 9.9.1 installed once for wrapper generation only — all
builds ride ./gradlew); Android SDK installed by 1.1 under $HOME/Library/Android/sdk.
T0 on-device probes (1.3) and its consumer (5.10) REQUIRE THE OPERATOR (real
TV box over adb) — when only those remain, the session stops and asks.

APPLY PROGRESS (receipts are the evidence — `wf pipeline status android-tv-app`):
GREEN (16): 1.1 SDK · 1.2 T0 probe (0d00b4d; apk PRESERVED at
.tmp/android-tv-app/t0-probe.apk sha256 bcf99347… — probe SOURCES deleted by
5.1) · 2.1 /apk route (7b4cfd9) · 2.2 HEAD probes (334dd14) · 3.1 device debug
flag (47c3127) · 3.2 debug-events ingest (4543bac) · 4.1 release pins (644db17)
· 6.1 admin debug toggle (aee4198) · 6.2 SPA apk affordances (21f0862) ·
5.1 scaffold (ae7355c — android/ module, D4 version-in-filename + D6
fail-loud signing PROVEN; Compose default taken, T0-RESULT absent) ·
5.2 make apk (0893aa6 — keystore at ~/.mellifera/keys/mellifera-tv.jks,
cp -n + `|| test -f` guard for POSIX Issue 8) · 5.3 net client (84ae191 —
Retrofit/kotlinx, resolvePlayUrl) · 5.4 pairing (ea593f8) · 5.5 flow machine
(9281423 — pure reduce, 9 qa tests) · 5.6 browse (e21b6c4 — field-driven +
refresh laws) · 5.7 player wiring (ba3947d — Media3Controller + effect ferry +
BeaconSender seam; machine FROZEN, zero changes needed).
IN FLIGHT: 5.8 voiceover mapping + beacon worker.
REMAINING: 5.11 telemetry (←5.7 ✓) · 5.9 D-pad · 7.1 @wf-qa joint (←5.x+3.2)
· 8.1 last · OPERATOR-GATED: 1.3 (T0 on-device probes) + 5.10 (MediaSession,
consults 1.3's T0-RESULT; PlaybackService fallback variant if Home-press bar
missed). STOP AND ASK THE USER when only 1.3 + 5.10 remain.

DISPATCH NOTES: git index shared — stage-only-own-paths on every dispatch;
pipeline verbs resolve only from the worktree cwd; gradle android/ tasks
SERIALIZED (build locks) — one android task at a time; state/Playback.kt is
FROZEN (defects reported, never patched sideways).
