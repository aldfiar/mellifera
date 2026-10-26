// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import {
  PHOTO_STAGE_CHROME_PX,
  SERIES_GRID_CHROME_PX,
  photoStageMaxH,
  posterCardMaxWidth,
} from "@/lib/density";

// density-contract 1.1 — table-driven vectors over the pure density core.
// Every emitted string is asserted BYTE-FOR-BYTE (toBe), so the rows/divisor
// law (rows 2 divides by 3, rows 3 by 4.5), the card-body arithmetic, the
// min-card floor, and the verbatim "100vh" viewport term (no baked-in
// viewport number can hide inside an exact string) all fail loudly on any
// formatting or arithmetic drift. The measured chrome constants are asserted
// through their 2026-10-24 derivation parts, so the value and the comment
// cannot drift apart unnoticed. These vectors are the reviewer's re-run
// surface at GATE 2.

// The height bound: chrome + rows*cardBodyH folds into ONE px term, the
// divisor is rows*3/2 (2:3 posters — three half-heights per card width).
describe("posterCardMaxWidth", () => {
  it.each([
    {
      chromeH: SERIES_GRID_CHROME_PX,
      rows: 2,
      cardBodyH: 60,
      want: "min(100%, max(120px, calc((100vh - 422px) / 3)))",
    },
    {
      chromeH: SERIES_GRID_CHROME_PX,
      rows: 3,
      cardBodyH: 60,
      want: "min(100%, max(120px, calc((100vh - 482px) / 4.5)))",
    },
    {
      chromeH: 302,
      rows: 2,
      cardBodyH: 40,
      want: "min(100%, max(120px, calc((100vh - 382px) / 3)))",
    },
    {
      chromeH: 0,
      rows: 4,
      cardBodyH: 50,
      want: "min(100%, max(120px, calc((100vh - 200px) / 6)))",
    },
    {
      chromeH: SERIES_GRID_CHROME_PX,
      rows: 2,
      cardBodyH: 60,
      minCardW: 150,
      want: "min(100%, max(150px, calc((100vh - 422px) / 3)))",
    },
  ])(
    "poster_card_max_width_emits_the_height_bound",
    ({ chromeH, rows, cardBodyH, minCardW, want }) => {
      expect(
        posterCardMaxWidth({ chromeH, rows, cardBodyH, minCardW }),
      ).toBe(want);
    },
  );

  // The floor only ever moves when minCardW says so — never from the chrome
  // arithmetic — and defaults to 120 when omitted.
  it.each([
    {
      chromeH: SERIES_GRID_CHROME_PX,
      rows: 2,
      cardBodyH: 60,
      want: "min(100%, max(120px, calc((100vh - 422px) / 3)))",
    },
    {
      chromeH: SERIES_GRID_CHROME_PX,
      rows: 3,
      cardBodyH: 60,
      minCardW: 96,
      want: "min(100%, max(96px, calc((100vh - 482px) / 4.5)))",
    },
    {
      chromeH: 0,
      rows: 2,
      cardBodyH: 60,
      minCardW: 200,
      want: "min(100%, max(200px, calc((100vh - 120px) / 3)))",
    },
  ])("poster_card_min_floor_never_collapses", (o) => {
    expect(
      posterCardMaxWidth({
        chromeH: o.chromeH,
        rows: o.rows,
        cardBodyH: o.cardBodyH,
        minCardW: o.minCardW,
      }),
    ).toBe(o.want);
  });
});

// The photo stage: the chrome subtraction is the only variable leg; the
// 320px floor is non-configurable and appears in every emitted string.
describe("photoStageMaxH", () => {
  it.each([
    { chromeH: PHOTO_STAGE_CHROME_PX, want: "max(calc(100vh - 136px), 320px)" },
    { chromeH: 200, want: "max(calc(100vh - 200px), 320px)" },
    { chromeH: 0, want: "max(calc(100vh - 0px), 320px)" },
  ])("photo_stage_max_height_floored_at_320px", ({ chromeH, want }) => {
    expect(photoStageMaxH(chromeH)).toBe(want);
  });
});

// The measured constants: asserted via their derivation parts (the numbers
// the 2026-10-24 measurement notes quote), so re-tuning the value at apply
// must update the derivation together with it.
describe("measured chrome constants", () => {
  it.each([
    {
      symbol: SERIES_GRID_CHROME_PX,
      parts: 182 + 2 * 60,
      want: 302,
      name: "SERIES_GRID_CHROME_PX — 182px collection header + 2x60px card bodies",
    },
    {
      symbol: PHOTO_STAGE_CHROME_PX,
      parts: 136,
      want: 136,
      name: "PHOTO_STAGE_CHROME_PX — 136px above the photo stage",
    },
  ])("measured_constant: $name", ({ symbol, parts, want }) => {
    expect(symbol).toBe(want);
    expect(symbol).toBe(parts); // value and derivation comment move together
    expect(Number.isInteger(symbol)).toBe(true); // integer px only
  });
});
