# GATE 2 review — watched-toggle-label

## Reviewer verdict (2026-11-04): PASS (after gate touch-up)

- **Axis 1 — verify re-runs**: 1.1 rc 0 (15/15), 1.2 rc 0 (113/113 + negative grep clean), 1.3 rc 0 (swag no-op, clean build), all `--by wf-reviewer`; uncached component spot-check green; scoped eslint 0 errors (2 pre-existing warnings outside hunks); `validate --strict` zero failures. Status 4/4 after the close-order push.
- **Axis 2 — diff vs spec delta**: PASS — every SHALL in the amended "Watched element states" toggle paragraph implemented and test-pinned: top-right slot one 6px gutter left of the untouched ⋯ (right:40px over the ⋯'s 34px left edge; index.css zero hunks), lowercase aria-hidden `watched` label with state-distinct accessible names (113/113 name-based pins held), unconditional inline `opacity: 1` both states beating base/coarse/html.tv rules via auto sizing + padding, accent-vs-ghost+ring state split, click/aria/invalidation byte-identical, WatchedMark + series-card passive ✓ untouched, no API change. 4/4 scenario bodies match reality.
- **Axis 3 — standards**: PASS. Flags adjudicated: (a) chip ~20px waived (spec pins "a small chip", mechanism tests pin auto+padding); (b) inline muted-foreground pin accepted (same token as base, beats the carrier's :hover flip); (c) symmetric unwatched pins = spec-mandated; (d) ItemDetail.tsx:1235-1237 reword in scope (comments-only, same prose family); (e) SPLIT — Collection.tsx:1199-1201 stale law prose REQUIRED a fix (landed); WatchedStates.tsx:44-49 waived (pre-existing, verified true for series cards).
- **Axis 4 — removal/orphan**: PASS — no Go symbols, zero old-affordance code/assertions survive (grep-verified), dist carries the chip (`right:"40px"` in index-CS3cyRO5.js).
- **Gate touch-up**: `ed6962b` — the reviewer-required Collection.tsx:1199-1201 reword + 4 recommended glyph-prose riders (comments only, 3 files); the 1.2 duty re-run green on the touched tree (113/113, rc 0).
- Gate anchor: full Go suite green (the diff contains zero .go files).

## Archive approval

Operator approved archive at the GATE 2 dialog (2026-11-04): "Approve archive (Recommended)".
