// SPDX-License-Identifier: Apache-2.0
import type { ProgressDTO } from "@/lib/api";

// The Continue rail's client-side half of the watched withdrawal (watched-states
// D2, task 2.2). The shared useProgressList query fetches
// GET /progress?include=watched (queries.ts — one fetch feeding the Continue
// rail, the Next up anchors, and ItemDetail's resume row), so the served rows
// arrive with the `watched` flag set on restored rows. The page splits
// client-side: the rail renders only rows with `watched` absent/false, while
// the anchor derivations (startedSeries → nextUpEntries) keep consuming ALL
// served rows unchanged — a fully-watched series still anchors its next
// unwatched episode into Next up. Pure leaf: types from @/lib/api only — no
// React, no queries, no DOM.

// isWatchedRow — the row is a completed watch per the SERVED flag only
// (true-only, omitempty on the wire): an absent or undefined field means
// not-watched, never a type hole. The SPA never derives watchedness
// client-side (no rec_score sniffing — tag-less unwatched items score zero
// too).
export function isWatchedRow(row: ProgressDTO): boolean {
  return row.watched === true;
}

// unwatchedRows — the rail's slice of a served progress list: rows in served
// order with watched rows removed (order preserved — the rail renders the
// served order, never a client re-sort).
export function unwatchedRows(rows: ProgressDTO[]): ProgressDTO[] {
  return rows.filter((row) => !isWatchedRow(row));
}
