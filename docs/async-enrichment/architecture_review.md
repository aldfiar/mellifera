# Architecture Review — async-enrichment (Phase B1)

> Self-review of the plan against Phase A source. Risk register (R-…) + grounding
> audit (G1/G2/G5) + complexity-budget rationale + Generation Self-Audit. Every
> claim cites `file:line` verified against live source on `feature/async-enrichment`
> (@ `6507277`). No `.source_map.json` exists; all facts transcribed from direct
> Reads (no inference).

## P0 flag (gates auto-APPROVE in auto mode) — RIGHT-SIZING SPLIT

**`feature_too_large: true`.** The enhanced objective bundles async queue + image
media type + EXIF enricher + external TMDB + AuthContext/secrets — a multi-feature
that cannot fit one pass (15-step / 8-AC / symbol gates). The objective explicitly
authorizes phasing. **proposed_split:**
1. **B1 (THIS plan)** — async substrate (derived queue + workers + leases + ledger + retry + serial→async migration + ready/stale). 10 steps, 7 ACs. Uses existing tv-parser; no new plugin/dep/HTTP.
2. **B2** — image media type + pure-Go EXIF enricher (new plugin + dep).
3. **B3** — external TMDB enricher + AuthContext/secrets (real HTTP + rate-limit + cache).

B2/B3 CONSUME the B1 queue unchanged. This split keeps each slice under budget and
shippable. **Decision required at plan-review:** APPROVE-as-is (build B1, outline
B2/B3) / REVISE-the-split / ABORT.

## Risk register

### R-1 Lease race / double-processing — P0 (load-bearing)
**Risk:** two workers enrich the same item concurrently (duplicate namespaces, double ledger writes, wasted RPCs). §4.4's core dispatch invariant.
**Mitigation:** in-memory `leaseMap`, mutex-guarded, **at-most-one-lease-per-item**; `acquire` is atomic under the mutex; lazy expiry checked on every dispatch tick (conventions). Workers claim BEFORE pulling work.
**Verification:** AC-lease — drive ≥2 workers over one item, assert exactly one holds the lease; a killed-worker lease is reclaimed only after expiry; no per-claim ledger write. (contracts `lease`.)

### R-2 Loop-safety / infinite retry — P0 (load-bearing)
**Risk:** a chronically-failing source is retried forever (the explicit §4.4 requirement: "avoid enrichment loops for a failing entity").
**Mitigation:** in-memory exponential backoff ≤ `MaxAttempts` (3) → terminal `exhausted` → `RecordFailure(next_eligible_at=now+7d)` → derivation excludes the pair until eligibility; doubling 7d→14d→28d, cap 365d. Reset-on-success deletes the row.
**Verification:** AC-ledger(a) — fail→backoff→exhausted→ledger→derivation-skip; (b) success-after-ledger→row deleted; (c) restart skips cooldown pairs. (contracts `RecordFailure`/`ClearFailure`.)

### R-3 Restart / resume loses work or re-derives a loop — P1
**Risk:** on core restart, in-memory queue/leases vanish. Either work is lost, OR exhausted pairs re-enter a loop.
**Mitigation:** pending work is RE-DERIVED from `items` (durable); the ledger prevents exhausted-pair re-derivation; only per-session in-memory retry counters reset (a failing entity resumes from its last ledger state). (arch §4.4 crash-safety, `architecture.md:1047`.)
**Verification:** AC-ledger(c).

### R-4 Serial→async migration breaks the plugin contract — P1 (additivity)
**Risk:** the refactor accidentally changes `metadata.v1` RPCs, `sdk.MetadataSource`, tv-parser, or the API.
**Mitigation:** only DISPATCH moves (serial-inline → queue). `enrich.Enrich` preserved (worker-internal). `scan.persist` drops the inline call but keeps Identify+PutItem. No proto/SDK/plugin/API edit (AC-3 negative probe).
**Verification:** AC-3 — `git diff` over `proto/`,`pkg/sdk/metadata.go`,`plugins/tv-parser/` is empty; `Enrich` still present.

### R-5 `POST /scan` backward-compat / timing — P1
**Risk:** clients expecting scan to block until enriched break; or the response shape changes.
**Mitigation:** `scan.Result` shape unchanged (`run.go:36-43`); only timing changes (returns with items `pending`). Progress observable via `?status=`. The serial `Enrich` path is kept (deprecate-don't-delete) for sync/test use.
**Verification:** AC-async — scan returns BEFORE items reach `ready`; ≥1 item `pending` at return.

### R-6 `stale` change-detection basis is thin — P2 (refine)
**Risk:** `stale` (re-scan change → pending) needs a change signal. Full mtime/size tracking is extra scope.
**Mitigation (B1 minimal):** on PutItem conflict, compare the refreshed base document against the prior; if the base identity changed → `stale→pending`. If cheap comparison is insufficient, B1 falls back to re-queuing on re-scan (status→pending); the `stale` transition + literal land in `nextState` regardless (the state exists even if the detection is refined later).
**Verification:** AC-states — `nextState` accepts `*→stale→pending`; a re-scan of a changed fixture emits `stale`.
**Surface at plan-review:** whether minimal `stale` detection suffices for B1 or defers to a follow-up.

### R-7 Worker base reconstruction insufficient for a source — P2
**Risk:** a future source (B3 TMDB) needs richer base than the persisted document carries.
**Mitigation:** B1 reconstructs a minimal `IdentifyResult` (Parsed + MediaType) — sufficient for tv-parser (`parser.go:38`). B3 may re-Identify. (D-Q2, S7.)
**Verification:** AC-1 — tv-parser `Match` succeeds from the reconstructed base.

### R-8 `queue.go` file length / complexity — P2 (budget)
**Risk:** the dispatcher + derivation + dispatch loop concentrate logic in one file.
**Mitigation:** split `lease.go` + `retry.go` out (already in File Map); keep `queue.go` <500 lines (derivation vs dispatch vs worker can split further if needed). `check.sh` + golangci funlen/gocognit gate it.
**Verification:** AC-2 — `check.sh: OK` + lint clean.

### R-9 D-Q1 queueable rule refines arch wording — P1 (SURFACED)
**Risk:** §4.4 literally says queueable iff `auth_mode==SERVER`; tv-parser (empty AuthMode) would be wrongly excluded.
**Mitigation:** decision D-Q1 — queueable iff `!= CLIENT`. Justified by seeded config + objective. **Needs plan-review confirmation** (refines the literal spec; not a contradiction).
**Verification:** AC-1 — tv-parser (empty AuthMode) is queued and drains.

## Grounding audit (G1/G2/G5)

Every MODIFY target verified to exist NOW on `feature/async-enrichment`:
- `internal/enrich/state.go` — `state.go:11-18` (literals), `:51-67` (transitions), `:74` (`nextState`). G2 ✓.
- `internal/enrich/enrich.go` — `:56` (`Enrich`), `:63` (`enrichDoc`), `:111` (`orderedSources`), `:148` (`applyContribution`), `:190` (`hardError`). G2 ✓.
- `internal/enrich/chain.go` — `:49` (`runSource`), `:58-90` (4-RPC), `:104` (`validateNamespace`), `:130` (`failOutcome`). G2 ✓.
- `internal/enrich/doc.go` — `:1-47`. G2 ✓.
- `internal/scan/run.go` — `:57` (`Run`), `:141` (`persist`), `:147` (inline enrich call — the one removed), `:153` (`PutItem`), `:221` (`assembleBaseDoc`). G2 ✓.
- `internal/store/open.go` — `:98-107` (`enrichment_failures` table EXISTS), `:72` (`status` column), `:161` (`ensureItemsStatus` migration model). G2 ✓ — **no DDL needed**.
- `internal/store/items.go` — `:42` (`PutItem` upsert model), `:88` (`QueryItems` parameterized status). G2 ✓.
- `cmd/mellifera/main.go` — `:92-97` (`scanDeps`), `:101-103` (scan closure), `:113` (HTTP goroutine — the only one today), `:127-129` (shutdown). G2 ✓.
- `internal/api/handlers.go` — `:97` (`scanLibrary` blocks), `:120-128` (`listItems`/`?status=`). G2 ✓.
- `internal/module/registry.go` — `:113-120` (`MetadataSourceBinding.AuthMode` EXISTS), `:60-73` (seeded sources). G2 ✓.
- `internal/plugin/manager.go` — `:215` (`MetadataSource` accessor). G2 ✓.
- `pkg/sdk/metadata.go` — `:23-28` (`MetadataSource` interface, 4 unary RPCs). G2 ✓ — **no edit (AC-3)**.

Every claimed caller/importer transcribed from source (no `UNVERIFIED:` token):
- `enrich.Enrich` ← `scan/run.go:80` (`prodEnricher`) — transcribed. ✓
- `enrich.nextState` ← `enrich/enrich.go:121` (`advance`). ✓
- `enrich.runSource` ← `enrich/enrich.go:78`. ✓
- `store.PutItem` ← `scan/run.go:153`. ✓
- `store.QueryItems` ← `api/handlers.go:128`. ✓
- `plugin.Manager.MetadataSource` ← `enrich/enrich.go:29` (resolver type) + `:57` (production wiring). ✓
- `enrichment_failures` table ← NO importer today (unused) — transcribed as "EXISTS, unused" (`open.go:98`). ✓

Patterns cited (G5): store upsert `items.go:51`; mutex-map `manager.go:79`; stream drain `run.go:117`; backoff idiom `lifecycle.go` (exponentialBackoff); soft-fail `enrich.go:52`; go-plugin launch `lifecycle.go:245-266`. **No plan element lacks a source citation.** Zero `UNVERIFIED:`/`UNCERTAIN:` tokens.

## Complexity-budget rationale

A meaningfully simpler design? The considered alternative was a **separate durable queue/lease table** (claim→complete→refresh writes). Rejected: §4.4 explicitly decides against it (single-source-of-truth, near-zero write amplification), and it would add DDL + write churn the derived model avoids. The derived-queue + in-memory leases + rare-ledger-write is the SIMPLER design that still meets every AC and extends the existing `items`/`enrichment_failures` tables (no new table). Resolution order honored: existing convention (Phase A `items.status` + the pre-created `enrichment_failures` table) > arch §4.4 canonical > Go channel/worker-pool idiom. No novel abstraction introduced.

## Generation Self-Audit

- [x] Every MODIFY file → ≥1 seam with non-empty After + Contract + evidence (integration_map S1–S9; `open.go`/`registry.go`/`api` carry explicit `no_seam` reasons).
- [x] Every seam → one owner task + one joint test (Coverage Matrix populated with owner-task + joint-test + ACs).
- [x] Every task → precondition + postcondition + allowed_imports + an AC trace (contracts `§Interface Contracts`; Step Outline traces `(AC-N)` per step; imports map per module).
- [x] Every `## Foundational Setup` item → an emitted task or an explicit precondition fold (table: fold→step 2 / fold→step 8 / fold→step 7; "no new deps", "no migration", "no Makefile change" are explicit non-items).
- [x] **No `UNVERIFIED:` token remains** in the final plan (grounding audit confirms zero).
- [x] Step Outline ≤15 (10 steps); ACs ≤8 (7); enrich 3→7 exported (≤8); store 4→5 (≤8) — all under gate.
- [x] P0 phasing split documented (`feature_too_large: true`, proposed_split) — gates auto-APPROVE, forces a human decision at plan-review.
- [x] Load-bearing risks flagged (R-1 lease race, R-2 loop-safety, R-3 restart) with verification per AC.
