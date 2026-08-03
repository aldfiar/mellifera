# debug_brief.md — C-01 verification (QA-02)

Feature: async-enrichment (Phase B1) · Branch: feature/async-enrichment · Date: 2026-08-03
Source finding: audit/health_report.md C-01 (P1, origin: feature)
QA verdict: **REAL BUG — confirmed manifesting (P1, non-blocking for the async ACs)**

## Classification

**(B) Impl bug** — but **non-blocking / not HALTING the pipeline**, because:
1. C-01 was already classified by the health-check as a P1 cleanup item (the
   orchestrator delegation asked QA to *verify and report the verdict*, not to halt).
2. No async acceptance criterion is violated: items still settle enriched→ready
   (AC-states(b)), leases/ledger/restart-resume all hold (AC-lease/AC-ledger),
   provenance `sources`/`_provenance`/`_view` are preserved, and the full gate is
   green. Only the `_stages` **audit-history** field degrades on re-derive.
3. The delegation's explicit instruction was "report it as a P0/P1 finding with the
   exact fix" + "DONE QA-01+QA-02" — i.e. report-and-continue, not halt.

Reported here for routing to a fix task (wf-debugger or an
`async-enrichment-cleanup` task). QA did NOT modify implementation code.

## Summary

Two unchecked type assertions `doc["_stages"].([]map[string]any)` (the `, _ :=`
form that discards `ok`):

- `internal/enrich/enrich.go:148` — `appendStage`
- `internal/enrich/worker.go:291` — `attemptedNoWork`

`appendStage` writes `_stages` in memory as `[]map[string]any`, so within ONE
`workItem` pass both assertions succeed. But `persistItem` (queue.go:457) marshals
the whole document (including `_stages`) to JSON, and the next pass's
`decodeDoc` (worker.go:153) unmarshals it back into `map[string]any`. After that
round-trip, `encoding/json` decodes a JSON array as **`[]any`**, NOT
`[]map[string]any`, so the unchecked assertions silently yield `nil`/`false`.

This is **not** "genuinely in-memory-only": `_stages` IS persisted and re-loaded on
every re-derive. A re-derive happens whenever an item with an unavailable queueable
source (no namespace, no ledger row — e.g. the seeded unloaded SERVER `tmdb`) is
re-considered: on a `Start` sweep, a re-`Notify`, or the perpetual re-derivation of
such an item (the derivation predicate re-derives it because the source has no
namespace and is not in cooldown).

## What manifests (verified by runnable test)

Reproduction test: `internal/enrich/qa_c01_stages_roundtrip_test.go`
(`TestQA_C01_StagesRoundTrip`, both sub-tests PASS by pinning the actual behavior).

**Evidence (from the test run):**

1. **Root cause — type mutation.** `json.Marshal` + `decodeDoc` of an in-memory
   `[]map[string]any` `_stages` yields `[]any` (each element `map[string]any`).
   `rt["_stages"].([]map[string]any)` returns `ok=false`.

2. **(a) `appendStage` data loss — MANIFESTS.** On a round-tripped doc,
   `appendStage`'s `existing, _ := doc["_stages"].([]map[string]any)` gets `nil`,
   so `doc["_stages"] = append(nil, stage)` **overwrites** the prior history. End-
   to-end (`workitem_rederive_loses_stages_history`): a `ready` item persisted with
   `_stages=[tv-parser:ok, tmdb:unavailable]`, after one `workItem` re-derive pass,
   has its `tv-parser:ok` audit entry **DROPPED**; `_stages` collapses to the single
   freshly-appended `[tmdb:unavailable]`. This is a real "precision preserved" /
   audit-history breach that recurs on every re-derive.

3. **(b) `attemptedNoWork` — LATENT (fragile).** On a round-tripped doc,
   `attemptedNoWork` returns `false` (cannot read the stage). It does **not** strand
   items today because `driveSources` *re-runs* every queueable source with no
   namespace + no cooldown each pass, recording a fresh `[]map[string]any` stage that
   `attemptedNoWork` then reads correctly within the same pass. So settle
   (enriched→ready) still works. But the assertion is incorrect for round-tripped
   data: any future change that skips re-running known-unavailable sources would make
   `attemptedNoWork` return `false` and strand the item at `enriched`.

This refines the health-check's hypothesis ("could strand a non-ready item"): the
**stranding** is latent; the **data loss** is the manifesting symptom.

## Expected vs actual

- **Expected (correct):** after a store round-trip, `_stages` is read back in a form
  `appendStage`/`attemptedNoWork` can consume — history is preserved across
  re-derives, and `attemptedNoWork` observes prior-pass stages.
- **Actual:** `_stages` decodes to `[]any`; `appendStage` drops history; the
  `_stages` audit trail erodes to "last pass only" on every re-derive.

## Recommended fix (exact)

Close both sites at the source — normalize `_stages` when the document is decoded,
so every reader sees the in-memory form. In `decodeDoc` (worker.go:153), after
`json.Unmarshal`, coerce `_stages` (and defensively `sources` is already handled by
`hasNamespace`'s `map[string]any` assertion, which is fine because object values
decode to `map[string]any`; only array-of-objects decodes to `[]any`):

```go
func decodeDoc(raw json.RawMessage) map[string]any {
    if len(raw) == 0 {
        return map[string]any{}
    }
    var doc map[string]any
    if err := json.Unmarshal(raw, &doc); err != nil {
        return map[string]any{}
    }
    normalizeStages(doc) // _stages decodes to []any; coerce to []map[string]any
    return doc
}

func normalizeStages(doc map[string]any) {
    raw, ok := doc["_stages"]
    if !ok {
        return
    }
    arr, ok := raw.([]any)
    if !ok {
        return
    }
    out := make([]map[string]any, 0, len(arr))
    for _, e := range arr {
        if m, ok := e.(map[string]any); ok {
            out = append(out, m)
        }
    }
    doc["_stages"] = out
}
```

Alternative: assert `[]any` and convert per element at each read site
(`appendStage` + `attemptedNoWork`). The `decodeDoc` normalization is preferred —
one site, both readers fixed, and `enrichDoc` (sync path) is unaffected (it only
runs in-memory).

When the fix lands, flip the assertions in
`internal/enrich/qa_c01_stages_roundtrip_test.go`: round-tripped `_stages` should be
readable, `attemptedNoWork` should return `true` for a round-tripped unavailable
stage, and `appendStage` should preserve history (len grows, not resets).

## Scope / risk

- Pure additive fix in `decodeDoc` (+ the new `normalizeStages` helper). No schema
  change, no new dep, no behavior change to the in-memory/sync path. The
  `normalizeStages` helper is unexported (no exported-symbol budget impact).
- Does not touch proto/SDK/plugins/API (AC-3 additive surface) — stays green.
