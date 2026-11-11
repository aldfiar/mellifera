package tv.mellifera.browse.fixtures

/**
 * MockWebServer bodies mirroring the LIVE browse handlers' wire shapes
 * (internal/api/handlers.go — display_name always on the wire; artwork/
 * watched omitempty honest absence). The 7.1 wire joints own the
 * full-shape fixtures; these carry the fields 5.6 consumes.
 */

/** One serial library, one non-browse module the filter must drop. */
fun librariesBody(): String = """
    {"items":[
      {"id":1,"module_id":"serial","root_path":"/media/serial",
       "display_name":"Сериалы","description":"","streams_enabled":true},
      {"id":2,"module_id":"movie","root_path":"/media/movie",
       "display_name":"Фильмы","description":"","streams_enabled":false}
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
