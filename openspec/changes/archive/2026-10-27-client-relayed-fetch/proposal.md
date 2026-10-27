# Proposal

## Why

The enrichment fetch executor assumes the server itself can reach upstream hosts. In the target environment that is false — the server can be blocked from an upstream while browsers on the same network reach it fine — so fetch failures pile into long ledger cooldowns and metadata never lands, and the planned TMDB source would ship dead (the ruled sequencing: relay first, plugin second — `.tmp/layer4-design.md` §2/§4, operator rulings 2026-10-27). Relay is a TRANSPORT for the fetch, invisible to plugins: the plugin chain (Match→BuildRequest→Convert→Merge) is untouched; only the executor between BuildRequest and Convert changes.

## What Changes

- **Fetch failure classification** — every failure at the enrichment fetch seam is classified into the closed set `network | upstream | protocol | spec`; `network` (no HTTP response arrived) is the only relay-eligible class. `_stages` fetch entries gain a machine `class` beside the free-text error, and ledger reasons carry the class token. (Absorbs status-contract stage 2 — one mechanism, landed here.)
- **Deferred outcome + relay handoff** — a network-class failure on a run's primary OR any extra spec converts the run to a new deferred outcome (neither failed nor succeeded): the whole request plan (primary + extras, positional) hands to a durable relay queue; the in-memory retry loop short-circuits (retrying a structurally unreachable host server-side is pure latency).
- **Relay job store** — new control table `relay_jobs` (precedent: `enrichment_failures`): fully server-authored descriptors (URLs substituted, server secrets resolved — the client never sees a template or a placeholder and cannot influence method/URL/headers), states `pending|claimed|done|failed`, claim principal hash + lease, stored result, `consumed` flag.
- **Relay HTTP surface** — `POST /api/v1/relay/claim` (atomic single-statement claim: oldest pending or expired-claim job; exactly one claimant at a time via the lease; `204` when the queue is empty; lease default 2 min, `MELLIFERA_RELAY_LEASE`) and `POST /api/v1/relay/{id}/result` (same-principal live-claim guard; request-body cap default 2 MiB, `MELLIFERA_RELAY_MAX_BODY`; principals = any authenticated client — admin + paired device tokens today, Layer 6 accounts inherit).
- **Ledger loop-safety** — handoff writes ledger status `relayed` with a flat 10-min cooldown; completion clears the row and wakes the library; the re-derived run consults the relay cache (a done, unconsumed, plan-matched job) and feeds the stored response to Convert exactly as a server fetch (plan mismatch degrades to a normal fetch); 3 relay rounds → terminal `exhausted` with the standard doubling — the item settles `ready` without the namespace (honest absence), reopenable by explicit refresh or cooldown lapse.
- **Search rides the relay** (ruled OQ-6) — a network-class identify-search failure enqueues a `purpose: "search"` job; the admin search endpoint holds the request and polls the job (≤60 s budget) before answering, so the identify picker works from a blocked server while the SPA's relay loop runs concurrently.
- **SPA relay loop** — `web/src/lib/relay.ts` + a hook mounted in the authenticated shell: poll claim (~15 s interval, idle backoff, stop on 401), execute the descriptor verbatim (timeout honored, redirects followed, best-effort pacing), POST the result; `_stages` stamps `executor: "client"`; key-bearing URLs are redacted from logs, `_stages`, and ledger reasons (the resolved server secret necessarily rides the descriptor — accepted, narrowed to authenticated principals, rotatable; ruled OQ-2).
- **Health state vocabulary** — `Health.State` pinned to its closed vocabulary (absorbs status-contract stage 1). Status-contract stage 3's admin ledger route is ALREADY shipped (`GET /api/v1/enrich/failures` over `store.ListFailures` — verified in code); only the `relayed` vocabulary lands here.
- **Admin failure surface** — the plugins aggregate (`GET /api/v1/admin/plugins`) gains an additive per-plugin `failures` count: the ledger rows CURRENTLY STORED for that plugin (the ledger keeps no history — a row clears on success — so the count reads "failures now", never a lifetime total). `GET /api/v1/enrich/failures` accepts OPTIONAL `plugin_id`/`limit`/`offset` (default unchanged: today's full unfiltered list, never-filtered guarantee intact). The Plugins admin page gains a «Ошибки» column (served count, click-through) and a per-plugin failures page rendering the server-limited list with an honest empty state (Russian operator copy).

## Capabilities

### New Capabilities

- `client-relayed-fetch`: the client-relayed fetch transport — fetch failure classification, the deferred handoff, the durable server-authored relay job store, the claim/result wire surface with lease and body cap, ledger loop-safety integration, search-over-relay, credential redaction, and the `MELLIFERA_RELAY_*` knobs.

### Modified Capabilities

- `async-enrichment`: the enrichment-failures ledger's closed status vocabulary gains `relayed` (flat handoff cooldown, cleared on relay completion; three relay rounds land terminal `exhausted` with the standard doubling); ADDED — the failures listing accepts an optional per-plugin filter and a limited window (no-parameter requests answer today's full list).
- `web-ui`: the SPA endpoint allowlist gains the two relay routes and `GET /api/v1/enrich/failures`; ADDED requirements for the client relay loop, the embedded build carrying the relay surface, and the Plugins page's failures column + per-plugin drill-down.
- `plugin-admin`: the plugin health snapshot's `state` field is pinned to a closed vocabulary; ADDED — the aggregate carries a per-plugin failure count (current ledger rows).

## Impact

- `internal/enrich`: `fetch.go` (classification), `chain.go`/`retry.go` (deferred outcome, short-circuit, cache consult), new `relay.go` (enqueue + claim + consult + ingest + URL redaction), `search.go` (relay-polling search). Package exported-symbol count rises ~7→~10 — the WARN band, accepted by the ruled design (noted in design.md).
- `internal/store`: new `relayjobs.go` (+1 top-level type, methods outside the budget) and the `relay_jobs` table in `open.go`; the failure-ledger reads gain `FailureCountsByPlugin` and a paged/filtered variant (`ListFailures` itself untouched — the derivation's index rides it).
- `internal/api`: new `relay.go` (2 routes, handler methods only over nil-safe Deps closures + one plain field — the api symbol budget holds); `enrich_admin.go` gains the optional query params on the failures route; `plugin_admin.go` gains the additive `failures` count on the aggregate rows.
- `cmd/mellifera`: relay wiring + `MELLIFERA_RELAY_LEASE` / `MELLIFERA_RELAY_MAX_BODY` knobs (env fallback-and-warn pattern).
- `web/src`: new `lib/relay.ts` + `lib/relayWorker.ts` (+ tests), hook mount in `App.tsx`; `lib/api.ts` (failures count field + failures-list client), `pages/admin/Plugins.tsx` (failures column), new `pages/admin/PluginFailures.tsx` + its route.
- `internal/itest`: the relay joint (E2E without TMDB — the shikimori `MELLIFERA_SHIKIMORI_UPSTREAM` seam points the upstream at an unroutable host).
- `internal/web/api` + `internal/web/dist`: regenerated and committed at closeout.
- No plugin, proto, or SDK changes; the plugin chain and every existing endpoint keep their shapes.
