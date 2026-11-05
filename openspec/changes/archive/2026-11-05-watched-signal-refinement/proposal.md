# Proposal

## Why

The `watched` text chip (watched-toggle-label, 9949db0) is noisy where it should be
quiet and dishonest where it should be honest: the word renders on every card at all
times, and its inline sizing pins (`opacity:1`, `width/height:auto`, chip padding) defeat
the coarse-pointer ≥40px hit twin (index.css) and the `html.tv` clamp twin on every
pointer class — the shipped hit box measures ~22px, not the ≥40px the cardact law
promises. The meta row is the structural home the chip never had: one quiet glyph,
never a word. This is the converged follow-up to watched-toggle-label — the design loop
ran two branches through a wf-reviewer grill (HOLDS-WITH-CHANGES, all corrections
folded, both decision forks resolved by the user); the decisions record D1–D10 and the
accepted deltas are frozen in design.md.

## What Changes

- One glyph, never a word: `WatchedToggle` renders `<span aria-hidden="true">✓</span>` —
  watched = the pastel accent `#a4c8f4`, unwatched = muted ghost; the 1px ring is
  retired (D5). The string `watched` never renders on a user surface again (the aria
  names "Watched"/"Unwatched" and InProgressBar's "<n>% watched" are the pinned
  accessibility seam, untouched).
- The toggle leaves the top-right corner for a `.card-meta-row` flow row below the
  link, inside the card's border box (D2/D6): card chrome (border/rounded/
  `hover:bg-accent`) moves to the host element (MovieCard host div / ItemGrid li), the
  meta text and InProgressBar leave the Link into the row, and the toggle sits
  right-aligned at the row's end — a flow child, outside the Link. An empty meta
  renders the toggle alone at the same slot (uniform rail).
- Visibility split by pointer class (D9): the watched ✓ is visible at rest on every
  pointer class; the unwatched ✓ hides at rest on fine pointers (opacity AND
  pointer-events — D5's accident protection) and reveals on host hover/focus-within +
  own keyboard focus; coarse pointers and tv mode keep it persistent with the hit twins
  RESTORED (≥28px fine / ≥40px coarse / tv clamp) — an honest-behavior fix, priced as
  such. The ItemDetail heading is exempt (D1): always-visible in BOTH states.
- The `placement` prop is deleted (D7) — dead API once the meta row owns the slot; the
  component renders one carrier form (`cardact-trigger cardact-trigger--inline`) on
  every mount and the visibility law is context-scoped CSS, not props.
- Wiring byte-identical: same `<button>`, `aria-pressed`, aria-label pair,
  served-flag-only target, `PUT /items/{id}/state`, stopPropagation-first, five-family
  invalidation (items/series/series-episodes/item/progress). SPA only — no wire change,
  no Go code.
- Spec delta: the "Watched element states" requirement is amended (glyph law, meta-row
  slot law, ring retirement, the D9 visibility SHALL rewrite, the restored hit-twin
  sentence ADDED, component-true surface naming) and the "CardActions element menu"
  requirement's "✓ owns it" cross-reference updated (✓ leaves the corner); the SPA dist
  rebuilds at closeout.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `web-ui` — the "Watched element states" requirement's toggle paragraph is rewritten
  (word→glyph, corner slot→meta-row flow, ring retirement, visibility split by pointer
  class with the restored hit twins, component-true surface naming) and three of its
  four scenario bodies are reworded under the same laws (scenario headings retained —
  the openspec 1.14.0 heading-immutability constraint); the "CardActions element menu"
  requirement's ownership cross-reference sentence is updated. The delta carries the
  complete amended requirement text for both.

## Impact

- `web/src/components/WatchedStates.tsx` (WatchedToggle rewrite + comments) and
  `web/src/components/WatchedStates.test.tsx` (re-pins: ✓ text, absence-of-inline pins,
  class-carrier pins, consumer DOM pins, the new stylesheet pins);
  `web/src/pages/browse/ItemDetail.tsx` (heading mount: dead prop arg drop + comment
  sweep); `web/src/pages/collections/Collection.tsx` (MovieCard + ItemGrid card:
  chrome→host, meta-row extraction + comment sweep); `web/src/styles/index.css` (one
  appended block: row rule, state classes, D3 hover pair, D4 visibility block — ZERO
  edits to existing rules). AMENDED AT APPLY (2.2, 2026-11-04): `ItemDetail.test.tsx`
  holds unchanged; `Collection.test.tsx` carries exactly three query-scope widenings
  (the D2 move puts the meta line outside the Link, so within(link)-scoped meta-fact
  pins widen to the card box — asserted content unchanged; detail in design.md
  Interfaces #4).
- No Go/API/wire change — the closeout `make web-build` is the routine swag-no-op +
  dist regen (this time it carries the SPA reskin). No new modules — no @qa mandates.
- Accepted deltas, deliberate and user-visible (frozen in design.md): tab order flips
  to link → toggle → ⋯; meta text no longer navigates; card height +~12px fine /
  +~24px tv; touch/tv hit box grows ~22px → 40px+ (the fix, visible); lone ghost ✓ at
  the slot on empty-meta cards (coarse/tv, uniform); unwatched at-rest clicks pass
  through the ghost slot on fine pointers (pre-label behavior restored); SR verbosity
  identical to today's ⋯ posture.

## Isolation & Baseline

Worktree-lane strict loop: the change runs in
`/Users/aldfiar/projects/go/mellifera.worktrees/watched-signal-refinement`
(branch `feature/watched-signal-refinement` @ 9949db0, stacked on
`feature/watched-toggle-label` — the chip code exists ONLY here; main @ e5d957f lacks
it; merge-base = main tip, zero rebase debt — D10). The pipeline attaches this
worktree (`wf pipeline attach-worktree`), and the built-in git-check duty runs
`git -C <worktree>`. Baseline GREEN at 9949db0: full `go test ./...` rc 0 (23 ok,
0 FAIL) + `npm ci` rc 0.
