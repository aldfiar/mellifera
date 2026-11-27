# Integration audit — tv-style-parity (wf-surveyor, 2026-11-19)

Planned integration graph for slice C (style-only, zero behavior/wire). All
nodes grounded against the worktree @ f6ae4c4 (the tree every plan citation
names; HEAD verified). The wf source map is CURRENT (`wf index query status`
→ `MAP: f6ae4c4 CURRENCY: CURRENT`) but parses Go only — every Kotlin node
below was grounded by targeted source reads (file:line cited inline), per the
project-context digest. GATE-1-gated items (S-6 record, S-7 focus law, the
0.92 column) are audited as-authored (recommended rulings); a declined
ruling re-authors per the plan's own fallbacks.

## 1. The planned graph

### Nodes — production (14 files; 13 touched + 1 NEW)

| # | Node | Tasks | Grounding |
|---|------|-------|-----------|
| P1 | `ui/Colors.kt` — token home | 1.1 | exists, 4 tokens (tvAccent/chipColor/railBorder/railMuted) @ Colors.kt:12-24 |
| P2 | `ui/App.kt` — root LocalContentColor flip | 1.1 | provider @ App.kt:75 (`MelliferaDarkScheme.onBackground`) ✓ |
| P3 | `browse/BrowseFlow.kt` — pastel map absorbed | 1.1 | typeAccent @ BrowseFlow.kt:38-43, DEFAULT_TYPE_ACCENT @ :46 ✓ |
| P4 | `browse/BrowseScreen.kt` — the hot file (7 tasks) | 1.2, 1.3, 2.2, 3.2, 4.1, 5.2, 6.1 | all cited anchors verified: FolderChip :836, RailRow cardShape(4dp) :1033, selection wash :1050, SeriesPage :1085/padding :1097, hero poster 60×90 :1171, synopsis maxLines 3 :1197, genre chips :1206-1208, CardView :1235, muted sites :522/1189/1196/1210/1300/1310/1406, CardView title :1286-1289 (TYPE_BODY, maxLines 2, Ellipsis), EpisodeRow :1349 (title TYPE_HEADING maxLines 1 Ellipsis @ :1395-1398), InProgressBar def :1469-1483 (track=chipColor, fill=accent param) |
| P5 | `browse/HomeRows.kt` | 1.2, 2.2, 3.2, 5.2, 6.1 | insets :118/:125, HomeCardShell Column :269, ResumeCard :309 (art box :332, InProgressBar call :342), AnchorCard :384 (art box :403), muted sites :352/363/370/422, next-label pastel@0.9 :430 |
| P6 | `browse/PhotoViewer.kt` | 1.2 | status line white@0.7f @ :100 (NOT 0.6f — Q6) |
| P7 | `playback/PlayerScreen.kt` | 1.3, 4.2 | LightGray sites :263/269/332/341/358/365/374/407, Dead/Failed banners :82-86, scrim 0xCC1A1D24 :296, SkipChip :215, snap alpha :226, SKIP_FADE_MS applied :219 (const @ SkipSections.kt:39) |
| P8 | `browse/FallbackGradient.kt` — NEW pure law | 2.1 | absent today (verified); sibling of ArtworkUrl.kt per D2 |
| P9 | `ui/TypeScale.kt` | 2.1, 3.1 | TYPE_DISPLAY 14sp "SPA 28px" wrong citation ✓, TYPE_CODE 24sp ✓, TYPE_BODY KDoc carries "card titles" ✓, header mapping block :16-17 ✓ |
| P10 | `ui/SettingsSection.kt` | 4.1, 5.2 | chip background(chipColor, RoundedCornerShape(2.dp)) @ :44 ("~41" ok), inset 32dp @ :34 ✓ |
| P11 | `browse/LayoutParity.kt` | 5.1 | PARITY_GUTTER 16.dp ✓, CONTENT_COLUMN_FRACTION 0.60f ✓, fixed-3 constants + ruling KDoc ✓; rowCardTrack(gutter = PARITY_GUTTER) default flows the gutter change ✓ |
| P12 | `pairing/PairingScreen.kt` | 3.1 | TYPE_CODE @ :68, address field TextStyle(color = Color.White) @ :103, page padding 32dp @ :55 |
| P13 | `playback/SkipSections.kt` | 4.2 | SkipKind enum :24 (Intro/Credits lexicon) |
| P14 | `ui/Focus.kt` | 7.1 | tvFocusStyle @ :36-52 (FOCUSED_SCALE 1.1 + border(2.dp, tvAccent, 6dp corner)) ✓ |

### Nodes — contract symbols (design §Interfaces vocabulary, 12)

Defined in 1.1 (`ui/Colors.kt`): `tvForeground` #F8FAFC · `tvMuted` #94A3B8
(absorbs `railMuted`) · `tvDestructive`+`tvDestructiveBorder` ·
`inProgressFill`+`inProgressTrack` · `chipActiveBg`+`chipActiveText` ·
pastels `dotSerial`/`dotTv`/`dotImage`/`dotAudio` (BrowseFlow
typeAccent/DEFAULT_TYPE_ACCENT keep signatures, read these). Defined in
2.1/2.2: `fallbackGradient(name): FallbackGradient` + `FallbackArtwork`
composable + `TYPE_FALLBACK_INITIAL` 18sp. Defined in 4.2: skip kind→pastel
mapping. Defined in 5.1: `PARITY_OVERSCAN_X` 24dp / `PARITY_OVERSCAN_Y`
14dp. Defined in 7.1: `tvFocusRingWidth` dpr clamp.

### Nodes — tests (14 files; 12 existing + 2 NEW)

Existing (verified in `android/src/test/java/`): AppThemeTest, PhotoFlowTest,
HomeCardsTest, SkipSectionsTest, TypeScaleTest, ItemCardsTest,
AddressEntryTest, SeriesHeroTest, EpisodesTest, LayoutParityTest(browse),
HomeFlowTest, FocusLawTest(dpad). NEW (deliberately absent today, created
in-task): browse/FallbackGradientTest (2.1), ui/FocusRingTest (7.1).

### Edges

Task→file touches (26): 1.1→P1,P2,P3,P-AppThemeTest · 1.2→P4,P5,P6 ·
1.3→P7,P4 · 2.1→P8,P9,P-FallbackGradientTest,P-TypeScaleTest · 2.2→P4,P5 ·
3.1→P9,P12 · 3.2→P4,P5 · 4.1→P4,P10 · 4.2→P13,P7 · 5.1→P11,P-LayoutParityTest ·
5.2→P4,P5,P10 · 6.1→P5,P4 · 7.1→P14,P-FocusRingTest,P-FocusLawTest.

Token/contract consumption (12): `tvMuted`←1.2, 1.3, 4.1 ·
`tvDestructive`(+Border)←1.3 · `inProgressFill/Track`←1.3 ·
`chipActiveBg/Text`←4.1 · `tvForeground`←1.1 (App.kt root) ·
pastels←1.1 (BrowseFlow internal) · `FallbackGradient`+`FallbackArtwork`+
`TYPE_FALLBACK_INITIAL`←2.2 · skip mapping←4.2 (intra-task) ·
`PARITY_OVERSCAN_X/Y`←5.2 · `tvFocusRingWidth`←7.1 (intra-task).

Intra-group ordering (must stay serial): 1.1→1.2→1.3 (token defs in 1.1;
BrowseScreen co-edited by 1.2+1.3) · 2.1→2.2 (2.2 consumes 2.1's law) ·
5.1→5.2 (5.2 consumes 5.1's constants).

Live-system seams: LocalContentColor flip (App.kt:75) reaches every
default-styled Text app-wide; InProgressBar def (BrowseScreen:1469) is
SHARED — its track edit covers both call sites (CardView :1376,
HomeRows :342) so the spec's "a card or row" scenario is satisfied by one
edit; the fill swap retires/ignores the `accent` param at both callers;
tvFocusStyle's NEW shape param defaults to the current 6dp corner so every
existing caller compiles unchanged (RailRow's 4dp cardShape verified @
BrowseScreen:1033); PARITY_GUTTER flows via rowCardTrack's default ✓.

**Verdict — wiring coverage: PASS with 3 serial-chain constraints.** No
orphan nodes: every planned file/symbol has a consuming task and every task
consumes defined names. Cross-group file overlaps (BrowseScreen ×7 tasks,
HomeRows ×5, PlayerScreen ×2, TypeScale ×2, SettingsSection ×2) all
serialize by group order — group order IS the DAG for them. The three
intra-group chains above MUST NOT be launched concurrently within the ≤3
concurrent cap: group 1 is a strict 1.1→1.2→1.3 chain (1.2/1.3 compile
against 1.1's tokens AND both edit BrowseScreen.kt — concurrent Edit calls
on one file are a stomp hazard), likewise 2.1→2.2 and 5.1→5.2 (compile
would fail on not-yet-defined names). Groups 3/4 are file-disjoint
intra-group (3.1↔3.2, 4.1↔4.2 share no file) and may parallelize safely.
One unpinned seam, note only: `FallbackArtwork`'s definition file is not
named (2.2 owns both def and call sites atomically, so no ordering risk);
recommend it lands in `FallbackGradient.kt` beside the law.

**Verdict — Complexity: PASS.** Edges per module: BrowseScreen is the hot
file (7 of 13 tasks) but every landing is serialized by group order and
each task stays ≤3 production files (the ~6-file granularity law holds).
No cycles. Blast radius: files no task touches = none — every drift site
found in the sweep greps maps to a task EXCEPT the four residues raised as
Q2/Q3/Q4/Q7 below.

## 2. Contract seams

**Verdict: PASS with Q1/Q6.** Every design §Interfaces name has a defining
task and ≥1 consuming task; every consumed name in the tasks is defined by
an upstream task (or already exists: railBorder, TYPE_SMALL, TYPE_HEADING,
tvFocusStyle, chipColor, PARITY_GUTTER — all verified in source). The
six-slot contracts (tasks/1.1.md, tasks/1.2.md) are consistent with their
tasks.md lines on tokens, inventories and duties, EXCEPT: Q1 (the
railMuted deletion makes BrowseScreen.kt uncompilable while 1.1's contract
forbids touching it) and Q6 (PhotoViewer:100 is alpha 0.7f, prose says
0.6f). qa-entry path shape note: entries read
`tests/android/src/test/java/...` while the on-disk tree is
`android/src/test/java/...` (no repo-root `tests/` dir) — this conforms to
the loop grammar's `tests/...::node` shape; the load-bearing part is the
`::` node, and both named FQNs match their verify duties' `--tests` filters.

## 3. qa seam coverage

**Verdict: PASS.** The @qa tasks pin exactly the design's two JVM-observable
joints: 2.1 → `FallbackGradientTest` (determinism + golden name→hue pairs +
grapheme floor = the fallbackGradient determinism law) and 7.1 →
`FocusRingTest` + existing `dpad.FocusLawTest` (the dpr-clamp width law +
actuation regression). All 11 remaining tasks mutate shared UI surfaces but
every one carries a JVM-test duty AND structural greps (negative greps for
retired idioms: `Color.White.copy(alpha`, `Color.LightGray`; positive greps
for landed markers: `tvDestructive`, `inProgressFill`, `FallbackArtwork`,
`FontWeight.SemiBold/Medium`, `RoundedCornerShape(50)`, `railBorder`,
`PARITY_OVERSCAN_X`, `clip(cardShape)`, `Animatable|animateFloatAsState`,
`FontFamily.Monospace`) — no bare-seam task. Gap, raised as Q5: the @audit
placement contradicts the design's own sweep-task definition.

## 4. Spec delta vs tasks

**Verdict: PASS.** 7 ADDED + 1 MODIFIED requirements, 26 scenarios, all
mapped — token law→1.1/1.2/1.3 (5) · fallback→2.1/2.2 (3) · typography→3.1/
3.2 (3) · chip idiom→4.1/4.2 (3) · geometry→5.1/5.2 (3) · home chrome→6.1
(2) · focus ring→7.1 (2) · MODIFIED Series-detail (5): the overflow-clamp
scenario's one-line→two-line move is delivered by 3.2 (EpisodeRow maxLines
1→2; TextOverflow.Ellipsis already present @ BrowseScreen:1398 — no
overflow-enum gap), and the other four scenarios are carried verbatim from
the living spec (verified @ openspec/specs/android-tv-client/spec.md:90-124
— the MODIFIED delta is a faithful full-carrier modification). S-6 is
correctly taskless (the fixed-3 prose rides the geometry requirement). Every
task serves ≥1 scenario.

## 5. Blast radius

**Verdict: PASS with Q2/Q3/Q4/Q7.** Surfaces swept by 1.2/1.3/5.2/6.1
collectively: browse grids (P4, 7 tasks) · home rows (P5, 5 tasks) · player
overlay (P7 — zero Color.White found; LightGray + banners + pastels + fade
covered) · photo viewer (P6:100) · settings (P10) · pairing (P12, 3.1
only). Comprehensive greps (`copy(alpha`, `Color.White/LightGray/Gray`,
`Color(0x`, `32.dp`, raw `.sp`) found exactly four un-swept residues,
each raised as a numbered question below: PairingScreen's 32dp page inset,
PairingScreen's Color.White input text, AppCanvas's home outside the token
file, and HomeRows' pastel@0.9 next-label. No raw sp literals exist outside
TypeScale (imports only) ✓.

## 6. Dependency assumptions

**Verdict: PASS — zero new dependencies VERIFIED.** android/build.gradle.kts
declares compose-bom 2024.12.01 + `androidx.compose.ui:ui` +
`androidx.compose.foundation:foundation` + tv-material 1.0.1 +
activity-compose (:118-123). foundation-android 1.7.6's module metadata
(gradle cache) lists `animation` and `ui-text` as dependencies, so:
Brush/graphicsLayer/RoundedCornerShape ride ui; FontWeight/
FontFamily.Monospace/TextStyle/letterSpacing ride ui-text; Animatable/
animateFloatAsState ride animation-core via foundation→animation. No
planned import exceeds the declared surface. G4 clean.

## 7. Numbered questions (recommended answers — the human decides)

1. **railMuted deletion compiles nothing (1.1).** 1.1 deletes `railMuted`
   ("old name deleted", tasks/1.1.md line 33) while forbidding call-site
   changes ("No other call site changes in THIS task", line 45) — but
   BrowseScreen.kt imports and uses it at :91, :1064, :1074, :1078, so 1.1's
   own verify (which compiles the module) cannot go green. **Recommend:**
   1.1 completes the absorption mechanically — amend the contract's
   call-site law to name exactly those four BrowseScreen lines (import +
   3 uses → `tvMuted`); alternative: keep `railMuted` as the token until 1.2
   sweeps the uses, then delete — but that splits one absorption across two
   tasks and 1.2's duty doesn't grep for `railMuted`, so the four-line
   amendment to 1.1 is the cleaner fix.
2. **PairingScreen page-edge inset outside the overscan sweep.**
   PairingScreen.kt:55 renders `fillMaxSize().padding(32.dp)` — the same
   page-edge idiom 5.2 retires on four surfaces, and the spec scenario
   enumerates only "(series page, collection body, home rows, settings)".
   **Recommend:** extend 5.2 with PairingScreen:55 → PARITY_OVERSCAN_X/Y
   (one line; keeps the law universal); alternative: record pairing's
   exclusion as deliberate in the spec scenario's enumeration and design D5.
3. **PairingScreen input text is a hardcoded non-token color.**
   PairingScreen.kt:103 renders `TextStyle(color = Color.White)` — pure
   #FFFFFF vs the SPA foreground #F8FAFC the token law pins, and a literal
   the provenance law ("every color token a TV surface reads SHALL be
   declared in the single token home") outlaws. No task covers it. 
   **Recommend:** fold the swap to `tvForeground` into 3.1 (which already
   touches PairingScreen for the monospace code) — zero extra task.
4. **AppCanvas lives outside the single token home.** App.kt:28 declares
   `AppCanvas = Color(0xFF020617)`; the new spec law says every color token
   a TV surface reads SHALL be declared in the single token home, while
   1.1's contract doesn't absorb it and Colors.kt's own KDoc reads "one home
   beside [AppCanvas]". **Recommend:** either 1.1 absorbs AppCanvas (a
   one-val move + provenance KDoc) or the spec law's scope wording is
   narrowed to "every token this change introduces or sweeps" — pick one so
   the reviewer's strict reading has an answer on record.
5. **@audit placement contradicts the design's sweep-task definition.**
   Design D1 names the muted-sweep tasks as "browse + playback" (= 1.2 +
   1.3) and the risk bullet says "@audit on both sweep tasks", but @audit
   sits on 1.1 + 1.2 — the playback sweep (PlayerScreen: 8 LightGray sites
   + banners + shared InProgressBar + RailRow wash) carries no @audit and no
   six-slot contract. **Recommend:** annotate 1.3 @audit with a third
   contract file (PlayerScreen is the most-shared surface — 4.2 also edits
   it); alternative: amend the design bullet to name 1.1+1.2 and drop the
   "sweep" wording.
6. **1.2 inventory alpha mismatch (prose only).** tasks.md 1.2 and
   tasks/1.2.md call PhotoViewer:100 a `Color.White.copy(alpha = 0.6f)`
   site; source says `0.7f` (the fourth ad-hoc idiom). The duty is
   unaffected (the negative grep matches any alpha). **Recommend:** amend
   the prose to 0.7f in both files (duty/file sets unchanged — a prose
   `--reason` edit, not a new task id).
7. **HomeRows next-label is an unswept derived color.** HomeRows.kt:430
   renders the next-episode label in `accent.copy(alpha = 0.9f)` (pastel
   derived by opacity) while the SPA renders the same affordance as
   `<span className="chip">` — the muted chip idiom (Home.tsx:374, anchor
   branch). No task covers the site (1.2 inventories only white-alpha; 4.1
   covers FolderChip/genre/settings chips). **Recommend:** add HomeRows:430
   to 1.2's inventory (→ `tvMuted`, 12th site); alternative: record it in
   1.2's NOT-list as a deliberate accent idiom with SPA evidence — but the
   SPA evidence points the other way.

## 8. Resolutions

All seven questions ruled "as recommended" by the human and folded by
wf-planner before GATE 1 (recorded 2026-11-19, confirmation sweep same day
— every ruling re-verified against the tree @ f6ae4c4, HEAD unchanged):

1. **Q1 → as recommended.** 1.1 COMPLETES the railMuted absorption in-task:
   the contract's call-site law rewritten (tasks/1.1.md:24-29 + :58-61)
   with the grep-verified 7-hit inventory — Colors.kt:24 def, BrowseScreen
   :91 import, :1014-15 KDoc, :1064/:1074/:1078 sites → tvMuted — and the
   tree-wide negative grep (`! grep -rn "railMuted" android/src/main/java`)
   rides the duty. Sweep: `grep -rn railMuted android/src` = exactly 7 hits,
   every hit inside the inventory; test tree carries zero railMuted pins
   (no hidden compile break).
2. **Q2 → as recommended.** 5.2 sweeps PairingScreen.kt:55 →
   PARITY_OVERSCAN_X/Y; the spec geometry scenario (spec.md:142) enumerates
   the pairing page; design D5 records the amendment. Verified: :55 is
   `padding(32.dp)`; the constants are correctly absent pre-5.1 (NEW) and
   5.1→5.2 serial holds; LayoutParity.kt carries the amendment targets at
   the claimed values (CONTENT_COLUMN_FRACTION 0.60f, PARITY_GUTTER 16.dp)
   plus browse/LayoutParityTest exists.
3. **Q3 → as recommended.** PairingScreen.kt:103 `Color.White` folds into
   3.1 → tvForeground (tasks.md:25; design D5). Verified: :103 exact
   anchor (`TextStyle(color = Color.White, fontSize = TYPE_READOUT)`).
4. **Q4 → as recommended.** AppCanvas (App.kt:28, #020617) absorbs into
   Colors.kt under 1.1 with a provenance KDoc; App.kt's scheme keeps
   reading it from the token home; AppThemeTest gains the value pin
   (tasks.md:5, tasks/1.1.md:43-48 + :66, design D1 amendment). Verified:
   App.kt:28 `val AppCanvas = Color(0xFF020617)` and the scheme reads at
   App.kt:39-40.
5. **Q5 → as recommended.** 1.3 is now `@audit` with the NEW six-slot
   contract tasks/1.3.md (59 ln) carrying the grep-verified inventory; the
   design risk bullet names the sweep tasks 1.2+1.3. Verified: the
   contract's 8 LightGray lines (263/269/332/341/358/365/374/407) match
   PlayerScreen.kt exactly; InProgressBar def :1469 and the RailRow wash
   :1050 anchors verified; Dead/Failed banners grounded at :82-86.
6. **Q6 → as recommended.** 1.2 prose corrected to 0.7f in tasks.md:8 and
   tasks/1.2.md:18-19. Verified: PhotoViewer.kt:100 is `0.7f`.
7. **Q7 → as recommended.** HomeRows.kt:430 added to 1.2 as the 12th
   muted site → tvMuted with the SPA `.chip` evidence (Home.tsx:374).
   Verified: :430 is `accent.copy(alpha = 0.9f)`; the 12-site inventory is
   COMPLETE — tree-wide `Color.White.copy(alpha` = 12 hits, all inside the
   three duty-grepped files, zero residue outside all inventories (the
   only remaining `.copy(alpha` sites are :1050 — 1.3's, and :430 — 1.2's
   own; WATCHED_DIM :113/:1293/:1399 stays per the NOT-list).

**Confirmation sweep verdict (2026-11-19):** the amended surface holds —
all six amended artifacts re-read (line counts match: tasks.md 53, 1.1.md
78, 1.2.md 45, 1.3.md 59, design.md 170, spec.md 223); every inventory
grep-complete against f6ae4c4; register-grammar shape clean (two-space
fields, no `- [x]`, `file:` fields point at existing contracts). The
question frontier is EMPTY — no new questions, no residuals. The
pre-sweep verdicts (§1-§6) are unchanged; Q1-Q7 are closed.
