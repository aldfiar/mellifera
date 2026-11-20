# GATE 2 review — tv-style-parity (wf-reviewer)

## FINAL — Round 3, 2026-11-20: GATE 2 PASS

B10 fixed as prescribed: the typeAccent KDoc now reads "tinting the card's
✓ glyph; the in-progress bar reads its own fill/track tokens" — the false
claim dropped, the fill/track-token truth in its place; comment-only, no id
citations added, the map body untouched (verified on disk). Verify 1.1
re-run green (rc 0, fresh receipt, --by wf-coder). The blocking list is
empty: round 1's spec-axis pass and receipts, round 2's B1–B9 satisfaction
and residue ruling, and round 3's B10 fix close every finding this gate
raised. The untouched-line id citations (including the "(design D3" header
line) remain the recorded P3 /audit sweep — non-blocking, unchanged.
Next step per the loop: human archive approval (recorded here when given).

## Round 2 — 2026-11-20: GATE 2 FAIL — one blocking item remains (B10)

Round 1's comment-only fix round executed cleanly: all nine named findings
(B1–B9) are satisfied on disk, the four affected duties re-ran green
(1.1, 2.1, 4.2, 7.1 — rc 0, fresh receipts, --by wf-coder), and the fix
introduced zero new delivery vocabulary (sweep of the diff's added lines:
clean). The rewords are comment-only — every code body at the nine sites is
byte-identical to the round-1 tree this reviewer verified.

One stale claim survived, in the same KDoc block B7 lives in, and it is the
same defect class that failed round 1 — missed by this reviewer's round-1
sweep, caught at round 2:

- **B10** BrowseFlow.kt:38-39 (typeAccent KDoc) — "one pastel per module_id,
  tinting the card's ✓ glyph and the in-progress bar" — FALSE since task
  1.3: the bar fill reads `inProgressFill` (#F8FAFC) over `inProgressTrack`
  (BrowseScreen.kt InProgressBar); the pastel tints only the ✓ glyph. The
  line is diff-touched (re-wrapped by the change), so the stale-doc law
  applies: fix in-change. Fix: drop "and the in-progress bar" (e.g. "tinting
  the card's ✓ glyph; the in-progress bar reads its own fill/track
  tokens"). Comment-only; re-run verify 1.1 afterwards, then re-gate.

### Round-2 satisfaction check (B1–B9)

- **B1** App.kt — slug + task id dropped; "The default is now the SPA
  foreground token [tvForeground] (#F8FAFC, --foreground in styles/index.css
  .dark)" — intent + provenance kept. SATISFIED.
- **B2** Focus.kt RingSlate — "Private to Focus.kt — the ring color lives
  beside its consumer; promoting it into the Colors.kt token home is a
  one-line follow-up" — placement as intent, delivery reasoning gone.
  SATISFIED.
- **B3** FocusRingTest.kt — "The focus-ring width law's JVM pin" — id gone.
  SATISFIED.
- **B4/B5** FallbackGradient(.Test).kt — "(design D2)" gone; Artwork.tsx
  citations kept. SATISFIED.
- **B6** Colors.kt — header/tvAccent/railBorder/pastels ×3/AppCanvas all
  id-free; the honest "where one exists" amendment on the provenance law
  (tvAccent is client-tuned, no SPA selector). SATISFIED.
- **B7** — tvAccent KDoc reworded to the real role AND FACTUALLY TRUE of
  current code: consumers = the player seek-track fill (PlayerScreen.kt:332)
  + the selected rail-row name tint (BrowseScreen.kt:1072); "the focus ring
  rides the slate ring in Focus.kt, not this color" matches Focus.kt.
  BrowseFlow's tail rewritten consistently. SATISFIED — except the
  in-progress clause, now B10.
- **B8** — chipColor consumer list corrected AND TRUE: sole consumer is the
  seek track (PlayerScreen.kt:324). SATISFIED.
- **B9** — SkipChip KDoc tail "(D7)" stripped. SATISFIED.

### Pre-existing id-citation residue — RULING: does not block this gate

The citations outside the round-1 blocking list (App.kt:18-48 D9/D13/D1/D7/
D8/task 8.12; BrowseFlow's header line "(design D3" and moduleLabel ids;
PlayerScreen's pervasive (D7)/(5.x)/(12.4); plus round-1's /audit list:
5.x ids, task 8.10/12.1, D4/D13 headers, Walk62) all sit on lines this
change's diff never touched. Under the standing rule they are /audit's
sweep, not gate scope: **P3, routed to /audit** — recommended as a dedicated
comment-debt pass in the next audit window (the 2026-11-11 sweep
precedent). Routed, not blocking.

## Round 1 — 2026-11-20: GATE 2 FAIL (superseded by round 2; record kept)

The Spec axis and receipts were fully green (all 13 duties re-run green by
this reviewer, --by wf-reviewer; `wf pipeline status` 13/14 with git-check
red by design; logs .tmp/gate2-logs/). The FAIL was Standards-axis,
comment-only: delivery vocabulary on diff-introduced/touched comment lines
(B1–B6, B9) + stale-doc defects (B7–B8), per code-quality §Comment.

### Round-1 re-run receipts (all --by wf-reviewer)

| Task | rc | Task | rc |
|------|----|------|----|
| 1.1 | 0 | 4.1 | 0 |
| 1.2 | 0 | 4.2 | 0 |
| 1.3 | 0 | 5.1 | 0 |
| 2.1 | 0 | 5.2 | 0 |
| 2.2 | 0 | 6.1 | 0 |
| 3.1 | 0 | 7.1 | 0 |
| 3.2 | 0 | | |

Round-2 fix receipts: 1.1 / 2.1 / 4.2 / 7.1 all rc 0 (--by wf-coder).

### Spec-axis summary (all PASS — unchanged in round 2)

- **S-1**: token home with SPA provenance (Colors.kt); root text
  tvForeground (App.kt); 12 muted + 8 LightGray sites swapped; destructive
  banners (PlayerScreen.kt DestructiveBanner); fill/track pair
  (BrowseScreen.kt InProgressBar); RailRow #1E293B fill.
- **S-2**: verbatim pure law (FallbackGradient.kt fnv1a/hues/HSL); exactly
  three fallback call sites (BrowseScreen CardView, HomeRows Resume +
  Anchor); hero/thumb keep field-driven absence; determinism + SPA-computed
  goldens + grapheme floor pinned (FallbackGradientTest).
- **S-3**: TYPE_DISPLAY 10sp / TYPE_CODE 18sp; pairing code Monospace +
  0.1em; weights and 2-line clamps at every named site.
- **S-4**: pill chips ×3 surfaces + active inversion; skip pastels with SPA
  provenance (SkipSections.kt); progressive Animatable fade
  (PlayerScreen.kt).
- **S-5**: gutter 6dp, column 0.92, overscan 24/14dp; poster 48×72; overscan
  insets at all five surfaces incl. PairingScreen (Q2).
- **S-8**: HomeCardShell chrome 3dp + railBorder + 6dp; clips ×3; RailRow
  padding 8dp.
- **S-7**: scale retired (graphicsLayer/FOCUSED_SCALE deleted); slate ring
  outside with offset, dpr-clamp width law + SPA offset law; shape param
  (RailRow 4dp, pills); FocusRingTest pins; FocusLawTest green.
- **MODIFIED Series-detail**: overflow clamp delivered by 3.2; carried
  scenarios verified.

### Runner-flag adjudications (unchanged)

1. Dead `accent` param in InProgressBar — PASS, contract-pinned ("no
   signature changes"); P3 follow-up.
2. RailRow #1E293B literal — PASS, contract-pinned; named token = follow-up.
3. Active-chip border stays railBorder — PASS; task + scenario name
   surface+text only; border flip = P3 residue.
4. RingSlate private — PASS on placement; its KDoc was B2, now fixed.
5. Default-shape focus sites — PASS, contract-exact.
6. 7.1 KDoc truth-fix — PASS and mandatory; the same law drives B10.
7. SkipTone border = text hue — PASS, documented rationale, test-pinned.

### Non-blocking residues (P3, follow-up seeds)

Player seek bar tvAccent-on-chipColor (pre-existing, un-inventoried);
selected rail-row name tvAccent; dead accent param; RailRow literal;
active-chip border; RingSlate promotion into the token home.

## Notes

- Scope: clean — only contracted files; FallbackArtwork.kt inside 2.2's
  unpinned seam; runner-added FallbackArtworkTest is good additive coverage.
- Register grammar: respected; cmd-match green on all tasks.
- Source-map re-grounding: N/A (Kotlin-only diff; railMuted removal
  re-grounded by tree-wide grep = zero hits).
- Surveyor handoff re-checked at round 1: the three group-1 contracts and
  inventory claims hold.

Human archive approval: pending (added after the gate passes).

## Human archive approval

APPROVED — operator, in session, 2026-11-20 ("aprove, deploy on alatoic"). GATE 2 PASS round 3 accepted; full-suite disclosure (pre-existing TestPairingJointFlow at base, attributed) acknowledged.
