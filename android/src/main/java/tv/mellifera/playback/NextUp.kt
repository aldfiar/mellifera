package tv.mellifera.playback

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import retrofit2.HttpException
import tv.mellifera.net.ItemDto
import tv.mellifera.net.MelliferaApi
import tv.mellifera.net.WatchDefaultsDto

/**
 * The ended-edge affordance's pure laws + production loader (D7 — the SPA
 * AutoNext/nextup.ts, TV-side): the card renders on an EPISODE's ended edge
 * only, decided on SERVED facts, never a media-type literal — a film (no
 * parseable episode facts) never renders it (no facts → no pick). The pick
 * is the LOWEST parsed (season, episode) strictly after the played item's
 * from the matched series' served episode list; the countdown seconds come
 * ONLY from the served GET /watch-defaults shape — an unusable value means
 * NO countdown and NEVER autoplay, the client bakes no fallback. Pure module
 * (facts/pick/countdown) pinned in NextUpTest; the loader is best-effort at
 * the caller (the orchestration swallows — never load-bearing).
 */

/**
 * The parsed episode identity the pick runs on (EpisodeFacts, lib/nextup):
 * the (season, episode) pair out of the source namespaces plus the series
 * anchor parsed.series_relative_path — the series row is matched on the PATH
 * fact, never on a title.
 */
data class EpisodeFacts(
    val libraryId: Long,
    val seriesPath: String,
    val season: Long,
    val episode: Long,
)

/**
 * The item's (library, series path, season, episode) facts, or null — null
 * when the document carries no parsed.series_relative_path anchor or no
 * parseable episode numbers (the caller omits it rather than guessing).
 * Structural only: no media-type literals anywhere.
 */
fun episodeFactsOf(item: ItemDto): EpisodeFacts? {
    val anchor = seriesAnchorOf(item) ?: return null
    val sources = (item.document as? JsonObject)?.get("sources") as? JsonObject ?: return null
    for (namespace in sources.values) {
        val ns = namespace as? JsonObject ?: continue
        val season = numberFact(ns["season"]) ?: continue
        val episode = numberFact(ns["episode"]) ?: continue
        return EpisodeFacts(item.libraryId, anchor, season, episode)
    }
    return null
}

/** An integer JSON number field, else null (numbers only — a string "5" is not). */
private fun numberFact(value: JsonElement?): Long? {
    val primitive = value as? JsonPrimitive ?: return null
    if (primitive.isString) return null
    return primitive.longOrNull
        ?: primitive.doubleOrNull?.takeIf { it == Math.floor(it) }?.toLong()
}

/** (season, episode) ordering: a later season wins; within a season, the later episode. */
private fun tupleGt(a: EpisodeFacts, b: EpisodeFacts): Boolean =
    a.season > b.season || (a.season == b.season && a.episode > b.episode)

/** The pick shape: the episode item to play plus its "S02E06" label composed
 * from the episode's raw facts (facts stay on the wire; only the naming is
 * composed). */
data class NextPick(val item: ItemDto, val label: String)

/**
 * Given the episode item being played and that series' episode items, the
 * LOWEST parsed episode facts strictly AFTER the current item's — null when
 * the current item carries no parseable episode facts (a film never
 * advances) or nothing is strictly after it. nextEpisodeAfter's law.
 */
fun nextEpisodeAfter(current: ItemDto, items: List<ItemDto>): NextPick? {
    val currentFacts = episodeFactsOf(current) ?: return null
    var best: EpisodeFacts? = null
    var bestItem: ItemDto? = null
    for (item in items) {
        val facts = episodeFactsOf(item) ?: continue
        if (!tupleGt(facts, currentFacts)) continue
        if (best == null || tupleGt(best, facts)) {
            best = facts
            bestItem = item
        }
    }
    bestItem ?: return null
    val b = best!!
    return NextPick(
        item = bestItem,
        label = "S" + b.season.toString().padStart(2, '0') +
            "E" + b.episode.toString().padStart(2, '0'),
    )
}

/**
 * The SERVED countdown, or null when the shape is not a usable positive
 * integer (unanswered, failed, malformed). null is NOT a default — it is
 * the refusal to guess: no countdown, no autoplay (the SPA servedCountdown
 * law, D7).
 */
fun servedCountdown(defaults: WatchDefaultsDto?): Long? =
    defaults?.autoNextCountdownSeconds?.takeIf { it >= 1 }

/**
 * The card's payload (the AutoNext render facts): the next episode to play,
 * the identity line (SERVED series display name beside the SxxEyy label —
 * facts stay on the wire; only the naming is served), the next episode's
 * served convention title, and the countdown snapshot taken at the edge's
 * open — null = the served shape was not usable THEN: no countdown, never
 * autoplay (a late answer never starts one).
 */
data class NextUpOffer(
    val itemId: String,
    val nameLine: String,
    val episodeTitle: String,
    val countdownSeconds: Long?,
)

/**
 * The production next-up loader (D7): the SPA AutoNext's reads over the
 * typed wire — GET /items/{id} for the played item, the facts gate (a film
 * answers null — no card), GET /series?library matched BY PATH on the parsed
 * anchor (an unmatched anchor answers null — the SPA's series-null gate),
 * GET /series/{id}/episodes for the pick, and GET /watch-defaults for the
 * countdown. The countdown read is its own best-effort leg: a FAILURE there
 * still yields the card, just without a countdown — never autoplay (the SPA
 * renders the card without a countdown when the shape has not answered).
 * Failures surface at the caller (the orchestration swallows).
 */
fun apiNextUpLoader(api: MelliferaApi): NextUpLoader = NextUpLoader { itemId ->
    val item = api.item(itemId).item
    val facts = episodeFactsOf(item) ?: return@NextUpLoader null
    val series = api.series(facts.libraryId).items.find { it.relativePath == facts.seriesPath }
        ?: return@NextUpLoader null
    val pick = nextEpisodeAfter(item, api.episodes(series.id).items)
        ?: return@NextUpLoader null
    val countdown = try {
        servedCountdown(api.watchDefaults())
    } catch (e: CancellationException) {
        throw e
    } catch (e: HttpException) {
        if (e.code() == 401) throw e
        null
    } catch (e: Exception) {
        null
    }
    NextUpOffer(
        itemId = pick.item.id,
        nameLine = listOf(series.displayName, pick.label)
            .filter { part -> part.isNotEmpty() }
            .joinToString(" · "),
        episodeTitle = pick.item.metadata?.episode?.title.orEmpty(),
        countdownSeconds = countdown,
    )
}
