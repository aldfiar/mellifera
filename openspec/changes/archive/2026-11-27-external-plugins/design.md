# Design

## Context

Two repos, one wire contract, one deploy host (FRAME-A "prebuilt releases + volume mount"; the converged design lives in the main tree's `.tmp/external-plugins-branch-A.md`, rulings R1-R12 applied):

- Core repo (this one): grows only generic mechanisms — optional load sites, the no-relay binding trait, tv seed v3, deploy templates. Nothing adult-specific; nothing external enrichment source-shaped beyond opaque plugin-id strings.
- External repo `mellifera-ext-plugins` (new, private): the ext-source-a plugin, the ext-source-b plugin, the release-code grammar, the adult behavior specs, its CI, its release artifacts.
- alatoic runs both: the server image as today (zero Dockerfile change), the external binaries under `/mnt/onlas/mellifera-data/plugins-external/` volume-mounted to `/app/bin-extra` through the EXISTING per-plugin path env overrides.

Budget facts grounding the shape (verified @ 47e3fc4): internal/enrich sits at exactly 12/12 exports (this track adds ZERO enrich exports — the search guard is an unexported helper); internal/module goes 6→7 (PluginIDexternal enrichment source); internal/plugin stays 4 (the optional-load bookkeeping is composition-root-owned, not a Manager API).

## Goals / Non-Goals

**Goals:**
- Plugin iteration never rebuilds the server image; core iteration never rebuilds the plugins (FRAME-A's minimized axis).
- An undeployed host boots byte-identically to today; a stale external binary can never down the server (skip-and-report).
- LAN-bound descriptors never reach a relay claimant, by config trait rather than plugin knowledge.
- Core content neutrality is greppable: no adult-grammar tokens in core code/specs; display strings service-name-class neutral; `pkg/releasename` diff empty.

**Non-Goals:**
- The direct upstream-site scraper variant (deferred; needs a header-substitution seam the core lacks — named blocking prerequisite when it ships).
- The scrape-job fallback (v1.1; needs the additive binding-options-on-metadata-RPCs seam — a decoupled future core change, v0.5.x candidate).
- Hot plugin reload (load sites run at boot only; swap = compose restart).
- Core-side sdk_version comparison hardening (the core retains but never compares the handshake value today; the manifest + plugin-side min_core guard is the v1 discipline).
- Any SPA contract change (the shipped editor already renders declared secret inputs).

## Decisions

1. **FRAME-A over FRAME-B/C.** B (build-time fetch into the image) couples every plugin iteration to a full image build; C (extracted SDK module) pays off only with more external consumers — deferred until a second consumer appears. A keeps the two release cadences independent.
2. **Optional loads live entirely in the composition root.** A main.go-owned `optionalState` outcome map (absent → synthesized `not_serving`, broken → synthesized `failed`) is the better operator truth: today a never-Loaded id errors `notLoadedErr` and the status closure drops the row entirely. Zero internal/plugin symbols added; in-repo plugins keep fatal discipline.
3. **No-relay trait, applied to every adult binding from day one.** A LAN URL is unreachable from remote relay claimants anyway, and the trait keeps LAN topology out of client-visible job plans. Honored at all three enqueue seams (handoff, consult, search); derivation and queueability unchanged.
4. **Seed v3 with `enabled: true`, not config-disabled.** `ResolveGates` can only MUTE a config-enabled source, never revive a disabled one — `enabled: false` would be irreversible through the sanctioned write surface. Dormancy comes from the SERVER binding's unresolved declared option, not the config bit.
5. **`base_url` is a declared required option** on the ext-source-b binding; spec deltas word it generically ("a declared required option") — never secret language for a LAN URL. The wake path is the shipped tmdb template: serverAuth resolution → queueable gate → verdict chips → the SPA's write-only input.
6. **v1 is search-only.** A search-miss converts to empty metadata → terminal `no_data` under a flat 30-day cooldown that never self-retries; convergence after a external enrichment source-side scan is an explicit operator re-enrich or identify re-search. The scrape-job fallback waits for the binding-options seam (v1.1 + D-B1).
7. **SDK consumption at the published tag.** `require github.com/mellifera/mellifera v0.4.0` (INV2 leaf pulls only sdk + proto + grpc) + a gitignored `go.work` replace to the main tree for dev. Private-module fetch needs GOPRIVATE + a git insteadOf rewrite (module path ≠ GitHub remote) — machine-local, scaffold-task-owned.
8. **Skew discipline = manifest pairing + plugin-side min_core guard.** Each release carries `release-manifest.json` (`built_against`, `min_core`); each plugin's Handshake errors below the floor → `doLaunch` fails → skip-and-report. Honest limits named: the core's `coreVersion` const is static and never compared; go.mod skew is caught at build time, not deploy time; `deploy-plugins.sh` refuses a `built_against` newer than the running core.
9. **Neutrality law.** Catalog display strings neutral ("Release Code Parser", "external enrichment source"); ids (`ext-source-a`, `ext-source-b`) and env names (`MELLIFERA_EXTRA_PLUGINS_*`) stay as opaque strings; the release-code grammar lives entirely in the external repo; greppable absence of direct-scraper brand tokens in core Go files.

## Interfaces (core ↔ external-repo seams)

**SDK consumption (external → core):**
- Module: `github.com/mellifera/mellifera` at tag `v0.4.0`; bootstrap via `pkg/sdk.Serve`; plugin identity constants mirror the shared magic-cookie pair.
- Capability: one `metadata_source` capability per plugin (`sdk.MetadataSource` — the six unary RPCs Match/BuildRequest/Convert/Merge/SearchSpecs/SearchResults); ext-source-a embeds the SDK's unsupported-search base for the search pair.
- Handshake: declares capabilities + `required_secrets` (empty for ext-source-a; `["base_url"]` for ext-source-b) + `min_core_version` (`0.1.0`); the plugin CHECKS `req.CoreVersion` against the floor — the proto reserves the field for compat gating; the in-repo plugins ignore it, the external ones enforce it.

**Document contract (the enrichment chain):**
- ext-source-a: Match applies on a code-bearing parsed title with no code identifier yet; `resolved_ids` carries the normalized code → the CORE writes it into `identifiers.ext_code` (the core-side applyContribution channel, outside namespace validation); Merge writes only `sources.ext-source-a` (`ext_code`, `parsed_from`).
- ext-source-b: Match applies iff `identifiers.ext_code` is anchored (the same existing_ids feed tmdb anchors on); BuildRequest authors `GET {base_url}/api/v1/metadata/videos?search={code}&limit=5` with `{server:base_url}` as a `redacted_ref` variable — the core substitutes from the binding options (the base-url placeholder carries the raw marker, task 4.3's substitution mode: origins substitute verbatim while `{code}` stays QueryEscape-default); the value never enters the plugin; Convert maps a code-matching `Video` row to the namespace (title, description, date, studio, cast, genres, artwork ref, advisory tech block) + `resolved_ids.ext-source-b_id` anchor; a miss converts to empty metadata (terminal `no_data` downstream, never an error); SearchSpecs/SearchResults flatten rows to picker candidates (external_id = the uuid, kind film, poster).

**Deploy interface (operator-facing):**
- Release artifacts per tag: `ext-source-a-vN-linux-amd64`, `ext-source-b-vN-linux-amd64`, `checksums.txt`, `release-manifest.json` (CGO_ENABLED=0, trimpath; version + sdk_version + min_core at compile time via ldflags).
- Server layout: `plugins-external/releases/vN/{ext-source-a,ext-source-b}` immutable per tag — the fetched VERSIONED artifacts are renamed to the unversioned names on fetch (deploy-plugins.sh step), so the `current -> releases/vN` symlink flip exposes exactly the compose paths below; compose mounts the PARENT dir read-only at `/app/bin-extra` (a dangling `current` can never break `compose up`; an empty dir mounts empty and both env paths miss → optional-load keeps boot green).
- Env: `MELLIFERA_EXTRA_PLUGINS=/app/bin-extra/current/ext-source-a`, `MELLIFERA_EXTRA_PLUGINS=/app/bin-extra/current/ext-source-b` — the existing envOr override law.
- Core catalog: `PluginIDexternal enrichment source` const in internal/module (the one new export); catalog rows neutral.

**Cross-group task interfaces (who consumes whom):**
- Tasks 1.1-1.3 produce the load-site machinery tasks 4.1 and 10.1 rely on (the itest exercises the optional-load path; compose points env at the mounted paths).
- Tasks 2.1-2.3 produce the trait the seed (3.1) references in JSON and the stub joint (4.1) verifies end to end.
- Task 5.1 produces the sibling repo every external task's duty `cd`s into (group order is the DAG).
- Tasks 5.2 + 6.1 + 7.1 produce the pieces 6.2 + 7.2 assemble; task 8.1 documents their behavior contract; 4.1's stub mirrors 7.2's shape contract-first.

## Risks / Trade-offs

- [Search-match behavior unproven (`search=<code>` vs `videoId` equality)] → T0 probe on the LAN API before 7.1/7.2 fixtures freeze; fallback limit-N pages + plugin-side filter; worst case an upstream external enrichment source fix (same author).
- [Catalog duplicates / mixed scraped-unscraped rows] → match key = normalized code equality only; unscraped rows are candidates, not metadata; scrapedAt preference pins the tiebreak in the external spec.
- [no_data 30-day convergence feels stalled after a external enrichment source-side scan] → the runbook documents explicit re-enrich as the lever; v1.1 automates later.
- [Manual skew discipline fails silently] → manifest check baked into deploy-plugins.sh (refuses `built_against` newer than the running core); a failed handshake renders a failed row with the message.
- [Private-module fetch is environment-sensitive] → GOPRIVATE + insteadOf wired in the scaffold task and documented; CI uses a scoped token (release workflow skeleton).
- [Optional rows mislead (failed vs absent vs muted)] → health message strings pinned in task 1.3 tests; the delta words the three states.
- [JWT on external enrichment source later] → static-token-as-required-option rides the same options machinery (v1.1 seam); core never blocked.
- [Compose restart required per swap (no watcher)] → named residual; the restart IS the documented swap step.

## Migration Plan

Deploy order (operator, post-GATE-2): 1) deploy the CORE first (seed + mechanisms; binaries absent → boot green, dormant rows visible); 2) publish the external release (tag → CI artifacts); 3) fetch + checksum-verify + lay out `plugins-external/releases/v1.0.0` + `current` symlink; 4) `docker compose restart` (boot re-runs load sites); 5) paste `base_url` on the options editor (verdict flips, dormancy resolves on the next derivation read); 6) the live end-to-end probes. Rollback: core = today's recipe; plugins = flip `current` back one tag + restart. No data migration: the seed promotion is config-only and idempotent; nothing older boots is unaffected (additive schema_version bump).

## Open Questions

None open — the frame's OQs resolved in the design loop (R1-R12 recorded in the canonical draft); the remaining micro-items (final repo name at creation time; branch protection at creation) are GATE 1 / operator checkpoints, listed as proposal questions.
