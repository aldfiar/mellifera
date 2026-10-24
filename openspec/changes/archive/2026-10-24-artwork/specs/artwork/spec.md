# artwork Delta

## Purpose

Serves poster artwork for series and items through the binary: an art store acquires and caches source posters and operator uploads, read-time composition stamps a resolved `artwork` field onto served documents, the poster override family lets operators pin or reset artwork symmetric to titles, and known missing-art placeholders are skipped honestly — every library surface shows real art or falls through to absence, never a known placeholder.

## ADDED Requirements

### Requirement: Artwork composition precedence

Served series and item documents SHALL carry an additive `artwork` field — the proxy URL of the resolved artwork — and SHALL omit the field entirely when no artwork resolves (honest absence: never an empty URL, never a placeholder URL). Composition SHALL resolve, in order: the entity's stored artwork override, then the first non-placeholder poster URL walking the entity's gate-resolved metadata chain. The frame-grabber thumbnail leg stays client-side (the detail surface's existing hero fallback); composition covers exactly the two server-side legs. Composition SHALL be computed at read time and never persisted into documents, SHALL batch its override and materialization lookups for the page's ids, and SHALL be tolerant: a corrupt document floors to absent artwork, never a failed read. When the resolved poster's bytes are not yet materialized, the read SHALL still serve the resolved URL and acquisition SHALL proceed without blocking the read.

#### Scenario: Composition walks override, chain, then absence
- **WHEN** three series are served — one with a stored override, one whose gate-resolved chain carries a real poster, and one whose only chain poster is a known missing-art placeholder
- **THEN** the first document's `artwork` names the override's proxy URL, the second names the chain poster's proxy URL, and the third omits the `artwork` field entirely while still answering 200

#### Scenario: Composition never errors on a corrupt document
- **WHEN** a series document is corrupt or unparseable
- **THEN** the read still succeeds with the `artwork` field absent — composition floors to absence, never fails the read

### Requirement: Missing-art placeholder skip

The composition walk SHALL apply a missing-art predicate: a poster URL whose path carries a known missing-art asset prefix (for example `/assets/globals/missing`) SHALL be treated as absent — the walk continues to the next source, such a URL is never surfaced as `artwork`, never fetched upstream, and never offered as an override candidate. Existing rows that already carry placeholder URLs stay honest through this skip alone, with no data migration. The predicate SHALL be pinned by a committed golden fixture consumed by both the api walk-side test and the plugin write-side test, so either side changing its predicate without the other fails its suite.

#### Scenario: Placeholder row falls through to honest absence
- **WHEN** a series whose stored namespace poster is a known missing-art asset URL is served on the grid
- **THEN** the document carries no `artwork` field, the override candidates list offers no candidate for that namespace, and no upstream fetch for that URL is ever started

#### Scenario: The golden fixture pins both predicates
- **WHEN** the committed golden fixture's sample URLs (real observed missing-art assets plus boundary cases) are run through the api walk-side predicate and the plugin write-side predicate
- **THEN** both sides agree with the fixture's expected verdict for every sample, and altering one side's predicate without the other fails that side's test suite

### Requirement: Poster override family

Series and items SHALL carry a poster override family symmetric to titles: `GET …/posters` returns the effective current selection and one candidate per usable namespace poster plus `"user"` (when an upload exists) plus `"thumb"` (items only, when the document carries the frame-grabber fact, pointing at the existing media thumb variant), with the active selection marked `current`; `PUT …/poster` with `{selection}` pins the selection from the vocabulary `"src:<plugin_id>" | "user:art_<64hex>" | "thumb"`, answering 400 `bad_request` on an unknown selection; `POST …/poster` (multipart) uploads and pins an image; `DELETE …/poster` resets to the chain and is idempotent (204 every time). Staged candidates SHALL be offered with served proxy URLs; selecting any candidate SHALL start acquisition. A metadata refresh SHALL never rewrite the override, and a pinned namespace that later vanishes from the chain SHALL floor silently — composition serves the chain value while the override row is retained.

#### Scenario: Pin, observe, then reset idempotently
- **WHEN** the operator pins a namespace candidate with `PUT …/poster`, deletes it with `DELETE …/poster` twice
- **THEN** the pinned period composes the pinned source, the first DELETE resets composition to the chain value with 204, and the second DELETE also answers 204 with no error

#### Scenario: Pinned namespace vanishes
- **WHEN** an override pins `src:shikimori` and a later refresh leaves the chain without a shikimori poster
- **THEN** composition silently serves the next chain value (or omits `artwork`), the override row is retained, and the candidates list no longer offers that namespace

### Requirement: Fetch-once acquisition

Artwork bytes SHALL be acquired so that the first request or settle pass for a distinct URL causes exactly one upstream fetch: concurrent producers for the same URL SHALL collapse into that one fetch, total concurrent upstream fetches SHALL be bounded (≤ 2), each fetch SHALL time out (15 s) and SHALL read at most 8 MB, and every fetched byte SHALL pass the same image guard as uploads. Serving SHALL never contact upstream — a serve miss answers 404 without any fetch. There SHALL be no TTL: an entry serves until a fetch replaces it; the re-fetch trigger is the URL changing (new key → miss), inheriting freshness from document refresh. Failed URLs SHALL be skipped behind an in-process per-URL failure cooldown, and no negative fetch rows SHALL be recorded. A restart SHALL keep serving every materialized entry from disk.

#### Scenario: Grid race collapses to one upstream fetch
- **WHEN** two concurrent readers and the settle pass all reach an unmaterialized poster URL in the same window
- **THEN** the upstream receives exactly one request for that URL, and all three observe the same materialized entry afterwards

#### Scenario: Serve never fetches and restart keeps serving
- **WHEN** an entry's bytes are materialized, the process restarts, and a client requests the object
- **THEN** the request is served from disk with no upstream contact; a request for an unmaterialized object answers 404 with no upstream contact either

#### Scenario: Dead URL costs one attempt per cooldown window
- **WHEN** an upstream URL fails and the settle pass ticks repeatedly within the cooldown window
- **THEN** the URL is attempted at most once per window and no negative fetch row is stored

### Requirement: Upload ingest guard

Poster uploads SHALL pass one guard at the art store: the bytes SHALL sniff as JPEG, PNG, or WebP by magic number, SHALL be at most 8 MB, and SHALL really decode as an image — otherwise the route answers a canonical inline error and stores nothing. A valid upload SHALL be cropped once, center 2:3 without upscaling; the original SHALL be stored verbatim beside the always-JPEG cropped variant, the cropped variant SHALL be the referenced/served selection, and removing or replacing the upload SHALL delete the whole old pair. The API layer SHALL additionally cap the request body as transport hygiene, with the store re-checking the size.

#### Scenario: Wrong type or oversize stores nothing
- **WHEN** an upload arrives whose bytes are not an image, or larger than 8 MB
- **THEN** the route answers a canonical inline error, the overlay stays open, and no bytes, no fetch row, and no override change are stored

#### Scenario: Upload crop-once and replace deletes the pair
- **WHEN** the operator uploads a valid landscape JPEG, then uploads a replacement, then resets the override
- **THEN** the first upload stores original plus 2:3 JPEG crop and composes the crop, the replacement deletes the first pair entirely, and the reset deletes the second pair

### Requirement: Garbage collection on reference loss

The art task SHALL reclaim art on reference loss, never on time: the referenced set is the union of every stored override selection and every live document kind-field URL (series AND non-series items — films and TV included), deliberately conservative so gate flips and chain reorders never delete. An art entry whose source URL is in neither set SHALL be deleted together with its bytes directory; repair legs SHALL delete a row whose bytes file is missing and a bytes file with no row. The art task SHALL share ONE document walk for settle and GC, SHALL run at boot (the same settle pass, not a bulk path), SHALL yield to the process context, and SHALL be skippable by an environment knob that disables the art task only — setting it to 0 turns the task off without touching the other registry tasks.

#### Scenario: Re-enrichment replaces the poster and GC sweeps the orphan
- **WHEN** a series re-enriches from a poster URL to a different one, and then the art task runs
- **THEN** the old URL's row and bytes directory are reclaimed while the new entry survives

#### Scenario: Gate flip never deletes
- **WHEN** an operator disables the source namespace whose poster is materialized, then the art task runs
- **THEN** the entry survives — the document still carries the URL, so the reference union still holds it

#### Scenario: The knob disables the art task only
- **WHEN** the art-task environment knob is set to 0 and the registry ticks
- **THEN** the settle and GC work is skipped entirely while the streams task keeps ticking unchanged
