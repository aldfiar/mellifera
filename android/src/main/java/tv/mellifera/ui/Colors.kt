package tv.mellifera.ui

import androidx.compose.ui.graphics.Color

/**
 * The D11 color tokens — THE definitions (13.1: one home beside
 * [AppCanvas]/the type scale, every surface imports from here; a retheme
 * edits this file, never a per-screen copy).
 */
/** The focus law's accent — the one color a focused element carries (the
 * focused state is a 2dp accent border + scale 1.1, NEVER a pill; 5.9). */
val tvAccent = Color(0xFF4C8DFF)

/** The chip/track background token (settings chip, player seek track,
 * browse chips — the D11 chip-bg). */
val chipColor = Color(0xFF2A2F3A)

/** The collections rail's end-edge border (14.1 — the SPA .side's
 * border-right, --border slate-800). D11's #171A21 rail scrim is retired. */
val railBorder = Color(0xFF1E293B)

/** The collections rail's muted row text — labels and counts (14.1 — the
 * SPA's --muted-foreground). */
val railMuted = Color(0xFF94A3B8)
