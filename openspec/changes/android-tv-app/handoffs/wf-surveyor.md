# wf-surveyor → wf-reviewer — android-tv-app integration audit (round 3, 2026-11-12)

Belief record, latest-wins (supersedes the round-2 record of the same date; rounds 1–2 remain authoritative
in `openspec/changes/android-tv-app/integration.md` §1–6). The round-3 evidence is integration.md §7 (the
live-box amendment-cycle re-audit, per-edge grounding) + the live tree at 846d0e1. Re-ground at GATE 2 per
the surveyor section of the loop.

## What round 3 audited

The live-box amendment cycle landed AFTER the round-2 empty frontier: 5.12 (pairing entry UX, 999f83a),
5.13 (render visibility, 806c1e9), 5.14–5.16 (collections: state/flow df178f1, rail UI 1db97ec, wire joint
846d0e1 incl. the session's hang-fix). The plan-artifact amendments (tasks.md 5.12–5.16 entries, design
AC-9 row, spec delta retitle + scenarios, session.md) are UNCOMMITTED tree edits; `openspec validate
android-tv-app --strict` re-run rc 0 on them at audit time. Register: 29 derived tasks (23 + 5 amendments
+ git-check), all five amendments receipted green (27/29 total).

## Round-3 verdict — all seven dispatched edges (full grounding: integration.md §7b)

1. **Theme wrap — WIRED.** One `MaterialTheme` at the composition root (MainActivity.kt:43); no per-screen
   patches; zero `Color.Black` / dark-on-dark text in main sources — chip/scrim/rail backgrounds all carry
   white/accent/light text.
2. **Artwork resolution — WIRED end-to-end.** serverBase (AppViewModel.kt:80) + token (BrowseScreen.kt:103)
   thread through SeriesGrid/SeriesPage → CardView/EpisodeRow → `resolveArtworkUrl` (null law intact both
   ends — absent renders no block) → `ArtworkImage` (Bearer ONLY on own-server fetches; CDN anonymous).
   Coil's single image site in the module.
3. **Rail↔flow↔net — WIRED; the BackHandler claim is CORRECT, not inverted.** androidx.activity's
   dispatcher invokes enabled callbacks in reverse addition order → the composed-AFTER rail handler
   (BrowseScreen.kt:98) wins over the series handler (:94). Trigger = grid left-edge LEFT (moveInGrid
   returns cursor at column 0, KeyRouting.kt:82 → consumed, opens rail); grid-top UP and rail-top UP stay
   unconsumed (cross natively); modal law verified (`railOpen && selected == null` :134; grid holds no
   focus while open :184; Right consumed no-op :272; closeRail touches only railOpen, parked cursor
   re-lands via the grid's LaunchedEffect).
4. **Orphans — CLEAN.** LibraryFilter retired with ZERO remaining readers (grep — only the joint test's
   comment mentions the deletion, as regression-proof intent); moduleLabel / resolveArtworkUrl /
   ArtworkRequest / serverAddress all carry live consumers.
5. **Wire joints — WIRED.** 15+ json tags verified against internal/api/handlers.go (libraryDTO :75,
   ModulePresentation :99, librarySummaryResponse :154, seriesDTO :220 — the "" zero-state and omitempty
   legs exercised both ways in the fixtures); routes router.go:213/:232 + `Query().Get("library")`
   handlers.go:1371 match the client (Api.kt:44–49); request-sequence claims asserted by the green tests
   (enter = 2, openRail = +1 per library, selectLibrary = +1). Decoder proven under the FULL shape
   (`ignoreUnknownKeys = true`, Api.kt:120).
6. **Blast radius — CLEAN.** Every `BrowseState(` site uses named args (5 in BrowseFlow, 3 in
   FocusLawTest) — the 5.14/5.15 field growth broke nothing; fixture consumers assert current truth
   (EpisodesTest's kept-modules assertion flipped to the served pair; RefreshTest/BackRestoration on the
   amended fixtures); ALL FIVE commits touch only `android/` — zero Go source edits.
7. **Hang-fix — CONTAINED and COVERED.** 846d0e1 = one file (+232, the joint itself — the whole joint
   committed post-fix). The fix = the bearer assertion pops the last request ONCE into `last`
   (:187–189, self-documenting comment :182–183) instead of a blocking fifth `takeRequest()`, closed by
   non-blocking `requestCount == 4`. Full-shape coverage intact: 4-path sequence + library_id echo-keyed
   merge with both counts (incl. the "" zero-state row), the all-collections regression proof; test 2:
   3-path + full seriesDTO omitempty legs; both qa names match the pinned list.

## Question frontier (round 3): TWO, both LOW — the operator rules amend or waive

- **Q5 (LOW — uniform qa: path-prefix drift, pre-existing):** every app/joint qa: entry cites
  `tests/android/src/test/java/...`; the real tree has no `tests/` dir — files live at
  `android/src/test/java/...`. Uniform since propose time (5.1/5.3–5.11/7.1 carry it too); no verb
  dereferences the path (duties match by gradle `--tests` class filter — greens are real); the register's
  drift gate makes amending qa: on receipted tasks expensive (`--reason` covers title/prose only).
  **Recommended: WAIVE** as documented convention (integration.md §7d + this record carry the real layout).
- **Q6 (LOW — two comment-only anchors in the 5.16 joint header):** cited ModulePresentation :97 → actual
  handlers.go:99; seriesDTO :229 → actual :220 (libraryDTO :75 and librarySummaryResponse :154 exact).
  Comment-only, fixture shapes verified correct. **Recommended: FIX** (two-line comment commit before
  archive) or waive if the tree must stay frozen.

## Standing verdicts (rounds 1–2, held)

- Round-1 graph (23 nodes / 8 groups / 24 edges) and axes — wiring COVERED, QA seams COVERED, blast radius
  CLEAN, duty honesty CLEAN — unchanged by the cycle; §7c re-verdicts the axes for the amendment surface.
- Q1–Q3 CLOSED (round 2); **Q4 WAIVED to reviewer inspection** — still owed at GATE 2: read tasks/5.1.md's
  signing-law audit note and inspect the assembleRelease signing block by audit.
- Standing disclosures for GATE 2: the 7.1 cosmetic Dtos.kt doc note; 5.13's AppViewModel.serverAddress
  accessor (+9 lines additive read-only, session-documented — round 3 verified wired, one consumer).
- Residual note (no action): the D8 sketch omits `code` from the field union; the per-kind lists remain the
  authority.
- Deferred set (home rails, search, facets) lives in the spec delta Purpose — left there per the dispatch.

## GATE-2 pointers for the reviewer (round 3 additions; carry-forwards at the end)

- **GATE STATE: 27/29.** RED = 1.3 (operator T0 on-device evidence, audit:true — expected) + 5.10
  (MediaSession, consults 1.3's T0-RESULT). The gate cannot close on them; the operator path is staged in
  session.md.
- **Stale git-check:** its green receipt (01:28) predates the amendment cycle; five uncommitted openspec
  edits sit in the tree, and the cmd-match law de-greens the receipt on the next status run. Commit the
  change-folder artifacts before the gate.
- The five amendment duties are gradle class filters + two structural greps (5.13's
  MaterialTheme/Authorization; 5.15's BrowseScreen 'Rail') — both greps hold in the current tree
  (MainActivity.kt:43; BrowseScreen.kt:138 `CollectionsRail`). Note 5.13's
  `grep -q MaterialTheme App.kt MainActivity.kt` passes via ANY-file match — consistent with the task's
  "either location" authoring.
- When re-grounding 5.16's fixtures use the corrected anchors (:75/:99/:154/:220) if Q6 is fixed; the
  shapes themselves are verified correct either way.
- Carry-forward pointers still live from round 2: the /apk filename literal across 5.2 (producer) / 2.1
  (glob) / 6.2 (label parse) — three tasks share one string; the three always-on registrations
  (internal/web/apk.go, internal/api/debug_events.go beside router.go:261, the `tv.mellifera.joint.*`
  package); the 3.2/5.11/7.1(d) kind-enumeration byte-check; tasks/1.3.md's four T0-RESULT sections as the
  audit:true payload (a media-keys miss means 5.10 implements the PlaybackService fallback — check it did).
