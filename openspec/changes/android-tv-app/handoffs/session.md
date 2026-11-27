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
GREEN (22/24): all coder/QA tasks DONE — 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1,
5.1–5.9, 5.11, 6.1, 6.2, 7.1 (@wf-qa joint, 99af175 — four wire joints green,
ZERO client defects; one cosmetic Dtos.kt doc note for the reviewer), 8.1
(932f10a — openapi+dist regen byte-stable, glossary Pack/Beacon), git-check
(branch pushed: origin/feature/android-tv-app; change folder committed 7729676).
PROBE APK PRESERVED: .tmp/android-tv-app/t0-probe.apk (sha256 bcf99347…;
sources deleted by 5.1 — rebuild from 0d00b4d if ever needed).
REMAINING (OPERATOR-GATED): 1.3 (T0 on-device probes — four T0-RESULT
sections in tasks/1.3.md: HEVC hw decode, translated multi-EXT-X-MAP
switching, Home-press 5-min media-keys bar, Compose viability) and 5.10
(MediaSession — consults 1.3; if the Home-press bar MISSES, the
PlaybackService fallback variant enters its scope).

## LIVE-BOX AMENDMENT CYCLE (12 Nov, operator troubleshooting on alatoic)

The operator installed mellifera-tv-0.1.0-t0.apk on the real TV (192.168.0.215,
Android 14 box). Findings, all diagnosed from server logs + sources:

1. PAIRING ENTRY UNUSABLE — zero POST /pair arrived: bare unlabeled address
   field, no format guidance, draft lost on every AddressRejected retry.
   AMENDMENT 5.12 AUTHORED (planner) + GREEN (coder, commit 999f83a, verify
   rc 0 — legend/helper constants, PairingFlow.addressDraft, 3 JVM tests;
   1 honest red round journaled: test data tripped normalize's hostname law).
2. PAIRING ITSELF WORKS END-TO-END — operator approved from the SPA admin;
   token pickup + /profile + /libraries + /series (571 KB) all 200 okhttp
   from the box. Data pipeline healthy.
3. BLACK-SCREEN RENDER — two stacked defects, fully diagnosed:
   a. NO androidx.tv.material3.MaterialTheme wrapper anywhere → all
      tv.material3.Text renders black-on-black (invisible titles/hints/code).
      Buttons showed only as filled containers — the "dead buttons" report.
   b. ARTWORK UNRESOLVABLE — server artwork field = relative authed
      /api/v1/art/object/<token> (art.go:53 artObjectPath) or raw remote URL;
      app feeds raw into Coil AsyncImage: no base prepend, no Bearer header.
   AMENDMENT 5.13 GREEN (commit 806c1e9, verify rc 0 — MaterialTheme once
   at root MainActivity.kt:43; pure resolveArtworkUrl resolver + ArtworkImage
   leaf with Bearer header only on own-server fetches; 4 JVM tests).
   REVIEWER NOTE (disclosed deviation): coder touched AppViewModel.kt
   (+9 lines, additive read-only `val serverAddress` accessor :80) outside
   the named scope list — the pinned design decision required session facts
   at render time but no public seam existed; alternatives (CompositionLocal,
   Api.kt exposure) judged worse altitude. Flag for GATE 2 alongside the
   7.1 cosmetic Dtos note + Q4 waiver.
4. SCOPE AMENDMENT DIRECTED BY OPERATOR: TV browse must mirror SPA logic —
   collections screen (all collections + counts), FAST collection-change
   menu (D-pad Left rail mapping), per-collection grids. Planner QUEUED
   behind 5.13 (tasks.md single-writer). Scope line set by session, user
   notified: IN = collections+switcher+per-collection grids; DEFERRED =
   home rails, search, facets (SPA-scale, follow-ups).

Current app defect: BrowseFlow.enter() locks onto libraries.first() — no
collection switching exists at all (gap the amendment kills).

COLLECTIONS AMENDMENT (operator-directed scope expansion, SPA parity):
planner authored 5.14/5.15/5.16 + spec delta retitle ("Browse shows all
collections and is field-driven") + 3 scenarios; validate strict rc 0;
register ok (29 tasks); design.md AC-9 trace row updated by session.
GREEN SO FAR: 5.14 df178f1 (LibraryFilter RETIRED, all served collections,
moduleLabel law, selectLibrary swap w/ revert-on-failure, loadSummaries
best-effort rail-only — enter() request sequence byte-identical, fixtures
byte-valid; 17 tests green, 2 test-side red rounds journaled); 5.15
1db97ec (CollectionsRail AnimatedVisibility over grid left edge, LEFT-edge
arrow = open trigger, BackHandler first link, rail modal — Right consumed
no-op, focus re-lands on parked card on close, RailLawTest 3 tests green;
two disclosed law-detail calls: rail-closes-on-failed-select, modal-Right).
IN FLIGHT: 5.16 @wf-qa (collections wire joint, full-shape fixtures,
HALT-on-real-defect rule). AFTER IT: consolidated surveyor pass over the
whole amendment cycle (5.12/5.13/5.14-16), then APK 0.1.0-t1 → deploy →
operator reinstall-over → live retest + T0.
REVIEWER NOTES ACCUMULATED FOR GATE 2: Q4 keystore waiver; 7.1 cosmetic
Dtos.kt doc note; 5.13's disclosed AppViewModel.serverAddress accessor
(+9 additive lines); 5.15's two law-detail calls (rail modal Right no-op;
rail closes on failed select).
