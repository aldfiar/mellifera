# Session handoff — tv-style-parity

**GATE 1 approved: 2026-11-26** — proposal approved by the operator with all
recommended answers adopted (surveyor Q1–Q15; Q13 as the canary variant;
residuals R1/R2 folded: 19.1.md Verify carries SeriesGridTest, 17.1 prose
refreshes the :889 KDoc citation). Register: 8 groups / 21 tasks (incl. the
built-in git-check), worktree attached, plan derived from tasks.md.

**Baseline (attributed, green)**: e420ebc + chore `01fe9a4` — go test ./...
rc 0 (29 pkgs; the one pre-existing red, TestPairingJointFlow's exact-4
devices-row assertion vs the device-debug `debug` field, fixed by the chore),
Android JVM gradle suite green.

**Next: task 16.1** (the scale core — everything in G16 hangs off its
getters; 16.5 the probe script runs parallel, it touches nothing Kotlin).

Order notes: BrowseScreen-touching tasks serialize by file exclusivity —
dispatch waves are the session's call; tasks.md group order is the DAG.
Device walks are post-green, session-side over the tv-debug relays, never
duties. Surveyor's remaining gate re-checks live in
handoffs/wf-reviewer.md (Q8/Q10/Q11 landing confirmation, TYPE_ census
re-run after 16.3, Q12 order settlement at 20.1 apply, canary + persist-leg
confirmation at 16.1/18.1 verifies).
