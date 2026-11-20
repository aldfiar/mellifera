package tv.mellifera.ui

import androidx.compose.ui.graphics.Color

/**
 * The color tokens — THE definitions (one home beside the type scale, every
 * surface imports from here; a retheme edits this file, never a per-screen
 * copy). Every token's KDoc names its SPA origin (selector + file) where one
 * exists; the values mirror the SPA dark palette (web/src/styles/index.css
 * .dark).
 */

/** The active-element accent — the selected card's name tint in browse and
 * the player's seek-track fill; the focus ring rides the slate ring in
 * Focus.kt, not this color. Client-tuned blue (no SPA selector). */
val tvAccent = Color(0xFF4C8DFF)

/** The track background token — the player seek track's background, the
 * last chip-family surface — SPA chip/track surfaces, the --muted/--secondary
 * slate family (styles/index.css .dark), client-tuned to this value. */
val chipColor = Color(0xFF2A2F3A)

/** The collections rail's end-edge border — SPA --border, the .side
 * border-right (styles/index.css .dark); the earlier #171A21 rail scrim
 * retired. */
val railBorder = Color(0xFF1E293B)

/** SPA --foreground (210 40% 98%), styles/index.css .dark — the root text
 * default (App's LocalContentColor provider). */
val tvForeground = Color(0xFFF8FAFC)

/** SPA --muted-foreground (215 20.2% 65.1%), styles/index.css .dark —
 * secondary text (.clink/.cnt); the rail's old muted token folded into it. */
val tvMuted = Color(0xFF94A3B8)

/** SPA --destructive (0 62.8% 30.6%), styles/index.css .dark — the
 * Dead/Failed banner's text and tint color. */
val tvDestructive = Color(0xFF7F1D1D)

/** SPA border-destructive/40 — --destructive (styles/index.css .dark) at
 * 40% alpha — the destructive banner's border color. */
val tvDestructiveBorder = Color(0x667F1D1D)

/** SPA bg-primary (--primary, 210 40% 98%), styles/index.css .dark — the
 * in-progress bar's fill. */
val inProgressFill = Color(0xFFF8FAFC)

/** SPA --border (217.2 32.6% 17.5%), styles/index.css .dark — the
 * in-progress bar's track. */
val inProgressTrack = Color(0xFF1E293B)

/** SPA .chip-active surface (bg-primary, --primary), styles/index.css —
 * the active filter chip's background. */
val chipActiveBg = Color(0xFFF8FAFC)

/** SPA .chip-active text (--primary-foreground, 222.2 47.4% 11.2%),
 * styles/index.css — the active filter chip's text. */
val chipActiveText = Color(0xFF020617)

/** SPA .dot-serial (#B7A6F4), styles/index.css — the serial module's pastel
 * in the type-dot map. */
val dotSerial = Color(0xFFB7A6F4)

/** SPA .dot-tv (#F6C3A4), styles/index.css — the tv module's pastel in the
 * type-dot map. */
val dotTv = Color(0xFFF6C3A4)

/** SPA .dot-image (#A4E3C3), styles/index.css — the image module's pastel
 * in the type-dot map. */
val dotImage = Color(0xFFA4E3C3)

/** SPA .dot-audio (#A4C8F4), styles/index.css — the audio/default module
 * pastel and the .watched-mark color (the mark is type-agnostic). */
val dotAudio = Color(0xFFA4C8F4)

/**
 * The web canvas color: SPA .dark --background (222.2 84% 4.9%),
 * web/src/styles/index.css — the near-black canvas the web renders, visibly
 * darker than darkColorScheme()'s default background (≈ #1C1B1F gray) the
 * app showed before the visual-parity pass.
 *
 * The XML `app_canvas` resource (values/colors.xml, painted by the window
 * via themes.xml) mirrors this value — the only Compose paint is the rail
 * panel; everything else shows the window's color.
 */
val AppCanvas = Color(0xFF020617)
