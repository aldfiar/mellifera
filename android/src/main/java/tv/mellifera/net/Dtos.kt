package tv.mellifera.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

/**
 * The TV client's DTOs — ONE file until >~250 lines (5.3's law). Every shape
 * is grounded in the live Go handlers (Go wins on wire shape); unknown keys
 * are ignored (the server's DTOs are additive by law), and omitempty fields
 * carry defaults so honest absence decodes.
 */

/** POST /pair's answer (pairing.go pairCreateResponse): capability id + code. */
@Serializable
data class PairCreateResponse(
    @SerialName("pairing_id") val pairingId: String,
    val code: String,
)

/**
 * GET /pair/{id}/wait (pairing.go pairWaitResponse): status always,
 * device_token only on the one pickup poll (pairing INV2). Statuses:
 * pending | approved | denied | expired | consumed — an immediate status
 * read, never a long poll.
 */
@Serializable
data class PairWaitResponse(
    val status: String,
    @SerialName("device_token") val deviceToken: String? = null,
)

/**
 * libraryDTO (handlers.go): the fields the client consumes — module_id
 * carries the serial+tv filter law (5.6 is where the filter lives); the
 * module presentation block stays server-side.
 */
@Serializable
data class LibraryDto(
    val id: Long,
    @SerialName("module_id") val moduleId: String,
    @SerialName("display_name") val displayName: String = "",
    val description: String = "",
    @SerialName("streams_enabled") val streamsEnabled: Boolean = false,
)

/** GET /libraries' wire shape. */
@Serializable
data class LibrariesResponse(val items: List<LibraryDto> = emptyList())

/**
 * One depth-1 folder prefix + its item count (handlers.go folderDTO);
 * top-level files report path "".
 */
@Serializable
data class FolderDto(val path: String, val items: Long)

/** GET /libraries/{id}/folders' wire shape (handlers.go libraryFoldersResponse). */
@Serializable
data class LibraryFoldersResponse(val folders: List<FolderDto> = emptyList())

/**
 * GET /libraries/{id}/summary (handlers.go librarySummaryResponse): the
 * constant-time count aggregate the collections rail reads (5.14). updated_at
 * is served but deliberately not carried — unconsumed, and the decoder
 * ignores unknown keys by law.
 */
@Serializable
data class LibrarySummaryResponse(
    @SerialName("library_id") val libraryId: Long,
    val items: Long,
)

/**
 * One counted facet value (internal/api/facets.go facetValueDTO): the
 * document fact rendered verbatim — never transliterated or re-cased — with
 * its per-library count. Count >= 1 always.
 */
@Serializable
data class FacetValueDto(val value: String, val count: Int)

/**
 * One facet key's counted values (facetDTO): only keys at least one
 * document carries are present — a key with no carrier anywhere is absent
 * from the list (honest absence).
 */
@Serializable
data class FacetDto(val key: String, val values: List<FacetValueDto> = emptyList())

/**
 * GET /libraries/{id}/facets' wire shape (facetsResponse): facets is
 * always non-nil — a library with no aggregates serves {"facets":[]},
 * never null.
 */
@Serializable
data class FacetsResponse(val facets: List<FacetDto> = emptyList())

/**
 * The served convention projection (media-data-convention; internal/naming/
 * metadata.go MetadataFor): each group (about/cast/episode) comes WHOLE from
 * the first effectively-enabled source_chain namespace that carries it —
 * never stitched across sources, values verbatim — and an absent group means
 * the block is absent, never fabricated. Dtos.kt mirrors web/src/lib/api.ts
 * ElementMetadata field-for-field (L6); the opaque whole document stays
 * uncarried (the client walks no namespaces).
 */
@Serializable
data class MetadataAbout(
    /** The winning namespace id — who wrote the block. */
    val source: String = "",
    /** The carrier: always present on a served about block. */
    val description: String = "",
    val genres: List<String>? = null,
    val score: Double? = null,
    val kind: String? = null,
    val status: String? = null,
    val episodes: Long? = null,
    @SerialName("aired_on") val airedOn: String? = null,
)

/** One served cast entry (api.ts MetadataCastEntry). */
@Serializable
data class MetadataCastEntry(
    val name: String,
    val role: String? = null,
    @SerialName("photo_url") val photoUrl: String? = null,
)

/**
 * The episode document's own fields (api.ts MetadataEpisode) — honest
 * partial: title alone is a served episode block.
 */
@Serializable
data class MetadataEpisode(
    val title: String? = null,
    val description: String? = null,
)

/** The typed metadata block (api.ts ElementMetadata). */
@Serializable
data class ElementMetadata(
    val about: MetadataAbout? = null,
    val cast: List<MetadataCastEntry>? = null,
    val episode: MetadataEpisode? = null,
)

/**
 * seriesDTO (handlers.go): served display_name/artwork/watched verbatim —
 * watched/rec_score are omitempty, hence nullable (the field-driven law:
 * absent renders absent, never fabricated — 5.6). metadata is the served
 * convention projection (read-time, omitempty — absence means no block,
 * never an empty one). The opaque serial document is deliberately not
 * carried; episodes come from their own route.
 */
@Serializable
data class SeriesDto(
    val id: String,
    @SerialName("library_id") val libraryId: Long = 0,
    /** The path fact the player's About matcher runs on (D7): the parsed
     * series anchor is matched against THIS field (api.ts SeriesDTO). */
    @SerialName("relative_path") val relativePath: String = "",
    @SerialName("display_name") val displayName: String = "",
    val artwork: String? = null,
    val metadata: ElementMetadata? = null,
    @SerialName("rec_score") val recScore: Double? = null,
    val watched: Boolean? = null,
)

/** GET /series' wire shape. */
@Serializable
data class SeriesListResponse(val items: List<SeriesDto> = emptyList())

/**
 * itemDTO (handlers.go) as episodes serve it — identity + the composed
 * display and the read-time stamps. Document stays opaque (JsonElement) so a
 * later consumer reads exactly what the server stored, never a projection.
 * relative_path rides the tv/image file cards' title floor (the MovieCard
 * idiom — a blank or filename display_name floors to the extension-less stem).
 */
@Serializable
data class ItemDto(
    val id: String,
    @SerialName("library_id") val libraryId: Long = 0,
    @SerialName("relative_path") val relativePath: String = "",
    @SerialName("media_type") val mediaType: String = "",
    val document: JsonElement = JsonNull,
    @SerialName("display_name") val displayName: String = "",
    val artwork: String? = null,
    val watched: Boolean? = null,
    /** The served convention projection (itemDTO.metadata — the same
     * read-time block SeriesDto carries; omitempty: absence means no block,
     * never an empty one). The player's info blocks read THIS (D7). */
    val metadata: ElementMetadata? = null,
)

/** GET /series/{id}/episodes and GET /items' shared wire shape. */
@Serializable
data class ItemsResponse(val items: List<ItemDto> = emptyList())

/** GET /items/{id}'s wire shape (handlers.go itemResponse — itemDTO as-is). */
@Serializable
data class ItemResponse(val item: ItemDto)

/**
 * The playback descriptor (playback.go playbackResponse): mode direct|hls,
 * state none|partial|complete|failed|missing|unsupported, play_url RELATIVE
 * (resolved against the configured base — never logged, INV4); state_reason
 * is the honesty vocabulary on non-native floors; codecs/layout answered on
 * hls only (omitempty); sections/voiceovers are server-composed projections
 * the client reads opaquely; voiceovers are the typed exception (api.ts
 * VoiceoverDTO, L6) — the document-order {index, label} list the voiceover
 * picker reads.
 */
/**
 * One voiceover entry (playback.go Voiceover — the sidecar's document index
 * plus its presentation label, stamped language first). Document order is
 * preserved; field names match the JSON shape exactly (api.ts VoiceoverDTO).
 */
@Serializable
data class VoiceoverDto(val index: Int, val label: String)

@Serializable
data class PlaybackDescriptor(
    val mode: String,
    val state: String,
    @SerialName("play_url") val playUrl: String,
    @SerialName("state_reason") val stateReason: String? = null,
    val codecs: List<String> = emptyList(),
    val layout: String? = null,
    val sections: List<JsonElement> = emptyList(),
    val voiceovers: List<VoiceoverDto> = emptyList(),
)

/**
 * POST /items/{id}/play's body (playRequest): retry=true asks a failed
 * packaging run to re-enqueue; from_seconds is reserved (no-op in v1).
 */
@Serializable
data class PlayRequest(
    val retry: Boolean = false,
    @SerialName("from_seconds") val fromSeconds: Double? = null,
)

/** playResponse: queued reports whether a re-enqueue actually happened. */
@Serializable
data class PlayResponse(val queued: Boolean = false)

/** PUT /progress/{item_id}'s body (progressRequest): seconds are integers
 * on the wire; completed marks an explicit completed watch (watched-states). */
@Serializable
data class ProgressRequest(
    @SerialName("position_seconds") val positionSeconds: Long,
    val completed: Boolean = false,
)

/**
 * progressDTO — the ONE wire shape for a stored position (INV4): integer
 * seconds + raw RFC3339 stamp; rec_score/watched are omitempty read-time
 * stamps, hence nullable.
 */
@Serializable
data class ProgressDto(
    @SerialName("item_id") val itemId: String,
    @SerialName("position_seconds") val positionSeconds: Long,
    @SerialName("updated_at") val updatedAt: String,
    @SerialName("rec_score") val recScore: Double? = null,
    val watched: Boolean? = null,
)

/**
 * GET /home's wire shape (internal/api/home.go homeResponse): ONE
 * server-composed round-trip — the caller's positive-progress set grouped
 * into entity-grain rows, ordered score-then-recency server-side. `continue`
 * is a Kotlin keyword, so the wire key rides @SerialName; the client
 * re-sorts nothing (D4).
 */
@Serializable
data class HomeResponse(@SerialName("continue") val rows: List<ContinueRow> = emptyList())

/**
 * ONE continue rail row (home.go continueRow): the anchoring series beside
 * the row's resume facts. The two offers are constructive, never decorative
 * — `current` present iff the entity's resume-max pick resolves (the resume
 * card), absent — the omitempty field GONE from the wire, never null — on
 * the anchor card (every touched row ledgered); `next` present iff a
 * strictly-after episode resolves. A film row serves the series fields as
 * "" (honest absence, never a fabricated owner) and never carries next.
 * artwork is omitempty — absent when nothing composes.
 */
@Serializable
data class ContinueRow(
    @SerialName("series_id") val seriesId: String = "",
    @SerialName("series_display_name") val seriesDisplayName: String = "",
    @SerialName("library_id") val libraryId: Long = 0,
    @SerialName("library_name") val libraryName: String = "",
    val artwork: String? = null,
    val current: ContinueCurrent? = null,
    val next: ContinueNext? = null,
)

/**
 * The row's resume point (home.go continueCurrent): the item to deep-link
 * into, its served display name, the parsed episode identity when the
 * document carries it, the episode's own convention title, the stored
 * position, and the ffprobe duration ONLY when the document stores it
 * (omitempty — the honest absence a client renders as a bar-less row).
 */
@Serializable
data class ContinueCurrent(
    @SerialName("item_id") val itemId: String,
    @SerialName("display_name") val displayName: String = "",
    val season: Long? = null,
    val episode: Long? = null,
    @SerialName("episode_title") val episodeTitle: String = "",
    @SerialName("position_seconds") val positionSeconds: Long = 0,
    @SerialName("duration_seconds") val durationSeconds: Long? = null,
)

/**
 * The row's Play-able suggestion (home.go continueNext): the episode item
 * to deep-link into and the server-composed SxxEyy label — the client
 * composed neither label nor pick (D4).
 */
@Serializable
data class ContinueNext(
    @SerialName("item_id") val itemId: String,
    val label: String,
)

/**
 * GET /watch-defaults's wire shape (watch_defaults.go watchDefaultsResponse):
 * ONE configured int — the auto-next countdown seconds, resolved server-side
 * from MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS (default 10, floor 1) and served
 * verbatim. The client bakes NO countdown value of its own: an unusable value
 * means no countdown and NEVER autoplay (the SPA servedCountdown law) — the
 * usable-positive-integer ruling lives in the playback layer's pure mapper.
 */
@Serializable
data class WatchDefaultsDto(
    @SerialName("auto_next_countdown_seconds") val autoNextCountdownSeconds: Long? = null,
)

/** One group entry of the profile wire shape: the member facts only. */
@Serializable
data class ProfileGroup(val id: Long, val name: String)

/**
 * GET /profile (profileResponse): kind admin|user|device; user_id omitted
 * for userless kinds; prefs crosses byte-verbatim (JsonElement, null on the
 * device kind); debug rides the device kind only, omitted while false
 * (omitempty → nullable — the two-tier telemetry gate reads it, 5.11).
 */
@Serializable
data class ProfileResponse(
    val kind: String,
    @SerialName("user_id") val userId: Long? = null,
    val name: String,
    val role: String,
    val groups: List<ProfileGroup> = emptyList(),
    val prefs: JsonElement = JsonNull,
    val debug: Boolean? = null,
)

/**
 * POST /debug-events' body (debugEventRequest): no credential field exists
 * (INV4 — nothing token-shaped can enter, so nothing token-shaped can be
 * logged). item_id/mode/phase/code/detail are per-kind optional at the wire
 * level; the closed kind vocabulary lives server-side
 * (playback-trace|capability-snapshot|fatal|video-error|stalled).
 */
@Serializable
data class DebugEventRequest(
    val kind: String,
    @SerialName("item_id") val itemId: String = "",
    val mode: String = "",
    val phase: String = "",
    val code: String = "",
    val detail: String = "",
)
