# Handoff — wf-surveyor → wf-reviewer (tv-style-parity)

Integration survey of the AUTHORED plan (pre-GATE-1), since AMENDED: GATE 1 closed 2026-11-26 with every recommended answer ADOPTED (Q13 as canary) and the planner landed the amendments — the confirmation sweep re-verified each landing at the same HEAD `01fe9a4` (change-folder edits are doc-only; zero source delta) and recorded the resolutions in `integration.md` §6. Read-only audit; grounding is live source at worktree HEAD `01fe9a4` (= proposal's baseline `e420ebc` + one Go-only itest commit, zero Kotlin delta). The wf source map carries zero Kotlin SYMBOL grounding (python-graph backend; the sweep-time rebuilt map lists 102 `.kt` file entries at the symbol-less floor — `symbols=0`, `wf index query def browseFocusTarget` → not in map) — every node below was grounded by direct live-source reads, cited `file:line`.

## What I audited

proposal.md, design.md, tasks.md (20 tasks, groups 16–23), tasks/17.1.md, tasks/19.1.md, specs/android-tv-client/spec.md — against `android/src/main/java/tv/mellifera/` at HEAD.

## Verdicts

**Wiring coverage — holds with one blocking exception.** Every cited line landed EXACT (26 citations verified: BrowseScreen :89/:171/:196-212/:260-275/:330/:426/:449/:487/:705/:787/:894/:1028/:1093/:1165/:1244-1333/:1273-1293/:1289/:1368; HomeRows :110/:138/:211/:212/:214/:328/:380/:407; AppViewModel :233/:240; HomeFlow :86/:87; ItemCards :98; PhotoViewer :180; PlayerScreen :304-362 with 2dp seek at :323/:331; RailRow :1028; SeriesHeroView :1165; RAIL_PANEL_WIDTH :28; SessionStore KEY_TOKEN/KEY_ADDRESS :26-27). The 68-site TYPE_ census is exact: BrowseScreen 26 + HomeRows 9 + PhotoViewer 1 + FallbackArtwork 1 (= 16.2's 37) + PlayerScreen 18 + PairingScreen 11 + SettingsSection 2 (= 16.3's 31); no `fontSize = TYPE_` exists in any other file, and non-fontSize TYPE_ uses are imports/comments only. The 16.1→16.3 privatization order compiles: constants stay public through 16.2, the only test-side consumer (TypeScaleTest :17-31) is rewritten by 16.1, and the post-16.3 grep + gradle compile are the belt-and-braces guard. Composition-local scope is sound: App.kt's root provider (:65) already wraps all screens + PlayerOverlay; a LocalUiScale/LocalGridPrefs provider landed there covers every named read.

**THE EXCEPTION (Q8, HIGH):** 17.1 retires `RAIL_PANEL_WIDTH` while its call-site law says "NONE in this task", but the constant's only call site — BrowseScreen :903 `.width(RAIL_PANEL_WIDTH)`, the CollectionsRail panel — is outside 17.2–17.5's grids/home scope. As written, 17.1's own verify duty is guaranteed red (compile) until 22.2. Recommend folding the one-line :903 (+ :82 import) rewire into 17.1, or deferring the constant's deletion to 22.2.

**QA seam coverage — holds with two named gaps.** Five @qa joints present with named tests; all named test classes exist today except NEW SettingsOverlayTest (created by 18.2). Gaps: the 68 mechanical token→getter swaps have no automated pin (Q13 — control is @audit review + post-green walk; recommend explicit waive or a per-token canary); UiPrefs's persist-through leg (setter → SessionStore write) is not explicitly pinned (Q14 — recommend AppSmokeTest asserts both legs). "Live re-tile while open" and the rail-open offset are composition-tier facts verified by the post-green walk — consistent with the plan's declared tier split, not a gap.

**Complexity / blast radius — three hidden-scope findings.** CardView has exactly ONE caller (CardGrid :657) feeding all three grids, so 17.2's caption rework flows to tv/photo unless branched there; EpisodeRow's sole caller is SeriesPage :1128 (retirement is clean). Hidden scope: 17.2's Season-chip/★-score caption law requires DisplayCard/toCard extensions in SeriesGrid.kt (served fields exist: Dtos.kt :115 score / :313 season) — SeriesGrid.kt is not in 17.2's named surface (Q11); 19.1's first-unwatched initial focus belongs in nav/InitialFocus.kt (`browseFocusTarget` → `FocusTarget.EpisodeRow`, pinned by FocusLawTest::every_screen_resolves_initial_focus — its own KDoc says law and wiring "cannot drift apart") but 19.1 never names that file (Q10); 18.2's SettingsSection deletion dissolves the chips `aboveFocusable` premise (BrowseScreen :127 feeds `telemetry.isOpen` → :266 → `chipsRowConsumesUp` :126 `Up && !aboveFocusable` — gate-on UP crosses natively to the settings row today; after deletion the law targets a phantom) (Q9).

**Surface cross-check (Q1/Q7):** `wf index surface` at the parent tree is NOT empty — it lists ~230 PYTHON distributions from the elected interpreter environment (provenance: tools/wf/index.py); the worktree map (auto-built, CURRENT @ 01fe9a4) has zero .kt files and zero JVM/Android signal. The planner's "0 distributions / files_parsed: 0" is contradicted at the parent, but the operative conclusion HOLDS: nothing in the surface speaks to androidx/Coil/SharedPreferences. Dependency claims verified live: Coil 2.7.0 (build.gradle.kts :125), SharedPreferences (SessionStore backing :54), blur is compose-ui. Q1's recommendation confirmed; its evidence sentence should be corrected.

## Numbered questions for GATE 1

Planner Q1–Q6: Q1 CONFIRM recommendation / evidence corrected (Q7); Q2 CONFIRM (spec delta already carries the rail-row exception; current ring = the dpr-clamped formula = 1dp at the box); Q3 CONFIRM (zero graphicsLayer/scale under ui/+browse/, grep-verified live); Q4 CONFIRM (load() clears error at start, HomeFlow :87 — dedicated resumeRefetch is sound); Q5 CONFIRM (in-file precedent: RAIL_PANEL_WIDTH KDoc records walk-amend-0.3.13 proving 112dp); Q6 CONFIRM (tv branch is already a CardGrid(STILL_ASPECT) consumer — no special case needed).

Surveyor Q7–Q15 (each with a recommended answer in integration.md): Q7 surface evidence contradiction (LOW); Q8 17.1 orphaned rail-width call site (HIGH); Q9 aboveFocusable phantom premise after 18.2 (MEDIUM); Q10 19.1's unnamed initial-focus law home (MEDIUM-HIGH); Q11 17.2's unnamed mapping scope (MEDIUM); Q12 20.1 status-line order contradicts the live formatter + PhotoFlowTest pins (:166-170 pin capture-then-dims; 20.1's example shows dims-then-date) and "gains the capture date" is already live behavior (PhotoViewer :94-97) (LOW-MEDIUM); Q13 getter-swap correctness control (LOW); Q14 UiPrefs persist-through leg (LOW); Q15 LocalGridPrefs declaration home unspecified — the Interfaces block names only LocalUiScale while 17.1/17.2/17.4/19.1 read LocalGridPrefs (LOW).

Full graph, evidence, and per-question recommendations: `openspec/changes/tv-style-parity/integration.md` (same folder).

## Resolutions (GATE 1 closed 2026-11-26 — every recommended answer ADOPTED; landings verified by the sweep at HEAD `01fe9a4`)

- Q1 → zero new Gradle deps (evidence re-worded per Q7) — proposal.md :104-112
- Q2 → rail-scoped 2dp type-pastel ring exception; slate law stands elsewhere — tasks.md :72 (22.2)
- Q3 → stale 1.1-scale clause retired; focused rail name stays at token size — tasks.md :72
- Q4 → dedicated `resumeRefetch()` keeps rows+error in flight; `load()` untouched — tasks.md :77 (23.1)
- Q5 → `railPanelWidth(mode)` 96/96/112dp now; walk amends Крупный if the 8-char floor fails — design.md :242; tasks.md :26; tasks/17.1.md :75-77
- Q6 → no tv special case; `gridPlan` decides, outputs pinned — tasks.md :33; tasks/17.1.md :44-45, :65-66
- Q7 → Q1 evidence re-worded (zero JVM/Android signal; Kotlin outside every indexed backend) — proposal.md :104-107
- Q8 → the ONE rail call site rewires in 17.1 (grids NONE); RailLawTest rides the duty as the rail-site guard — tasks.md :26+ :28; tasks/17.1.md :79-87, :97-98
- Q9 → 18.2 retires the phantom feed (feeds `false` or the chain retires; `chipsRowConsumesUp` + FocusLawTest pure pins untouched) — tasks.md :43
- Q10 → initial-focus law home named: nav/InitialFocus.kt `browseFocusTarget` (`FocusTarget.EpisodeRow` :53 → retained/renamed EpisodeGrid); FocusLawTest pin updates; duty gains FocusLawTest — tasks.md :51+ :54; tasks/19.1.md :49-53, :67-69, :79-81
- Q11 → SeriesGrid.kt joins 17.2 (DisplayCard `season`+`score` passthrough, Dtos.kt :115/:313; SeriesGridTest mapping pins) — tasks.md :29+ :30
- Q12 → dims/date order settles against the SPA source at apply time; "the capture date is already served there" — proposal.md :43-46; tasks.md :60
- Q13 → SEVEN per-token canaries in the TypeScaleTest rewrite (same class, stub-provided LocalUiScale, non-default mode; CODE mode-independent; `qa:` unchanged) — tasks.md :11-12
- Q14 → persist-through leg pinned in AppSmokeTest (`setGridColumns(5)` → store round-trips `grid_columns=5`; no new class) — tasks.md :40
- Q15 → `GridPrefs`/`LocalGridPrefs` beside LocalUiScale (`Int?` null = Авто); typed SessionStore accessors; new KEY_* stay PRIVATE — design.md :221-222, :244-252

Sweep residuals (non-blocking, the human decides): R1 — tasks/19.1.md Verify (:85-88) omits `--tests "tv.mellifera.browse.SeriesGridTest"` which the tasks.md duty (:54) and the contract's own Tests section (:78) carry; the register floor (tasks.md) is complete, so this is contract-prose sync only. R2 — BrowseScreen.kt :889 KDoc still cites `[RAIL_PANEL_WIDTH]` (dangles after 17.1 deletes it — not a compile error; the constant's only other references are ui/LayoutParityTest :16/:22 pins inside the test 17.1 itself rewrites).

## What the gate must re-check (remaining after adoption)

1. Q8/Q10/Q11 file scopes are now IN-TASK (17.1's Call-site law, 19.1's Grid-law/Call-site bullets, 17.2's SeriesGrid.kt sentence) — the reviewer still CONFIRMS each landing at the gate (runner HALT risk is retired; the contracts name the files and tests).
2. Re-run the TYPE_ census after 16.3 (`grep -rn "fontSize = TYPE_" android/src/main/java/` must be empty AND gradle must compile — a stale TYPE_ import in any swept file or in TypeScaleTest fails the build, which is the designed guard).
3. Q12: settle the photo status order against the SPA source when 20.1 lands (order settles at apply per the adopted ruling); PhotoFlowTest's pins re-pin whichever order wins — the duty already runs it.
4. Q13 canaries are now ADOPTED control: 16.1's TypeScaleTest rewrite must carry the SEVEN per-token canary assertions at a non-default mode, so a wrong token→getter swap at any of the 68 sweep sites fails a named test — reviewer confirms the assertions exist.
5. Q14 persist-through leg is now ADOPTED: 18.1's AppSmokeTest prose pins `setGridColumns(5)` → store round-trips `grid_columns=5` — reviewer confirms the assertion.
6. R1/R2 residuals (§ Resolutions above) are open for the human's amend-or-waive — neither blocks register or any duty.
