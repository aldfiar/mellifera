# android-tv-client Specification

## Purpose
Extends the Android TV client with the layout-parity contract: the TV app
renders the same layouts as the web UI (same information architecture, same
field-driven blocks), navigated by the dpad laws the browse surface
established. Covers the text-visibility default, card anatomy, the Home
surface, the series-detail surface, module-keyed collection bodies, and
watch-flow affordances.

## Requirements

### Requirement: Text visibility default

The app SHALL wrap its whole tree in a dark MaterialTheme so every
default-styled text is readable against the dark window background; loading
and error one-liners SHALL be visible without any per-call color. The
window background SHALL paint the scheme canvas (#020617) via the XML theme
— never a Compose-layer paint over the video region (punch-through law).

#### Scenario: Default text is readable

- **WHEN** any screen renders a default-styled Text (title, loading row, error row)
- **THEN** it is legible on the dark canvas background — never dark-on-dark

#### Scenario: Invisible text regression

- **WHEN** a surface renders titles/meta that the a11y tree carries but the screenshot does not show
- **THEN** that is a defect of this requirement, not a rendering nuance

#### Scenario: Window paints the scheme canvas

- **WHEN** the app window renders — cold start, the home surface, or any screen
- **THEN** the window background is the scheme canvas color from the XML theme (values/colors.xml `app_canvas` referenced by themes.xml), matching the web UI's #020617, and no root Compose surface paints an opaque background over the video region

### Requirement: Card state-signal scale on TV

A per-item watched hint SHALL be exactly one ✓ glyph in the type accent at
meta-line scale, placed as a corner mark over the art block (the SPA
watched-signal corner placement); unwatched SHALL render absence — no mark,
no space. Word chips («Просмотрено»/«Не просмотрено») and badges SHALL NOT
appear on cards.

#### Scenario: Watched glyph

- **WHEN** a card with watched=true renders
- **THEN** it carries one ✓ glyph as a corner mark over the art at meta scale and no watched word or badge

#### Scenario: Unwatched is absence

- **WHEN** a card with watched=false renders
- **THEN** it carries no watched glyph, word, or badge

### Requirement: Home surface mirrors the web UI

The browse screen's top SHALL mirror the SPA Home order: Continue row (last
played with progress bars; OK resumes) and Next-up row (next episodes; OK
plays) under the collections rail idiom, both rendered from the ONE served
/home response — rows carrying `current` are resume cards, rows without it
are anchor cards whose served `next` offer is the play affordance — verbatim
in the served order. Rows navigate by the cursor-in-state
dpad law; an arrow the law cannot satisfy is left unconsumed; Back restores
the exact prior cursor; LEFT at row-0 x=0 opens the collections rail.

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

### Requirement: Series detail mirrors the web UI

The series page SHALL render a hero zone (poster, title, facts line and
Synopsis block from the served metadata.about projection — the
server-resolved convention block, absent → absent) above the episode list;
episode rows SHALL carry the composed name,
a field-driven meta line, the card law's tri-state (an in-progress bar when
a stored position exists and the row is not watched; watched → the ✓ glyph
and NO bar), and the state
glyph per the card law. OK on an episode SHALL start playback. The hero
SHALL take no dpad focus — the episode list holds the initial focus.

#### Scenario: Synopsis is field-driven

- **WHEN** a series carries no description-bearing namespace
- **THEN** no Synopsis block renders — never a placeholder

#### Scenario: Episode OK plays

- **WHEN** OK presses a focused episode row
- **THEN** the player overlay starts for that episode (the 2026-11-12 dead-OK defect stays fixed)

#### Scenario: Progress bar on the row

- **WHEN** an episode has stored playback progress and is not watched
- **THEN** its row renders a progress bar; OK resumes from the stored position

#### Scenario: Hero never takes focus

- **WHEN** the series page opens
- **THEN** the episode list holds the initial focus and the hero zone takes no dpad focus

#### Scenario: Overflowing titles clamp with an ellipsis

- **WHEN** an episode-row title exceeds its two-line slot or a card title exceeds two lines
- **THEN** the text clamps with an ellipsis — never a mid-glyph clip

### Requirement: Module-keyed collection bodies

The collection body SHALL be keyed by the served module_id exactly as the SPA
keys it: serial → series poster grid; tv → episode file cards in the same
grid; image → photo grid with a dpad-walkable folder-chips row whose counts
come from the same stream that pages the grid; an unknown module renders its
own module label and an honest empty state — never a hardcoded type list and
never an error. The serial grid additionally carries the SPA's facet lane —
the served /libraries/{id}/facets rendered as chips in every body state,
whose selection conjuncts across facet keys and drives the /series query.

#### Scenario: Unknown module is honest

- **WHEN** a collection arrives with a module_id the client has never seen
- **THEN** the body renders the module's own id as label and an empty state

#### Scenario: Photo folder chips

- **WHEN** an image collection with subfolders renders
- **THEN** a chips row lists the folders; OK on a chip filters the grid; counts match the paged stream

#### Scenario: Serial facet lane renders in every body state

- **WHEN** a serial collection body renders in any state — loading, error, empty, or grid
- **THEN** the facet lane renders above the body content (the control driving the /series query), never only on a populated grid

#### Scenario: Facet toggle conjuncts across keys and clears

- **WHEN** OK presses a facet value chip
- **THEN** the grid refetches with that value ANDed across facet keys (one value per key); pressing the active value again clears that key's filter

#### Scenario: Photo viewer rulings and status line

- **WHEN** the photo viewer is open over a loaded photo row
- **THEN** OK closes it, Up/Down stay consumed with no act, and a «<i>/<n>» status line renders plus the served capture date when the document carries one (absent → absent)

### Requirement: Watch-flow affordances on TV

The player overlay's controls layer SHALL mirror the SPA's shipped
affordances: OK-revealed info blocks (episode title/description, cast, series
About — the served metadata projection only, absent → absent), a skip chip
(intro or credits) while the playhead is inside a served classified range,
and an auto-next card on an episode's ended edge whose countdown seconds come
from the served watch-defaults — no usable served value means no countdown
and never autoplay. No TV-specific wire shapes. The passive overlays
(preparing/polling/dead) exit on Back — never a trap — and a served
voiceovers list is cyclable by the audio-track key within the plan's pick
space.

#### Scenario: Skip chip appears in range

- **WHEN** playback is inside a parsed skip section and controls are revealed
- **THEN** a «Пропустить вступление» chip renders and seeks past the range on OK

#### Scenario: Info blocks are field-driven

- **WHEN** the controls layer renders for an episode with no description field
- **THEN** the description block is absent, the other blocks render from their fields

#### Scenario: No served countdown never autoplays

- **WHEN** the auto-next card opens and the watch-defaults shape has not answered or is malformed
- **THEN** the card renders without a countdown and never autoplays — the manual play path stays available

#### Scenario: Back exits the preparing or dead overlay

- **WHEN** the player overlay shows the preparing/polling banner or the dead banner and Back is pressed
- **THEN** the overlay exits to the prior surface — the passive states are never a trap

#### Scenario: Voiceover cycle within the served plan

- **WHEN** the playback plan serves voiceovers and the audio-track key is pressed on the Active overlay
- **THEN** the pick advances and wraps within the plan's pick space (the k+1 track mapping rides); a plan with no voiceover picks never acts

#### Scenario: Cast renders one row per served entry

- **WHEN** the controls layer renders the cast block
- **THEN** each served cast entry renders as its own row (name + role; a 24dp portrait tile only when the entry serves a portrait URL) — the joined single line never renders

### Requirement: Collection body lifecycle

The collection body SHALL be one explicit surface driven solely by
activation: the body mounts only while the body-open state flag is true;
closing the body SHALL clear every body field (the body cluster resets to
fresh-body defaults) while keeping the collection identity (libraryId),
the rail summaries, and the rail focus; entering the collections surface
SHALL NOT pre-load a default body — the entry surface is the home rows
alone, and the first body fetches at the first explicit activation;
switching collections SHALL show only the new collection's data from the
moment the switch commits. BACK from an open body SHALL close it onto the
bare home surface — home rows only, no body nodes.

#### Scenario: Switching collections shows only the new collection

- **WHEN** a collection body is open and the rail activates a different collection
- **THEN** after the switch commit the body shows only the new collection's data — rows, facets, folders, series, offsets and cursor positions all belong to the new collection; any in-flight write from the previous collection never lands in it (the epoch guard requirement)

#### Scenario: Entry renders home rows only

- **WHEN** the collections surface is entered from home
- **THEN** no default body mounts and no default body fetch runs — the surface shows the home rows; the first body fetch happens at the first explicit rail activation

#### Scenario: Back closes the body onto the bare home

- **WHEN** BACK is pressed from an open collection body
- **THEN** the body closes and unmounts onto the bare home surface (home rows only, no body nodes), every body field is cleared to fresh-body defaults, and the collection identity, summaries and rail focus are kept so the rail still marks the current collection

#### Scenario: Activation lands the body top

- **WHEN** the rail activates a collection and the body swap settles
- **THEN** the body's top holds the viewport top (the landing actuation re-arms until it lands), and BACK after the landing closes the body — the ambiguous «is the body open?» state no longer exists

### Requirement: Body-epoch race guard

Every collection-body write SHALL be epoch-guarded: a body epoch SHALL
advance at every collection enter/switch commit, each body-write site
SHALL capture the epoch before its await and drop the write when the
epoch no longer matches — with no cancellation and no request
dedication (the check is the guard). This covers row paging and
appends, the serial commit, facet loading and toggling, folder loading,
the series-page commits, and the refresh path's body writes.

#### Scenario: Append never bleeds across a switch

- **WHEN** a paged append of collection A is still in flight while the rail commits a switch to collection B, and A's page then resolves
- **THEN** A's page is dropped — B's body ends with only B's rows, and A's items never append under B's header

#### Scenario: Late series page never resurrects the old series

- **WHEN** a series detail fetch of collection A resolves after a switch to collection B committed
- **THEN** the stale series write is dropped — B's body never carries A's series page

#### Scenario: Same-epoch write still lands

- **WHEN** a body write completes without any intervening enter/switch commit
- **THEN** it lands normally — the guard never drops a current-epoch write (no over-guard)

### Requirement: Grid cursor actuation

In every mounted card-grid body the dpad arrow keys SHALL move the focus
ring: the grid cursor actuator SHALL live for the whole body lifetime —
keyed on the grid cursor AND the rail-open state (the mount-run must not
fire while the rail is open and steal focus from the rail's focused row) —
and re-land the ring on every grid-cursor change regardless of the entry
state, while the home-surface entry claim SHALL be a separate effect keyed
on (mount, homeHoldsEntry) — never the cursor key — so the claim re-runs
when the home verdict flips. A consumed arrow move SHALL always be
backed by a live actuation — consumption is never a blind state write.

#### Scenario: Arrows move the ring in every body class

- **WHEN** RIGHT or DOWN is pressed on a focused tile in any mounted card-grid body (serial, tv, image) while the home surface serves rows
- **THEN** the cursor state advances AND the focus ring follows to the new tile — no consumed-but-inert move (the byte-identical re-proof class from the walk ledger)

#### Scenario: Entry claim stays gated

- **WHEN** a collection body mounts from a rail activation while the home surface holds a focusable card
- **THEN** the grid's cursor-0 entry claim stands down — the activation landing owns the cursor (the body's first tile per the landing law); when the home surface cannot hold a card (a failed or resolved-empty home), the grid's cursor-0 claim lands instead

#### Scenario: Consumption never blind

- **WHEN** a card consumes a law-satisfiable arrow move
- **THEN** a live actuation backs the move in the same frame budget — the ring lands on the advanced tile; a move whose actuation cannot land is not consumed

### Requirement: Collections rail geometry

The collections rail SHALL render at 96dp authored width (192 device px
at the 2.0 box density) as a border box; every rail row SHALL keep a
uniform full-slot width regardless of a count label's presence or
absence, and every rail row's name and module texts SHALL clamp to one
line with an ellipsis — never a ragged card width and never a mid-glyph
clip.

#### Scenario: Count-less rows keep uniform width

- **WHEN** the rail renders rows where some carry a count label and some do not
- **THEN** every row card fills the full rail slot width (uniform edges), and the 96dp/192px rail panel leaves the focused card inside the content column

#### Scenario: Long names clamp to one line

- **WHEN** a rail row's collection name or module line exceeds the row's one-line text box
- **THEN** the text clamps to one line with an ellipsis — never a wrapped or clipped row, and the card height stays uniform across rows

### Requirement: Style token mirror law

The TV's visual token surface SHALL mirror the served SPA dark tokens:
default-styled text SHALL render the SPA foreground (#F8FAFC, `--foreground`),
secondary text SHALL render exactly ONE shared muted token (#94A3B8,
`--muted-foreground`) — the ad-hoc idioms (white-at-opacity, constant gray,
rail-only muted) SHALL NOT appear at call sites; dead and failed playback
banners SHALL carry the destructive treatment (#7F1D1D text on a destructive
border + destructive-tinted surface, `--destructive`); the in-progress bar
SHALL render the #F8FAFC fill over the #1E293B track; the collections-rail
row selection SHALL be the #1E293B fill (`--accent` idiom), not a blue wash.
Every color token a TV surface reads SHALL be declared in the single token
home, and every token's declaration SHALL name its SPA origin (selector or
CSS custom property) — the provenance law.

#### Scenario: Default text renders the SPA foreground

- **WHEN** any surface renders a default-styled text element
- **THEN** its color is the SPA foreground #F8FAFC — not the tv-material neutral near-white

#### Scenario: Secondary text renders the one shared muted token

- **WHEN** any surface renders a meta line, hint, count, or description
- **THEN** it renders #94A3B8 and no call site derives its own muted color by opacity or gray literal

#### Scenario: Dead and failed banners carry the destructive treatment

- **WHEN** the player overlay renders the dead or failed banner
- **THEN** the banner text is #7F1D1D over a destructive-tinted surface with a destructive border — not unstyled default text

#### Scenario: In-progress bar mirrors the SPA fill

- **WHEN** a card or row renders an in-progress bar
- **THEN** the fill is #F8FAFC over the #1E293B rounded track — not the type pastel over the chip-gray track

#### Scenario: Rail-row selection is the accent fill

- **WHEN** a collections-rail row is focused or selected
- **THEN** its surface carries the #1E293B fill, and the accent blue is never a selection wash

### Requirement: Missing-artwork fallback

An item whose artwork is absent SHALL render the deterministic pastel
fallback in its fixed-aspect art box — a linear gradient at 140° between two
HSL pastel stops picked by the FNV-1a hash of the item's name (second hue
+40..+119 from the first; stops at 68%/82% and 62%/74% lightness/saturation
bands) with the name's first grapheme centered on it as an initial — never a
bare canvas rectangle. The mapping SHALL be pure and deterministic: the same
name always yields the same gradient. An item whose artwork resolves SHALL
render the artwork, never the fallback.

#### Scenario: Absent artwork renders the pastel fallback

- **WHEN** a grid card or home card whose art box always renders has no resolvable artwork
- **THEN** the box shows the hashed pastel gradient with the first grapheme initial — never a bare dark rectangle

#### Scenario: The fallback is deterministic

- **WHEN** two items carry the same name and both lack artwork
- **THEN** both render the identical gradient and initial on every composition

#### Scenario: Present artwork never shows the fallback

- **WHEN** an item's artwork URL resolves and loads
- **THEN** the artwork renders and no fallback surface is drawn

### Requirement: Typography scale law

The app's typography SHALL mirror the SPA's weights and sizes through the
shared scale (SPA px ÷ the box density): titles render weight 600
(semibold) and secondary titles weight 500 (medium); the poster card title
renders 7sp, the hero and library-body titles 10sp, the pairing code 18sp
in a monospace family with letterspacing, and the episode title 7sp
clamped to TWO lines with an ellipsis; the hero synopsis clamps to two
lines. Every rendered size SHALL read the shared scale — never a raw sp
literal.

#### Scenario: Card titles carry weight and the small size

- **WHEN** a poster grid card renders its title
- **THEN** the title renders at 7sp weight 600 clamped to two lines — matching the SPA `.scard-title` law

#### Scenario: Episode titles clamp at two lines

- **WHEN** an episode row's title exceeds its two-line slot
- **THEN** it clamps to two lines with an ellipsis — never a mid-glyph clip

#### Scenario: Pairing code renders monospace

- **WHEN** the pairing screen renders the numeric code
- **THEN** it renders at 18sp in a monospace family with letterspacing — the SPA pairing-code law

### Requirement: Chip idiom law

Filter, genre, and settings chips SHALL render the SPA chip idiom: a fully
rounded pill with a transparent surface and a 1px #1E293B border carrying
muted text; the active chip SHALL invert — solid #F8FAFC surface with
#020617 text. The player's skip chips SHALL render the SPA per-kind pastels
(intro sky, credits violet) as a light pastel surface with its dark kind
text inside a rounded bordered card; the auto-next card SHALL render the
emerald pastel the same way. The skip chip's exit SHALL fade — its opacity
animates progressively down to transparent across the fade window — never a
one-frame snap.

#### Scenario: Idle chip renders the pill

- **WHEN** a folder, facet, genre, or settings chip renders unselected
- **THEN** it is a fully rounded transparent pill with a thin slate border and muted text

#### Scenario: Active chip inverts

- **WHEN** a chip is the active selection
- **THEN** it renders the solid #F8FAFC surface with #020617 text

#### Scenario: Skip chip fades progressively

- **WHEN** the skip chip has been visible inside a served range for the fade window
- **THEN** its opacity has decreased progressively across the window, reaching transparent at its end — never an instant disappearance

### Requirement: Geometry parity law

Within the established ÷2 authoring law, the layout constants SHALL mirror
their SPA sources: the shared gutter is 6dp (SPA `gap-3`), the series hero
poster renders 48×72dp at the 2:3 aspect, the screen-edge overscan renders
24dp horizontal and 14dp vertical (the SPA-relative overscan), and the
content column is capped at 92vw (the SPA tv shell `min(92vw, 1800px)`).
The grid column count stays the documented fixed-3 ruling. Every geometry
value SHALL read its shared constant — never a raw dp literal at the call
site.

#### Scenario: Hero poster renders the SPA proportion

- **WHEN** the series hero renders its poster
- **THEN** it occupies a 48×72dp 2:3 box — the SPA `w-24` proportion, not the retired 60×90

#### Scenario: Screen edges carry the SPA-relative overscan

- **WHEN** a page-edge inset is applied (series page, collection body, home rows, settings, pairing page)
- **THEN** it reads the 24dp/14dp overscan constants — the 32dp fixed margin is retired

#### Scenario: The content column spans the tv shell width

- **WHEN** the browse content column measures its width
- **THEN** it takes 92% of the viewport — the SPA tv shell cap, not the desktop shell's 60%

### Requirement: Home card chrome law

The home surface's cards SHALL carry the SPA card chrome: a rounded corner
shape, a 1px #1E293B border, and the SPA continue-row padding (p-3 ÷ 2) —
never a bare column. Artwork boxes inside chromed cards and grid tiles SHALL
clip to the card's corner radius so artwork never shows square corners
inside a rounded card.

#### Scenario: Home cards render the chrome

- **WHEN** a continue or next-up card renders on the home surface
- **THEN** it carries the rounded border shell with the card padding — matching the SPA Home.tsx continue-row law

#### Scenario: Artwork corners clip to the card

- **WHEN** artwork fills a chromed card's art box or a grid tile
- **THEN** the artwork's corners follow the card radius — no square artwork corners inside a rounded shell

### Requirement: Focus ring law

The focused element's visual SHALL be the SPA tv focus law: a slate #CBD5E1
outline whose width follows the dpr-clamped formula (clamp(2px/dpr, 0.2vw,
5px/dpr)), drawn outside the element with an offset, following the element's
own corner radius — with NO scale transform. The blue accent border + scale
1.1 idiom SHALL NOT render.

#### Scenario: Focus renders the slate outline without scale

- **WHEN** any focusable element takes focus
- **THEN** it shows the slate outline at the clamped width with its own corner radius and no size change

#### Scenario: The outline follows the element radius

- **WHEN** a focused element carries a non-default corner shape (a rail row's card, a pill chip)
- **THEN** the outline follows that shape — never a fixed-radius ring over a different corner
