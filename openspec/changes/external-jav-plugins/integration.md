# Integration Audit — external-jav-plugins (propose step 4, strict lane)

Audited at base 47e3fc4 (worktree `/Users/aldfiar/projects/go/mellifera.worktrees/external-jav-plugins`, branch `feature/external-jav-plugins`, map fingerprint `composite:ffcdcdf5…` CURRENT). Read-only audit; author of this file + `handoffs/wf-reviewer.md` only.

## Ground-truth substitution verdict

`wf index surface` ran (wrote `.tmp/.dep_surface.json`, same fingerprint) and the map is **python-only**: backend `python-graph`, 33 symbols over 713 files; `wf index query def PluginIDTmdb` → `not in map; grep source to confirm` (verified empirically, not assumed). Every Go node and edge below is therefore grounded by **live-source grep against this worktree @ 47e3fc4** per code-search G6, and the dependency facts by `go.mod` read directly. The planner's substitution **holds for this audit's findings**: go.mod @ 47e3fc4 byte-confirms hashicorp/go-plugin v1.8.0, chi v5.3.1, fsnotify v1.10.1, go 1.25.0, and no task's target file was found missing or relocated (every G2 check passed). The only NEW dependency edge in the track is external-repo → published core module v0.4.0 (tag exists locally; its push is operator-gated).

## The planned graph

### Nodes (25)

**Core (groups 1–4, 9, 10):**

| # | Node | Task | Kind | Grounding |
|---|------|------|------|-----------|
| N1 | `catalogEntry` optional flag + two neutral rows | 1.1 | MODIFY | exists — cmd/mellifera/main.go:87,90 (`sourceCatalog`); six in-repo `loadPlugin` sites main.go:123–151 |
| N2 | `PluginIDJavinizer` const (module exports 6→7) | 1.1 | NEW | beside `PluginIDTmdb` registry.go:186; **live count today = 6** (duty's own shell re-run), ≤8 budget holds |
| N3 | `javParserPath`/`javinizerPath` + `MELLIFERA_JAV_PARSER`/`MELLIFERA_JAVINIZER` envOr | 1.2 | NEW | `envOr` main.go:745; 8 existing overrides main.go:655–663; **zero `MELLIFERA_JAV*` collision** (grep clean) |
| N4 | `loadPluginOptional` + composition-root `optionalState` | 1.3 | NEW | modeled on `loadPlugin` main.go:123–151; `doLaunch` internal/plugin/lifecycle.go:136 is the error source |
| N5 | `statusClosure` synthesized-row consult | 1.3 | MODIFY | main.go:261, wired :335; `/admin/status` internal/api/handlers.go:1599, `/admin/plugins` internal/api/plugin_admin.go:84 — **no task touches internal/api** (zero-api-change holds) |
| N6 | shutdown loop never-loaded skip | 1.3 | MODIFY | same composition root |
| N7 | `MetadataSourceBinding.NoRelay` field + `parseModule` decode | 2.1 | MODIFY (field, no new export) | struct registry.go:299–308 — **no NoRelay today**; `parseModule` registry.go:662 |
| N8 | `relayScope.handOff` trait guard | 2.2 | MODIFY | chain.go:67 (`handOff(ctx, src module.MetadataSourceBinding, …, plan []relay.PlanSpec)`) |
| N9 | consult-before-fetch trait guard | 2.2 | MODIFY | runSource owns the policy, chain.go:166–174 |
| N10 | `relayExempt` (unexported) + search-leg conjunct | 2.3 | NEW(unexported)/MODIFY | mirrors `resolveServerSecrets` search.go:59; search relay leg search.go:108–144; **enrich stays 12/12 — live count today = 12** |
| N11 | `upgradeTVConfigV3SQL` + tv seed v3 JSON + fresh-at-v3 | 3.1 | NEW/MODIFY | precedent `upgradeTVConfigSQL` v1→v2 registry.go:44–46 (serial reaches v4, :59–67); fresh seed inserts tv at **v2 today** (`seedModulesSQL … tvConfigJSON, 2`); frame-grabber holds priority **4** → 5/6 free |
| N12 | derivation pins (test-only, zero enrich change) | 3.2 | TEST | the laws it pins all exist: unavailable stage chain.go:181 / enrich.go:312, "no ledger row" retry.go:15, `attemptedNoWork` worker.go:237–256, queueable + required-secrets conjunct queue.go:29,613 |
| N13 | `internal/itest/javstubbin` mini binary + joint test | 4.1 | NEW | `buildBinary` helper integration_test.go:107; joint precedents (accounts_joint, eviction_joint) |
| N14 | compose.yaml mount + env lines | 10.1 | MODIFY | volumes block compose.yaml:27; no plugin-path envs in compose today |
| N15 | .env.example two commented lines | 10.1 | MODIFY | 2 `MELLIFERA_` lines today |
| N16 | BindingOptionsEditor.test.tsx javinizer-shaped pin | 9.1 | MODIFY (test-only) | web/src/components/admin/BindingOptionsEditor.tsx + .test.tsx **both exist** |

**External repo `/Users/aldfiar/projects/go/mellifera-jav-plugins` (groups 5–8) — path verified ABSENT today (5.1's `git init` creates it):**

| # | Node | Task | Kind | Grounding |
|---|------|------|------|-----------|
| N17 | repo scaffold (go.mod, gitignored go.work, Makefile, .golangci.yml, release workflow) | 5.1 | NEW | requires core tag v0.4.0 (exists); GOPRIVATE + insteadOf (module path `github.com/mellifera/mellifera` ≠ remote `aldfiar/mellifera`); core budget-gate precedent Makefile:29 |
| N18 | jav-parser bootstrap (main.go + pluginsvc.go) | 5.2 | NEW | `sdk.Serve` pkg/sdk/serve.go:36, magic-cookie pair :16–19 |
| N19 | javinizer bootstrap (main.go + pluginsvc.go) | 5.2 | NEW | handshake declares `required_secrets=["base_url"]` — proto field exists plugin.proto:72; floor via `min_core_version` plugin.proto:31 checked against `req.CoreVersion` (serve.go:22, proto :19) |
| N20 | `internal/javcode` grammar | 6.1 | NEW | corpus owned by external repo (neutrality law) |
| N21 | jav-parser source impl | 6.2 | NEW | `UnsupportedSearch` embeddable base exists pkg/sdk/metadata.go:128, `ErrSearchUnsupported` :122 |
| N22 | `internal/javinizer` REST mapping | 7.1 | NEW | fixture-frozen behind the T0 live probe (proposal Q4) |
| N23 | javinizer source impl | 7.2 | NEW | `{server:base_url}` substitution is live core law — server-scoped redacted_ref resolves from the resolved-secrets map, fetch.go:274–279; `serverAuth` chain.go:297 |
| N24 | external behavior specs (jav-code-parsing, javinizer-enrichment) | 8.1 | NEW | |
| N25 | operator runbook + `deploy-plugins.sh` | 8.2 | NEW | consumes 5.1's release artifacts, restarts 10.1's compose |

### Edges (28)

| E | From → To | Task pair | Grounding |
|---|-----------|-----------|-----------|
| E1 | catalog rows → optional load sites | 1.1 → 1.3 | design.md:58 |
| E2 | `PluginIDJavinizer` → catalog row + seed reference | 1.1 → 3.1 | opaque-id pair must match (see E15) |
| E3 | env paths → load sites; same keys in compose env | 1.2 → 1.3, 10.1 | envOr law main.go:655–663 |
| E4 | `optionalState` → statusClosure → /admin/plugins + /admin/status render | 1.3 → live api | main.go:261→335 |
| E5 | `optionalState` → shutdown skip | 1.3 | spec delta plugin-pipeline scenario 4 |
| E6 | seed v3 JSON `no_relay:true` → trait decode | 3.1 → 2.1 | producer/consumer across groups — **both directions needed: decode (2.1) must land before promotion (3.1) is exercised; group order 2 < 3 satisfies it** |
| E7 | trait → handOff refusal | 2.1 → 2.2 | chain.go:67 |
| E8 | trait → consult exclusion | 2.1 → 2.2 | chain.go:166 |
| E9 | trait → search conjunct | 2.1 → 2.3 | search.go:108–144 |
| E10 | seed v3 → derivation dormancy/queueability | 3.1 → 3.2 | queueable conjunct queue.go:29,613 |
| E11 | optional-load machinery + seeded binding → joint itest | 1.3, 3.1 → 4.1 | tasks.md:30 |
| E12 | `buildBinary` → stub binary | live helper → 4.1 | integration_test.go:107 |
| E13 | scaffold → every external cd duty | 5.1 → 5.2, 6.1, 6.2, 7.1, 7.2, 8.1, 8.2 | design.md:60; ordering verified below |
| E14 | scaffold → SDK v0.4.0 (`Serve`, `MetadataSource`, `UnsupportedSearch`) | 5.1 → live pkg/sdk | serve.go:36, metadata.go:24,128 |
| E15 | seed `plugin_id` strings == catalog ids == `requiredSecrets` lookup keys | 3.1 == 1.1 | `requiredSecrets(src.PluginID)` chain.go:303; handshake-declared names enrich.go:68 |
| E16 | both handshakes → proto fields + floor check | 5.2 → live proto | plugin.proto:19,31,72 |
| E17 | javcode → jav-parser source | 6.1 → 6.2 | tasks.md:61 |
| E18 | javinizer mapping → javinizer source | 7.1 → 7.2 | tasks.md:61 |
| E19 | jav-parser doc contract → core `applyContribution` identifiers write | 6.2 → live enrich | enrich.go:265–277 ("a CORE-side write"), chain.go:124 |
| E20 | jav-parser search pair → `ErrSearchUnsupported` | 6.2 → live sdk | metadata.go:122,128 |
| E21 | javinizer doc contract → `serverAuth` substitution + no_data terminal | 7.2 → live enrich | chain.go:297, fetch.go:274–279 |
| E22 | javinizer SearchSpecs/Results → SPA picker | 7.2 → live web | existing search surface |
| E23 | stub mirrors 7.2's shape contract-first | 7.2 → 4.1 (design-time) | design.md:61 |
| E24 | external specs document 6.x/7.x behavior | 8.1 | tasks.md:63 |
| E25 | release artifacts (checksums.txt, release-manifest.json, binaries) → deploy script | 5.1 → 8.2 | **naming mismatch risk — Q1** |
| E26 | deploy script → compose restart + running-core version | 8.2 → 10.1, live core | tasks.md:65–66 |
| E27 | compose mount/env → envOr keys at boot | 10.1 → 1.2 | same env keys both sides |
| E28 | options PUT → verdict flip → SPA pin | 9.1 → live admin + editor | BindingOptionsEditor.tsx exists; wake path = tmdb template (design.md:34) |

## Check 1 — Wiring coverage: **PASS (1 open question, Q1)**

- No orphan nodes: every new node carries an edge into the live system that a named task implements. The composition-root additions (N4–N6) are consumed by the status closure, shutdown loop, and the 4.1 itest; `relayExempt` (N10) is consumed by the search leg in the same task; `javstubbin` (N13) by 4.1's duties; `PluginIDJavinizer` (N2) by catalog + seed; all external nodes consume the scaffold or the SDK.
- All four design.md Interface blocks have producers and consumers: SDK consumption (E14, E16), Document contract (E19–E22), Deploy interface (E25–E27 — one naming seam open, Q1), Cross-group task interfaces (E1–E13, E17–E18, E23).
- Hidden scope: **none found.** No task touches internal/api, internal/plugin, internal/relay, pkg/, Dockerfile, proto, or pkg/releasename — matching the proposal's untouched claims; the enrich edits stay inside chain.go/search.go (+ tests), the module edits inside registry.go (+ tests).

**Special-attention rulings (dispatch items):**

1. **Scaffold-before-consumer ordering: HOLDS.** 5.1 creates the sibling repo itself (`git init`) and its verify proves the repo + private-module fetch post-task; every consumer (5.2, 6.1–6.2, 7.1–7.2, 8.1–8.2) sits at a later group, and 5.2 follows 5.1 in id order within group 5. Group order is the declared DAG (openspec-loop §Apply). No question.
2. **G4 stub itest exercises the real path: YES for optional-load + handshake.** Present-binary boot, seeded-SERVER dormancy → options PUT → verdict flip → derive+enrich+anchors, and mismatched-handshake → failed row with boot green — that is the exact path the external plugins take (same load sites, same seed rows, same handshake handling). It does **not** exercise the relay seams or the absent-binary boot end-to-end (both unit-covered elsewhere; relay gap escalated as Q2).
3. **Deploy templates vs release artifacts: env keys, mount layout, and aux-artifact names all MATCH** (`MELLIFERA_JAV_PARSER`/`MELLIFERA_JAVINIZER` identical in 1.2/10.1; `plugins-external/releases/vN` + `current` parent-mount consistent design↔10.1; `checksums.txt` + `release-manifest.json`/`built_against` identical 5.1↔8.2) — **but the binary names diverge**: design's artifacts are `jav-parser-vN-linux-amd64` while compose points at `/app/bin-extra/current/jav-parser` (unversioned), and 8.2 never names a normalize/rename step. The failure mode is silent: unrenamed layout → env path misses → `not_serving` → boot green with the plugin never loading. **Q1.**
4. **Core-first deploy order: HOLDS, grounded.** Seed v3 lands both bindings `enabled:true` (ResolveGates mute-only law, design decision 4 — gates.go:25); the SERVER binding is dormant via the unresolved required option (queueable conjunct queue.go:29/613); the parser binding is queueable-true but its absent binary rides the existing unavailable-stage law — `skipOutcome("unavailable: …")` chain.go:181, no ledger row retry.go:15, settles ready via `attemptedNoWork` worker.go:237–256 — exactly what 3.2 pins. Residual (P3, no question): each tv item's first derivation pass under absent binaries records one unavailable stage — bounded, one-pass-per-item, no retry churn.
5. **Spec-delta coverage: dormancy and byte-identical trait-absent behavior ARE pinned** (plugin-pipeline "promoted SERVER binding starts dormant"; async-enrichment "Absent trait decodes byte-identically"; client-relayed-fetch "Sources without the trait are byte-identical"; all three relay seams have scenarios). **One gap:** no delta scenario claims the absent-binary derivation law (settles ready, unavailable stage, no ledger row) that 3.2 test-pins and the deploy order leans on. **Q3.**

## Check 2 — QA seam coverage: **PASS with one escalation (Q2)**

Seven `@qa` tasks confirmed (4.1, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2), all with non-empty `qa:` lists (strict-lane shape compliant). Joint-by-joint:

| Joint (dispatch list) | Coverage | Verdict |
|---|---|---|
| core↔external handshake | 4.1 joint + mismatch leg (qa-named); 5.1/5.2 `TestHandshakeMinCoreFloor` + `TestHandshakeDeclaresRequiredSecrets` (qa-named) | COVERED |
| seed↔derivation | 4.1 e2e dormancy→wake→derive (qa-named); 3.2's unit pins are unannotated but sit beneath the qa-covered joint | COVERED |
| trait↔relay seams | unit tests only (2.2/2.3 — not `@qa`, not itest-exercised; 4.1's joint never asserts relay non-enqueue) | **NOT COVERED at QA altitude — Q2** |
| stub-binary itest leg | 4.1, both tests qa-named | COVERED |
| doc contract (external→core identifiers/namespace) | 6.2 + 7.2 qa-named from the external side; 4.1 covers the core landing | COVERED |

Note: 5.1's `qa:` list names tests its sibling 5.2 authors — harmless (the scaffold is where those tests will live; identical entries on both tasks).

## Check 3 — Complexity / blast radius: **PASS**

- Export budgets grounded live: module **6→7** (≤8), enrich **12→12** (zero new — the guard is unexported), plugin **4→4**. The duty's own counting shell was re-run read-only and matches the design's claims exactly.
- Blast radius per group, worst-case if a group lands wrong:
  - **G1** — composition root: a regression in the in-repo `loadPlugin` pair is a boot fatality for every deploy; pinned by `TestInRepoLoadStaysFatal` + the green baseline suite.
  - **G2** — an inverted guard either leaks LAN descriptors into `relay_jobs` (the headline invariant) or defers existing sources (byte-identical regression); decode-absent tests + the existing suite pin the second; the first is Q2's point.
  - **G3** — registry `Open` is boot-fatal on error; the promotion is guarded/idempotent with the serial v3/v4 precedent (registry.go:59–67), and `enabled:true` avoids the irreversible-config trap (gates can only mute).
  - **G5** — isolated repo, but its scaffold writes **machine-global** config (`git config` insteadOf rewrite + `go env -w GOPRIVATE`) outside both repos — documented in the external README; benign on this machine since the module path is otherwise unfetchable (P3 note, no question).
  - **G10** — compose.yaml is load-bearing for every alatoic deploy; a bad edit breaks `compose up` for everything, mitigated by the grep verify + operator-gated deployment; the parent-dir mount makes a dangling `current` benign.
  - **Deploy order residual** — see Check 1 ruling 4: bounded stage noise while binaries are absent.
- Ordering dependency recorded (already proposal-questioned Q4, not re-raised): 7.1/7.2 fixtures freeze behind the operator's T0 live probe; if the probe runs late, the mapping may rework.

## Numbered questions (recommended answers — the human decides)

**Q1 — Deploy artifact naming vs compose env paths (G8↔G10 seam).** Release artifacts are versioned (`jav-parser-vN-linux-amd64`, design.md Interfaces) but compose env points at unversioned names (`/app/bin-extra/current/jav-parser`, 10.1), and 8.2's fetch/verify/symlink/restart script never names a rename/normalize step — an unrenamed layout silently boots `not_serving` (green, dormant, never loading). **Recommended answer:** pin the layout law in 8.2 — `deploy-plugins.sh` lays out `releases/vN/` under the unversioned names `jav-parser`/`javinizer` (rename-on-fetch) — and add a name check to 8.2's verify; keep the workflow's versioned artifact names (they carry the version in the GitHub release UI where it belongs).

**Q2 — The trait↔relay seams have no cross-module QA leg.** The proposal's headline invariant ("no fully-substituted descriptor of a trait-carrying binding ever reaches `relay_jobs` or any claimant") is covered only by 2.2/2.3 unit tests with test doubles; neither 4.1's joint itest nor any qa-named test exercises a relay-enabled environment against a trait-carrying source. **Recommended answer:** add one relay-seam leg to 4.1 (or a small 4.2) — the stub source under a relay-enabled itest env, asserting `relay_jobs` gains no row and the run settles as a plain chain failure — with its test named in the `qa:` list. Alternative: explicitly waive as unit-sufficient; the surveyor recommends the leg (three-tier Tier 1 joint is exactly this shape).

**Q3 — The absent-binary derivation law is unpinned by any spec delta.** The deploy-order claim leans on "queueable-true source with an absent binary records an unavailable stage per pass, no ledger row, settles ready" — 3.2 test-pins it, but no delta scenario claims it, so the behavioral memory loses it at archive. **Recommended answer:** one ADDED scenario in the plugin-pipeline delta ("Absent optional source settles ready at derive — unavailable stage, no ledger row, no retry churn"), mirroring the existing dormancy scenario.

## Human resolutions

(none yet — recorded here when the human rules on Q1–Q3; amend-or-waive is never the surveyor's call.)
