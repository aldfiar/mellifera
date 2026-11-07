# library-facets Specification

## Purpose
Let viewers narrow large serial and film grids by genre, kind, and status
through server-computed chips whose values are exactly what the About panel
shows, with honest absence when a library carries no such facts.

## Requirements

### Requirement: Library facets endpoint

The API SHALL expose `GET /api/v1/libraries/{id}/facets` (browse group,
admin+client) returning `{"facets":[{"key":"genres"|"kind"|"status",
"values":[{value,count}…]}]}`. Facet values SHALL be the document facts
rendered verbatim (never transliterated, re-cased, or fabricated) with per-
value counts; they SHALL be computed at rebuild time by running the SAME
metadata resolver the About panel uses — never a divergent namespace walk. A
series whose winning namespace carries no genres SHALL contribute no genre
values (an earlier namespace carrying description but no genres MUST NOT be
mined for genres). A facet key with no carriers in the library SHALL be
absent from the response; a value counted zero SHALL be omitted. A photo
library SHALL return an empty facet list (honest absence). Facet serving
SHALL be visibility-conjunct to the calling viewer — a library outside the
caller's visible set serves like every other denied library-scoped view: no
counts, no keys, no existence leak.

#### Scenario: Facet values match the About panel

- **WHEN** a series' About panel shows genres from its winning namespace and
  its library's facets are fetched
- **THEN** every About-shown genre appears among the library's genre facet
  values, counted from the same resolver's output

#### Scenario: Description-only namespace contributes no genres

- **WHEN** a series' document carries an earlier namespace with a synopsis but
  no genres, and a later namespace carries genres
- **THEN** the facet counts read the genres from the namespace the About
  resolver resolves — never the first namespace that merely exists

#### Scenario: Photo library is honestly empty

- **WHEN** the facets of a photo library are fetched
- **THEN** the response is 200 with an empty facet list — no fabricated keys

#### Scenario: A library outside the viewer's visible set serves nothing

- **WHEN** a viewer without the grant on a media library fetches that
  library's facets
- **THEN** the response serves like every other denied library-scoped view —
  no counts, no keys, no leak of the library's facet existence

### Requirement: Facet filtering on collection listings

`GET /api/v1/series` SHALL accept additive `genre`, `kind`, and `status`
query params and `GET /api/v1/items` SHALL accept additive `genre` and
`kind` params (browse group) that narrow the listing to entities carrying
the given facet value — resolved server-side against the facet aggregates
with an in-Go filter over the library's rows, within the caller's visible
libraries. `/items` takes no facet-`status` param: the `status` param name
on `/items` is pinned to the enrichment-lifecycle filter by the living
specs (plugin-pipeline "Item status over the API"; async-enrichment's
"new statuses SHALL list via the unchanged `GET /api/v1/items?status=`
passthrough"). The params SHALL compose with the existing `library`, path,
and sort params. An unknown facet value SHALL yield 200 with an empty list,
never an error.

#### Scenario: Chips narrow the grid

- **WHEN** the operator activates the genre chip "Adventure" on a serial
  library grid
- **THEN** the listing returns only series carrying that genre value, and
  deactivating the chip restores the unfiltered served order

#### Scenario: Filters compose with existing params

- **WHEN** a listing request carries `genre=` together with the library scope
  and `sort=path`
- **THEN** the response is path-ordered and restricted to both the library and
  the genre value

#### Scenario: Unknown value is an empty success

- **WHEN** a filter names a value no entity carries
- **THEN** the response is 200 with an empty list — no error body
