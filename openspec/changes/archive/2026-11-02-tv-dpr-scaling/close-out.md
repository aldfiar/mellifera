# Close-out — tv-dpr-scaling (archived 2026-11-02)

## Deliverable
Tv-mode density now derives from the PHYSICAL viewport on any panel: a `--tv-dpr` custom property (the exact reported devicePixelRatio, floored to 1 only as the absent/invalid fallback, removed whenever tv mode is off) set by tvmode's single class-writer; the `.tv` block's px floor legs divide by it (root type, focus-ring width, card-action trigger hit target) so the designed vw fraction legs win on high-dpr boxes; the content cap stays raw; every pure viewport-fraction rule stays unscaled; dpr-1 devices render byte-identical to shipped; desktop never carries the var. Plus the Settings2 → Settings gear swap. The spec's first requirement was replaced: "scales by the reported CSS viewport" → "scales by the physical viewport" (division law), with the ≥40px card-action hit target now reading physical px.

## Final receipt summary (ledger 6 tasks; all green incl. reviewer re-runs)
| Task | Commit | Tests | Note |
|---|---|---|---|
| 1.1 tvmode --tv-dpr plumbing | 6dc9c23 | tvmode 72/72 → 73/73 (F-1 row) | writeTvMode private helper; applyTvMode + probeTvModel both carry the var; 7 exports held |
| 1.2 .tv calc wraps (×dpr era) | 10d1391 | tvCssContract 10/10 + density 20/20 | SUPERSEDED by 1.4 — see amendment below |
| 1.3 icon swap | 45a5a50 | Sidebar 13/13 + negative grep | Settings2 → Settings classic gear |
| 2.1 dist regen ×3 | 53f7ce5 / ac7112b / 292d159 | duty chain green each | every run red+green journaled; api delta EXACTLY zero across the whole change range |
| 1.4 amendment (÷dpr law) | a00caa9 | tvCssContract 10/10 + density 20/20 | the shipped law — see below |
| git-check | (close push) | — | change folder + archived delta committed + pushed |

## The field-driven amendment (task 1.4) — record per reviewer must-list
The first-deployed ×dpr whole-clamp MULTIPLY law (commits 10d1391/53f7ce5, GATE 2 PASS + F-1/S-1 fixes c05a9fc/ac7112b) was field-tested on the operator's TV: verdict "scale too much — a TV layout should show MORE elements". The formal amendment path ran: task 1.4 authored (new task id per the drift gate), spec delta + design.md D2 + goals rewritten to the DIVISION law (d8b80cc), validate --strict rc 0, re-register clean, coder applied + verified, dist regen re-run (third, 292d159), reviewer addendum PASS, redeploy, operator device approval ("density look good" + gear confirmed). Deployed bundle: JS index-DbTjQiOg.js / CSS index-DhEXl287.css — 8 division forms, zero multiply forms, live-probed on alatoic.

## Why division and not multiplication
The px clamp legs are readability floors in CSS px: at a higher dpr the same physical minimum is FEWER CSS px, so floors divide. Fraction legs (vw/vh) were always physically dpr-invariant and must stay raw — multiplication scaled them too and doubled the whole UI past the designed density. At the operator's 960×511 dpr-2 box: root type resolves the 1.05vw fraction (≈10.08 CSS px), trigger 2.5vw (24 CSS = 48 physical ≥ the 40px hit target), outline 0.2vw. The content cap min(92vw, 1800px) stays raw — its px term is a layout cap, never divided.

## Gate record
review.md (in this folder): GATE 2 PASS — original review (F-1 exact-fraction fix + S-1) + amendment addendum PASS; human archive approval recorded as the operator's on-device field verdict after deploy-before-archive.

## Docs + follow-ups
- Living spec Purpose amended at close: "every size derives from the reported CSS viewport" → the ÷dpr physical law (matches the merged requirement).
- Known docs debt untouched (api-reference, project_structure) — the queued dedicated docs pass owns them; this change touched no Go source.
- Open adjacent problems (NOT this change's scope): the D-pad pointer-emulation gap on YaBrowser TV lite (recorded at .tmp/dpad-pointer-emulation-problem.md in the tv-mode worktree — walker can never engage in THAT browser; key-capable TV browsers recommended); TV 403s on /api/v1/series/{id}/posters (device-token scope, own future change).
- Tuning seed: the density constants are parameters — if another box reports a different shape, the fraction constants (1.05vw root, 2.5vw triggers) re-derive visually, never by law change.
