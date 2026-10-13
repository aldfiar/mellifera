# Proposal: enrichment — shikimori plugin + opt-in wholesale re-enrichment

## Why

Serial libraries have no external show-metadata source: the serial chain is
serial-parser (local filename grammar) + frame-grabber (local ffmpeg), so
anime films and series carry no synopsis, score, poster, air dates, or
Russian titles — and the module has no display block to prefer any. The
verified design draft (`.tmp/shikimori-design.md`, 2026-10-13, reviewer
verdict HOLDS) selects shikimori.io as the first external source on the
existing four-RPC MetadataSource contract, with the operational gaps that
block any external source folded into the same change: dead id-anchoring
proto fields, a stubbed fetch point with no pacing, no way to trigger
re-enrichment of one source's namespace, an unreadable failure ledger, and
the fresh-boot restart sweep bug found in the wild.

## What Changes

- **shikimori plugin (`plugins/shikimori/`, new):** `sdk.MetadataSource`
  impl, scaffold mirroring `plugins/tv-parser`, importing only `pkg/sdk` +
  `proto/mellifera/*` + public deps. Document-shape Match dispatch (serial
  record → anime search on display title; film-parsed → movie-kind search;
  episode docs never match; stored `shikimori_id` → id-anchored re-match);
  anonymous-tier request contract (app-name User-Agent, `min_interval_ms`
  700, no secrets); RU-first conversion namespace with `resolved_ids`.
- **Core-side fetch (internal/enrich):** the reserved fetch stub between
  BuildRequest and Convert becomes a real server-side HTTP execution —
  spec validation, percent-encoded {var} substitution, `timeout_seconds`,
  ConvertRequest `raw_response`/`http_status`/`response_headers`
  population, `redacted_ref` → explicit unsupported — with a per-plugin
  `min_interval_ms` gate (injectable clock, process-wired, no package
  global), per the request-spec contract that the core enforces pacing
  server-side.
- **Identity anchoring:** the dead `MatchRequest.existing_ids` /
  `MatchResult.resolved_ids` proto fields get wired — the orchestrator
  feeds `doc.identifiers` into Match and persists `resolved_ids` back —
  the correctness precondition for wholesale namespace replace.
- **Explicit re-enrichment (internal/enrich):** `Queue.ReenrichSource`
  purges one plugin's namespace + provenance + view entries under the
  row's own lease (never `identifiers`, never other plugins), clears the
  plugin's ledger cooldown (explicit actions bypass; automatic paths never
  do), retries lease-held rows once, flips only stripped rows
  `ready/enriched → pending` (two new legal transitions), and lets the
  unchanged namespace gates re-derive. Explicit-run failures cool down
  flat. The crash-mid-sweep case self-heals via the boot fix.
- **Admin API (internal/api, cmd-wired closures, nil-safe):**
  `POST /libraries/{id}/refresh` (202 counts; 409 in-flight; 400/404),
  `GET /libraries/{id}/enrich/preview` (D3 consent surface: matches /
  pending / cooling / versions histogram), `GET /enrich/failures` (the
  ledger finally readable; gone rows render, never filtered). Plus the
  `OnParsersChanged` wake so parser attach/clear joins derivation without
  a rescan.
- **Fresh-boot registration (internal/enrich):** `Queue.Start` seeds its
  library registry from the store when empty — the backlog bug
  "restart sweep vacuous on fresh boot" — which the re-enrich
  crash-self-heal story is load-bearing on.
- **Serial module seed v2 (internal/module):** guarded idempotent
  promotion 1→2 adds the shikimori binding (priority 3, queueable) and the
  serial module's first display block (RU-first, shikimori in title/rating
  priorities; SPA-consumed config, zero Go renderer change).

Out of scope (MVP, with named hooks): client-held-secret fetch execution
(`redacted_ref` fails explicitly), OAuth, the match-override write path,
all-sources refresh, SPA admin UI for preview/failures (the API surface
ships; display config is consumed by the existing SPA path), TMDB/B3,
film module seed, derive-verdict extraction collapsing the four gate
copies, `_stages` compaction.

## Capabilities

- **New Capabilities:** `shikimori-enrichment` — plugin match/request/
  convert contract + serial module seed v2.
- **Modified Capabilities:** `plugin-pipeline` (ADDED: core-side fetch
  execution with per-plugin pacing; identity anchoring across runs) —
  `async-enrichment` (ADDED: explicit source re-enrichment, fresh-boot
  registration, parser-changed wake, re-enrichment admin API; MODIFIED:
  lifecycle states gain the explicit-refresh transitions).

## Impact

- `plugins/shikimori/` — new plugin package + tests.
- `internal/enrich` — fetch.go (new), anchoring in chain/enrich helpers,
  `ReenrichSource` (+1 exported symbol), status transitions, boot
  registration.
- `internal/api` — +3 nil-safe Deps closures (`Reenrich`,
  `EnrichPreview`, `OnParsersChanged`), +3 admin routes (new
  `enrich_admin.go`), + tests.
- `cmd/mellifera` — gate construction + closure wiring +
  `loadPlugin("shikimori")` + `MELLIFERA_SHIKIMORI` env.
- `internal/module` — serial seed data + guarded promotion (config
  entity, not code).
- **proto 0 · store 0 · pkg/sdk 0 · internal/scan 0** — additive only;
  the frozen 4-RPC plugin contract is untouched.

## Verification

- Go: `make build check test lint` from the repo root (node-free), then
  `scripts/check.sh`.
- Per-box probes: targeted `go test -run` over
  `./plugins/shikimori`, `./internal/enrich`, `./internal/api`,
  `./internal/module`, and one `internal/itest` joint round trip with an
  httptest stub upstream — shikimori.io is never called from tests.
