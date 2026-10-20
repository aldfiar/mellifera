# Spec Delta

## MODIFIED Requirements

### Requirement: Derived pending work set
The queue SHALL derive pending `(item, plugin)` tasks from existing data — the item row, the module bindings EFFECTIVELY ENABLED for the item's library (the binding's configured enabled flag AND the operator's module- and library-scope gates resolved per row), absent `sources.<plugin>` document namespaces, and the ledger — with no queue, claim, or lease table. Derivation SHALL skip pairs whose ledger `next_eligible_at` is in the future, and a cleared ledger row SHALL make its pair derivable again.

#### Scenario: Done and cooling pairs are not re-derived
- **WHEN** derivation runs against an item whose `tv-parser` namespace exists and a pair whose ledger cooldown has not elapsed
- **THEN** neither pair is enqueued; only sources with absent namespaces and no active cooldown are derived as pending

#### Scenario: A gated source is not derived

- **WHEN** derivation resolves the bindings for a row whose library carries a module-scope disable for one plugin and a library-scope disable for another
- **THEN** both gated sources are absent from the resolved set — no pair is enqueued for either, their document namespaces are untouched, and ungated sources derive exactly as before

<!-- wf:probe id=bae8da0f439049f0 -->
```bash
set -e
go test ./internal/enrich -run TestGateResolution -count=1
```
<!-- /wf:probe -->

## ADDED Requirements

### Requirement: Operator source gating wakes derivation

Setting a gate (module scope or library scope) to enabled SHALL wake derivation
for the affected libraries through the queue's existing `Notify` — no rescan,
no new lifecycle transitions, no stored-state rewrite; rows already carrying
the source's namespace SHALL derive nothing. Disabling a source SHALL wake
nothing. Drain and settle SHALL consume ONE gate resolution per (pass, row): a
gate flip landing mid-drain SHALL NOT flip the settle verdict until the next
pass, and the extras' synthesized default bindings SHALL pass through the same
resolution as configured ones.

#### Scenario: Enable wakes derivation without a rescan

- **WHEN** a disabled source is re-enabled and the queue wake runs
- **THEN** rows lacking the source's namespace derive it through the normal chain with no scan call, and rows already carrying the namespace derive nothing for that source

<!-- wf:probe id=de17e2ba196a1bbf -->
```bash
set -e
go test ./internal/enrich -run TestGateDerivation -count=1
```
<!-- /wf:probe -->

#### Scenario: Drain and settle share one resolution per pass

- **WHEN** a gate disable lands between a row's drain decision and its settle check within the same pass
- **THEN** the pass settles on the resolution taken at drain — the row is not re-queued for the source mid-pass — and the flip takes effect on the next pass

<!-- wf:probe id=2ba564501bad907f -->
```bash
set -e
go test ./internal/enrich -run TestSettleGateParity -count=1
```
<!-- /wf:probe -->

#### Scenario: Disable wakes nothing

- **WHEN** a source's gate flips to disabled
- **THEN** no derivation wake is scheduled by that write and no pair for that source enters the queue; the source becomes dormant on the next wake some other event causes

UNPROBEABLE — negative wake-absence over async timing is a judgment call, not
machine-checkable in a probe; accepted at review inspection.
