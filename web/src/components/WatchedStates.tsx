// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

// The watched element state's shared leaves (watched-states D5, task 2.3).
// The tri-state law per browsable element: `watched` renders the small ✓
// mark in the library's pastel accent plus a dimmed title (~0.55 opacity)
// and NO progress bar; `in progress` renders the progress bar as today; a
// new element renders today's clean state. The check is a color-change mark
// — no pill or badge chrome, no new status vocabulary on user screens.

// isWatchedElement — the element is watched per the SERVED flag ONLY
// (true-only, omitempty on the wire): absent, undefined, or false means
// not-watched — never a type hole. The SPA never derives watchedness
// client-side (a zero rec_score is not a watched signal). This is the
// item/series DTO form; the progress-row sibling is lib/watchedRows'
// isWatchedRow (task 2.2's rail leaf — not shared on purpose: the two read
// different DTOs and this file must not grow a rail dependency).
export function isWatchedElement(watched?: boolean): boolean {
  return watched === true;
}

// watchedPercent — the in-progress bar's fill percentage (today's
// Continue-card idiom): position over duration, rounded, clamped to 100. A
// missing or non-positive duration → null: the caller renders no bar — never
// a guessed percent.
export function watchedPercent(
  positionSeconds: number,
  durationSeconds: number | null,
): number | null {
  if (durationSeconds === null || !(durationSeconds > 0)) {
    return null;
  }
  return Math.min(100, Math.round((positionSeconds / durationSeconds) * 100));
}

// WatchedMark — the small ✓ glyph in the library's pastel accent (styled by
// index.css `.watched-mark`, outside the tv shell block so the state survives
// the html.tv CSS layer unchanged). `className` carries the per-site
// placement — cards and rows anchor it at a corner (the ⋯ trigger owns the
// top-right, so the mark takes the top-left); the element page heading
// renders it inline beside the served display name.
export function WatchedMark(props: { className?: string }): ReactElement {
  return (
    <span className={`watched-mark${props.className ? ` ${props.className}` : ""}`} role="img" aria-label="Watched">
      ✓
    </span>
  );
}

// InProgressBar — the in-progress element's bar, today's Continue-card
// markup verbatim (the h-1.5 muted track with the primary fill, announced as
// "<n>% watched"). Watched elements never render it — D5's "NO progress
// bar".
export function InProgressBar(props: { percent: number }): ReactElement {
  return (
    <span
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${String(props.percent)}% watched`}
    >
      <span
        className="block h-full bg-primary"
        style={{ width: `${String(props.percent)}%` }}
      />
    </span>
  );
}
