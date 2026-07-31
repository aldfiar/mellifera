# Architecture Review — scan-library

> Self-review of the plan. P0 entries HALT auto-approve at Plan Review (the
> specifier must receive this structured self-audit per the planner handoff
> contract). This feature ships **NO P0 entries** — all risks are P1/P2 with
> concrete mitigations. The phasing fallback (decision log) is the safety valve
> for the highest-risk item (R1).

## Risk register (this slice)

| ID | Risk | Severity | Mitigation | Owner |
|---|---|---|---|---|
| R1 | **go-plugin gRPC handshake correctness.** Magic-cookie env, stdout-address parsing, gRPC dial, `Plugin.Handshake`, capability stub registration — any step mis-wired and the whole subprocess path fails silently. This is the trickiest piece of pure-Go in the slice. | **P1** | (a) `pkg/sdk.Serve` encapsulates the substrate (plugin author never touches handshake raw); (b) `plugin/manager_test.go` proves the seam in-process via a fake plugin before the real binary is involved; (c) the integration test (AC-1) proves it against the REAL base-scanner binary end-to-end; (d) **phasing fallback** (decision log) — if R1 blocks, ship protos+store+module+base-scanner exercised in-process via sdk, defer subprocess+API to next pass. NOT activated; surfaced as the safety valve. | coder + reviewer |
| R2 | **`check.sh` counts generated `.pb.go` symbols.** The gate will spuriously FAIL on proto packages (a single `scanner.pb.go` exports 20+ symbols), blocking AC-2 + AC-4. | **P1** | One-line intent-preserving fix to `mellifera/.claude/skills/mellifera-build/scripts/check.sh`: add `--exclude='*.pb.go'` to the grep. The rule's INTENT (per the module map + ai-arch §2) is the hand-written API surface; generated vendor code was never meant to count. This is a bugfix to the script, not a negotiation of the rule — surfaced prominently for user awareness at plan review. | coder (Step 12) |
| R3 | **Proto extraction fidelity.** Hand-transcription of arch §2 protos risks accidental contract drift (renamed fields, dropped comments, wrong field numbers) — every later plugin builds on these. | **P1** | (a) Verbatim copy character-for-character (Step 2); (b) AC-3 asserts fidelity by diffing against arch §2; (c) `buf lint` catches schema-level issues; (d) the planner has ALREADY transcribed the key field names into contracts.md §1 directly from the design doc read (this file's claims are grounded in the actual arch §2 content). | coder + reviewer |
| R4 | **Path-traversal guard completeness.** Must cover: symlink escaping, `..` segments, absolute-path injection, nested symlinks, TOCTOU (path changes between check and use). A gap = arbitrary file read. | **P1** | (a) `withinRoot` resolves the candidate + `filepath.EvalSymlinks` + verifies the resolved absolute path is under root, checked pre- AND post-symlink-resolve (closes TOCTOU); (b) AC-4 asserts the escape cases with a dedicated fixture; (c) table test enumerates the attack vectors; (d) the path-guard runs BEFORE `ffprobe` so no out-of-root file is ever probed. | coder + reviewer |
| R5 | **ffprobe subprocess error handling.** Missing binary on PATH, non-zero exit, stdout exceeding limits, hang requiring timeout, binary outputting non-JSON. | **P1** | (a) `exec.CommandContext` with a per-file ctx deadline (default 30s, Q11/D13); (b) missing-binary detection (`exec.LookPath`) → soft warning + empty `ffprobe_json` (Q6: scan continues); (c) non-zero exit / non-JSON stdout → soft warning + empty blob (item still identified); (d) AC-6 asserts the soft-failure path; (e) the subprocess test SKIPs cleanly (not fails CI) if ffprobe is absent. | coder + reviewer |
| R6 | **Dynamic-JSON column schema + query semantics.** SQLite `json_extract` + generated columns correctness; the `document` TEXT column must round-trip arbitrary JSON including Cyrillic + deeply-nested ffprobe output; upsert-by-`file_id` idempotency. | **P1** | (a) Schema verbatim from arch §9.1/§9.2; (b) store table tests over a temp DB assert round-trip (Cyrillic, nested ffprobe) + upsert idempotency (PutItem twice = one row); (c) `modernc.org/sqlite` supports generated columns identically to CGO sqlite. | coder + reviewer |
| R7 | **base-scanner as part of the main Go module** deviates from arch §10 ("plugins are separate Go modules"). | **P2** | Justified for MVP: base-scanner has no extra deps (only sdk + proto + stdlib + os/exec), single-`go.mod` simplicity outweighs separation, the arch's rationale (divergent dep trees) doesn't apply. Phase 2 splits plugins when TMDB/Kinopoisk land. Documented in decision log; no action this feature. | — (decision) |
| R8 | **`sdk.Scanner` interface has one REAL implementation** (base-scanner) — the skill forbids single-impl interfaces ("interfaces ONLY at the plugin seam with ≥2 implementations"). | **P2** | The interface IS justified by ≥2 implementations: (1) the real subprocess client wrapper built by `ScannerPlugin.GRPCClient` (core side), (2) the in-process test fake used by `internal/scan` + `internal/plugin` table tests (test side). The test fake is a real second implementation — the standard Go testing idiom the skill explicitly endorses ("tests are the spec"). This is the kickoff's "interface-vs-struct conversation" — resolved in favor of the interface at the plugin seam, which is exactly where the skill permits it. | — (decision) |
| R9 | **Streaming `Scan` backpressure / cancellation.** A slow store writer + a fast scanner stream could memory-blow the orchestrator; a cancelled scan must propagate to the subprocess. | **P2** | (a) The sdk's channel-based `Scan` is buffered with a small bound (coder picks; suggest 16); the orchestrator drains at store-write speed, providing natural backpressure via the channel; (b) ctx cancellation propagates through the orchestrator → gRPC client → subprocess (go-plugin + grpc respect ctx); (c) the scan table test asserts ctx cancellation aborts cleanly. | coder |
| R10 | **`internal/store` at 10 symbols + `internal/plugin` at 9** exceed the ≤8 target (WARN, not FAIL). | **P2** | Both under the 12 hard-fail ceiling. Store owns multiple entities (items + libraries) + is sole SQLite owner — splitting fragments schema ownership. Plugin owns lifecycle phases + typed accessor. WARN is the honest position; documented in decision log + conventions.md. The specifier/coder may propose a split (e.g. `internal/library` package) if they prefer strict ≤8. | specifier/coder |

**No P0 entries.** The slice does not trip the AC-count gate (6 < 8) or the
Step-count gate (12 < 15). `feature_too_large` is NOT set.

## Complexity-budget rationale (per workflow-protocol Step 9 §10)

Is there a meaningfully simpler design that meets every AC and extends an
existing pattern? Considered alternatives:

1. **Drop `internal/scan`, put orchestration in `api/`.** Rejected — violates
   the pure-delegation rule (ai-arch §3), which is a HARD RULE. The orchestrator
   MUST live in a domain package.
2. **Drop `internal/plugin`, exercise base-scanner in-process via sdk.** This is
   the phasing fallback (R1). It IS simpler, but it does NOT prove the
   subprocess-isolation differentiator (arch §0 principle 2) — the WHOLE POINT
   of the slice. Rejected as the default; kept as the safety valve.
3. **Single store method `Mutate`/`Transact`.** Rejected — god-method
   anti-pattern (mellifera-build skill).
4. **Generic `plugin.Call(method, req)`.** Rejected — requires `reflect` or
   `protobuf.Any`, both forbidden. The typed accessor (`Scanner(pluginID, capID)`)
   is the simplest type-safe design.
5. **Skip the metadata + plugin protos (generate only scanner+common).**
   Rejected — the enhanced objective explicitly requires all four packages
   generated for contract completeness (additive, deprecate-don't-delete; future
   plugins need them).

The chosen design is the simplest one that meets every AC, obeys every hard
rule, and extends the established patterns (module-template doc.go, table tests,
pure-delegation handlers, struct-crosses-package boundaries). Resolution order
per software-design §Complexity Budget: existing convention (module-template) →
archetype (orchestrator package) → framework canonical (go-plugin gRPC) →
stack-to-pattern (channel-based stream) → general (parameterized SQL).

## Grounding audit (every load-bearing claim carries an evidence anchor)

| Claim | Evidence |
|---|---|
| Scanner service has `Scan` (streaming) + `Identify` | `mellifera/docs/architecture.md` §2.1.2 (lines 181-266) |
| `DiscoveredFile.ffprobe_json` is `bytes`, not Struct | arch §2.1.2 lines 226-230 + Q1 risk note (open-questions.md line 38) |
| Store schema (libraries/modules/items/playback_progress/drafts/scan_jobs/enrichment_failures) | arch §9.1 (lines 1382-1480) |
| Generated columns (display_title/display_rating/tmdb_id/kinopoisk_id) | arch §9.2 (lines 1486-1500) |
| Plugin handshake (magic cookie, stdout, gRPC dial, Handshake RPC) | arch §2.2.1 + §2.2.2 + §2.2.3 (lines 527-658) |
| Minimal restart (1s/2x/60s cap, 3 fails → failed) | arch §7.3 (lines 659-1267) |
| Principal grounding (admin token → Principal{Admin:true}, Phase 2 additive) | arch §11.5 (lines 1599-1612) + Q15/D18 (open-questions.md line 220) |
| Module is a config entity, media_type is a string | arch §0 principle 1 + §2.4.2 (lines 742-750) |
| Dynamic JSON documents, not typed DTOs | arch §0 principle 3 + §3.1 + D2 |
| WAL + single-writer transactions | arch §9.3 (lines 1504-1506) |
| ≤8 symbols/pkg, doc.go per pkg, pure-delegation api | `mellifera/.claude/skills/mellifera-build/SKILL.md` + ai-arch §2-§5 |
| No reflect, no DI | `mellifera/.golangci.yml` depguard (lines 32-39) |
| Apache-2.0 + DCO | D12/Q18 (open-questions.md line 250) + arch §11.7 |
| go-plugin gRPC subprocess (D1) | Q1 (open-questions.md line 18) + arch §1.2 |
| Thin SDK Serve + ScannerPlugin base type (D15/Q2) | Q2 (open-questions.md line 42) + arch §10 pkg/sdk |
| ffprobe in scanner plugin, not core; soft-fail on miss (Q6) | Q6 (open-questions.md line 113) + arch §1.2 |
| Single-instance boundary | Q24 (open-questions.md line 342) — out of scope this feature (no queue/leases/janitor yet) |
| TV module config example | arch §2.4.1 (lines 676-740) |
| Error model (split: gRPC codes transport + domain Error) | arch §11.6 + Q19/D17 |

Every design decision in the plan traces to one of: a design doc section
(arch/ai-arch/open-questions), the kickoff brief, the enhanced objective, the
mellifera-build skill, or `.golangci.yml`. No claim is invented.

## Generation Self-Audit (per architecture-review template — ticked)

- [x] Every MODIFY file in the File Map appears in ≥1 seam. (Greenfield — every
  CREATE file appears in the integration_map.md File→seam coverage table. No
  orphans.)
- [x] Every seam has non-empty `After` + `Contract` + `evidence:`. (All 12 seams
  in integration_map.md populated; S-noop documents the foundational artifacts
  with no runtime seam.)
- [x] Every seam has one owner task + one joint test. (Coverage Matrix left as
  template — specifier fills owner task + joint test per seam when decomposing;
  every seam has a named joint test in the Seams table.)
- [x] Every task will have precondition + postcondition + allowed_imports + an
  AC trace. (Planner provides AC traces in Step Outline; the specifier adds the
  task-level fields per coder-task-format.)
- [x] **No `UNVERIFIED:` token remains** in the final plan. (All grounding
  claims carry an evidence anchor in the table above; greenfield claims are
  stated as design intent, not as existing facts — per the grounding skill's
  greenfield guidance.)
- [x] Complexity budget examined (§Complexity-budget rationale above); the
  design is the simplest one meeting every AC + extending an existing pattern.
- [x] AC count (6) under the 8-gate; Step count (12) under the 15-gate;
  `feature_too_large` NOT set; no P0 entries.
- [x] The phasing fallback (R1 safety valve) is documented but NOT activated.
- [x] The `check.sh` `.pb.go` issue (R2) is surfaced with a concrete one-line
  intent-preserving fix, for user awareness at plan review.

## Notes for the specifier (handoff)

1. The Step Outline (12 steps) is your decomposition input. Expect 12-16 tasks
   (some steps may split into build + test tasks). Resist splitting further —
   the locality guarantee depends on tasks mapping to whole packages where
   possible.
2. The two WARN packages (store, plugin) are pre-justified; do not block tasks
   on the symbol count alone. If the coder proposes a clean split (e.g.
   `internal/library`), allow it — but only if it doesn't fragment schema
   ownership.
3. R2 (`check.sh` `.pb.go` fix) is a one-line change the coder applies at
   Step 12. Do NOT bury it; surface it as a visible task so the user sees the
   `mellifera-build` skill script being touched.
4. The integration test (Step 11) is the golden test (AC-1). The reviewer
   re-derives expected outcomes from its Given/When/Then — do not let the coder
   assert just "some item was persisted"; assert the exact parsed
   title/season/episode for the fixture filenames.
5. Cyrillic-title fixture (conventions.md) must be in the integration test's
   fixture set — proves Russian-first-class (arch §1.2) is real, not aspirational.
6. The `internal/scan` package + the module-map naming deviations (`Call`→
   `Scanner`, `Health`→`Status`) are documented decisions; the wf-docs phase
   syncs the module map + ai-arch §4.
