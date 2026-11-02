# Gate record — tv-dpr-scaling

## GATE 2 verdict

**PASS — Approved** (reviewer, 2026-11-02, two passes: original ×dpr shape + amendment addendum).

- Original review: all four duties re-run green (1.1 tvmode 72/72 → 73/73 after F-1 fix; 1.2 tvCssContract 10/10 + density 20/20; 1.3 Sidebar 13/13 + negative grep; 2.1 red+green journaled, api delta exactly zero). Full-suite anchors: go test ./... rc 0, web vitest 42 files 608/608, tsc --noEmit rc 0. Diff vs delta conformant except F-1 (writeTvMode Math.floor vs the exact-value design law) → fixed in c05a9fc (exact fractional value + dpr 2.5 test row; S-1 comment fix same commit). Verdict after fix: PASS.
- Amendment addendum: PASS. Field verdict ("scale too much — should show more elements") drove task 1.4 (a00caa9): wrap law inverted to per-leg ÷dpr floors, max-width reverted raw; delta/design/tasks amended (d8b80cc), validate --strict rc 0, re-register clean (6 tasks); dist regen re-run red+green (292d159, JS index-DbTjQiOg.js / CSS index-DhEXl287.css, 8 division forms, zero multiply, api delta zero). dpr-1 byte-identity confirmed under division. The ≥40px card-action hit target now reads physical px under the law (48 physical at dpr 2).
- Post-amendment freshness: 1.2 re-verified green by the reviewer-role receipt (30/30) after the amendment.
- Both strict validations rc 0 ("Change 'tv-dpr-scaling' is valid").

## Human archive approval

**Approved — operator, 2026-11-02, after on-device verification** (deploy-before-archive ordering, operator-directed): the ÷dpr build (index-DhEXl287.css) was deployed to alatoic, live-probed (8 division forms served, zero multiply, health 200), and the operator confirmed on the TV: "yes, now density look good" — that field approval is the archive approval. The gear icon swap was also confirmed on device.
