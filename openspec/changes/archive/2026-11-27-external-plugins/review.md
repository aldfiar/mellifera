# Gate record — external-plugins

## GATE 2 verdict (2026-11-27, @wf-reviewer)

PASS on all five axes: verify re-runs 21/21 green (reviewer's own shell, receipts re-anchored) · diff vs spec deltas fully traced (plugin-pipeline, async-enrichment, client-relayed-fetch; internal/api untouched) · standards PASS (enrich 12/12, module 7, plugin 4; zero upstream-site tokens in core Go) with 4 P2 comment findings F1–F4 — FIXED before close (task-id leakage reworded, compile-checked) · integration re-ground PASS (zero orphans, all four surveyor waivers honored: W1 rename-on-fetch, W2 relay QA leg, W3 absent-binary scenario, W4 P3 residuals) · status green cmd-match 21/21 authored (git-check = close step, excluded from the gate).

Historical note: 4.1 carries one law-preserved red receipt — the defect run that surfaced the production aggregate-500 (G1 regression), fixed by amendment task 4.2 and re-run green. Amendment tasks 4.2/4.3 were added mid-apply through an approved GATE 1 amendment (surveyor findings: aggregate boot defect + stale golden; substitution raw-mode design defect).

Named MVP residuals (match the built state): v1 is search-only (scrape-job fallback = v1.1 with the options-forwarding seam); externalstubbin carries port-only base_url (the {base_url!raw} raw mode serves the real plugin); the LAN external enrichment source catalog is currently 100% unscraped (enrichment converges after external enrichment source-side scans + explicit re-enrich; the 30-day no_data cooldown never self-retries); the external repo mellifera-ext-plugins is uncommitted local state — gh repo create + first push + release publication are the operator's approved outward acts.

## Human archive approval (2026-11-27)

Approved by the operator via the session gate (AskUserQuestion, "Approve archive + close"): full close authorized — commit + push the branch, openspec archive (delta merge), docs actualization, close-out notes, machine-home clean, merge-back (push + PR).
