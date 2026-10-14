# Proposal: preserve-enrichment-rescan — a rescan stops wiping per-plugin enrichment

## Why

Every rescan of an enriched library silently destroys its enrichment. The
series path (`persistSeries` → `assembleSeriesDoc`) builds a fresh
`{parsed, ffprobe}` document on every persist and `PutSeries` upserts
`document = excluded.document`, so identifiers and every namespace are wiped
while only the status survives; the item path carries forward ONLY `streams`
on an unchanged base. Enriched libraries therefore lose their anchors
(`sources`, `_provenance`, `_view`, `_stages`, `identifiers.shikimori_id`) on
every scan and re-enrich from upstream — invisible cost today, and it makes
the planned plugin-update / drift re-enrichment work (follow-up change)
unobservable.

## What Changes

- **Two-tier unchanged test** in the scan core replaces the single
  parsed+ffprobe stale comparison as the carry-forward basis. Tier A —
  `parsed` unchanged: the prior document's ENTIRE derived state (every
  namespace outside the identity base: `sources`, `_provenance`, `_view`,
  `_stages`, `identifiers`, `streams`) is carried forward verbatim and the
  prior status is preserved. Tier B — `parsed` unchanged but `ffprobe`
  changed: status preserved, derived namespaces carried, `streams` dropped
  (nil) so changed media repackages; the ffprobe blob itself refreshes
  verbatim. `parsed` changed: today's stale semantics, unchanged — all
  derived state drops and the row advances `stale`. Rationale: the verbatim
  ffprobe blob flips on scanner toolchain drift (new keys, re-serialized
  floats, `creation_time`), so keying enrichment carry on it would mass-wipe
  enrichment on scanner upgrades.
- **Items AND series get the carry.** Items today carry only `streams`
  (packaged-playback D-11); series never carried anything. Both paths merge
  the carried namespaces into the freshly assembled base document before the
  store upsert — the store stays value-agnostic, no `PutItem`/`PutSeries`
  change.
- **packaged-playback is untouched.** Its re-scan SHALL pins parsed+ffprobe
  ONLY for the streams carry; tier B keeps that comparison byte-exact, so
  streams behavior is unchanged end-to-end (verified against
  `openspec/specs/packaged-playback/spec.md`, "Packaged state survives
  re-scan" — no delta).
- **Stale trigger narrows to parsed identity** (spec-level): ffprobe-only
  drift no longer advances a row to `stale` — status and namespaces survive.
  The doc comment on `assembleSeriesDoc` ("identity/lifecycle live in the
  series row's columns...") is amended: identity still lives in columns;
  DERIVED state is now preserved.
- **Baseline hygiene (pre-existing, disclosed):** three additive-contract
  guards FAIL at base a09a268 —
  `TestWeb_Integration/ac7_gates`, `TestB2_Ac3Additive`,
  `TestQA_AdditiveContract_ProtoAndDepsUnchanged` — because they pin
  umbrella-era SHAs (58a1130, 7bcc6c9, e2a7562) whose trees predate the
  2026-10-14 subtree split, so `git diff <pinned> HEAD -- proto/` shows
  all-insertions (13 files, +4057). Each guard's pinned base is re-pointed
  to the split-repo root f2dc2e8 (proto/ is byte-identical from f2dc2e8
  through HEAD — no sanctioned proto change since the split), with honest
  per-guard comment updates; no vacuous-constant gaming.

No **BREAKING** changes: no wire, schema, or store-contract change; behavior
strictly preserves more state than before.

## Capabilities

- **New Capabilities**: none.
- **Modified Capabilities**:
  - `scan-library` — ADDED requirement "Enrichment namespaces survive
    re-scan": the two-tier item carry contract (tier A verbatim carry +
    status preserved; tier B carry minus streams; parsed change drops all)
    plus the joint rescan-preservation scenarios.
  - `serial-library` — MODIFIED requirement "Series identity and re-scan
    semantics": an unchanged re-scan now carries the series' entire derived
    document verbatim (series never carried anything — the preservation
    behavior is new); stale trigger narrows to serial identity facts;
    ffprobe-only-drift clause added (a no-op for directory-backed rows,
    which persist an empty ffprobe object); the four untouched scenarios are
    copied byte-identically with their probe ids intact.
  - `async-enrichment` — MODIFIED requirement "Lifecycle states ready and
    stale": the `* --stale--> stale` trigger narrows to parsed identity
    change; parsed-unchanged rescans (ffprobe-only drift included) preserve
    status and namespaces.

## Impact

- `internal/scan/run.go` — the comparison core (`baseSignature` splits into
  a parsed-only signature beside the existing parsed+ffprobe base compare),
  `nextScanState` returns the carried derived set (was: streams only),
  `nextSeriesStatus` becomes `nextSeriesState` returning status + carry,
  `persist`/`persistSeries` merge the carry into the fresh base document,
  `assembleSeriesDoc` doc comment amended.
- `internal/scan/carry_test.go`, `internal/scan/series_test.go` — new tier
  tests; `TestSeriesUnchangedRescanPreservesReady` extended to assert the
  document carry.
- `internal/itest` — the three guard re-pins (constant + comment per guard);
  new joint test `internal/itest/qa_rescan_preservation_test.go`
  (`TestRescanPreservesEnrichmentJoint`): real serial-scanner +
  serial-parser + shikimori subprocesses against the
  `MELLIFERA_SHIKIMORI_UPSTREAM` httptest stub (the `qa_serial_e2e_test.go`
  harness patterns), asserting byte-equivalent preservation, still-`ready`
  statuses, zero new stub requests after an unchanged rescan, and
  drop-and-re-derive for a content-changed item.
- `internal/store` — NO change (the merge happens scan-side; `PutSeries`'s
  `document = excluded.document` upsert is correct once scan supplies the
  merged document).
- No web, OpenAPI, or proto impact. Queue behavior is emergent and already
  spec'd: derivation skips pairs whose namespace exists, so preserved
  namespaces derive zero work.
