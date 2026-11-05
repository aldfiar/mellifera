// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import type { ItemState } from "@/lib/api";
import { useSetItemState } from "@/lib/queries";

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

// WatchedToggle — the watched slot as a REAL <button> (collections-ux 2.2,
// reworked by watched-toggle-label 1.1, then to the glyph law by
// watched-signal-refinement 1.1): hence a D-pad addressable walker target
// (focusWalker's a[href]/button set) in tv mode. ONE glyph, never a word:
// the body is a single aria-hidden ✓ at the meta-line scale (≈12px, the
// `.watched-mark` em idiom — sized in CSS, task 3.1), accent when watched,
// muted ghost when not. NO pill, badge, or ring chrome in either state (D5)
// — the whole state split is CLASS-driven (`wtoggle--watched` /
// `wtoggle--unwatched`; the media-query twins need classes to target), and
// the button renders ONE carrier form on every mount — `cardact-trigger
// cardact-trigger--inline` — with no placement prop and no inline styles
// (D7: dead API once the meta row owns the slot). The visibility law is
// context-scoped in CSS, not by props: the card's `.card-meta-row` scopes
// the fine-pointer hide-at-rest to the unwatched state (D9), coarse
// pointers and html.tv keep both states visible, and the element page
// heading is exempt (D1) — it never sits in a `.card-meta-row`, and a bare
// `.cardact-trigger` there could never be revealed, so `--inline` always
// shows.
// Click: stopPropagation FIRST (the card click navigates — the toggle's
// never does), then the target state is picked from the SERVED watched flag
// only (watched → "unwatched", else → "watched") and fired through
// useSetItemState, whose onSuccess invalidates the watched-flag readers
// (items / series / series-episodes / item / progress).
export function WatchedToggle(props: {
  itemId: string;
  watched: boolean;
}): ReactElement {
  const setItemState = useSetItemState();
  const target: ItemState = props.watched ? "unwatched" : "watched";
  return (
    <button
      type="button"
      className={`cardact-trigger cardact-trigger--inline wtoggle--${
        props.watched ? "watched" : "unwatched"
      }`}
      aria-pressed={props.watched}
      aria-label={props.watched ? "Watched" : "Unwatched"}
      onClick={(e) => {
        e.stopPropagation();
        setItemState.mutate({ itemId: props.itemId, state: target });
      }}
    >
      <span aria-hidden="true">✓</span>
    </button>
  );
}
