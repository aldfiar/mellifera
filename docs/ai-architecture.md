# Mellifera — AI-Navigable Architecture

**Status:** Companion to `architecture.md` and `prior-art.md`.
**Purpose:** Define the codebase structure that lets AI agents — including small and medium models — build and maintain Mellifera. The structure is a *property of the codebase*, enforced by the `mellifera-build` skill (`.claude/skills/mellifera-build/`) and a complexity budget. It cannot be retrofit; it is decided now, before code.

## 1. The problem

AI agents fail on large codebases for structural reasons, not volume:

- **Call-graph fan-out** — tracing a behavior hops through many objects/interfaces.
- **Hidden control flow** — DI containers, reflection wiring, interface dispatch, callbacks, event buses. The model cannot *see* what calls what; it must *infer*.
- **Wide APIs** — a package exporting 40 symbols forces reasoning about all of them to change one.
- **Implicit shared state** — mutable types passed across boundaries mean a change anywhere might break anything.

A small model can fix a bug if the whole change is local to one package and one test. It fails the moment it must trace behavior across many objects.

## 2. Six principles

| # | Principle | Effect for a small model |
|---|---|---|
| 1 | **Context locality** — one module = one self-contained directory | Whole module fits in context; no tree traversal |
| 2 | **Narrow public API** — ≤8 exported symbols/package, in one `doc.go` | One file = the whole surface |
| 3 | **Shallow data pipelines** — `result := transform(input)` | Linear traces, no hop blowup |
| 4 | **Pure core, thin shell** — logic is pure; I/O only at edges | Tests are `input → output`, no fixture sprawl |
| 5 | **Explicit wiring** — flat `main.go`, no DI/reflection | The app graph is readable in one file |
| 6 | **Tests as the spec** — every exported symbol has a table test | Tests are the examples *and* the acceptance gate |

Corollaries: **data-type boundaries, not interfaces** (interfaces only at the plugin seam, ≥2 implementations — never single-impl interfaces); **bounded contexts** (cross-package data crosses a struct conversion, never a shared mutable type).

## 3. `api/` is pure delegation

`internal/api` holds **zero logic**. A handler does exactly three things:

1. parse the request,
2. call **one** domain function,
3. write the response.

No branching, no multi-call orchestration, no business rules. Logic lives in `store/`, `enrich/`, `module/`, etc.; `api/` only routes to it. This makes the largest-dependency package also the simplest, and means behavior changes almost never touch `api/` — which in turn means the hardest-to-navigate package (the HTTP surface) stays trivial.

## 4. Module map (authoritative — keep in sync with the skill)

Realized by the `scan-library` feature (foundational slice) + the additive
`plugin-pipeline` Phase A layer + the `async-enrichment` **Phase B1** layer
(the async substrate). Counts are exported symbols per `scripts/check.sh`, which
counts **top-level** `func/type/var/const` decls only — method receivers (`func (r T) M`)
are excluded, so a package's gate-count is its top-level surface; `WARN` = >8 but
≤12 (pre-justified R10); all others ≤8. Reserved-table methods
(`RecordProgress`/`GetResume`) are deferred — the tables exist but no method
ships yet. Phase A deltas are marked **[A]**; Phase B1 deltas are marked **[B1]**;
Phase B2 deltas are marked **[B2]**; web-ui Phase 1 deltas are marked **[web-ui]**.

> **Phase B1 shipped (`async-enrichment`).** Enrichment is now ASYNCHRONOUS: a
> derived in-process `enrich.Queue` + bounded worker pool drains pending
> `(item, plugin)` work derived from `items` + document namespaces + the
> `enrichment_failures` ledger (architecture §4.4 — there is **no** queue/claim/
> lease table). `POST /scan` returns once items are persisted `pending`; workers
> drain them to `enriched`/`ready` in the background. The plugin contract, the
> API surface, and `scan.Result` are **unchanged** (additive — deprecate-don't-
> delete). Operator semantics:
> [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/async-enrichment/spec.md`.

> **Phase B2 shipped (`image-enrichment`).** Image media type + EXIF enrichment
> land as the SECOND consumer of the B1 queue: a new `plugins/image-enricher`
> `metadata_source` subprocess (a structural mirror of `tv-parser`; reads EXIF via
> the system `exiftool` binary — `os/exec` arg-slice, NO new Go dep), module-type-
> gated image discovery in `plugins/base-scanner` (`image.go`), an `absolute_path`
> stamp in `internal/scan` (the only file-location channel into the enricher
> chain), and an `image` module seed in `internal/module`. **Additive** (proto/
> api/enrich/sdk/`go.mod` diff empty — AC-3); `metadata_source` now ships TWO
> plugins (tv-parser + image-enricher) with **zero new capability types**
> (`image_provider` stays reserved — D-1 holds). B3 (external TMDB + `AuthContext`)
> + Phase C (post-action) remain **deferred** ([`docs/backlog.md`](backlog.md)). Operator runbook:
> [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/image-enrichment/spec.md`.

> **web-ui Phase 1 shipped (`web-ui`).** The Go-side UI foundation lands as a NEW
> `internal/web` package + an additive widening of `internal/api`: `web.Handler`
> composes the chi `/api/*` router with the embedded SPA (`//go:embed all:dist` —
> the first real `go:embed` in the codebase), the code-generated OpenAPI spec
> (`/openapi.{yaml,json}`, embedded committed bytes), and Swagger UI (`/docs/` via
> `github.com/swaggo/http-swagger` — the FIRST new Go runtime dep, NOTICE-documented;
> `swag` itself stays a dev/CI CLI like `protoc`). Roles arrive as a TYPE not a bool
> (`Principal{Role}` + `Role`/`RoleAdmin`/`RoleClient` + `requireRole` groups; arch
> §11.5 anticipated evolution, arrived early), and 3 additive GETs ship
> (`/libraries`, `/items/{id}`, `/admin/status` — the last via a `Deps.Status` closure
> built in `cmd/mellifera`, the INV2 anti-corruption seam that keeps api free of
> plugin/enrich imports). The Go build gate (`make build`/`check`/`test`/`lint`) is
> **node-free** — it embeds committed artifacts; `make web-build` is the only
> node/swag-touching target (dev/CI-only). The public surface widens (R-2): `/`,
> `/assets/*`, `/openapi.*`, `/docs` are intentionally unauthenticated (static only —
> no data); all data stays behind role-gated `/api/v1/*`. **Additive** (proto/sdk/
> scan/enrich/plugin/module byte-identical vs `58a1130`). api 3→7 (under the 8 budget);
> `internal/web` = 2. React app + client panels + B3 (TMDB) + Phase C (post-action)
> remain **deferred** (Phase 2+; see [`docs/backlog.md`](backlog.md)). Operator runbook:
> [`docs/operator-runbook.md`](operator-runbook.md); behavior:
> `openspec/specs/web-ui/spec.md`.

> **packaged-playback shipped (archived 2026-10-09).** `internal/stream` is
> REALIZED (was DEFERRED) as the playback mechanism — remux-only fMP4-HLS
> (stream-copy, one ffmpeg exec site), pure playback classification over
> stored ffprobe facts, HMAC media tokens, the token-gated `/media` surface,
> the playback descriptor — plus the NEW stdlib-only `internal/orchestrator`
> pure policy core (watch-driven serial frontier + movies pack-on-play;
> `cmd/mellifera` executes its decisions — since artwork through the janitor
> registry's `streams` task running `playback.go`'s `newSweep` closure) and the `__streams__`
> enrichment lane riding the B1 queue through the `Deps.PackItem` seam
> (enrich never imports stream). Two additive browse-group endpoints
> (`GET /items/{id}/playback`, `POST /items/{id}/play`) over nil-safe
> `Deps.Playback`/`Deps.Play` closures; `ffmpeg` is the pack lane's runtime
> dep (per-item soft-fail). Behavior: `openspec/specs/packaged-playback/spec.md`.

> **element-pages shipped (archived 2026-10-10).** Per-item parser
> attachments + the library parser chain + media-first element detail pages.
> Presentation declarations (`identity_fields` per module, `display_fields`
> per binding) live ONLY in module seed config — the core carries them as
> opaque strings (AC-4; INV5). New control tables `item_parsers` +
> `library_parsers` (`internal/store/item_parsers.go`); new admin endpoints
> `PUT/DELETE /items/{id}/parsers` + the `parsers` field on
> `PATCH /libraries/{id}` validated via the `Deps.PluginCapabilities`
> closure; the additive `module` presentation block on
> `GET /libraries/{id}` via `Deps.ModulePresentation` (api 7→10 WARN —
> `ParserBinding` + `ModulePresentation`). The enrich queue gains two
> derivation inputs (element attachments under the same D-Q1 predicate;
> the chain order = queue priority) and `Enrich` backward-compatible
> variadic extras. ZERO new import edges — all seams are func closures.
> NEW capability spec: `openspec/specs/parser-display/spec.md`.

| Package | Owns | Public API (≤8; WARN noted) | Depends on |
|---|---|---|---|
| `cmd/mellifera` | wiring (flat `main.go`) — **[A]** loads base-scanner + tv-parser, constructs `enrich.Deps`; **[B1]** constructs `enrich.NewQueue`, `Start`s the pool before serving, wires `scan.Deps.Notify` → `queue.Notify` (process ctx), `Stop`s on shutdown; reads `MELLIFERA_ENRICH_*` knobs; **[B2]** loads/stops the image-enricher subprocess (3rd plugin; `MELLIFERA_IMAGE_ENRICHER` env, default `bin/image-enricher`); **[web-ui]** composes `web.Handler(api.New(deps), opts)` as the SOLE top-level handler (no second `http.Server`), builds the `Deps.Status` closure over `mgr.Status` + `enrichQueue.Stats` (the INV2 anti-corruption seam keeping api free of plugin/enrich imports — mirrors `Deps.Scan`), reads `MELLIFERA_WEB_DEV`; **[artwork]** builds `art.NewService` (blob root `<data dir>/art`) + runs the `janitor.go` registry (`janitorTask{name, interval, fn}` — every enabled task boot-runs once before serving, then one ticker goroutine per task; day-one tasks `streams` @ 60 s + `art` @ `MELLIFERA_ART_INTERVAL`, default 6 h, ≤0 = off); **[watch-flow-polish]** reads `MELLIFERA_AUTO_NEXT_COUNTDOWN_SECONDS` (default 10, floored at 1, malformed → default + warning) into `Deps.WatchDefaults`) | — | all (read-only) |
| `internal/store` | SQLite: documents + control tables + reserved `playback_progress`/`scan_jobs` — **[A]** + indexed `items.status` column (default `"new"`); `QueryItems` additive `status` filter (`""` ⇒ all). **[B1]** +`ledger.go` (`FailureRow` + `RecordFailure`/`ClearFailure`/`ListFailures`; **no DDL** — `enrichment_failures` existed from Phase A) + pool-wide 5s `busy_timeout` PRAGMA in `Open`'s DSN (`withBusyTimeout`). **[element-pages]** +`item_parsers.go` (`SetItemParsers`/`ListItemParsers` over the new `item_parsers` table — element-only attachments keyed `(item_id, plugin_id)`, position = attachment order, following the item's IDENTITY) + `SetLibraryChain`/`GetLibraryChain`/`TestLibraryChain` over `library_parsers` (the per-library parser chain); both tables in `open.go` schemaSQL, FULL-replacement + transactional, orphan-tolerant reads | `Open`, `Close`, `DB`, `CreateLibrary`, `GetLibrary`, `GetItem`, `PutItem`, `QueryItems`, `RecordFailure`, `ClearFailure`, `ListFailures` (+ `Store`/`Item`/`Library`/`FailureRow`) — **gate count 5** (top-level: `Store`/`Open`/`Item`/`Library`/`FailureRow`; methods excluded by `check.sh` ⇒ green ≤8; the Phase-A "11 WARN" narrative counted methods) | — (bottom) |
| `internal/plugin` | subprocess lifecycle + gRPC clients + capability routing — **[A]** caps-driven launch; `MetadataSource` accessor | `Open`, `Load`, `Start`, `Stop`, `Status`, `Scanner`, `MetadataSource` (+ `Manager`/`Deps`/`Health`) — **10 WARN** | proto, sdk |
| `internal/module` | config-driven module registry — **[A]** `metadata_sources` chain (`Module.MetadataSources[]`); tv-parser seed; **[B2]** `image` module seed (base-scanner + image-enricher priority 1) — now tv + image; **[element-pages]** every seed (tv/image/serial) declares `identity_fields` per module + `display_fields` per scanner/metadata_source binding — presentation CONFIG, never core literals (INV5); pure accessors `IdentityFields`/`DisplayFields` are methods (outside the symbol budget) | `Open`, `Get`, `List` (+ `Registry`/`Module`/`ScannerBinding`/`MetadataSourceBinding`) — **7** (`imageConfigJSON` is an unexported const; no new symbol) | store |
| `internal/scan` | scan-side orchestration (resolve module → scanner → stream → identify → PutItem). **[B1]** drops inline enrich; persists each item `pending` + calls `Notify(libraryID)` once post-drain so the queue derives/drains async. **[B2]** stamps `absolute_path = filepath.Join(root, rel)` into `doc["parsed"]` for EVERY item (media-type-agnostic — INV2; the only file-location channel into the enricher chain, D-6). A re-scan whose base identity changed → `stale`; unchanged re-scan preserves status. `scan.Result` shape **unchanged** (timing only) | `Run`, `Deps` (`.Enrich` retained seam + **[B1]** `.Notify` field), `Result` — **3** | store, module, plugin, enrich |
| `internal/enrich` | **[A]** metadata-side orchestrator + **[B1] async derived-queue dispatcher** (arch §4.4): `Queue` derives pending `(item, plugin)` work from `items`+namespaces+ledger (no work table), feeds a bounded channel, a worker pool drains it under per-item in-memory leases with retry/backoff + terminal-cooldown ledger writes. `Enrich` (sync per-item chain) is **preserved** (deprecate-don't-delete, AC-3) — the worker shares its helpers (`runSource`/`nextState`/`applyContribution`/`appendStage`) but does not call `Enrich` directly. **[packaged-playback]** +`streams.go` — the `__streams__` pack lane rides the SAME queue through the `Deps.PackItem` func seam (enrich never imports stream); lease renewal + flat 30d `pack_failed` cooldown. **[element-pages]** queue derivation adds the element-attached sources (`ListItemParsers`, same D-Q1 predicate) and the library chain (`GetLibraryChain` → chain order = queue priority); `Enrich` gains backward-compatible variadic extras (attached sources run after the chain, identical per-source path) | `Enrich`, `Deps`, `Result` + **[B1]** `Queue`, `QueueConfig`, `Stats`, `NewQueue` — **7** (queue.go/worker.go/lease.go/retry.go + streams.go) | store, module, plugin |
| `internal/stream` | **[packaged-playback]** REALIZED (was DEFERRED) — the playback mechanism: pure playback classification over stored ffprobe facts (`Classify` — never stored, never client-driven), the remux-only fMP4-HLS pack lane (one ffmpeg exec site, `-c copy`, head-first 600 s first chunk, atomic build-nonce publish), the HMAC media token (cookie-first + query fallback, 4 h — never the admin secret), the token-gated `/media` ServeHTTP surface (playlists + segments + direct originals with `Range` — mounted by `internal/web` BEFORE the SPA fallback), and `Describe` (the read-only descriptor). INV1: no decode/encode anywhere; the direct floor is unconditional | `Build`, `Class`, `Classify`, `Service` — **4 counted** (grouped consts + `Service` methods excluded by the counter) | store facts in, stdlib only (enrich reaches it ONLY via the `Deps.PackItem` seam) |
| `internal/orchestrator` | **[packaged-playback]** PURE watch-driven policy core (stdlib-only imports): `Budget` (32 GB LRU artifact budget + `.trash` eviction), `Frontier` (serial watch frontier + movies pack-on-play). Snapshots in (store reads passed IN as data), decisions out (`Job`/`Episode`/`ArtifactDir`) — executed by the `cmd/mellifera` janitor registry (**[artwork]** the `streams` task runs `playback.go`'s `newSweep` closure); never execs ffmpeg, never writes documents, never touches library dirs | `Budget`, `Frontier`, `Job`, `Episode`, `ArtifactDir`, `Evictions`, `FrontierIn`, `OnPlay`, `Serial` — **8** | — (pure; stdlib only) |
| `internal/art` | **[artwork]** the content-addressed art store — `Acquire` (singleflight fetch-once per (url, kind); ≤2 fetches in flight, 15 s budget, 8 MiB read cap), `Ingest` (the per-entity upload flow: the SAME guard every fetched byte passes — ≤8 MiB re-check, JPEG/PNG/WebP magic sniff, real decode — then a center crop-once to 2:3 → `cropped.jpg` beside the verbatim original, selection pinned on the `art_<sha256>` token), `Settle` (staged→materialized + GC; the janitor `art` task's pass), `Resolve` (path serve). A LEAF: imports only store + stdlib + `golang.org/x/sync/singleflight` + `golang.org/x/image/webp` — never enrich/plugin/module; blobs under `<data>/art/<sha256>/` (temp+rename) | `Service`, `NewService`, `ErrNotImage`, `ErrTooLarge`, `KindPoster` — **5** | store (`art_fetches`/`art_overrides`) |
| `internal/api` | HTTP (chi) — **pure delegation, no logic** — **[A]** additive `itemDTO.Status` + `?status=` filter; **[web-ui]** role-aware auth (`Principal{Role}`, `authMiddleware`+`requireRole`; browse group = admin+client read-only + viewer actions, admin group = admin-only mutating/liveness) + 3 additive GETs (`/libraries`, `/items/{id}`, `/admin/status` via the `Deps.Status` closure — INV2 preserved) + swag annotations (comment-only metadata; INV1 preserved). **[packaged-playback]** +`playback.go` (`GET /items/{id}/playback` + `POST /items/{id}/play` via nil-safe `Deps.Playback`/`Deps.Play` closures; media token rides `Set-Cookie`, never a body field). **[element-pages]** +`parsers.go` (`PUT/DELETE /items/{id}/parsers` via `Deps.PluginCapabilities` validation; `parsers` full-replacement on `PATCH /libraries/{id}`; additive `module` presentation block on `GET /libraries/{id}` via `Deps.ModulePresentation`; `extra_parsers` on the item detail DTO; **[artwork]** +`art.go` — the read-time `artwork` stamp composed at the DTO seam (stored override → served proxy URL; upstream missing-art placeholders count as absence), `GET/HEAD /art/object/{oid}` (browse group; ServeContent + ETag 304s), the poster override family `GET …/posters` + `PUT/POST/DELETE …/poster` on `/series/{id}` + `/items/{id}` (POST = multipart upload) — all over the nil-safe `Deps.Art *art.Service` (nil ⇒ absence; the object route 503s); **[watch-flow-polish]** +`watch_defaults.go` — `GET /watch-defaults` (browse group; the wired `Deps.WatchDefaults` int served verbatim — pure delegation at its purest, handler method so the 10-symbol count holds)) — 43 paths | `New`, `Deps`, `Principal`, `Role`, `AdminStatus`, `PluginHealth`, `EnrichStats` + **[packaged-playback]** `Playback` + **[element-pages]** `ParserBinding`, `ModulePresentation` — **10 WARN** (methods like `IsAdmin()` excluded from the `check.sh` count) | scan, store |
| `internal/web` | embedding + composition layer — **[web-ui]** `Handler(apiHandler, Options)` composes `/api/*` (chi) + `/openapi.{yaml,json}` (embedded committed spec bytes) + `/docs/` (Swagger UI via `github.com/swaggo/http-swagger` — the first new Go runtime dep; NOTICE-documented; `swag` is a dev/CI CLI like `protoc`) + `/` (embedded SPA via `//go:embed all:dist` — the first real `go:embed` in the codebase) with immutable `/assets/*` cache, `no-cache` index, SPA client-route fallback (broken hashed assets 404 — fail fast). Public surface (`/`, `/assets/*`, `/openapi.*`, `/docs`) intentionally unauthenticated (R-2: static only, no data); `/api/v1/*` carries its own role-gating | `Handler`, `Options` — **2** | api, stdlib `embed`/`io/fs`/`net/http` (does NOT import plugin/enrich/module/scan/store — no domain logic) |
| `pkg/sdk` | plugin SDK (ships in the MAIN Go module for MVP — R7) — **[A]** capability-2 adapter | `Serve`, `ScannerPlugin`, `Scanner`, `MetadataSourcePlugin`, `MetadataSource`, `HandshakeConfig`, `Capability` — **7** | proto, go-plugin |
| `plugins/base-scanner` | one subprocess binary — **[A]** media-type-agnostic (walk + ffprobe + withinRoot; parseTV extracted to tv-parser); **[B2]** module-type-gated discovery (`module_type=="image"` → image extensions, else video — D-1; a union filter is rejected to avoid TV cover-art junk, R-I4) + stdlib image base info (`image.go`: `imageMime` 6 exts incl. heic/heif; `probeImage` decodes jpeg/png dims via `image.DecodeConfig`; webp/heic/heif/RAW base-info soft-fails — exiftool supplies their data at enrichment) | per-capability (scanner.v1 + plugin.v1) | sdk, proto |
| `plugins/tv-parser` | **[A]** first `metadata_source` subprocess binary (parseTV moved here verbatim; serves `metadata.v1.MetadataSource`) | per-capability (metadata.v1 + plugin.v1) | sdk, proto |
| `plugins/image-enricher` | **[B2]** second `metadata_source` subprocess binary (a structural mirror of tv-parser; only the capability body differs — EXIF extraction vs filename parse). Serves `metadata.v1.MetadataSource`; reads EXIF via the **system `exiftool`** subprocess (`os/exec` arg-slice — no CGO, no Go module dep; `exec.LookPath` every Convert, 30s per-file timeout). Every exiftool failure is a per-source SOFT-FAIL → empty namespace → B1 `no_data` terminal → settle (AC-6) | per-capability (metadata.v1 + plugin.v1); package main — **0** non-test exports | sdk, proto |
| `internal/janitor` | cleanup cron — **DEFERRED** (the package; **[artwork]** shipped the cmd-level sweep registry `cmd/mellifera/janitor.go` instead — the `streams` + `art` tasks) | — | — |

`internal/enrich` is now realized as the metadata-side analog of `internal/scan`
(both sit at the same level). Dependency direction points **down** only:
`web → api → scan → enrich → {module, plugin} → store` (**[web-ui]** `internal/web`
composes `internal/api` — never the reverse; api does not import web). **[B1]** scan no longer calls
enrich inline; after persisting items `pending` it hands the library to
`enrich.Queue` via `Deps.Notify` (wired in `cmd/mellifera`). enrich still never
imports scan (INV-downward preserved — `Notify` is called BY scan, never the
reverse). The worker pool is a process-lifetime component (constructed + started
before the server serves, stopped on shutdown). `proto/` and `pkg/sdk` are shared
leaves. No cycles. **[artwork]** adds one store-adjacent leaf edge — `api → art → store` (art never imports enrich/plugin/module; upstream URLs and pacing stay at the composition root).

**Accepted deviations realized by `plugin-pipeline` Phase A** (reviewer ACCEPT,
health-check HEALTHY; review records in git history):
zero new protos — tv-parser + the enrich chain implement the already-generated
`metadata.v1.MetadataSource` (decision D-1, capability mapping); plugin launch is
caps-driven (base-scanner's client set byte-identical to scan-library — AC-3);
`_view` is Phase-A last-writer (Phase B adds arbitration); `_stages.stage` is
`"metadata_source"` (the contract example `"parse"` was illustrative); parseTV
moved verbatim (base-scanner Identify now media-type-agnostic); `enriched` = ≥1
success ∧ 0 failed (partial stays at furthest-valid). The async enrichment queue
is **realized in Phase B1**; B2 (image+EXIF) is **realized in Phase B2** (see
below); only B3 (external TMDB enricher + `AuthContext` population) and Phase C
(post-action) remain **deferred/outlined**.

**Accepted deviations realized by `async-enrichment` Phase B1** (reviewer
PROCEED-WITH-FIXES correctness; health-check ISSUES-FOUND PROCEED, no P0; QA
green; review records in git history):
- **D-Q1 (load-bearing):** a source is queueable iff `AuthMode != "CLIENT"`
  (not the §4.4-literal `== SERVER`). Empty/local (tv-parser) and `SERVER`
  (tmdb) are server-runnable and queued; only `CLIENT` (kinopoisk) needs user
  credentials → Mode-B-only and is excluded from the background queue. The
  seeded `tv` module reflects this: tv-parser (empty) + tmdb (`SERVER`) queued,
  kinopoisk (`CLIENT`) skipped.
- **Derived queue (§4.4):** `items` + the document `sources` namespaces + the
  `enrichment_failures` ledger **ARE** the queue — a separate `enrichment_jobs`
  table is forbidden. Pending work is re-derived from items on every `Start`/
  `Notify`.
- **Per-item leases are in-memory** (one per `item_id`; serialize-within-item,
  parallelize-across-items); they vanish on restart and expire lazily — pending
  work survives in items + the ledger. Bounded worker pool, default 4.
- **Non-blocking `POST /scan`** returns immediately with items `pending`; the
  pool drains them to `enriched`/`ready` async. `failed --retry--> pending` is
  now exercised by the queue (it was defined-but-unused in Phase A).
- **`ready`/`stale` states** added: `enriched --settled--> ready` (all queueable
  sources terminal: done, in-ledger-cooldown, or ran-but-produced-no-work);
  `* --stale--> stale` on a re-scan base change; `stale --rehydrate--> pending`.
- **`busy_timeout` 5s** added to `Open`'s DSN (`withBusyTimeout`) — the root-cause
  fix for pooled-connection write-lock errors under the async pool (pool-wide; a
  per-connection setting, unlike the persistent WAL).
- **C-01 fix applied:** `_stages` is normalized to `[]map[string]any` in
  `decodeDoc` so the audit history survives a JSON store round-trip (closes the
  unchecked type-assertion at `appendStage`/`attemptedNoWork`).
- `Enrich` is preserved (AC-3 deprecate-don't-delete); the retained
  `scan.Deps.Enrich`/`prodEnricher` seam is dead production wiring (cleanup-routable,
  audit D-02) — the worker drives the chain via `runSource`, not `Enrich`.

**Accepted deviations realized by `image-enrichment` Phase B2** (reviewer PROCEED,
health-check HEALTHY PROCEED (P0/P1: 0), QA green; review records in git history):
- **EXIF via system `exiftool` subprocess (D-2 / D21).** The enricher invokes the
  system `exiftool` binary via `os/exec` arg-slice (`-j -n <selected tags> <absPath>`,
  NEVER a shell — mirrors `ffprobe.go`). `exiftool` is a RUNTIME dep (like
  ffmpeg/ffprobe), NOT a Go-module dep and NOT a build dep — `go.mod` is unchanged. A
  missing/failing/timeout/non-JSON exiftool is a per-source SOFT-FAIL (empty metadata
  → B1 `no_data` terminal → 30-day cooldown → settle — AC-6). This replaces an earlier
  pure-Go `bep/imagemagick`/`imagemeta` direction (user plan-review decision).
- **Module-type-gated discovery (D-1 / R-I4), not a union filter.** `walk` selects the
  image extension map ONLY when `module_type=="image"`, else the video map. A union
  filter would discover TV cover-art jpgs as junk items. The core never branches on
  media type (INV2 holds — confirmed by grep: no `module_type` branch in `internal/scan`).
- **`absolute_path` is the only file-location channel (D-6).** `internal/scan` stamps
  `absolute_path = filepath.Join(root, rel)` into `doc["parsed"]` for ALL items
  (media-type-agnostic); the B1 chain passes an empty Merge doc, so the enricher reads
  the file via the Match-carried Query. tv-parser ignores it (additive — TV goldens pass).
- **webp/heic/heif stdlib base-info soft-fails (spec_error reconciled — INFO-1).**
  `image/webp` is NOT a stdlib package in Go 1.25; `golang.org/x/image/webp` is
  third-party (forbidden by the no-new-dep AC-2). webp stays DISCOVERED (`imageMime`)
  but, like HEIC/RAW, its stdlib base-info soft-fails at discovery — only jpeg/png get
  stdlib base dims. exiftool supplies full webp/heic data at enrichment. No feature
  loss (the end-to-end webp item reaches `ready`).
- **Additive (AC-3) + pure-Go (AC-2).** `proto/`/`internal/api/`/`internal/enrich/`/
  `pkg/sdk/`/`go.mod`/`go.sum` diff empty vs `e2a7562`; no `import "C"`; `image-enricher`
  package main ships 0 non-test exports; `internal/module` stays at 7. B3 (external TMDB
  fetch + `AuthContext`) + Phase C (post-action) remain **deferred**.

**Accepted deviations realized by scan-library** (reviewer/health-check ACCEPT;
review records in git history):
- `store.DB()` shares the live `*sql.DB` with `internal/module` (seam S10) so the
  registry runs its own parameterized reads; store stays the sole opener/closer.
- `api.Deps.AdminToken` makes the whole router injectable through one `New` point.
- The scan-minted item id is the deterministic composite `itm_<libraryID>_<fileID>`
  (MVP substitute for the contracts §4 ULID; idempotency + uniqueness preserved).
- `plugins/base-scanner` ships in the MAIN module (R7; arch §10 "separate modules"
  revisited at Phase 2) and serves scanner.v1 **and** plugin.v1 on one gRPC server.
- `scripts/check.sh` is portable (bash 3.2 + 4+; no `mapfile`) and excludes
  generated `*.pb.go`/`*.gen.go` from the symbol count; thresholds (≤8 WARN /
  >12 FAIL) are unchanged.
- Protos are extracted verbatim from arch §2; two genuine cross-package compile
  fixes (§2.1.3 `AuthContext` qualified, §2.2.2 `HealthStatus`→`HealthResponse`)
  are applied in `architecture.md`.

## 5. Complexity budget (enforced by `scripts/check.sh` + `.golangci.yml`)

| Metric | Warn | Fail |
|---|---|---|
| Exported symbols per package | >8 | >12 |
| Outgoing intra-core deps per package | >4 | >6 |
| File length | >300 lines | >500 (funlen gates functions) |
| Function cognitive complexity | >10 | >15 (`gocognit` / `gocyclo`) |
| Exported symbol without a table test | — | any |

A failed check means **redesign**, not relax. This budget is what keeps small models effective as the codebase grows; relaxing it under deadline pressure is exactly the failure mode the gate exists to prevent.

## 6. How a fix lands (the locality guarantee)

1. Locate the owning package (module map). One package.
2. Read its `doc.go` + `*_test.go`.
3. Edit pure functions; run the one test.
4. `api/` is untouched unless the route itself changes.

If a fix routinely ripples across packages, the structure has failed — tighten the boundary (a stable data-type contract) rather than widen the change.

## 7. Tooling

- `.claude/skills/mellifera-build/` — the skill: rules, module map, module template, and this gate.
- `.golangci.yml` — lint thresholds (`funlen`, `gocognit`, `gocyclo`, `lll`, `dupl`, `depguard` denying `reflect` and DI frameworks).
- `.claude/skills/mellifera-build/scripts/check.sh` — exported-symbol counts + lint; run before finishing any change.

> Note: `.claude/skills/` lives inside the Mellifera project directory, so the skill is discovered when Claude Code is opened **in `mellifera/`** (the intended working root for implementation).
