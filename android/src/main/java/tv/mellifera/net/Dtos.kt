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
 * seriesDTO (handlers.go): served display_name/artwork/watched verbatim —
 * watched/rec_score are omitempty, hence nullable (the field-driven law:
 * absent renders absent, never fabricated — 5.6). The opaque serial document
 * is deliberately not carried; episodes come from their own route.
 */
@Serializable
data class SeriesDto(
    val id: String,
    @SerialName("library_id") val libraryId: Long = 0,
    @SerialName("display_name") val displayName: String = "",
    val artwork: String? = null,
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
 */
@Serializable
data class ItemDto(
    val id: String,
    @SerialName("library_id") val libraryId: Long = 0,
    @SerialName("media_type") val mediaType: String = "",
    val document: JsonElement = JsonNull,
    @SerialName("display_name") val displayName: String = "",
    val artwork: String? = null,
    val watched: Boolean? = null,
)

/** GET /series/{id}/episodes and GET /items' shared wire shape. */
@Serializable
data class ItemsResponse(val items: List<ItemDto> = emptyList())

/**
 * The playback descriptor (playback.go playbackResponse): mode direct|hls,
 * state none|partial|complete|failed|missing|unsupported, play_url RELATIVE
 * (resolved against the configured base — never logged, INV4); state_reason
 * is the honesty vocabulary on non-native floors; codecs/layout answered on
 * hls only (omitempty); sections/voiceovers are server-composed projections
 * the client reads opaquely.
 */
@Serializable
data class PlaybackDescriptor(
    val mode: String,
    val state: String,
    @SerialName("play_url") val playUrl: String,
    @SerialName("state_reason") val stateReason: String? = null,
    val codecs: List<String> = emptyList(),
    val layout: String? = null,
    val sections: List<JsonElement> = emptyList(),
    val voiceovers: List<JsonElement> = emptyList(),
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
