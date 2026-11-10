# Integration audit — tmdb-enrichment

Authored by @wf-surveyor at propose (openspec-loop §Propose step 4); **re-run once over
amendment round 1** (all four questions answered by amendment — resolutions recorded below).
READ-ONLY audit of the authored plan artifacts (proposal.md, design.md, specs/ ×3, tasks.md)
against the live worktree. Findings only — the human decides amend or waive.

**Question frontier after re-run: EMPTY — no open questions; waiver list: empty.**

**Grounding note.** `wf index build` runs (562 files → `.tmp/.source_map.json`) but extracts no
Go symbols in this tree (`wf index query def fetchSource` → "not in map"; spot-checked across
eight planned symbols — all unextracted). Per the planner's recorded fallback, grounding below is
file reads with `file:line` evidence; the map exists and is void-for-symbols, not void-for-audit.

## The planned graph

### Nodes (new + touched; grounding is the live tree unless marked planned)

Group 1 — plugins/tmdb (new package, the shikimori structural mirror):

- G1.1 `plugins/tmdb/main.go` (new) — identity constants, `sdk.Serve` over the dual-service PluginSet (task 1.1). Mirror: `plugins/shikimori/main.go` exists.
- G1.2 `plugins/tmdb/pluginsvc.go` (new) — Handshake advertising the one `metadata_source` capability carrying `required_secrets: ["api_key"]` — the FIRST real user of proto field 6 (task 1.1). Grounded: `proto/mellifera/plugin/v1/plugin.proto:72` `repeated string required_secrets = 6;`; shikimori handshake shape at `plugins/shikimori/pluginsvc.go:55-64` (Type/Id/ProtoService today, no secrets).
- G1.3 `plugins/tmdb/doc.go` (new) — task 1.1. Mirror exists.
- G1.4 `plugins/tmdb/source.go` (new) — Match dispatch (task 1.2) + BuildRequest SERVER contract (task 1.3). Upstream env seam precedent verified: `plugins/shikimori/source.go:299-317` (`MELLIFERA_SHIKIMORI_UPSTREAM`, `upstreamBase()`, TrimRight "/").
- G1.5 `plugins/tmdb/convert.go` (new) — RU-first namespace + cast + episode titles + Merge (tasks 1.4–1.7).
- G1.6 `plugins/tmdb/search.go` (new) — SearchSpecs single-fetch + SearchResults (task 1.7).
- G1.7 Makefile `bin/tmdb` build line (task 1.1). Grounded: 7 plugin targets at `Makefile:43-49`; tmdb is the 8th.
- Compile-time `var _ sdk.MetadataSource` (task 1.1). Interface grounded: `pkg/sdk/metadata.go:26-33` — exactly six RPCs (Match, BuildRequest, Convert, Merge, SearchSpecs, SearchResults).

Group 2 — core server-mode auth plumbing:

- G2.1 `plugin.Manager.RequiredSecrets(pluginID) []string` (new method, `internal/plugin/manager.go`, task 2.1). Grounded: the retained handshake field at `manager.go:111` (`handshake *pluginv1.HandshakeResponse`); `mu sync.Mutex` at `manager.go:81`; sibling accessors `Scanner` (:184) / `MetadataSource` (:219) as the mu-guard precedent. Current manager returns untyped `fmt.Errorf("plugin: metadata_source: %q not loaded")` (:224) — RequiredSecrets' empty-slice law is additive.
- G2.2 `enrich.Deps.RequiredSecrets` closure (new field, `internal/enrich/enrich.go` Deps at :38-78, tasks 2.2/2.4). All existing Deps constructions compile untouched (nil-safe law).
- G2.3 `resolveVariables` (modified, `internal/enrich/fetch.go:281`, task 2.2). Grounded: rejects every redacted_ref today at :297-299 via `errRedactedRef` (:33). Callers: `buildPlan` (`chain.go:93`) and `fetchSource` (`fetch.go:192`) — the complete call-site set.
- G2.4 `fetchSource` (modified, `fetch.go:187`, task 2.2) — threads the resolved-secrets input. Prod callers: chain primary `chain.go:214`, `fetchExtras` `fetch.go:263`, search `search.go:83`.
- G2.5 `fetchExtras` (modified, `fetch.go:257`) — transitively threaded via fetchSource (the credits/season extras execute here; caller `chain.go:229`). Not named in 2.2's text but required by it; same package, unexported.
- G2.6 `buildPlan` (modified, `chain.go:85`, task 2.2) — resolves `server:` refs so relay descriptors satisfy client-relayed-fetch's server-authored rule. Prod callers: chain `runSource` handoff path and search `search.go:92` — both ride the same seam.
- G2.7 `runSource` (modified, `chain.go:168`, task 2.2) — resolves binding secrets, passes `AuthContext{Mode: SERVER}` at the BuildRequest call. Grounded: the EMPTY `Auth: &commonv1.AuthContext{}` today at `chain.go:188-190` with the D-7 comment. Callers: `enrichDoc` sync (`enrich.go:127`) and `runSourceRetryable` (`retry.go:49`).
- G2.8 Derivation queueability conjunct (modified, `queueable` `queue.go:633`, task 2.3). Grounded: `Enabled && AuthMode != "CLIENT"` today. Call sites: derive `queue.go:515` and `:555`, worker `worker.go:309` and `:407`.
- G2.9 `SearchSource` unconfigured check + `ErrUnconfiguredSource` (modified/new, `search.go:71`, task 2.3 — amended: the enrich-side sentinel is DECLARED here, shared by SearchSource AND IdentifySeries). No sentinel by this name exists in enrich today; the check is additive pre-action.
- G2.10 `IdentifySeries` unconfigured pre-write check (modified, `search.go:273`, task 2.3 — AMENDMENT ROUND 1, the Q2 resolution's producer half). Grounded: the method's current error law (empty-externalID → `errEmptyExternalID` :275, resolve-before-write :277-280, lease-then-load :282-292) leaves a clean pre-write slot; the check is additive and byte-identical for configured sources (empty required set passes).
- G2.11 cmd wiring: `loadPlugin("tmdb", …)` + `RequiredSecrets` threading (modified `cmd/mellifera/main.go`, task 2.4). Grounded: `loadPlugin` closure at `main.go:137`, shikimori literal at :194, `envOr` precedent at :750, enrich.Deps built at :206.

Group 3 — admin secret surface:

- G3.1 `module.Registry.SetBindingOptions` (new method, `internal/module/registry.go`, task 3.1 — AMENDMENT ROUND 1, the Q1 resolution). Grounded: `MetadataSourceBinding.Options json.RawMessage` at `registry.go:283`; the Registry struct at :237-240 is `ordered []Module` + `byID map[string]Module` — **no mutex today**; Open (:289) is the only builder. The amended task lands the Registry's FIRST synchronization (RWMutex or atomic snapshot swap guarding `ordered`/`byID` across Get/List AND the write, cache refresh under the same lock) with a `-race` concurrent-readers-plus-writer proof (`TestRegistryConcurrentReadersAndWriter`; the duty itself runs `go test -race`).
- G3.2 api `source_admin.go` + `PUT /admin/modules/{module_id}/sources/{plugin_id}/options` + `Deps.SetModuleBindingOptions` closure (new, task 3.2). Registration precedent: the admin/operator block at `internal/api/router.go:544-573`.
- G3.3 api aggregate **per-binding** required-secrets verdicts + served-options redaction + `Deps.RequiredSecretsStatus func(moduleID, pluginID string) map[string]bool` closure (modified `internal/api/plugin_admin.go`, task 3.3 — AMENDMENT ROUND 1, the Q4 resolution). Grounded: `pluginAdminBinding struct` at `plugin_admin.go:30` (the amended citation is EXACT) — each metadata binding row keyed by `module_id` carries its own verdicts; `Options json.RawMessage` served "verbatim" today (comment :19-21) — the leak claim is TRUE; closure-fed aggregate via `pluginConfigBindings` (:86-96); Deps nil-guard at :136-139. Tests renamed to the per-binding law: `TestAdminPluginsBindingSecretVerdicts`, `TestAdminPluginsBindingOptionsRedactSecrets`, `TestAdminPluginsNoDeclarationsUnchanged` (the duty's `-run TestAdminPlugins` prefix still matches all three).
- G3.4 api unconfigured 503 mapping + the **api-local `ErrUnconfiguredSource` twin** + cmd `%w` translation (modified `internal/api/identify.go` + `cmd/mellifera/main.go`, task 3.4 — AMENDMENT ROUND 1, the Q3 resolution). Grounded: handlers at identify.go:65 and :129; today's default branches → 502 (:95) and 500 (:158); the INV2 precedent — `api.ErrUnknownPlugin` declared api-local (`enrich_admin.go:32`), cmd closures wrapping via `%w`; the amended citations verified EXACT: `func newSearchClosure(` at `main.go:1153`, `func newIdentifyClosure(` at `main.go:1172`, the search-side `%w` pattern at `main.go:1158`. One pointer correction: the identify-side `%w` pattern sits at `main.go:1178`, not the amended text's ":1181" — same closure, same mechanism, off-by-3 digit; grounding note, not a contradiction. The new duty greps `ErrUnconfiguredSource` in `cmd/mellifera/main.go`, pinning the translation.
- G3.5 cmd closure translation edits (modified `cmd/mellifera/main.go` — the two EXISTING closures `newSearchClosure`/`newIdentifyClosure` gain the enrich-sentinel → api-twin wrap; task 3.4). New blast-radius surface (see Check 3).

Group 4 — serial seed v4 + item identify:

- G4.1 Serial seed v4 (modified `internal/module/registry.go`, task 4.1): `serialConfigJSON` `"schema_version": 3` today at :196; guarded-upgrade precedent v1→2 (:44-46) and v2→3 (:54-56); Open's upgrade chain at :311-330 (INSERT passes schema_version `3` at :312 — task 4.1's "fresh INSERT seeds v4 directly" covers this); serial bindings today serial-parser 1 / frame-grabber 2 / shikimori 3 — tmdb at 4 appended after shikimori matches the seeded order; display block byte-unchanged is feasible (`title_source_priority`/`rating_source_priority` both `["shikimori"]`).
- G4.2 `enrich.IdentifyItem` (new, task 4.2). Grounded law sources: `IdentifySeries` at `search.go:273`; `loadRow` at `queue.go:673` (item-first/series-second, `sql.ErrNoRows` on a gone row); `ReenrichSource(ctx, libraryID, pluginID, rowIDs ...string)` at `reenrich.go:59` — row-generic as claimed; unknown-row error today wraps with `%w` (`search.go:292`) so `errors.Is(sql.ErrNoRows)` survives — 4.3's 404-through-the-closure claim holds. Its `ErrUnconfiguredSource` reference resolves to the enrich-side sentinel declared in 2.3 (amended task set — consistent).
- G4.3 api `PUT /items/{id}/identify` + `Deps.IdentifyItem` closure (modified `internal/api/identify.go` + `router.go`, task 4.3 — AMENDMENT ROUND 1 wording: the new cmd closure wraps `enrich.ErrUnconfiguredSource` into the api twin at construction, "exactly like newIdentifyClosure"). Registration beside `router.go:566`; `OnTitleChange` fire precedent at `identify.go:161-163`; request/result shapes (`identifyRequest` :23-29, `identifyResult` :35-39) mirror as claimed.

Group 5 — joints + contract regen:

- G5.1 `internal/itest/tmdb_joint_test.go` (new, 5 legs, task 5.1). Harness precedent: ~20 joint tests exist under `internal/itest/`; ffmpeg-guarded-verify precedent in archived tasks (2026-10-31-playback-capability-gate tasks.md:22). The network-class leg is feasible: `classifyFetchError` classes connection-refused as network (`fetch.go:36-40` comment block). Leg (c)'s "the aggregate reads provided:false" is satisfiable under the amended per-binding shape (the joint reads the binding row's verdict).
- G5.2 swag + embedded-web regen (task 5.2). Grounded: `make web-build` runs `swag init -d internal/api -g doc.go -o internal/web/api` + vite → `internal/web/dist` (`Makefile:73`, :51-69 comments); both dirs committed — 5.2's tree-clean assertion targets exist. Covers the amended per-binding aggregate field too.

### Edges (planned relations; "impl" = the task that carries the edge)

- E1 cmd `loadPlugin("tmdb")` → launches the `bin/tmdb` subprocess with the `metadata_source` capability literal (impl 2.4). Grounded pattern: shikimori at `main.go:194`.
- E2 `mgr.RequiredSecrets` → `enrich.Deps.RequiredSecrets` (impl 2.4). Nil ⇒ empty required set ⇒ every existing source byte-identical (flag-3 anonymous law).
- E3 `runSource` → (binding `Options` ∩ `RequiredSecrets`) → `AuthContext{Mode: SERVER}` → BuildRequest at `chain.go:188-190` (impl 2.2).
- E4 `runSource` → `fetchSource` with secrets — chain primary `chain.go:214` (impl 2.2).
- E5 `runSource` → `buildPlan` with secrets → relay Consult/handOff descriptors fully resolved — `chain.go:93`, flag-5 resolution (impl 2.2; proven by joint leg (e) 5.1). Receiver grounded: `relay.go` purposes enrich|search (:27-28), `Consult` :194, `Ingest` :263.
- E6 `SearchSource` → unconfigured check → SearchSpecs → `fetchSource` with secrets — `search.go:71-83` (impl 2.3 + 2.2).
- E7 search relay handout → `buildPlan` with secrets → `searchOverRelay` — `search.go:92` (impl 2.2, same seam).
- E8 derivation + worker queueability → the required-secrets-resolved conjunct — `queue.go:515/:555`, `worker.go:309/:407` (impl 2.3).
- E9 `Registry.SetBindingOptions` → one binding's options in `config_json` + in-memory cache refresh **under the Registry's first synchronization (RWMutex or snapshot swap; `-race` proof)** (impl 3.1 — AMENDED; Q1 RESOLVED-BY-AMENDMENT).
- E10 cmd → api `Deps.SetModuleBindingOptions` → `Registry.SetBindingOptions` (impl 3.2; cmd wiring named in 3.2).
- E11 cmd `RequiredSecretsStatus(moduleID, pluginID) → name→provided` **per binding row** = `mgr.RequiredSecrets` ∩ THAT module binding's options → per-binding aggregate verdicts + served-options redaction (impl 3.3 — AMENDED; Q4 RESOLVED-BY-AMENDMENT).
- E12 `sourceSearch`/`seriesIdentify` → classify the api-local twin → 503 — **producer chain now complete**: SearchSource (2.3) AND IdentifySeries pre-write (2.3, amended) produce the enrich-side sentinel; cmd's `newSearchClosure`/`newIdentifyClosure` (3.4, amended) translate via `%w` onto the api twin (impl 2.3 + 3.4 — Q2/Q3 RESOLVED-BY-AMENDMENT).
- E13 serial seed v4 → Open's third guarded UPDATE after v3 → derivation sees the tmdb binding at priority 4 (impl 4.1).
- E14 `IdentifyItem` → `loadRow` → lease → identifiers overwrite → `ReenrichSource` strip → cooldown clear → Notify → derivation re-runs id-anchored (impl 4.2).
- E15 cmd → api `Deps.IdentifyItem` → `Queue.IdentifyItem`, with the closure carrying the same sentinel translation at construction (impl 4.3 — AMENDED wording).
- E16 tmdb Convert → `ConvertResult.EpisodeTitles` → `routeEpisodeTitles` (`episode_titles.go:49`) unchanged routing (impl 1.6 plugin-side; core side deliberately untouched). Ride-through grounded: collection at `chain.go:269`/`chain.go:131`, routing trigger `queue.go:795`, worker gate `worker.go:323`.
- E17 aggregate/served projection → SPA field-driven consumers (no task touches web — correct). Zero-UI-cost verified: `web/src/components/metadata/Synopsis.tsx` and `web/src/components/watch/InfoColumn.tsx` exist; `web/src/lib/api.ts:189-216` types `MetadataAbout`/`MetadataCastEntry`/`MetadataEpisode`; `web/src/pages/admin/Plugins.tsx` renders bindings field-driven with `options` behind a disclosure (:382-388) — additive per-binding `required_secrets` verdicts are invisible to it, redacted options simply render less.
- E18 swag annotations → `make web-build` → committed `internal/web/api` + `internal/web/dist` (impl 5.2).
- E19 tmdb handshake `required_secrets` → retained handshake → `Manager.RequiredSecrets` (impl 1.1 + 2.1). First user of plugin.proto field 6.
- E20 unconfigured dormancy → derivation skips; a later 3.1 write re-enables on the next derivation read, no wake (impl 2.3 + 3.2; "the write wakes nothing" is consistent with read-time dormancy).
- E21 tmdb episode/credits extras → `fetchExtras` (`chain.go:229`) → `Convert` per-extra conversion (impl 1.3 + 1.5 + 1.6).

## Amendment resolutions (round 1 — all four questions)

**Q1 — RESOLVED-BY-AMENDMENT (Registry concurrency).** Task 3.1 (amended) now opens: "the Registry's FIRST mutation path, so the Registry's first synchronization lands here — an RWMutex (or an atomic snapshot swap) guarding ordered/byID across Get/List AND the write, the in-memory cache refreshed under the same lock", names the fatal-concurrent-map failure mode verbatim, and adds `TestRegistryConcurrentReadersAndWriter` (readers hammer Get/List while a writer loops SetBindingOptions — clean under `-race`); the duty itself now runs `go test -race ./internal/module …` (tasks.md:40-41). Design flag 1's resolution carries the same sentence (design.md:20) and the Interfaces entry pins it (design.md:62). Verified against the live tree: the struct is lock-free today (`registry.go:237-240`), so the amendment lands exactly where the hazard is. **Verdict: holds.**

**Q2 — RESOLVED-BY-AMENDMENT (seriesIdentify unconfigured producer).** Task 2.3 (amended, "dormant everywhere the queue acts") adds: "SearchSource AND IdentifySeries run the same pre-action required-secrets check — … IdentifySeries (search.go:273) before ANY write so an unconfigured series identify answers without writing an anchor it can never re-derive — both surfacing the typed ENRICH-SIDE ErrUnconfiguredSource sentinel", with `TestIdentifySeriesUnconfiguredWritesNothing` added to the duty (tasks.md:33-34). D3 (design.md:48) now states the interactive-producer law ("an unconfigured series identify must answer unavailable, never write-then-dormant"). The producer→translator→classifier chain is complete: IdentifySeries (2.3, enrich sentinel) → `newIdentifyClosure` translation (3.4, `main.go:1172`/`%w` at :1178) → seriesIdentify 503 (3.4, classify against the api twin). The async-enrichment delta's requirement sentence ("its interactive search and identify actions SHALL answer unavailable", spec.md:17) needs no further amendment. **Verdict: holds.**

**Q3 — RESOLVED-BY-AMENDMENT (sentinel placement under INV2).** Task 2.3 declares the enrich-side sentinel ("declared here; 3.4 lands the api-local twin and cmd translates between them, the INV2 seam", tasks.md:33); task 3.4 declares the api-local twin ("the api package declares its OWN ErrUnconfiguredSource sentinel … the api.ErrUnknownPlugin precedent", tasks.md:46) and pins the cmd translation to the verified closures (`main.go:1153/:1172`, `%w` at :1158 — all three EXACT on the live tree); task 4.3's closure carries the same translation at construction (tasks.md:55); the 3.4 duty greps the translation into existence (`grep -q 'ErrUnconfiguredSource' cmd/mellifera/main.go`, tasks.md:47). Design D3 + Interfaces encode the same seam (design.md:48, :63). Exactly the recommended ErrUnknownPlugin-precedent shape. One pointer correction: the identify-side `%w` pattern is at `main.go:1178`, not ":1181" — off-by-3 digit on an unchanged file; the closure and mechanism are correctly identified, so this is a grounding correction, not a contradiction. **Verdict: holds** (with the :1178 correction recorded).

**Q4 — RESOLVED-BY-AMENDMENT (verdict granularity).** Task 3.3 (amended) attaches the verdicts to "each METADATA binding row … keyed by module_id", gives the closure the per-binding signature (`(moduleID, pluginID)` in, name→provided-bool out), names the multi-module case explicitly ("tmdb: tv priority 3 + serial priority 4, independent per-binding options and per-binding dormancy"), and states "a plugin row carries NO single provided-bool" (tasks.md:44); the plugin-admin delta is reworded to the same law with a new two-modules-disagree scenario (specs/plugin-admin/spec.md:31-47, "A plugin bound by several modules SHALL render each binding's own verdicts … a plugin row itself carries NO single provided verdict"); design Interfaces + Risks carry the per-binding wording (design.md:63, :71). Tests renamed to the per-binding law and the duty's `-run TestAdminPlugins` prefix still matches all three. Grounded against the live row type (`plugin_admin.go:30` — the amended citation is exact). **Verdict: holds.**

## Check 1 — Wiring coverage

**Verdict: COVERED — no orphan nodes; every planned node carries ≥1 edge implemented by a named task; the two round-0 caveats are resolved by amendment (E9 synchronization in 3.1; E12's producer in 2.3).** All round-0 anchors plus the amended citations verified (`main.go:1153/:1158/:1172` exact; `plugin_admin.go:30` exact; `:1178` corrects the ":1181" pointer). Residual in-scope notes (unchanged from round 0): `fetchExtras` (G2.5) and the worker-side `queueable` sites (G2.8) are required by 2.2/2.3's contracts without being named in them — same packages, transitively forced; implementers treat them as in-scope.

## Check 2 — qa seam coverage

**Verdict: COVERED.** The 8 @qa tasks (1.1–1.7, 5.1) carry non-empty `qa:` lists; the amendments ADD coverage where round 0 had notes: the identify paths gain `TestIdentifySeriesUnconfiguredWritesNothing` (2.3) alongside the 3.4 spy tests, so the series-identify unconfigured seam now has BOTH a producer-side enrich test and an api-side classification test. The search relay handout note is unchanged (acceptable — `searchOverRelay` shipped and unchanged; the new bit, secrets inside buildPlan, is unit-covered by `TestBuildPlanResolvesServerSecrets`).

| Seam | Named coverage |
|---|---|
| plugin handshake ↔ core accessor (E19) | 1.1 + 2.1 tests; end-to-end forced by 5.1(a) |
| enrich ↔ binding options (E3/E6/E8/E12-producers) | 2.2/2.3 unit tests incl. `TestIdentifySeriesUnconfiguredWritesNothing` + 5.1(a)(c) |
| registry write → read-through, now synchronized (E9/E20) | 3.1 roundtrip + `TestRegistryConcurrentReadersAndWriter` under `-race` + 5.1(c) |
| api ↔ enrich closure seams incl. the sentinel translation (E10/E12/E15) | 3.2/3.3/3.4/4.3 spy tests + 5.1(a)(c)(d); 3.4's duty greps the cmd translation |
| identify → re-derive (E14) | 4.2 tests + 5.1(d) |
| relay descriptor with server secrets (E5) | 2.2 buildPlan unit + 5.1(e) |
| seed v4 → episode-title routing (E13/E16) | 4.1 + 5.1(b) |
| search relay handout with secrets (E7) | 2.2 unit only — noted, not a gap |

The `qa:` paths' `tests/` prefix remains house convention (transcode-lane precedent) — not a finding.

## Check 3 — Complexity / blast radius (re-run)

**Verdict: CLEAN — the amendments introduce two new touched surfaces; both checked, neither opens a question.**

- **Registry sync (G3.1) now touches Get/List readers.** Reader set enumerated on the live tree: cmd closures `reg.List()` at `main.go:449` (ModulePresentation builder), `:1130` (`hasMetadataBinding`), `:1335` (plugin-configs closure); enrich `q.deps.Modules.Get` at `queue.go:450`, `:463`, `:735` (plus the worker path through the same deps). All become RLock readers — behavior unchanged, contention negligible (read-mostly, 3 module rows); holding the write lock across the store UPDATE is acceptable at this scale. The `-race` duty proves the whole surface. Copies returned by value (`Module` with slices) are unaffected by a snapshot swap.
- **cmd closure edits (G3.5, 3.4/4.3) touch the EXISTING closures.** The translation must be branch-scoped to the unconfigured sentinel so every existing passthrough stays byte-identical: `sql.ErrNoRows` → 404 (identify), `sdk.ErrSearchUnsupported` → 400 (search, the search.go re-wrap), unknown-plugin pre-validation → `api.ErrUnknownPlugin`, raw errors → 500/502 defaults. `cmd` already imports both `enrich` and `api` (main.go builds enrich.Deps and the closures), so the `%w` hop adds no import edge. No blast.
- **IdentifySeries pre-write check (G2.10)** is the one behavioral change to an existing endpoint, and it is the amendment's point (spec-mandated by the async delta's "identify actions SHALL answer unavailable"): unconfigured returns before lease + anchor write; configured sources keep byte-identical behavior (empty required set passes).
- **Per-binding aggregate field (G3.3)**: additive on `pluginAdminBinding`; wire change covered by 5.2's regen; SPA field-driven (E17).
- Unchanged from round 0: `resolveVariables`' ripple confined to two internal callers + `fetchSource`'s three callers + `fetchExtras` (all unexported); `runSource`'s callers thread the secrets input with the sync `Enrich` path byte-identical under the nil closure; serial v4 upgrade path verified (pre-v3 rows pass all three guarded UPDATEs, INSERT literal :312 → 4); design flags 1–6 resolutions re-checked and holding (flag 3 mode-only AuthContext vs the relay leg holds because substitution is core-side — the shipped client-relayed-fetch spec already names the server-resolved-secret scenario, spec.md:81-92/:232).

## Questions

**NONE — the question frontier is empty.** All four round-0 questions were resolved by amendment round 1 (resolutions recorded above with artifact evidence and live-tree grounding); the re-run surfaced no new contradictions. Grounding corrections recorded in passing: the amended 3.4 text's ":1181" pointer is `main.go:1178` on the live tree.

## Human resolutions

(recorded at GATE 1)
- Q1 Registry concurrency → **resolved by amendment round 1** (3.1 synchronization + `-race` proof).
- Q2 seriesIdentify producer → **resolved by amendment round 1** (2.3 IdentifySeries pre-write check + `TestIdentifySeriesUnconfiguredWritesNothing`).
- Q3 sentinel placement under INV2 → **resolved by amendment round 1** (enrich-side 2.3, api twin + cmd translation 3.4, 4.3 closure).
- Q4 verdict granularity → **resolved by amendment round 1** (per-binding verdicts in 3.3 + reworded plugin-admin delta).
- Waivers: none.
