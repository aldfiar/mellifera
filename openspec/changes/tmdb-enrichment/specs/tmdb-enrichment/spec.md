# Spec Delta

## Purpose

Adds TMDB (themoviedb.org) as a SERVER-authenticated metadata source for films and
serials: a `tmdb` plugin implements the MetadataSource chain over the core-executed
fetch with a store-backed api key (secrets resolved core-side, never shipped to the
plugin), the serial module seed gains the tmdb binding at priority 4, and anchored
series runs contribute per-episode titles and overviews through the existing
episode-title routing.

## ADDED Requirements

### Requirement: Document-shape match dispatch

The `tmdb` plugin SHALL decide applicability from the parsed document shape alone
(no media-type literal inside the plugin's decision): a document whose identifiers
carry `tmdb_id` SHALL re-match anchored on that id with confidence 1.0; a
film-parsed document (a title with no season and no episode keys) SHALL apply via a
movie search on the title and parsed year; a series document (a title with a season
and no episode key) SHALL apply via a tv search on the title (season carried for
disambiguation); an episode document (season + episode keys) SHALL NOT apply. A
non-applying document SHALL be a skipped stage, never an error.

#### Scenario: A film document applies via the movie search

- **WHEN** Match receives a film-parsed document carrying a title and year, with no season or episode keys and no stored tmdb identifier
- **THEN** the result applies with a movie-search query built from the title and year, and it does not use the tv search path

#### Scenario: A series document applies via the tv search

- **WHEN** Match receives a series document carrying a title and a season, with no episode key and no stored tmdb identifier
- **THEN** the result applies with a tv-search query built from the title, carrying the season for disambiguation

#### Scenario: Episode documents never match

- **WHEN** Match receives a document carrying both season and episode keys
- **THEN** the result does not apply and no query is built

#### Scenario: A stored tmdb id anchors the re-match

- **WHEN** Match receives a document whose identifiers carry `tmdb_id: 12345`
- **THEN** the plugin applies anchored on that id with confidence 1.0, and the result reason records the anchor

### Requirement: SERVER API request contract

The `tmdb` plugin SHALL declare `required_secrets: ["api_key"]` in its handshake
capability declaration, and every request spec it builds SHALL carry the api key
only as a `redacted_ref` variable scoped `server:api_key` — the core resolves it
from the store-backed binding config before execution, and the secret value never
enters the plugin process. Every spec SHALL carry `language=ru-RU` (RU-first) and a
light `min_interval_ms` (250). A movie search SHALL build
`GET /3/search/movie?query={title}&year={year}`; a tv search SHALL build
`GET /3/search/tv?query={title}`; an anchored film match SHALL build
`GET /3/movie/{tmdb_id}` with the credits fetch as an extra request; an anchored
series match SHALL build `GET /3/tv/{tmdb_id}` with the season fetch
`GET /3/tv/{tmdb_id}/season/{n}` as an extra request after it. Templates SHALL use
`{placeholder}` substitution only. The interactive search (SearchSpecs) SHALL build
the same search request as a single-fetch plan declaring no extras.

#### Scenario: Every spec carries the server-scoped secret ref, RU-first language, and pacing

- **WHEN** BuildRequest (or SearchSpecs) produces any tmdb request spec
- **THEN** the spec's api key rides solely as a `redacted_ref` variable scoped `server:api_key` (never a literal value), the request carries `language=ru-RU`, and `min_interval_ms` is 250

#### Scenario: An anchored film plan carries the credits extra

- **WHEN** BuildRequest runs for an id-anchored film match and, separately, for a movie title search
- **THEN** the anchored plan carries the movie-detail primary plus the credits fetch as an extra spec while the search plan carries the primary only

#### Scenario: An anchored series plan carries the season extra

- **WHEN** BuildRequest runs for an id-anchored series match whose query carries season n
- **THEN** the plan carries the tv-detail primary plus the season fetch for season n as an extra spec after it

#### Scenario: Search specs stay single-fetch

- **WHEN** SearchSpecs shapes the interactive search for the movie and, separately, the tv kind
- **THEN** each result carries one spec targeting the matching search endpoint with no extra specs

### Requirement: RU-first conversion namespace

The `tmdb` plugin SHALL convert a raw payload into a RU-first namespace under
`sources.tmdb` carrying: `title` (`russian`; `romaji` the original title),
`description`, `genres` (array), `score`, `kind`, `status`, `episodes`, `aired_on`,
`poster` (the relative poster path composed to an absolute image.tmdb.org URL
plugin-side), and `url`; it SHALL report `resolved_ids: {tmdb_id}` on the selected
candidate and carry `plugin_version` + `source_url` provenance hints (the core
stamps provenance authoritatively). Candidate selection SHALL prefer the candidate
agreeing with the parsed year and the movie/series kind; missing signals SHALL
degrade the selection instead of erroring. A field the upstream does not provide
SHALL be absent from the namespace — never an empty string, zero, or placeholder.

#### Scenario: Convert maps the tmdb payload into the RU-first namespace

- **WHEN** Convert receives a raw tmdb payload and the query it answered
- **THEN** the result's metadata carries the RU-first namespace fields listed above with the poster composed to an absolute URL, `resolved_ids` names `tmdb_id`, and the provenance hints carry `plugin_version` and `source_url`

#### Scenario: Candidate selection prefers year and kind agreement

- **WHEN** the search payload holds several candidates for one query
- **THEN** the selected candidate is the one agreeing with the parsed year and the movie/series kind, and a payload with no agreeing candidate still yields a deterministic, non-erroring selection

#### Scenario: Honest absence on missing upstream fields

- **WHEN** a raw payload lacks overview, genres, poster, or release date
- **THEN** the converted namespace omits each missing field entirely rather than writing an empty or placeholder value

### Requirement: Cast from the credits payload

On an anchored film run the `tmdb` plugin SHALL convert the credits payload into a
`cast` array in sources.tmdb per the media-data convention: one entry per cast
member — `name` the actor, `role` the character, `photo_url` the profile path
composed to an absolute URL. A credits payload with no usable entries, or one that
never arrived, SHALL leave `cast` absent from the namespace. Search (unanchored)
runs SHALL stay single-fetch namespaces without cast — cast appears when the run is
id-anchored (a stored tmdb_id from a prior run or an identify override).

#### Scenario: Credits convert into cast entries and absence stays honest

- **WHEN** Convert receives an anchored payload whose credits carry cast members and, separately, an anchored payload with no credits body
- **THEN** the first namespace gains the cast array in the convention shape (actor in `name`, character in `role`, absolute portrait URL in `photo_url`) and the second gains no cast field

#### Scenario: Search runs stay without cast

- **WHEN** Convert receives a search-list payload (no anchoring id)
- **THEN** the namespace carries no cast field

### Requirement: Episode titles from the season endpoint (ru-first, anchored series runs)

On an anchored series run the `tmdb` plugin SHALL convert the season payload into
per-episode contributions keyed by the source's episode number, each contributing
the convention episode fields: `title` (the episode name) AND `description` (the
episode overview). An unfetched extra, an unparsable payload, or an entry with no
usable name SHALL contribute nothing (honest absence — never an empty entry, never
a placeholder). Search runs SHALL stay single-fetch plans that declare no season
extra and carry no contributions. Match on episode documents remains
not-applicable: titles reach episode documents only through the core's routing of
the series run (the routing itself is unchanged by this capability).

#### Scenario: Season entries convert into title and overview contributions

- **WHEN** Convert receives an anchored series payload whose season extra carries named episodes with overviews
- **THEN** the result carries one contribution per usable entry keyed by the entry's episode number, each with the episode name as `title` and the overview as `description`

#### Scenario: Absence stays honest

- **WHEN** Convert receives an anchored series payload with no season body, an unparsable one, or entries without usable names
- **THEN** the result carries no contributions for those entries at all

#### Scenario: Search runs carry no contributions

- **WHEN** Convert receives a search-list payload (no anchoring id)
- **THEN** the result carries no per-episode contributions

### Requirement: Serial module seed v4

The core SHALL promote the serial module config to `schema_version` 4 by a
guarded, idempotent `UPDATE … WHERE id='serial' AND schema_version < 4` run after
the `INSERT OR IGNORE` seed, adding the `tmdb` metadata-source binding (capability
`default`, priority 4, enabled, `auth_mode: "SERVER"`) after shikimori (3). The
promotion SHALL touch no other module row, and the tv module's seeded tmdb binding
(priority 3) SHALL remain unchanged.

#### Scenario: Fresh install seeds the v4 serial chain with tmdb

- **WHEN** a fresh store opens and the serial module's config is resolved
- **THEN** the config binds the ordered metadata chain serial-parser, frame-grabber, shikimori, tmdb at priorities 1–4 with tmdb enabled and carrying `auth_mode` SERVER

#### Scenario: A v3 serial row upgrades to v4 idempotently

- **WHEN** the registry opens against a store pre-seeded with the v3 serial module row, and then opens again
- **THEN** the first open rewrites the row to the v4 config with `schema_version` 4, the second open changes nothing further, and no other module row is touched
