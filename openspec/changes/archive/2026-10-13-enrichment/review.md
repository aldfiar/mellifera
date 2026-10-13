# Review: enrichment — GATE 2 step 1

Reviewer: @wf-reviewer · 2026-10-13 · Evidence basis: every probe re-run this
session from the repo root; `wf change check enrichment` re-run green (rc 0,
17/17 probes re-run, coverage requirements=11 probe_backed=11 gaps=0);
implementation read against the three spec deltas. Handoff records treated as
belief; every load-bearing claim re-verified against the folder and the code.

## Overall verdict

**PASS with FLAGs.**

All 17 box probes green (re-run, not taken from records); the full Go gate
exit 0; the implemented behavior matches the spec deltas on every requirement,
with four recorded deviations confirmed sound; the single UNPROBEABLE scenario
is confirmed by inspection; the standards axis is clean modulo the FLAGs below.
Nothing found blocks archive; the FLAGs are wording drift and follow-up
hardening, recorded here for the archive decision.

## Axis 1 — Probes: PASS

Every box probe executed verbatim from the repo root this session:

| Box | Probe id | Command | Result |
|-----|----------|---------|--------|
| 1.1 | e4d64331393b8a32 | `go test ./plugins/shikimori -run TestMatch` | ok |
| 1.2 | f4a7aefbf5037d8b | `go test ./plugins/shikimori -run TestBuildRequest` | ok |
| 1.3 | 2f6be9881ac2a6ff | `go test ./plugins/shikimori -run TestConvert` | ok |
| 2.1 | f233833364b389eb | `go test ./internal/enrich -run TestIdentityAnchor` | ok |
| 2.2 | 43065bee968f0723 | `go test ./internal/enrich -run TestFetchSource` | ok |
| 3.1 | 914b286412f19be1 | `go test ./internal/enrich -run TestReenrichSource` | ok |
| 3.2 | a1bc96f6b9fef173 | `go test ./internal/enrich -run TestReenrichStatusFlip` | ok |
| 3.3 | 8d88afe40e771705 | `go test ./internal/enrich -run TestBootSweep` | ok |
| 3.4 | 1773ffc2a915df71 | `go test ./internal/enrich -run TestReenrichFlatCooldown` | ok |
| 4.1 | 14f57c1338b8878b | `go test ./internal/api -run LibraryRefresh` | ok |
| 4.2 | 3d01781627b5cdf6 | `go test ./internal/api -run EnrichPreview` | ok |
| 4.3 | db7696a0a33a97ab | `go test ./internal/api -run EnrichFailures` | ok |
| 4.4 | c307d6069013f76b | `go test ./internal/api -run ParsersChanged` | ok |
| 5.1 | eb6f83a0598b609d | `go test ./internal/module -run TestSerialModuleSeedV2` | ok |
| 5.2 | 2e87e40f064499a3 | `make build && go vet ./cmd/...` | ok |
| 6.1 | c15847567fe4d92a | `go test ./internal/itest -run TestShikimoriJoint` | PASS 7.12s (real plugin subprocesses) |
| 6.2 | ebd254ceacffd32c | `make build check test lint` | exit 0 (full chain run by reviewer) |

Spec-only probe additionally executed: `go test ./internal/module -run
TestSerialModuleV1Upgrade` (spec scenario 9dd0e093aa9688c7) — ok. All
remaining spec probe ids share the box commands above (TestMatch ×3,
TestBuildRequest ×2, TestConvert ×2, TestFetchSource ×4, TestIdentityAnchor
×2, TestReenrichSource ×3, LibraryRefresh ×3) — covered by the same runs.

## Axis 2 — Spec vs implementation: PASS (4 recorded deviations judged sound; 3 FLAGs)

### Requirement-by-requirement evidence

- **Document-shape match dispatch** — `plugins/shikimori/source.go:77-141`:
  anchored id wins first (:78-86, reason `matched by shikimori_id %d` at :83),
  episode docs never apply (:88-90), serial-record applies as anime search —
  title from parsed or derived from `dir_name_raw`/`series_relative_path`
  (:93-122, seriesname.go), film-parsed applies as movie-kind search
  (:135-140). Matches the shikimori-enrichment delta's three shapes + anchor.
- **Anonymous request contract** — source.go:177-183: User-Agent header
  unconditional (:180, `mellifera/` + version at :261), `min_interval_ms` 700
  (:217, :182), variables string/int only — no secret kinds (:163-176);
  anchored → `GET /api/animes/{shikimori_id}` (:251), search → bounded page
  (`limit=10`, :255); `{placeholder}` substitution only.
- **RU-first conversion namespace** — `plugins/shikimori/convert.go:148-164`:
  title{romaji,russian}, kind, status, episodes, aired_on, description,
  genres (RU-first :168-178), score, url, poster (made absolute :308-313);
  `resolved_ids {shikimori_id}` (:39); provenance hints plugin_version +
  source_url (source.go:291-304); candidate selection prefers year + kind +
  episode count, deterministic and non-erroring on zero agreement
  (convert.go:104-130, strict-greater keeps upstream order); Merge writes ONLY
  `sources.<plugin_id>` and strips `resolved_ids` before the namespace
  (source.go:193-212) — namespace validation polices it (chain.go:151-169).
- **Serial module seed v2** — `internal/module/registry.go`: serial seed at
  schema_version 2 with the shikimori binding (priority 3, enabled, no
  auth_mode → queueable) after serial-parser (1) and frame-grabber (2), and
  the first display block (`language_preference ["ru","en"]`, shikimori in
  title + rating source priorities); `upgradeSerialConfigSQL` = guarded
  `UPDATE … WHERE id='serial' AND schema_version < 2` run after the
  `INSERT OR IGNORE`, touching no other row. Zero Go renderer change (no
  renderer file in the diff).
- **Core-side fetch + pacing** — `internal/enrich/fetch.go:84-130`: GET/POST
  whitelist (:85-88), full {var} resolution before substitution (:89-96),
  percent-encoding (:161-180, QueryEscape so values are safe in path and
  query), `timeout_seconds` honored (:102-106), ConvertRequest populated with
  body/status/headers (:129); `redacted_ref` fails explicitly BEFORE any
  network attempt (:148-149, errRedactedRef :30). Gate: `FetchGate` keyed by
  plugin id, slot reserved under mutex before waiting (:60-75) so concurrent
  workers serialize at the interval; injectable clock (:53-55); process-wired
  via `Deps.FetchGate` (`internal/enrich/enrich.go:51-56`,
  `cmd/mellifera/main.go:178` `enrich.NewFetchGate()`) — never a package var;
  worker path passes it (`worker.go:309`); sync path deliberately unpaced
  (`chain.go:113`, documented). Per-plugin independence: `last` map keyed by
  plugin id.
- **Identity anchoring** — `internal/enrich/chain.go:65-69` reads
  `doc["identifiers"]` into `MatchRequest.existing_ids` (nil on first
  enrich, :127-133); `internal/enrich/enrich.go:242-252` writes
  `resolved_ids` into `doc["identifiers"]` — a core-side write outside
  namespace validation, exactly as the plugin-pipeline delta requires.
- **Explicit re-enrichment** — `internal/enrich/reenrich.go:54-77`: scope =
  explicit rowIDs verbatim, else rows carrying the namespace or a
  within-cooldown ledger row (:82-111); per-row non-blocking lease under a
  distinct owner tag (:117-118); `stripSource` purges exactly
  `sources.<pid>` + `_provenance[plugin_id==pid]` + `_view[source==pid]`
  (:147-174), never `identifiers` (not referenced) — title_overrides is a
  separate table, structurally unreachable; `ClearFailure` per processed row
  (:135); one bounded retry pass after 20 ms (:63-72, :19); counts
  {stripped, deferred}; `Notify` at finish guarded by queue running
  (:73-75). Status flip ONLY on rows actually stripped (`:128-133` +
  `state.go:89-90` — the two new legal transitions
  `{ready,enriched} --refresh--> pending`; the transitions table is the only
  path, illegal flips still rejected). Flat cooldown: `worker.go:362-363`
  consumes the explicit marker → `explicitCooldown` (:93-95, flat
  `NoDataCool`, no doubling); automatic runs keep `terminalCooldown`
  doubling (:71-86).
- **Fresh-boot registration** — `internal/enrich/queue.go:225-242`
  `seedLibs` backfills the known-library registry from `Store.ListLibraries`
  when empty, wired at `Start` (:162) before the initial sweep (:167) — the
  backlog's vacuous-fresh-boot bug is fixed and is the re-enrich crash
  self-heal foundation.
- **Admin API** — `internal/api/enrich_admin.go`: refresh handler maps
  nil-closure → 503, unknown library → 404, missing plugin_id → 400 before
  the closure; sentinel mapping `ErrRefreshInFlight` → 409
  `refresh_in_flight`, `ErrUnknownPlugin` → 400, `ErrUnknownRows` → 404,
  else 202 with `{queued, stripped, deferred}` (:110-154). Preview handler =
  pure pass-through of the on-demand DTO (:173-202; DTO :53-59 — versions
  histogram computed on demand, drift never stored). Failures route serves
  `Store.ListFailures` raw with best-effort row_kind/title; gone entities
  render `row_kind:"gone"` and are never filtered (:216-265). The cmd
  closure owns the real semantics: whole-library sweeps claim the
  per-library in-flight slot, per-row refreshes bypass it, unknown plugin =
  loaded-AND-registry-bound, unknown rows pre-checked BEFORE any strip
  (`cmd/mellifera/main.go:638-712`). Parser wake: `parsers.go` fires
  `notifyParsersChanged` after both successful `SetItemParsers` paths
  (attach + clear), nil-safe, library resolved from the item row
  (`enrich_admin.go:286-295`); cmd wires it to `Queue.Notify`
  (main.go:372-374).
- **cmd wiring** — plugin loaded beside the other metadata sources
  (main.go:97, :166) with `MELLIFERA_SHIKIMORI` env override (:484);
  Makefile `build-plugin` builds `bin/shikimori` (Makefile diff) — the coder
  handoff's fresh-checkout gap is closed.

### Recorded deviations — judged

1. **rowIDs opaque strings** (`rowIDs ...string`, reenrich.go:54; box 3.1
   text said `int64`): SOUND. The row-id space is opaque strings (itm_/ser_);
   the spec delta's signature is typeless; tasks.md box text is stale on the
   type, not the behavior. api DTO and wire shape match the delta.
2. **resolved_ids channel = Convert metadata key** (chain.go:138-144;
   Merge strips it, source.go:202): SOUND. The proto field pairing
   (MatchResult.resolved_ids) remains dead-but-contract-present; the chosen
   channel is documented on both sides and lands in doc.identifiers
   identically.
3. **Plugin derives serial titles from the document's real fields**
   (source.go:93-110 + seriesname.go): SOUND and necessary — the scanner
   stamps serial-record parsed WITHOUT a title and the chain feeds sources a
   base built from parsed alone (worker.go:135-148), so a parsed-title read
   would skip every real serial row (the coder's BUG 1, fixed). The
   in-file rationale is accurate.
4. **`MELLIFERA_SHIKIMORI_UPSTREAM` env seam** (source.go:226-248): SOUND.
   Read once at init; empty/unset → `https://shikimori.io` (production
   unchanged); exists so the subprocess e2e can pin a stub upstream (the
   QA cure). Hermeticity holds — no test reaches shikimori.io.

### FLAGs (spec axis)

- **F1 (wording drift, not behavior):** design.md Interfaces says "an
  unexported gate type in `internal/enrich`", and the proposal Impact line
  records "+1 exported symbol (ReenrichSource)" — but the shipped seam
  exports `FetchGate` + `NewFetchGate` (fetch.go:40, :48) because cmd cannot
  construct an unexported type; internal/enrich ships +3 exported symbols.
  The behavior is exactly as designed (process-wired, injectable clock, not
  a package global) and the budget's real intent holds (proto 0 / store 0 /
  pkg/sdk 0 confirmed by `git diff --stat`; the frozen 4-RPC plugin contract
  untouched; api never imports enrich). The api-side exports
  (ReenrichResult, EnrichPreview, three sentinels, +3 Deps fields) were
  anticipated and stay within the envelope. Record the design.md wording
  drift when archiving; no code change requested.
- **F2 (minor semantic over-reach):** box 3.4 / the explicitSet comment say
  the sweep "registers stripped pairs", but `stripPass` registers every
  processed row including rows with nothing to strip (reenrich.go:134 runs
  unconditionally). Worst case: an explicit rowID refresh naming a
  namespace-less row gifts one flat (gentler) cooldown to that pair's next
  automatic terminal failure; the marker is consumed once. P3; no change
  requested for MVP.
- **F3 (hardening gap, spec-conformant):** the shikimori BuildRequest
  declares no `timeout_seconds` (source.go:177-183) and fetchSource bounds
  only when the spec declares it (fetch.go:102-106); the worker context
  carries no deadline. The deltas require the core to HONOR timeout_seconds
  (done) but never require the plugin to DECLARE one — so no FAIL — but a
  stalled upstream can hold one worker indefinitely. Follow-up: declare a
  bounded timeout in the shikimori spec.

## Axis 3 — UNPROBEABLE confirmation: PASS (by inspection)

Exactly one scenario carries the token: "Version bump alone triggers nothing
automatic" (specs/async-enrichment/spec.md:197). Inspection findings:

- `Queue.ReenrichSource` has exactly ONE production call site — the admin
  refresh closure (cmd/mellifera/main.go:665). No scan, boot, parser, or
  module-config path reaches it.
- The derivation predicate `pendingSources`
  (internal/enrich/queue.go:421-432) keys on queueable + `hasNamespace` +
  `inCooldown` only — no plugin-version input. A version bump leaves every
  namespace intact, so scan-Notify derivation, the boot sweep
  (queue.go:162-167), and the parser-changed wake (parsers.go →
  `OnParsersChanged` → `Queue.Notify` → the same predicate) all derive
  nothing for namespaced rows.
- The core never COMPARES versions: `versionOr`
  (internal/enrich/provenance.go:39-47) only writes the plugin-reported
  version into `_provenance`. The sole version READ for drift analysis is
  the preview histogram (cmd/mellifera/main.go:764-767), computed on
  request — the delta's "only observable drift" surface.
- Module config keys on `schema_version` (module config entity), not plugin
  version; scan base-doc assembly copies the module's SchemaVersion
  (internal/scan/run.go:263) — unrelated to a plugin binary bump.

Conclusion: no automatic path fetches on a plugin version bump alone.
CONFIRMED.

## Axis 4 — Standards: PASS with FLAGs

- Repo lint gate green (`golangci-lint`: funlen 60/40, gocognit/gocyclo 15,
  lll 120, dupl 100, depguard deny reflect/DI; `check.sh` exported-symbol
  warns pre-existing and below the fail threshold). The repo's documented
  convention overrides the skill's stricter baselines; all new files <400
  lines; new function bodies within the repo's funlen.
- **seriesname.go duplication — judged sound and documented.** The
  directory-name grammar is a plugin-local mirror of serial-parser's
  parseSeriesDir because plugin→plugin import would couple two deployables
  and a pkg/-level extraction would breach this change's additive budget.
  The deliberate NON-duplication of the release-tag vocabulary is documented
  in-file with its rationale (seriesname.go:16-23 — stray tokens stay in the
  derived title, where the upstream search tolerates them); the residual
  drift risk is bounded (search quality, not correctness). Accepted.
- Error handling, resources, concurrency: Go error-return idiom with %w
  context throughout; `resp.Body` closed and timers stopped (fetch.go:118,
  :185); every shared map mutex-guarded (FetchGate, explicitSet, sweepGuard);
  redacted_ref and method/placeholder validation at the boundary, trusted
  internally. No secrets anywhere (anonymous tier). depguard-clean (no
  reflection, no DI).
- **F4 (FLAG, P2 — test gap on the real wiring):** the cmd-side Reenrich
  closure semantics — whole-library 409 guard + per-row bypass
  (main.go:646-650), `rowInLibrary` library-scoping (:677-693),
  `hasMetadataBinding` loaded-AND-bound (:699-712), and the
  Queued=stripped+deferred invariant — carry NO automated test: the api
  LibraryRefresh tests exercise the handler with fake closures, and no
  cmd-level or itest test drives the real closure (grep: zero test
  references to sweepGuard/rowInLibrary/hasMetadataBinding). The tick probes
  are green — the acceptance floor per the loop grammar — and inspection of
  the closure found the logic correct, but the 409/per-row-bypass behavior
  on the real wiring rests on inspection alone. Follow-up: a small
  cmd-level test or one itest hit on POST /refresh.
- **P3 judgement call:** cmd/mellifera/main.go grew 589 → 858 lines (already
  past the skill's file-size baseline at HEAD; the repo sets no file-size
  lint). The additions are cohesive closure builders; consider extracting
  the enrich wiring into its own file in a future change.
- Change budget: proto 0, store 0, pkg/sdk 0 confirmed (no diffs);
  internal/scan production code untouched — the two modified scan TEST files
  are lint-reformat (lll) and pre-existing tv-seed-v2 assertion fallout from
  the uncommitted neighbor change, outside the enrichment diff.

## Gate line

Reviewer verdict: **PASS with FLAGs** (F1-F4 recorded above; none blocks
archive). Human archive approval is recorded separately below after the
gate decision.

## Archive approval

Approved by the operator (aldfiar) in-session on 2026-10-13: archive with
F1 amended in design.md pre-archive (gate-type wording + rowIDs type made
truthful); F2-F4 recorded as backlog follow-ups, not part of this change.
