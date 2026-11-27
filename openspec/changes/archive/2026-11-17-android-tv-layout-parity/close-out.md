# Close-out — android-tv-layout-parity

Closed 2026-11-17. Branch `feature/android-tv-app` @ f034136 (pushed). Living spec:
`openspec/specs/android-tv-client/spec.md` (10 scenarios, created by the archive).
Operator archive approval recorded in review.md («Archive now», same day, in session).

## Final receipt summary (durable record — the machine home is deleted at close)

**55/55 green** at close: 54 authored tasks (groups 1–15) + the built-in git-check.
Every final receipt was journaled `--by wf-reviewer` — the GATE 2 re-runs became the
standing receipts (the register's last act before close was the reviewer's full
re-derivation after the mid-round home abandon, see below). 66 receipt rows total
across the pipeline's life; red rounds existed (15.3 round 1: missing
`@OptIn(ExperimentalFoundationApi)`; 15.6 round 1: a rewrite destroyed the duty's
literal anchor) and were fixed to green the same session.

Duty shapes: 46 tasks ran the gradle JVM suite (`testDebugUnitTest`, targeted
`--tests` filters; warm-cache durations 0.5–2.5 s), 15.5 ran structural greps
(XML canvas value + the single-`background(AppCanvas)`-paint law), 6.1's duty
grepped the WALK-RESULT evidence marker in `tasks/6.1.md` (6 ms — the walk evidence
was the task), git-check ran `git status --porcelain` + push-currency against the
worktree.

## What the change shipped

The Android TV client app itself (`android/`, Kotlin + Compose tv-material3), grown
through three amendment rounds, all walked on the box (192.168.0.215) via the
subagent walk law:

- **Groups 1–8.16** (12 Nov → 17 Nov): dark theme default, card anatomy tri-state,
  hero/synopsis, episode rows, module-keyed collection bodies, rail navigation,
  photo viewer, playback wiring, type scale (density-2.0 ink halving, 8.16).
- **Groups 9–14** (17 Nov, the wf-auditor amendment): Back exits preparing/dead,
  voiceover picker (keycode 222), facet lane + conjuncts, home error line, series
  facts, home card carriers, title clamps, watched corner mark, photo rulings +
  «i/n» status line, series actuator, cast rows, color tokens, rail restyle 360→112dp.
- **Group 15** (17 Nov evening, the operator live-rejection round): D1 grid-arrow
  actuator split (cursor keyed `(gridFocus, isRailOpen)`, entry claim keyed
  `(mountMarker, homeHoldsEntry)`), collection-body clean law (closeBody clears 12
  fields, body unmounts — «each collection enter should clean previous collection
  data»), body-top landing law (SWAP_RETRY_FRAMES bounded re-arm), body-epoch race
  guard (12 capture-before-await write sites + BodyEpochTest over a suspending fake),
  canvas #020617 via themes.xml (punch-through law preserved), rail row geometry
  (fillMaxWidth + one-line clamps), rail width **96dp/192px** (operator ruling;
  112dp was pixel-exact but rejected as a design parameter).

## Gates

- **GATE 1**: approved per round (initial proposal; amendment groups 9–14; group 15
  «Approve — apply all 7»).
- **GATE 2 round 1**: APPROVED-with-notes (review.md) — 46 numbered tasks re-derived
  green in the reviewer's shell (8.9–8.16 had walk-proven but zero pipeline receipts
  before it — the gate gave them their first), full suite 210 tests / 0 failures.
- **GATE 2 round 2 (group 15)**: APPROVED, 54/54 re-runs — after the home
  abandon/re-derive below. Human archive approval: granted 2026-11-17.

## Device proof (ledger #27 CLOSED + PROVEN ON-DEVICE)

0.3.14-audit2 (sha 449d7f53…) on the box; evidence `.tmp/android-tv-layout-parity/
walk15-0.3.14/` (23 pairs) + `walk15b-0.3.14/` (10 pairs + 2 salvage):

- D1 arrows land law-exact: RIGHT both body classes; DOWN proven on tiles 5 and 8;
  top-row UP lawful tile-0 jump; PV1 nonce re-land byte-identical.
- Clean law: bare home ≡ entry fingerprint 6×; the hybrid home+body shape ABSENT.
- Body-top landings 5/5 (header y=64 vs the failed class y=628) + the BACK
  discriminator.
- Canvas pixel-exact (2,6,23) at three probes, zero old-black pixels.
- Rail rows 158px uniform / 174px focused; border-box 192px with the #1E293B edge at
  x=190..191.

Walk lessons recorded in tasks/6.1.md: keycode-table trap again (walk15 mis-keyed
19=UP as DOWN; walk15b verified comments against the table), bare-home fingerprints
are CONTENT-PARAMETERIZED across sessions (record per-walk; byte-identity is
within-walk only), a11y rail-card heights noisy (width law exact).

## The pipeline-home abandon (recorded for the next operator of this register)

15.5's originally authored duty was UNGREENABLE: a double-escaped rg pattern
(`'background\\(AppCanvas\\)'` in single quotes passes two backslashes — matches
nothing, ever). The drift gate refused the duty fix (receipts on record), and no verb
amends receipts. The sanctioned repair used the tool's own exit: chore commit 7e898da
(tasks.md verify line only; law prose byte-identical) → `wf pipeline clean --abandon
--reason …` → tombstone read + home removed → `init` → `attach-worktree` → `register`
→ every receipt re-derived (46 tasks by the reviewer at GATE 2, group-15 tasks in
session). Receipt-loss degradation documented; greens were cheap on the warm cache.

## Residuals

Tracked in review.md §Residual queue: UX rulings #14/#17/#19/#20/#23/#24 and #28a/b
(top-row UP sideways jump; home-row DOWN native hop), unprobed walk legs (8.8 anchor,
12.1 ✓-pixels, 12.4 cast anatomy, physical-remote 222, #26 server display_name probe),
code follow-ups (stale 224px comment BrowseScreen.kt ~:883, toggleFacet JVM pin,
optional token consolidation). None gate the archive.
