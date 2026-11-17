# GATE 2 review — android-tv-layout-parity (wf-reviewer, 2026-11-17)

Scope: the full register (48 tasks) at `feature/android-tv-app` @ 6f0e207; the axes run
against the amendment diff `531d0fb^..bcaa123` (android/) + the openspec chore `6f0e207`.
All commands run from the worktree. Receipts re-journaled `--by wf-reviewer`.

## Verify re-runs (step 1)

**All 46 numbered tasks re-verified green in this shell** (`wf pipeline verify … --by
wf-reviewer`, rc=0 each): 1.1–5.5, 7.1, 8.1–8.16, 9.1–9.2, 10.1–10.2, 11.1–11.4,
12.1–12.4, 13.1, 14.1. Skip list honored: 6.1 (operator-gated walk — untouched).

Reality-vs-dispatch correction: 8.9–8.16 had **zero receipts** before this gate (the walk
sessions proved them on-device but never ran the pipeline duties); the dispatch's "47
green" was wrong on those 8. This gate's re-runs gave them their first green receipts —
the register is now honestly green on every task the change owns except 6.1.

**git-check: RED** — `ahead of upstream by 15 commit(s) - push`. The whole amendment
(531d0fb…6f0e207: 14 parity commits + the openspec chore) is unpushed; b411028 was the
last pushed commit. Pre-close item, not a gate blocker: the close step re-runs git-check
after the push.

## Full-suite anchor (step 2)

`ANDROID_HOME=… android/gradlew -p android testDebugUnitTest --console=plain` →
**BUILD SUCCESSFUL; 47 test classes, 210 tests, 0 failures, 0 skipped** (aggregated from
build/test-results XML — real execution, not an UP-TO-DATE pass). The 32 full-suite
duties re-ran green on the warm cache afterwards.

## Spec-delta axis (step 3)

Every amendment scenario in `specs/android-tv-client/spec.md` is implemented and
evidenced:

- **Q1 corner-mark amendment** — verified at BOTH call sites: `WatchedCornerMark`
  (BrowseScreen.kt:1234, absence `if (!watched) return`, TYPE_META + DEFAULT_TYPE_ACCENT,
  3dp pad) overlaid `Alignment.TopEnd` inside the art `Box` of the grid card
  (BrowseScreen.kt:1180) and the episode thumb (BrowseScreen.kt:1294) — OUT of the text
  stack, watched never renders a bar, heights watched-independent. Matches the amended
  "corner mark over the art block" requirement verbatim.
- **Facet lane in every body state** — `FacetChipsRow` called UNCONDITIONALLY above the
  error/loading/empty/grid `when` in the serial branch (BrowseScreen.kt:386).
- **Facet toggle conjuncts + clears** — `toggleFacet` (BrowseFlow.kt:424): same value
  clears the key, one value per key, AND across keys via
  `series(genre, kind, status)` query params present only when non-null (Api.kt); honest
  error on failed refetch.
- **Back exits preparing/dead** — `ExitRequested → Idle` rows added on Polling and Dead
  in `reduce` (state/Playback.kt, 531d0fb); the no-retry banner law holds (Idle carries
  no retry affordance).
- **Voiceover cycle** — keycode 222 → `DpadKey.AudioTrack` (KeyMap.kt:18) →
  `CycleVoiceover` transport-class (KeyRouting.kt:47) → `cycleVoiceover`
  (PlayerOrchestration.kt:243): `(pick+1) % count` wraps in the plan's pick space,
  `count <= 0` is a no-op; «Озвучка» labels line (PlayerScreen.kt:339).
- **Home error line** — `homeErrorLine` pure gate (rows empty ∧ error ≠ null), rendered
  before HomeRows' early return; rows present → never renders.
- **Title clamps** — ellipsis at the three sites: hero maxLines=2, card maxLines=2,
  episode title/meta maxLines=1.
- **Photo rulings + status line** — `viewerKeyLaw` pure (Ok→Close, Left/Right→Move,
  Up/Down→Swallow, else unconsumed); `photoStatusLine` «i/n» always + served capture
  date/dimensions only when carried (absent → absent).
- **Cast rows** — `castLine()` retired (0 refs), per-entry `CastRow` + 24dp circular
  portrait only when the entry serves a photo (field-driven).

## Standards axis (step 4)

- **TypeScale law exact**: zero raw `sp`/`fontSize = N` left in main; 7 named constants
  (6/7/8/9/10/14/24 sp = the SPA px ÷ 2). No D11 floor regressions.
- **Token discipline**: tvAccent/chipColor single-homed in ui/Colors.kt, zero dupes
  outside ui/ (the 13.1 duty grep); 14.1's new tokens (railBorder 0xFF1E293B, railMuted
  0xFF94A3B8) landed in Colors.kt, not locals. Note (judgement call, P3-grade): the D3
  pastel map (BrowseFlow.kt:39–43), the player scrim 0xCC1A1D24 and AppCanvas (ui/App.kt)
  remain outside Colors.kt — all single-homed, all pre-amendment or ui-packaged, all out
  of 13.1's authored scope; a future pass may consolidate.
- **Pure-core / thin-shell**: viewerKeyLaw, routePlayerKey, homeErrorLine,
  photoStatusLine, factsOf are pure and JVM-pinned; composables execute the decisions.
- **Honesty laws**: field-driven absence throughout (no-artwork thumb, absent eyebrow,
  absent portrait, absent capture date, EmptyCollection on empty serial grid).
- **Test posture**: every law-bearing amendment behavior carries a JVM pin (back-exit,
  4× voiceover, 3× facet wire, home error ×3, viewer rulings, status line, cast rows,
  rail px laws, facts projection). One gap (judgement call): `BrowseFlow.toggleFacet`'s
  clear/refetch flow itself has no dedicated pin (the wire and params are pinned in
  FacetsTest; the toggle rode compile+grep duties). Not a contract breach — no authored
  duty demanded it; flagged as a follow-up seed.

## Orphan check (step 5)

Retired symbols: `castLine`, `railWidth`, `railColor`, `accentColor` — **0 references**
in the whole source tree (the wf index does not carry Kotlin symbols; grep per its
documented fallback). `requestFocusSafely` survives with 12 refs (definition + Focus.kt's
own law + PhotoViewer) — only the series-page actuator site changed (12.3), as disclosed.
Renames verified clean: `factsOf` private→internal (pinned in SeriesHeroTest),
`routeViewerKey` signature replaced with its sole caller updated, `toPhotoViewerUrl`
survivors intentional. **No caller of any removed/renamed symbol sits outside the change's
diff.**

## Integration re-grounding (step 6)

All 20 planned edges in `integration.md` re-grounded against the post-change code (every
node verified at its file:line this session; both wire additions close end-to-end). The
9 recorded resolutions are all implemented as recorded — **waivers honored, none
outstanding**:

- Q1 fold: the spec delta now carries the corner-mark placement (verified in the delta).
- Q2 fold: 12.4's duty runs `--tests PlayerInfoTest` (compiles the test set) and greps
  are anchored (`fun CastRow` present, `castLine` absent).
- Q3 fold: 12.3's duty anchors `focusUntilAttached` to the unique `focusIndex == index`
  actuator line (no-op impl would red).
- Q4 fold: session-side carrier (the `_skipRanges` sibling pattern); state/Playback.kt
  untouched by 9.2; Rendition stays a bare data object.
- Q5 fold: the pure viewer-key law lift taken; pinned in PhotoFlowTest.
- Q6 fold: 6.1's prose carries the amendment walk legs + the keycode-222 probe (the walk
  itself remains open — by design).
- Q7 fold: `loadFacets` rides every serial-grid load site — loadBody:317 (enter()'s
  default body included) + refresh:770/:779.
- Q8 fold: design §B precedence pointer; the stale 360dp references superseded.
- Q9 fold: the four scenarios folded into the delta (verified above); rail-presentation
  scenario correctly skipped per the surveyor's rule.

No unwaived, unimplemented edge. Orphan re-run against the post-change map: clean.

## Deviation adjudications (step 7)

| Deviation | Verdict | Why |
|---|---|---|
| 10.2 (a): facet-lane cursor walk rides native focus; law-bearing roles keep the shared `chipFocus` slot | **PASS** | Disclosed and reasoned in-code (FacetChipsRow doc): the cursor writer's clamp is folder-sized and the serial body serves no folders — consuming through it would dead-end the walk; the same native crossing the grid's law-unsatisfiable arrows ride (5.9). The delta mandates lane-render + conjuncts, not the walk mechanism. The Back link stays law-bearing via the lane-level focus watcher + chipsRowConsumesUp clamp on row 0. |
| 10.2 (b): serial branch gained its `EmptyCollection` state | **PASS** | Aligns the serial body with the tv/image branches' honest-empty idiom ("В коллекции пока нет элементов") — a conformance gain, not scope creep. |
| 12.1: episode thumbs without artwork render no corner mark | **PASS** (note recorded) | The whole thumb Box (art + bar + mark) sits inside `if (artwork != null)` — the law anchors the mark to the ART BLOCK; a thumb-less row has no art block, and a text-stack mark would re-create the height-dependence the amendment retired. Strict-letter note: the delta's "carries one ✓ glyph" is unsatisfiable at this edge without inventing a placement; if the operator wants a mark on thumb-less watched rows, that is a new ruling, not a defect. |
| 12.2: commit carried 10.1's in-flight PhotoFlowTest helper lines | **PASS** | Verified in the hunk: the `facetsBody` fixture import/enqueues are 10.1's domain riding 12.2's snapshot — benign attribution smear from interleaved sessions; the tip is coherent (suite 210/0) and both tasks' duties passed at their own run times. |
| 9.2: mechanical ripple to RenditionPlanTest/PlaybackReduceTest helpers | **PASS** | Byte-verified: both files' descriptor helpers swapped `JsonPrimitive("v$it")` → `VoiceoverDto(it, "v$it")` — the forced type ripple of the served-seam DTO change (Q4/Q6 resolution); assertions untouched. |

## Per-amendment-task verdicts

| Task | Verdict | Evidence |
|---|---|---|
| 9.1 Back exits Starting/Dead | PASS | reduce ExitRequested→Idle rows (state/Playback.kt); PlaybackReduceTest additive rows; duty green (531d0fb) |
| 9.2 Voiceover picker on the served seam | PASS | KeyMap 222 / KeyRouting transport-class / cycle wrap + zero-no-op / «Озвучка» line; 4 pins; ripple adjudicated PASS (69f5c9d) |
| 10.1 Facet wire + selection flow | PASS | Api.facets + series(genre,kind,status); facets/facetSelection state; best-effort 401 law; toggle conjunct/clear/refetch; FacetsTest ×3; Q7 fold landed (d223234) |
| 10.2 Facet lane above the serial grid | PASS | FacetChipsRow unconditional above the state `when`; both deviations adjudicated PASS (40673dd) |
| 11.1 Home error line | PASS | homeErrorLine pure gate before the early return; 3 pins (9aea627) |
| 11.2 Series cards carry the facts line | PASS | factsOf promoted internal; toCard().meta = metadata?.about?.let(::factsOf) (SeriesGrid.kt:80); pins (3d6df9b) |
| 11.3 Home cards carry served lines | PASS | eyebrow/episodeTitle/libraryName carriers, field-driven nulls; HomeCardsTest/HomeFlowTest pins (79a8314) |
| 11.4 Title clamps at three sites | PASS | ellipsis hero(2)/card(2)/episode(1); duty grep green (db7b4bd) |
| 12.1 Watched corner mark over the art | PASS | WatchedCornerMark TopEnd over art Box, both call sites; absence law; deviation adjudicated PASS (8d7922d) |
| 12.2 Photo viewer rulings + status line | PASS | viewerKeyLaw pure pin + photoStatusLine field-driven pin; interleaving artifact adjudicated PASS (370a782) |
| 12.3 Series-page actuator on focusUntilAttached | PASS | context-anchored duty green; other requestFocusSafely callers untouched (4b31928) |
| 12.4 Cast per-entry rows | PASS | castLine retired 0 refs; CastRow + 24dp field-driven portrait; PlayerInfoTest named per Q2 fold (a530529) |
| 13.1 Color tokens consolidate into ui/ | PASS | Colors.kt single-home; zero dupes outside ui/; import sites exact (d786ad0) |
| 14.1 Rail restyle 112dp bordered | PASS | RAIL_PANEL_WIDTH=112dp (LayoutParity.kt:17) + railBorder/railMuted tokens; RailLawTest flow pins green (bcaa123) |

## Overall GATE 2 verdict

**APPROVED-with-notes.**

Notes (none blocking the verdict):

1. **Push before close** — 15 commits unpushed (531d0fb…6f0e207); git-check reds until
   then; the close step re-runs it.
2. **6.1 stays open** — the operator walk (with the amendment legs + the keycode-222
   probe per Q6) is the change's one remaining work item; the change archives only
   after it.
3. **Follow-up seeds** (P3-grade, not gate items): a JVM pin for `toggleFacet`'s
   clear/refetch flow; optional consolidation of the D3 pastel map / player scrim /
   AppCanvas into ui/Colors.kt; the 12.1 thumb-less-row strict-letter note above.

## Human archive approval

- [ ] Operator approves archiving the change (recorded here after 6.1's walk closes —
      the change cannot archive while 6.1 is open).

## Amendment round — group 15 (2026-11-17 evening): GATE 2 record

Reviewer re-ran every green verify in its own shell (`--by wf-reviewer`): **54/54 rc=0**
(all 7 group-15 tasks + git-check + all 46 groups 1–14 tasks re-derived after the
mid-round home abandon/re-derive). Status 54/55 — the one non-green row is 6.1 (the
operator-assisted device walk, pending by design). Spec-vs-diff: all five group-15
requirements + 12 scenarios realized (cursor actuator keyed (gridFocus, isRailOpen) +
separate (mountMarker, homeHoldsEntry) entry claim; twelve-field clear keeping the
libraryId/summaries/railFocus trio + `if (state.isBodyOpen)` mount + no default body;
SWAP_RETRY_FRAMES bounded re-arm; bodyEpoch capture-before-await at every write site
incl. both failure reverts + refresh; XML-only canvas with exactly one
background(AppCanvas); fillMaxWidth + one-line clamps; 96dp/192px with derivation).
Audit six-slots 15.1/15.2/15.4 read by inspection — no prose-vs-code divergence.
Integration: Q10–Q14 verified folded; orphan check clean (loadBody one production
caller). Standards axis: no hard violations.

**APPROVED** (6.1 pending by design; not a gate failure this round).

Notes:

1. Deviation accepted: `kotlinx-coroutines-test:1.9.0` testImplementation added
   (build.gradle.kts) — minimal test-only enabler for 15.4's mandated gated-continuation idiom.
2. Deviation accepted: LayoutParityTest method renamed — the old name asserted the
   falsified SPA 224px derivation.
3. Residual (non-blocking): BrowseScreen.kt (~:883) doc comment still cites the SPA
   224px rail — the only stale 224 reference; follow-up touch next time the file opens.
4. The pipeline home was abandoned + re-derived mid-round: 15.5's original authored
   duty was ungreenable (double-escaped rg parens in single quotes); fix = chore 7e898da
   (tasks.md verify line only, law prose byte-identical); all receipts re-derived. A
   future `git clean -x` must expect the same re-derivation.
5. 6.1's single device window carries the whole group-15 walk grade (15.1 ring moves,
   15.2 bare-home fingerprint + hybrid absent, 15.3 5/5 landings + BACK discriminator,
   15.5 pixel-reads (2,6,23), 15.6 count-less-row uniform width, 15.7 192px visuals).
