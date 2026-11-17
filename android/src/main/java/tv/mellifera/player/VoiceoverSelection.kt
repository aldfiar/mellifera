package tv.mellifera.player

import tv.mellifera.state.RenditionPlan

/**
 * The voiceover mapping law (5.8; api.ts:314-334, RenditionPlan D-2): a
 * user's voiceover pick maps onto the player's audio-track index.
 *
 * - [RenditionPlan.SingleVariant] — the flat one-audio master keeps the
 *   embedded original at track 0, so pick k selects k+1 (the plan's own
 *   audioTrack law, pinned by RenditionPlanTest).
 * - [RenditionPlan.Rendition] — one variant per audio stream: the master's
 *   audio tracks ARE the voiceovers in order, so the pick passes through
 *   unchanged and the player's own track-selection semantics apply (the
 *   native chooser; the UI drives it with the same indices it rendered).
 * - [RenditionPlan.NoPicker] — layout absent or unknown: fail-open, null —
 *   no picker rendered, no selection attempted, default audio keeps
 *   playing.
 *
 * The caller treats null as "no control": a stray pick is a no-op and
 * playback is never disturbed. A non-null result goes to
 * [PlayerController.selectVoiceover], which overrides the native audio
 * track at that index (TrackSelectionOverride).
 */
fun voiceoverTrackIndex(plan: RenditionPlan, pick: Int): Int? = when (plan) {
    is RenditionPlan.SingleVariant -> plan.audioTrack(pick)
    RenditionPlan.Rendition -> pick
    RenditionPlan.NoPicker -> null
}
