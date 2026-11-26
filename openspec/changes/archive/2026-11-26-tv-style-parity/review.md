# GATE 2 record — tv-style-parity

**Approved: 2026-11-26** (operator, session) · branch `feature/tv-style-parity` @ `a5c2a78` (pushed)

## Reviewer verdict

GATE 2 ran as **Pending Fixes** — all three findings closed before approval:

1. **21.1 title-bar spec over-description** — ADOPTED the reviewer's amendment: the
   player title bar renders the TWO-LEG identity line («SxxEyy · episode title»;
   a film floors to the served display name). The SPA parity source
   (web/src/components/watch/InfoColumn.tsx + test) renders two legs; the served
   PlayerInfoBlocks carry no series-name leg and the served-names law forbids
   inventing one. Spec requirement + scenario amended; ruling in integration §6.
2. **18.2 / overscan scenario** — ADOPTED the exclusion ruling: a centered modal
   dialog's internal padding is not a page-edge inset; the settings overlay
   leaves the overscan enumeration, which carries the exclusion clause.
3. **Delivery-vocabulary comments** — reworded comments-only across 27 files
   (~62 lines); 0 vocabulary lines remain on diff-introduced code (verified
   against the remediation commit's added lines); pre-existing legacy lines
   untouched per scope.

## Gate evidence

- Verify re-runs: **21/21 rc 0** in the reviewer's shell (receipts rewritten,
  cmd-match intact). Pipeline status rc 0, 21/21 green, 51 receipts.
- Full-suite anchors: Android JVM **305 tests / 52 classes / 0 failures / 0
  errors / 0 skipped**; `go test ./...` **rc 0, 29 packages**; web suite skipped
  — zero SPA delta (`git diff 3bc5a7c..HEAD -- web/` empty), disclosed.
- Spec-vs-diff grounded requirement-by-requirement (planner math hand-recomputed
  against the scenarios; both landing amendments — peek identity, season-chip
  served-conditional — verified in the delta).
- @audit tasks 16.2/16.3/17.2/20.1: PASS (canaries, privatization, season
  ruling, one-request-two-painters).
- Integration re-ground: HOLDS — 19 edge groups evidenced live; waivers honored
  (chipsRowConsumesUp under Q9); SettingsOverlay + controlsTitle wired.
- Standards: zero backward-compat shims; all four fixed-3 aliases retired;
  FocusTarget rename residue-free.

## Residual seeds (none gate-blocking)

- Retire `rowCardTrack` (browse/LayoutParity.kt) + its LayoutParityTest cell —
  production-dead post-17.5, disclosed.
- Delete the 8 private `TYPE_*` vals (TypeScale.kt) + fix their KDoc's
  "the table's base column" claim (TYPE_TABLE in UiScale.kt is the table).
- Stale crop docs: ItemCards.kt :136, browse/LayoutParity.kt :39 (post-20.1
  fit-over-blur made "Crop fills" false).
- `chipsRowConsumesUp` + its 6 FocusLawTest pins: production-orphaned under the
  Q9 waiver — candidate for a retirement sweep once the freeze lifts.
- Photo grid reads the poster-columns pref as its override (inert at the pinned
  viewports under the caption clamp) — intentional, disclosed.
- `HomeFlow.load()` refactored onto the shared `replaceWith()` helper — accepted
  (observable behavior preserved; all pins green through the refactor).
- BrowseFlow's +20 lines (rail clamp, episode seed) — justified state-carrier
  ripple (the surveyor's "relocations, not orphans" class).
- Follow-up (zero-delta, seeded at 17.2): read-time `season` on seriesDTO
  mirroring the SPA derivation + one-line DisplayCard passthrough → the
  «Season N» chip lights up as the compact caption's sibling.
- EPISODE chrome reserve (100dp) is optimistic vs the reworked hero (~150dp
  with breadcrumb) — the lazy grid absorbs it; re-measure on the device walk.
- Крупный regains the two-row tier at 720/1080 viewports — the 22.2 walk
  measures at 540dp only.

## Approval line

Operator approved archive + redeploy in session, 2026-11-26. On-device walk
session follows the redeploy (per the layout-parity precedent).
