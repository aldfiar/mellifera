== coder ==
status: done
updated: 2026-10-23T19:21:37.768496Z
summary: F1 fixed: handle401 rotation is credential-aware — an admin-credentialed 401 (admin token in storage) rotates to /login unchanged; a 401 with NO admin token in storage (device-only/unauthenticated posture) clears the device credential and rotates to '/' so RootGate re-mounts PairingEntry (redirectToLogin -> redirectTo(path) chokepoint, comments aligned). PairingEntry 401 test rewritten: asserts the real navigation target (device leg -> '/', admin leg -> '/login') instead of asserting the entry stayed rendered. Tick 3.4 + 3.3 re-claimed with receipts; full web suite 18 files / 254 tests green; dist rebuilt (index-Kk-nqa_Y.js), reproducibility duty green, dist staged (no commit).
next: re-verdict on F1
