# tv-style-parity — close-out (2026-11-20)

Slice C of the web↔TV parity design (draft: android-tv-app worktree .tmp/android-tv-web-parity-design.md). Android-only style parity: S-1 token surface, S-2 missing-artwork fallback, S-3 typography, S-4 chips + skip-fade repair, S-5 geometry ÷2 repairs, S-7 slate focus ring, S-8 home chrome + tile clipping. S-6 closed documented-deliberate (operator's 2026-11-16 fixed-3 ruling stands). Stacked worktree: branch feature/tv-style-parity @ base f6ae4c4 (feature/android-tv-app, PR #41 open).

## Final receipt summary (13/13 authored green + git-check)
1.1 token home+absorption (rc0 ×4: coder, reviewer ×2, B10-round re-run) · 1.2 muted sweep ×12 sites (rc0) · 1.3 state-signal restyles (rc0) · 2.1 fallback law + goldens cross-derived from SPA (rc0, @qa) · 2.2 fallback call sites (rc0; one red on the way — vararg overload — fixed, re-run) · 3.1 type-scale repairs + pairing mono (rc0; first launch died on a 429 usage window pre-edit, fresh relaunch) · 3.2 weights+clamps ×8 sites (rc0) · 4.1 pill chips (rc0) · 4.2 player pastels + Animatable fade (rc0; one red on the way — tween Long→Int — fixed) · 5.1 parity constants (rc0) · 5.2 geometry call sites ×7 (rc0; three rc2 pre-run refusals = cwd-class, no receipts journaled) · 6.1 home chrome + clips (rc0) · 7.1 slate focus ring + dpr-clamp law (rc0, @qa).

## Gates
- GATE 1: PASS. Surveyor: 6/6 areas PASS, 40-node graph, 7 questions — all ruled "as recommended" by operator; amendment + confirmation sweep landed; frontier empty.
- GATE 2: PASS round 3. R1: 9 comment-vocabulary blockers (B1–B9) — all reworded; R2: B1–B9 satisfied + B10 caught (typeAccent KDoc stale bar claim) — fixed; R3: PASS. Spec axis green all rounds (26 scenarios evidenced). Full record: review.md (three-round audit trail).
- Full-suite anchor: Android JVM green (change surface); web vitest green; Go suite 1 PRE-EXISTING FAIL — internal/itest TestPairingJointFlow: device row carries the `debug` column (added by the base branch's own device-debug work) vs the itest's exact-shape assertion; failed identically at baseline f6ae4c4. Zero relation to this change (no Go edits). FOLLOW-UP: one-line assertion fix on the PR #41 branch line. Baseline disclosure correction: the original baseline report said "all green" — the Go FAIL was tail-masked; corrected here.

## Residues (P3, non-blocking)
- Dead `accent: Color` param threading in InProgressBar (contract pinned no signature changes).
- RailRow slate fill as contract-pinned literal #1E293B (distinct provenance from inProgressTrack).
- Active-chip border stays railBorder in both states (SPA .chip-active flips border to primary).
- RingSlate #CBD5E1 private in Focus.kt — promotion into Colors.kt token home = one-line follow-up.
- Pre-existing id-citation comment debt on untouched lines (App.kt header, BrowseFlow/PlayerScreen bodies) → /audit dedicated comment pass.
- Machine-page regen REFUSED on the known `# Mellifera — Project Structure` unrecognized-heading schema issue (same as main repo) — real drift queued behind it (new files, stale counts, latest-archive stamp).
