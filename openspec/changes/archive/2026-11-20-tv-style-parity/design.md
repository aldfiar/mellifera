# Design — tv-style-parity

## Context

Slice C of the converged parity design
(`.tmp/android-tv-web-parity-design.md` §5, change C): the style audit
(`.tmp/android-tv-web-parity-proposal.md` §6) found 25 drifts between the
served SPA (`web/src`, main @ d1d2441) and the TV app
(`android/src/main/java/tv/mellifera/`, worktree @ f6ae4c4 — the tree every
citation below was verified against). The mirror pipeline law holds: the TV
invents no endpoint, derivation, or pixel value — every token traces to a SPA
selector. The app's own laws constrain the pass: every text size reads the
`TypeScale` constants (no raw sp), every geometry value reads a
`LayoutParity` constant, `Colors.kt` declares itself "THE definitions — one
home", and the box renders at density 2.0 so SPA px ÷ 2 is the authoring law.
Compose rendering is not JVM-observable — visual call-site tasks verify by
targeted JVM tests (they double as the compile gate) plus structural greps
against markers pinned in the task prose/contracts; the reviewer reads the
visual deltas on-device at GATE 2.

## Goals / Non-Goals

**Goals:**

- One token home (`ui/Colors.kt`) whose every token names its SPA origin —
  the unenforced-provenance failure (the months-lived "SPA 28px" wrong
  citation) is what the provenance KDoc law prevents.
- No bare-canvas artwork tile anywhere on the box.
- Chip, typography, geometry, focus and home-card idioms byte-traceable to
  their SPA selectors.

**Non-Goals:**

- No behavior, wire, or state-law change (the D-pad, epoch, back-restoration
  and focus-actuation laws stand untouched).
- No SPA auto-fill grid (S-6 stays fixed-3 — the documented-deliberate
  ruling; no task re-opens it).
- No re-litigating foreclosures: dark-only, photo squares, 96dp rail,
  TypeScale/geometry ÷2 laws themselves, the 16-Nov fixed-3 ruling.
- No slices A/B matters: MediaSession next/prev (Q1), long-press trigger
  (OQ-D), household ledger semantics (OQ-E), episode-row anatomy (OQ-F).

## Decisions

- **D1 · Token home expansion (S-1)** — `ui/Colors.kt` absorbs every color
  the pass touches: the new `tvForeground`/`tvMuted`/`tvDestructive` +
  banner pair + in-progress fill/track + chip-active pair, and the D3 pastel
  map moves in from `BrowseFlow.kt:38-47` (`typeAccent` reads the tokens).
  The root `LocalContentColor` provider (`ui/App.kt:75`) flips from the
  scheme's onBackground (#E6E1E5 tv-material neutral) to `tvForeground`.
  Rejected: a fuller ui/Theme package — dark-only (L8) kills its only use
  case and max-8-exported/package favors one file. The muted consolidation
  sweeps call sites in two tasks (browse + playback) to keep each within the
  ~6-file granularity law. GATE-1 amendment: `AppCanvas` (`ui/App.kt:28`,
  #020617) also absorbs into Colors.kt under this decision (task 1.1) — the
  single-token-home law closes its last exception.
- **D2 · Fallback law placement (S-2)** — a NEW pure file
  `browse/FallbackGradient.kt` beside the artwork law (`ArtworkUrl.kt`): the
  FNV-1a hash over UTF-16 code units (Kotlin `String` indexing IS UTF-16 —
  the SPA's exact hash semantics), hue1 = h mod 360 (unsigned 32-bit),
  hue2 = (hue1 + 40 + (h/360 mod 80)) mod 360, pastel stops hsl(h1 68% 82%)
  → hsl(h2 62% 74%), 140° gradient, first-grapheme initial — plus a pure
  HSL→Color conversion so the whole law is JVM-testable (no framework call).
  Call sites: exactly the three fixed-aspect art boxes that render bare
  canvas on absent artwork (`CardView` BrowseScreen:1260, `ResumeCard`/
  `AnchorCard` HomeRows:331/405). The hero poster and episode thumb render
  NO box on absence (field-driven) — no bare rectangle exists there, so
  they are out of scope. The initial glyph's size (SPA text-4xl 36px ÷ 2 =
  18sp) enters `TypeScale` as `TYPE_FALLBACK_INITIAL` in the same task —
  the no-raw-sp law forbids rendering it before the constant exists.
- **D3 · TypeScale citation fix re-slotted to the S-3 task** — the design's
  slice-C item 1 lists the citation fix with S-1, but the citation is only
  coherent WITH the size it annotates (TYPE_DISPLAY 14→10sp re-derives it
  to "SPA 20px, text-xl"); fixing it under S-1 would cite a size that S-3
  immediately moves. Task 3.1 owns both. Also repaired there: the header
  mapping block (lines 14-17) and TYPE_CODE 24→18sp ("SPA 36px") — the
  same wrong-scale family.
- **D4 · Chip idiom (S-4)** — one pill idiom for every filter/genre/settings
  chip (`RoundedCornerShape(50)` percent shape, transparent + 1dp `railBorder`
  border, `tvMuted` text; active = solid #F8FAFC + #020617 text — SPA
  `.chip`/`.chip-active`). The skip/auto-next chips keep their own card
  idiom but adopt the SPA per-kind pastels (intro sky-100/95 text-sky-900,
  credits violet-100/95, auto-next emerald-100/95) + rounded-lg + border —
  a pure kind→color mapping in `SkipSections.kt`, JVM-pinned by its test.
  The fade repair animates alpha across the SKIP_FADE_MS window (the
  constant is applied today at PlayerScreen:219; the snap is the one-frame
  alpha flip at :226).
- **D5 · Geometry (S-5)** — within-law ÷2 corrections, all as
  `browse/LayoutParity.kt` constants: `PARITY_GUTTER` 16→6dp (SPA gap-3
  12px), `CONTENT_COLUMN_FRACTION` 0.60→0.92 (the 0.60 was read from the
  DESKTOP shell `max-w-6xl`; the SPA's own 10-foot surface is the tv shell
  `html.tv main { max-width: min(92vw, 1800px) }`), new
  `PARITY_OVERSCAN_X` 24dp / `PARITY_OVERSCAN_Y` 14dp (OQ-C rec) replacing
  the scattered 32dp page-edge paddings (SeriesPage:1097, SeriesGrid:391,
  HomeRows left inset, SettingsSection left inset; internal spacings
  untouched). The fixed-3 column constants stand (S-6 closed) — the wider
  column under a fixed count IS the count ruling's own logic (bigger posters
  were its intent); both ride GATE 1 together. GATE-1 amendment: the pairing
  page joins the 5.2 sweep (`PairingScreen.kt:55` page-edge `padding(32.dp)`
  → the overscan constants) and its address-field white
  (`PairingScreen.kt:103`) folds into 3.1 as `tvForeground` — Q2/Q3 folded.
- **D6 · Focus ring (S-7, GATE-1-gated)** — `tvFocusStyle` drops the 1.1
  scale (outline-only), recolors to slate #CBD5E1 (`--ring`), widths via a
  pure dpr-clamp law fn mirroring `clamp(2px/dpr, 0.2vw, 5px/dpr)`, and
  takes the element's own shape (a shape parameter defaulting to the current
  6dp corner; `RailRow` passes its 4dp card shape) — SPA
  `html.tv :focus-visible` law. On a declined OQ-B ruling: keep scale,
  recolor slate, re-author the task.
- **D7 · S-6 record** — documented-deliberate, no code, no task:
  `browse/LayoutParity.kt:38-42` already records the operator's count
  ruling; the proposal's What Changes carries the one-line closure.

## Interfaces (cross-group contract)

Groups 1→7 consume these names exactly as group 1/2 defines them; a drift
here is a cross-task break, not a local edit:

- **Token vocabulary (task 1.1, `ui/Colors.kt`)** — `tvForeground` (#F8FAFC),
  `tvMuted` (#94A3B8, absorbs `railMuted`), `tvDestructive` (#7F1D1D) +
  `tvDestructiveBorder` (the border-destructive/40 surface pair),
  `inProgressFill` (#F8FAFC) + `inProgressTrack` (#1E293B), `chipActiveBg`
  (#F8FAFC) + `chipActiveText` (#020617), the pastel map
  (`dotSerial` #B7A6F4, `dotTv` #F6C3A4, `dotImage` #A4E3C3, `dotAudio`
  #A4C8F4 — `typeAccent`/`DEFAULT_TYPE_ACCENT` keep their signatures and
  read these). Existing `tvAccent` stays (player seek fill until S-7
  retires its ring use; the seek-bar fill is NOT in the audit's drift list
  and stays).
- **Fallback law (task 2.1)** — `fallbackGradient(name): FallbackGradient`
  (hue1, hue2, initial) + the shared `FallbackArtwork` composable (task 2.2,
  `browse/`), consumed by grid + home call sites; `TYPE_FALLBACK_INITIAL`
  (18sp) enters the scale in 2.1.
- **Skip pastel mapping (task 4.2)** — pure kind→pastel pair fn in
  `SkipSections.kt`, pinned by `SkipSectionsTest`.
- **Overscan constants (task 5.1)** — `PARITY_OVERSCAN_X` (24dp),
  `PARITY_OVERSCAN_Y` (14dp) in `browse/LayoutParity.kt`, consumed by 5.2's
  call sites.
- **Focus law fn (task 7.1)** — pure `tvFocusRingWidth` (density-scaled
  dpr clamp) in `ui/Focus.kt`, JVM-pinned by the new `FocusRingTest`.

## Risks / Trade-offs

- [Compose visuals are not JVM-observable] → call-site duties pair targeted
  JVM tests (compile gate + mapping pins) with structural greps against
  markers the task prose pins exactly; the reviewer walks the visual deltas
  on-device at GATE 2 (the archived layout-parity precedent).
- [Widening the content column under fixed-3 grows posters ~50%] → coherent
  with the count ruling's own intent (bigger posters), and both the column
  and the count ride GATE 1 together; if the operator flags it, the
  re-author is two constants.
- [The muted sweep touches ~20 call sites across 4 files] → swept by exact
  grep inventory (Color.White.copy(alpha = 0.6f), Color.LightGray,
  rail-only railMuted) with negative-grep duties; @audit on the actual sweep
  tasks (1.2 + 1.3) so the reviewer reads the contracts at the gate.
- [FNV-1a hue math in Kotlin vs JS 32-bit semantics] → the contract pins
  unsigned-32 semantics (Kotlin `Int` math with `and 0xFFFFFFFFL` normalize)
  and the determinism test pins golden name→hue pairs before any call site
  consumes it.
- [S-7 revises a design-doc pin (L4)] → encoded decided-pending-GATE-1, last
  group in the DAG so groups 1-6 land regardless of the ruling.

## Migration Plan

None required: dark-only in-place restyle, no data, no wire, no config.
Rollback = revert the commit range; the JVM tests pin every moved constant.

## Open Questions

None — Q2, OQ-B and OQ-C are encoded as the recommended rulings,
decided-pending-GATE-1 (the proposal's What Changes carries them); Q1,
OQ-D, OQ-E, OQ-F are slices A/B and are not designed here.
