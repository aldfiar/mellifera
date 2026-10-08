# Gate record — serials-library

## Reviewer verdict (GATE 2)

@wf-reviewer, 2026-10-08: **PASS — Approved.**

- Probes: 26/26 re-run from the spec delta, all exit 0 (fresh `-count=1` controls over the touched packages; joint e2e 8/8 with real plugin subprocesses + real ffprobe/ffmpeg).
- Per-requirement: 13/13 PASS (seed, discovery, sidecars, file-backed serials, series storage, identity/rescan, series enrichment, episode enrichment, frame-grab, queue/ledger, API surface, additive posture, Unicode-first-class).
- The two mid-apply product-bug fixes (`b431abe` — facts-registry FIFO for file-backed serials; `utf8.RuneCountInString` for non-ASCII episode queries) judged **correct and complete** against the scenarios they serve.
- Guard re-baselines (`020ab55`: ac7_gates, TestB2_Ac3Additive, INV4 keyset) judged honest — no assertion weakened beyond the documented spec'd changes.
- Standards axis: check.sh OK (lint + symbol budgets), go vet clean, Apache-2.0 headers on all new files, no media-type literals in scan/enrich, additive posture holds (`proto/`, `pkg/sdk`, base-scanner/tv-parser/image-enricher, web/src diffs empty across the range).
- No UNPROBEABLE scenarios in the delta; the one `[unprobeable]` box (5.3 close-out) confirmed by inspection.

## Session check re-derivation

- All 26 probes re-extracted from `specs/serial-library/spec.md` by the session and re-run: 0 failures.
- `openspec validate serials-library --strict` → valid.
- `make build && make check && make test` green (16 packages, check.sh OK).

## Human archive approval

Approved by the operator, 2026-10-08 (structured gate question: "Archive now").
