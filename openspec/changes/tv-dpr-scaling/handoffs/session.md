# Session record — tv-dpr-scaling

- GATE 1 approved (operator, 2026-11-02): proposal + design + tasks + spec delta validated strict rc 0 first run. 2 groups / 4 tasks + git-check.
- Field anchor: operator's 4K TV reports CSS viewport 960×511 (YaBrowser TV lite, dpr ≈ 2–4, ~29px chrome) — every .tv px floor binds → desktop-scale rendering. Detection verified end-to-end earlier same day (server-UA meta → tv class ON).
- Key design rulings to carry into apply: density.ts untouched (tv rules provably beat desktop inline styles); poster-grid floor NOT wrapped (fraction leg governs; wrapping inverts max() and breaks two-rows-fit); var REMOVED when tv off; tvmode stays 7 exports.
- Next: apply 1.1 (tvmode --tv-dpr plumbing) → 1.2 (.tv calc wraps + density resolution) → 1.3 (Sidebar icon swap) → 2.1 (dist regen; first-run-red journaled pattern expected).
- After GATE 2 + archive: deploy to alatoic via MELLIFERA_REPO worktree env (established recipe), operator TV look-check.
