package tv.mellifera.ui

import androidx.compose.ui.graphics.Color

/**
 * The color tokens — THE definitions (one home beside the type scale, every
 * surface imports from here; a retheme edits this file, never a per-screen
 * copy). Every token's KDoc names its SPA origin (selector + file) where one
 * exists; the values mirror the SPA dark palette (web/src/styles/index.css
 * .dark) — since the mockup-palette return, that is the softened pastel
 * base's lifted-ink family (bg #10121d / card #171a29 / border #2a2e45),
 * NOT the plain shadcn slate the first parity pass mirrored.
 */

/** The active-element accent — the selected card's name tint in browse and
 * the player's seek-track fill; the focus ring rides the ring tone in
 * Focus.kt, not this color. The mockup family's lavender pastel
 * (--lav #d8cef2, .tmp/mockup-tv.html) — selection follows the pastel, the
 * locked idiom; replaces the first pass's client-tuned blue. */
val tvAccent = Color(0xFFD8CEF2)

/** The track background token — the player seek track's background and the
 * last chip-family surface — SPA --muted/--secondary, styles/index.css
 * .dark (#232739). */
val chipColor = Color(0xFF232739)

/** The collections rail's end-edge border — SPA --border, the .side
 * border-right (styles/index.css .dark, #2a2e45). */
val railBorder = Color(0xFF2A2E45)

/** SPA --foreground (230 31.6% 92.5% = #e6e8f2), styles/index.css .dark —
 * the root text default (App's LocalContentColor provider). */
val tvForeground = Color(0xFFE6E8F2)

/** SPA --muted-foreground (222.2 15.1% 64.9% = #98a0b3), styles/index.css
 * .dark — secondary text (.clink/.cnt). */
val tvMuted = Color(0xFF98A0B3)

/** SPA --destructive (0 62.8% 30.6%), styles/index.css .dark — the
 * Dead/Failed banner's text and tint color. */
val tvDestructive = Color(0xFF7F1D1D)

/** SPA border-destructive/40 — --destructive (styles/index.css .dark) at
 * 40% alpha — the destructive banner's border color. */
val tvDestructiveBorder = Color(0x667F1D1D)

/** The mockup family's progress green (--ok #059669, .tmp/mockup-tv.html —
 * the .pbar i fill; the SPA's InProgressBar carries the same value as the
 * .pbar-fill class) — the in-progress bar's fill. */
val inProgressFill = Color(0xFF059669)

/** SPA --muted (229.1 23.9% 18% = #232739), styles/index.css .dark — the
 * in-progress bar's track (the SPA's bg-muted track). */
val inProgressTrack = Color(0xFF232739)

/** SPA .chip-active surface (bg-primary, --primary), styles/index.css
 * .dark — the active filter chip's background. */
val chipActiveBg = Color(0xFFE6E8F2)

/** SPA .chip-active text (--primary-foreground), styles/index.css .dark —
 * the active filter chip's text. */
val chipActiveText = Color(0xFF10121D)

/** SPA .dot-serial, styles/index.css — the serial module's pastel; both
 * clients carry the mockup :root values verbatim (.tmp/mockup-tv.html). */
val dotSerial = Color(0xFFD8CEF2)

/** SPA .dot-tv, styles/index.css — the tv module's pastel (--peach). */
val dotTv = Color(0xFFF6D3B8)

/** SPA .dot-image, styles/index.css — the image module's pastel (--mint). */
val dotImage = Color(0xFFCDEBD7)

/** SPA .dot-audio, styles/index.css — the audio/default module pastel
 * (--sky) and the .watched-mark color (the mark is type-agnostic). */
val dotAudio = Color(0xFFCFE4F6)

/**
 * The web canvas color: SPA .dark --background (230.8 28.9% 8.8% =
 * #10121d), web/src/styles/index.css — the lifted-ink canvas the mockup
 * family's dark base defines (near-black #020617 rejected by the locked
 * v5.1 softened-base decision). Visibly lighter than the near-black the
 * first parity pass painted.
 *
 * The XML `app_canvas` resource (values/colors.xml, painted by the window
 * via themes.xml) mirrors this value — the only Compose paint is the rail
 * panel; everything else shows the window's color.
 */
val AppCanvas = Color(0xFF10121D)
