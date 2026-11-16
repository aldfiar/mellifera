package tv.mellifera.net

import java.net.URI
import java.net.URL
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response as OkHttpResponse
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The TV client's typed transport (5.3): Retrofit + kotlinx.serialization
 * over OkHttp, every route grounded in the shipped mount table
 * (internal/api/router.go). Plain-http LAN posture — cleartext is the
 * app-wide manifest law; the bearer token is the only credential.
 */
interface MelliferaApi {
    /** POST /pair (createPairing) — unauthenticated; the 128-bit pairing id
     * is the capability the device polls against. */
    @POST("api/v1/pair")
    suspend fun pair(): PairCreateResponse

    /** GET /pair/{id}/wait (waitPairing) — an IMMEDIATE status read; the
     * device token rides the answer exactly once (pairing INV2). */
    @GET("api/v1/pair/{id}/wait")
    suspend fun waitPairing(@Path("id") id: String): PairWaitResponse

    /** GET /libraries (listLibraries) — every visible module; the client
     * keeps ALL of them in served order (5.14 SPA-parity collections law). */
    @GET("api/v1/libraries")
    suspend fun libraries(): LibrariesResponse

    /** GET /libraries/{id}/summary (librarySummary) — the rail count
     * aggregate (5.14); fetched only while the collections rail is open. */
    @GET("api/v1/libraries/{id}/summary")
    suspend fun librarySummary(@Path("id") libraryId: Long): LibrarySummaryResponse

    /** GET /series?library={id} (listSeries) — scored default order. */
    @GET("api/v1/series")
    suspend fun series(@Query("library") libraryId: Long): SeriesListResponse

    /**
     * GET /items (listItems) — the tv/image bodies' paged stream (D6): the
     * library's items in scored default order, cut AFTER the full filter.
     * A folder chip's pick rides the SAME request the grid pages (never a
     * client-side post-filter): a named folder → path_prefix, the top-level
     * chip → top_level=true; a null query param stays off the wire.
     */
    @GET("api/v1/items")
    suspend fun items(
        @Query("library") libraryId: Long,
        @Query("path_prefix") pathPrefix: String? = null,
        @Query("top_level") topLevel: Boolean? = null,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): ItemsResponse

    /** GET /libraries/{id}/folders (libraryFolders) — the photo body's
     * folder chips: depth-1 prefixes + the item counts the filtered stream
     * pages 1:1 (D6). */
    @GET("api/v1/libraries/{id}/folders")
    suspend fun libraryFolders(@Path("id") libraryId: Long): LibraryFoldersResponse

    /** GET /series/{id}/episodes (seriesEpisodes) — narrative order. */
    @GET("api/v1/series/{id}/episodes")
    suspend fun episodes(@Path("id") seriesId: String): ItemsResponse

    /** GET /items/{id}/playback (itemPlayback) — the descriptor; the media
     * token rides the answer's Set-Cookie, never the body (INV4). */
    @GET("api/v1/items/{id}/playback")
    suspend fun playback(@Path("id") itemId: String): PlaybackDescriptor

    /** GET /items/{id} (getItem) — the played item's detail row; the player's
     * info blocks read its metadata projection (D7 — no TV-specific wire). */
    @GET("api/v1/items/{id}")
    suspend fun item(@Path("id") itemId: String): ItemResponse

    /** POST /items/{id}/play (itemPlay) — retry=true re-enqueues a failed
     * packaging run; 200 plain ack (queued=false), 202 when one happened. */
    @POST("api/v1/items/{id}/play")
    suspend fun play(@Path("id") itemId: String, @Body body: PlayRequest): PlayResponse

    /** GET /progress/{item_id} (getProgress). */
    @GET("api/v1/progress/{itemId}")
    suspend fun progress(@Path("itemId") itemId: String): ProgressDto

    /** PUT /progress/{item_id} (putProgress). */
    @PUT("api/v1/progress/{itemId}")
    suspend fun putProgress(@Path("itemId") itemId: String, @Body body: ProgressRequest): ProgressDto

    /** GET /home (home) — the continue rail (browse-scale D5): the caller's
     * full positive-progress set as entity-grain rows, ONE server-composed
     * round-trip — the exact wire the SPA's Home reads; the client re-sorts
     * nothing and derives nothing twice (D4). */
    @GET("api/v1/home")
    suspend fun home(): HomeResponse

    /** GET /watch-defaults (watchDefaults) — the auto-next countdown
     * seconds (watch-flow-polish): the served env config the AutoNext
     * card's countdown starts from; no TV-specific wire (D7). */
    @GET("api/v1/watch-defaults")
    suspend fun watchDefaults(): WatchDefaultsDto

    /** GET /profile (profile) — the caller's own identity. */
    @GET("api/v1/profile")
    suspend fun profile(): ProfileResponse

    /** POST /debug-events (debugEvent) — fire-and-forget ingest, 200 empty;
     * Response so the sender reads the status (429 cooldown, 5.8). */
    @POST("api/v1/debug-events")
    suspend fun debugEvent(@Body body: DebugEventRequest): Response<Unit>
}

/**
 * Attaches `Authorization: Bearer <token>` to every request while a token is
 * set — the credential form the server's auth chain consumes — and lets the
 * request through bare while none is (the pairing posture). The provider is
 * read per request, so a runtime token change takes effect without
 * rebuilding the client (the 401-wipe law rides this, 5.4).
 */
class BearerTokenInterceptor(private val tokenProvider: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): OkHttpResponse {
        val token = tokenProvider()
        val request = if (token.isNullOrBlank()) {
            chain.request()
        } else {
            chain.request().newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        }
        return chain.proceed(request)
    }
}

/**
 * The client assembly: one Retrofit instance per configured base. The
 * decoder ignores unknown keys (the server's DTOs are additive by law) and
 * omits nulls on encode (a DebugEventRequest's non-carried legs stay off the
 * wire for capability-snapshot) while defaults still encode (the explicit
 * retry:false the degrade law sends first).
 */
class Api(
    baseUrl: String,
    var token: String? = null,
) {
    /** Retrofit requires the trailing slash; the address screen may hand a
     * bare host[:port]. */
    private val normalizedBase: String = baseUrl.trimEnd('/') + "/"

    private val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(BearerTokenInterceptor { token })
        .build()

    val service: MelliferaApi = Retrofit.Builder()
        .baseUrl(normalizedBase)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(MelliferaApi::class.java)

    /**
     * Resolves the descriptor's RELATIVE play_url against the configured
     * base (the playback law). An already-absolute URL passes through
     * unchanged — never re-prefix one.
     */
    fun resolvePlayUrl(playUrl: String): String {
        if (isAbsolute(playUrl)) return playUrl
        return URL(URL(normalizedBase), playUrl).toString()
    }

    private fun isAbsolute(url: String): Boolean =
        try {
            URI(url).isAbsolute
        } catch (_: Exception) {
            false
        }
}
