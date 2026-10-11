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
