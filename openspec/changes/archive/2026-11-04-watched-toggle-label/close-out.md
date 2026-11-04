# Close-out — watched-toggle-label (archived 2026-11-04)

The durable record: pipeline home `.tmp/watched-toggle-label/` was deleted at
`wf pipeline clean`; this file carries the final per-task summary. Spec delta
merged into the living web-ui spec ("Watched element states" toggle paragraph
amended — top-right slot, `watched` text chip, always visible both states).

## Per-task receipts (all rc 0, cmd-match green; commits on `feature/watched-toggle-label`)

| Task | Commit | Duty (last receipt) |
|---|---|---|
| 1.1 WatchedToggle rework (top-right chip, both-states visible) + test re-pin | `6621205` | vitest run WatchedStates.test.tsx (15/15) |
| 1.2 Consumer comment sweep + name-pin proof (zero retargeting) | `931567b` | vitest run Collection + ItemDetail tests (113/113) + negative grep |
| 1.3 Closeout regen (swag no-op + dist rebuild) | `e9606cd` | make web-build + tsc |
| git-check (built-in) | `8f67b0f` | tree committed, branch pushed — green at close |
| Gate touch-up (reviewer-required + riders, session act) | `ed6962b` | 1.2 duty re-run green on the touched tree |

Gate records: GATE 1 approved 2026-11-04 ("Approve — apply it"; validate strict
rc 0; surveyor trigger false on all three counts; no waivers). GATE 2 PASS after
the reviewer-required comment touch-up (all four axes; flags (a)–(d) accepted,
(e) split-ruled); operator approved archive ("Approve archive (Recommended)").
Gate anchor: full Go suite green; the diff contains zero .go files.

Apply shape: sequential @wf-coder per task (linear DAG — 1.2's grep duty reads
1.1's file). One fresh agent per task; receipts cited ids.

## Carried observations (non-blocking)

- Chip at-rest height ~20px (auto sizing + 2px padding over the 16px carrier
  font) — smaller than the old 28px ✓ box, quiet by design; the reviewer
  waived the task prose's "28px-ish" estimate.
- The 5 stale glyph-prose comment sites were reworded at the gate (`ed6962b`);
  WatchedStates.tsx:44-49's overbroad phrasing stays (pre-existing, verified
  true for the series-card site).
- Series-card bulk toggle remains v1.1; P3 TV remote keys still gated on the
  tvdebug field measurement (deploy carries `?tvdebug=1`).
- The unwatched ghost color rides the `--muted-foreground` token inline (same
  value as the base class) — a CSS-var consolidation candidate together with
  the WATCHED_ACCENT literal from collections-ux.
