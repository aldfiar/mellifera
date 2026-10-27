## MODIFIED Requirements

### Requirement: Artwork composition precedence

Served series and item documents SHALL carry an additive `artwork` field — the proxy URL of the resolved artwork — and SHALL omit the field entirely when no artwork resolves (honest absence: never an empty URL, never a placeholder URL). Composition SHALL resolve, in order: the entity's stored artwork override, then the first non-placeholder poster URL walking the entity's gate-resolved metadata chain, then — items only — the owning series' first non-placeholder chain poster, the series resolved by the same backing rules the store's series-to-episodes derivation uses (exact relative path for file-backed series, directory prefix for directory-backed series), so an episode without its own artwork inherits its series' poster; a series without resolvable artwork leaves the item's field absent. The frame-grabber thumbnail leg stays client-side (the detail surface's existing hero fallback); composition covers exactly the two server-side legs. Composition SHALL be computed at read time and never persisted into documents, SHALL batch its override and materialization lookups for the page's ids, and SHALL be tolerant: a corrupt document floors to absent artwork, never a failed read. When the resolved poster's bytes are not yet materialized, the read SHALL still serve the resolved URL and acquisition SHALL proceed without blocking the read.

#### Scenario: Composition walks override, chain, then absence
- **WHEN** three series are served — one with a stored override, one whose gate-resolved chain carries a real poster, and one whose only chain poster is a known missing-art placeholder
- **THEN** the first document's `artwork` names the override's proxy URL, the second names the chain poster's proxy URL, and the third omits the `artwork` field entirely while still answering 200

#### Scenario: Composition never errors on a corrupt document
- **WHEN** a series document is corrupt or unparseable
- **THEN** the read still succeeds with the `artwork` field absent — composition floors to absence, never fails the read

#### Scenario: Item inherits the series poster
- **WHEN** an item resolves no override and carries no usable namespace poster, while its owning series' chain carries a real poster
- **THEN** the item's served `artwork` names the series poster's URL (the proxy URL when staged), and items that resolve their own artwork are unaffected

#### Scenario: Series without art leaves the item absent
- **WHEN** an item resolves no own artwork and its owning series also carries no usable poster
- **THEN** the item's served document omits the `artwork` field entirely

### Requirement: Missing-art placeholder skip

The composition walk SHALL apply a missing-art predicate: a poster URL whose path carries a known missing-art asset prefix (for example `/assets/globals/missing`) SHALL be treated as absent — the walk continues to the next source, such a URL is never surfaced as `artwork`, never fetched upstream, and never offered as an override candidate. The settle pass SHALL additionally repair stored state: a stored document whose `sources.<ns>.poster` key parses to the missing-art prefix SHALL have that key stripped and the document written back — the write-side rule applied to pre-drop rows — keyed on the same path-prefix rule so a real poster URL is never stripped, leaving documents without placeholder poster keys byte-identical and a corrupt document untouched. The predicate SHALL be pinned by a committed golden fixture consumed by both the api walk-side test and the plugin write-side test, so either side changing its predicate without the other fails its suite; the settle repair SHALL be pinned by its own committed golden fixture of legacy-placeholder → repaired roundtrips.

#### Scenario: Placeholder row falls through to honest absence
- **WHEN** a series whose stored namespace poster is a known missing-art asset URL is served on the grid
- **THEN** the document carries no `artwork` field, the override candidates list offers no candidate for that namespace, and no upstream fetch for that URL is ever started

#### Scenario: The golden fixture pins both predicates
- **WHEN** the committed golden fixture's sample URLs (real observed missing-art assets plus boundary cases) are run through the api walk-side predicate and the plugin write-side predicate
- **THEN** both sides agree with the fixture's expected verdict for every sample, and altering one side's predicate without the other fails that side's test suite

#### Scenario: Settle repairs a legacy placeholder key
- **WHEN** the settle pass runs over a stored document enriched before the write-side drop whose namespace poster key carries the missing-art prefix
- **THEN** that key is stripped and the document written back, no upstream fetch for the placeholder is ever started, and the strip is a pure key removal — every other field survives the roundtrip

#### Scenario: A real URL is never stripped
- **WHEN** the settle pass runs over a stored document whose poster keys are real URLs — including any URL that merely contains similar substrings outside the missing-art path prefix
- **THEN** the settle pass leaves the document byte-identical

### Requirement: Poster override family

Series and items SHALL carry a poster override family symmetric to titles: `GET …/posters` returns the effective current selection and one candidate per usable namespace poster plus `"user"` (when an upload exists) plus `"thumb"` (items only, when the document carries the frame-grabber fact, pointing at the existing media thumb variant), with the active selection marked `current`; `PUT …/poster` with `{selection}` pins the selection from the vocabulary `"src:<plugin_id>" | "user:art_<64hex>" | "thumb"`, answering 400 `bad_request` on an unknown selection; `POST …/poster` (multipart) uploads and pins an image; `DELETE …/poster` resets to the chain and is idempotent (204 every time). Staged candidates SHALL be offered with served proxy URLs; selecting any candidate SHALL start acquisition. The envelope SHALL carry an additive `reason` field set to `no_upstream_art` when the document carries at least one namespace poster key and every such key is a placeholder — the upstream has no art — distinguishing that state from a chain that never produced a poster key; the field SHALL be omitted in every other case, and the SPA SHALL drive any presentation of the state from the served field alone. A metadata refresh SHALL never rewrite the override, and a pinned namespace that later vanishes from the chain SHALL floor silently — composition serves the chain value while the override row is retained.

#### Scenario: Pin, observe, then reset idempotently
- **WHEN** the operator pins a namespace candidate with `PUT …/poster`, deletes it with `DELETE …/poster` twice
- **THEN** the pinned period composes the pinned source, the first DELETE resets composition to the chain value with 204, and the second DELETE also answers 204 with no error

#### Scenario: Pinned namespace vanishes
- **WHEN** an override pins `src:shikimori` and a later refresh leaves the chain without a shikimori poster
- **THEN** composition silently serves the next chain value (or omits `artwork`), the override row is retained, and the candidates list no longer offers that namespace

#### Scenario: Placeholder-only series serves the reason
- **WHEN** `GET /api/v1/series/{id}/posters` answers for a series whose stored namespace poster keys all parse to the missing-art prefix
- **THEN** the envelope carries `"reason":"no_upstream_art"` with the empty candidates list, while the same request for a series whose chain never produced a poster key omits `reason`
