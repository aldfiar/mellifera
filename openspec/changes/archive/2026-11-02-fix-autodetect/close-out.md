# Close-out — fix-autodetect (archived 2026-11-02)

## Deliverable
The spaced "Smart TV" UA family detects decisively: STRONG_MARKERS `/SmartTV/` → `/smart[\s_-]*tv/i` (web/src/lib/tvmode.ts:47, one-row widening; case-insensitive, admits space/underscore/hyphen/none). The async model-hint probe inherits the widening through the shared matcher. Corroboration legs, the weak `\bTV\b` token, and the override law untouched. ZERO Go source edits (swag delta zero); embedded dist regenerated (commit 19a8497).

Root cause record: the operator's Android-14 TV (YaBrowser TV lite) sends `... Smart TV Pro Build/UTT2.250416.001 ...` — spaced, which the old `/SmartTV/` row missed; the weak `\bTV\b` token matched but corroboration failed on the dpr-1 full-HD height leg → desktop boot. Full diagnosis in handoffs/wf-debugger.md (kept in the archive).

## Final receipt summary (all green; ledger 3 tasks / 6 receipts)
| Task | Commit | Tests | Note |
|---|---|---|---|
| 1.1 marker widening | 17d6957 | tvmode.test.ts 57/57 (was 52, 2 red) | repro rows green expectations-unchanged; WEAK_TV_UA re-homed to bare "Android 9; TV"; +5 family rows incl. lookalike-desktop negative |
| 1.2 dist regen | 19a8497 | duty chain green | index-CZf6uMJf.js → index-B2SO7dwH.js (marker verbatim in bundle); first verify red (uncommitted regen) journaled, re-run byte-identical |
| git-check | b5884bf (push) | — | tree committed incl. change folder, branch pushed |

## Gate record
review.md: all five axes PASS (re-verify, full-suite anchors go test rc 0 / vitest 41 files 586 tests / tsc rc 0, diff-vs-delta exact 6 files, standards PASS, strict validate rc 0). One P3 informational: inert Tailwind `.uppercase` rule in rebuilt CSS (scanner artifact from test-row names; explains CSS hash swap). Archive approval: operator, 2026-11-02.

## Accepted judgement calls (P3, reviewer)
No action items. The one informational note is closed as harmless.

## Follow-ups seeded
- Operator TV retest on the redeployed bundle (autodetect should now flip the device to .tv without any override).
- ASC-probe fallback (pre-existing, unrelated).
