# Proposal

## Why

The collections-ux toggle shipped the unwatched affordance under the card-action
disclosure law — hover/focus-only on fine pointers — so an unwatched episode card
shows NOTHING at rest and the operator (deploying today) could not find any watched
symbol on an episode. The steer: move the toggle to the top-right beside the ⋯
trigger, replace the ✓ glyph with the string `watched`, and make it visible at rest
in both states.

## What Changes

- `WatchedToggle`'s corner slot flips from the mark's top-left
  (`right:auto; left:6px`) to the TOP-RIGHT, LEFT of the ⋯ cardact trigger —
  inline `right:40px`, which clears the trigger's 28px slot at `right:6px`
  (left edge at 34px) with the stylesheet's own 6px gutter
  (index.css `.cardact-trigger`). The ⋯ trigger keeps its slot, its size, and
  its disclosure law untouched.
- The ✓ glyph is replaced by the text label `watched` (lowercase, as steered)
  rendered as a small chip: watched = the library's pastel accent text
  (`#a4c8f4`, the component's WATCHED_ACCENT literal), unwatched = muted ghost
  text with the quiet 1px ring (today's outline idiom, translated glyph→text).
- The card-action disclosure law is RETIRED for this control: the label is
  visible at rest in BOTH states on every pointer class — inline `opacity:1`
  in both branches beats the base `opacity:0`, the coarse-pointer block, and
  the html.tv twin. The ⋯ trigger keeps that law for itself, unchanged.
- Click semantics unchanged: `stopPropagation`, the target state picked from
  the SERVED watched flag, `useSetItemState`, the five-family invalidation;
  `aria-pressed` and the state-distinct aria-labels stay (the visible text is
  constant — state reads from styling + pressed state).
- Series cards keep the passive filled ✓ `WatchedMark` (the bulk toggle stays
  v1.1); the watched-state presentation law (dimmed title, no progress bar on
  watched) is unchanged.
- Tests re-pinned in `WatchedStates.test.tsx` (label text per state, the
  `right:40px` slot, both-states `opacity:1`); the consumer tests pin by
  accessible name and hold unchanged; stale "top-left slot" comments on the
  consumer pages are swept (comments only — the mounts themselves are
  unchanged, the component's props are identical).
- Scenario headings of the amended requirement are all retained — each still
  names its claim accurately under the amendment (the openspec 1.14.0
  heading-immutability constraint checked; no waiver needed).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `web-ui` — the "Watched element states" requirement's toggle paragraph flips
  (slot, form, visibility law) and three of its four scenario bodies are
  rewritten; the delta carries the complete amended requirement text.

## Impact

- `web/src/components/WatchedStates.tsx` (WatchedToggle rendering + comments)
  and `web/src/components/WatchedStates.test.tsx`; comment-only sweeps in
  `web/src/pages/collections/Collection.tsx` and
  `web/src/pages/browse/ItemDetail.tsx`; SPA dist rebuild at closeout.
- No Go/API/wire change — the closeout `make web-build` is the routine
  swag-no-op + dist regen. No new CSS: the chip composes the existing
  `cardact-trigger` classes with inline overrides (the established idiom).
- Cosmetic residue, deliberately out of scope: two cross-reference prose
  mentions in the CardActions menu requirement ("the card's WatchedToggle ✓
  owns it" / "is the only manual path") keep their ✓ shorthand — they name the
  component, they do not pin its rendering; the rendering law lives in the
  amended "Watched element states" requirement.
