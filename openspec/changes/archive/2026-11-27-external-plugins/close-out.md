# Close-out — external-plugins (archived 2026-11-27)

## What shipped

Core-side mechanisms for adult plugins living in a SEPARATE private repo (`mellifera-ext-plugins`, scaffolded out-of-tree at `/Users/aldfiar/projects/go/mellifera-ext-plugins`, uncommitted local state at close):

- **Optional plugin load sites** — `loadPluginOptional` + composition-root `optionalState` + `pluginHealths` consult-first synthesis + `stoppableIDs`; absent binary = one info log + synthesized `not_serving` row, boot GREEN; broken = failed row; the 8 in-repo fatal sites byte-identical (source-pinned). `MELLIFERA_EXTRA_PLUGINS`/`MELLIFERA_EXTRA_PLUGINS` env overrides (envOr law).
- **No-relay binding trait** — `MetadataSourceBinding.NoRelay` (`no_relay` config key), guarded at BOTH enrich seams (`relayScope.handOff` pre-enqueue, consult exclusion) and the search seam (unexported `relayExempt` walker); trait-absent behavior byte-identical (traitless-twin control test).
- **tv seed v3** — guarded idempotent promotion; 6-entry chain: ext-source-a (priority 5, LOCAL, enabled, no_relay) + ext-source-b (priority 6, SERVER, enabled, no_relay, dormant until its declared required option resolves; seed enabled:true — the kinopoisk precedent; mute-only gates can never revive a disabled binding, so dormancy rides the option, never an enabled flag).
- **Raw substitution mode** — `{base_url!raw}` template marker substitutes VERBATIM (origin values survive); default QueryEscape unchanged for everything else; legacy byte-identical pinned.
- **Aggregate boot fix** (amendment 4.2) — catalog-known ids outside `loadedCaps` render config-less rows instead of 500ing `GET /admin/plugins` on the default (absent-binary) boot; `internal/api` untouched; stale integration golden folded to seed v3.
- **Stub-binary joint itest** — `internal/itest/externalstubbin` (contract-conformant subprocess plugin) + three wire legs: dormancy→option-PUT→derive→enrich→namespace+anchor; mismatched-handshake skip-and-report; no-relay seam proof (relay live, upstream dead → plain `exhausted` row, claim pool EMPTY).
- **Deploy templates** — compose `./plugins-external:/app/bin-extra:ro` parent-dir mount (dangling-symlink-proof) + env lines; `.env.example` commented defaults (absent = dormant).
- **External repo** (tasks 5.x–8.2): scaffold (go.mod require mellifera v0.4.0 + GOPRIVATE/insteadOf + go.work dev-replace + Makefile release targets + golangci + release workflow + README), both plugin bootstraps (enforced min-core handshake — tmdb ignores the request, these error below floor), code-grammar grammar (19-accept/16-reject/13-normalize corpus), ext-source-b REST mapping (probed live wire shapes incl. the unscraped discriminator), both source impls (empty-spec local-source law; `{base_url!raw}` search spec; miss→empty→terminal no_data), external behavior specs (release-code-parsing, ext-source-b-enrichment incl. the never-self-retries convergence contract), operator runbook + `deploy-plugins.sh` (checksum verify, rename-on-fetch, built_against skew refusal, symlink flip, compose restart, health probe — stub-tested end to end).

## Receipt record

22 tasks (21 authored + built-in git-check). 45 receipts in `.tmp/external-plugins/receipts.jsonl` (deleted at clean — this file is the durable record): every authored task's final receipt exit 0 under `--by wf-coder`/`wf-qa`, then re-run green under `--by wf-reviewer` at GATE 2. One law-preserved red receipt: 4.1's first verify — the defect run that surfaced the production aggregate-500 (G1 regression), fixed by amendment task 4.2, re-run green. Amendment tasks 4.2/4.3 entered the plan mid-apply through an approved GATE 1 amendment (surveyor findings).

## Gates

GATE 1: approved 2026-11-27 with defaults + 3 surveyor amendments (rename-on-fetch → 8.2; relay QA leg → 4.1; absent-binary spec scenario → plugin-pipeline delta). GATE 2: PASS all five axes (re-runs 21/21, delta trace complete, standards PASS — 4 P2 comment rewords F1–F4 landed pre-close; integration re-ground zero orphans, waivers honored; cmd-match green). Human archive approval recorded in the change folder's review.md.

## Residuals / operator queue

1. **Outward acts (operator, GATE-1-approved)**: `gh repo create mellifera-ext-plugins --private` + first push (the repo is a complete local git state, 20+ files, nothing committed); external release publication (`make release VERSION=v0.1.0` + tag → CI); alatoic layout (`plugins-external/releases/<tag>/` + `current`); core-first deploy order; live probes (absent-binary boot already proven by itest; live = binaries load + real enrich).
2. **external enrichment source catalog is 100% unscraped** (361 rows, all `scrapedAt: null` probed 27 Nov) — enrichment converges only after external enrichment source-side scrapes + explicit re-enrich (30-day no_data cooldown never self-retries).
3. **v1.1 queue**: scrape-job fallback (`scrape_on_miss`) + the options-forwarding core change (`chain.go` never populates proto options on Match/BuildRequest/Convert — standalone future core change, v0.5.x candidate); upstream-site direct-scrape variant gated on the generic header-substitution seam (fetch.go sets header values verbatim today); cookie paste UX rides that variant.
4. **Deploy wiring on alatoic**: compose.yaml/.env.example changes ride the core PR; the server-side `plugins-external/` layout is created by first deploy.
5. Flag routed to /audit by the reviewer: legacy "(tmdb-enrichment 7.2)" provenance id on the PluginIDTmdb doc comment.
