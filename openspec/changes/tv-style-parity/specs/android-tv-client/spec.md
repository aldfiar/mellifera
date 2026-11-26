# Spec Delta — android-tv-client

## MODIFIED Requirements

### Requirement: Typography scale law

The app's typography SHALL render through the mode-aware type scale: three
presets of the SPA's desktop px — Компактный (×1.25, the SPA `html.tv` tier),
**Обычный (×1.5, the default)** and Крупный (×2) — with every rendered size
reading the shared mode-aware scale for the ACTIVE mode, never a raw sp
literal. The ruled panel-px table (the operator's 2026-11-26 rulings:
×2 «too large», ×1 «too small»; the table is the acceptance floor):

| Token | Компактный | Обычный | Крупный | Used by |
|---|---|---|---|---|
| META | 15 | **18** | 24 | facts, durations, counts, eyebrows, hints, ✓, status lines |
| SMALL | 17.5 | **20** | 28 | card titles, chip labels, synopsis |
| BODY | 20 | **24** | 32 | messages, empty/error lines |
| HEADING | 22.5 | **28** | 36 | section labels, «Продолжить», «Следующая серия» |
| READOUT | 25 | **24** | 32 | player clock |
| DISPLAY | 25 | **32** | 40 | page titles, hero title |
| CODE | 36 | 36 | 36 | pairing code (mode-independent) |
| FALLBACK_INITIAL | 45 | **54** | 72 | placeholder glyph |

Titles render weight 600 (semibold) and secondary titles weight 500 (medium);
the pairing code stays monospace with letterspacing; card titles clamp to two
lines with an ellipsis. The active mode is the user setting (the UI scale
settings requirement), default Обычный; a mode change re-scales every surface
live.

#### Scenario: Card titles carry weight and the small size

- **WHEN** a poster grid card renders its title at the Обычный mode
- **THEN** the title renders 20px weight 600 clamped to two lines — and the same slot renders 28px at Крупный and 17.5px at Компактный

#### Scenario: Mode change re-scales live

- **WHEN** the active mode changes while any surface is mounted
- **THEN** every token-reading text on that surface re-renders at the new mode's sizes without a restart

#### Scenario: Pairing code renders monospace

- **WHEN** the pairing screen renders the numeric code at any mode
- **THEN** it renders 36px in a monospace family with letterspacing — the CODE slot never scales with the mode

#### Scenario: Episode titles clamp at two lines

- **WHEN** an episode card's title exceeds its two-line slot
- **THEN** it clamps to two lines with an ellipsis — never a mid-glyph clip

### Requirement: Geometry parity law

Within the ÷2 authoring law, the layout constants SHALL mirror their SPA
sources: the shared gutter is 6dp (SPA `gap-3`), the screen-edge overscan
renders 24dp horizontal and 14dp vertical (the SPA-relative overscan), and the
content column is capped at 92vw (the SPA tv shell `min(92vw, 1800px)`). The
series hero poster renders at its natural 2:3 aspect from a 72dp width
(144×216px) — uncropped. Grid column counts are NOT constants: they are the
density contract's output (the grid density contract requirement) — the
fixed-3 ruling retires. Every geometry value SHALL read its shared constant —
never a raw dp literal at the call site.

#### Scenario: Hero poster renders the SPA proportion

- **WHEN** the series hero renders its poster
- **THEN** it occupies a 72dp-wide box at the natural 2:3 aspect (144×216px) with no crop — the retired 48×72dp box and the old fixed-crop stay retired

#### Scenario: Screen edges carry the SPA-relative overscan

- **WHEN** a page-edge inset is applied (series page, collection body, home rows, settings overlay, pairing page)
- **THEN** it reads the 24dp/14dp overscan constants

#### Scenario: The content column spans the tv shell width

- **WHEN** the browse content column measures its width
- **THEN** it takes 92% of the viewport — the SPA tv shell cap

#### Scenario: The gutter stays the SPA gap halved

- **WHEN** any grid or lane spaces its tiles
- **THEN** the gutter reads the 6dp shared constant

### Requirement: Home surface mirrors the web UI

The browse screen's top SHALL mirror the SPA Home order: the Continue row
(last played with progress bars; OK resumes) and the Next-up row (next
episodes; OK plays) under the collections rail idiom, both rendered from the
ONE served /home response — rows carrying `current` are resume cards, rows
without it are anchor cards whose served `next` offer is the play affordance —
verbatim in the served order. Rows render FOUR cards across (16:9) with the
web's caption hierarchy: resume cards carry eyebrow (META) → title (SMALL,
clamped to ONE line) → position line (META) over the progress bar; anchor
cards carry title (SMALL, one line) → «Следующая: SxxEyy» + library (META).
No Collections card row renders on Home. When the rows' content is shorter
than the viewport the rows block centers vertically; the row-end padding is
symmetric (the peeking card clips at the same inset on both sides). When the
collections rail is open the content column offsets by the rail's width so
the first card is never under the rail. Rows navigate by the cursor-in-state
dpad law; an arrow the law cannot satisfy is left unconsumed; Back restores
the exact prior cursor; LEFT at row-0 x=0 opens the collections rail. On
foreground resume the app refetches /home; the visible rows AND an error line
stay until the answer lands.

#### Scenario: Continue row resume

- **WHEN** the home surface renders with progress history and OK presses a focused continue card
- **THEN** playback starts from the stored position

#### Scenario: Empty history renders nothing

- **WHEN** there is no progress history
- **THEN** no continue row renders (field-driven absence, never a placeholder row)

#### Scenario: Rail opens from home

- **WHEN** LEFT is pressed at row-0 x=0 on the home surface
- **THEN** the collections rail opens with focus on the current collection

#### Scenario: Next-up anchor card plays

- **WHEN** a served home row carries no `current` and a `next` offer
- **THEN** it renders in the Next-up row and OK starts playback of the offered next episode (the served label renders verbatim)

#### Scenario: Failed home fetch renders the error line

- **WHEN** the /home fetch fails and no rows render
- **THEN** the surface shows the served error message as a visible one-liner; with rows present the line never renders

#### Scenario: Four cards across with one-line titles

- **WHEN** the home rows render at Обычный/Авто
- **THEN** four 16:9 cards span the row and a long card title clamps to one line — never growing the card or ragging the row

#### Scenario: Short content centers vertically

- **WHEN** the home rows' content is shorter than the viewport height
- **THEN** the rows block centers vertically (equal bands above and below) — no dead band pinned to the bottom

#### Scenario: Rail open never overlaps the first card

- **WHEN** the collections rail is open on the home surface
- **THEN** the content column offsets by the rail width and the first card's left edge clears the rail panel

#### Scenario: Foreground resume refetches home

- **WHEN** the app returns to the foreground with the home surface mounted
- **THEN** /home refetches; the prior rows and any error line stay visible while the fetch is in flight, a successful answer replaces the state whole, and a failure keeps the prior posture (the stale error line heals on the next successful answer)

### Requirement: Series detail mirrors the web UI

The series page SHALL render a hero zone — a breadcrumb line
(«<library label> › <title>» at META), the poster at its natural 2:3 from a
72dp width (uncropped), the title at DISPLAY clamped to two lines, the facts
line at META, and the Synopsis block from the served metadata.about projection
at SMALL clamped to THREE lines (the server-resolved convention block, absent
→ absent) with genre chips at META — above the EPISODE GRID: 16:9 episode
cards (still → title clamp-2 → duration at META, the ✓ corner mark and the
in-progress bar rendered ON the still per the card law's tri-state). The
episode card title renders the served document `title` when present, else the
composed name — never re-derived. The grid's column count is the
«Эпизодов в ряду» setting (Авто = 3 at Обычный via the density contract with
the hero reserve; 2 / 3 / 4 when overridden). The grid navigates by the same
dpad walker law as the poster grid; the initial focus lands on the first
unwatched episode when the served rows carry watched states, else index 0. OK
on an episode SHALL start playback. BACK returns to the series grid
(the chain unchanged). The hero SHALL take no dpad focus — the episode grid
holds the initial focus.

#### Scenario: Episodes render as a grid

- **WHEN** the series page opens at Обычный with the «Эпизодов в ряду» setting at Авто
- **THEN** the episodes render as 16:9 cards in a 3-column grid under the hero — not the retired single-column list

#### Scenario: Served title precedence

- **WHEN** a served episode document carries a title field
- **THEN** the card renders it; a document without one renders the composed name — never a client-side re-derivation

#### Scenario: Initial focus lands on the first unwatched

- **WHEN** the series page opens and the served episodes carry watched states with at least one unwatched
- **THEN** the focus ring lands on the first unwatched episode; an all-watched page lands on index 0

#### Scenario: Synopsis is field-driven

- **WHEN** a series carries no description-bearing namespace
- **THEN** no Synopsis block renders — never a placeholder; a longer synopsis clamps to three lines with an ellipsis

#### Scenario: Episode OK plays

- **WHEN** OK presses a focused episode card
- **THEN** the player overlay starts for that episode (the 2026-11-12 dead-OK defect stays fixed)

#### Scenario: Progress bar on the row

- **WHEN** an episode has stored playback progress and is not watched
- **THEN** its card renders the progress bar on the still; OK resumes from the stored position; a watched card renders the ✓ corner and NO bar

#### Scenario: Overflowing titles clamp with an ellipsis

- **WHEN** an episode card's title exceeds its two-line slot or the hero title exceeds its two-line slot
- **THEN** the text clamps with an ellipsis — never a mid-glyph clip

#### Scenario: Hero never takes focus

- **WHEN** the series page opens
- **THEN** the episode grid holds the initial focus and the hero zone takes no dpad focus

### Requirement: Collections rail geometry

The collections rail SHALL render at the mode's authored panel width — 96dp at
Компактный and Обычный, 112dp at Крупный (the Крупный widening serves the
8-char name floor at the larger type and is confirmed by the on-device walk) —
as a border box; every rail row SHALL keep a uniform full-slot width
regardless of a count label's presence or absence, and every rail row's name
and module texts SHALL clamp to one line with an ellipsis — never a ragged
card width and never a mid-glyph clip. Rail row heights derive from the mode
(48dp at Обычный per the chip-tier derivation); the rail renders a fixed last
row «Настройки» below the libraries with a divider above it — always present,
reachable with DOWN from the last library, opening the settings overlay on OK,
and BACK from the overlay restores the rail's focus on that row.

#### Scenario: Count-less rows keep uniform width

- **WHEN** the rail renders rows where some carry a count label and some do not
- **THEN** every row card fills the full rail slot width (uniform edges) and the focused card stays inside the content column

#### Scenario: Long names clamp to one line

- **WHEN** a rail row's collection name or module line exceeds the row's one-line text box
- **THEN** the text clamps to one line with an ellipsis — never a wrapped or clipped row, and the card height stays uniform across rows

#### Scenario: Row height follows the mode

- **WHEN** the rail renders at Обычный
- **THEN** its rows render at the mode-derived 48dp height (38dp is retired); Компактный and Крупный render their derived tier heights

#### Scenario: The settings row is reachable and restores

- **WHEN** DOWN walks past the last library row
- **THEN** focus lands on the fixed «Настройки» row; OK opens the settings overlay; BACK from the overlay closes it and restores the rail's focus on that row

### Requirement: Module-keyed collection bodies

The collection body SHALL be keyed by the served module_id exactly as the SPA
keys it: serial → series poster grid; tv → episode file cards in the same
grid; image → photo grid with a dpad-walkable folder-chips lane whose counts
come from the same stream that pages the grid; an unknown module renders its
own module label and an honest empty state — never a hardcoded type list and
never an error. The body's header SHALL be ONE line — the collection title at
DISPLAY plus a small type badge chip in the module's pastel — with NO
count/description line (the rail carries the count). The serial grid
additionally carries the SPA's facet lane — the served /libraries/{id}/facets
rendered as chips in every body state, whose selection conjuncts across facet
keys and drives the /series query. Serial card captions SHALL render the
title clamped to two lines and ONE caption line: at the densest lanes the
«Season N» chip (served `season`, absent → absent) plus the ★ score (META,
served `score`, absent → absent); at lanes wide enough to fit it, the full
facts line renders — the lane WIDTH decides, never a hardcoded column count.
The watched ✓ stays the art-corner mark.

#### Scenario: Unknown module is honest

- **WHEN** a collection arrives with a module_id the client has never seen
- **THEN** the body renders the module's own id as label and an empty state

#### Scenario: Header is one line with a type badge

- **WHEN** a serial collection body renders
- **THEN** the header is the title at DISPLAY with the module's type badge chip — no count or description line under it

#### Scenario: Dense-lane caption carries the served compact line

- **WHEN** the serial grid renders at the 7-column lane (Обычный/Авто)
- **THEN** each card's caption is ONE compact line built from the served facts only — today the wire serves no `season` on series rows, so the caption is the ★ score (a served `season` slots the «Season N» chip in as its sibling without a client-side derivation, which the opaque-document law forbids); at a 4–6 column lane the full facts line renders instead

#### Scenario: Photo folder chips

- **WHEN** an image collection with subfolders renders
- **THEN** a chips lane lists the folders; OK on a chip filters the grid; counts match the paged stream

#### Scenario: Serial facet lane renders in every body state

- **WHEN** a serial collection body renders in any state — loading, error, empty, or grid
- **THEN** the facet lane renders above the body content (the control driving the /series query), never only on a populated grid

#### Scenario: Facet toggle conjuncts across keys and clears

- **WHEN** OK presses a facet value chip
- **THEN** the grid refetches with that value ANDed across facet keys (one value per key); pressing the active value again clears that key's filter

#### Scenario: Photo viewer rulings and status line

- **WHEN** the photo viewer is open over a loaded photo row
- **THEN** OK closes it, Up/Down stay consumed with no act, and a «<i>/<n> · <W>×<H>» status line renders plus the served capture date when the document carries one (absent → absent)

#### Scenario: Body-top landing clears the sliver

- **WHEN** the rail activates a collection and the body swap settles
- **THEN** the body's content lands at the viewport top with no residual band of the home surface above it

### Requirement: Focus ring law

The focused element's visual SHALL be the SPA tv focus law: a slate #CBD5E1
outline whose width follows the dpr-clamped formula (clamp(2px/dpr, 0.2vw,
5px/dpr)), drawn outside the element with an offset, following the element's
own corner radius — with NO scale transform. The blue accent border + scale
1.1 idiom SHALL NOT render. RAIL-ROW EXCEPTION: a focused collections-rail row
SHALL render a 2dp border in its module's type pastel instead of the slate
outline — the rail's focused affordance; every other focusable element keeps
the slate law.

#### Scenario: Focus renders the slate outline without scale

- **WHEN** any focusable element other than a rail row takes focus
- **THEN** it shows the slate outline at the clamped width with its own corner radius and no size change

#### Scenario: Rail rows carry the type-pastel border

- **WHEN** a collections-rail row takes focus
- **THEN** it renders a 2dp border in its module's type pastel (the dotSerial family) — not the slate outline, and never the blue accent

#### Scenario: The outline follows the element radius

- **WHEN** a focused element carries a non-default corner shape (a rail row's card, a pill chip)
- **THEN** the outline follows that shape — never a fixed-radius ring over a different corner

## ADDED Requirements

### Requirement: Grid density contract

Every card grid and home row SHALL derive its column count and tile track
from a viewport-HEIGHT budget, not a constant: the tile track is the lesser of
the width fit (the available width divided by the column count) and the height
fit (the viewport height minus the mode's chrome reserve and the per-row
caption reserve, divided by the row tier, scaled by the surface's aspect); the
tier is TWO rows when the resulting track meets the 110dp poster width floor,
else ONE row plus a peek of the next. The column count without an override is
the largest that fits the height-fit track; the «Постеров в ряду» (4..7) and
«Эпизодов в ряду» (2..4) overrides replace the auto count, clamped so a
caption never clips. Авто renders the exact-fill tier — the rows fund the
whole height budget, so the AUTO peek is 0; a peek of the next row exists
only on the one-row tier at an override. The contract feeds: the serial
poster grid (2:3 — Обычный/Авто = 7 × 2 with ≈230×345px posters and 14
titles on screen; Крупный/Авто = 4 on one row, peek = 0; overrides 4/5/6
render the one-row tier with a growing peek), the tv stills grid (16:9, the
same law, no special case), the
photo grid (1:1, «Авто» = 4 → two full rows of 216dp squares at
540dp/Обычный), the home rows (16:9, four across), and the episode grid
(hero reserve, «Эпизодов в ряду» Авто = 3 at Обычный). The pinned output
tables are the acceptance floor at 960×540, 1280×720 and 1920×1080 dp.

#### Scenario: Обычный auto tiles seven across two rows

- **WHEN** the serial poster grid renders at 960×540 dp, Обычный, «Авто»
- **THEN** it renders 7 columns × 2 rows of ≈230×345px posters, the two rows filling the height budget exactly (peek = 0, no third-row peek), 14 titles on screen — no poster or caption clipped

#### Scenario: Крупный auto drops to four on one row

- **WHEN** the serial poster grid renders at Крупный, «Авто»
- **THEN** it renders 4 columns on one full row @216dp with peek = 0 — the one row fills the height budget exactly, captions unclipped; at 1280×720 / 1920×1080 the law's two-row tier returns (7 × 2 / 6 × 2)

#### Scenario: The override clamps by the caption law

- **WHEN** «Постеров в ряду» is set to 6 at Обычный
- **THEN** the grid renders 6 columns plus a peek at the width-fit track (the override's one-row tier); an override above what fits never clips a caption

#### Scenario: The photo grid auto-fours

- **WHEN** the image grid renders at Обычный, «Авто»
- **THEN** it renders 4 columns of 216dp squares — two full rows inside the height budget

#### Scenario: Home rows ride the same law

- **WHEN** the home rows render at Обычный/Авто
- **THEN** four 16:9 cards span each row (≈209dp cards, ≈371dp of the 540dp height for two rows with their labels)

### Requirement: UI scale settings surface

The app SHALL expose its visual scale as user settings through a focused
overlay opened from the rail's fixed «Настройки» row: «Масштаб интерфейса»
(Компактный / Обычный / Крупный — OK or LEFT/RIGHT cycles, applied LIVE so the
mounted surfaces re-tile while the overlay is open), «Постеров в ряду»
(Авто / 4 / 5 / 6 / 7), «Эпизодов в ряду» (Авто / 2 / 3 / 4), «Поделиться
диагностикой» (the telemetry-gated share action, moved here from the retired
corner affordance), «Сервер» (the configured address, read-only), and
«Отвязать устройство» (wipes the stored token and returns to Pairing). Every
choice SHALL persist across relaunch beside the server address; the defaults
are Обычный / Авто / Авто so first run needs no setup. BACK closes the overlay
and restores the rail's focus on the «Настройки» row.

#### Scenario: Live re-tile while open

- **WHEN** the user cycles «Масштаб интерфейса» while the overlay is open
- **THEN** the mounted home/collection/series surfaces re-tile at the new mode immediately — visible behind/around the overlay without closing it

#### Scenario: Choices persist across relaunch

- **WHEN** the user sets Крупный / 5 / 3 and the app relaunches
- **THEN** the app boots at Крупный with 5 poster columns and 3 episode columns — the stored values, not the defaults

#### Scenario: First run needs no setup

- **WHEN** the app runs with no stored settings
- **THEN** the scale is Обычный and both column settings are Авто

#### Scenario: Unpair wipes and returns to pairing

- **WHEN** OK presses «Отвязать устройство»
- **THEN** the stored token wipes and the app shows the Pairing surface — never auto-firing a re-pair

#### Scenario: Share stays gated

- **WHEN** the telemetry gate is off
- **THEN** the «Поделиться диагностикой» row renders no share action (the gating follows the retired corner affordance's law)

### Requirement: Player controls chrome

The player overlay's revealed controls SHALL carry the web's chrome: a top
title bar — series · SxxEyy · episode title at HEADING over a top gradient,
read from the same served info blocks the info column reads (absent → no
bar); a seek bar 6dp thick with a 14dp knob at the playhead (accent fill
kept); the clock at READOUT, the key-hint legend at SMALL, info headings at
SMALL with body lines at META, and the voiceover line at META. The auto-hide
timing and the key routing (arrows seek, OK toggles/reveals) are unchanged.

#### Scenario: Title header renders from served blocks

- **WHEN** the controls reveal for an episode whose served info blocks carry series and episode names
- **THEN** the title bar renders series · SxxEyy · episode title at HEADING over the gradient; a playback without served info renders no bar

#### Scenario: The knob marks the playhead

- **WHEN** the controls render with the seek bar
- **THEN** the bar is 6dp thick and a 14dp knob sits at the current playhead position

#### Scenario: Auto-hide unchanged

- **WHEN** the controls are revealed and the hide window elapses without input
- **THEN** the controls hide on the same timing as before this change

### Requirement: Photo tile fit-over-blur rendering

Image-collection tiles SHALL render a uniform 1:1 box where the photo FITS
whole (FIT-center, never center-cropped) over a fill derived from the same
photo scaled to cover and blurred; below API 31 the fill is a solid dark
color. One image request SHALL load each tile's photo (both layers read the
same result). No caption renders on the photo grid.

#### Scenario: A portrait photo shows whole

- **WHEN** a portrait-orientation photo renders in its square tile
- **THEN** the photo fits entirely inside the tile with blurred fill bands on the sides — no head/feet crop

#### Scenario: One request feeds both layers

- **WHEN** a tile loads its photo
- **THEN** a single image request produces the blurred fill and the fit foreground — never two independent fetches

#### Scenario: Below API 31 the fill is solid

- **WHEN** a tile renders on a device below API 31
- **THEN** the fill layer is a solid dark color and the foreground still fits whole

### Requirement: Facet and folder chips lane

The serial facet chips and the image folder chips SHALL each render ONE
horizontally scrollable lane (never wrapped into multiple rows, never clipped
at the lane's end), chip height from the mode (36dp at Обычный; 30 / 48dp at
Компактный / Крупный), label at SMALL with the count at META, and the selected
chip carrying the active background change (the chip idiom law). LEFT/RIGHT
walks the lane and scrolls it with the cursor — every chip is reachable on the
dpad; UP/DOWN semantics are unchanged (the lane's consumption follows the
in-force chips-row law).

#### Scenario: Fourteen folders all reachable

- **WHEN** an image collection renders 14 folder chips
- **THEN** all 14 render in one scrollable lane and RIGHT past the visible edge scrolls the lane with the focus — no chip is clipped out of reach

#### Scenario: No wrapped rows

- **WHEN** a serial collection renders its facet lane
- **THEN** the facets render in ONE row — the retired wrapped two-row layout never renders

#### Scenario: UP leaves the lane by the in-force law

- **WHEN** UP is pressed on a focused chip
- **THEN** the consumption follows the in-force chips-row law (unchanged by this restructure)
