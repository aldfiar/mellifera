# Integration audit — amendment groups 9–14 (surveyor, 2026-11-17)

Scope: the amendment's 14 new tasks (groups 9–14 in tasks.md, all registered RED, no
receipts) audited as a planned integration graph against the live tree @ b411028 (worktree
`android-tv-app`, index CURRENT). The audit the amendment implements:
`/Users/aldfiar/projects/go/mellifera/.tmp/android-tv-audit-2026-11-17.md`. Read-only: this
file and the wf handoff record are the only writes. The surveyor recommends, never decides.

## The planned integration graph

### Nodes (33 — grounded; every symbol verified this session)

New (12):

| Node | Task | Grounding |
|---|---|---|
| `ui/Colors.kt` (new file): `tvAccent` 0xFF4C8DFF, `chipColor` 0xFF2A2F3A | 13.1 | ui/ has App.kt, Focus.kt, SettingsSection.kt, TypeScale.kt — no Colors.kt yet |
| `railBorder` 0xFF1E293B, `railMuted` 0xFF94A3B8 (added to Colors.kt) | 14.1 | 14.1 contract; DAG 13.1 → 14.1 |
| `net/Dtos.kt` `VoiceoverDto(index, label)`; `PlaybackDescriptor.voiceovers: List<VoiceoverDto>` | 9.2 | today `List<JsonElement>` at Dtos.kt:198; server serves `{index, label}` (internal/stream/describe.go:280–296) |
| `net/Dtos.kt` `FacetValueDto/FacetDto/FacetsResponse` | 10.1 | mirror internal/api/facets.go (facetValueDTO/facetDTO/facetsResponse, Facets non-nil) |
| `net/FacetsTest` (new test class) | 10.1 | absent from android/src/test today (inventory checked) |
| `DpadKey.AudioTrack` (enum member) | 9.2 | DpadKey = {Left,Right,Up,Down,Ok,Back,PlayPause} at KeyRouting.kt:9 |
| `PlayerKeyAction.CycleVoiceover` | 9.2 | sealed interface at KeyRouting.kt:59–69 (5 members) |
| `PlayerOrchestration.cycleVoiceover()` + session pick/voiceovers carriers | 9.2 | selectVoiceover seam at PlayerOrchestration.kt:209–213 |
| `homeErrorLine(home: HomeState)` pure law | 11.1 | HomeState.error set at HomeFlow.kt:127/:132, unread by any composable (verified) |
| `FacetChipsRow` composable | 10.2 | absent from BrowseScreen.kt today (rg 0) |
| `WatchedCornerMark` composable | 12.1 | absent today (rg 0); ✓ sits in the text stack at BrowseScreen.kt:1082/:1157 |
| `CastRow` composable | 12.4 | absent today (rg's only hit is a doc-comment mention, PlayerInfo.kt:35 — see Q2) |
| `RAIL_PANEL_WIDTH = 112.dp` in browse/LayoutParity.kt | 14.1 | LayoutParity.kt holds fraction/aspects/columns; no rail width constant exists |

Touched (21):

| Node | Task | Grounding |
|---|---|---|
| `state/Playback.kt` `reduce()` — +ExitRequested→Idle rows (Describing/Playing/Polling/Dead) | 9.1 | identity rows at :214/:233/:251/:269; Failed's row (the named shape) at :282–284; Active's row :262–265 carries FlushProgress+EndPlayer (the new rows correctly carry emptyList — no session ever launched) |
| `PlaybackReduceTest` — additive rows | 9.1 | ZERO ExitRequested references in the whole test tree — purely additive, no pin breaks |
| `KeyMap.toDpadKey` — +KEYCODE_MEDIA_AUDIO_TRACK | 9.2 | KeyMap.kt:10–19 (real Android keycode 222, box is Android 14) |
| `KeyRouting.routePlayerKey` — +AudioTrack branch | 9.2 | KeyRouting.kt:33–46; the `when` has NO else → the new enum member compile-forces this exact edit (inside 9.2's file set) |
| `PlayerScreen.onAction` — +CycleVoiceover branch | 9.2 | PlayerScreen.kt:110–142; sealed-exhaustive when, Kotlin 2.0.21 (compile-forced, inside 9.2's set); AudioTrack follows the Seek shape (no early return → re-arms the 5.5 hide timer) |
| `PlayerOrchestration` session carriers | 9.2 | `_skipRanges` sibling pattern at :114–123 (set at describe legs :397, cleared on departure :326–330) |
| `Api.facets()` + `Api.series(libraryId, genre?, kind?, status?)` | 10.1 | Api.kt has no facets call; series() at :49; null Query params stay off the wire (the items() precedent, Api.kt:51–65); server params real: handlers.go:1351–1375 (genre/kind/status, unknown value → 200 empty) |
| `BrowseState` +facets/facetSelection; serial-grid refetch sites | 10.1 | BrowseFlow.kt:63+; series fetch sites :298 (selectLibrary), :689/:697 |
| BrowseScreen serial branch — lane in EVERY state | 10.2 | branch at :367–394 is exactly error→loading→CardGrid (verified); FolderChipsRow shell :621, FolderChip :686, chips BackHandler :132, chipsRowConsumesUp law (KeyRouting.kt:119) |
| HomeRows — error line + eyebrow/episode-title/library slots | 11.1/11.3 | early return at HomeRows.kt:111 |
| `SeriesHero.factsOf` private→internal | 11.2 | private at SeriesHero.kt:68 |
| `SeriesDto.toCard()` meta = factsOf projection | 11.2 | meta=null hardcoded at SeriesGrid.kt:77; SeriesGridTest:32 pins `assertNull(bareCard.meta)` on a metadata-less fixture → survives (null-when-absent) |
| `HomeCards` mappers + carriers | 11.3 | ResumeCardModel/AnchorCardModel at HomeCards.kt:20–63 lack all three; the fields ARE served: ContinueRow.seriesDisplayName/libraryName (Dtos.kt:260–262 = home.go:65/:67), current.episodeTitle (Dtos.kt:281 = home.go:98) |
| BrowseScreen maxLines ×3 title sites | 11.4 | today 1 hit (:973); duty `-ge 3` is a real delta detector |
| ✓ sites → WatchedCornerMark | 12.1 | BrowseScreen.kt:1082/:1157 |
| PhotoViewer rulings + status line | 12.2 | routeViewerKey :82–90 (`Up, Down, Ok -> true` inert at :87); closePhoto BrowseFlow.kt:479; photoIndex BrowseFlow.kt:141; captureDate ItemCards.kt:98 (internal, same package) |
| SeriesPage entry actuator → focusUntilAttached | 12.3 | one-shot requestFocusSafely at BrowseScreen.kt:899; idiom defined :809 (FOCUS_RETRY_FRAMES=60 :821) |
| castLine retired; per-entry cast rows | 12.4 | castLine at PlayerInfo.kt:97, called at PlayerScreen.kt:359; **PlayerInfoTest:169 pins castLine() — hidden scope, Q2** |
| Token locals die → Colors.kt imports | 13.1 | dupes verified: Focus.kt:23 (public), BrowseScreen.kt:100 (`accentColor`) + :101, SettingsSection.kt:21, PlayerScreen.kt:55; AppThemeTest pins AppCanvas only (:17/:25) — untouched by the move |
| Rail panel restyle; railColor/railWidth die | 14.1 | BrowseScreen.kt:107–108 (railWidth=360.dp), used :742–743; stale 360dp comment also at :181 |
| Tests: KeyRoutingTest/PlayerOrchestrationTest/VoiceoverSelectionTest/HomeFlowTest/HomeCardsTest/SeriesGridTest/SeriesHeroTest/PhotoFlowTest/AppThemeTest/RailLawTest/LayoutParityTest | 9–14 | all 12 named classes EXIST (inventory checked); LayoutParityTest has NO rail pin (4 tests: fraction/counts/track-math/aspects) → 14.1 adds, edits none; RailLawTest pins FLOW only (8 tests, no color/width) → 14.1's presentation-only claim confirmed at the pin level |

### Edges (20 functional + 13 duty→test seams)

1. Remote KeyEvent(222) → `toDpadKey` → `DpadKey.AudioTrack` (9.2)
2. `routePlayerKey(AudioTrack)` → `CycleVoiceover`, unconditional in controlsShown (transport-class like Seek, KeyRouting.kt:38–39 precedent) (9.2)
3. `onAction(CycleVoiceover)` → `playback.cycleVoiceover()` (9.2)
4. `cycleVoiceover` → (pick+1) mod n → existing `selectVoiceover(next)` (9.2)
5. `selectVoiceover` → `voiceoverTrackIndex(plan, pick)` (VoiceoverSelection.kt:25–29, k+1 unchanged) → `PlayerController.selectVoiceover` (:57) → `Media3Controller` (:142) — **end-to-end closed**
6. Server voiceovers `{index,label}` (describe.go:280) → `VoiceoverDto` → `renditionPlanOf` (.size survives the type change — the only reader, Playback.kt:99) + session carrier → «Озвучка» info line (9.2)
7. GET /libraries/{id}/facets (router.go:217) → `Api.facets()` → `BrowseState.facets` (10.1)
8. `facetSelection` (PARAM_OF genres/kind/status — keys verified server-side, internal/browse/facets.go:23–25) → `Api.series(...)` params → conjunct grid refetch; unknown value → 200 empty (10.1) — **end-to-end closed**
9. `FacetChipsRow` (reuses FolderChipsRow shell + chips BackHandler ordering + chipsRowConsumesUp) → BrowseFlow toggle → refetch (10.2)
10. `HomeState.error` → `homeErrorLine` → HomeRows render before the :111 early return (11.1)
11. Served row fields → HomeCards carriers → HomeRows type slots (11.3) — **end-to-end closed** (all three fields on the wire)
12. `SeriesDto.metadata` → promoted `factsOf` → `toCard().meta` → CardView's existing meta slot (11.2)
13. ✓ sites → `WatchedCornerMark` over art block (12.1)
14. PhotoViewer Ok → `closePhoto` (nonce re-lands the parked tile); Up/Down stay consumed; status line ← photoIndex + `captureDate` (12.2)
15. `focusUntilAttached` (shared idiom) → series-page entry actuator (12.3)
16. `MetadataCastEntry.photoUrl` (Dtos.kt:103 = api.ts:204) → 24dp tile branch; plain rows otherwise → per-entry cast (12.4)
17. `Colors.kt` → import sites at Focus.kt / SettingsSection.kt / PlayerScreen.kt / BrowseScreen.kt; locals die (13.1)
18. `RAIL_PANEL_WIDTH` → rail panel (360dp local retires) (14.1)
19. `railBorder`/`railMuted` → panel end-edge border + row anatomy (dot = `typeAccent`, BrowseFlow.kt:37, the D3 map) (14.1)
20. Rail flow laws untouched: RailLawTest's 8 flow pins (opens/closes/walks/select/swap/restore/emits) green through 14.1 (the presentation-only claim)

Duty→test seams (13): 9.1→PlaybackReduceTest; 9.2→KeyRoutingTest+PlayerOrchestrationTest+VoiceoverSelectionTest; 10.1→FacetsTest (new); 11.1→HomeFlowTest; 11.2→SeriesGridTest+SeriesHeroTest; 11.3→HomeCardsTest; 12.2→PhotoFlowTest; 13.1→AppThemeTest; 14.1→RailLawTest+LayoutParityTest. Structural-pass duties (compile+grep, reviewer-read at GATE 2): 10.2, 11.4, 12.1, 12.3, 12.4.

## Check verdicts

**Wiring coverage: PASS — no orphan nodes.** Every new node carries an implemented edge into
the live system (the table above). The two wire additions close end-to-end with both ends
verified: facets (server route + handler params + served keys ↔ PARAM_OF ↔ new DTOs ↔ lane ↔
refetch) and voiceover (server `{index,label}` ↔ DTO ↔ key map ↔ route ↔ onAction ↔ cycle ↔
selectVoiceover ↔ controller impl). 11.3's three lines are all served today — no wire gap.

**QA seam coverage: PARTIAL.** JVM-pinned seams are covered by named classes in duties
(existence verified). Structural-pass duties are honestly labeled. Four adequacy defects:
12.3's grep is vacuous (passes on the unmodified tree — Q3); 12.4's CastRow grep matches a
doc comment today and its castLine retirement breaks a test its duty never compiles (Q2);
12.2's "Ok-now-closes routing" pin is unreachable from JVM as the code stands (Q5); no
amendment surface has an on-device leg anywhere in the plan (Q6).

**Complexity / blast radius: PASS with two caught instances.** Shared-file heat is real but
DAG-ordered: BrowseScreen.kt × 6 tasks (10.2/11.4/12.1/12.3/13.1/14.1), PlayerScreen.kt × 3
(9.2/12.4/13.1), Dtos.kt × 2, BrowseFlow.kt × 2, Colors.kt × 2 (13.1 → 14.1). The enum
extensions' compile-forced edits both land inside 9.2's named files (verified: no other
exhaustive `when` over DpadKey or PlayerKeyAction exists — walkers and routeViewerKey carry
else-branches). One hidden-scope instance: PlayerInfoTest (Q2). One late-failure instance:
the same break surfaces red under 13.1's duty (the first task after 12.4 whose gradle run
compiles the test source set), misattributed (Q2).

Dispatch-directed law-collision checks (all grounded):
- **9.1 vs the reduce truth table: NO collision.** Zero ExitRequested references in the
  entire test tree; the new rows are purely additive. The emptyList shape matches Failed's
  row and is coherent — Starting/Dead never launched a player, so no FlushProgress/EndPlayer
  is owed.
- **1.3 vs 12.1: no test collision** (1.3's pins are model-level, null→no block). The
  collision is against the SPEC DELTA's placement text — Q1.
- **5.15 rail flow vs 14.1: clean.** RailLawTest pins flow only; railColor/railWidth have no
  test references.
- **8.16 vs 14.1: conforming with a 0.5px note.** .clink 12.5px ÷ 2 = 6.25 → TYPE_META 6sp
  (the constant law wins; renders 12px vs the SPA's 12.5px).
- **11.3 vs entity-grain home rows: closed** — the served row already carries all three lines.
- **10.1 vs the served facets: closed** — genre/kind/status params real on /series
  (handlers.go:1351+), facet keys genres/kind/status real (browse/facets.go:23–25),
  unknown→empty honest.
- **13.1 vs import sites: exact** — 2× tvAccent (Focus.kt:23 public, BrowseScreen.kt:100
  `accentColor`), 3× chipColor (SettingsSection.kt:21, PlayerScreen.kt:55, BrowseScreen.kt:101);
  the duty's hex grep matches each site; AppThemeTest's pins are AppCanvas-only and survive.

## Numbered questions (contradictions; recommended answers — the human decides)

**Q1 (HIGH — spec delta vs task 12.1).** The spec delta requirement "Card state-signal
scale on TV" pins the ✓ "in the type accent at meta-line scale **on the meta row**"; task
12.1 moves it to a **corner mark over the art** (top-end). The amendment added 4 scenarios
and none amends this requirement — a GATE 2 spec-vs-code read FAILs 12.1 as written. The
SPA's own shipped watched-signal law is "corner mark over the art + meta-row slot"
(audit P3-5), so the task, not the delta text, carries the parity intent.
*Recommendation:* amend the spec delta requirement/scenario to the watched-signal corner
placement (a planner edit to specs/android-tv-client/spec.md, which the amendment already
touches) before 12.1 applies; 1.3's green receipts are unaffected (model-level pins).

**Q2 (HIGH — 12.4 duty inadequate + hidden scope).** Retiring `castLine()` breaks
PlayerInfoTest:169, which pins it. 12.4's duty (`compileDebugKotlin` + rg over main/) never
compiles the test source set → 12.4 greens on a broken build; the compile error surfaces
one task later under 13.1's AppThemeTest run — a red the 13.1 runner cannot fix inside its
scope. PlayerInfoTest is also absent from 12.4's named files. Additionally 12.4's
`rg -q "CastRow"` already matches PlayerInfo.kt:35's doc comment today, so the
presence-check half of the duty passes without work.
*Recommendation:* name PlayerInfoTest in 12.4's prose/contract, replace the castLine pin
with a CastRow-model pin in-task, and strengthen the duty to run `--tests
tv.mellifera.playback.PlayerInfoTest` (which compiles the test set) — or anchor the CastRow
grep to `fun CastRow`. Tasks 9–14 are unreceipted, so the edit is a plain re-register, no
drift gate.

**Q3 (MED — 12.3 duty vacuous).** `rg -c "focusUntilAttached" BrowseScreen.kt` is **5
today** (4 call sites + the definition); the duty's `test "$c" -ge 2` passes on the
unmodified tree — a no-op implementation greens 12.3.
*Recommendation:* anchor the check to the series-page site (e.g. `-ge 6`, or a context grep
of the :899 actuator block).

**Q4 (MED — 9.2 contract vs the frozen machine).** The contract says "Rendition → the
served voiceover count **carried at plan build** (ground RenditionPlan.from's second arg)".
The second arg exists at the CALL (renditionPlanOf passes voiceovers.size) but is **dropped
for Rendition** — `Rendition` is a `data object` (Playback.kt:84), and RenditionPlanTest:39–40
pins it bare. The Active session's `PlaySession` carries no descriptor. Implementing
"carried" through RenditionPlan means editing state/Playback.kt + RenditionPlanTest —
outside 9.2's file list (Playback.kt is 9.1's).
*Recommendation:* the session-side carrier in PlayerOrchestration (the `_skipRanges`
sibling pattern: set from the descriptor at every describe leg, cleared on departure) — it
supplies n for BOTH plan shapes, the current-pick tracking, and the labels for the
«Озвучка» line, with state/Playback.kt untouched. Read "carried at plan build" as
"available at plan build", not "stored in the plan".

**Q5 (MED — 12.2's named pin unreachable).** "JVM-pinned in PhotoFlowTest (Ok-now-closes
routing…)" — the Ok routing lives in PhotoViewer.kt's private `routeViewerKey` inside a
@Composable; PhotoFlowTest pins BrowseFlow's openPhoto/movePhoto/closePhoto only. As the
code stands the named pin cannot exist.
*Recommendation:* lift the viewer key law into a pure function (the `chipsRowConsumesUp`
idiom) and pin that; otherwise scope the PhotoFlowTest claim to the status-line formatter +
the closePhoto law and leave the Ok branch to the reviewer's structural read.

**Q6 (MED — D10 evidence gap + a device fact unprobed).** D10: every surface task closes
with on-device evidence. None of the 14 amendment tasks carries a device leg, and 6.1's
walk inventory (tasks/6.1.md) predates the amendment: no legs for the facet lane, the
voiceover key, the corner mark, the photo rulings/status line, the cast rows, the 112dp
rail, or the home card lines. Separately, 9.2's chain starts at
KEYCODE_MEDIA_AUDIO_TRACK(222) — whether the box's remote even emits it is a device fact no
task probes (the android-tv-app T0 class: if the remote never sends 222, 9.2 ships dead).
6.1 is still RED, so its prose is editable.
*Recommendation:* extend 6.1's single-window script with amendment legs + one logcat/uiaudit
probe pressing the audio-track key during playback; re-register with `--reason` (prose-only
edit). Operator cost: one walk window.

**Q7 (LOW — 10.1 entry-path wiring unnamed).** The facets fetch/refetch law names
selectLibrary and the toggle, but the ENTRY serial body is loaded by `enter()` — as
written, the most common serial surface (the entry default body) would render an empty lane
shell until a rail switch re-selects the library.
*Recommendation:* the facets fetch rides every serial-grid load site — enter() alongside
selectLibrary (the series() fetch sites, BrowseFlow.kt:298/:689/:697); best-effort law
unchanged.

**Q8 (LOW — stale cross-references to the 360dp rail).** Task 8.2's prose and design D13
("the rail keeps its 360dp (§3.2, unchanged)") contradict amendment §B (112dp) unless read
through the amendment's precedence clause; BrowseScreen.kt:181's comment "(360dp,
unchanged)" goes stale after 14.1. Execution order is safe (8.2 green before 14.1 lands).
*Recommendation:* no plan change; when the change closes, D13/§3.2 carry a one-line pointer
to §B, and 14.1's reviewer-read may include the stale comment.

**Q9 (LOW — §A's P2/P3 laws have no delta scenarios).** The spec delta gained scenarios
only for 9.1/9.2/10.x; the 11.x/12.x behaviors (home.error renders, facts line, clamps,
corner mark, photo rulings) live only in design §A. GATE 2's spec-vs-code axis has no
anchor for them.
*Recommendation:* fold minimal scenarios into the existing requirements (home-mirror, card
state-signal, a viewer requirement) while spec.md is already open in this change — cheap
now, a docs pass later otherwise.

## Resolutions

All nine resolved by the operator (confirmed recommendations) and folded by the planner
amendment round, 2026-11-17 — re-validated strict + re-registered (14 groups / 48 tasks,
4 amends, `--reason` naming the surveyor-fold edits).

- **Q1 — RESOLVED (planner, spec delta edit).** The "Card state-signal scale on TV"
  requirement and its Watched-glyph scenario amended to the corner-mark-over-the-art
  placement (task 12.1's law, the SPA corner mark); WHEN/THEN shape and the #### heading
  law kept.
- **Q2 — RESOLVED (planner, tasks.md 12.4).** PlayerInfoTest named in 12.4's prose (the
  castLine() pin :169 replaced in-task by a CastRow-model pin); duty now runs the targeted
  `testDebugUnitTest --tests tv.mellifera.playback.PlayerInfoTest` (compiles the test set)
  and anchors the greps to declaration sites (`fun CastRow` present; castLine absent from
  main). Preferred targeted-test form taken per the surveyor.
- **Q3 — RESOLVED (planner, tasks.md 12.3).** The vacuous `-ge 2` count retired; the duty
  anchors to the series-page site — a context grep on the unique `focusIndex == index`
  actuator line asserting `focusUntilAttached` appears there (verified unique, BrowseScreen
  :899; 5 hits on the unmodified tree today). Cheap and honest: no-op impl now reds.
- **Q4 — RESOLVED (planner, tasks.md 9.2 + tasks/9.2.md).** The carrier is session-side in
  PlayerOrchestration (the `_skipRanges` sibling pattern, :114–123 — set at every describe
  leg, cleared on departure); read "carried at plan build" as "available at pick time";
  state/Playback.kt untouched (9.1's file); Rendition stays a bare data object
  (Playback.kt:84, RenditionPlanTest:39–40). Contract + prose amended accordingly.
- **Q5 — RESOLVED (planner, tasks.md 12.2) — the lift taken.** routeViewerKey already maps
  through toDpadKey, so the lift stays small: the OK-routing decision lifts to a pure
  viewer-key law in PhotoViewer.kt (the chipsRowConsumesUp idiom, KeyRouting.kt:119) that
  PhotoFlowTest pins (Ok → close, Left/Right → move, Up/Down consumed-inert, unrecognized
  keys unconsumed) + the status-line pure formatter.
- **Q6 — RESOLVED (planner, tasks.md 6.1 prose).** 6.1's line extended with the amendment
  walk legs (9.1 Back-exits preparing/dead; 9.2 voiceover cycle on the real remote; 10.x
  facet lane + toggle; 14.1 rail restyle visuals) plus ONE probe: logcat/uiautomator
  capture pressing the remote's audio-track button to establish whether keycode 222 is
  emitted at all (a dead key is recorded, the planner amendment is a LATER decision). The
  walk stays operator-gated; re-registered with `--reason`.
- **Q7 — RESOLVED (planner, tasks.md 10.1).** The facets fetch rides EVERY serial-grid load
  site — enter()'s default body included (the series() fetch sites, BrowseFlow.kt:298/:689/
  :697), not just selectLibrary and the toggle; best-effort law unchanged.
- **Q8 — RESOLVED (planner, design.md §B).** One-line precedence pointer added to the Width
  paragraph: task 8.2's 360dp prose, design D13's «360dp (§3.2, unchanged)», and the
  BrowseScreen.kt:181 comment are superseded by §B's 112dp law (execution order: 8.2 green
  before 14.1).
- **Q9 — RESOLVED (planner, spec delta edit) — rail scenario skipped.** Minimal WHEN/THEN
  scenarios folded into existing requirements: home error line (Home surface), title clamps
  (Series detail), photo viewer rulings + status line (Module-keyed bodies), cast rows
  (Watch-flow affordances). The rail width/anatomy scenario was NOT folded — no existing
  delta requirement covers rail presentation (the delta names the rail only as
  navigation/entry), and the surveyor's rule forbids creating a presentation requirement.

---

# Integration audit — AMENDMENT ROUND: group 15 (surveyor, 2026-11-17 afternoon)

Scope: tasks 15.1–15.7 (operator re-audit fixes; the group's register lines 147–165, the
three six-slot contracts 15.1/15.2/15.4, design §D, the spec delta's five group-15
requirement blocks), audited PRE-REGISTER (no receipts, no drift gate) against the live
tree @ a89cc56 (`feature/android-tv-app`, 3 modified + 3 new planner files uncommitted —
matches the invocation). The audit group 15 implements:
`/Users/aldfiar/projects/go/mellifera/.tmp/android-tv-rail-switch-audit-2026-11-17.md`
(S-1/S-2/S-3/C-1/A-1/A-2 + §B/§C). Read-only: this section and the wf handoff record are
the only writes. Grounding note: the live map is built and CURRENT (auto-built this
session; 699 files, kt 96) but the extractor yields ZERO Kotlin symbols (`symbols=0` —
go/js/ts only), so every android node below is grounded by live-tree file:line reads (the
map's own "not in map; grep source to confirm" directive). All line citations verified
byte-true on the a89cc56 tree.

## The planned integration graph (group 15)

### Nodes (22 — all grounded this session)

New (7):

| Node | Task | Grounding |
|---|---|---|
| mount-keyed ENTRY-claim effect (grid cursor-0 claim, gated on homeHoldsEntry) | 15.1 | absent today: the only grid actuator is the entry-gated cursor one (BrowseScreen.kt:575-579); the home-side claim is HomeRows.kt:262-267 (`LaunchedEffect(Unit)`, takesEntryFocus) and is untouched |
| `SWAP_RETRY_FRAMES` + `swapUntilLanded` (re-armed scroll actuator) | 15.3 | absent today (grep 0); the collector is the one-shot `browse.bodySwaps.collect { bodyIntoView.bringIntoView() }` at BrowseScreen.kt:203 (unique anchor) |
| `browse/BodyEpochTest` (new test class) | 15.4 | absent from android/src/test (inventory checked); duty `--tests tv.mellifera.browse.BodyEpochTest` fails on absence — honest existence enforcement |
| suspending FAKE `MelliferaApi` (test fixture, gated continuations) | 15.4 | feasible: `MelliferaApi` is a pure suspend interface (Api.kt:26, 18 suspend members), and `BrowseFlow(apiFor = { … })` accepts it — the CollectionsTest.kt:37 construction shows the seam; zero production edits needed |
| `res/values/colors.xml` `<color name="app_canvas">#020617</color>` | 15.5 | res/values carries ONLY themes.xml today (ls verified); themes.xml:4 is `@android:color/black` |
| `RAIL_PANEL_WIDTH = 96.dp` (rewrite of :17) + LayoutParityTest pins 112f→96f, 224→192 | 15.7 | ui/LayoutParity.kt:17 `val RAIL_PANEL_WIDTH = 112.dp`; the pins live in tv.mellifera.ui.LayoutParityTest (:15-22 — the CORRECT class; a second browse/LayoutParityTest holds only the 8.2/8.10 geometry pins, no rail pin) |
| the A-3 comment edit (TYPE_HEADING drops «rail rows») | 15.6 | ui/TypeScale.kt:31-32 — the stale claim confirmed verbatim |

Touched (15):

| Node | Task | Grounding |
|---|---|---|
| cursor actuator loses the entry gate | 15.1 | BrowseScreen.kt:575-579 — `LaunchedEffect(state.gridFocus, homeHoldsEntry)` gated `!homeHoldsEntry`; the negative-grep duty REDS on this tree today (key line itself matches) |
| nonce actuator — UNTOUCHED | 15.1 | :580-584 confirmed ungated on homeHoldsEntry |
| rail-close transition actuator — UNTOUCHED | 15.1 | :594-601 confirmed (railWasOpen remember + watched flip) |
| `focusUntilAttached` idiom — the re-arm the split rides | 15.1 | :917-926 + FOCUS_RETRY_FRAMES=60 :929 |
| `CardView.onDirection` consumption | 15.1 | :614-627 (consumes `next != index`, else→false) |
| `closeBody` clears the TWELVE body fields | 15.2 | BrowseFlow.kt:641-645 (today: flip only) |
| `SeriesGrid` mount gated `if (state.isBodyOpen)` | 15.2 | BrowseScreen.kt:229 (unconditional today; the string `if (state.isBodyOpen)` has ZERO hits today — the positive grep is a real detector) |
| `enter()` drops `loadBody(first.id)` | 15.2 | BrowseFlow.kt:220 (block :205-224; the negative grep `loadBody\(first` matches today — real detector) |
| bodySwaps collector re-arms | 15.3 | BrowseScreen.kt:196-204 (collector :202-204, anchor unique) |
| `bodyEpoch` bump+capture+check across BrowseFlow | 15.4 | duty floor `-ge 10` (0 hits today); capture anchor `val page = apiFor().items(` at :349 is UNIQUE — the -B2 grep is sound |
| themes.xml windowBackground → @color/app_canvas | 15.5 | themes.xml:4; AndroidManifest.xml:18 carries `Theme.Mellifera` (the manifest grep target exists) |
| App.kt C-2 cross-ref comment | 15.5 | MelliferaDarkScheme :34-37, AppCanvas :24 (both as cited); the ONLY `background(AppCanvas` paint repo-wide is BrowseScreen.kt:847 — the count-grep's expected string `…BrowseScreen.kt:1` is byte-exact today |
| RailRow `.fillMaxWidth()` + maxLines/Ellipsis ×2 | 15.6 | :957-969 (no fillMaxWidth in the chain), name Text :974-979, module Text :983, conditional Spacer :984-986; all three duty anchors (`border(1.dp, railBorder, cardShape)`, `if (name.isNotBlank())`, `Text(module,`) UNIQUE |
| `railMuted`/`railBorder`/`tvAccent` — UNTOUCHED by 15.6/15.7 | — | Colors.kt tokens (13.1/14.1, landed) |
| Test rewrites: BodyBackTest + EpisodesTest, PhotoFlowTest, CollectionsTest, RefreshTest, RailLawTest, BackRestorationTest, ItemsBodyTest, CollectionsWireJointTest | 15.2 | ALL eight walk `enter()` today (verified: 1-8 call sites each); BodyBackTest's keep-data pins at :127-131 confirmed (five of the seven assertions there flip — items/folder/folders/gridFocus die; libraryId :127 and railFocus :132 STAND under the new law; the :133 chipFocus pin survives either way since -1 is both values) |

### Edges (12 functional + 9 duty→test seams)

1. arrow key → onDirection consumes (moveInGrid satisfiable) → `onGridFocusMoved` → gridFocus change → UNCONDITIONAL cursor actuator → `focusUntilAttached` re-arm → ring lands (15.1 — the #27 fix; closes end-to-end)
2. body mount → ENTRY claim (mount+homeHoldsEntry keyed) → grid cursor-0 claim fires ONLY when the home surface cannot hold a card (15.1; the 8.15 law's grid side)
3. closeBody → isBodyOpen=false + shouldRestoreHome=true + TWELVE fields cleared (libraryId/summaries/railFocus kept) → SeriesGrid unmounts (`if (state.isBodyOpen)`) → the bare home shape (15.2)
4. enter() → /libraries ONLY → home rows the entry surface → no default body fetch (15.2; the request-drain counts move in the rewritten classes)
5. bodySwaps commit-emit + post-load re-emit (two-emit law, BrowseFlow.kt:272/:684) → swapUntilLanded re-arm → bringIntoView until the body top holds (15.3)
6. enter()/selectLibrary commits → bodyEpoch bump → EVERY body-write site captures-before-await and checks-at-write → stale writes drop (15.4 — the S-3 interleavings; see Q12 for the site enumeration diff)
7. MockWebServer-incompatible ordering → suspending fake MelliferaApi via the `apiFor` seam → gated continuations → BodyEpochTest's deterministic interleavings (15.4)
8. themes.xml:4 → @color/app_canvas → values/colors.xml → the window paints #020617; PlayerOverlay shell (D7) and PhotoViewer.kt:79 `.background(Color.Black)` stay untouched exceptions (15.5 — verified both)
9. RailRow card Column `.fillMaxWidth()` before background/border → Row2's weight deterministic at any data state (15.6)
10. name/module Texts maxLines=1+Ellipsis → one-line rows; at 96dp the clamp is load-bearing (15.6 → 15.7 order law)
11. RAIL_PANEL_WIDTH 96dp → panel 192px → slot 79dp=158px, text box 114px, focused 173.8px < 190px — the §D pixel math, pinned in ui/LayoutParityTest (15.7)
12. A-3: TypeScale TYPE_HEADING comment drops «rail rows» — the single-source file tells the truth again (15.6 rider)

Duty→test seams: 15.2→the eight rewritten classes + the two NEW pins (host class unnamed — the `tv.mellifera.browse.*` wildcard covers any browse/* host); 15.4→BodyEpochTest (new); 15.6→RailLawTest (exists, 7 flow pins, zero geometry pins — "zero flow laws move" confirmed at pin level); 15.7→ui/LayoutParityTest+RailLawTest. Structural-pass duties (compile+anchored greps, reviewer-read at GATE 2): 15.1, 15.3, 15.5, 15.6. Every grep verified NON-VACUOUS (reds on the unmodified tree) and every context anchor UNIQUE — the Q3-12.3 lesson held this round.

## Check verdicts

**Wiring coverage: PASS — no orphan nodes.** Every anchor the planner cites exists at the
cited lines (see the drift report below — zero material drift). Both wire additions close:
15.5's theme chain (themes.xml:4 → colors.xml → manifest :18) and 15.1's actuation chain
(onDirection → state → actuator → idiom). The 15.4 fake seam is compatible with the
existing harness — the `apiFor` constructor lambda + pure-suspend interface accept a fake
without production edits, and MockWebServer genuinely cannot gate two suspended calls.

**QA seam coverage: PARTIAL.** The named JVM seams exist or are honestly enforced
(--tests fails on absence). Two adequacy defects: Q11 (the spec delta's "Entry claim stays
gated" scenario describes the PRE-15.2 event and contradicts the 8.4 landing law at
GATE 2's spec-vs-code read) and Q13 (15.6's promised device ride is unmapped in 6.1's
legs). The @qa annotation rule is NOT triggered by any group-15 task: 15.1/15.2 correctly
carry `audit: true` (reworks, reviewer reads the six-slot prose); 15.4's new TEST classes
follow the house precedent (10.1's FacetsTest — a new test class is covered by its own
verify, no qa: list); no group-15 task is a production new-module.

**Complexity / blast radius: PASS with one enumeration gap and one trap.** Shared-file
heat: BrowseScreen.kt × 4 (15.1/15.2/15.3/15.6), BrowseFlow.kt × 2 (15.2/15.4) —
DAG-ordered, and the 9-14 round applied strictly sequentially (one commit per task), which
is what makes the overlap safe; under genuine ≤3-concurrent dispatch on one worktree these
are merge hazards (same note as the prior round). The 15.2 ripple list is COMPLETE against
my independent sweep — checked beyond the planner's list: the railWasOpen gate (:594-601)
is safe (the grid disposes at closeBody, the remount re-initializes the remember, and the
switch's closedNow re-land doubles the nonce actuator harmlessly); homeHoldsEntry's other
consumers (:344/:403/:426/:464 — the param threading into every CardGrid branch) stay and
feed the entry claim; CollectionsRail reads only libraries/summaries/railFocus (none
cleared); gridFocusNonce is deliberately NOT in the clear list (correct — the
bump-on-activation remains the landing signal); D12's exit law shape is unchanged
(post-close Back = app exit, enabler isBodyOpen=false). Two instances caught: Q12 (15.4's
site list omits four reachable stale-write sites) and Q14 (the C-2 comment can red the
15.5 count-grep if it contains the literal).

**Citation drift: NONE material.** Every planner citation verified byte-true on a89cc56:
BrowseFlow.kt :220/:246-264/:272/:287-301/:319/:356-361/:372/:404/:439/:487-504/:641-645/:703-710/:713-718/:772-797;
BrowseScreen.kt :123/:196-204/:227/:229/:234-243/:271/:575-579/:580-584/:594-601/:614-627/:847/:917-929/:957-969/:974-979/:982-988;
home/HomeFlow.kt :48-51 (the plan's bare "HomeFlow.kt" resolves uniquely — the file lives
in the home/ package, imported at BrowseScreen :77); themes.xml:4; App.kt :24/:34-37;
LayoutParity.kt :17; BodyBackTest :127-131; TypeScale.kt :31-33. Two spectral corrections
for the record: (a) the invocation's "RailLawTest-to-be" is stale — RailLawTest.kt EXISTS
(live since 4.2, kept green through 14.1); 15.6's duty correctly runs it as an existing
class; (b) the audit-era activateRailRow citation (BrowseFlow.kt:529-558) has drifted to
:658-687 in the current tree — no group-15 task cites it, no action.

**DAG verdict: CONSISTENT.** The encoded order 15.1→15.2→15.3→15.4→15.5→15.6→15.7 honors
§C's intent with one deliberate deviation: the audit proposed 15.2+15.4 and 15.3+15.2 as
PAIRED single tasks; the planner authored them separate-but-adjacent (three concerns) and
design §D records the rationale. Checked for hidden interleavings: no task's DUTY depends
on a later task's edit (15.2's suite greens pre-15.4; 15.3's greps are order-independent;
15.4's interleavings exercise the POST-15.2 enter shape — 15.2 lands first, which the
encoded order guarantees); 15.5 is genuinely independent (res/-only + one comment — zero
file overlap with the state cluster); 15.6 before 15.7 is encoded and load-bearing (the
§D ORDER LAW). One residual dispatch note, not a question: 15.1 and 15.2 both edit
BrowseScreen.kt and are adjacent — sequential application (the 9-14 precedent) is the
safe posture.

**Walk-legs mapping: 5 of 6 mapped.** 6.1's group-15 leg line (tasks.md:50) names legs
for 15.1 (r3/r4/r5 re-proof), 15.2 (BACK = bare home 13688-family; hybrid 17678/28c2f029
ABSENT), 15.3 (5/5 body-top landings + the BACK discriminator settling #24), 15.5 (canvas
pixel-reads 2,6,23), 15.7 (192px border-box + one-line rows) — each maps to exactly one
task's walk section and is gradeable from the single device window. 15.4 names no leg (its
contract: JVM-proven, exercised en passant through 15.2's switch legs — consistent). 15.6's
prose claims "the row-width uniformity probe rides 6.1's walk" — NO 15.6 leg is named in
6.1's line (Q13).

## Q9 re-adjudication (the flagged deviation)

**AMENDED, not waived, not standing unchanged.** The prior round's Q9 rule (resolutions
line: "the surveyor's rule forbids creating a presentation requirement") ruled the 14.1
rail restyle out of the spec delta — decoration-class presentation has no delta anchor.
The group-15 delta ADDS "Requirement: Collections rail geometry" — formally the same act.
The re-adjudication turns on what the requirement pins: 15.6/15.7 are DEFECT-class layout
laws (ragged width, mid-glyph wrap, the 8.16-precedent authoring-law change) with the
operator's live ruling freezing the numbers (96dp, fillMaxWidth, one-line ellipsis) —
grader-able WHEN/THEN contract, not style. The GATE 2 reviewer needs this anchor to
re-check 15.6/15.7; without it there is no spec-vs-code axis for the round's P2 findings.
Verdict: **Q9 stands for decoration-class presentation (14.1 remains delta-free — correct
as resolved); the group-15 rail geometry requirement is a legitimate exception grounded in
the operator's frozen instruction, and the delta as written (96dp/192px, uniform width,
one-line clamp scenarios) matches the tasks.** No planner action; the amendment is
recorded here. A future retheme amends the spec number the same way 15.7 amends §B's.

## Numbered questions (contradictions; recommended answers — the human decides)

**Q10 (HIGH — the D1 split's mount-run collision; the optional isRailOpen key).** 15.1's
law keys the cursor actuator "(state.gridFocus[, state.isRailOpen])" — the bracket makes
isRailOpen OPTIONAL — and forbids homeHoldsEntry in its gate. Under 15.2 the ONLY
production mount path is `activateRailRow` (verified: selectLibrary's sole caller,
BrowseFlow.kt:662), and the body composes WHILE the rail is still open (selectLibrary
commits and awaits loadBody BEFORE the rail close at :664-678). A LaunchedEffect runs its
initial pass at composition: keyed on gridFocus ALONE, the new unconditional actuator's
mount-run fires tile0's RE-ARMING focusUntilAttached while the rail is open — stealing
focus from the open rail's focused row (violating the :562 law "While the rail is open the
grid holds no focus") for the whole fetch window; rail keys then actuate the invisible grid
behind the scrim. Keyed on (gridFocus, isRailOpen), the mount-run is gated off and the
landing fires on the close flip (doubling the nonce actuator by design — coherent). The
negative-grep duty cannot distinguish the two shapes (it only reds homeHoldsEntry).
*Recommendation:* make isRailOpen MANDATORY in the cursor actuator's key/gate — amend the
15.1 law line and contract from "[, state.isRailOpen]" to required; the r3/r4/r5 legs ride
over this shape either way (they press arrows AFTER the landing), so the reviewer-read at
GATE 2 is the enforcement point.

**Q11 (HIGH — the entry claim's key set + a stale spec scenario).** Two coupled defects in
15.1/spec-delta text. (a) The 15.1 contract keys the entry claim "on the body mount (NEVER
the cursor key)" — keyed ONLY on the mount, the claim can never re-run when the
homeHoldsEntry verdict flips after the mount; the law's own clause "a resolved-empty home
hands it back to the grid" and the spec scenario's identical clause are then unserviced.
The 8.15 code gets exactly this behavior from homeHoldsEntry being IN the old actuator's
key. *Recommendation:* key the entry claim on (mountMarker, homeHoldsEntry) — the verdict
is not the cursor key and the negative grep stays green (it only matches
`LaunchedEffect(state.gridFocus…`). (b) The spec delta's "Entry claim stays gated" scene
reads "WHEN a collection body freshly mounts while the home surface holds a focusable card
THEN the home rows' first card takes the entry". Post-15.2 that is wrong at both ends: at
a switch mount (the only mount), 8.4/walk62c give the cursor to the BODY (tile0 5/5
proven) — a home card taking the entry would INVERT the landing law; and the entry-default
body the scenario remembers no longer exists. With home resolved (the only state a rail
can open from), homeHoldsEntry is permanently TRUE at every mount — the claim stands down
everywhere and the activation actuators own the cursor; the claim's live remaining role is
the home-failed/empty box (claim fires the grid). Likewise 15.1's "a late-resolving home
still pulls the entry" clause is unreachable post-15.2 (nothing mounts while home loads —
the rail has no trigger pre-resolution). *Recommendation:* rewrite the scenario's THEN to
the post-15.2 semantics ("the grid's cursor-0 claim stands down while the home surface
holds a focusable card — the activation landing owns the cursor per 8.4; when the home
surface cannot hold a card — failed or empty home — the grid's cursor-0 claim lands"),
and mark the late-resolving clause vestigial in 15.1's prose. The delta edit rides the
already-open spec.md.

**Q12 (MED — 15.4's site enumeration omits four reachable stale-write sites).** The
contract's site list is load-bearing (the duty only counts ≥10 refs and anchors ONE site).
Diffing the list against BrowseFlow's body-cluster writes finds four unnamed sites in the
SAME interleaving classes: (1) selectLibrary's failure-path REVERT (:287-301) — after a
later commit (the fast B→C double-switch, §B's own leg-3 class), the failing coroutine's
revert lands A's rows over C's fresh body AND reverts libraryId; the epoch law (drop when
superseded) is exactly the fix; (2) pickFolder's failure-path revert (:469-474) — same
class on the folder/items cluster; (3) openSeries' positions write (:718) — it follows the
`loadPositions` await (a per-episode loop, many suspension points), so the natural
"capture before the fetch, check at :713-717" shape leaves :718 unguarded — a switch
committing during the positions walk lands old positions in the new body; (4) refresh's
positions write (:775) — the same shape after :773-774's awaits. *Recommendation:* name
the two reverts and the two positions windows as guarded sites (capture-before-THAT-await,
check-at-write); optionally a fourth BodyEpochTest leg (revert-after-superseding-commit) —
or fold it into leg 3's walk. Without this, "the check IS the guard" holds for the named
sites only, and §B's leg-3 scenario can still reproduce through the revert path.

**Q13 (MED — 15.6's claimed device ride is unmapped in 6.1's legs).** 15.6's prose
promises "the row-width uniformity probe rides 6.1's walk"; 6.1's group-15 leg line names
no 15.6 leg (the nearest — 15.7's "one-line rows at the narrower panel" — grades the A-2
clamp, not the A-1 uniform width). The A-1 probe additionally needs a COUNT-LESS row to
occur on-device; every past walk resolved all summaries (best-effort law, BrowseFlow.kt:
589), so the probe may be unforceable without a fault injection. *Recommendation:* either
fold an explicit row-width clause into 6.1's 15.7 leg line (accepting it grades only
count-ful rows), or amend 15.6's prose to rest on the deterministic fillMaxWidth
structural law + 15.7's rail-visuals leg (row edges visible in the same captures) and drop
the promised dedicated probe. 6.1 is RED and its prose editable pre-close; 15.x are
unreceipted.

**Q14 (LOW — the C-2 comment must avoid the duty's literal).** 15.5's count-grep pins
`background(AppCanvas)` at EXACTLY one hit (verified byte-true today: BrowseScreen.kt:847,
the only paint repo-wide). The C-2 rider adds cross-reference comments to App.kt — a
comment containing the literal `background(AppCanvas)` (e.g. «nothing calls
background(AppCanvas)») makes the count 2 and reds the duty. *Recommendation:* word the
App.kt cross-ref without that literal («the XML app_canvas mirrors ui/App.kt's AppCanvas;
the only paint is the rail panel») — or the runner burns a red receipt learning this.

## Resolutions (group 15 round)

All five folded by @wf-planner per the coordinator's fold-round directive
(2026-11-17; the Q9 amendment above needs no action). Re-validation after the
folds: `openspec validate android-tv-layout-parity --strict` — valid, rc 0.

- **Q10 — ADOPTED.** isRailOpen is now REQUIRED in the cursor actuator's
  key/gate (was optional `[ , state.isRailOpen]`). Folded into tasks.md
  15.1 prose, tasks/15.1.md (law bullet + Done-when) and design §D's D1
  paragraph, each carrying the mount-run collision rationale
  (activateRailRow is the only production mount path; the body composes
  while the rail is still open — selectLibrary commits and awaits loadBody
  before the rail close, BrowseFlow.kt:664-678; with isRailOpen in the key
  the mount-run is gated off and the landing fires on the rail-close flip).
  The r3/r4/r5 walk legs ride over this shape either way; GATE 2's
  reviewer-read remains the enforcement point.
- **Q11 — ADOPTED (both legs).** (a) The entry claim is now keyed
  (mountMarker, homeHoldsEntry) instead of mount-only — the claim re-runs
  when the verdict flips and «a resolved-empty home hands it back» stays
  serviced; folded into tasks.md 15.1 prose, tasks/15.1.md (law bullet +
  Done-when + a KEY-SHAPE note keeping the negative grep accurate: the
  claim's key must not start with state.gridFocus) and design §D. The
  «late-resolving home pulls the entry» clause is marked VESTIGIAL
  post-15.2 (nothing mounts while home loads). (b) The spec delta's
  «Entry claim stays gated» scenario is rewritten to post-15.2 semantics:
  WHEN a body mounts from a rail activation while home holds a focusable
  card THEN the grid's cursor-0 claim STANDS DOWN and the activation
  landing owns the cursor; the claim lands the grid only for a failed or
  resolved-empty home. The requirement body text was updated to the
  (mount, homeHoldsEntry) keying.
- **Q12 — ADOPTED (all four sites named + the optional 4th test leg
  taken).** tasks/15.4.md's site law now names: selectLibrary's
  failure-path revert (:287-301), pickFolder's failure-path revert
  (:469-474), openSeries' positions write (:718 — capture before the
  loadPositions walk, check at the write) and refresh()'s positions write
  (:775), alongside the original list (pickFolder marked success-path in
  loadItems' coverage). BodyEpochTest gains the 4th leg
  (revert-after-superseding-commit dropped). tasks.md 15.4 prose and
  design §D's epoch list updated to the same enumeration for
  register/contract consistency. The guard stays capture-before-await;
  S-4 stays accepted-residual.
- **Q13 — ADOPTED (the 6.1-leg branch).** An explicit 15.6 device leg is
  added to 6.1's group-15 walk-window paragraph: a count-less rail row
  renders a uniform-width bordered card (pixel/bounds grade from one
  capture; if every summary resolves and no count-less row occurs
  naturally — the best-effort loadSummaries law — record that fact and the
  fillMaxWidth structural law + 15.7's rail-visuals captures stand as the
  evidence class). tasks/15.6.md does not exist, so 15.6's task line walk
  note now references the explicit 6.1 leg. 6.1's prose ride is
  --reason-covered by this leg.
- **Q14 — ADOPTED.** The C-2 cross-ref comment constraint is pinned in
  tasks.md 15.5 prose and design §D's canvas paragraph: the App.kt comment
  must NOT contain the literal `background(AppCanvas)` (15.5's count-grep
  pins that literal repo-wide at exactly one hit — BrowseScreen.kt:847);
  word it e.g. «the XML app_canvas mirrors ui/App.kt's AppCanvas — the
  only paint is the rail panel». The verify line itself is unchanged.

### Surveyor confirmation pass (2026-11-17, post-fold): FRONTIER EMPTY

Deltas-only re-audit over the folded tree (register lines, 15.1/15.4 contracts,
§D, spec delta, Resolutions). Q10–Q14 each verified folded at every named home,
mutually consistent and grounded against the live tree: Q10 (isRailOpen REQUIRED —
register 15.1 + 15.1.md + §D :646-659 + spec.md:268-269; rationale = the grounded
BrowseFlow.kt:664-678 path), Q11 (both legs — (mountMarker, homeHoldsEntry) keying
with the KEY-SHAPE note; spec scenario THEN post-15.2 at spec.md:285), Q12 (four
sites + 4th leg in 15.4.md + §D :605-619 identical enumeration), Q13 (6.1 explicit
leg + honest no-count-less-row caveat), Q14 (constraint pinned beside the 15.5 duty
and §D). Both spectral notes stable (RailLawTest existing-class posture; :529-558
cited only in frozen walk-ledger history). One zero-cost prose note, NOT a question:
register 15.4's TEST sentence leg inventory omits the 4th-leg clause ("three S-3
legs + control") — contract and §D carry it; duty-level consistent. Recommendation:
group 15 clean for GATE 1; nothing waived.
