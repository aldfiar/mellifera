# wf-debugger handoff — fix-poster-legacy-placeholder-backfill

## Root cause (confirmed 2026-10-26, live-verified)

NOT data loss — the art pipeline is healthy. Series docs enriched 2026-10-13/20 (BEFORE the write-side missing-art drop, 4eb1067 2026-10-24) still store `sources.shikimori.poster = https://shikimori.io/assets/globals/missing_original.jpg` for 17/88 series (16/23 in library 2, the actively-used one). Three consistent placeholder filters floor these at compose: write-side `plugins/shikimori/convert.go:191`, settle-side `internal/art/settle.go:69`, read-side `internal/api/art.go:131`. So cards deterministically render the generated fallback; nothing is deleted (65/65 blob dirs + art_fetches rows intact, 0 overrides, GC walk covers all sources.<ns>.poster — internal/art/settle.go:84-127).

"Collected then faded" perception: identify/preview + PosterOverlay show the RAW upstream URL (admin exception, PosterOverlay.tsx:88), while card surfaces compose it away. Secondary real defect: the 17:47 restart flipped the admin token; art-blob fetches absorb 401 silently (web/src/lib/queries.ts:602-605 → null → fallback) while list APIs hard-redirect to Login — during re-login everything looks "cleaned".

Additional gaps: overlay returns `{"current":"","candidates":[]}` for placeholder-only series (indistinguishable from "plugin never ran"); item DTOs (internal/api/handlers.go:1414-1436) never fall back to the series poster.

## First fix step (the repro anchors it)

Task 1.1's verify duty MUST be a test that FAILS on current main: feed settle a stored doc carrying a legacy placeholder poster key and assert the repair strips it (currently it survives) — golden/settle-table test per repo idiom.

## Evidence pointers

- DB (read-only): 88 series docs → 71 real + 17 placeholder poster keys; item docs carry zero shikimori posters by design; art_fetches 71/71 hash-matched; all 65 blob dirs created 16:12:42–16:12:52 (a boot-settle CREATION burst, not deletions).
- Live probes through vite proxy: artwork compose + art serve 200 for healthy series; placeholder series omit artwork correctly.
- Full report: the debugger's hand-back in the session transcript of 2026-10-26.
