# Integration survey — change `cleanup` (comment-only Go cleanup)

Surveyor: wf-surveyor · 2026-11-11 · baseline 792031a (GREEN, `go test ./...` rc 0)
Amendment rounds: round 1 re-run (Q1–Q8 resolved; introduced Q9–Q11); round 2
confirmation pass — Q9–Q11 verified RESOLVED against the amended text (§5, round-2
block). **Frontier after round 2: EMPTY** — no open questions, nothing waived; GATE 1
can proceed to approval. §2/§3 grep tables are the round-0 record; §3's Q9–Q11 and §5
carry the post-amendment state.
Inputs: proposal.md, design.md, tasks.md, tasks/{3.1,4.1,5.1}.md (this folder);
`/Users/aldfiar/projects/go/mellifera/.tmp/comment-noise-audit.md` (requirements source);
`.claude/skills/go-clean-code/SKILL.md` (law — main tree; absent from this worktree, by
design per proposal.md §What-Changes out-of-scope note).

**Grounding note.** The live map (`wf index query`, auto-built in this worktree,
fingerprint 792031a, CURRENCY: CURRENT) indexes FILES only in this install
(`symbols=0`, `defs=[]`), so node grounding below is file-level through the map plus
direct `file:line` grep in the worktree for every symbol/text fact. No finding rests on
prompt memory. Register legality of tasks.md's `#`-banner header lines is grounded in
the wf source (`/Users/aldfiar/.claude/tools/wf/pipeline.py:516-517` — indent-0 `#`
lines "ride above the grammar").

## §1 Planned graph

This change moves no symbols and adds no imports — the planned integration surface is
TEXTUAL: nodes are authored file edits; edges are edit-SEQUENCE dependencies (which
task's text another task's duty or pointer reads) plus the two read-only input anchors.

**Nodes — 16 tasks / 8 groups; 63 authored file paths, all verified present at base**
(zero misses across the spot-checked set, including both 8.1 deletion targets):

| Group | Task | Files (authored) |
|---|---|---|
| 1 | 1.1–1.4 | web/web.go · api/viewer.go · store/doc.go · api/recs_ordering.go · plugin/manager.go · stream/pack_repro_tail_window_test.go · identity/service.go |
| 2 | 2.1–2.3 | store/{viewer,doc,open,progress,recs,relayjobs,item_parsers}.go · cmd/{main,playback}.go · plugins/{tmdb,image-enricher,base-scanner,serial-scanner,serial-parser,frame-grabber,tv-parser,shikimori}/* |
| 3 | 3.1 | cmd/{main,playback,browse_wiring}.go (`file:` contract, audit:true) |
| 4 | 4.1–4.2 | api/{router,handlers}.go (4.1, contract) · api/{viewer,relay,middleware,home,display,art,facets,playback,recs_ordering}.go + module/registry.go (4.2; facets+playback added by the Q3/Q9 amendments) |
| 5 | 5.1–5.2 | store/open.go · stream/{describe,pack}.go (5.1, contract) · store/{viewer,adopt,relayjobs}.go · identity/{resolve,state}.go · pack/pack.go (5.2) |
| 6 | 6.1 | enrich/{reenrich,worker,search,relay,enrich,retry,episode_titles,chain,fetch,queue,streams}.go · scan/{run,adopt}.go · naming/{display,metadata,binding}.go |
| 7 | 7.1–7.2 | 15 doc.go strips (enrich, browse, plugin, scan, store, identity, stream, access, web, image-enricher, shikimori, tmdb, serial-scanner, tv-parser, base-scanner) · pluginsvc×8 + pathguard×2 + ffprobe×2 + pkg/sdk/* + releasename/{parse,tags}.go |
| 8 | 8.1 | DELETE itest/{integration_pipeline_test,qa_pipeline_acceptance_test}.go · compress itest/{qa_tombstone_adoption_joint_test,accounts_ac_matrix_test}.go headers |

**Edges — cross-group file-edit sequences (edit order matters; group order is the DAG):**

1. store/doc.go: 1.2 (INV5 rewrite) → 2.1 (error-floor canonical) → 7.1 (catalog strip) — mapped in design.md §Interfaces
2. store/viewer.go: 2.1 (D7 canonical) → 5.2 (twin-doc residual) — mapped
3. store/open.go: 2.1 (ensure* pin) → 5.1 (schema essays) — mapped
4. store/relayjobs.go: 2.1 (D7 pointer) → 5.2 (relayClaimWhere doc) — **NOT in design's map** (Q6)
5. cmd/main.go: 2.2 (ctx canonical) → 3.1 (trims) — mapped
6. cmd/playback.go: 2.2 (D3 canonical at suppressionSet:336/349) → 3.1 (trims; contract references, never re-narrates) — mapped
7. api/viewer.go: 1.1 (tutorial delete) → 4.2 (head trim) — mapped
8. api/recs_ordering.go: 1.3 (doc reattach at def :731) → 4.2 (essay trims) — mapped
9. plugin code files: 2.3 (invariant pinning) → 7.2 (replica residuals) — mapped
10. plugin doc.go files: 2.3 (canonical where doc.go is home) → 7.1 (strip) — mapped conditionally
11. identity/service.go: 1.4 → (nothing later) — mapped, terminal
12. enrich|scan doc.go: 6.1's `gofmt` GLOB covers doc.go but 6.1's edit list does not; 7.1 edits them — cosmetic, no edit overlap (safe)

Input edges: every task → law + audit (read-only, main tree). Duty-anchor edges:
1.2's positive greps (INV5 / internal/access / internal/relay in store/doc.go) are held
by 7.1's keep-law prose + its INV5 grep; 7.1's INV greps hold D5.

**Wiring coverage:** every node carries a duty into the live system (gofmt over the
authored files; scoped `go build`/`go vet` per §Interfaces; greps pin the P0 text
anchors). No orphan nodes: all 16 tasks edit files, no new modules, no registration
surfaces — the change's wiring claim is the baseline-green build staying green, which
every duty re-proves. qa seam coverage: no new modules → the @qa mandate never fires
(design Non-Goals concur); no bare seams — the change is comment-only.

## §2 Check verdicts

**Check 1 — Duty-vs-later-task text stability: HOLD-WITH-CHANGES (Q1 high, Q5 medium).**
Full trace of every duty grep:

| Duty grep | Task | Later edits of same file | Verdict |
|---|---|---|---|
| `! 'known gap Task 12' web.go` | 1.1 | none | SAFE (present at :50, single line; no later task edits web.go) |
| `! 'THE CALLING PATTERN' api/viewer.go` | 1.1 | 4.2 (deletes only) | SAFE |
| `! 'MAY NOT import any internal' store/doc.go` | 1.2 | 2.1, 7.1 | **DEAD RUNG** — text wraps across :117-118; pattern matches no single line at base → passes vacuously (Q5); no permanent-red risk |
| `grep 'INV5' store/doc.go` | 1.2 | 2.1 (adds), 7.1 (strips catalog) | SAFE via D5 + 7.1's own INV5 grep; body-text survival prose-only (→ Q8) |
| `grep 'internal/access' / 'internal/relay' store/doc.go` | 1.2 | 2.1, 7.1 | Planned-survival (they live in the INV5 body the keep-law protects); **no duty rung of their own** (→ Q8) |
| `! 'anti-N+1 posture' api/recs_ordering.go` | 1.3 | 4.2 | **WRONGLY SCOPED** — TWO base sites: :501 (the misplaced essay 1.3 deletes) AND :65 (recsFacts's doc, a legitimate WHY outside 1.3's edit) → duty RED AT APPLY; stays red at GATE 2 if 4.2's compressed prose keeps the phrase (the law says keep genuine WHY) (Q1) |
| awk def-attachment rung (1.3) | 1.3 | 4.2 | BSD-awk-sound (§3); vacuous-pass only if the def vanished — impossible under comment-only (noted, not a question) |
| `! 'errNotLoaded' manager.go` | 1.4 | none (single base site :273) | SAFE |
| `! 'EXPECTED TO FAIL' pack_repro test` | 1.4 | none (:40) | SAFE |
| `! 'later tasks of this package' service.go` | 1.4 | none (:13; design map: terminal) | SAFE |
| `grep 'INV' enrich/doc.go` | 7.1 | only 8.1 follows (no doc.go edits) | SAFE |

**Check 2 — Group-DAG soundness: ORDER SOUND; MAP INCOMPLETE; TWO LANDING-ZONE
CONTRADICTIONS.** Verified: group 2 pins before groups 3–7 compress (every pinning
target file precedes its trimmers: edges 1–6, 9–10); 7.1 strips after 2.1/2.3 move text
INTO doc.go files (edges 1, 10) — the claimed order holds in tasks.md. No intra-group
file overlap (checked every group's file lists pairwise — zero shared paths). Design's
file-overlap map covers edges 1–3, 5–11 but omits edge 4 (Q6). Two landing zones
contradict: the 2.1 error-floor canonical's home inside store/doc.go is unspecified and
the only pre-existing error-floor-flavored text ('404-able' ×2, doc.go:50,52) sits
INSIDE the Public API catalog 7.1 deletes — with the audit's premise "doc.go already
owns them" false (zero ErrNoRows mentions in doc.go; the clauses live in
art/items/libraries/item_parsers/ledger/recs/progress/series/relayjobs.go) (Q2); and
the viewer-scope dedup (7 sites, 4 files) spans files outside the owning task (Q3).
Matroska's dedup names a file outside every task (Q4).

**Check 3 — Duty mechanics: PASS (mechanics), two authored-duty defects flagged (Q1,
Q5), hardening recommended (Q8).** Every duty: assertions chain explicit exits, all end
`exit 0`, no GNU-only flags (gofmt/grep/test/awk only). The 1.3 awk —
`awk '/^func \(a \*app\) seriesStartedFact/{if (prev !~ /^\/\//) exit 1} {prev=$0}'` —
is BSD-awk (darwin BWK awk) sound: ERE `\(` `\*` escapes valid; two-rule order gives
prev = the line above the def; `exit 1` propagates through the duty's `|| exit 1`;
uninitialized prev correctly fails a line-1 def. Register grammar: verified
(pipeline.py:505-534 — group headings, `- [x]` refusal, N.M id space, duplicate-id
refusal; :516-517 banner lines legal). All 16 ids unique; fields at exactly two-space
indent; `verify:` exactly once per task; three `file:` contracts legal.

**Check 4 — Six-slot contracts: PASS (one contract-internal contradiction → Q4).**
tasks/3.1.md, 4.1.md, 5.1.md duties byte-match tasks.md lines 32/39/48; scope In-lists
match the task lines; all named files exist. 5.1's prose offers classification.go as a
possible matroska home while its Out-list excludes it — internal contradiction (Q4).
4.1's swaggo keep-law is real (38 annotation lines in handlers.go; router.go carries 0 —
vacuously true there, consistent).

**Check 5 — Blast radius: PASS (residues flagged).** The 8.1 deletion targets contain
exactly one skipped test func each (TestIntegrationPipeline, TestQA_PipelineAcceptanceReDerivation),
define no live symbols (the ipAssert*/qpp* helpers were pre-retired; `go vet
./internal/itest` is the right dangling-ref rung). Residue: integration_async_test.go:15
provenance comment names integration_pipeline_test.go as predecessor — dangles after
deletion, no task owns that file (Q7); docs/project_structure.md:687 enumerates the
deleted filename — owned by the @wf-docs close step, not a task. No task line implies a
code edit; the only executor-pull-into-code traps are the scope contradictions (Q3, Q4).

**Check 6 — Coverage: COVERED (two partial/contradictory ownerships → Q3, Q4).**
Audit execution-order items → tasks: (1) P0s + 3 micro-stale → 1.1–1.4 (all 4 P0s +
all 3 "Also stale" sites grounded present at base); (2) comment-DRY pinning →
2.1–2.3 + area tasks; all 13 pattern-2 families owned EXCEPT viewer-scope (partial,
Q3) and matroska (contradictory, Q4); (3) mega-docs → 3.1 (main.go 39%/645), 4.1
(router 73%, handlers 35%), 5.1 (describe 65-line, stream/pack 45-line, open.go 17
essays), 6.1 (reenrich 35), 4.2 (registry 31); (4) per-area trims → groups 3–6, order
mirrors the audit's P1 list (cmd → api+module → store/stream/identity/pack →
enrich/scan/naming); (5) doc.go strips → 7.1 (all 15 audit-named doc.go files, INV
keep-law) + plugin dedup residual → 7.2 ("moved to pkg/releasename" story owned);
(6) itest → 8.1 (2 deletions + the 2 egregious headers; the 23-file idiom deliberately
out of scope per proposal). Deliberate exclusions all documented: secondary CODE
findings, web/, skill-anchor update (post-merge follow-up), model files untrimmed
(fsnotify.go, browse/search.go, web/swagger.go — none in any scope). No audit
execution item is left unowned beyond Q3/Q4.

## §3 Questions (recommended answers — the surveyor recommends, the human decides)

**Q1 (HIGH — duty mis-authored, red on a green reality).** Task 1.3's verify greps
`! grep -q 'anti-N+1 posture' internal/api/recs_ordering.go || exit 1`, but the phrase
exists at TWO base sites: recs_ordering.go:501 (inside the misplaced essay 1.3 deletes)
AND :65 (recsFacts's doc — "the anti-N+1 posture the composition is built on" — a
legitimate WHY outside 1.3's described edit). The duty goes red at 1.3's apply through
no fault of the executor, and stays red at GATE 2 if 4.2's compression keeps the
phrase (the law keeps genuine WHY). *Recommended answer:* amend 1.3's verify to a
fragment unique to the misplaced essay and absent from the prescribed 2-line contract —
e.g. `! grep -q 'the same floor ItemTags serves' internal/api/recs_ordering.go ||
exit 1` (verified unique in the file at base, :503; alternatives: 'ZERO-position row'
case-sensitive :498). Keep the awk rung as-is.

**Q2 (HIGH — canonical home can be silently deleted by a planned later edit).** 2.1
collapses the ErrNoRows/value-agnostic/404-mapping clauses "to pointers at
internal/store/doc.go, which already owns them" — but doc.go does NOT own them: zero
ErrNoRows/value-agnostic mentions; the only adjacent text ('404-able' ×2, doc.go:50,52)
sits inside the `# Public API` section (:17-99) that 7.1 deletes; the Invariants
section is :100-124. Where 2.1 lands the canonical is unspecified, and NO duty protects
it (7.1 greps only INV5; 2.1's duty is gofmt+build). If 2.1 lands the canonical in or
near the catalog, 7.1 deletes it after the replicas became pointers → dangling
pointers, mechanically undetected. *Recommended answer:* amend 2.1's task line to pin
the canonical INSIDE the Invariants section (outside 7.1's strip target), and add a
canonical-anchor grep to 7.1's duty.

**Q3 (MEDIUM — coverage gap + scope trap).** The viewer-scope block dedup (audit
pattern 2, "7 handlers", pinned by design §Interfaces to 4.2 art.go/viewer.go) spans 7
sites in 4 files: display.go:57 (4.2's ✓), handlers.go:639 (4.1's file — 4.1's contract
does not mention the pin), playback.go:97,114,173 and facets.go:9,48 — the latter two
files are named by NO task. 4.2 cannot dedup the 5 out-of-scope sites without HALTing
on scope; leaving them makes the pattern-2 item silently partial. *Recommended answer:*
extend 4.2's file list (or author 4.3) to include internal/api/playback.go and
internal/api/facets.go comment-only edits (and name the handlers.go site in 4.1's
contract), or explicitly descope the viewer-scope dedup to the 4.2-owned files and
record the rest as a follow-up.

**Q4 (MEDIUM — contract-internal scope contradiction).** 5.1's contract says the
matroska asymmetry note "states ONCE here — 2-line pointer form if classification.go's
copy is the better home, executor's call" — but classification.go (twin confirmed at
:179-180 vs describe.go:91-97) is in NO task's file list and 5.1's Out-list explicitly
excludes "internal/stream's other files". Following the prose HALTs on scope or drives
an out-of-scope edit. *Recommended answer:* either add internal/stream/classification.go
(comment-only) to 5.1's In-list with the canonical pinned at describe.go, or descope
the dedup to describe.go-only and record classification.go's copy as accepted
duplication (follow-up).

**Q5 (MEDIUM — dead duty rung).** 1.2's negative grep `! grep -q 'MAY NOT import any
internal'` cannot fail on the red reality: the stale claim wraps across doc.go:117-118
("It MAY NOT import" / "any internal/*, any proto"), so the pattern matches no single
line at base and passes vacuously. The three positive greps carry the real acceptance
(all fail at base). *Recommended answer:* re-anchor the negative to the single-line
stale fragment, e.g. `! grep -q 'internal/\*, any proto' internal/store/doc.go ||
exit 1` (present at :118, absent from the prescribed rewrite law) — or drop the
negative in favor of the positives.

**Q6 (LOW — design map incomplete).** design.md §Interfaces' file-overlap map omits
store/relayjobs.go, edited by both 2.1 (D7 pointer) and 5.2 (relayClaimWhere 30-line
doc) — the only unmapped cross-group pair. Group order already makes the sequence safe
(5.2's task line even says "the D7 pointer is 2.1's"). *Recommended answer:* amend
design.md §Interfaces to add "store/relayjobs.go: 2.1 → 5.2" for map completeness —
or waive as cosmetic (the tasks themselves encode the order).

**Q7 (LOW — deletion residue, unowned).** 8.1 deletes the two stubs, but
integration_async_test.go:15's provenance comment ("This is the structural successor to
integration_pipeline_test.go") will name a nonexistent file — precisely the
stale-pointer class this change removes — and no task owns that file. *Recommended
answer:* extend 8.1's task line to also reword that one comment (comment-only), or
waive and leave it to the @wf-docs pass (which must also update
docs/project_structure.md:687's enumeration of the deleted filenames).

**Q8 (LOW — keep-law under-instrumented).** 7.1's duty guards the INV keep-law for
only 2 of 15 stripped files (store INV5, enrich INV); 10 more stripped doc.go files
carry INV strings today (plugin, scan, stream, web, base-scanner, serial-scanner,
tv-parser, shikimori, tmdb, image-enricher) and could lose them with every duty still
green; likewise 1.2's seam names (internal/access, internal/relay) live in INV5's body
with no 7.1 grep of their own. *Recommended answer:* widen 7.1's verify: `grep -q INV`
on each stripped doc.go that carries an INV section at base, plus `grep -q
'internal/access'` and `grep -q 'internal/relay'` on store/doc.go, plus the Q2
canonical anchor.

**Q9 (HIGH — introduced by the round-1 Q3 amendment; Q3's playback leg UNRESOLVED).**
The amendment assigns internal/api/playback.go's viewer-scope sites to task 3.1
(tasks.md:31 "ALSO playback.go's three viewer-scope dedup sites (~:97, ~:114, ~:173)"),
but 3.1 is the cmd/mellifera task: its contract (tasks/3.1.md — NOT amended) scopes In
to three cmd files and Outs everything else; its duty gofmt-lists only those three; and
the bare name "playback.go" in a cmd-scoped line denotes cmd/mellifera/playback.go,
which has no viewer-scope narration at ~:97/:114/:173 (those lines are the
newPlayClosure/suppressionSet region — the actual sites are internal/api/playback.go:
:97, :114, :173, PLUS a FOURTH at :203 the amendment missed; verified by grep).
tasks/4.1.md:33-34 ("the other viewer-scope sites belong to 3.1 (playback.go)") and
design.md's amended map (playback.go → 3.1 line and the canonical-homes "one owning
task per site" list) propagate the same misassignment. A 3.1 executor HALTs on scope
or edits a file no duty covers. *Recommended answer:* give internal/api/playback.go
(all four sites) to 4.2 — the api residual task whose duty already builds
./internal/api; add the file to 4.2's gofmt list + prose; strike the viewer-scope
clause from 3.1's task line (tasks.md:31); fix the cross-references in tasks/4.1.md
and design.md (both spots).

**Q10 (MEDIUM — introduced by the round-1 Q4 amendment).** tasks/5.1.md's contract
Duty was amended to gofmt internal/stream/classification.go, but tasks.md:48's verify —
the duty the register derives and the gate re-runs — was NOT synced and still lists
only open.go/describe.go/pack.go: classification.go's edit has no formatting rung and
the contract's Duty line no longer equals the tasks.md verify line. Cosmetic rider:
the contract's acceptance still says "The three files land in the law's healthy band"
(four now). *Recommended answer:* add internal/stream/classification.go to
tasks.md:48's gofmt list and fix the acceptance count.

**Q11 (LOW-MEDIUM — introduced by the round-1 Q5 amendment).** 1.2's negative grep is
now file-wide `! grep -q 'MAY NOT' internal/store/doc.go` — verified unique at base
(single occurrence :117) with the rewrite mandated affirmative — but 2.1 later lands
NEW text into the same file (the ERROR-FLOOR LAW bullet), and nothing forbids that
bullet's prose from containing 'MAY NOT' (e.g. "a viewer-hidden row MAY NOT…"), which
would flip 1.2's GATE 2 re-run red. Design's affirmative-phrasing note ("MAY NOT
dies") covers only the 1.2 rewrite itself. *Recommended answer:* extend the law to
group 2 — one clause in 2.1's prose: the ERROR-FLOOR bullet states the floor
affirmatively; no 'MAY NOT' survives anywhere in store/doc.go after group 2.

## §4 Observations (no question required)

- **Law path:** the dispatch named the worktree law path; the law exists only in the
  main tree (verified: worktree .claude/skills carries mellifera-build/mellifera-ui
  only). The plan artifacts consistently name the main-tree path (tasks.md:3,
  design.md:10) — self-consistent; read-only inputs outside the worktree are the
  design (proposal.md:35-36).
- **Density band:** the law says "under ~10-15%"; audit and plan say 10-18%. The plan
  follows the audit's band consistently (design Goals + all three contracts). Accepted.
- **Audit count noise:** audit says D3 "5x" while listing six ranges; tasks.md says
  ~6x with the same six ranges — task is self-consistent; grounded (playback.go
  suppressionSet :336/:349; 32 'suppress' mentions).
- **wf index:** `symbols=0` in this install — file-level grounding used; symbol facts
  cite file:line greps (all listed in §2/§3).
- **Register safety:** 16 ids unique (1.1-1.4, 2.1-2.3, 3.1, 4.1-4.2, 5.1-5.2, 6.1,
  7.1-7.2, 8.1); banner lines legal (pipeline.py:516-517); no `- [x]`; fields at
  two-space indent.
- **6.1 glob breadth:** `gofmt -l internal/{enrich,scan}/*.go` covers doc.go files that
  7.1 later edits — gofmt -l over a clean file lists nothing, so the gate re-run stays
  green; no edit overlap. Cosmetic.

## §5 Resolutions and waivers

**Round-1 re-run (2026-11-11, once per the amendment-round rule) — planner applied the
8 recommended answers; each verified against the amended text, not the planner's
summary:**

- **Q1: RESOLVED** — 1.3's duty re-anchored to `! grep -q 'ItemTags serves'` (verified
  unique at base, :503; red-at-base holds); task prose mandates the compressed doc
  "MUST NOT carry the … ItemTags serves clause"; the awk attachment rung unchanged
  (still sound). Post-fix green direction holds.
- **Q2: RESOLVED** — 2.1's prose pins the canonical as a literal "ERROR-FLOOR LAW:"
  bullet in doc.go's `# Invariants` section ("the Public API catalog is NEVER the
  canonical's home"); 7.1's widened duty greps the anchor (absent at base — passes
  post-2.1 per group order; correct at GATE 2). Residual cross-task guard → Q11.
- **Q3: PARTIALLY RESOLVED** — handlers.go:639 leg holds (tasks/4.1.md In-list + pins);
  facets.go leg holds (4.2 prose + duty gofmt list, both amended); the playback.go leg
  is misassigned to cmd-scoped 3.1 and undercounted (3 vs 4 sites) → **UNRESOLVED as
  Q9**.
- **Q4: RESOLVED** — classification.go added to 5.1's contract In-list/Out/duty with
  the canonical pinned at describe.go's containerNative doc (~:263) and the twin as a
  one-line cross-reference. Residual: tasks.md:48 duty not synced with the contract →
  Q10.
- **Q5: RESOLVED** — 1.2 re-anchored to file-wide `! grep -q 'MAY NOT'` (verified
  single occurrence at base, :117 — a real red-at-base rung now); prose mandates
  affirmative bottom-of-the-stack-except phrasing so the prohibition form does not
  survive the rewrite. Residual cross-task guard → Q11.
- **Q6: RESOLVED** — design.md's file-overlap map gains "store/relayjobs.go: 2.1 (D7
  pointer) → 5.2 (relayClaimWhere doc)".
- **Q7: RESOLVED** — 8.1's prose rewords integration_async_test.go:15 ("reword to not
  name it"); its duty gains `! grep -q 'integration_pipeline_test'` on that file (red
  at base :15 ✓) and gofmt coverage of it.
- **Q8: RESOLVED** — 7.1's verify widened with 12 per-file INV greps (all 12 stripped
  INV-carrying files verified carrying INV at base; browse/identity/access correctly
  ungated), plus INV5, internal/access, internal/relay, and the ERROR-FLOOR LAW anchor;
  every positive's red-at-base state is correct at 7.1's group position.

**Frontier after round 1: Q9, Q10, Q11 open (introduced by the amendments) — GATE 1
must rule on them (and on Q3's residual playback leg) before approval; the frontier is
not empty.**

**Round-2 confirmation pass (2026-11-11, ONCE per the amendment-round rule) — planner
applied the Q9/Q10/Q11 recommendations; each verified against the amended text:**

- **Q9: RESOLVED** — tasks.md:31's 3.1 line struck back to pure cmd/mellifera scope
  (zero viewer-scope coupling remains anywhere: grep over tasks.md + design.md + all
  contracts finds none); internal/api/playback.go moved to 4.2's prose with the correct
  count ("FOUR sites ~:97, ~:114, ~:173, ~:203") AND its duty gofmt list (build rung
  already covered the package); tasks/4.1.md's cross-reference now reads "belong to 4.2
  (internal/api/playback.go's four sites …, facets.go)"; design.md's map splits
  playback BY PACKAGE ("main.go + cmd/mellifera/playback.go: 2.2 → 3.1" /
  "internal/api/playback.go: 4.2 only … FOUR sites"). **This completes Q3** — all
  three legs (handlers.go:639 → 4.1 contract; facets.go → 4.2; api/playback.go ×4 →
  4.2) are now owned with duty coverage. NEW-collision sweep: group-4 internal sets
  are disjoint (4.1 = router+handlers; 4.2's widened list adds facets+playback only);
  no other task's file set touches either file.
- **Q10: RESOLVED** — tasks.md:48's verify now byte-matches tasks/5.1.md's contract
  Duty (both gofmt internal/stream/classification.go — compared line-by-line), so the
  register-derived duty covers the classification.go edit's formatting and the
  contract no longer drifts from the derived plan; the contract's acceptance reads
  "The four files land in the law's healthy band".
- **Q11: RESOLVED** — 2.1's prose carries the whole-file affirmative-phrasing law:
  "after 2.1 no 'MAY NOT' survives anywhere in store/doc.go (1.2's file-wide negative
  grep must hold at GATE 2), so the ERROR-FLOOR LAW bullet is phrased affirmatively."
  Direction chain verified end-to-end: 1.2 red at base (:117, sole occurrence) → green
  post-1.2 (rewrite mandated affirmative) → stays green post-2.1 (whole-file law) →
  7.1 deletes only. store/doc.go is written by exactly 1.2/2.1/7.1 — no other new-text
  path exists.

**Frontier after round 2: EMPTY.** All round-0 questions (Q1–Q8, Q3 completed via Q9)
and all round-1 questions (Q9–Q11) are resolved in the amended text; no new questions
introduced by round 2 (the collision sweep — 4.2's widened list vs 4.1's set, and the
Q11 law vs 1.2's grep direction — came back clean). Waiver list: empty — nothing
waived. GATE 1 may present the proposal for approval.
