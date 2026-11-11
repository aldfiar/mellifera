# Proposal

## Why

The tombstone sweep (`sweepSeries`/`sweepItems`) runs only as a scan-tail side
effect, and the only scan trigger today is the manual
`POST /libraries/{id}/scan` — so a library whose files change on disk (the
motivating incident, prod alatoic 2026-11-11: two episodes re-downloaded
byte-identical under renamed variants) keeps its dead item rows alive in the
catalog until the operator remembers to scan by hand. Rescan should trigger on
watched-folder changes without additional REST requests.

## What Changes

- New per-library filesystem watcher over every library root: recursive
  directory watching plus a debounce quiet window; a quiet window after the
  last filesystem event triggers a scan of that library through the EXISTING
  `scan.Run` path (no new scan entry point).
- A periodic reconciliation walk as the safety net: every watched library is
  re-scanned at a fixed cadence regardless of events, so a missed event still
  converges the catalog within one interval.
- Per-library scan single-flight shared with the manual scan endpoint: at most
  one scan per library at a time; a trigger arriving while a scan runs joins it
  instead of starting a second concurrent scan. The manual endpoint keeps its
  contract for a single caller (200 + the scan result); concurrent triggers now
  coalesce into the one run that executed.
- Two operator env knobs in the runbook convention (unset/malformed → default +
  warning, startup never aborts): `MELLIFERA_WATCH_INTERVAL` (reconcile
  cadence, default `1h`; a value ≤ 0 disables the watcher alone — the janitor
  off-position law) and `MELLIFERA_WATCH_DEBOUNCE` (quiet window, default `30s`,
  floored at 1s). The watcher is enabled by default; disabled restores exactly
  today's manual-only behavior.
- New Go runtime dependency `github.com/fsnotify/fsnotify` (first since
  artwork's `x/sync`/`x/image` streak-break): media mounts on the deployment
  host are LOCAL ext4, so host-side writes fire inotify events; fsnotify is the
  de-facto pure-Go, CGO-free notification layer over inotify/kqueue — it fits
  the single-static-binary posture (no CGO), and a polling-only design would
  fail the change's responsiveness intent (the incident is about timely
  detection, not hourly sweeps).
- No new REST surface; no store schema change; `internal/scan`, `internal/api`,
  `internal/store`, and the proto tree are untouched.

## Capabilities

### New Capabilities
- `watch-scan`: automatic rescan of watched library folders — filesystem-change
  triggering with a debounce quiet window, the periodic reconciliation walk,
  the per-library single-flight across manual and automatic triggers, the
  watch set following library CRUD, and the watcher lifecycle/operator knobs.

### Modified Capabilities
<!-- none — every existing requirement holds verbatim; the single-flight adds a
     constraint on concurrent triggers that no existing requirement covers, so
     it is ADDED under the new capability (additive concerns use ADDED, not
     MODIFIED). -->

## Impact

- `internal/watch/` (NEW package — a pure leaf in the `browse`/`recs` pattern:
  imports nothing from mellifera; store/scan access arrives as cmd-built
  `Deps` closures): the trigger engine + fsnotify adapter.
- `cmd/mellifera/` (MODIFIED wiring): NEW `scanflight.go` (the per-library
  single-flight); `main.go` gains the two knob resolvers, the watcher
  construction/launch beside the janitor registry, and RE-ROUTES the existing
  `api.Deps.Scan` closure (main.go:403) through the same single-flight — the
  manual endpoint's handler (`internal/api/handlers.go` `scanLibrary`) is
  untouched and stays pure delegation.
- `go.mod`/`go.sum`/`NOTICE`: the fsnotify require line + attribution.
- `docs/operator-runbook.md`: §2 knob rows.
- Blast radius on the scan path itself: none — `scan.Run` keeps exactly one
  production caller (the cmd closure); the watcher invokes that same closure.
