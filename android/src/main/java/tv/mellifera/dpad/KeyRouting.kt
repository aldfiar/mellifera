package tv.mellifera.dpad

/**
 * The D-pad vocabulary the routing law owns (5.9). Back rides the same law
 * so the dismiss-vs-exit branch stays JVM-testable; on device Compose
 * delivers Back through BackHandler (it never reaches onKeyEvent) — the
 * wiring calls [routePlayerKey] with [DpadKey.Back] from there.
 */
enum class DpadKey { Left, Right, Up, Down, Ok, Back, PlayPause }

/** The arrows that move a cursor (grid/list rails); the rest route only
 * inside the player. */
val DpadKey.isDirectional: Boolean
    get() = this == DpadKey.Left || this == DpadKey.Right ||
        this == DpadKey.Up || this == DpadKey.Down

/**
 * The player key routing law (5.9), PURE: (key, hold repeatCount, controls
 * visibility) → action. The Compose overlay is a thin wrapper that maps
 * android.view.KeyEvent → [DpadKey] and executes the action against the
 * orchestration; every branch below is pinned by KeyRoutingTest.
 *
 * - Left/Right seek ∓/±10s, accelerating on hold (the native event's
 *   repeatCount feeds [seekStepMs] → ±30s → ±60s).
 * - Ok reveals the control layer on the first press, toggles play/pause
 *   once revealed.
 * - Back dismisses the controls; with them hidden it pauses (which flushes
 *   the stored position) then exits the player.
 * - PlayPause media keys toggle directly, controls visibility aside.
 * - Up/Down are not player keys (the control layer's rails are entered
 *   visually, not via the law) — null, never consumed.
 */
fun routePlayerKey(
    key: DpadKey,
    repeatCount: Int = 0,
    controlsShown: Boolean = false,
): PlayerKeyAction? = when (key) {
    DpadKey.Left -> PlayerKeyAction.Seek(-seekStepMs(repeatCount))
    DpadKey.Right -> PlayerKeyAction.Seek(seekStepMs(repeatCount))
    DpadKey.Ok ->
        if (controlsShown) PlayerKeyAction.TogglePlay else PlayerKeyAction.ShowControls
    DpadKey.Back ->
        if (controlsShown) PlayerKeyAction.DismissControls else PlayerKeyAction.PauseExit
    DpadKey.PlayPause -> PlayerKeyAction.TogglePlay
    DpadKey.Up, DpadKey.Down -> null
}

/**
 * The hold-acceleration curve: the first presses seek ±10s; holding on
 * (native repeatCount climbing) steps up to ±30s and then ±60s.
 */
fun seekStepMs(repeatCount: Int): Long = when {
    repeatCount < REPEAT_MEDIUM -> STEP_BASE_MS
    repeatCount < REPEAT_LARGE -> STEP_MEDIUM_MS
    else -> STEP_LARGE_MS
}

/** One player routing decision — the orchestration executes it. */
sealed interface PlayerKeyAction {
    /** Relative seek; negative is back, positive is forward. */
    data class Seek(val deltaMs: Long) : PlayerKeyAction

    data object ShowControls : PlayerKeyAction
    data object TogglePlay : PlayerKeyAction
    data object DismissControls : PlayerKeyAction

    /** Back with controls hidden: pause (flushing progress) then exit. */
    data object PauseExit : PlayerKeyAction
}

/**
 * The grid cursor law: arrows move within a row/column and jump across
 * rows ([Up] /[Down] by [columns] cards). Edges clamp INSIDE the grid —
 * the wiring treats a clamp as "not consumed", which is what lets an Up at
 * the top row cross the rail into whatever sits above (settings).
 */
fun moveInGrid(index: Int, columns: Int, count: Int, key: DpadKey): Int {
    val cursor = index.coerceIn(0, (count - 1).coerceAtLeast(0))
    if (!key.isDirectional || count == 0) return cursor
    val column = cursor % columns
    return when (key) {
        DpadKey.Left -> if (column > 0) cursor - 1 else cursor
        DpadKey.Right -> if (column < columns - 1 && cursor + 1 < count) cursor + 1 else cursor
        DpadKey.Up -> (cursor - columns).coerceAtLeast(0)
        DpadKey.Down -> (cursor + columns).coerceAtMost(count - 1)
        else -> cursor
    }
}

/**
 * The row cursor law (horizontal walkers — the home surface's Continue and
 * Next-up rows, design D4): Left/Right step and clamp INSIDE the row — the
 * wiring treats a clamp as "not consumed", which is what lets a LEFT at
 * x=0 open the collections rail and a RIGHT at the last card stay put.
 * Up/Down are not row keys — the cursor keeps its position, so the wiring
 * leaves the arrow UNCONSUMED and Compose's focus search crosses rows,
 * the settings section and the grid natively (the L2 law).
 */
fun moveInRow(index: Int, count: Int, key: DpadKey): Int {
    val cursor = index.coerceIn(0, (count - 1).coerceAtLeast(0))
    if (!key.isDirectional || count == 0) return cursor
    return when (key) {
        DpadKey.Left -> (cursor - 1).coerceAtLeast(0)
        DpadKey.Right -> (cursor + 1).coerceAtMost(count - 1)
        else -> cursor
    }
}

/**
 * The chips row's UP clamp (task 8.6): an UP from the chips row with NO
 * focusable target above the body is CONSUMED — the chip keeps focus, so
 * the arrow can never ride a runaway native focus search across the body
 * boundary into the home rows (the walk-found stranding: one UP stranded
 * the user on home, outside the body they were inside). When the settings
 * affordance above the body IS focusable, the arrow stays unconsumed and
 * crosses natively (D12's chips row); a settings target is reached
 * explicitly, never by native search over the home surface.
 */
fun chipsRowConsumesUp(key: DpadKey, aboveFocusable: Boolean): Boolean =
    key == DpadKey.Up && !aboveFocusable

/**
 * The list cursor law (episode rows): Up/Down step and clamp; Left/Right
 * are not list keys — the row keeps its position.
 */
fun moveInList(index: Int, count: Int, key: DpadKey): Int {
    val cursor = index.coerceIn(0, (count - 1).coerceAtLeast(0))
    if (!key.isDirectional || count == 0) return cursor
    return when (key) {
        DpadKey.Up -> (cursor - 1).coerceAtLeast(0)
        DpadKey.Down -> (cursor + 1).coerceAtMost(count - 1)
        else -> cursor
    }
}

private const val REPEAT_MEDIUM = 2
private const val REPEAT_LARGE = 5
const val STEP_BASE_MS = 10_000L
const val STEP_MEDIUM_MS = 30_000L
const val STEP_LARGE_MS = 60_000L
