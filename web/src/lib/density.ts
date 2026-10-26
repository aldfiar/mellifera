// SPDX-License-Identifier: Apache-2.0

// Density (density-contract 1.1) — the pure height-aware sizing core shared
// by the series poster grid (task 2.1 consumes posterCardMaxWidth) and the
// photo lane (task 3.1 consumes photoStageMaxH + PHOTO_STAGE_CHROME_PX). No
// React, no DOM, no api types, no side effects: every function takes its
// measurements as arguments and returns a CSS string whose viewport term
// stays VERBATIM ("100vh") — the browser owns the viewport, so no viewport
// number is ever read or baked in here. All px arithmetic runs over INTEGER
// inputs (measured chrome + configured card bodies), so only `${n}px`
// integers ever escape into the emitted strings. web/src/lib/density.test.ts
// pins the exact emitted strings — any formatting drift fails there.

// SERIES_GRID_CHROME_PX — the fixed vertical chrome around a full series-grid
// row: 182px collection header + 2x60px card bodies = 302px. MEASURED
// 2026-10-24 — a parameter, not a decision: re-check visually at apply and
// tune the value; the posterCardMaxWidth arithmetic never changes with it.
export const SERIES_GRID_CHROME_PX = 302;

// PHOTO_STAGE_CHROME_PX — the fixed vertical chrome above the photo stage:
// 136px. MEASURED 2026-10-24 in the same pass as SERIES_GRID_CHROME_PX —
// same re-check-visually-at-apply rule.
export const PHOTO_STAGE_CHROME_PX = 136;

// posterCardMaxWidth — the CSS max-width bounding ONE 2:3 poster card so
// opts.rows full rows plus the chrome fit 100vh. A poster is 2:3, so rows of
// full rows consume rows * 3/2 of the viewport height per card width: the
// per-card width is the height budget left after the chrome
// (100vh - chromeH - rows*cardBodyH) divided by rows*3/2, floored at
// minCardW (default 120px) so a degenerate viewport collapses cards to a
// usable minimum instead of vanishing them, and capped at 100% so a card
// never overflows its grid track. Emits, with the card-body arithmetic
// folded into the single px term:
//   min(100%, max(<minCardW>px, calc((100vh - <chromeH + rows*cardBodyH>px) / <rows*3/2>)))
export function posterCardMaxWidth(opts: {
  chromeH: number;
  rows: number;
  cardBodyH: number;
  minCardW?: number;
}): string {
  const chromeTotal = opts.chromeH + opts.rows * opts.cardBodyH;
  const divisor = (opts.rows * 3) / 2;
  const minCardW = opts.minCardW ?? 120;
  return `min(100%, max(${minCardW}px, calc((100vh - ${chromeTotal}px) / ${divisor})))`;
}

// photoStageMaxH — the CSS max-height for the photo stage: the viewport
// height minus the chrome above it, floored at a NON-configurable 320px (the
// one degenerate-case answer — a degenerate viewport still shows a usable
// stage; callers cannot negotiate the floor). Emits:
//   max(calc(100vh - <chromeH>px), 320px)
export function photoStageMaxH(chromeH: number): string {
  return `max(calc(100vh - ${chromeH}px), 320px)`;
}
