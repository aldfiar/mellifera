// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import type { ProgressDTO } from "@/lib/api";
import { isWatchedRow, unwatchedRows } from "@/lib/watchedRows";

// watched-states 2.2 — vectors over the Continue rail's client-side withdrawal
// split (D2): the rail renders only rows with `watched` absent/false in served
// order, while the anchor derivations (startedSeries → nextUpEntries) keep
// consuming ALL served rows unchanged. The fixtures pin the wire contract:
// `watched` is true-only omitempty — an absent/undefined field means
// not-watched, never a type hole; the served flag is the ONLY input (no
// rec_score sniffing).

// row — a progress record fixture: the identity + position seam Home consumes,
// with `watched` passing through verbatim (so undefined rows stay field-less,
// exactly as omitempty serves them).
function row(
  id: string,
  watched?: boolean,
  recScore?: number,
): ProgressDTO {
  const r: ProgressDTO = {
    item_id: id,
    position_seconds: 120,
    updated_at: "2026-11-03T00:00:00Z",
  };
  if (recScore !== undefined) {
    r.rec_score = recScore;
  }
  if (watched !== undefined) {
    r.watched = watched;
  }
  return r;
}

describe("isWatchedRow", () => {
  it("is true only when the served flag is true", () => {
    expect(isWatchedRow(row("a", true))).toBe(true);
  });

  it("treats absent, undefined, and false fields as not-watched", () => {
    expect(isWatchedRow(row("b", false))).toBe(false);
    expect(isWatchedRow(row("c", undefined))).toBe(false);
    // a row built without touching the field at all (the omitempty shape)
    expect(isWatchedRow({ ...row("d") })).toBe(false);
  });

  it("reads only the served flag — a zero rec_score is not a watched signal", () => {
    expect(isWatchedRow(row("e", undefined, 0))).toBe(false);
    expect(isWatchedRow(row("f", true, 0))).toBe(true);
  });
});

describe("unwatchedRows", () => {
  it("keeps unwatched rows in served order and drops watched rows", () => {
    const served = [
      row("ep1", true),
      row("ep2"),
      row("ep3", false),
      row("ep4", true),
      row("ep5"),
    ];
    expect(unwatchedRows(served).map((r) => r.item_id)).toEqual([
      "ep2",
      "ep3",
      "ep5",
    ]);
  });

  it("is a pass-through on a fully-unwatched list", () => {
    const served = [row("a"), row("b", false)];
    expect(unwatchedRows(served)).toEqual(served);
  });

  it("empties the rail when every served row is watched (rail contract)", () => {
    const served = [row("a", true), row("b", true)];
    expect(unwatchedRows(served)).toEqual([]);
  });

  it("answers [] and undefined-safe inputs with []", () => {
    expect(unwatchedRows([])).toEqual([]);
  });

  it("does not mutate the served list — anchors still see all rows", () => {
    const served = [row("a", true), row("b")];
    const rail = unwatchedRows(served);
    expect(rail.map((r) => r.item_id)).toEqual(["b"]);
    // the anchor path consumes the ORIGINAL served list unchanged
    expect(served.map((r) => r.item_id)).toEqual(["a", "b"]);
    expect(served[0]!.watched).toBe(true);
  });
});
