# Design

## Context

The chip shipped by watched-toggle-label (9949db0) pins its whole state split inline
(opacity, width/height, padding, `right:40px`, colors — `WatchedStates.tsx:110-125`),
which beats the coarse-pointer twin (index.css `@media (pointer: coarse)` block) and
the `html.tv` clamp twin on every pointer class: shipped hit ~22px. The carrier's own
disclosure law (`.cardact-trigger` opacity:0 at rest + host hover/focus-within reveal)
is likewise defeated by the inline `opacity:1`. Absolute-slot anchoring is
unimplementable — the meta span lives inside the `<Link>` beside a `line-clamp-2`
title whose y shifts 1↔2 lines per card, and the Link stretches `h-full` in grid rows
— so the flow row is the structural fix (D6). See proposal.md — Why for motivation;
the design input (`.tmp/watched-signal-refinement-design.md` at the design loop) froze
the law, D1–D10, the accepted deltas, and the apply-time checks; this file transcribes
them and pins the cross-group contracts. All file:line facts below were re-verified
against this tree (9949db0) at propose time.

## Goals / Non-Goals

**Goals:**

- One glyph, never a word — the ✓ at meta-line scale, accent/ghost split, ring
  retired for BOTH states (D5's "no pill or badge chrome" now genuinely covers both).
- The meta row as the toggle's structural home: flow child, outside the Link, inside
  the card's border box.
- The visibility law restored as honest CSS (context-scoped, class-driven) with the
  hit twins working again on coarse pointers and tv.
- Byte-identical wiring: `<button>`, `aria-pressed`, the "Watched"/"Unwatched" aria
  pair, served-flag-only target, `PUT /items/{id}/state`, stopPropagation-first,
  five-family invalidation.

**Non-Goals:**

- No wire/API/Go change; no new modules (no @qa mandates); no SeriesCard change (the
  passive `WatchedMark` + `.watched-dim` stay); the ⋯ cardact law stays untouched
  (base/reveal/coarse/tv blocks, `.watched-mark`, `.watched-dim` — zero edits).
- No light-theme `--watched-ink` token (D8: `#a4c8f4` ≈1.7:1 on white is
  accepted-shipped, the same token as `.watched-mark`; the token is a SEEDED follow-up
  decided only if a light theme ships — never silently introduced).
- No title-clamp law or TV remote work (the existing
  `watched-toggle-titles-remote-proposal.md` follow-ups).

## Decisions

D1–D10 are FROZEN (transcribed from the design input; relitigation is out of scope).
The load-bearing ones, with their implementation consequence:

- **D1 — heading exempt from hide-at-rest** (user call): the hide is scoped to the
  `.card-meta-row` context only; the heading keeps the ✓ visible at rest in BOTH
  states. Honors the inline variant's documented carve-out (index.css
  `.cardact-trigger--inline`); the original findability complaint never touched the
  heading.
- **D2 — card chrome moves to the host** (user call): border, rounded, background,
  `hover:bg-accent` move from the Link to the host element (MovieCard host div /
  ItemGrid li — the li gains a flex-column layout so the Link's `flex-1 min-h-0`
  works). The meta row stays INSIDE the card border box; card visual identical to
  today; hover-on-card preserved.
- **D3 — hover skin, two state rules**: `.wtoggle--watched:hover` keeps the accent hue
  (`background:transparent; color:#a4c8f4`); `.wtoggle--unwatched:hover`
  (`background:transparent`) lets the color lift to the base hover's foreground — the
  feedback. Both overrides must be authored AFTER the base `.cardact-trigger:hover`
  rule (equal specificity — source order decides).
- **D4 — one authored cascade block**, appended after the cardact section: fine-pointer
  hide + reveal selectors + `@media (pointer:coarse)` restore + `html.tv` restore,
  authored together; ordering and D1 scoping pinned in stylesheet tests. The family is
  STATE-scoped (D9): the hide targets
  `.card-meta-row .cardact-trigger.wtoggle--unwatched` (0,3,0) only — the watched ✓
  carries NO hide-at-rest rule (pinned). The block authors its OWN reveal selectors
  (host `:hover`/`:focus-within` + own `:focus-visible`, state-scoped to the same
  shape) because the base reveal (`.cardact-host:hover .cardact-trigger`, 0,3,0) sets
  opacity ONLY — never `pointer-events` — so without own reveals carrying
  `pointer-events:auto` a hover-revealed toggle would stay visible but unclickable;
  the reveals restore BOTH (pinned). The appended coarse/tv restores repeat the hide's
  selector shape (equal specificity, later in the block — the same law D3 states): the
  EXISTING restores (coarse 0,1,0, tv 0,1,1) lose to the 0,3,0 hide regardless of
  media queries, so the appended restores are load-bearing for the twins' opacity
  persistence.
- **D5 — keep `pointer-events:none` at rest**: in the flow row it is accident
  protection — an invisible button in reserved space would swallow a click and fire a
  real state WRITE. Keyboard unaffected (verified: tab reaches the button,
  `:focus-visible` reveals).
- **D6 — structural flow-row over pure reskin**: Branch A's costs verified real (bar
  overlap on in-progress cards; baseline tracking impossible); the flow-row diff is
  small (2 mount sites + one row class) and kills the whole absolute-slot class.
- **D7 — delete the `placement` prop now**: exactly one production caller
  (ItemDetail.tsx:1264) + test comments; dead API once the meta row owns the slot.
- **D8 — contrast shipped as-is**: `#a4c8f4` ≈1.7:1 on white, ≈10:1 dark —
  accepted-shipped token. A light-theme `--watched-ink` (~3:1) is a SEEDED FOLLOW-UP.
- **D9 — visibility split accepted**: history honored — the original complaint was the
  WATCHED mark, which stays always visible; only the unwatched affordance is
  hover-gated on fine pointers. This REVERSES the label branch's "visible at rest in
  BOTH states… disclosure law retired" SHALL, scoping that retirement to the ⋯ trigger
  alone.
- **D10 — branch cut at 9949db0**: merge-base = main tip; zero rebase debt.

**D7+D1 co-resolution — the one carrier form (the change's central mechanism, pinned
here):** with the placement prop deleted, the component cannot vary its class by
mount, and the heading has NO `.cardact-host` ancestor (zero hits verified in
ItemDetail.tsx) — a bare `.cardact-trigger` at the heading would sit at opacity 0 with
no reveal selector able to fire (violating D1), while keeping any placement prop
contradicts D7. The only reading consistent with the frozen decisions:
`WatchedToggle` renders ONE carrier form on every mount —
`cardact-trigger cardact-trigger--inline` — and the visibility law is CONTEXT-scoped:
the D4 block hides the UNWATCHED state at rest only inside `.card-meta-row`
(`.card-meta-row .cardact-trigger.wtoggle--unwatched`, 0,3,0, beats `--inline`'s
opacity:1 at 0,1,0; the watched state carries no hide rule), so cards get the
fine-pointer hide/reveal, the heading keeps `--inline`'s always-visible, and the
coarse/tv twins keep firing on both exactly as today. The design input's "carrier `cardact-trigger` (+`--inline` at the
heading)" and "heading mount uses the `cardact-trigger--inline` carrier directly" are
both true under this reading.

## Interfaces

Cross-group contracts (group numbers = tasks.md groups; the DAG order is 1 → 2 → 3 →
4, and 3.1 additionally depends on 2.2's `.card-meta-row` markup):

1. **Toggle class-list contract (1.1 → 2.2, 3.1):** the button renders
   `cardact-trigger cardact-trigger--inline wtoggle--watched|wtoggle--unwatched`,
   body `<span aria-hidden="true">✓</span>`, no inline styles at all, no placement
   prop, `WATCHED_ACCENT` moved out of the component (the accent literal lives in the
   CSS task's `.wtoggle--watched` rule). Consumers key on the aria names
   "Watched"/"Unwatched" — the query seam that does not change.
2. **Meta-row DOM contract (2.2 → 3.1):** each card mount renders
   `host(.cardact-host, carries the chrome) > [Link(px-3 pt-3, flex-1 min-h-0)] +
   .card-meta-row(flex row, inside the border box) > [meta text?][InProgressBar?] +
   toggle(right-aligned)`. MovieCard moves its meta span + bar into the row (empty
   meta → the row renders the toggle alone at the same slot — uniform rail); ItemGrid
   has no meta span — its row carries the bar (when served) + toggle; the chips row
   stays in the Link (the design moves only the meta span + bar). The row rule
   (flex, align-center, gap 8px, padding 0 12px 12px), the
   `> .cardact-trigger { margin-left: auto }` child rule, and the glyph scale
   (≈12px — the text-xs context, via the `.watched-mark` em idiom) land in 3.1:
   between 2.2 and 3.1 the row is structurally right but unstyled, and between 1.1
   and 3.1 the glyph is uncolored — mid-loop visual states are not gated (duties are
   DOM pins; jsdom ignores stylesheets).
3. **Cascade-block contract (3.1 → tests/gate):** all new index.css rules in ONE block
   appended after the cardact section: `.card-meta-row` + child margin rule + glyph
   scale; `.wtoggle--watched`/`.wtoggle--unwatched` colors (no border, no chrome);
   the D3 hover pair; the visibility block — STATE-scoped per D9: the fine hide
   `.card-meta-row .cardact-trigger.wtoggle--unwatched` (0,3,0) sets `opacity:0` +
   `pointer-events:none` and is the ONLY at-rest hide (the watched ✓ carries none —
   pinned); the own reveals (host `:hover`/`:focus-within` + own `:focus-visible`,
   the same state-scoped shape) restore BOTH opacity and pointer-events; the
   `@media (pointer:coarse)` and `html.tv` restores repeat the hide's selector shape
   (equal specificity, later in the appended block — the existing 0,1,0 / 0,1,1
   restores lose to the 0,3,0 hide regardless of media queries), restoring opacity +
   pointer-events persistence while the ≥40px / clamp hit sizes keep riding the
   untouched existing blocks + a MANUAL TEST NOTE comment per the house idiom (jsdom
   cannot see media queries). ZERO edits to existing rules — the tvCssContract text pin and
   WatchedStates' own twin pins (:380/:396) prove the untouched blocks survive.
4. **Test-file handoff (1.1 → 2.2 → 3.1):** `WatchedStates.test.tsx` is edited by
   three tasks in order — 1.1 owns the DOM pins (the four `textContent === "watched"`
   pins at :252/:281/:440/:611 flip to "✓"; the inline-pin pins flip to
   absence-of-inline; class-carrier pins), 2.2 owns the consumer DOM pins (the
   toggle's parent carries `card-meta-row`, the meta text is its sibling, the row
   sits outside the Link), 3.1 owns the stylesheet pins (D4 block present, D1
   scoping — the hide is `.card-meta-row`-scoped and `.wtoggle--unwatched`-only, no
   global `--inline` hide, the watched state carries no hide-at-rest rule — the
   reveals restoring BOTH opacity 1 AND pointer-events auto, the coarse/tv restores
   carrying the `.card-meta-row` shape, the wtoggle color/hover
   rules, the row rule). The click
   contract describe (:311-369) and the existing stylesheet-sweep pins (:380/:396)
   are never edited; `ItemDetail.test.tsx` is never edited. AMENDED AT APPLY (2.2,
   2026-11-04): `Collection.test.tsx` needed exactly THREE query-scope widenings —
   the D2 move puts the meta line OUTSIDE the Link, so the two `within(link)`-scoped
   meta-line assertions (:205-area "renders the served title and ONE muted meta
   line", ~:1200 INV-no-filenames) and the `within(f3)` duration pin widen their
   query from the Link to the card box (`link.parentElement`), each commented with
   the 2.2/D2 consequence; the asserted CONTENT is unchanged (the propose-time
   grep covered render-text `("watched")` pins — these three are meta-fact text
   pins, a scope the check did not name).

## Risks / Trade-offs

- [Mid-loop tsc window: after 1.1 deletes the placement prop, ItemDetail.tsx still
  passes the dead arg until 2.1 — vitest is type-blind so every duty stays green;
  `tsc --noEmit` runs only at closeout] → the window is bounded (adjacent tasks in
  group order); the closeout duty pins the whole-tree type state.
- [Accepted deltas, deliberate and user-visible] → tab order flips to link → toggle →
  ⋯ (follows DOM order; reading-order-better); meta text no longer navigates; card
  height +~12px fine / +~24px tv (hit-box-sized meta row); touch/tv hit box ~22px →
  40px+ (the twins restoration — the fix, visible); lone ghost ✓ at the slot on
  empty-meta cards (coarse/tv, uniform, not a bug); unwatched at-rest clicks pass
  through the ghost slot on fine pointers (restores pre-label behavior); SR verbosity
  identical to today's hover-only ⋯ posture.
- [Apply-time checks jsdom cannot run] → 4×4 grid eyeball in BOTH themes
  (ghost-noise recurrence check); tv mode forced on (`mellifera.tv=on`,
  MANUAL-TEST-NOTE idiom): 16:9 ItemGrid rows must absorb the meta-row delta. These
  ride the CSS task's MANUAL TEST NOTE comment and the gate's human pass.
- [Idiom-level pixel details] → the glyph scale (≈12px on the row via the
  `.watched-mark` em idiom; the `.watched-mark` precedent carries the heading) and the
  host's gap reconciliation (the row seats itself via its own padding — "card visual
  identical to today", D2) are settled by the eyeball checks + the stylesheet pins;
  no law change.

## Open Questions

None blocking — the design input's Q1–Q3 are resolved (D1, D6, D9). Nothing
deferrable remains that could change the specs, the approach, or the task breakdown.
