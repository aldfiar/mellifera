# Design

## Context

The TV client exists (change `android-tv-app`: pairing, browse grid + series
page + collections rail, playback machine, telemetry — D1..D8 there). The web
SPA is the product's face: Home = ONE GET /api/v1/home round-trip rendered as
the Continue rail (entity-grain rows, home-rail), pastel type accents,
field-driven Synopsis/About panel, per-card ⋯ manage actions, watch-flow
affordances (SkipChip, AutoNext, InfoColumn), density contracts (height-aware
tracks). The 2026-11-12 on-device audit proved the TV app drifted: invisible
default text (no MaterialTheme), dead episode OK (no click wiring), word chips
violating the SPA's state-signal scale law. This change is the layout-parity
contract: TV mirrors the web UI by law, not by per-feature redesign. It
absorbs the layout guideline draft (`.tmp/android-tv-layout-guideline.md`,
2026-11-12 — scratch, never committed): the IA parity map, the screen
wireframes, the whole-app dpad map, the tokens, and the mirror pipeline now
live here.

Evidence base (2026-11-12): `.tmp/tv-ui-backup-2026-11-12/` — 11 screenshots,
3 a11y dumps, logcat tails; box facts: Smart TV Pro, Android 14, 1920×1080
override on a 4K panel, density 320.

## Goals / Non-Goals

**Goals:**
- Same layouts as the web UI on every shared surface, dpad-native.
- One set of standing laws (below) so a web-UI feature's TV mirror needs zero
  new design decisions.
- All parity work inside `android/`; zero server and zero SPA changes.

**Non-Goals:**
- Pixel parity or the SPA's sidebar chrome (TV owns its collections rail
  idiom, 5.15 — the IA mirrors, the shell adapts).
- TV-only features. A feature is designed in the web UI first; TV mirrors it.
  TV-specific needs (cursor visuals, focus walkers) are rendering concerns of
  the same laws, never product surface.
- Search palette, admin surfaces, management overlays (Rename/Identify/Poster),
  watched-state WRITES (the SPA's WatchedToggle button), and the genre/kind
  facet lanes on TV grids in this round — desktop/operator concerns stay in
  the SPA; the TV ✓ glyph is a signal, never a control.

## The carried laws (the "same logic as for browse", verbatim)

These are NOT new decisions — they are the browse surface's existing laws,
stated once as the parity guideline every new surface follows:

- **L1 Field-driven rendering** (5.6): every optional server field is a nullable
  block carrier (`DisplayCard`); null renders NO block — never a placeholder,
  never a fabricated value. Absent field → absent block, on every surface.
- **L2 Cursor-in-state dpad law** (5.9): arrows route through the pure
  `moveInGrid`/`moveInList` laws; the cursor lives in the flow state; an arrow
  the law cannot satisfy inside the surface is left UNCONSUMED so Compose's
  focus search crosses rails natively.
- **L3 Back restoration** (5.9): Back restores the exact prior cursor — the
  grid never restarts at 0.
- **L4 Focus visual law**: focused = 2dp accent border + scale 1.1, never a
  pill; `tvAccent` is the one focus color.
- **L5 When-shell + overlay player** (D1/D8): `when (state.screen)` is the
  navigation; the player is an overlay above any screen, never a route.
- **L6 Served-names-only** (5.13/5.14): display names, module labels, counts,
  artwork come verbatim from served rows; the client derives nothing the server
  didn't send (Dtos.kt mirrors api.ts — field drift is a bug).
- **L7 RU user-facing copy**; error/loading states are honest one-liners.
- **L8 401-anywhere + player-exit refresh** (existing app laws, unchanged).

(The guideline draft's "L8 VISIBLE" is this set's D9 below — the numbering
here is the authored one and stays.)

## Decisions

- **D1 — Parity is IA + field blocks, not pixels.** A TV surface mirrors its
  SPA counterpart's information architecture (region order, which blocks exist,
  what each block reads) and its field-driven laws. Sizes, gutters, and the
  navigation shell adapt to the 10-foot screen. When the SPA changes a surface,
  the TV mirror changes in the same change or a follow-up task under this
  capability — never left to drift silently. The mirror inventory is the **IA
  parity map** below; the per-surface layouts are the **Screen layouts**
  section; the process for future mirrors is the **Mirror pipeline** section.
- **D2 — Card anatomy = the SPA card law, TV-rendered** (grounded in
  `WatchedStates.tsx` + `Collection.tsx`): the SPA tri-state per element —
  watched → ONE ✓ glyph at meta-line scale + dimmed title (the glyph is
  type-agnostic — the SPA `.watched-mark` pastel `#a4c8f4`, D3),
  NO progress bar; in-progress → the progress bar; new → clean. The bar's
  percent follows the SPA `watchedPercent` law: position over duration,
  clamped to 100; a missing/non-positive duration → NO bar (never a guessed
  percent). Poster block (absent → no block), title, ONE field-driven
  meta/facts line. The word chips («Просмотрено») are RETIRED — they violate
  the SPA's state-signal scale law (user ruling 2026-11-04) and are the
  loudest text on the card today. On TV the ✓ is a SIGNAL only: the SPA's
  WatchedToggle write affordance is a management concern, out of TV scope
  (Non-Goals); card OK keeps its navigate/play act.
- **D3 — Type accents carry over** (the SPA's live dot map, `styles/index.css`
  `.dot-*` — corrected 2026-11-12; the guideline draft carried stale paraphrase
  hexes that match nothing under web/src): serial `#b7a6f4`, tv `#f6c3a4`,
  image `#a4e3c3`, audio `#a4c8f4`, future types per the same map; on TV the
  accent tints the focused-card per-collection context, while `tvAccent` stays
  the focus ring color and the ✓ glyph stays type-agnostic (`#a4c8f4`, the SPA
  `.watched-mark` law — the mark is a state signal, not a type signal; titles
  dim to 0.55). Unknown module id → the module-label law (its own id,
  readable — `moduleLabel`, BrowseFlow.kt) and the default pastel `#a4c8f4`
  (`typeAccent`, BrowseFlow.kt) — never a blank, never a hardcoded type list.
- **D4 — Home surface mirrors SPA Home** (`Home.tsx` + `internal/api/home.go`):
  Collections (the 5.15 rail — no change) → Continue row (resume cards, OK
  resumes) → Next-up row (anchor cards, OK plays) above the collection grid.
  Data = ONE GET /api/v1/home round-trip — the same wire the SPA's ContinueRail
  reads (≤50 entity-grain rows, served order rec_score desc + recency tiebreak,
  NEVER a client re-sort, no second derivation — L6). Rows branch on the served
  `current` (omitempty — absent, never null, on anchor cards): present → the
  Continue row; absent → the Next-up row, the served `next` offer
  (`next.item_id` + `next.label` verbatim) being the card's primary OK
  affordance; a row carrying neither renders bare, never a fabricated link.
  Films surface as resume rows without a next offer (an episode concept). The
  continue card: 16:9 still, progress bar ONLY when `duration_seconds` is
  served (honest absence — no duration, no bar), title, and the served
  position line (percent · position · library name when present — the SPA
  ContinueCard's own meta line; NO client-computed remaining label). An empty
  served array renders NO row — never a placeholder row (L1 outranks the SPA's
  shared empty-state chrome here; the divergence is stated). Rows are
  horizontal walkers under the L2 law; UP from row 0 crosses to settings
  natively (existing idiom); LEFT at row-0 x=0 opens the collections rail
  (existing 5.15 idiom).
- **D5 — Series detail mirrors ItemDetail + Synopsis + EpisodesView**: a hero
  zone above the episode list — poster, title (28sp), the facts line and the
  Synopsis block read from the SERVED `metadata.about` projection (the
  server-resolved first-wins convention block; the client walks NO namespaces —
  `Synopsis.tsx` consumes exactly this block). The facts line is the about
  block's own fact row (★ score · kind · status · N ep · year); Synopsis is
  the block's description, muted, clamped 2–4 lines with genres as chips when
  served; absent block or empty description → no block, no facts line (L1).
  The hero NEVER takes dpad focus — the episode list is the initial focus
  (the walker's home). Episode rows (72dp) carry composed name, field-driven
  meta line, the D2 tri-state bar/glyph, OK plays with resume (the shipped
  play verb already carries it). Back → grid at the parked cursor (L3).
  DTO seam: the typed metadata block (about/cast/episode) is exposed on the
  series/item DTOs mirroring api.ts `ElementMetadata` — the opaque whole
  document stays uncarried.
- **D6 — Collection bodies are module-keyed** (mirror `Collection.tsx`'s
  CollectionBody): `serial` → series poster grid (exists); `tv` → episode file
  cards in the same grid (the MovieCard idiom: thumb when the frame-grabber
  fact exists, served title, ONE parsed-facts meta line — per-file identity is
  the tv model, NOT a grouping bug); `image` → photo grid + a folder-chips row
  above it ([Все] + the served `GET /libraries/{id}/folders` rows with their
  counts; a chip pick SERVER-FILTERS the paged stream — `path_prefix` for a
  folder, `top_level=true` for top-level — and restarts at offset 0; the grid
  therefore pages exactly the stream the chip counts). Photo tiles render the
  real aspect ratio when the width/height facts exist and a capture-date
  footer from `date_taken` — absent fact → no footer (L1). Unknown module →
  module label + honest empty state (a stated TV divergence: the SPA's
  fallthrough is a generic item grid; TV renders the label + empty instead —
  never an error, never a hardcoded type list).
- **D7 — Watch flow mirrors the SPA's shipped affordances** on the overlay's
  controls layer (grounded in `SkipChip.tsx`, `AutoNext.tsx`, `InfoColumn.tsx`):
  the existing ControlsBar (position readout + the dpad hint line) gains a
  seek bar with the duration readout, plus OK-revealed info blocks — episode
  title/description («Серия»), cast («В ролях», served entries verbatim:
  name, optional role), series About (the served about block; series matched
  by the parsed path anchor, else the item's own block) — media-data
  convention fields only, absent field → absent block, nothing to say → no
  blocks (L1). SkipChip renders only while the playhead is inside a served
  classified range — intro «Пропустить вступление» / credits «Пропустить
  титры» — fades after ~4s, returns when a seek lands back inside, OK seeks a
  beat past the range's end. The AutoNext card («Следующая серия» + served
  series name · SxxEyy label) renders on an EPISODE's ended edge only — films
  never render it (no parseable facts → no pick, decided on served facts,
  never a media-type literal); countdown seconds = the SERVED watch-defaults
  `auto_next_countdown_seconds` — an unanswered, failed, or malformed shape
  means NO countdown and NEVER autoplay (the SPA bakes no fallback value);
  cancel suppresses the card for the session. The SPA PlayerLegend is a
  pointer:fine-only keyboard row — its TV counterpart is the existing dpad
  hint line; no separate legend row. No TV-specific wire — the descriptor,
  the metadata projection, the skip ranges, and watch-defaults are the same
  served shapes the SPA reads.
  **Video-surface punch-through law** (walk-found 2026-11-16, audio played
  while the panel stayed black): the SurfaceView composites the video plane
  BEHIND the app window, so nothing in the video's region may draw opaque
  pixels in the window — the player shell is a TRANSPARENT container (never
  Compose `Surface`, whose material background fills the window and hides
  the video; the base change's 5.9 shell carried this defect and no prior
  on-device walk had looked at the picture). Controls, chip, and auto-next
  overlays draw their own backgrounds over the transparent base.
- **D8 — Density/geometry law** (the Layer-7 lesson, applied natively): rows
  are height-aware — at this box's 1920×1080 (and a 960×540-class viewport)
  ≥2 grid rows + header fit the screen; type floors 18sp titles / 12sp meta;
  budgets size the GRID TRACKS, never the card inside width-driven tracks.
- **D9 — Visibility default law**: the app-wide dark `MaterialTheme` (landed
  2026-11-12) is permanent — every future screen inherits readable text
  defaults; a `Text()` that needs an explicit color outside the theme is a
  review flag, not a style choice.
- **D10 — Evidence law**: every surface task closes with on-device evidence
  (batched adb walk: screenshot + uiautomator dump through the
  `.claude/skills/adb-local` relay; the box cycles off-network, so walks are
  single-window scripts with `|| true` continuation). JVM tests pin the pure
  laws (walkers, field-driven mappers) exactly as 5.9's BackRestorationTest
  pins back restoration.
- **D11 — Tokens** (the guideline's §5, values verified against the code):
  focus ring `tvAccent` #4C8DFF, 2dp border, radius 6, scale 1.1 (ui/Focus.kt);
  background = black window + dark MaterialTheme defaults (D9); type accents
  serial #b7a6f4 · tv #f6c3a4 · image #a4e3c3 · audio/default #a4c8f4 — the
  SPA `.dot-*` map (D3); type
  floors titles 18sp · meta/facts 12sp · screen title 28sp; chips rail/scrim
  #171A21 · chip bg #2A2F3A (BrowseScreen.kt railColor/chipColor); density per
  D8. A new surface reaches for these tokens first — inventing a new color or
  size is a review flag.
- **D12 — Whole-app dpad map** (the guideline's §4): one table, the law every
  surface task checks its consumed/unconsumed arrows against:

  | surface     | ←/→               | ↑/↓             | OK            | Back               |
  |-------------|-------------------|-----------------|---------------|--------------------|
  | home rows   | walk row (L2)     | cross rows/grid | resume/play   | exit†              |
  | series grid | walk grid (L2)    | walk/cross up   | open series   | exit†              |
  | rail rows   | LEFT closes       | walk rail       | select+close  | close rail         |
  | series page | —(episodes vertical) | walk episodes | play episode  | → grid             |
  | player      | seek ∓10s/±10s    | —               | reveal/toggle | dismiss→pause+exit |
  | chips row   | walk chips        | ↓ → grid        | apply filter  | → grid             |
  | settings    | —                 | ↓ back into content | share (gated) | exit†          |

  † exit = the app's existing back behavior; never a silent state wipe.
  Player seek accelerates on hold (±10s → ±30s → ±60s, `seekStepMs`); Up/Down
  in the player stay unconsumed (the pinned routing law). The settings row is
  the existing gated share affordance (5.11) — DOWN from it crosses back into
  content natively; it gains no new surface in this change.

- **D13 — Visual parity scale** (operator direction 2026-11-16: the TV canvas
  visibly deviates from the web — "black background, small posters, large
  elements"; values read from the SPA sources, not invented):
  - **Window background** = the SPA dark token `--background: hsl(222.2 84%
    4.9%)` ≈ `#020617` (web/src/styles/index.css) — NOT the default
    `darkColorScheme()` background (≈ #1C1B1F gray) the app renders today
    (App.kt). The player shell stays transparent (D7 punch-through law).
  - **Fixed tile aspects** = the SPA's own fixed classes: poster artwork
    `aspect-[2/3] w-full` (components/Artwork.tsx) — serial series cards;
    tv stills `aspect-video` (Collection.tsx) — tv-module file cards; photo
    masonry keeps natural photo aspects. The TV's field-driven TILE aspect
    (ItemCards `aspectRatioOf` — served width/height) retires from tile
    rendering: it deviates from the SPA both ways (16:9 squat posters, and
    the SPA carries no served-aspect law). The FIELD-DRIVEN law (L1/L6)
    stands untouched for facts — names, counts, meta lines, footers.
  - **Centered content column** = the SPA's `mx-auto max-w-6xl` proportion
    (1152px on a 1920 viewport = 60%): the browse content (home rows +
    collection grids) lives in a centered 60%-width column (576dp at the
    box's density 320) — series grid 4 posters across (≈135dp tiles), tv
    file grid 3 stills across, home rows' 16:9 cards 3 across; type floors
    UNCHANGED (D11 — the large text on the small tiles IS the parity: the
    SPA pairs 14%-wide posters with its own type scale; on TV the floors
    give the same relationship); the rail keeps its 360dp (§3.2, unchanged).
  - **Reachability law** (walk-found 2026-11-16 on 0.3.3, task 8.3): the
    column's content scrolls — the SPA page it mirrors scrolls natively, and
    the TV's stacked rows+body overflow 540dp, so without scroll the body
    renders into a zero-height viewport (composes nothing; focus walks it
    invisibly). Bring-into-view rides focus moves; opening a body through
    the rail scrolls the body's top INTO VIEW — the activation is a visible
    swap, the SPA's page shape (the user SEES the body they opened).

## IA parity map (the mirror inventory)

Grounded against the real SPA sources; ✅ = exists on TV, ⬜ = this change's
tasks, — = out of scope.

| web/src | TV surface | status |
|---|---|---|
| pages/home/Home.tsx (Collections → Continue rail, ONE /home read) | collections rail (5.15) + Continue + Next-up rows over the same /home wire (D4) | rail ✅; rows ⬜ (group 3) |
| pages/collections/Collection.tsx (module-keyed CollectionBody) | module-keyed body (D6): serial grid / tv file cards / photo grid+chips | serial ✅; rest ⬜ (group 4) |
| components/metadata/Synopsis.tsx (served about block) | series hero facts line + Synopsis block (D5) | ⬜ (2.1) |
| Collection.tsx EpisodesView + EpisodeCard | episode rows, 72dp, tri-state bar/glyph (D5) | rows ✅; parity ⬜ (2.2) |
| components/WatchedStates.tsx (tri-state, ✓ glyph) | ✓ glyph at meta scale, word chips retired (D2) | ⬜ (1.3) |
| components/playback/Player.tsx | PlayerOverlay Active (exists) | ✅ |
| SkipChip.tsx | skip chip in range, both kinds (D7) | ⬜ (5.2) |
| AutoNext.tsx | «Следующая серия» + served countdown (D7) | ⬜ (5.2) |
| components/watch/InfoColumn.tsx | OK-revealed info blocks (D7) | ⬜ (5.1) |
| PlayerLegend.tsx (pointer:fine-only keyboard row) | the ControlsBar's existing dpad hint line — no separate TV legend | ✅ (existing) |
| components/Sidebar.tsx | collections rail (5.15) | ✅ |
| FacetChips.tsx (genre/kind[/status] lanes on serial grids) | folded by the 2026-11-17 amendment (tasks 10.1–10.2) — the serial facet lane renders in every body state; the photo folder chips are PhotosBody's own FolderChip idiom and ARE folded (D6) | group 10 |
| SearchPalette.tsx; manage/* overlays; admin pages | — operator/desktop surfaces stay in the SPA | — |

## Screen layouts (16:9 wireframes; ▣ = focusable, █ focused)

### 3.1 Browse / Home (D4: SPA Home rows + the collection grid)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚙ Поделиться диагностикой                     (settings, gated 5.11) │
│                                                                      │
│ Продолжить                                    ← Continue row (D4)    │
│ ┌──────┐┌──────┐┌──────┐┌──────┐                                      │
│ │▓▓▓▓▓▓││ ▣ ▣  │…   ← horizontal walker; cards = 16:9 still,        │
│ │▓▓▓▀▀▀││      │      bar only when duration served, served          │
│ └──────┘└──────┘└──────┘└──────┘    position line (percent · pos)    │
│                                                                      │
│ Следующая серия                               ← Next-up row (D4)     │
│ ┌──────┐┌──────┐┌──────┐┌──────┐                                      │
│ │ ▣ ▣  ││      │…   anchor cards; OK plays the served next           │
│ └──────┘└──────┘└──────┘└──────┘                                      │
│                                                                      │
│ Ongoings · 181                       ← current collection (28sp)     │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐        ← series grid, 4 cols, 2:3        │
│ │████│ │ ▣  │ │ ▣  │ │ ▣  │          posters; ≥2 rows + header fit     │
│ └────┘ └────┘ └────┘ └────┘          the viewport (D8)               │
└──────────────────────────────────────────────────────────────────────┘
```

dpad: ←→ walk row · ↑↓ cross rows/grid · LEFT@row0-x0 → rail · OK acts
(Continue card = resume from stored position; Next-up card = play the served
next). No served rows → no row (L1), never an empty placeholder row.

### 3.2 Collections rail (exists — 5.15, unchanged)

Scrim #171A21 over the grid; the grid cursor PARKS. Rows: name (18sp) +
module label + count (accent, only when a summary answered). OK selects and
closes · LEFT/Back close · the cursor stays for the reopen (L3).

### 3.3 Series detail (D5: ItemDetail hero + Synopsis + episode rows)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌────┐  Свадьба светлячков            (28sp)                        │
│ │2:3 │  ★8.1 · 12 эп · 2026           ← facts line: the about       │
│ │post│                                  block's fact row (D5)       │
│ └────┘  Описание…                     ← Synopsis: the SERVED about  │
│         (muted, 2–4 lines)               block; absent → absent     │
│──────────────────────────────────────────────────────────────────────│
│ ▶ S01E01 · Название серии   [in-progress bar]      ← episode rows   │
│ ▶ S01E02 · Название серии   meta 12sp                (72dp, D5)     │
│ ▶ S01E03 · Название серии   ✓ (watched: meta-scale glyph, NO bar)    │
│   …                                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

dpad: ↑↓ walk episodes · OK plays (resume honors stored position) ·
Back → grid at the parked cursor (L3). The hero never takes dpad focus —
the episode list is the initial focus (the walker's home).

### 3.4 Card / row anatomy (D2: the SPA tri-state, TV-rendered)

```
  series card          episode row          continue card
  ┌──────────┐         ┌──────┬──────────┐  ┌──────────────┐
  │  2:3     │         │16:9  │ composed │  │ 16:9 still   │
  │  poster  │         │still │ name 18sp│  │ ▓▓bar▓▓(if)  │
  ├──────────┤         │      │ meta 12sp│  ├──────────────┤
  │ Title18sp│         │      │ ✓ meta12 │  │ Title 18sp   │
  │ meta 12sp│         └──────┴──────────┘  │ pos·percent  │
  │ ✓ (dim)  │                              └──────────────┘
  └──────────┘
```

✓ = ONE glyph, type accent, meta scale; a watched element dims its title and
renders NO bar (the tri-state law). NEVER words/badges («Просмотрено» chips
are RETIRED). The bar renders only when duration exists (L1 — never a guessed
percent). The position line is the SERVED position (percent · position ·
library name) — never a client-computed remaining label.

### 3.5 Player overlay + controls layer (exists; gains affordances, D7)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          (video, full-bleed)                         │
│                    Active overlay owns ALL keys (5.9)                │
│   [OK reveals controls]                                              │
│   ┌─ controls layer ────────────────────────────────────────────┐    │
│   │ bar ▂▂▃▅░░░░      42:10 / 24:00                              │    │
│   │ ←→ перемотка · OK пауза · Back скрыть   ← the hint line      │    │
│   │ S01E02 · Название серии       ← info blocks (D7)             │    │
│   │ «Серия» Описание…             ← absent field → absent block  │    │
│   │ «В ролях» Имя, Имя…                                          │    │
│   │ [Пропустить вступление]       ← only while inside the range  │    │
│   └──────────────────────────────────────────────────────────────┘    │
│   on end: «Следующая серия · S01E03» + countdown → autoplay          │
└──────────────────────────────────────────────────────────────────────┘
```

Transport stays the dpad (arrows seek ∓/±10s accelerating on hold, OK
reveal→toggle, Back dismiss→pause-then-exit — the pinned routing law); no
on-screen transport buttons and no separate legend row (the SPA's legend is
pointer:fine-only). The countdown is the SERVED watch-defaults seconds; an
unanswered shape → no countdown, never autoplay. Films never render the
auto-next card.

### 3.6 Photo collection body (D6: Collection.tsx image key)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Images · 10 472                                                      │
│ [Все] [2026] [nature] [архив]   ← folder chips, dpad row; counts     │
│  ███                            from the served folders read; a      │
│ │ ▣ │ ▣ │ ▣ │ ▣ │               pick server-filters + restarts 0     │
│ │ ▣ │ ▣ │ ▣ │ ▣ │  grid; tile footer = served date_taken           │
│ │ ▣ │ ▣ │ ▣ │ ▣ │  (absent → no footer); real ratio when served    │
└──────────────────────────────────────────────────────────────────────┘
```

Unknown module id → its own id as label + honest empty state (D6's stated
divergence from the SPA's generic item grid). The photo STAGE (immersive
viewer) stays an Open Question — grids and chips only in this round.

## The mirror pipeline (how a web feature becomes a TV surface)

1. Feature lands in the SPA (its own openspec change).
2. If it adds wire: Dtos.kt mirrors api.ts in the SAME change or its TV
   follow-up — field drift is a bug (L6).
3. TV mirror = new/extended surface under these laws; layout comes from the
   Screen layouts section (or extends it with a wireframe in the same genre).
4. Spec: a scenario under the android-tv-client capability.
5. Evidence: batched relay-adb walk (screenshot + uiautomator dump); the box
   cycles off-network — single-window scripts, `|| true` continuation (D10).

TV never invents: endpoints, client-side derivations, product features,
or pixel parity. IA + field blocks mirror; the shell adapts.

## Risks / Trade-offs

- [SPA evolves faster than the TV mirror] → the laws make mirrors mechanical;
  drift is a spec-level finding (the capability's scenarios), not a mystery.
- [Viewport variance across boxes] → D8 budgets are viewport-derived, not
  fixed-px; the capability snapshot already reports display facts per device.
- [Operator-dependent device evidence] → on-device tasks carry `audit: true`
  with evidence markers, the android-tv-app T0 precedent.
- [Photo stage parity scope creep] → deferred (Open Question); grids and chips
  only in this round.
- [Guideline-vs-SPA drift] → this design grounds every block in the named SPA
  source; where the guideline draft paraphrased loosely («ост.» remaining
  label, a baked 10s countdown, "first description-bearing namespace"), the
  SERVED idiom wins — L6 outranks the draft's shorthand.

## Migration Plan

Pure `android/` UI additions + the two landed working-tree fixes; APK versioning
rides the existing filename contract (`make apk` / `-PversionCode=$(date +%s)`
for ad-hoc debug deploys — the installed TV build already uses epoch codes, so
debug installs must pass one, or Android refuses the downgrade).

## Open Questions

- Photo stage (immersive viewer parity, the mockup-tv stage idiom) — this
  round or a follow-up?

Resolved by the guideline fold (recorded so they stay decided):
- Continue/Next-up presence with no history → render NOTHING (L1) — pinned by
  the guideline's home wireframe, task 3.2, and the spec scenario.
- Settings surface scope on TV → stays the gated share affordance (5.11)
  exactly as today; the dpad map's settings row (D12) adds no new surface.

---

## Amendment (2026-11-17): audit fixes + rail/menu restyle

Authored from the 2026-11-17 audit (.tmp/android-tv-audit-2026-11-17.md — the
amendment's spec; every fix carries file:line evidence there) plus the
operator's direct scope B (rail/menu restyle). Groups 9–14 ride this
amendment; the laws above stand unless a paragraph here explicitly amends
them.

### A. Audit fixes (scope A)

- **P0-1 Back-exit law (task 9.1).** reduce() drops ExitRequested in all
  three Starting phases and in Dead (identity rows) — Back on the preparing
  banner is a no-op trap. Amended law: ExitRequested →
  Transition(PlaybackState.Idle, emptyList()) in Describing/Playing/Polling
  and Dead — the Failed row's shape; Dead keeps the no-retry banner (Back
  only closes the overlay).
- **P1-2 voiceover picker (task 9.2).** KEYCODE_MEDIA_AUDIO_TRACK →
  DpadKey.AudioTrack → PlayerKeyAction.CycleVoiceover (Active overlay, any
  controls visibility — transport-class like Seek). The orchestration cycle
  is bounded by the plan's pick space and wraps: SingleVariant(n) → n picks
  (0..n−1), Rendition → the served voiceover count carried at plan build,
  NoPicker/zero → fail-open no-op; the pick rides the existing
  selectVoiceover (the k+1 mapping unchanged). descriptor.voiceovers is
  typed VoiceoverDto(index, label) — the L6 mirror of api.ts VoiceoverDTO;
  the info blocks list the served labels («Озвучка: …», field-driven).
- **P1-3 serial facet lane (tasks 10.1–10.2).** State shape: BrowseState
  gains facets: List<FacetDto> + facetSelection: Map<String,String> keyed
  genre/kind/status (PARAM_OF) — ONE conjunct value per key, AND across
  keys; toggling the active value clears that key; every change refetches
  /series with the params (the pickFolder idiom minus revert — a facet
  toggle is immediate). The lane reuses the FolderChip shell and renders in
  EVERY serial body state (loading/error/empty/grid); undefined facets
  render no chips; the facets fetch is best-effort (failure → empty chips,
  grid untouched).
- **P2/P3 fixes (tasks 11–12), one law line each:** home.error renders when
  rows are empty (pure homeErrorLine, JVM-pinned — 11.1); series cards carry
  the factsOf meta, absent metadata → absent (11.2); home cards carry the
  served series/episode/library lines, absent → absent (11.3); EpisodeRow
  title clamps to 1 line, CardView title to 2 (SPA clamp-2), both ellipsis —
  the fixed 36dp row law itself stands (11.4); the watched ✓ leaves the text
  stack for a corner mark over the art — card heights become
  watched-independent (12.1); PhotoViewer rulings — OK closes the viewer,
  Up/Down stay consumed-and-inert (the modal law: nothing to cross to), a
  «<i>/<n>» + served capture-date status line renders field-driven, the
  mockup's OK-slideshow is DEFERRED (12.2); the SeriesPage entry actuator
  consolidates on the shared 60-frame focusUntilAttached idiom (12.3); cast
  renders per-entry rows — 24dp portrait tiles only when the served cast
  carries portrait URLs (the ÷2 of the SPA's 48px), plain rows otherwise
  (12.4).

### B. Rail/menu restyle (scope B, task 14.1)

- **Colors — SPA DARK only.** Panel bg = AppCanvas #020617 (the SPA --card
  IS the same slate-950 token) with a 1dp end-edge border #1E293B (SPA .side
  border-right, --border slate-800); muted text #94A3B8 (SPA
  --muted-foreground). The mockup is a light-paper schematic: its ANATOMY is
  the spec (bordered rounded rows; focus = accent border + accent 14%
  background), its PASTEL PALETTE is a placeholder and never lands. New ui
  tokens: railBorder #1E293B, railMuted #94A3B8. D11's rail scrim #171A21 is
  superseded (the railColor/railWidth locals die); 8.13's #020617 law
  stands — no stray lighter surfaces.
- **Width — 360dp → 112dp, authored explicitly.** RAIL_PANEL_WIDTH = 112.dp
  in LayoutParity.kt, pinned in LayoutParityTest. Derivation: the SPA .side
  is 224px and the ÷2 law is walk-proven at density 2.0 (8.16: sp × 2 = SPA
  px; geometry authored ÷2 renders SPA-identical — cards 181.5dp = 363px
  proven twice on-device), so 112dp renders exactly 224px — the
  SPA-identical proportion. The 360dp value predates the law and renders
  720px = 3.2× the SPA proportion; the operator questioned exactly that
  scale. Rejected: keeping 360dp (no SPA grounding), 224dp (would render
  448px = 2× the SPA proportion — the ÷2 law, not 1:1 px, is the house
  rule). **Precedence:** task 8.2's «the rail keeps 360dp (unchanged)»
  prose, design D13's «the rail keeps its 360dp (§3.2, unchanged)», and the
  BrowseScreen.kt:181 comment are superseded by THIS 112dp law (execution
  order keeps them consistent: 8.2 lands green before 14.1).
- **Row anatomy (mockup card law + SPA SideColl).** Rows become bordered
  rounded cards: 1dp railBorder border, 4dp radius (SPA --radius 8px ÷ 2);
  4dp module dot in the type pastel (the D3 map = SPA dotClass); label
  TYPE_META (SPA .clink 12.5px ÷ 2) — tvAccent when selected (the existing
  law), railMuted otherwise; count TYPE_META railMuted (SPA .cnt). Focused:
  tvFocusStyle (2dp accent border + 1.1 scale) + tvAccent.copy(alpha 0.14)
  tint over the panel bg (the mockup's color-mix accent-14%).
- **Settled, unchanged.** The slide-in-over-left-edge law (5.15) STANDS; the
  menu-hidden-by-default law stands; open/close focus restore stands;
  RailLawTest stays green — this is presentation-only, zero flow laws move.

### C. Ownership boundaries

- Audit P1-1 (the five transport media keys — MediaTrackNext/PrevTrack/
  FastForward/Rewind/Stop — plus MediaSession, AC-14) is NOT in this
  amendment: it is owned by the android-tv-app change's task 5.10
  (single-writer across registers). The only key this change adds is
  KEYCODE_MEDIA_AUDIO_TRACK — not one of the five, no MediaSession contact.
- The photo-stage slideshow idiom (mockup OK = slideshow) is deferred; the
  viewer gains only the 12.2 rulings.
