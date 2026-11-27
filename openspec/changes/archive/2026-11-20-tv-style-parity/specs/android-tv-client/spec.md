# Spec Delta — android-tv-client (tv-style-parity)

## ADDED Requirements

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

## MODIFIED Requirements

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
