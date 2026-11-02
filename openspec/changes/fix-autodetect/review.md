# GATE 2 Review — fix-autodetect

Reviewer: @wf-reviewer, 2026-11-02. Verdicts below are from evidence re-derived in the reviewer's own shell, not from the receipts.

## Re-verify (duties re-run)

**PASS** — `wf pipeline verify fix-autodetect 1.1 --by wf-reviewer` rc 0 (vitest src/lib/tvmode.test.ts: 57/57, 744ms); `wf pipeline verify fix-autodetect 1.2 --by wf-reviewer` rc 0 (13.6s: `make web-build` regenerated, clean-tree assertion held on the fresh rebuild — regen is byte-identical, JS hash stayed `index-B2SO7dwH.js` — and `go build ./...` green). Receipts journal holds the full history: 1.1 rc 0 (wf-coder), 1.2 rc 1 then rc 0 (wf-coder, first-red journaled as reported), plus both reviewer re-runs rc 0.

## Full-suite anchors

**PASS** — `go test ./...` rc 0 (all packages ok; internal/itest 248s, internal/web 0.37s). Full web suite: `npx vitest run` — 41 files / 586 tests, all passing (baseline 41/578 + 8: tvmode.test.ts 52→57, +1 elsewhere consistent with branch state). `npx tsc --noEmit` rc 0.

## Diff vs spec delta (d26d671..19a8497)

**PASS** — delta is exactly 6 files: web/src/lib/tvmode.ts, web/src/lib/tvmode.test.ts, and 4 under internal/web/dist (JS rename, CSS hash swap, index.html refs); `internal/web/api` delta ZERO (zero Go source edits, as claimed).

- **Scenarios hold in shipped code.** Requirement "Spaced Smart-TV variants detect decisively": `/smart[\s_-]*tv/i` (tvmode.ts:47) admits space/underscore/hyphen/none, case-insensitive; a strong hit rules TV outright before any corroboration is consulted (detectTvEnvironment tvmode.ts:83-88). Scenario 1 — REAL_TV_UA ("Smart TV Pro Build/…", YaBrowser TV lite) at dpr-1 1080p zero-touch → true (test row, was the red repro). Scenario 2 — spaced model hint rows green; the async probe inherits the widening through the shared ladder (probeTvModel tvmode.ts:156 re-enters detectTvEnvironment) and stays upgrade-only (tvmode.ts:158 classList.add, never removes). Scenario 3 — `family_widening_stays_narrow`: DESKTOP_UA (no Smart-TV variant, no other strong marker) at full-HD zero-touch → false (no weak token → tvmode.ts:89-90 returns false regardless of shape).
- **Untouched clauses verified untouched.** Weak `\bTV\b` token tvmode.ts:59, corroboration legs corroboratesTvShape tvmode.ts:65-71, override law resolveTvMode tvmode.ts:98-106 — none appear as functional lines in the diff (comment refreshes only). Corroboration remains reachable only through the weak token (tvmode.ts:89-92), so it is insufficient alone — the existing D2 rows still pin it, still green.
- **No-export claim verified.** tvmode.ts exports exactly 7 symbols (TV_KEY, TvOverride, TvEnvironment, detectTvEnvironment, resolveTvMode, readTvOverride, applyTvMode) — unchanged.
- **Bundle carries the widened ladder.** `smart[\s_-]*tv` present verbatim in index-B2SO7dwH.js; no `SmartTV` literal remains; index.html refs point at the new JS + CSS hashes.

## Standards axis

**PASS** — one widened row in the STRONG_MARKERS table keeps the table-driven shape (no new branching, no seam); test additions are output-contract rows, not tautologies (the lookalike-desktop negative fails if the widening over-matches; the family rows fail if it under-matches); the WEAK_TV_UA re-home carries a WHY comment for a real hidden constraint (the spaced string became STRONG post-widening); stale red-by-design comments refreshed as tasked. No dead code, no scope creep.

P3 note (no action): the rebuilt CSS gains exactly one inert Tailwind utility rule `.uppercase` (36 bytes) — the content scanner picked the word up from the new test-row names; no component uses the class (grep: only tvmode.test.ts mentions it). Same pre-existing scanner behavior as the already-present `.lowercase`/`.capitalize`. Explains the CSS hash swap; harmless.

## Strict validate

**PASS** — `npx --yes -p @fission-ai/openspec@1.14.0 openspec validate fix-autodetect --strict` rc 0: "Change 'fix-autodetect' is valid". Zero ❌ failures; the anticipated wf-ledger-key warning did not appear.

## Pending Fixes

- **git-check red by design** (the only red): branch feature/tv-mode is ahead of origin by the 2 fix commits (17d6957, 19a8497) and openspec/changes/fix-autodetect/ is untracked (`git status -sb` evidence). Per the tv-mode gate precedent, the session commits the change folder + pushes at close and greens git-check then. Not a code or spec finding.

## Gate line

**Pending Fixes** — all five review axes PASS; the sole pending item is the built-in git-check, greened at close (commit + push). No FAIL, no FLAG above P3-informational.

## Archive approval

Operator approved, 2026-11-02 ("approve").
