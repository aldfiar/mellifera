package tv.mellifera.browse.fixtures

/**
 * MockWebServer bodies mirroring the LIVE browse handlers' wire shapes
 * (internal/api/handlers.go — display_name always on the wire; artwork/
 * watched omitempty honest absence). The 7.1 wire joints own the
 * full-shape fixtures; these carry the fields 5.6 consumes.
 */

/**
 * The served collections (5.14): serial + a second collection of another
 * module — the all-collections law keeps BOTH in served order (the former
 * serial+tv client filter is retired; the "movie" module stands in for any
 * type the client has no special knowledge of — under the module-keyed body
 * law (D6) it renders the honest empty state and fires NO body fetch).
 */
fun librariesBody(): String = """
    {"items":[
      {"id":1,"module_id":"serial","root_path":"/media/serial",
       "display_name":"Сериалы","description":"","streams_enabled":true},
      {"id":2,"module_id":"movie","root_path":"/media/movie",
       "display_name":"Фильмы","description":"","streams_enabled":false}
    ]}
""".trimIndent()

/**
 * serial + tv — the D6 fetch-on-navigate fixtures: the tv body walks
 * GET /items (the paged stream) where the serial body walks GET /series.
 */
fun tvLibrariesBody(): String = """
    {"items":[
      {"id":1,"module_id":"serial","root_path":"/media/serial",
       "display_name":"Сериалы","description":"","streams_enabled":true},
      {"id":2,"module_id":"tv","root_path":"/media/tv",
       "display_name":"ТВ","description":"","streams_enabled":false}
    ]}
""".trimIndent()

/**
 * Library 2's (tv) items page: f-1 carries the parsed facts, the ffprobe
 * duration and the frame-grabber thumb fact (the full MovieCard idiom); f-2
 * is the bare row (honest absences everywhere, its display_name IS its
 * filename — the title floor fires).
 */
fun tvItemsBody(): String = """
    {"items":[
      {"id":"f-1","module_id":"tv","library_id":2,"file_id":"ff-1",
       "relative_path":"Movie.2019.1080p.mkv","media_type":"tv",
       "document":{"sources":{"parser":{"year":2019,"resolution":"1080p"}},
                   "ffprobe":{"format":{"duration":"5400.5"}},
                   "frame-grabber":{"thumbnail_path":"/thumbs/f-1.jpg"}},
       "schema_version":1,"status":"active","title_override":"",
       "display_name":"Фильм"},
      {"id":"f-2","module_id":"tv","library_id":2,"file_id":"ff-2",
       "relative_path":"Другой (1982).mkv","media_type":"tv",
       "document":{},"schema_version":1,"status":"active","title_override":"",
       "display_name":"Другой (1982).mkv"}
    ]}
""".trimIndent()

/**
 * The image library's served folder rows (folderDTO): top-level files report
 * path "", the depth-1 prefixes follow with their counts.
 */
fun foldersBody(): String = """
    {"folders":[{"path":"","items":12},{"path":"2026","items":9},{"path":"nature","items":30}]}
""".trimIndent()

/** serial + image — the photo body laws' fixtures (D6, wireframe 3.6). */
fun photoLibrariesBody(): String = """
    {"items":[
      {"id":1,"module_id":"serial","root_path":"/media/serial",
       "display_name":"Сериалы","description":"","streams_enabled":true},
      {"id":2,"module_id":"image","root_path":"/media/photos",
       "display_name":"Фото","description":"","streams_enabled":false}
    ]}
""".trimIndent()

/**
 * The image library's items: p-1 carries the capture date (RFC3339) and the
 * width/height facts; p-2 carries only a verbatim machine stamp and no
 * dimensions (the honest-absence rows the footer/aspect laws need).
 */
fun photoItemsBody(): String = """
    {"items":[
      {"id":"p-1","module_id":"image","library_id":2,"file_id":"pf-1",
       "relative_path":"2026/IMG_0001.jpg","media_type":"image",
       "document":{"sources":{"image-enricher":{"date_taken":"2026-05-01T10:20:30Z",
                                                "width":4000,"height":3000}}},
       "schema_version":1,"status":"active","title_override":"",
       "display_name":"IMG_0001"},
      {"id":"p-2","module_id":"image","library_id":2,"file_id":"pf-2",
       "relative_path":"2026/IMG_0002.jpg","media_type":"image",
       "document":{"sources":{"image-enricher":{"date_taken":"май 2026"}}},
       "schema_version":1,"status":"active","title_override":"",
       "display_name":"IMG_0002"}
    ]}
""".trimIndent()

/**
 * The serial body's served facet aggregates (internal/api/facets.go
 * facetsResponse — layout-parity 10.1's wire): counted values verbatim, the
 * closure's serving order untouched.
 */
fun facetsBody(): String = """
    {"facets":[
      {"key":"genre","values":[{"value":"Комедия","count":12},{"value":"Драма","count":7}]},
      {"key":"status","values":[{"value":"ongoing","count":3}]}
    ]}
""".trimIndent()

/** The first library's series grid: bare row + fully stamped row. */
fun seriesBody(): String = """
    {"items":[
      {"id":"s-1","module_id":"serial","library_id":1,"relative_path":"Saga",
       "document":{},"schema_version":4,"status":"active","title_override":"",
       "display_name":"Сага"},
      {"id":"s-2","module_id":"serial","library_id":1,"relative_path":"Chronicles",
       "document":{},"schema_version":4,"status":"active","title_override":"",
       "display_name":"Хроники","artwork":"/artwork/posters/s-2.jpg",
       "rec_score":7.5,"watched":true}
    ]}
""".trimIndent()

/** s-1's episodes: one bare row, one fully stamped row. */
fun episodesBody(): String = """
    {"items":[
      {"id":"e-1","module_id":"serial","library_id":1,"file_id":"f-1",
       "relative_path":"Saga/s01e01.mkv","media_type":"serial",
       "document":{},"schema_version":1,"status":"active","title_override":"",
       "display_name":"Серия 1"},
      {"id":"e-2","module_id":"serial","library_id":1,"file_id":"f-2",
       "relative_path":"Saga/s01e02.mkv","media_type":"serial",
       "document":{},"schema_version":1,"status":"active","title_override":"",
       "display_name":"Серия 2","artwork":"/artwork/thumbs/e-2.jpg","watched":true}
    ]}
""".trimIndent()

/** Refreshed episodes: e-1 has since been watched — the refresh law's proof. */
fun refreshedEpisodesBody(): String = """
    {"items":[
      {"id":"e-1","module_id":"serial","library_id":1,"file_id":"f-1",
       "relative_path":"Saga/s01e01.mkv","media_type":"serial",
       "document":{},"schema_version":1,"status":"active","title_override":"",
       "display_name":"Серия 1","watched":true},
      {"id":"e-2","module_id":"serial","library_id":1,"file_id":"f-2",
       "relative_path":"Saga/s01e02.mkv","media_type":"serial",
       "document":{},"schema_version":1,"status":"active","title_override":"",
       "display_name":"Серия 2","artwork":"/artwork/thumbs/e-2.jpg","watched":true}
    ]}
""".trimIndent()

/** The stored position (progressDTO — the ONE progress wire shape, INV4). */
fun progressBody(itemId: String, positionSeconds: Long): String = """
    {"item_id":"$itemId","position_seconds":$positionSeconds,
     "updated_at":"2026-11-12T12:00:00Z"}
""".trimIndent()
