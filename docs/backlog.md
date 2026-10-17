# Mellifera Backlog — future-work briefs

Not-implemented, design-validated work extracted from the shipped feature
records (folders removed 2026-10-06; full records preserved in git history and
`openspec/changes/archive/`; behavior lives in `openspec/specs/`).

**How to pick an item up:** run `/build <change-name>` with this brief as the
description. The openspec artifacts (proposal, spec deltas, tasks, design) are
authored at propose time and pass GATE 1 (human approval) before any code —
this file holds the outline, never a pre-created change.

## B3 — external TMDB enricher + AuthContext/secrets

The seeded `tmdb` slot in the `tv` module's metadata chain is SERVER-mode but
no plugin fills it: items settle `ready` with a recorded `unavailable` stage
each pass. B3 makes external enrichment real.

- **Real HTTP fetch** in a `metadata_source` plugin's `BuildRequest` →
  `Convert` (the tmdb plugin), filling the seeded `tmdb` SERVER slot
  (`internal/module/registry.go`).
- **Secrets at the handshake**: plugins declare `required_secrets`; the core
  injects an `AuthContext{SERVER}` into the chain Query (the `CLIENT` mode
  counterpart stays Mode-B — user-credential flows are a separate track).
- **Upstream discipline**: rate-limit handling, response caching, and soft-fail
  on upstream errors (an unreachable TMDB degrades exactly like a missing
  exiftool/ffprobe today — per-source soft-fail, never an aborted scan).
- **`_view` arbitration**: today `_view` is last-writer; multiple real sources
  (tv-parser + tmdb) need the arbitration rule.
- **Queue unchanged**: a SERVER source is queued per D-Q1 (`AuthMode !=
  "CLIENT"`); loading the plugin later re-derives `ready` items (namespace
  absent + not in cooldown) without regressing them.
- `kinopoisk` remains CLIENT-mode (excluded from the background queue).

## B3b — external image enrichers + RAW discovery + generated columns

From the image-enrichment outline (explicitly NOT built):

- **External image enrichers** (auth_mode + real fetch) — same
  AuthContext/secrets machinery as B3.
- **RAW discovery**: `.cr2 .nef .arw .dng` — a one-line extension-set add to
  the image map in `plugins/base-scanner/image.go` (exiftool reads RAW
  natively; it was held back only to keep the shipped set bounded).
- **Image generated columns** (e.g. project width/height for SQL filtering) —
  **blocked**: generated columns cannot be added idempotently under the current
  migration runner (`internal/store/open.go` runs each migration once); needs a
  migration-path design first.

## Phase C — post-action capability

From the plugin-pipeline outline (flagged, not built):

- **REQUIRES architecture design first** — no contract exists today. Closest
  analogs: the deferred `internal/janitor` and core L2 reconciliation
  (arch §3.2).
- Idea: plugins that act **after** an item settles (rename/organize files,
  write NFO sidecars, notify) — a third capability type beyond
  `scanner`/`metadata_source`.
- Enter via a design pass (an openspec change whose proposal carries a real
  design.md), not a direct build.

## Smaller deferred items

| Item | Origin | Note |
|---|---|---|
| Admin HTTP route over `store.ListFailures` | async-enrichment B1 | The method ships; the route doesn't. Inspect via sqlite3 (`operator-runbook.md` §5) meanwhile. |
| Recent-items widget on the admin dashboard | web-ui-phase-2 | Optional browse preview, deferred with user approval at GATE 1. |
| `RoleClient` minter (client roles, D18) | web-ui | `RoleClient` + the browse group (admin+client read-only) exist; no resolver mints client tokens yet. |
| Multi-instance lease coordination | async-enrichment B1 | Leases are in-memory; single-instance MVP. |
| `internal/stream` (range-request file serving), `internal/janitor` (cleanup cron) | architecture | Deferred packages — design lives in the authoritative `docs/architecture.md`. |

## serial-watch-flow follow-ups (GATE 2 flags, 2026-10-11)

| Item | Origin | Note |
|---|---|---|
| Legacy head-only pack path deletes published segments | packaged-playback | Whole-file-within-head-chunk branch publishes the final playlist while `Pack` removes tmp with the segments — files with duration ≤ HeadChunk can 404 on seek. Pre-existing (byte-identical at HEAD); the voiceover-rendition path already uses the rename shape. Unify `publishHeadOnly`. |
| Safari native-HLS voiceover select inert | web-ui / packaged-playback | Native HLS (no hls.js lane) enables the select but cannot switch `audioTrack`; the spec's hls/direct dichotomy names no third state. Disable-with-reason or spec the native lane. |
| Rendition builds map only the first embedded audio track | packaged-playback | `-map 0:a:0` where the legacy build maps `0:a` — latent for multi-embedded-audio files WITH voiceovers; consistent with the spec's singular "the embedded audio". |
| Library-root derivation duplicated api/enrich | serial-watch-flow | `TrimSuffix(absolute_path, relative_path)` + Join lives in both `api sidecarMediaPath` and `enrich documentVoiceoverPaths`; needs a cross-package seam to dedup. |

## serial follow-ups (GATE 2 flags, 2026-10-12)

| Item | Origin | Note |
|---|---|---|
| Cross-binary release-tag vocabulary sync | serial / serial-followups | **CLOSED 2026-10-12 by unified-parser**: the serial-scanner's replicated grammar dissolved into `pkg/releasename` (one role-keyed vocabulary + reducer); `720i` is decoration in the shared table, pinned both ways (episode-less + film-as-resolution) in film-name-parsing. |
| `doc.go` for plugins/serial-parser, plugins/frame-grabber | serial GATE 1/GATE 2 | All sibling plugins carry one; these two don't. Convention drift noted at serial's gates, deliberately out of scope there. |
| tv-parser title edges around the shared Result | unified-parser GATE 2 (2 FLAGs) | Both adapter-local (~10 lines), title/group-field cosmetic only (season/episode/apply/confidence correct; pinned as characterization tests in `TestMatchAdversarialEdges`). (a) Dash forms: `Show.S01E01-E02.mkv` → title "Show -E" (shared episodeTitle cuts trailing "02" but not the dash-letter prefix); `Show-S01E02.mkv` fabricates release_group "S01E02" (group window now end-anchored over the whole stem) — restore the post-token window + cut "-E" residue. (b) Token-only stems: `Show/S01E01.mkv` → title "S01E01" instead of "Show" (the shared token-echo fallback pre-empts the parentDir fallback at tvparse.go; flat layouts are common) — treat the token echo as titleless and restore parent-dir. |
| serial-parser/releasetags.go pointer comment + stale parser.go:45 doc comment | unified-parser GATE 2 (P3) | releasetags.go is now a 12-line seam-marker comment (delete on the plugin's next touch); parser.go:45 says "applies iff SxxExx token" — stale since serial-followups widened the rule. Unused `tc.backing` field in pkg/releasename/parse_test.go. All non-blocking. |

## film-name-parsing follow-ups (GATE 2 notes, 2026-10-12)

| Item | Origin | Note |
|---|---|---|
| Split pkg/releasename title pipeline into its own file | film-name-parsing GATE 2 (N2) | parse.go hit 450 lines (500 hard limit, 400 target) after the dash-form rule + grammar gate; the next grammar addition should move the title pipeline out. Related N1 (no action): lastConsumedSpanEnd re-scans all tag patterns per parse — micro-inefficiency only. |
| Pin the ≥2-letter all-caps-acronym floor | film-name-parsing GATE 2 (N3) | `isAllCapsAcronym`'s ≥2 floor is load-bearing (keeps `X-Files`-shaped titles whole on the dash-form rule) but pinned by no explicit row — a `Some.Movie.1080p.X-Files.mkv` keeps-whole row in `TestFilmNameParse` would pin it. Code comment documents the rationale; purely a test suggestion. |

## Enrichment restart sweep is vacuous on fresh boot (found in the wild, 2026-10-12)

User report: after the serial-parser upgrade + `make dev` restart, ZERO of 149
library-2 items re-enriched — every page still showed the previous day's
old-grammar data (`Black_Clover_II_[01].mkv` carried a `serial-parser` stage
`skipped` from before the grammar existed; no `sources["serial-parser"]`).

- **Root cause**: `internal/enrich/queue.go` — `Queue.Start` derives only
  `knownLibs()`, the in-memory registry populated exclusively by scan-time
  `Notify`. A fresh process boots with an empty registry, so the boot sweep is
  a no-op, and idempotent dev seeding (libraries already exist → no re-scan)
  never fires Notify. Spec violation: async-enrichment
  `spec.md` req "On every `Start`, the pool SHALL re-derive pending work" +
  scenario "Restart re-derives pending, skips cooling pairs" — the shipped
  probes never caught it because every probe environment scans around boot.
- **Fix direction**: at `Start`, populate known libs from the store
  (`ListLibraries`) — or derive all libraries when the in-memory registry is
  empty. Small /fix change, spec-scenario-backed.
- **Interim operator remedy**: `POST /api/v1/libraries/{id}/scan` (any re-scan
  fires Notify; derivation is predicate-driven — namespace-absent pairs
  re-enrich regardless of file churn).

## Unified release-name parser (user direction, 2026-10-12)

One shared parser — base/core level, NOT inside any resource plugin (D-7:
resource plugins stay separate git projects) — that walks a filename (and the
series dir) start-to-end extracting the common elements: **title, season,
episode, quality/resolution, source, codec, language**.

- The role-keyed vocabulary (`plugins/serial-parser/releasetags.go`, serial
  D-7) is the seed: today it only STRIPS tags to clean titles; the unified
  parser also EMITS them as structured fields.
- `serial-parser` and `tv-parser` become thin adapters over it (a film name is
  the degenerate no-season case); the serial-scanner's own `resolutionRe` copy
  dissolves into it (closes the cross-binary sync row above).
- SPA labels ride on the parsed structure: season/episode presented as
  "Season N · Episode M" (item subtitle / human-labeled parser footer) instead
  of raw parser keys.
- /build-ready — enters via a proposal (the arbitration rule for _view when a
  film source and the parser both write title needs a design decision).

## Enrich queue: terminal treatment for contractually namespace-less plugin×row shapes (exposed 2026-10-14)

The derivation predicate has no notion of row shape: `pendingSources`
(`internal/enrich/queue.go`) queues any queueable source whose namespace is
absent and not in ledger-cooldown. Plugins that contractually never write a
namespace for a row shape — frame-grabber on series rows, shikimori on episode
items (both decline client-side) — end every derive pass `skipped`;
`applyOutcome` writes NO ledger row for skips, so no cooldown ever blocks
re-derivation, and `appendStage` appends a truthful `skipped` entry each pass:
`_stages` grows unboundedly on every queue pass for those rows. Invisible
pre-rescan-preservation (rescans rebuilt documents); exposed by
preserve-enrichment-rescan's joint QA. Same family as the seeded tmdb slot's
per-pass `unavailable` stage (B3).

- **Fix surface** (design decision at propose time): plugin-declared row
  shapes at the handshake; a terminal-skip ledger row with cooldown; or
  `_stages` append dedupe (bounds growth, leaves phantom dispatch). The
  preserve-enrichment-rescan end-to-end scenario compares `_stages` modulo
  these entries (user-approved amendment 2026-10-14) — this change removes
  that exemption.
- **Pairs with** the R-lane lifecycle designs (auto drift re-enrich, deletion
  grace, fair-rotation queue), which rework the same predicate — consider
  folding to avoid a second predicate pass.
