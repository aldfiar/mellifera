# Gate record — device-pairing

## Verdict

GATE 2: PASS (@wf-reviewer, 2026-10-23; flipped from FAIL on the strength of the F1 fix).

- All 10 duty verifies re-run by the reviewer in its own shell: rc 0.
- Full-suite anchors at the gate: `go test ./...` rc 0 (21 packages, ~198 s, matches the green baseline); web `npm test` rc 0 (18 files / 254 tests, re-verified post-fix).
- F1 (FAIL → fixed → re-verdict PASS): revoked-device 401 now rotates credential-aware — device-only posture → `/` (RootGate mounts PairingEntry), admin credential → `/login` unchanged; false-green navigation test replaced with real-target assertions; duties 3.4 + 3.3 withdrawn, fixed, re-claimed.
- F2 PASS: prior-principal pass-through in authMiddleware is a test-injector seam, production provably unchanged (unexported key, real-token coverage independent).
- F3 FLAG, accepted: grouped ErrRateLimited/ErrConflict hold the counted export surface at 6; honest surface 8 < 12 fail line; documented in doc.go.
- F4 FLAG, accepted for v1: restart between approve and pickup strands an approved pairing (device re-pairs; never fabricates a credential). Follow-up candidate: TTL backstop or spec note for approved-unpicked rows.
- F5/F6/F7 PASS: no device→admin surface, scope held, out-of-scope fences held (no accounts/groups/auto-approve).
- F8 (process): internal/web/dist staged, not committed — the merge-back commit MUST include it or a fresh checkout's go:embed SPA lacks the panel/entry.

## Approval

Human archive + push approval granted in chat by the operator, 2026-10-23 ("approve, push").
