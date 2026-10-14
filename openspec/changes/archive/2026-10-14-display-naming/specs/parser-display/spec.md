# parser-display Delta

## MODIFIED Requirements

### Requirement: Parser display-field declaration

Module config SHALL carry an ordered `display_fields` declaration per parser
binding (scanner and `metadata_source` alike), and each module SHALL carry
`identity_fields` — the mandatory fields that identify an element of that
type. The core SHALL NOT hardcode field names, provider names, or media-type
literals outside module seed config (AC-4). Seeds SHALL ship for the loaded
modules: `base-scanner` (container, duration, video, audio, size),
`tv-parser` (title, year, resolution, parsed_from),
`serial-parser` (title, season_episode, parsed_from), `frame-grabber`
(thumbnail, grabbed_at), `image-enricher` (date_taken, camera, dimensions,
gps) — where `camera` renders as make + model, `dimensions` as width×height,
`season_episode` renders as "Season N · Episode M" from the season and
episode facts (the season part alone as "Season N" when the episode fact is
absent), and `thumbnail`/`grabbed_at` resolve from the frame-grabber
namespace;
`identity_fields`: tv = title, year; serial = title, season,
episode; image = date_taken.

#### Scenario: The footer order is the parser's declared order

- **WHEN** a film's `sources["tv-parser"]` carries title, year, resolution, and parsed_from in any JSON key order
- **THEN** the element page footer renders that group's pairs exactly in the declared order title → year → resolution → parsed_from

<!-- wf:probe id=285e0cf7ae7d58d6 -->
```bash
set -e
grep -q "display_fields" internal/module/registry.go
grep -q "tv-parser" internal/module/registry.go
grep -q "resolution" internal/module/registry.go
go build ./...
```
<!-- /wf:probe -->

#### Scenario: Composite labels resolve from namespace facts

- **WHEN** an image document carries make, model, width, and height in `sources["image-enricher"]`
- **THEN** the footer's camera pair renders make + model joined and the dimensions pair renders width×height, values verbatim from the namespace

<!-- wf:probe id=c91674ddc94d4640 -->
```bash
set -e
test -f web/src/components/metadata/ParserFooter.tsx
grep -qE "make|model" web/src/components/metadata/ParserFooter.tsx
grep -qE "width|height" web/src/components/metadata/ParserFooter.tsx
```
<!-- /wf:probe -->

#### Scenario: Season and episode render as the human episode badge

- **WHEN** a serial episode document carries season 2 and episode 1 in `sources["serial-parser"]`, and a series document in the same collection carries only a season
- **THEN** the serial-parser footer group renders the `season_episode` pair as "Season 2 · Episode 1" on the episode and "Season 2" on the series, while the identity badges and the SxxEyy eyebrow render unchanged

<!-- wf:probe id=efa169055d999c81 -->
```bash
set -e
grep -q "season_episode" internal/module/registry.go
grep -q "season_episode" web/src/components/metadata/ParserFooter.tsx
go test ./internal/module -run TestSerialModuleSeed
```
<!-- /wf:probe -->
