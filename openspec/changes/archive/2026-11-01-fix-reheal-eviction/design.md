# Design

## Context

The lazy re-heal publishes through the enrich streams lane, whose success
persist fires `Deps.AfterPackPersist` (`internal/enrich/streams.go:147-149`)
with the new nonce; `cmd/mellifera/main.go:236` wires that seam to
`mediaSvc.EvictSuperseded` (`internal/stream/service.go:166-186`), which
`os.RemoveAll`s every directory under `Root/<itemID>/` except the keep
nonce — synchronously, inside the lane's `workStreams`, with zero
playback/session/age awareness. The budget side of the house already knows
better: its eviction moves aside before deleting (`evictDir`,
`cmd/mellifera/playback.go:408`) and its stale-nonce branch explicitly
declines to unpublish what it did not take
(`resetStreamsState`, `cmd/mellifera/playback.go:446`). The periodic sweep
(`newSweep`, janitor task `streams`, `sweepInterval = 60s`,
`cmd/mellifera/playback.go:43`) already walks every item directory, reads
every row, and owns the eviction vocabulary — it is the natural home for
retention. See proposal.md — Why for the incident.

## Goals / Non-Goals

**Goals:**

- A superseded build never disappears while a session may still hold URLs
  into it: publish retains, the sweep reclaims past a grace window.
- Zero new persistent state: "superseded" stays derivable (directory name ≠
  document nonce) and the grace anchors on facts already on disk (directory
  mtime) and in the row (`items.updated_at`, stamped on every `PutItem`,
  `internal/store/items.go:66`).
- Budget pressure keeps its teeth: retention never shields an artifact from
  the cap, and stale directories go before current ones (no unpublish → no
  evict-heal churn).
- The pack lane's publish path becomes strictly simpler: persist and done.

**Non-Goals:**

- No face-(a) work (play-during-heal serves the stale build until publish):
  fail-open by design — the debugger's ruling; the repro pins the property.
  A descriptor hint while a re-heal is pending is a future change, not this
  one.
- No serving-surface or descriptor change, no token change, no new log
  lines, no wire/OpenAPI/embedded-build change.
- No last-access tracking, no per-session reference counting: the grace is
  time-based by design (the observed kill window is ~30s of buffered
  segments; 10 minutes is ~20x margin).
- No budget-cap or cadence knob changes (`sweepInterval` stays 60s).

## Interfaces (cross-group contracts)

1. **Seam removal (Group 1 → everyone).** `internal/enrich.Deps` loses
   `AfterPackPersist` (field + contract doc, `internal/enrich/enrich.go:54-61`);
   `workStreams`' success path ends at `persistStreams`
   (`internal/enrich/streams.go:141-149` — the D5 comment block goes with
   it); failure paths are byte-unchanged. `internal/stream` loses
   `Service.EvictSuperseded` (`service.go:156-186`) and
   `internal/stream/evict_test.go` entirely. `cmd/mellifera/main.go:233-236`
   loses the wiring and its comment. Consumers edited in the same group:
   `internal/enrich/streams_test.go` `TestStreamsLaneAfterPackPersist`
   (`:486-570`) is deleted (the ordering contract it pinned existed for the
   eviction's safety argument; the lane's write-path contract stays covered
   by the metadata-preservation test above it), and the two joint wirings
   drop their seam lines (`internal/itest/pack_manifest_audio_joint_test.go:386`
   inside `pmaQueue` — signature unchanged, the repro's call
   `pmaQueue(t, w, w.media, nil)` keeps compiling;
   `internal/itest/playback_capability_gate_joint_test.go:95` and its header
   comments `:10-13, :28, :84`).
2. **Retention rule (Group 2, `cmd/mellifera`).** New locked constant
   `retentionGrace = 10 * time.Minute` beside `sweepInterval`
   (`cmd/mellifera/playback.go:40-43` — the locked-const precedent), passed
   as a parameter for testability (the `budgetBytes` pattern), NOT an env
   knob. New pass `sweepRetention(ctx, st, root, grace)` wired into
   `newSweep` between frontier and budget (frees stale bytes before budget
   accounting; runs regardless of the cap — the budget knob's off position
   must not immortalize stale builds). Per item directory, one row read
   (`st.GetItem`):
   - row read error (not `ErrNoRows`) → skip the item (never evict blind —
     the `sweepBudget` precedent);
   - orphan (`ErrNoRows`) → every directory is stale; judged on directory
     age alone;
   - live row → stale directory = a directory that is not
     `doc.streams.nonce` (any packaging state — `complete` names its build,
     `none`/`failed`/partial-nameless docs leave every directory stale),
     not `.trash`-suffix-immune (stale trash is reclaimed too — crash
     hygiene), not `.tmp-`-prefixed-fresh (see the anchor rule);
   - reclaim a stale directory iff `now − dirMtime ≥ grace` AND (row
     missing OR `now − row.UpdatedAt ≥ grace`); the mtime anchor protects
     in-flight packs (staging and the renamed head-first build grow →
     fresh), the row anchor protects just-superseded builds (the success
     persist stamps `updated_at` at the supersede moment; any later doc
     write only extends the window — over-retention is safe, bounded);
   - reclamation rides `evictDir` (move-aside + delete + its existing
     `orchestrator: evicted artifact directory` line) — no
     `resetStreamsState` call (retention never touches the document-named
     build, so there is nothing to unpublish); no new log lines.
3. **Budget stale-first precedence (Group 2, `internal/orchestrator` +
   `cmd/mellifera`).** `orchestrator.ArtifactDir` gains `Stale bool`; the
   `Evictions` sort inserts ONE clause after the fronted pin and before
   recency: stale before current (`if a.Stale != b.Stale { return a.Stale }`)
   — evidence `internal/orchestrator/budget.go:63-79`. `sweepBudget`
   computes `Stale` from the row it already reads: `doc.streams.nonce` ≠
   directory name; orphans and `deleted`-status rows mark every directory
   stale (pure waste — the orphan-first principle at directory granularity).
   `Evictions`' signature is unchanged; the zero-value `Stale` keeps every
   existing caller and test behavior identical. Stale `.tmp-` staging stays
   budget-untouchable (`inFlightPrefix` skip stands — retention owns
   staging).
4. **Contract flips (Group 1, `internal/itest`).** The three sites encoding
   "exactly ONE directory survives" flip to the retention contract —
   superseded directory PRESENT and SERVING after the repack, fresh
   descriptor on the fresh nonce:
   - `internal/itest/pack_manifest_audio_joint_test.go:1233-1238` (pma_e
     dir count) and `:1250-1253` (old URL must answer 200 — the assertion
     inverts); `:1331-1334` (pma_f dir count); header comment `:15, :370`.
   - `internal/itest/playback_capability_gate_joint_test.go:531-548` (leg b
     dir walk) and `:554-557` (old URL must answer 200); header `:10-13,
     :28, :84`.
   - `internal/itest/reheal_eviction_joint_test.go` is NOT modified — hard
     constraint. Its header comment narrates the diagnosis (it names the
     seam that Group 1 deletes); the assertions are the pin and they turn
     green unchanged. The comment stays as the incident record.
   - `internal/stream/evict_test.go` — deleted with its subject (Interface
     1); its hard edges (staging spared, other items spared, best-effort,
     unsafe-path refusal) re-land as retention-sweep unit tests in
     `cmd/mellifera/retention_test.go` (new file, package main: grace
     respected on both anchors, current build spared, fresh staging spared,
     stale staging + stale trash reclaimed, orphan age rule, unreadable row
     skipped) plus the `TestBudgetEviction` stale-precedence case in
     `internal/orchestrator`.

## Decisions

- **D1 — Retire the seam entirely (OQ3), not keep-it-non-destructive.**
  With deletion moved to the sweep, `AfterPackPersist`'s documented purpose
  ("the composition root can safely evict") is false; a vestigial publish
  hook that names eviction is a trap — the next wiring reintroduces the
  incident class. The ripple is bounded and fully enumerated (Interface 1).
  Declined: keeping the seam as a log/hook point — a hook with zero
  consumers is dead code the repo carries forever; the enrich lane can grow
  a real post-persist hook when a real consumer exists.
- **D2 — Grace 10 minutes, locked (OQ1 + OQ2).** The observed kill window
  is one buffer (~30s) until the session's next descriptor fetch; 10
  minutes is ~20x margin and covers pause-and-resume within the window.
  4h (token TTL) would double per-item disk for the whole window — and a
  rule bump re-heals EVERY packed item at once, so the whole library would
  sit at 2x for hours, competing with the 32 GB cap and the frontier's
  working set. Locked constant + function parameter (the `sweepInterval` /
  `budgetBytes` precedents); the repo's explicit "no env knob by design"
  stance (`cmd/mellifera/main.go` relay comment) applies. Residual: a
  client paused longer than the grace and resuming on old URLs 404s —
  materially the same exposure as any budget eviction today.
- **D3 — The dual age anchor (the subtle one).** Either anchor alone is
  wrong: directory mtime alone reclaims a days-old build at the first tick
  after its supersede (the incident survives at 60s granularity — the fix
  would not fix the incident), and row `updated_at` alone evicts in-flight
  packs (a first pack's document was last written at scan time; its
  head-first build directory is fresh but the row is old). Both anchors
  past grace = reclaim. The truth table lives in Interface 2; the
  over-retention direction (later doc writes extend the window) is the safe
  one.
- **D4 — Stale-first in the budget LRU (OQ5, the strong form).** The OQ's
  letter is "reclaim first"; the weak form (stale dirs merely stay
  evictable — true today for free) does not deliver "first": recency could
  still take an unwatched item's current build before a watched item's
  stale nonce. The strong form is one sort clause plus a `Stale` bit, and
  it directly prevents churn: reclaiming a superseded directory
  unpublishes nothing (`resetStreamsState`'s stale-nonce branch already
  declines), while reclaiming a current build unpublishes → the integrity
  sweep heals it straight back → repack → evict (the documented
  evict-repack loop).
- **D5 — Retention runs with the cap off.** `sweepBudget` returns when
  `budgetBytes <= 0` (the `0` = off knob). Retention is not budget policy;
  a separate pass keeps stale builds mortal for operators who disabled the
  cap, and keeps the budget pass's early-return untouched.

## Risks / Trade-offs

- [A paused >10min client resumes into a reclaimed build] → bounded,
  disclosed residual (D2); the same exposure class as budget eviction
  today; the player's descriptor retry answers the fresh build.
- [Any later document write extends the grace (rescan carry-forward,
  metadata enrichment)] → over-retention only — the window grows, never
  shrinks; bounded by write frequency (D3).
- [Retention walks every item directory each tick] → the sweep already
  walks the same tree three times (frontier reads the store, budget walks
  the disk, integrity walks the disk); one more read-only pass with the
  row already cached per item is noise at library scale.
- [Deleting the seam breaks out-of-tree wiring] → in-tree-only contract;
  the two joint wirings and the repro's `pmaQueue` call site are the whole
  consumer set (grep-verified); no wire surface moves.
- [Orphan/stale-staging reclamation is a behavior expansion beyond the
  incident] → deliberate hygiene win (today stale `.tmp-` staging is
  immortal unless budget pressure finds it; orphaned builds live forever
  with the cap off); flagged for GATE 1 — drop both from the rule by
  narrowing the stale predicate if declined (one condition each).

## Migration Plan

No data migration, no config, no wire change. Deploy = restart: the first
sweep tick after boot runs retention (the janitor boot-runs every enabled
task once), and the first re-heal after that retains instead of killing.
Rollback = revert: builds deleted under the new rule before a rollback are
gone (the integrity sweep re-heals current builds; superseded ones are
not missed — nothing names them).

## Diagram Decision

exclude: the lifecycle is linear (publish retains → sweep reclaims past
grace → budget reclaims under pressure) and prose carries it in one pass;
the only non-prose-shaped artifact is the two-anchor reclaim truth table,
which is tabulated in Interface 2 — a graph would repeat it.

## Isolation

```json
{"mode": "worktree", "branch": "feature/fix-reheal-eviction"}
```

## Open Questions

None deferred — the five dispatch questions carry recommended rulings in
proposal.md — What Changes and design D1–D5, for GATE 1 to approve or
override: (1) grace scale 10 min (D2); (2) locked constant, no knob (D2);
(3) seam retired, not kept non-destructive (D1); (4) face (a) out of scope
(Non-Goals); (5) stale-first budget precedence, the strong form (D4). The
orphan/stale-staging retention expansion is flagged in Risks for GATE 1
awareness.
