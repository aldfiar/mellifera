# Design: enrichment

## Context

The design input is the verified draft `.tmp/shikimori-design.md`
(three-branch design-it-twice, reviewer verdict HOLDS, 2026-10-13),
re-grounded against the working tree at propose time: every cited pin was
re-verified (chain.go fetch stub + AuthContext site + namespace
validation, queue.go Start/knownLibs/persistRow/reengage/settle + the
four namespace-gate sites, worker.go terminalCooldown + driver gate +
settlement gate, state.go transitions (no ready/enriched → pending
today), ledger.go ClearFailure/ListFailures, open.go identifiers
generated columns + title_overrides, parsers.go write-only attach,
router.go nil-safe Deps pattern, request_spec.proto min_interval_ms +
redacted_ref, metadata.proto existing_ids + raw_response fields,
registry.go tv upgrade precedent + tv display keys + serial seed at v1,
backlog.md fresh-boot entry). Resolved constraints carried from the
draft: D1 server-side fetch (mode A only), D2 serial module only,
D3 opt-in version re-enrichment, D4 anonymous MVP, D5 wholesale replace
of `sources.shikimori` with TitleOverride untouched, C1–C8 standing
constraints (typed capability routing; no queue table — work derived
from rows+namespaces+ledger; namespace isolation with core-authoritative
`_provenance`/`_view`; api→enrich via cmd closures only; additive
contracts; portability; soft-fail + ledger loop-safety; media-type
agnostic core).

## Goals / Non-Goals

Goals: one external anime source end-to-end on the existing plugin
contract; re-enrichment as predicate-input reset (no new trigger
machinery); the id/pacing/failures gaps closed for every future source.

Non-Goals: client-held creds (Mode B), OAuth, TMDB/B3, film module seed,
SPA admin UI, per-row job tracking, `_stages` compaction, the
derive-verdict refactor (the four gate copies stay; they are consistent
under purge semantics).

## Interfaces (cross-group)

- **Plugin RPC (group 1 ↔ 2):** unchanged four-RPC
  `sdk.MetadataSource`; the change starts populating
  `MatchRequest.existing_ids` (from `doc.identifiers`) and
  `ConvertRequest.raw_response/http_status/response_headers`, and reads
  `RequestSpec.method/url_template/headers/body/timeout_seconds/
  min_interval_ms/variables` — all existing proto fields, proto 0.
- **Fetch gate (group 2 ↔ 5):** a gate type in
  `internal/enrich` (`map[pluginID]lastSend` + mutex + injectable
  clock), exported as `FetchGate` + `NewFetchGate()` so cmd can
  construct it; injected as a queue/orchestrator `Deps` field; cmd
  builds it with the real clock and passes it at wiring.
- **Re-enrichment (group 3 ↔ 4 ↔ 5):** `Queue.ReenrichSource(ctx,
  libraryID int64, pluginID string, rowIDs ...string) (stripped, deferred
  int, err)` — rowIDs are the opaque string row ids (no numeric row
  handle exists in the store). Exported surface: `ReenrichSource`,
  `FetchGate`, `NewFetchGate`. The api
  `Deps.Reenrich` closure wraps it cmd-side, owning the per-library
  whole-sweep in-flight flag and translating outcomes into api-local
  `ReenrichResult{Queued, Stripped, Deferred}` (`Queued` = rows the
  sweep scoped = stripped + deferred) + sentinel errors
  (in-flight → 409, unknown plugin → 400, unknown rows → 404). The api
  package imports neither enrich nor plugins (INV2).
- **Admin API (group 4):** `POST /api/v1/libraries/{id}/refresh` body
  `{plugin_id` required, `row_ids?`} → `202 {queued, stripped,
  deferred}`; `GET /api/v1/libraries/{id}/enrich/preview?plugin_id=` →
  `{plugin_id, matches, pending, cooling, versions}`; `GET
  /api/v1/enrich/failures` → ledger rows with best-effort
  `row_kind`/`title`, gone rows rendered as `row_kind:"gone"`.
- **Parser wake (group 4 ↔ 5):** nil-safe `Deps.OnParsersChanged(ctx,
  libraryID)` fired after `SetItemParsers` success; cmd wires it to
  `Queue.Notify`.

## Decisions

### D-1 Purge, not predicates (re-enrichment = namespace reset)

A refresh strips one plugin's three doc regions (namespace, `_provenance`
entries, `_view` entries) under the row's own lease, then re-runs the
EXISTING derivation — the namespace gate exists in four places
(derivation, driver, settlement, extras) and the purge makes all four
pass unmodified. No Policy type, no intent records, no predicate
extension. The purge never touches `doc.identifiers` (the id anchor) or
`title_overrides` (structurally unreachable — separate table). Cost: four
gate copies remain (collapsed only by the deferred derive-verdict
refactor) — consistent under purge semantics.

### D-2 Lease-scoped strip with a bounded retry pass

`persistRow` on the worker path is unconditional, so an unleased strip
can be silently resurrected by an in-flight worker — a lost refresh after
the API already said 202. Each row is stripped under its own non-blocking
lease; lease-held rows are counted and re-attempted once after a short
delay. Rows that stay held keep their namespace (no partial strip).

### D-3 Two new legal transitions, flip only stripped rows

`{ready, evRefresh} → pending` and `{enriched, evRefresh} → pending` join
the transitions table; the sweep flips only rows it actually stripped, so
`pending` stays a truthful will-fetch signal. Without the table rows the
flip is unpersistable (INV-status-owner); today `reengage(ready)` returns
ready and `settle` only leaves enriched.

### D-4 Id anchoring wires the dead proto fields, core-side

`existing_ids` in / `resolved_ids` out through the orchestrator — a
core-side write to `doc.identifiers`, outside namespace validation (that
polices only Merge output), so C3 holds. First enrich passes empty;
legacy rows fuzzy re-match once on first refresh (preview surfaces
confidence); a wrong original match is cemented by anchoring — accepted
MVP limitation (Open Questions 1–2). MVP scope: `existing_ids` carries
only `shikimori_id`.

### D-5 Core-side fetch at the reserved stub; pacing is contract conformance

The stub between BuildRequest and Convert becomes real HTTP execution
(~80 LOC, `internal/enrich/fetch.go`): validate, percent-encode, honor
`timeout_seconds`, populate Convert inputs, fail `redacted_ref`
explicitly (the Mode B hook stays contract-present, unbuilt — secrets
would resolve at the AuthContext build site). The per-plugin gate
enforces `min_interval_ms` server-side — the request-spec proto already
assigns the core that role ("The core enforces this server-side"). 700 ms
covers the 90 rpm anonymous cap (60000/90 ≈ 667); dropping toward 200 ms
is an OAuth-era change, not an MVP one. The gate is process-wired
(constructible, injectable clock), never a package var (lifecycle +
testability).

### D-6 Admin surface as three Deps closures, no SSE, no job ids

C4 (api→enrich via cmd closures) with the house nil-safe Deps pattern;
DTOs already carry status + the raw document and TanStack polling is the
established pattern, so no SSE and no per-row job ids. Preview is
computed on demand (O(library) doc reads — no more than `deriveLibrary`
already does per Notify); drift is computed, never stored. The failures
route reads the ledger through the existing store Deps directly — no
closure for what store already answers.

### D-7 D3 by absence + guarded seed promotion

A plugin version bump changes nothing automatic — there is no version
comparison on any path, only the preview histogram (rows whose
`_provenance` version ≠ running version). Operators opt in per library:
preview → confirm → sweep; the sweep shows the `cooling` count before
confirm (informed consent) and clears only the swept plugin's ledger
rows. The serial seed promotes 1→2 via the schema-guarded UPDATE pattern
the tv module established (`upgradeSerialConfigSQL` mirroring
`upgradeTVConfigSQL`) — idempotent, re-runs no-op, no other row touched.

### D-8 Boot registration is the self-heal foundation

`Queue.Start` seeding its registry from the store when empty fixes the
backlog bug (sweep vacuous on fresh boot) and is load-bearing for
re-enrichment crash-safety: a crash mid-sweep leaves stripped rows that
re-derive on the next boot's sweep.

## Risks / Trade-offs

- [Wrong original match cemented by anchoring] → accepted for MVP; Match
  reasons (`matched by shikimori_id N`) keep anchored rows auditable; the
  manual pin write path is the named follow-up (Open Questions).
- [In-flight guard window] → the 409 guard spans the strip pass + Notify;
  overlap with the subsequent async drain remains possible and accepted
  (idempotent strips, 700 ms pacing).
- [Explicit-refresh crash loses the flat-schedule marker] → the
  process-lifetime explicit set is best-effort; the ledger row was
  cleared anyway, so the worst case is one standard-schedule cooldown —
  never a loop (C7 holds).
- [Anonymous tier IP-ban] → UA + 700 ms pacing are contract-enforced
  core-side; the plugin cannot omit them (they live in BuildRequest
  output the core validates and paces).
- [Serial chain grows a network dependency] → soft-fail semantics
  unchanged: a shikimori failure records to the ledger and the item still
  settles; scan never blocks on it.

## Migration Plan

Additive-only: new plugin package, new fetch/ReenrichSource code paths,
+3 Deps fields (nil-safe — existing callers compile), +3 routes, seed
promotion via the guarded UPDATE (existing v1 serial rows upgrade on
next open; fresh installs seed v2 directly). Rollback = revert; v2 config
rows keep every v1 binding (serial-parser, frame-grabber untouched), and
a downgraded binary reads v2 config losslessly (display block is opaque
pass-through in Go).

## Open Questions

All three open questions from the design draft were user-arbitrated and
are adopted as decided:

1. No fuzzy re-find escape hatch (wrong original match is cemented) —
   **accepted for MVP**; anchored rows are auditable via Match reasons.
2. Match-override write path (manually pin a shikimori id) — **out of
   MVP**; ships when operator pain is real (new write path + plugin RPC
   surface).
3. Bypassed-run failure schedule — **flat cooldown** (the `pack_failed`
   precedent): explicit retries are never punished by doubling
   (implemented in tasks 3.4).
