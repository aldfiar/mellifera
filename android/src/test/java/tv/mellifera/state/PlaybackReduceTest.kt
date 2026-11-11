package tv.mellifera.state

import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.mellifera.net.PlaybackDescriptor

/**
 * The playback flow law's truth table (5.5): each named test pins contract
 * rows; the machine under test is the REAL pure reduce — no mocks, no
 * transport, deterministic (state, event) → (state, effects).
 */
class PlaybackReduceTest {

    private fun desc(
        mode: String = "hls",
        state: String = "complete",
        stateReason: String? = null,
        layout: String? = null,
        playUrl: String = "/media/items/i1/hls/index.m3u8?token=tok",
        voiceovers: Int = 0,
    ) = PlaybackDescriptor(
        mode = mode,
        state = state,
        playUrl = playUrl,
        stateReason = stateReason,
        layout = layout,
        voiceovers = List(voiceovers) { JsonPrimitive("v$it") },
    )

    /** Idle → PlayRequested → the describe leg is in flight. */
    private fun describing(item: String = "i1"): PlaybackState.Starting {
        val t = reduce(PlaybackState.Idle, PlaybackEvent.PlayRequested(item))
        return t.state as PlaybackState.Starting
    }

    /** A Starting state walked to the poll: preparing HLS, played once. */
    private fun polling(item: String = "i1"): PlaybackState.Starting {
        val s = describing(item)
        val t1 = reduce(s, PlaybackEvent.Described(desc(state = "preparing")))
        val t2 = reduce(t1.state, PlaybackEvent.Played(queued = false))
        return t2.state as PlaybackState.Starting
    }

    private fun active(): PlaybackState.Active {
        val t = reduce(
            reduce(describing(), PlaybackEvent.Described(desc())).state,
            PlaybackEvent.Played(queued = false),
        )
        return t.state as PlaybackState.Active
    }

    @Test
    fun degrade_on_queued_false() {
        // Row 1: direct descriptor → play {retry:false} → queued:false is
        // the DEGRADE — launch now, never enqueue-wait.
        var t = reduce(PlaybackState.Idle, PlaybackEvent.PlayRequested("i1"))
        var s = t.state as PlaybackState.Starting
        assertEquals(Phase.Describing, s.phase)
        assertEquals(listOf<PlaybackEffect>(PlaybackEffect.Describe("i1")), t.effects)

        t = reduce(s, PlaybackEvent.Described(desc(mode = "direct", state = "none")))
        s = t.state as PlaybackState.Starting
        assertEquals(Phase.Playing, s.phase)
        assertTrue(s.usedMaybePlay)
        assertEquals(listOf<PlaybackEffect>(PlaybackEffect.Play("i1", retry = false)), t.effects)

        t = reduce(s, PlaybackEvent.Played(queued = false))
        val a = t.state as PlaybackState.Active
        assertEquals(
            listOf<PlaybackEffect>(PlaybackEffect.Launch(a.session)),
            t.effects,
        )
        // play_url rides VERBATIM (relative; resolution is transport law).
        assertEquals("/media/items/i1/hls/index.m3u8?token=tok", a.session.url)
        assertEquals("direct", a.session.mode)
        assertEquals(RenditionPlan.NoPicker, a.session.plan)

        // Row 2: hls partial is ALREADY playable — same degrade, no poll.
        t = reduce(describing(), PlaybackEvent.Described(desc(state = "partial")))
        t = reduce(t.state, PlaybackEvent.Played(queued = false))
        assertTrue(t.state is PlaybackState.Active)
        assertTrue(t.effects.all { it !is PlaybackEffect.Poll })
    }

    @Test
    fun preparing_polls_once_then_active() {
        // Row 3: hls preparing → play {retry:false} exactly ONCE, then the
        // 2s→30s poll until playable.
        val s = describing()
        val t1 = reduce(s, PlaybackEvent.Described(desc(state = "preparing")))
        assertTrue(t1.effects.contains(PlaybackEffect.Play("i1", retry = false)))

        val t2 = reduce(t1.state, PlaybackEvent.Played(queued = false))
        val p = t2.state as PlaybackState.Starting
        assertEquals(Phase.Polling, p.phase)
        assertTrue(p.usedMaybePlay)
        assertEquals(listOf<PlaybackEffect>(PlaybackEffect.Poll(POLL_FIRST_MS)), t2.effects)

        // The ONCE: polling steps never emit another Play.
        val t3 = reduce(p, PlaybackEvent.Described(desc(state = "preparing")))
        assertTrue(t3.effects.all { it !is PlaybackEffect.Play })
        val t4 = reduce(t3.state, PlaybackEvent.Played(queued = false))
        assertTrue(t4.effects.all { it !is PlaybackEffect.Play })

        // Playable at last — Active with NO second play, no enqueue-wait.
        val t5 = reduce((t3.state as PlaybackState.Starting), PlaybackEvent.Described(desc(state = "partial")))
        assertTrue(t5.state is PlaybackState.Active)
        assertTrue(t5.effects.all { it !is PlaybackEffect.Play })

        // A queued:true play (202) lands in the poll too.
        val q = reduce(
            reduce(describing(), PlaybackEvent.Described(desc())).state,
            PlaybackEvent.Played(queued = true),
        )
        assertEquals(Phase.Polling, (q.state as PlaybackState.Starting).phase)
    }

    @Test
    fun missing_unsupported_dead() {
        // Row 4: missing/unsupported descriptors end Dead — honest RU
        // banner, NO retry (Dead carries no chip; effects are empty).
        var t = reduce(describing(), PlaybackEvent.Described(desc(state = "missing")))
        assertEquals(PlaybackState.Dead(BANNER_MISSING), t.state)
        assertEquals(emptyList<PlaybackEffect>(), t.effects)

        t = reduce(describing(), PlaybackEvent.Described(desc(state = "unsupported")))
        assertEquals(PlaybackState.Dead(BANNER_UNSUPPORTED), t.state)

        // Mid-poll the same vocabulary rules: poll answer missing → Dead.
        t = reduce(polling(), PlaybackEvent.Described(desc(state = "missing")))
        assertEquals(PlaybackState.Dead(BANNER_MISSING), t.state)
    }

    @Test
    fun failed_retry_chip_replays() {
        // Row 8 (the entry into Failed): an Active player-level failure
        // beacons its kind and lands in Failed.
        val a = active()
        val t1 = reduce(a, PlaybackEvent.PlayerFailed("video-error", code = "decode", detail = "hevc"))
        val f = t1.state as PlaybackState.Failed
        assertEquals(BANNER_FAILED, f.banner)
        assertEquals(
            listOf<PlaybackEffect>(PlaybackEffect.Beacon("video-error", "hls", "decode", "hevc")),
            t1.effects,
        )

        // Row 5: the chip replays describe + play {retry:true} — attempt>0
        // is what flips the retry leg.
        val t2 = reduce(f, PlaybackEvent.RetryRequested)
        val s = t2.state as PlaybackState.Starting
        assertEquals(Phase.Describing, s.phase)
        assertEquals(1, s.attempt)
        assertEquals(listOf<PlaybackEffect>(PlaybackEffect.Describe("i1")), t2.effects)

        val t3 = reduce(s, PlaybackEvent.Described(desc(state = "failed", stateReason = "codec_unsupported")))
        // The failed descriptor itself lands in Failed with its own reason…
        val f3 = t3.state as PlaybackState.Failed
        assertEquals("codec_unsupported", f3.banner)
        // …and the chip replays again, this time the play carries retry:true.
        val t4 = reduce(f3, PlaybackEvent.RetryRequested)
        val s4 = t4.state as PlaybackState.Starting
        val t5 = reduce(s4, PlaybackEvent.Described(desc(mode = "hls", state = "partial")))
        assertTrue(t5.effects.contains(PlaybackEffect.Play("i1", retry = true)))

        // The 400-nothing_failed leg surfaces the descriptor's own
        // state_reason vocabulary verbatim — when the carried descriptor
        // carries a reason, that token IS the banner.
        val carrying = PlaybackState.Starting("i1", Phase.Playing, 2, true, desc(stateReason = "non_native_container"))
        val t6 = reduce(carrying, PlaybackEvent.PlayRejected(ApiFailure.Http(400)))
        assertEquals("non_native_container", (t6.state as PlaybackState.Failed).banner)
        // A descriptor without a reason (native answers carry none) and a
        // transport-level rejection both keep the honest generic banner —
        // the chip survives every leg.
        val bare = t5.state as PlaybackState.Starting
        val t7 = reduce(bare, PlaybackEvent.PlayRejected(ApiFailure.Http(400)))
        assertEquals(BANNER_FAILED, (t7.state as PlaybackState.Failed).banner)
        val t8 = reduce(bare, PlaybackEvent.PlayRejected(ApiFailure.Transport))
        assertEquals(BANNER_FAILED, (t8.state as PlaybackState.Failed).banner)
    }

    @Test
    fun poll_backoff_2s_30s() {
        // Row 3/6: the curve is 2s doubling to a 30s cap, UNCAPPED in
        // count — every 5xx and transport error rides the SAME curve.
        var s = polling()
        assertEquals(1, s.attempt)
        val expected = longArrayOf(4_000, 8_000, 16_000, 30_000, 30_000, 30_000)
        for (delay in expected) {
            val t = reduce(s, PlaybackEvent.PollFailed(ApiFailure.Transport))
            s = t.state as PlaybackState.Starting
            assertEquals(Phase.Polling, s.phase)
            assertEquals(listOf<PlaybackEffect>(PlaybackEffect.Poll(delay)), t.effects)
        }
        // Still polling deep into the curve — it never runs out.
        for (i in 0 until 6) {
            val t = reduce(s, PlaybackEvent.PollFailed(ApiFailure.Http(503)))
            s = t.state as PlaybackState.Starting
            assertEquals(listOf<PlaybackEffect>(PlaybackEffect.Poll(POLL_MAX_MS)), t.effects)
        }

        // 404 mid-poll is Dead immediately.
        val t = reduce(s, PlaybackEvent.PollFailed(ApiFailure.Http(404)))
        assertEquals(PlaybackState.Dead(BANNER_MISSING), t.state)
    }

    @Test
    fun unauth_wipes_to_pairing() {
        // Row 7: 401 on ANY api call wipes to Pairing — playback returns to
        // Idle and the single WipeToPairing effect is all the wiring gets
        // (POST /pair stays user-action-only, 5.4).
        val expected = Transition(PlaybackState.Idle, listOf(PlaybackEffect.WipeToPairing))

        var t = reduce(describing(), PlaybackEvent.DescribeFailed(ApiFailure.Http(401)))
        assertEquals(expected, t)

        t = reduce(polling(), PlaybackEvent.PollFailed(ApiFailure.Http(401)))
        assertEquals(expected, t)

        t = reduce(
            reduce(describing(), PlaybackEvent.Described(desc())).state,
            PlaybackEvent.PlayRejected(ApiFailure.Http(401)),
        )
        assertEquals(expected, t)

        t = reduce(active(), PlaybackEvent.Unauthorized)
        assertEquals(expected, t)
    }
}
