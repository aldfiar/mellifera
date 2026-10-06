# Mellifera — Open Questions, Trade-offs & Risks

**Status:** Seed document (Deliverable #5). Companion to `architecture.md`.
**Purpose:** Surface every deferred decision, contested trade-off, and material risk explicitly. Each entry has an owner-of-decision, a default (what we do unless revisited), and a revisit trigger.

> Convention: items referenced from `architecture.md` as `(Q<n>)` live here under that number (legacy `§O<n>` pointers were migrated to `Q<n>` in the 2026-07-20 sweep). Adding a question is free; hiding a decision is not.

---

## How to read this

- **DECIDED** — resolved in `architecture.md`; recorded here only because the brief or good practice asks for it to be visible. Revisit only on the stated trigger.
- **DEFAULTED** — a default was chosen to keep moving; the decision is reversible and explicitly flagged for review at the named milestone.
- **OPEN** — genuinely unresolved; needs a human/architect decision before the relevant phase ships.

---

## Q1. Plugin transport: gRPC vs net/rpc — **DECIDED (revisit on latency pain)**

**Question (brief §415):** `hashicorp/go-plugin` supports both gRPC and net/rpc transports. Which?

**Decision:** **gRPC.** Documented in `architecture.md` §2.1, §2.2.

**Rationale:**
| | gRPC | net/rpc |
|---|---|---|
| Schema | proto, first-class, evolvable (`reserved`, additive) | Go interface types, no schema file |
| Languages | any gRPC-capable (Rust, Python, TS plugins viable later) | Go-only |
| Streaming | first-class (`rpc Scan(...) returns (stream ...)`) | possible but awkward |
| Wire overhead | protobuf ser/de (~non-trivial for big blobs) | gob, lighter |
| Tooling | `protoc`, reflection, health-checking std | minimal |
| Cross-version safety | strong (proto versioning) | weak (Go type match) |

The brief's hard constraint (§220–232) already chose go-plugin; within go-plugin, gRPC is the only choice that honors *"any gRPC-capable language"* and the streaming Scan requirement. net/rpc would lock plugins to Go and undermine the future plugin ecosystem.

**Revisit trigger:** if measured plugin startup + per-RPC latency on a Raspberry-Pi-class host makes the MVP feel sluggish, evaluate net/rpc for *internal* (core↔bundled-plugin) fast path only — keeping gRPC as the public contract. Unlikely; log as risk, not plan.

**Risk (low):** protobuf `Struct` carrying large ffprobe blobs is wire-verbose. Mitigated by carrying ffprobe as `bytes` (§2.1.2), not `Struct`.

---

## Q2. Plugin SDK design for third-party developers — **DECIDED (B: proto-first, thin SDK now → full SDK before Phase 2)**

**Question (brief §416):** what shape does `pkg/sdk` (§10) take so that a third-party dev can write a Mellifera plugin without reading the core source?

**Strawman (to validate):**

A separate Go module `mellifera-plugin-sdk` providing:

1. **Capability base types** — one per capability, satisfying go-plugin's `plugin.GRPCPlugin` interface:
   - `sdk.ScannerPlugin` — implement `Scan(ctx, req) (<-chan DiscoveredFile, error)` and `Identify(...)`. The SDK handles gRPC server wiring, streaming, context cancellation.
   - `sdk.MetadataPlugin` — implement `Match`, `BuildRequest`, `Convert`, `Merge` as Go methods with typed-ish args (Struct in/out, but the SDK offers helpers to read/write Struct comfortably).
2. **`Serve(...)` entrypoint** — one call in `main.go` that wires handshake config (magic cookie), gRPC server, capability registration, signal handling. A plugin's `main.go` should be ~20 lines.
3. **Generated proto bindings** — re-exported from the SDK so plugin authors don't vendor protos themselves.
4. **Test harness** — `sdktest.NewInProcessPlugin(...)` launches the plugin's gRPC server in-process; the author writes table-driven tests against the real gRPC stubs. No subprocess needed for unit tests.
5. **CLI scaffold** — `mellifera-plugin init scanner my-scanner` generates a working skeleton (go.mod, main.go, sample test, README).
6. **Capability trait mix-ins** — e.g. a `NamespaceSafeMerger` wrapper that enforces the §3.3 namespace invariant *inside the plugin*, so a well-behaved plugin can't fail the core's post-check by construction.
7. **Localized-string + config-schema helpers** — so `LocalizedString` and `config_schema` are easy to emit correctly at handshake.

**Open sub-questions:**
- **a. Non-Go plugins.** The proto-first design *allows* Rust/Python plugins (gRPC). Do we commit to documenting the non-Go path in Phase 2, or treat it as "works if you wire it yourself"? *Default: document the proto as the public contract; ship a Go SDK only; bless non-Go SDKs as community efforts.*
- **b. SDK versioning vs proto versioning.** The SDK carries proto bindings; if proto goes v2, does the SDK major-bump? *Default: yes, SDK major == proto major; SDK minor == additive proto changes + SDK-only helpers.*
- **c. Maturity boundary.** When does the SDK leave "alpha"? *Default: after two non-bundled plugins (one of them by someone other than the core author) ship against it without forking.*

**Owner:** architect. **Decide by:** end of Phase 1 (so Phase 2 community plugins target a stable SDK).

---

## Q3. Bundled plugin distribution — **DECIDED (embedded via `go:embed`; platform matrix + signing deferred)**

**Question (brief §416):** how do base-scanner + TMDB (+ Kinopoisk) reach the user's machine?

**Decision (D11):** bundled plugins are `go:embed`-ed into the core binary as opaque data blobs and **extracted to `/data/plugins/bundled/` on first run** (idempotent — skipped when the expected version + checksum is already on disk). Plugins remain separate *processes* launched as subprocesses; they are embedded as data, not linked into the core's code, so the "not compiled into the core" constraint holds in substance. Users get a true single-file download. Runtime layout and the local manifest are identical to sibling-file distribution (architecture §8.2). Updating a bundled plugin means a new core release (acceptable for base plugins; community plugins update via the Phase 2 repo §8.1, without touching the core).

**Sub-decisions:**
- **a. Embedding mechanism — DECIDED (D11/Q20): `go:embed`.** Extraction edge cases (checksum-at-extraction, partial/corrupt-extract recovery, core-upgrade re-extraction, per-platform embedding granularity) are pinned in **Q21**.
- **b. Platform matrix.** *Default: each platform's core build embeds only that platform's plugin binaries (smaller binary; a darwin-arm64 core has no use for a linux-amd64 blob); the core refuses to start a bundled plugin whose binary doesn't match the host arch and logs clearly.*
- **c. Signature/checksum.** *Default: checksum verified at extraction (the embed carries `{blob, checksum}`); no PGP signature for Phase 1 (we trust the release channel); Phase 2 signs everything.*

**Superseded (D10):** sibling-file distribution in the release archive — weaker UX than a single-file download. The decision log records D10 as SUPERSEDED → D11.

**Owner:** architect + release engineering. **Decide by:** first releaseable build.

---

## Q4. Hybrid per-source mode within one enrichment — **DECIDED (no hybrid; queue + module priority drive multi-source)**

**Question:** a module may bind TMDB (`auth_mode: SERVER`) and Kinopoisk (`auth_mode: CLIENT`). When the user triggers Mode B for an item, do we:
- (a) run *every* source's leg in Mode B (even SERVER ones — server fetches, returns draft to user for review), or
- (b) run CLIENT sources in Mode B and SERVER sources in Mode A (background), then present the union of drafts for review?

**Trade-off:** (a) is conceptually clean (one mode per user action) but wastes the server's existing fetch for SERVER sources. (b) is efficient but the user reviews a hybrid (some drafts fresh, some background-stale).

**Default for MVP:** *pure-mode per source* — each source runs entirely in its configured `auth_mode`; Mode B is only invoked for CLIENT sources. SERVER sources enrich via Mode A on scan. The user reviews/edits happen per-source via the §5 endpoints. This is the simplest thing that proves both modes.

**Revisit:** when the UX question "show me all metadata for this item before I save anything" becomes load-bearing — likely Phase 2.

---

## Q5. SERVER-auth source used in Mode B — **DECIDED (c: Mode B is CLIENT-only for MVP)**

**Question:** if a user invokes Mode B for a source whose `auth_mode: SERVER` (e.g. wants review-before-save on TMDB), the server holds the key. Options:
- (a) server pre-fetches and returns the *raw response* to the client (client still reviews the converted draft; no second fetch). Loses the "client IP" benefit, but SERVER sources don't need it.
- (b) server mints a *short-lived, single-use proxy token* and the RequestSpec points at a core proxy endpoint that injects the real key and forwards. Client still does the fetch (through the proxy), preserving the architecture's symmetry.
- (c) disallow — Mode B is CLIENT-only; SERVER sources only ever run Mode A.

**Decision (MVP):** **(c) — Mode B is CLIENT-only; SERVER sources always run Mode A.** Simplest, and the architecture is unaffected — SERVER sources simply never take the Mode B path until this is revisited. (§4.3's prior "SERVER source in Mode B" sentence is dropped for MVP.)

**Revisit:** Phase 2, likely alongside Q4 — if review-before-save for SERVER sources becomes a real UX need, choose (a) server pre-fetches-and-returns-raw vs (b) single-use proxy token.

---

## Q6. ffprobe responsibility & failure modes — **DEFAULTED**

**Question:** who runs ffprobe — the scanner plugin or the core? And what if it fails?

**Default:** the **scanner plugin** runs ffprobe (brief §327: "base scanner bundled with the server — filesystem walker + filename parser + ffprobe call"). The core never invokes ffmpeg/ffprobe directly in MVP. This keeps "the only external runtime dep for the core" technically true (the dep is the *plugin's*; the core itself only requires SQLite + the plugin binaries).

**Implications:**
- `ffprobe_json` may be empty (`DiscoveredFile.warnings` carries the reason). The document stores `ffprobe: null`; the item is still identifiable and enrichable.
- Direct-play streaming (§stream/) needs MIME-type + container info; the stream package reads `document.ffprobe` or falls back to file extension. If both are absent, it falls back to `application/octet-stream` and serves bytes with range support best-effort.
- Transcoding (Phase 2) will need richer ffprobe data; deferred.

**Risk (low):** if ffprobe is slow on a network share, scan throughput is bounded by the plugin's ffprobe calls. Mitigation: scanner can batch / cache ffprobe by content hash. Implementation detail.

**Revisit:** if streaming MIME/codec decisions need core-side ffprobe access. Default then: add a read-only ffprobe helper in `internal/stream/` *only* for streaming, keep enrichment-side ffprobe in the scanner plugin.

---

## Q7. Merge trust boundary — reject vs quarantine on namespace violation — **DEFAULTED**

**Question (§3.3):** when the core detects a plugin's `Merge` touched another source's namespace, what happens to the *incoming* data?

**Default:** **reject the merge, revert document, mark plugin `DEGRADED`, keep the incoming metadata in an event log** (not in the document). The user sees "plugin X misbehaved; your data is unchanged." The plugin author can inspect the event log to debug. Repeated violations ⇒ plugin auto-disabled (configurable threshold, default 3 in 24h).

**Alternative considered:** *quarantine* — write the incoming data to a side table for manual recovery. Rejected for MVP (extra surface); the event log captures enough to retry manually.

**Revisit:** if real-world third-party plugins hit this often (would indicate the SDK should enforce the invariant harder — Q2 trait mix-in).

---

## Q8. Document schema validation strictness — **DEFAULTED**

**Question:** §2.4.1 lets a module declare a `document_schema` (JSON Schema). How strictly does the core enforce it on write?

**Default:** **structural, lenient.** The core validates the *top-level required keys* (`identifiers`, `sources`, `_view`, etc.) and rejects writes missing them. It does NOT enforce the full JSON Schema (nested types, regex patterns) on every write — that's expensive on large docs and brittle during schema evolution. Full validation is available via an explicit `?validate=strict` query param on the save endpoint, used by the UI's "validate" button.

**Revisit:** if data-quality issues emerge from lenient validation (would surface as UI bugs, not data loss, because Tier 2 namespaces are isolated).

---

## Q9. Draft token storage — DB vs in-memory — **DEFAULTED**

**Question (§5.4):** drafts live in SQLite. Is that over-engineered for MVP?

**Default:** **SQLite `drafts` table.** Reasons: (1) survives core restart within TTL (a real UX win — user starts a Mode B fetch, the core auto-updates, the draft is still valid), (2) consistent with single-source-of-truth storage, (3) the table is small (TTL'd, indexed on `expires_at` for cheap cleanup). In-memory was rejected because core restart losing all in-flight Mode B sessions is a poor UX.

**Cost:** one indexed table, one cleanup query on a cron. Negligible.

**Revisit:** never, unless SQLite proves a bottleneck (it won't for draft volumes).

---

## Q10. URL template language — minimal `{var}` vs RFC 6570 — **DECIDED**

**Question (§2.1.4):** the RequestSpec `url_template` uses minimal `{name}` substitution, not full RFC 6570 URI templates. Sufficient?

**Decision:** **minimal `{name}`**, with the core doing percent-encoding of substituted values. RFC 6570 (`{?a,b}`, `{/path}`, explosion operators) is more expressive but adds a dependency and a spec surface; the upstream APIs in scope (TMDB, Kinopoisk, TVDB, MAL) are all flat query-string APIs that minimal substitution covers.

**Revisit:** if a plugin genuinely needs RFC 6570 features. Plugin can always pre-build the URL in `BuildRequest` and return a template with zero variables — escape hatch exists.

---

## Q11. Plugin resource limits (CPU/memory/time) — **DECIDED (none for MVP; cgroups/jobs in Phase 2)**

**Question:** a misbehaving plugin can hog CPU or leak memory. Limits?

**Default for MVP:** **none beyond go-plugin's process isolation.** A crash is contained; a slow plugin times out per-RPC (configurable, default 30s for Match/Convert, 120s for Scan streaming). The core's health polling catches stuck subprocesses.

**Phase 2:** platform cgroups/rlimits/jail on the subprocess (Linux: cgroups v2; macOS: `sandbox-exec`; Windows: job objects). Non-trivial; deferred.

**Risk (medium):** a plugin that doesn't crash but slowly leaks degrades the host. Mitigation in MVP: log memory growth per plugin; surface in health `details`. Admin restarts.

---

## Q12. Capability versioning across plugins — **DECIDED (A: coexist via versioned FQN)**

**Question:** two plugins both declare `type: metadata_source` but one targets proto `v1` and the other `v2`. Can they coexist?

**Default:** **yes.** The capability registry keys on `(plugin_id, capability_id, proto_service_fqn)` where the FQN includes the version (`mellifera.metadata.v1.MetadataSource` vs `.v2.`). The core supports N and N-1 proto majors simultaneously. Module configs implicitly target the version their plugin speaks.

**Open:** how does a module config *express* a version preference if a plugin speaks both? *Default: it doesn't pick; the plugin's latest stable wins, with a `prefer_proto_version` override available.*

**Revisit:** when v2 actually arrives (years out).

---

## Q13. Enrichment dispatch, per-item concurrency & loop-safety — **DECIDED (see architecture §4.4)**

**Question:** when an item has N metadata sources, do we run their pipelines serially or in parallel, how is dispatch coordinated so a picked item is not available to other plugins until released, and how do we avoid retry loops on chronically-failing entities?

**Decision:** enrichment is dispatched from an **in-process work queue derived from the `items` table** (a document's written `sources.*` = done work) with **in-memory per-item leases** — at most one plugin holds an item at a time (parallelize across items, serialize within an item). No queue table, no external broker, near-zero queue-write overhead. A plugin that fails or finds no data releases the item for the next source (fallback). **Loop-safety:** a tiny durable `enrichment_failures` ledger records terminal exhaustion / no-data with an exponentially-growing cooldown (7d → 14d → 28d, capped), so a failing entity is re-picked at most once per cooldown window and never loops forever — and the cooldown survives restart. Crash-safety comes from re-deriving pending work from `items` on restart; "what was not processed" is always answerable (pending ∪ ledger). Full design: architecture §4.4 + ledger table §9.1.

**Phase 2 options:** (a) narrow the lease to per-`(item,plugin)` for concurrent multi-plugin enrichment on one item; (b) move leases to the DB for multi-instance core deployments.

**Revisit:** when a module ships with 3+ sources and per-item serialization becomes a throughput bottleneck, or when multi-instance deployment is required.

---

## Q14. Streaming playback protocol — **DEFAULTED**

**Question (brief §347):** MVP playback is "direct play / direct stream over HTTP with range requests, no transcoding." Confirm?

**Default:** **yes.** `GET /api/v1/items/{id}/stream` serves the file bytes with `Accept-Ranges: bytes` and honors `Range` requests. MIME from `document.ffprobe` or file extension. No HLS, no transcoding, no ABR. Sufficient for LAN direct play of compatible files.

**Revisit:** Phase 2 transcode work (separate capability type `transcoder`, already reserved in §1.4).

---

## Q15. Authentication & authorization — **DECIDED (i: single admin token for MVP; grounded for Phase 2)**

**Question:** the MVP is single-user (brief §359: multi-user is Phase 2). The API needs a gate if exposed beyond localhost — and the design must not paint Phase 2 multi-user into a corner.

**Decision (MVP):** **single shared admin token** (option i). `admin_token` in `config.toml` (or `MELLIFERA_ADMIN_TOKEN`), auto-generated on first run, sent as `Authorization: Bearer <token>`. Bind to `127.0.0.1` by default; an explicit `listen = 0.0.0.0` is required to expose, with a loud warning. The stream endpoint uses a short-lived stream token minted from the Principal (admin token never in a URL). No user accounts, no per-item ACLs.

**Grounding for normal (multi-user) auth:** the middleware resolves a **`Principal`** (not a bool) — MVP `Principal{admin:true}`, Phase 2 `Principal{user_id, roles, library_acls}`. Token + (future) session resolvers both produce a Principal behind one interface; handlers receive a Principal so signatures don't change. The `libraries` table (§9.1) already exists for per-library ACLs; Phase 2 adds `users`/`sessions`/`library_acls` additively. Full detail: architecture §11.5.

**Revisit:** Phase 2 multi-user — lands as new resolvers + tables, not an API rework.

---

## Q16. Module hot-reload — **DEFAULTED**

**Question (§7.4):** can a module config change take effect without a core restart?

**Default:** **yes for `options`/`display`/`priority` changes** (they're read per-enrichment from the `modules` table); **no for `scanner`/`metadata_sources` plugin binding changes** when the plugin binary itself must change (requires subprocess restart). The API exposes `POST /api/v1/modules/{id}:reload` to re-read config; binding changes to already-running plugins are applied on next enrichment call.

**Revisit:** if binding changes should immediately spawn/kill subprocesses. Phase 2.

---

## Q17. Telemetry / phone-home — **DECIDED**

**Question:** does Mellifera phone home with usage telemetry?

**Decision:** **no, ever.** Self-hosted, privacy-respecting. The only outbound network the core initiates: (1) plugin repo manifest fetch (Phase 2, user-initiated), (2) Mode A upstream fetches (user-configured). No analytics, no version-check ping by default. A user may *opt in* to a release-channel RSS check for update notifications; off by default.

---

## Q18. Licensing of plugins and SDK — **DECIDED (Apache-2.0; DCO, no CLA)**

**Question:** what license for the core, the SDK, and bundled plugins?

**Default:** *core + SDK + bundled plugins: a permissive license (MIT or Apache-2.0) to maximize community plugin adoption.* Community plugins: whatever their authors choose.

**Open:** contributor License Agreement for PRs? *Default: no CLA, just DCO sign-off (`Signed-off-by`).*

**Decide by:** first public release. Legal review needed.

---

## Q19. Error surface across the wire — **DECIDED (A: split model — gRPC codes for transport, domain Error for enrichment)**

**Question:** plugin RPCs return `Error` (§2.1.3 Convert) for some; others use gRPC status codes. Inconsistent?

**Default:** **gRPC status codes for transport/protocol errors** (unavailable, deadline-exceeded, unauthenticated); **domain `Error` messages for enrichment-domain failures** (upstream 404, parse error, rate limited). The core translates gRPC status codes to HTTP status in the API surface; domain `Error` flows into the response body's `error` field.

**Revisit:** if plugin authors find the split confusing — would document harder or collapse to one model.

---

## Q20. "Single binary" delivery — **DECIDED (ii: `go:embed` + first-run extraction)**

**Question (cross-cuts Q3a):** the brief says both "single Go binary core" (§313, §422) and "plugins are SEPARATE binaries, NOT compiled into the core" (§223, §424). These are in slight tension if "single binary" means *one file on disk*. Three readings:

- (i) "single binary" = one core process; plugins are separate files alongside. (Current `architecture.md` assumption.)
- (ii) "single binary" = one distributable file (e.g. `mellifera`), with plugin binaries `go:embed`-ed inside and extracted to `/data/plugins/bundled/` on first run. Still separate *processes*; not compiled *into the core's code*.
- (iii) "single binary" strictly = one file, no extraction, plugins compiled in. **Violates the hard constraint** — rejected.

**Decision:** **(ii) — `go:embed` plugin blobs into the core, extract to `/data/plugins/bundled/` on first run.** True single-file download; plugins stay separate *processes* (subprocesses), embedded as opaque data not linked code. Runtime layout identical to sibling-file distribution; only the delivery path changes (architecture §8.2). Updating a bundled plugin requires a new core release (acceptable for base plugins; community plugins update via the Phase 2 repo).

**Rejected:** (i) sibling files — weaker UX; (iii) compiled-in-as-code — violates the hard constraint.

**Decided:** 2026-07-20.

---

## Q21. Embedding first-run extraction edges (Q20/D11 implications) — **DEFAULTED**

**Question:** the `go:embed` + first-run extraction flow (architecture §8.2) has edge cases not yet pinned: checksum verify *at extraction* (not just at upstream download), partial/corrupt-extract recovery, re-extraction on core upgrade, and per-platform embedding granularity.

**Default:**
- **Verify at extraction:** the embed carries `{blob, sha256}`; on extract the core recomputes and compares. Mismatch ⇒ the core build is malformed — log loudly, refuse to start that bundled plugin, and do NOT silently re-download (bundled plugins have no download source in MVP; a bad checksum means a bad core release).
- **Atomic extract:** write to `<path>.tmp` then `rename`; a crash mid-extract leaves only the temp file, which the next boot's idempotency check treats as "missing" → re-extract. No partial binary ever launches.
- **Core upgrade:** each core version embeds its own plugin set with versions; on boot, extract any bundled `(plugin, version)` whose checksum isn't already on disk. If the new core bundles a newer version of an already-present plugin, extract the new version, repoint the manifest at it, and leave the old version directory for the janitor (quarantine → TTL purge, §7.5) — no in-place overwrite, keeping rollback viable within the TTL.
- **Per-platform:** each platform's core build embeds only that platform's plugin binaries (smaller binary; a darwin-arm64 core has no use for a linux-amd64 blob).

**Revisit:** if a bundled plugin ever needs first-run *download* (e.g. license/size constraints) — Phase 2 "slim installer."

**Owner:** architect + release engineering.

---

## Q22. Enrichment-failure ledger: admin API & observability (Q13 implication) — **DEFAULTED**

**Question:** §4.4 makes the failure ledger the answer to "what's terminally failed" and offers a manual-clear escape hatch — but no API endpoint exposes it. What's the MVP surface?

**Default (ship minimal in MVP — loop-safety is an MVP feature, so the escape hatch must be reachable):**
- `GET /api/v1/admin/enrichment-failures?module_id=…&plugin_id=…&status=exhausted|no_data` → list `{item_id, plugin_id, status, reason, attempts, failed_at, next_eligible_at}`.
- `DELETE /api/v1/admin/enrichment-failures/{item_id}/{plugin_id}` → clear the row; the pair becomes immediately derivable into pending (next queue tick picks it up).
- `POST /api/v1/items/{item_id}/metadata:retry` → convenience: clears all `exhausted`/`no_data` rows for the item across plugins, triggers immediate re-derivation.

All three are admin-Principal-gated (§11.5). No per-user variant in MVP. They follow the §11.6 error model like every other endpoint.

**Revisit:** if the list needs pagination/filtering at scale (large libraries with many failures) — Phase 2.

**Owner:** architect.

---

## Q23. Stream-token endpoint shape (Q15/D18 implication) — **DEFAULTED (stateless HMAC chosen; single-use semantics soft)**

**Question:** §11.5 references a short-lived stream token (media players can't send Bearer headers). The endpoints (`POST /api/v1/items/{id}/stream-token`, `GET /api/v1/items/{id}/stream?token=…`) and the token's enforcement model aren't yet specified.

**Default:**
- **Mint:** `POST /api/v1/items/{id}/stream-token` (Principal-authenticated) returns `{token, expires_at}`. TTL default **5 min**.
- **Redeem:** `GET /api/v1/items/{id}/stream?token=…` serves bytes with range support; the token is validated (signature + not-expired + scope match).
- **Scope:** the token is bound to `(principal_id, item_id)` — it authorizes streaming *that one item* for *that principal* only.

**Open sub-question — single-use vs TTL-only (DEFAULTED to stateless):**
- (a) **Stateless HMAC token** (default): `{item_id, principal_id, exp}` signed with a core secret. No DB write per play. "Single-use" is approximated by the short TTL (a captured token is valid up to 5 min for that one item). Simple, zero DB writes on the hot path.
- (b) **Stateful single-use:** token backed by a DB row, marked consumed on first byte served. True single-use (replay rejected) but adds a write per play + a token table.

**Decision (default):** **(a) stateless HMAC.** A captured stream token only authorizes streaming one file the principal could already access, for ≤5 min — the blast radius doesn't justify DB writes on every play. Revisit if multi-user Phase 2 raises the stakes.

**Revisit:** Phase 2 multi-user — re-evaluate (b) if token capture across users becomes a real threat.

**Owner:** architect.

---

## Q24. Single-instance boundary (Q13 implication) — **DEFAULTED (single-instance enforced; multi-instance is Phase 2)**

**Question:** the derived in-memory work queue, in-memory leases, and a single janitor assume exactly one core process. The `enrichment_failures` ledger and `drafts` are in SQLite (shared-survivable). What breaks if two core processes share the DB, and where is the boundary?

**Breaks under multi-instance:**
- **Leases** (in-memory): two instances could both claim one item → duplicate enrichment work, racing merges (last-write-wins, potential view flapping).
- **Janitor** (§7.5): both instances run it → redundant sweeps, possible double-purge race.
- **Plugin subprocesses:** each instance launches its own — fine (isolated), but wasteful.

**Doesn't break:** ledger (SQLite-shared, reads fine); drafts (already scoped by `core_instance`, instance-isolated by design); document storage (SQLite file-locking prevents corruption; performance degrades under cross-instance writer contention).

**Default (MVP boundary — stated explicitly):** **exactly one core process per SQLite database.** On boot the core acquires an instance lock — a sentinel row in a `core_lock` table (or a `flock` on a sidecar file) held for the process lifetime. A second core that finds the lock held **refuses to start** with a clear error ("database is owned by another mellifera instance; use a separate --data-dir"). No split-brain detection, no leader election.

**Revisit:** Phase 2 multi-instance / HA — requires DB-backed leases, janitor leader-election, and a single-writer coordination layer.

**Owner:** architect.

---

## Q25. Capability versioning — no compatible major registered (Q12/D16 implication) — **DEFAULTED**

**Question:** Q12 lets plugins targeting different proto majors coexist (core supports N + N−1). What if a module references a plugin whose only registered capability targets a proto major the core doesn't support, or sets `prefer_proto_version` to a major the plugin doesn't speak?

**Default (reflected in architecture §2.2.4 and §2.4.2 binding-semantics #7):**
- The `Plugin` handshake is versioned separately (always v1-stable) and always succeeds; a capability declaration with an unsupported `proto_service` FQN is **skipped + warned**, not registered.
- Module configs referencing a skipped capability go **`degraded`** (same path as a missing plugin, §2.4.2). The UI surfaces "plugin X requires a newer core."
- `prefer_proto_version` is honored if available; otherwise the core falls back to the plugin's latest stable major that the core supports, and warns. The preference never causes a hard failure.

**Revisit:** when v2 of a capability proto is actually drafted (years out) — confirm the skip + degrade UX holds under real upgrade paths.

**Owner:** architect.

---

## Q26. Build, release & SBOM implications of embedding + Apache-2.0 (Q18/Q20 implications) — **DEFAULTED (SBOM format open)**

**Question:** `go:embed` (Q20) + Apache-2.0 (Q18) make the release binary a composite artifact (core code + embedded plugin binaries + their transitive deps). What build pipeline, license, and SBOM obligations follow?

**Default:**
- **Build pipeline (ordered):** stage 1 builds each plugin binary for the target `{os,arch}` (separate Go modules, §10); stage 2 `go:embed`s the platform-matched plugin blobs into the core and builds the core. CI matrix = platforms × (plugins-then-core). Reproducible builds pinned by Go version + dep lockfiles.
- **Licensing:** `LICENSE` + `NOTICE` at repo root; Apache-2.0 headers enforced by CI lint on every `.go` file (core, SDK, bundled plugins). Bundled plugins are Apache-2.0 (same as core) so the composite artifact stays single-license.
- **SBOM:** generated per-release, covering the core **and** every embedded plugin's transitive deps (because they ship inside the binary). Community (installed) plugins are **not** in the core SBOM — their compliance is the user's responsibility.
- **DCO:** enforced via `Signed-off-by` trailers on every commit; no CLA.

**Open sub-question — SBOM format:** SPDX vs CycloneDX. *Default: SPDX-2.3+ (broadest tooling); revisit if the chosen release toolchain prefers CycloneDX.*

**Revisit:** first public release (release-engineering toolchain choice); whenever a bundled plugin's deps change license.

**Owner:** architect + release engineering.

---

## Q27. CLIENT-source enrichment UX contract (Q4 + Q5 + Q13 interaction) — **DEFAULTED**

**Question:** CLIENT-auth sources (Kinopoisk) are excluded from the background queue (they can't be auto-fetched — §6.3). How does the UI tell the user "metadata is available for this item, fetch it yourself," and how does a `no_data` cooldown interact with that prompt?

**Default (queue-scoping semantics nailed in §4.4 and §6.3; UX details for the prototype pass):**
- **Per-item, per-CLIENT-source indicator:** an item whose applicable CLIENT source has no namespace AND no active `no_data` cooldown shows a "fetch available" affordance in the UI (badge + the plugin's `display_name`). This is **derived**, not stored: `applicable(item, plugin) AND namespace absent AND no ledger row within cooldown`.
- **Mode B entrypoint:** the affordance hits `POST /api/v1/plugins/{id}/request-spec` (§5.1) with `auth_mode: CLIENT`.
- **`no_data` feedback loop:** if the user's Mode B fetch returns no data (or Convert fails), the failure ledger gets a `no_data` row with cooldown (§4.4), so the UI stops offering the fetch until cooldown expires — the user is not badgered to re-fetch a known-empty source. Manual clear (Q22) re-enables it immediately.
- **No background pressure:** the core never auto-prompts; the indicator is passive. The user chooses when to spend their own quota / IP on a CLIENT fetch.

**Revisit:** if bulk "fetch all CLIENT metadata for this library" becomes a needed UX (likely Phase 2 — still per-source user-initiated, but batched).

**Owner:** architect + frontend.

---

## Q28. Image handling: direct upstream URLs vs proxy/cache — **DEFAULTED (direct URLs MVP; proxy/cache Phase 2)**

**Question:** `_view.poster` / `_view.backdrop` (§3.1) currently point at upstream CDNs (TMDB image CDN, Kinopoisk). Upstream image URLs are fragile — region-locked (Kinopoisk), rate-limited, or they expire. Serve them directly, or proxy/cache through the core? (Prior art: Plex and Jellyfin both run an image cache — see `docs/prior-art.md`.)

**Default (MVP):** **direct upstream URLs.** The client fetches images itself. Simplest — no image subsystem in MVP. Acceptable because images are display-only and a missing poster degrades gracefully (placeholder). The merge (§3) preserves *every* source's image, so the display policy can fall back from a broken Kinopoisk URL to TMDB.

**Phase 2:** a small **image proxy + cache** — `GET /api/v1/images/{itemId}/{kind}` → the core fetches once (with the configured credential, so region-locked images resolve server-side), caches to disk, serves cached bytes. Survives offline / upstream-changes; enables thumbnail / keyframe generation later.

**Risk (R14):** Kinopoisk poster URLs may be region-locked or expire; users in some regions see broken images for that source. Mitigated by source-fallback in the display policy.

**Revisit:** when region-locked / expired image URLs cause visible breakage, or before Phase 2 offline support.

---

## Q29. `exiftool` responsibility & failure modes (image EXIF) — **DEFAULTED (B2 realized)**

**Question:** who runs `exiftool` for image EXIF, and what happens if it is missing? (Sibling of Q6, the ffprobe pattern.)

**Default:** the **image-enricher plugin** runs `exiftool` (`exec.CommandContext` arg-slice, `-j -n <selected tags> <absPath>` — NEVER a shell); the **core never invokes exiftool**. The plugin calls `exec.LookPath("exiftool")` on every `Convert`; a missing / non-zero / timeout / non-JSON / empty result is a **per-source SOFT-FAIL** (empty metadata → B1 `no_data` terminal → 30-day cooldown → settle — AC-6). It is NEVER a startup or build failure. This keeps "the only external runtime dep for the CORE is ffmpeg/ffprobe" true (exiftool is the *image-enricher plugin's* dep, exactly as ffmpeg/ffprobe is the *base-scanner plugin's* — Q6 framing). Install: `brew install exiftool` (macOS) / `apt install libimage-exiftool-perl` (Debian/Ubuntu). Operator runbook: `docs/operator-runbook.md` (§1 runtime deps).

**Replaces** the earlier pure-Go `bep/imagemagick` / `imagemeta` direction (user plan-review decision): exiftool supplies HEIC/RAW natively and adds NO Go module dependency (AC-2/S8), preserving the pure-Go / no-CGO guarantee.

**Risk (low):** a host without exiftool gets image items with no EXIF provenance (they still discover + carry jpeg/png stdlib base dims + settle via cooldown). Mitigated by the soft-fail + the runbook. RAW discovery (`.cr2/.nef/.arw/.dng`) is deferred — exiftool reads RAW natively, so adding the extensions to `imageMime` is the only change needed.

**Revisit:** if a pure-Go EXIF path is later desired to drop the runtime dep, or when RAW discovery is added.

---

## Risk register (summary)

| # | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | Plugin subprocess instability on low-RAM hosts | Med | Med | Crash detection + backoff restart (§7.3); health polling; resource limits Phase 2 (Q11) |
| R2 | Third-party plugin corrupts document | High | Low | Namespace-write invariant + post-call validation + auto-disable (Q7); SDK trait mix-in (Q2) |
| R3 | Upstream API (Kinopoisk) changes shape, breaks Convert | Med | Med | Per-plugin versioning; `min_core_version` + plugin upgrades; `warnings` surface in UI |
| R4 | ffprobe absent or slow on exotic hosts | Low | Med | `ffprobe_json` optional (Q6); MIME fallback by extension; Phase 2 caching |
| R5 | SQLite write contention under heavy scan + enrichment | Med | Low | WAL mode; single-writer transactions; batch inserts in scan (§9.3) |
| R6 | Mode B draft token leakage / replay | Med | Low | Opaque random tokens, single-phase, short TTL, core-instance scoped (§5.4) |
| R7 | Russian-language field gaps (a source lacks `ru`) | Low | Med | `language_preference` fallback chain (§3.2); UI shows source-of-truth per field |
| R8 | ~~Constraint tension: "single binary" vs "separate plugin binaries"~~ — **RESOLVED** by D11 (`go:embed` + first-run extraction). Remaining extraction-edge risks moved to Q21 / R11. | — | — | Resolved 2026-07-20 |
| R9 | Plugin SDK churn breaks community plugins | Med | Med | SDK major == proto major; deprecation policy (§11.3); SDK maturity gate (Q2c) |
| R10 | gRPC overhead on big ffprobe blobs | Low | Low | Carry as `bytes` not `Struct` (§2.1.2); streaming Scan avoids one giant response |
| R11 | Embedded plugin blob corrupt / partial extraction (Q20/D11) | Low | Low | Atomic temp-file + rename; idempotent re-extract on boot; SHA256 verify at extract (Q21) |
| R12 | Multi-instance core sharing one SQLite DB (in-memory leases + janitor) | Med | Low (MVP is single-instance) | Boot-time instance lock; documented single-instance boundary (Q24) |
| R13 | Stream-token replay / capture (Q15/D18) | Med | Low | Short TTL (~5 min), per-item scope; stateless HMAC token — single-use approximated by TTL (Q23) |
| R14 | Upstream image URLs region-locked / expire (Kinopoisk posters) | Low | Med | Display-policy fallback to another source's image (§3); Phase 2 image proxy/cache (Q28) |

---

## Decision log

| # | Decision | Status | Date | Reference |
|---|---|---|---|---|
| D1 | gRPC over net/rpc for plugin transport | DECIDED | 2026-07-20 | Q1 / arch §2 |
| D2 | Dynamic JSON (`Struct`/`bytes`), no typed DTOs | DECIDED | 2026-07-20 | arch §2.1, §3.1 |
| D3 | Namespaced document + recomputable view | DECIDED | 2026-07-20 | arch §3 |
| D4 | Draft tokens in SQLite, TTL'd, single-phase | DECIDED | 2026-07-20 | arch §5.4 / Q9 |
| D5 | Minimal `{var}` URL template, not RFC 6570 | DECIDED | 2026-07-20 | arch §2.1.4 / Q10 |
| D6 | No telemetry, ever | DECIDED | 2026-07-20 | Q17 |
| D7 | MVP playback = direct play + range only | DECIDED | 2026-07-20 | arch §12 / Q14 |
| D8 | Serial enrichment in priority order for MVP | DEFAULTED | 2026-07-20 | Q13 |
| D9 | Mode B is CLIENT-auth sources only for MVP | DEFAULTED | 2026-07-20 | Q5 / arch §4.3 |
| D10 | Bundled plugins ship as sibling files (pending Q20) | SUPERSEDED | 2026-07-20 | Q3 / arch §8.2 → see D11 |
| D11 | Single-file delivery via `go:embed` + first-run extraction | DECIDED | 2026-07-20 | Q20 / arch §8.2 |
| D12 | Apache-2.0 (core + SDK + bundled); DCO, no CLA | DECIDED | 2026-07-20 | Q18 |
| D13 | No plugin resource limits for MVP (isolation + timeouts) | DECIDED | 2026-07-20 | Q11 |
| D14 | No hybrid mode — queue + module priority drive multi-source | DECIDED | 2026-07-20 | Q4 / arch §4.3, §4.4 |
| D15 | Proto-first thin SDK now, full SDK before Phase 2 | DECIDED | 2026-07-20 | Q2 |
| D16 | Capability versioning: coexist via versioned FQN (N + N−1 majors) | DECIDED | 2026-07-20 | Q12 |
| D17 | Error surface: split model (gRPC codes transport; domain Error enrichment) | DECIDED | 2026-07-20 | Q19 |
| D18 | Auth: single admin token for MVP; Principal abstraction grounds Phase 2 multi-user | DECIDED | 2026-07-20 | Q15 / arch §11.5 |
| D19 | Mode B is CLIENT-only for MVP; SERVER sources run Mode A | DECIDED | 2026-07-20 | Q5 / arch §4.3 |
| D20 | Playback progress & resume: `playback_progress` table + GET/POST endpoints (prior-art: Kodi `bookmark` / Jellyfin `UserData`) | DECIDED | 2026-07-21 | arch §5.5, §9.1 / prior-art.md |
| D21 | Image EXIF via the system `exiftool` subprocess (os/exec arg-slice, no CGO, no Go module dep); HEIC read natively; missing exiftool soft-fails per-source | DECIDED | 2026-07-30 | Q29 / arch §1.2 / image-enrichment D-2 |

---

## Next step

This document is a living companion to `architecture.md`. **Q1–Q20 are DECIDED or DEFAULTED — none OPEN.** Q21–Q27 (2026-07-20 reconciliation pass) surface edges *implied by* the locked decisions; **Q28** (2026-07-21 prior-art pass) covers image handling (direct URLs vs proxy/cache); **Q29** (2026-07-30, `image-enrichment` Phase B2) records the `exiftool` runtime-dep decision (sibling of Q6). All are DEFAULTED with named revisit triggers; none block the §2 foundational contracts from freezing, and none reopen D1–D19 (D21 is additive — B2 EXIF via exiftool).

**HALT for review of both documents.**
