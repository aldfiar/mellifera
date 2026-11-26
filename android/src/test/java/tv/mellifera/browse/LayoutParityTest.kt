package tv.mellifera.browse

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Test
import tv.mellifera.ui.UiScaleMode

/**
 * The TV tile-geometry laws: the column fraction, the gutter, the overscan
 * edges, the FIXED tile aspects and the density planner are pinned here so
 * a drift fails the build. The planner's output tables are the acceptance
 * floor — every cell below is the height budget's arithmetic at the ruled
 * reserve inputs (Обычный serial chrome 80dp / caption 58dp are the draft's
 * ruled numbers; the other modes/surfaces calibrate to these outputs, so a
 * changed reserve moves the table and fails here).
 */
class LayoutParityTest {
    // ---- the centered content column ---------------------------------------

    @Test
    fun content_column_is_the_tv_shell_cap() {
        // The SPA tv shell: html.tv main { max-width: min(92vw, 1800px) } —
        // 92vw of a 1920px viewport (the desktop pages' max-w-6xl cap is
        // superseded there).
        assertEquals(0.92f, CONTENT_COLUMN_FRACTION, 1e-6f)
    }

    @Test
    fun gutter_is_the_spa_gap_halved() {
        // The SPA's gap-3: 12px ÷ 2 at the box's 2.0× density = 6dp.
        assertEquals(6f, PARITY_GUTTER.value, 1e-6f)
    }

    @Test
    fun overscan_edges_are_the_tv_shell_padding() {
        // html.tv .app-content { padding: 2.5vh 2.5vw }: 2.5vw ≈ 48px and
        // 2.5vh ≈ 27px at 1920×1080 — ÷ 2 → 24dp horizontal, 14dp vertical.
        assertEquals(24f, PARITY_OVERSCAN_X.value, 1e-6f)
        assertEquals(14f, PARITY_OVERSCAN_Y.value, 1e-6f)
    }

    @Test
    fun poster_track_floor_is_the_110dp_tier_law() {
        assertEquals(110f, POSTER_TRACK_FLOOR.value, 1e-6f)
    }

    // ---- the fixed tile aspects ---------------------------------------------

    @Test
    fun tile_aspects_are_the_grid_s_fixed_laws() {
        assertEquals(2f / 3f, POSTER_ASPECT, 1e-6f) // Artwork.tsx aspect-[2/3]
        assertEquals(16f / 9f, STILL_ASPECT, 1e-6f) // Collection.tsx aspect-video
        // The retired masonry's replacement: every photo tile is the same
        // square (Crop fills it either orientation) — uniform rows.
        assertEquals(1f, PHOTO_TILE_ASPECT, 1e-6f)
    }

    @Test
    fun track_math_fits_the_cards_in_the_tv_shell_column() {
        // The tv shell column: 92vw of 1920px ÷ 2 = 883.2dp. The home rows'
        // fixed track: (883.2 − 2·6) / 3 = 290.4dp per 16:9 card (the 3 is
        // the retired fixed-3 count — task 17.5 moves the home rows onto
        // the density law).
        assertEquals(290.4f, rowCardTrack(883.2.dp, 3).value, 0.01f)
    }

    // ---- the reserve inputs --------------------------------------------------

    @Test
    fun regular_serial_reserves_are_the_ruled_numbers() {
        // chrome = title 28 + chips 36 + gap 16; caption = 2-line title 28
        // + Season chip 24 + gap 6 — the draft's RULED inputs.
        assertEquals(80f, chromeReserve(UiScaleMode.REGULAR, GridSurface.SERIAL).value, 1e-6f)
        assertEquals(58f, captionReserve(UiScaleMode.REGULAR, GridSurface.SERIAL).value, 1e-6f)
    }

    @Test
    fun photo_grid_carries_no_caption() {
        for (mode in UiScaleMode.entries) {
            assertEquals(0f, captionReserve(mode, GridSurface.PHOTO).value, 1e-6f)
        }
    }

    // ---- the pinned output table: 960×540 dp ---------------------------------
    // Every cell of the F-2 table per mode × override, computed from the
    // formula at W = 0.92 × 960 = 883.2dp (W + gutter = 889.2).

    private fun serialPlan(mode: UiScaleMode, override: Int? = null): GridPlan = gridPlan(
        width = 883.2.dp,
        height = 540.dp,
        chrome = chromeReserve(mode, GridSurface.SERIAL),
        caption = captionReserve(mode, GridSurface.SERIAL),
        aspect = POSTER_ASPECT,
        columnOverride = override,
    )

    @Test
    fun regular_auto_tiles_seven_across_two_rows_at_960x540() {
        // heightFit(2) = ((540 − 80 − 2·58)/2)·(2/3) = 114.67dp ≥ 110 → the
        // two-row tier; columnsAuto = floor(889.2/120.67) = 7; track = the
        // height fit (the width fit 121.03 is looser); the two rows consume
        // the budget exactly → no peek. Posters ≈ 230×345px.
        val plan = serialPlan(UiScaleMode.REGULAR)
        assertEquals(7, plan.columns)
        assertEquals(114.67f, plan.track.value, 0.01f)
        assertEquals(2, plan.rows)
        assertEquals(0f, plan.peek.value, 0.01f)
    }

    @Test
    fun regular_overrides_render_the_one_row_tier_with_a_growing_peek_at_960x540() {
        // Width-first: the count fixes the track at its width fit
        // ((889.2/n) − 6); two rows of that no longer fit the height, so
        // the tier drops to one row and the peek grows with the count:
        // 4 → 77.55dp, 5 → 144.24dp, 6 → 188.7dp. Posters 432×648 /
        // 343×515 / 284×426 px — the pinned override cells.
        val four = serialPlan(UiScaleMode.REGULAR, override = 4)
        assertEquals(4, four.columns)
        assertEquals(216.3f, four.track.value, 0.01f)
        assertEquals(1, four.rows)
        assertEquals(77.55f, four.peek.value, 0.01f)
        val five = serialPlan(UiScaleMode.REGULAR, override = 5)
        assertEquals(5, five.columns)
        assertEquals(171.84f, five.track.value, 0.01f)
        assertEquals(1, five.rows)
        assertEquals(144.24f, five.peek.value, 0.01f)
        val six = serialPlan(UiScaleMode.REGULAR, override = 6)
        assertEquals(6, six.columns)
        assertEquals(142.2f, six.track.value, 0.01f)
        assertEquals(1, six.rows)
        assertEquals(188.7f, six.peek.value, 0.01f)
    }

    @Test
    fun compact_auto_keeps_the_seven_across_two_row_tier_at_960x540() {
        // heightFit(2) = ((540 − 76 − 2·54)/2)·(2/3) = 118.67dp ≥ 110 →
        // two rows; columnsAuto = floor(889.2/124.67) = 7; the two rows
        // consume the budget exactly → no peek. 14 titles on screen, the
        // same count as Обычный.
        val plan = serialPlan(UiScaleMode.COMPACT)
        assertEquals(7, plan.columns)
        assertEquals(118.67f, plan.track.value, 0.01f)
        assertEquals(2, plan.rows)
        assertEquals(0f, plan.peek.value, 0.01f)
    }

    @Test
    fun compact_overrides_render_the_one_row_tier_with_a_growing_peek_at_960x540() {
        // The same width-first law at the Компактный reserves: 4 → 85.55dp,
        // 5 → 152.24dp, 6 → 196.7dp — the peek grows with the count.
        val four = serialPlan(UiScaleMode.COMPACT, override = 4)
        assertEquals(4, four.columns)
        assertEquals(216.3f, four.track.value, 0.01f)
        assertEquals(1, four.rows)
        assertEquals(85.55f, four.peek.value, 0.01f)
        val five = serialPlan(UiScaleMode.COMPACT, override = 5)
        assertEquals(5, five.columns)
        assertEquals(171.84f, five.track.value, 0.01f)
        assertEquals(1, five.rows)
        assertEquals(152.24f, five.peek.value, 0.01f)
        val six = serialPlan(UiScaleMode.COMPACT, override = 6)
        assertEquals(6, six.columns)
        assertEquals(142.2f, six.track.value, 0.01f)
        assertEquals(1, six.rows)
        assertEquals(196.7f, six.peek.value, 0.01f)
    }

    @Test
    fun large_auto_drops_to_four_plus_a_peek_at_960x540() {
        // heightFit(2) = ((540 − 146 − 2·70)/2)·(2/3) = 84.67dp < 110 → the
        // two-row tier is not viable; columnsAuto derives from the one-row
        // height-fit (540 − 146 − 70)·(2/3) = 216dp: floor(889.2/222) = 4;
        // two rows of the width fit cannot fit → one full row at 216dp
        // (432×648px posters) — the pinned Крупный cell.
        val plan = serialPlan(UiScaleMode.LARGE)
        assertEquals(4, plan.columns)
        assertEquals(216f, plan.track.value, 0.01f)
        assertEquals(1, plan.rows)
        assertEquals(0f, plan.peek.value, 0.01f)
    }

    @Test
    fun large_overrides_clamp_to_the_auto_count_at_960x540() {
        // The override never exceeds what the caption law supports: at
        // Крупный the auto count is 4, so «Постеров в ряду» = 5 and 6
        // render 4 — five-across would truncate titles below ~12
        // chars/line.
        val five = serialPlan(UiScaleMode.LARGE, override = 5)
        assertEquals(4, five.columns)
        assertEquals(216f, five.track.value, 0.01f)
        assertEquals(1, five.rows)
        val six = serialPlan(UiScaleMode.LARGE, override = 6)
        assertEquals(4, six.columns)
        assertEquals(216f, six.track.value, 0.01f)
        assertEquals(1, six.rows)
    }

    // ---- the same pins at 1280×720 and 1920×1080 dp -------------------------
    // These pin the LAW (computed from the formula, not new rulings).

    @Test
    fun regular_serial_re_tiles_at_the_taller_viewports() {
        // 1280×720: heightFit(2) = 174.67dp, columnsAuto = floor(1183.6/180.67) = 6.
        val p720 = gridPlan(
            1177.6.dp, 720.dp,
            chromeReserve(UiScaleMode.REGULAR, GridSurface.SERIAL),
            captionReserve(UiScaleMode.REGULAR, GridSurface.SERIAL),
            POSTER_ASPECT,
        )
        assertEquals(6, p720.columns)
        assertEquals(174.67f, p720.track.value, 0.01f)
        assertEquals(2, p720.rows)
        assertEquals(0f, p720.peek.value, 0.01f)
        // 1920×1080: heightFit(2) = 294.67dp, columnsAuto = floor(1772.4/300.67) = 5.
        val p1080 = gridPlan(
            1766.4.dp, 1080.dp,
            chromeReserve(UiScaleMode.REGULAR, GridSurface.SERIAL),
            captionReserve(UiScaleMode.REGULAR, GridSurface.SERIAL),
            POSTER_ASPECT,
        )
        assertEquals(5, p1080.columns)
        assertEquals(294.67f, p1080.track.value, 0.01f)
        assertEquals(2, p1080.rows)
        assertEquals(0f, p1080.peek.value, 0.01f)
    }

    @Test
    fun compact_serial_re_tiles_at_the_taller_viewports() {
        // 1280×720: heightFit(2) = 178.67dp, columnsAuto = 6; 1920×1080:
        // heightFit(2) = 298.67dp, columnsAuto = 5 — both two-row tiers.
        val p720 = gridPlan(
            1177.6.dp, 720.dp,
            chromeReserve(UiScaleMode.COMPACT, GridSurface.SERIAL),
            captionReserve(UiScaleMode.COMPACT, GridSurface.SERIAL),
            POSTER_ASPECT,
        )
        assertEquals(6, p720.columns)
        assertEquals(178.67f, p720.track.value, 0.01f)
        assertEquals(2, p720.rows)
        val p1080 = gridPlan(
            1766.4.dp, 1080.dp,
            chromeReserve(UiScaleMode.COMPACT, GridSurface.SERIAL),
            captionReserve(UiScaleMode.COMPACT, GridSurface.SERIAL),
            POSTER_ASPECT,
        )
        assertEquals(5, p1080.columns)
        assertEquals(298.67f, p1080.track.value, 0.01f)
        assertEquals(2, p1080.rows)
    }

    @Test
    fun large_serial_regains_the_two_row_tier_at_the_taller_viewports() {
        // At 720dp the Крупный height fit (144.67dp) meets the 110dp floor
        // again: 7 columns × 2 rows; at 1080dp it is 264.67dp → 6 × 2. The
        // Крупный 4-plus-peek cell is a 540dp-height outcome, not a mode
        // constant.
        val p720 = gridPlan(
            1177.6.dp, 720.dp,
            chromeReserve(UiScaleMode.LARGE, GridSurface.SERIAL),
            captionReserve(UiScaleMode.LARGE, GridSurface.SERIAL),
            POSTER_ASPECT,
        )
        assertEquals(7, p720.columns)
        assertEquals(144.67f, p720.track.value, 0.01f)
        assertEquals(2, p720.rows)
        val p1080 = gridPlan(
            1766.4.dp, 1080.dp,
            chromeReserve(UiScaleMode.LARGE, GridSurface.SERIAL),
            captionReserve(UiScaleMode.LARGE, GridSurface.SERIAL),
            POSTER_ASPECT,
        )
        assertEquals(6, p1080.columns)
        assertEquals(264.67f, p1080.track.value, 0.01f)
        assertEquals(2, p1080.rows)
    }

    @Test
    fun regular_override_at_1920x1080_renders_the_one_row_tier() {
        // Width-first at the tall viewport: 4 across = 437.1dp tracks, two
        // rows cannot fit → one row plus a 286.35dp peek.
        val four = gridPlan(
            1766.4.dp, 1080.dp,
            chromeReserve(UiScaleMode.REGULAR, GridSurface.SERIAL),
            captionReserve(UiScaleMode.REGULAR, GridSurface.SERIAL),
            POSTER_ASPECT,
            columnOverride = 4,
        )
        assertEquals(4, four.columns)
        assertEquals(437.1f, four.track.value, 0.01f)
        assertEquals(1, four.rows)
        assertEquals(286.35f, four.peek.value, 0.01f)
    }

    // ---- the 110dp tier boundary ---------------------------------------------

    @Test
    fun a_track_just_under_the_floor_flips_to_one_row_plus_a_peek() {
        // Synthetic chrome brackets the boundary: heightFit(2) = 110.03dp
        // keeps the two-row tier (7 columns); 109.97dp flips the planner to
        // the one-row tier — the auto count re-derives from the one-row
        // height fit (258.6dp) = 3 columns.
        val above = gridPlan(883.2.dp, 540.dp, 93.9.dp, 58.dp, POSTER_ASPECT)
        assertEquals(7, above.columns)
        assertEquals(110.03f, above.track.value, 0.01f)
        assertEquals(2, above.rows)
        val below = gridPlan(883.2.dp, 540.dp, 94.1.dp, 58.dp, POSTER_ASPECT)
        assertEquals(3, below.columns)
        assertEquals(258.6f, below.track.value, 0.01f)
        assertEquals(1, below.rows)
    }

    // ---- the other surfaces ---------------------------------------------------

    @Test
    fun photo_auto_fours_two_full_rows_of_216dp_squares_at_960x540() {
        // heightFit(2) = (540 − 108)/2 = 216dp (no caption); columnsAuto =
        // floor(889.2/222) = 4; two rows of 216dp squares consume the
        // budget exactly — the pinned photo cell.
        val plan = gridPlan(
            883.2.dp, 540.dp,
            chromeReserve(UiScaleMode.REGULAR, GridSurface.PHOTO),
            captionReserve(UiScaleMode.REGULAR, GridSurface.PHOTO),
            PHOTO_TILE_ASPECT,
        )
        assertEquals(4, plan.columns)
        assertEquals(216f, plan.track.value, 0.01f)
        assertEquals(2, plan.rows)
        assertEquals(0f, plan.peek.value, 0.01f)
    }

    @Test
    fun home_rows_ride_four_across_at_960x540() {
        // heightFit(2) = ((540 − 169 − 2·68)/2)·(16/9) = 208.89dp; columnsAuto =
        // floor(889.2/214.89) = 4 — four 16:9 cards of ≈209×117.5dp per row,
        // two rows fit the height exactly.
        val plan = gridPlan(
            883.2.dp, 540.dp,
            chromeReserve(UiScaleMode.REGULAR, GridSurface.HOME),
            captionReserve(UiScaleMode.REGULAR, GridSurface.HOME),
            STILL_ASPECT,
        )
        assertEquals(4, plan.columns)
        assertEquals(208.89f, plan.track.value, 0.01f)
        assertEquals(2, plan.rows)
        assertEquals(0f, plan.peek.value, 0.01f)
    }

    @Test
    fun episode_auto_threes_under_the_hero_reserve_at_960x540() {
        // heightFit(2) = ((540 − 100 − 2·70)/2)·(16/9) = 266.67dp with the
        // ~100dp hero chrome reserve; columnsAuto = floor(889.2/272.67) = 3 —
        // the pinned «Эпизодов в ряду» Авто cell; the 4-override clamps to
        // the auto count.
        val auto = gridPlan(
            883.2.dp, 540.dp,
            chromeReserve(UiScaleMode.REGULAR, GridSurface.EPISODE),
            captionReserve(UiScaleMode.REGULAR, GridSurface.EPISODE),
            STILL_ASPECT,
        )
        assertEquals(3, auto.columns)
        assertEquals(266.67f, auto.track.value, 0.01f)
        assertEquals(2, auto.rows)
        val four = gridPlan(
            883.2.dp, 540.dp,
            chromeReserve(UiScaleMode.REGULAR, GridSurface.EPISODE),
            captionReserve(UiScaleMode.REGULAR, GridSurface.EPISODE),
            STILL_ASPECT,
            columnOverride = 4,
        )
        assertEquals(3, four.columns)
    }

    @Test
    fun tv_stills_take_the_law_s_output_with_no_special_case() {
        // Q6: the law decides. heightFit(2) = ((540 − 80 − 2·42)/2)·(16/9) =
        // 334.22dp ≥ 110 → two rows; columnsAuto = floor(889.2/340.22) = 2.
        val plan = gridPlan(
            883.2.dp, 540.dp,
            chromeReserve(UiScaleMode.REGULAR, GridSurface.TV),
            captionReserve(UiScaleMode.REGULAR, GridSurface.TV),
            STILL_ASPECT,
        )
        assertEquals(2, plan.columns)
        assertEquals(334.22f, plan.track.value, 0.01f)
        assertEquals(2, plan.rows)
        assertEquals(0f, plan.peek.value, 0.01f)
    }
}
