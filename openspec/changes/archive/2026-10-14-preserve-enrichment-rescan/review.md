# Review: preserve-enrichment-rescan

## GATE 2 — 2026-10-14

- **Reviewer verdict: PASS.** All 7 box probes re-run green verbatim (2.1–2.3, 3.1–3.2 scan probes; 4.1/4.2 joint itest, ffmpeg present) plus the 7 non-box delta probes (copied serial-library scenarios, async-enrichment probes). Box 1.1 `[unprobeable]` confirmed by inspection with the pins verified FACTUALLY: `git ls-tree` shows the old pins (7bcc6c9 / e2a7562 / 58a1130) carry EMPTY proto/ trees while f2dc2e8 carries exactly the 13 proto files the re-pin comments cite; both box verification commands green.
- **Diff vs deltas: matches.** Two-tier unchanged test (parsedSignature/parsedChanged/derivedCarry; nextScanState + nextSeriesState; persist/persistSeries merges), series carry with the deleted→ready self-heal kept, joint QA over the full production path with recorded-request attribution. Scope respected: internal/enrich, internal/store, proto/ untouched.
- **Amendment (user arbitration 2026-10-14):** scenario "Enriched library survives a rescan end-to-end" amended — `_stages` compared modulo truthful `skipped` entries the enrich queue appends for contractually namespace-less plugin×row shapes (frame-grabber on series, shikimori on episodes). Reviewed as approved contract; the enrich-side phantom-skip churn is filed as a follow-up in docs/backlog.md. Joint test asserts the appended entries entry-exact (prefix byte-equal + pinned shape), not loosely exempted.
- **Standards: clean.** gofmt/vet on touched packages green; no vacuous assertions; probe grep-guards on every new test name. Known pre-existing gofmt-dirty `internal/itest/qa_display_naming_joint_test.go` predates this change (out of scope).
- **`wf change check`: exit 0** — 8/8 done probes re-run green, coverage gaps=0, fingerprint intact.
- **Residue:** untracked `internal/itest/data/` (8 KB thumb residue of an env-var-less server run during apply) deleted before commit.

**Human archive approval: APPROVED** — aldfiar, 2026-10-14 ("Approve archive").
