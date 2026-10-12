<!-- wf: source_fingerprint=de21d6265900f78effd9acb71ac0e4297140ce6079ec47fa2a493306c093180b -->
# Tasks: unified-parser

Probe CWD is the project root. Probes are `go test` runs over the shared
package and the three binaries (plus registry/web greps for the label box).
Probe bodies live in the spec deltas (`specs/`); each box links its OWN
scenario probe — one scenario per box, never a shared id. Group dependencies
(DAG): 1 → 2 → 4; group 3 is independent (may run in parallel with 1–2).
Max concurrency 2: (1), then (2) and (3) together, then (4).

## 1. Shared package `pkg/releasename`

- [x] 1.1 Create `pkg/releasename`: move the role-keyed vocabulary (adding `720i` to the resolution table), the two-part bracket rule with its release masks, the season-marker set, and the series + episode grammars out of `plugins/serial-parser/` per design.md §Interfaces (`ParseName`, `ParseEpisodeName`, `EpisodeNumberOf`) — package grammar tables carry the existing rows verbatim plus the new canonical rows (the HEVC trailing-decoration bracket, the whole-token `720i` episode-skip and series-title strip, the tagged film degenerate case), brand-neutral [probe:499a5238610f2219]
- [x] 1.2 Structured emission: the `Result` fields per design.md D-2 (singular roles last-wins, lists in token order, Season 0 + `SeasonExplicit` honesty, below-1 episode absent) pinned by `TestEmissionFields` [probe:65f00f37dc65e786]

## 2. Serial and tv adapters

- [x] 2.1 serial-parser becomes the thin adapter: parse wrappers delegate to `pkg/releasename`; `releasetags.go`/`serialparse.go` grammar moves out; the plugin tables keep every row verbatim and gain the HEVC episode row and the `720i` rows; namespace keys, skip reasons, and the 1.0/0.6 confidence semantics unchanged [probe:a5362e81143f9a52]
- [x] 2.2 Namespace emission: serial-parser Match/Convert carry resolution, source, codec, language, and year beside the existing keys for series and episode documents (absent omitted), pinned by a new `TestNamespaceEmission` [probe:7646c4fa3a9bee99]
- [x] 2.3 tv-parser becomes the thin adapter: grammar moves to `pkg/releasename`, structured release fields join title/season/episode on the same apply rule, the release-group dash rule and 4-tier confidence stay adapter-local, existing rows verbatim [probe:ce462e11edef346d]
- [x] 2.4 serial-scanner: the replicated grammar copies in `sidecar.go` (resolutionRe with its `720[pi]` arm included) dissolve into `pkg/releasename` via `EpisodeNumberOf`; the mirrored trailing-decoration sidecar row joins `TestBareNamedEpisodeSidecar` [probe:ebe5aa0c28353849]

## 3. SPA labels (parallel-safe)

- [x] 3.1 `season_episode` composite: the web renderer gains the label-aware composite ("Season N · Episode M"; season part alone as "Season N"), the serial seed's serial-parser `display_fields` becomes `["display_title", "season_episode", "parsed_from"]`, seed and renderer tests updated — identity badges and the SxxEyy eyebrow untouched [probe:efa169055d999c81]

## 4. qa — the cross-binary contract

- [x] 4.1 Mirror the canonical shapes (trailing-decoration bracket, whole-token `720i`, tagged film) across the four packages' grammar tables so every binary gates the same corpus and a divergence fails locally [probe:ea1eb2c2f359f9a5]
- [x] 4.2 Serial joint e2e regression over the shared grammar — the preserved naming-shapes scenario runs ffprobe-gated over the real subprocess graph (stripped titles, always-present season, SxxExx episodes) [probe:16778b8ef0faece4]
