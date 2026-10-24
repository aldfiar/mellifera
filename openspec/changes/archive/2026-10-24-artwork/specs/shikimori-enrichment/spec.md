# shikimori-enrichment Delta

## ADDED Requirements

### Requirement: Missing-art placeholders dropped on write

On conversion, the plugin SHALL NOT write a namespace field when its URL is a known missing-art asset: `poster` (the namespace's poster) and cast `photo_url` (the character portrait) SHALL both be dropped when the URL's path carries a known missing-art asset prefix (prefix rule, not an exact-URL list). Dropping the field SHALL mean upstream-placeholder = upstream not providing the field — the honest-absence convention, strengthened on the write side. The predicate SHALL be pinned by the same committed golden fixture the core walk-side uses, so either side changing its predicate without the other fails its own suite.

#### Scenario: Placeholder poster is not written
- **WHEN** a raw shikimori payload carries a poster URL whose path is a known missing-art asset
- **THEN** the converted namespace carries no `poster` key at all — and a payload with a real poster URL still writes `poster` unchanged

#### Scenario: Placeholder cast portrait is not written
- **WHEN** a converted cast entry's `photo_url` points at a known missing-art asset path
- **THEN** the entry is written without `photo_url`, while cast entries with real portrait URLs keep theirs
