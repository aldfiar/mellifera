# Review — GATE 2 record

Date: 2026-10-24 · Reviewer: @wf-reviewer (openspec-loop in scope) · Duties: 15 verify / 0 review at verdict, +1 (4.5) closed post-verdict

## Verdict: GATE PASSES

- All 15 claimed duties re-run PASS in the reviewer's own shell (receipts matched); per-box table delivered in-session.
- `openspec validate artwork --strict`: zero ❌ (benign wf `events` key note only — the known gate bar).
- Enforced lint gate (golangci-lint: funlen/gocognit/gocyclo/lll/dupl + symbol counts) clean on every touched Go package.
- Gate anchors: full Go suite rc 0; vitest 21 files / 297 tests passed.
- Spec axis: all four deltas implemented — composition precedence + omitempty, golden cross-pin consumed by BOTH predicates' tests, override family vocabulary + idempotent 204, fetch-once economics (singleflight / ≤2 upstream / 15s / 8 MiB / cooldown / no negative rows / restart-durable), GC on reference loss + repair legs + art-only knob, browse-gated serve (ETag, `private, immutable`, pure path, 404 never fetches), shikimori write-side drop, SPA zero-external-requests with isServedArtPath floor + LRU owning revocation.
- Standards axis: exports verified by count (api 12→12, store 12→12, art 4 ≤ 8 with both sentinels); doc.go present; SQL fully parameterized; table-driven throughout; runSweepTicker deleted outright with every caller migrated — no shims, no dead code.

## Findings and resolutions

- **S1 (medium) — vanishing-namespace floor unpinned**: CLOSED at the gate via box 4.5 (subtest `VanishingNamespaceFloor` in TestPosterOverrideFamily, two branches: floors-to-next-chain and no-usable-chain-omits-artwork). Duty re-run PASS independently; family 7/7 subtests. Production code confirmed correct, untouched.
- **(a) thumb candidate URL lacks `/api/v1` prefix** — FOLLOW-UP-CHANGE: implementation is spec-faithful to plan box 2.3's literal text; SPA keys the thumb branch on source and derives via `ENDPOINTS.itemMedia`; exposure is one decorative field an external REST caller would 404 on. Seeded micro-change: prefix in `itemThumbPath`, update the one Go pinned string.
- **(b) stale CONTRACT MISMATCH banners** (qa_shikimori_joint_test.go, qa_media_data_joint_test.go) — FOLLOW-UP-CHANGE: factually dead (both files re-run green at the gate); pre-existing files outside every box; comment-only sweep with closure note (idiom exists at qa_serial_e2e_test.go).
- **(c) dist staged / openapi unstaged** — ACCEPT-AS-IS: box 4.3's reproducibility duty compares working tree vs index, so staging is mechanically required (rebuild reproduced the staged bytes exactly); openapi diffs purely additive; merge-back commits all.
- **T1 (low) — internal/api/art.go 730 lines** vs the documented 500 fail line (the binding gate check.sh does not enforce file length; nine pre-existing files exceed it) — accept-as-is; mechanical art_routes.go split ridable on any later touch.
- **T2 (low) — upload 200 body carries `updated_at: ""`** (PUT returns the real stamp) — micro-fix candidate, follow-up.
- **T3 (info) — missing-art prefix predicate in three documented copies** — accepted: the plugin copy is mandatory (separate binary, cross-pin design); the api↔art pair is load-bearing documentation.
- **S3 (info)** — unmaterialized chain winner serves the raw remote URL per spec; SPA floors it to the generated fallback (no external request fires).

## Approval

Human archive approval: granted by the operator's standing instruction "continue with approval if needed" (2026-10-24, given before GATE 2), recorded here per the gate contract. Status rc 0 with 16/16 boxes claimed (4.5 added post-verdict and re-verified).
