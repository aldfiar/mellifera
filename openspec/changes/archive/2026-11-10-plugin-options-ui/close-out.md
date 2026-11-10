# Close-out — plugin-options-ui

Closed 2026-11-10 · GATE 1 approved ("Approve + fold Q1–Q3", OQ-1 as designed) ·
GATE 2 APPROVED round 1 (zero re-work; HEAD d607e9c) · human archive approval
"Approve + close" + "Fold now" same day · archived as `2026-11-10-plugin-options-ui`
(spec deltas merged: web-ui MODIFIED "Plugins admin surface", ADDED "Binding options
editor"). Stacked on feature/tmdb-enrichment @ cf32a20 (PR #36 open) — the SPA change
consumes the wire surface that PR lands; PR opens with base feature/tmdb-enrichment.

## What shipped

The operator-facing half of the plugin secrets surface, SPA-only (backend zero-edit —
the aggregate verdicts and the PUT endpoint shipped in tmdb-enrichment): the Plugins
admin page now renders the per-binding «Требует настройки» destructive badge driven
ONLY by the served `required_secrets` verdicts (scanner rows never badge), an
options-words layer (vocabulary `{language → «Язык»}` — the one key with a live
producer — metadata bindings only, served values verbatim, everything else stays
behind the raw-JSON disclosure), and a per-binding Edit affordance opening the NEW
`BindingOptionsEditor` (DialogShell dialog): write-only password-type secret inputs
(never pre-filled — the redaction law means only the verdict shows; plain-words
consequence copy «Пустое поле при сохранении удалит сохранённое значение.»), a
whole-replacement composed body (untouched served keys pass by reference byte-identical;
an empty secret input composes the key ABSENT — the ruled OQ-1 semantics), retry:0
mutation with 404/400/503 surfaced inline while the dialog stays open, success →
invalidate `["admin-plugins"]` + close. The Plugins-page INV-no-writes invariant is
amended deliberately to exactly ONE sanctioned write (scanner bindings carry no
affordance — the endpoint refuses them). `OPTION_WORDS` has ONE home (the editor
component; the page imports it — the GATE-2 FLAG-1 dedup). TMDB is now configurable
from the browser, no curl.

## Final receipt summary (the durable record once the machine home is gone)

- **Plan**: 2 groups, 4 authored tasks + built-in git-check (register: 2 groups,
  5 tasks). Final state 5/5 green, `wf pipeline status` rc 0.
- **Receipt ledger**: 17 receipt events, **17 green, 0 red** — the first change in
  this install with a spotless ledger (no red receipts anywhere, including the
  reviewer's gate re-runs and the post-fold refresh).
- **Gate history**: round 1 APPROVED — all four tasks PASS on the spec, integration,
  and standards axes; 2 non-blocking FLAGs, both dispositioned (FLAG 1 P2 folded
  before push: the OPTION_WORDS dedup, all four duties re-run green post-fold;
  FLAG 2 P3 seeded: the no-auto-retry test's ~200ms margin).
- **Survey**: wiring PASS, qa-seam PASS, blast radius CONTAINED; 3 numbered questions,
  all resolved by fold before register (poster_dir dropped — no live producer; words
  layer explicitly metadata-scoped; stale ENDPOINTS comment fixed).

## Loop lessons (this install)

1. **The stacked-worktree idiom**: `wf worktree create` elects the MAIN tree's base
   regardless of launch cwd — stacking on an open PR branch is a clean
   `git rebase <stack-parent>` on the fresh branch (no unique commits yet = pure ff),
   then everything proceeds normally. The PR then opens with `--base <stack-parent>`.
2. **A `@qa` task's test-side failures are still honest work**: 2.2's two mid-run reds
   were test-harness bugs (fixture identity; DialogShell history-drain across tests),
   fixed by the same agent — and the fix produced the STRONGER harness shape
   (parent-owned overlay state, "closes" asserted as dialog removal), which 2.3 then
   reused as the wiring idiom.
3. **The single-vocabulary rule surfaced naturally**: two tasks legitimately needed
   the words vocabulary in their own files (scopes were disjoint); the gate caught the
   duplication as FLAG 1 and the fold (import, don't restate) landed in minutes —
   the FLAG → fold → re-run-all-duties path is cheap and keeps receipts honest.
4. **Keep the `cd` prefix on every wf verb** — the session shell resets cwd between
   calls; three agents independently hit the "no pipeline home" refusal before
   adopting the explicit loop-root prefix.

## Follow-up seeds (carried to docs/backlog.md by the docs sweep)

- P3: widen the no-auto-retry proof's margin (BindingOptionsEditor.test.tsx ~:213,
  1200ms vs the 1000ms retry window) if it ever flakes on a saturated runner.
- P3: trim the editor's now-unused exports (composeOptions/presentedOptions;
  OPTION_WORDS is consumed since the fold) or fold into the extraction below.
- P3: extract Plugins.tsx Binding+optionWords into components/admin/ (the page is
  ~537 lines; the web convention overrides the generic 500 baseline for now, and the
  natural home now exists).
- Shared-vocabulary note resolved by the FLAG-1 fold (one home; no seed needed).
