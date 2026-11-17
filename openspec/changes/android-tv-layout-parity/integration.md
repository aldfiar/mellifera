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
