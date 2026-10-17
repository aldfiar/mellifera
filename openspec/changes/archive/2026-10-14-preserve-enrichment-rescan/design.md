# Design: preserve-enrichment-rescan

## Context

Verified defect (base a09a268): `persistSeries` → `assembleSeriesDoc`
(internal/scan/run.go) builds a fresh `{parsed, ffprobe}` map every persist
and `PutSeries` upserts `document = excluded.document`
(internal/store/series.go), so series enrichment is wiped on every rescan
while `nextSeriesStatus` preserves only the status column. The item path
persists through `nextScanState`, which carries forward ONLY the prior
document's `streams` when the parsed+ffprobe base is unchanged
(`baseSignature`/`baseChanged`), dropping every other namespace on a base
change. The enrich queue derives `(row, plugin)` work ONLY from ABSENT
`sources.<plugin_id>` namespaces (`pendingSources`, internal/enrich/queue.go)
— so namespace preservation automatically silences re-enrichment; the queue
needs no change. See proposal.md — Why for motivation.

## Goals / Non-Goals

Goals: enriched libraries survive rescans byte-identically (items AND
series); status preserved on any parsed-unchanged rescan; streams still key
on parsed+ffprobe exactly as packaged-playback ships; the three
baseline-failing additive guards re-anchored honestly; joint proof that the
queue derives zero work for preserved namespaces.

Non-Goals (explicitly out of scope — do not build, do not spec): plugin
update / drift re-enrichment (the follow-up change this makes observable);
re-enrichment orchestration or namespace stripping sweeps (reenrich.go is
untouched); any store schema or upsert change; any change to packaged-playback
behavior or its spec; tombstone/sweep semantics (unchanged); backfilling
wiped libraries (a wiped library re-enriches once under today's rules —
acceptable).

## Decisions

### D-1 Two-tier comparison, one signature split

`baseSignature` stays the parsed+ffprobe basis (tier B, streams); a new
parsed-only signature (`{"parsed": doc["parsed"]}` through the same
`canonicalJSON` byte-compare) is the tier A basis (status + enrichment carry).
Both run over the prior document vs the refreshed base; a field absent from
either side counts as changed (today's vanishing-field rule). Alternatives
rejected: comparing parsed+ffprobe for enrichment carry (mass-wipes
enrichment on scanner toolchain drift — the defect class this change kills);
per-namespace hashes (over-engineered — namespaces are carried verbatim, not
individually judged).

### D-2 Carry = prior document minus reserved keys, not an enumerated list

Tier A carry = every prior-document key EXCEPT `{parsed, ffprobe}`; tier B =
except `{parsed, ffprobe, streams}`. Generic subtraction is lossless and
needs no enumerated namespace list in code (INV-namespace guarantees the
non-base keys are exactly the derived state: `sources.*` per plugin,
`_provenance`/`_view`/`_stages` core-stamped, `identifiers` from Match,
`streams` from the pack lane). The spec text enumerates the known namespaces
for readability; the code stays key-set-driven so a future derived namespace
is preserved without a code change. The freshly assembled base ALWAYS wins
for `{parsed, ffprobe}` (the new scan's facts are the new truth — stale
anchors must never mask a real identity change).

### D-3 Status decisions keep their shape, keyed on the narrower basis

Tier A and tier B both preserve the prior status (a `ready`/`enriched` row is
never regressed by ffprobe noise); the `deleted → ready` self-heal fires on a
parsed-unchanged re-observation under either tier; a parsed change advances
`stale` exactly as today. `nextSeriesStatus` becomes `nextSeriesState`
returning `(status, carry)` — the series mirror of `nextScanState` — so
`persistSeries` can merge the carry; the series' `observed` bookkeeping and
the sweep are untouched.

### D-4 The store is untouched — the merge happens scan-side

`PutSeries`'s `document = excluded.document` upsert is correct once scan
supplies the merged document; `PutItem` likewise. No schema, migration, or
store-contract change; dependency direction unchanged (scan → store only).
This is the minimal-blast-radius shape: the defect lives in what scan
assembles, so the fix lives there too.

### D-5 Doc-comment honesty in the same stroke

`assembleSeriesDoc`'s "identity/lifecycle live in the series row's columns,
not duplicated into the opaque document" comment is amended: identity still
lives in columns; DERIVED state is now preserved in the document across
rescans. `persist`'s and `nextScanState`'s carry-forward comments are updated
to the two-tier wording. Comment-only, no behavior.

### D-6 Guard re-pin: f2dc2e8, the split root, per-guard semantics intact

The three guards pin umbrella-era SHAs whose trees predate the 2026-10-14
subtree split (the project lived under `mellifera/`), so
`git diff <pinned> HEAD -- proto/` reports all-insertions. All three re-pin
to `f2dc2e8` — the split repo's first commit, the earliest tree with
root-level `proto/`, and byte-identical in `proto/` through HEAD (verified:
`git log f2dc2e8..HEAD -- proto/` is empty) — which preserves each guard's
intent ("no proto change since the last sanctioned proto change") at the
closest honest baseline. Per-guard comments are updated to name the split
baseline and why the old SHA cannot work. Verification discipline: each
guard runs green after the re-pin, and the bite is demonstrated WITHOUT a
violation commit — `git ls-tree f2dc2e8 -- proto/` shows the diff target is
non-trivial, and a temporary working-tree edit under `proto/` (reverted
immediately, never committed) shows `git diff --name-only f2dc2e8 -- proto/`
reporting it, proving the mechanism detects change against the new pin.

### D-7 Joint QA rides the existing serial harness

`TestRescanPreservesEnrichmentJoint` (new `internal/itest/
qa_rescan_preservation_test.go`, package itest) reuses the shipped patterns:
`buildBinary` + `startServer` subprocess wiring, the `MELLIFERA_SHIKIMORI_UPSTREAM`
httptest stub with recorded requests (the `qa_serial_e2e_test.go` harness —
its recorded-call list doubles as the no-network and request-count proof),
`createLibrary` with `ModuleID: "serial"`, `scanLibrary` for both passes,
`parseAsyncDoc`/`deepEqualJSON` for document comparison, bounded polls for
queue settle. Two subtests: (1) preserve — enrich to `ready`, rescan
unchanged, assert every namespace + `_provenance`/`_view`/`_stages` +
`identifiers.shikimori_id` deep-equal the pre-rescan documents, statuses
still `ready`, stub request count unchanged after the settle window; (2)
re-derive — rewrite one item's bytes so its parsed identity changes, rescan,
assert that item's derived state dropped and re-derived (new stub requests
for it alone) while the other rows kept their carried namespaces. ffprobe-only
drift is covered at unit level (`TestFfprobeDriftKeepsEnrichmentDropsStreams`,
canned Identify results — mechanically injectable there, impractical in the
real-ffmpeg joint harness; the intake allows the unit scenario for this leg).

## Interfaces

Cross-group contracts (signatures only — bodies are implementation):

```go
// internal/scan/run.go — the comparison core (group 2's deliverable,
// group 3's foundation)
func baseSignature(doc map[string]any) map[string]any // kept: {"parsed", "ffprobe"} (tier B / streams)
func parsedSignature(doc map[string]any) map[string]any // NEW: {"parsed"} (tier A / status + enrichment)
func baseChanged(priorRaw json.RawMessage, refreshed map[string]any) bool // kept, tier B semantics
func derivedCarry(priorRaw json.RawMessage, refreshed map[string]any, dropStreams bool) map[string]any // NEW: prior keys minus reserved set

// internal/scan/run.go — the persist-side seams
func nextScanState(ctx context.Context, st *store.Store, libraryID int64, fileID string,
    refreshed map[string]any, res *Result) (string, map[string]any) // was (string, any); carry replaces streams-only
func nextSeriesState(ctx context.Context, st *store.Store, libraryID int64, rel string,
    refreshed map[string]any, res *Result) (string, map[string]any) // was nextSeriesStatus (string,); + carry
// persist / persistSeries merge: for k, v := range carry { base[k] = v }
```

Dependency direction unchanged (web → api → scan → enrich → store): the
carry flows scan-internally from the prior-row read to the document merge;
no new imports anywhere. `internal/enrich` and `internal/store` are
call-side unchanged.

## Risks / Trade-offs

- [Tier B mass-drop misread: an ffprobe-noisy scanner would drop streams on every rescan] → tier B is byte-identical to today's packaged-playback comparison (`TestRescanCarryForward` stays green untouched); no widening, no narrowing of the streams key.
- [Generic carry preserves an unexpected junk key] → INV-namespace already constrains writers to `sources.<id>` + the core-stamped namespaces; the carry is the same trust the store's opaque-document contract already grants.
- [Carry masks a real plugin upgrade] → out of scope by design: drift re-enrichment is the follow-up change; this change makes it OBSERVABLE (preserved namespaces = zero derived work, verifiable via the stub count).
- [Guard re-pin anchors too weakly (a future sanctioned proto change should re-pin again)] → same maintenance property the guards always had; the comments now say what the pin MEANS so the next re-baseline is honest.
- [Itest flakiness on queue settle windows] → bounded polls with generous timeouts, the shipped `qaSerialDrainTimeout` pattern; probes hard-require ffmpeg so a missing-tool host fails loudly instead of skip-passing.

## Migration Plan

Pure scan-side behavior: no data migration, no wire change, no rollback
surface beyond revert. Existing enriched libraries keep their (wiped) state;
the NEXT scan after this change preserves whatever enrichment exists at that
point. At landing: docs source-map regen per project convention; OpenAPI/web
dist untouched (no api/web surface in this change).

## Open Questions

None — the two-tier semantics, the streams key, and the guard re-baseline
were all pinned by the user-arbitrated review; the packaged-playback no-delta
reading was verified against the living spec text.
