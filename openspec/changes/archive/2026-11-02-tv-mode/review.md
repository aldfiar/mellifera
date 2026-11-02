# GATE 2 record — tv-mode

Gate run: 2026-11-02 (worktree feature/tv-mode, reviewer re-runs `--by wf-reviewer`, 26-receipt ledger).

## Verdict axes

| Axis | Verdict | Evidence |
|---|---|---|
| Receipts | PASS | 11/11 authored tasks re-run green by the reviewer (rc 0 each, fresh receipts); latest receipt green + cmd == duty.verify per task. git-check re-run red was the session's own gate-period handoff rewrite (session.md) — mechanical, fixed by the close step's commit; no code involved. |
| Full-suite anchors | PASS | `go test ./...` rc 0 (every package ok, zero FAIL). Web floor `npx vitest run` rc 0 — 41 files / 578 tests. `npx tsc --noEmit` rc 0. `openspec validate tv-mode --strict` (pin 1.14.0) rc 0. |
| Spec-delta fidelity | PASS | Every delta row evidenced in `git diff f03a3f3..HEAD` (ladder per D2 at tvmode.ts:63-69, upgrade-only probe auto-desktop-armed, six media-key rows in the ONE table at playerShortcuts.ts:94-99, per-axis hold-clamp walker :60-76 with exhaustive coordinate oracle, DialogShell push/pop/consume :107-181, .tv block pure-append marker-delimited with non-vacuous no-bare-px sweep, photo stage cap + adjacent-sibling hide + data-tv-yield both lanes + Enter behind native activation, Режим ТВ through the single writer). Scope: web/src + sanctioned dist regen + change folder; ZERO Go source. Desktop rules byte-identical outside the tv block. |
| Standards | PASS | Exports within ≤8 per module (tvmode 7, focusWalker 4, playerShortcuts 6, DialogShell 2); table-driven tests; no dead code, no compat shims. Judgement calls (accepted, P3): App.tsx fragment indent cosmetics; OVERLAY_HISTORY_KEY exported as a documented test seam; dense-but-tested DialogShell history effect. |

## Rulings

- **dpr parenthetical (1.1 prose):** drafting note, NOT a defect. The spec delta does NOT carry "both corroborate" (its four-shape list is the CSS-density claim; the autodetect requirement has no numbers). The wrong gloss lives only in tasks.md 1.1 prose (mirrored into the pipeline title by register). Implementation + tests assert the true ladder outcomes per the pinned definition. Optional drift-legal tidy available; not required.
- **5.2 implementation notes:** all three accepted (a: `!important` over the img inline cap is required and commented at both sites; b: adjacent-sibling hide scoped by DOM shape, documented — revisit with a dedicated data attribute if the photo lane gains siblings; c: status line = the existing browse bar, `--tv-status-chrome: clamp(48px, 7vh, 110px)` reserves its height).
- **Handoff inbox:** clean (0 open threads; rc 0 on session + wf-reviewer).

## Pending-fix resolution

`M openspec/changes/tv-mode/handoffs/session.md` committed (gate-record + receipts-count prose correction), branch re-pushed, `wf pipeline verify tv-mode git-check` re-run green → status 12/12 rc 0. Gate restored without re-review (reviewer's own routing).

## Archive approval

WAITING FOR OPERATOR — the session stops here per the operator's instruction ("stop on gate 2"). On approval: `openspec archive tv-mode --yes` → docs actualization → close-out → `wf pipeline clean` → merge-back.
