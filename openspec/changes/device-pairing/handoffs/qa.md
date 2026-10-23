== qa ==
status: done
updated: 2026-10-23T18:43:57.455576Z
summary: box 4.1 claimed: internal/itest/qa_pairing_joint_test.go (TestPairingJointFlow) — Tier-1 joint over real store+pairing.NewService+api.New+web.Handler, zero mocks; walks unauth POST /pair (exact {pairing_id,code} wire, 128-bit hex id, 8-glyph TV code) -> admin pairings list by code -> approve 200 -> wait poll token pickup EXACTLY once (second poll exactly {status:consumed}, no token key, INV2) -> device token browse 200 (playback direct/none via real Describe) + POST /libraries 403 -> admin devices list (exact {device_id,code,created_at}, INV3 no token) + DELETE 204 -> same browse call 401 -> committed openapi.json carries all 7 pairing paths. duty.verify exit 0 in 1697ms. No deviations; scope = the one file.
