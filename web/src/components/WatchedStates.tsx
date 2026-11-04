// SPDX-License-Identifier: Apache-2.0
import type { CSSProperties, ReactElement } from "react";

import type { ItemState } from "@/lib/api";
import { useSetItemState } from "@/lib/queries";

// The library's pastel accent — the .watched-mark token (index.css), kept as
// a literal here because the toggle's at-rest fill must ride the inline
// style (see WatchedToggle below for why inline beats the disclosure law).
const WATCHED_ACCENT = "#a4c8f4";

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

// WatchedToggle — the ✓ slot as a REAL <button> (collections-ux 2.2, the
// amended three-surface mandate): hence a D-pad addressable walker target
// (focusWalker's a[href]/button set) in tv mode. The state split:
// - watched: the FILLED accent ✓, clickable at rest everywhere — the inline
//   `opacity: 1` is load-bearing, not styling: the button reuses the
//   cardact-trigger disclosure law (class `cardact-trigger`, base
//   opacity 0 + reveal on host hover/focus-within), and an inline style is
//   the only way to win that cascade without authoring new CSS.
// - unwatched: the QUIET OUTLINE ✓ (a 1px ring in the --border token, the
//   base class's muted-foreground glyph) with NO inline opacity — the
//   reveal rides the existing law verbatim: hover/focus-revealed on fine
//   pointers, persistently visible under `pointer: coarse` AND the html.tv
//   layer (index.css, the ⋯ trigger's rules — composed, never duplicated).
// Placement composes the same law: "corner" (default) is the mark's
// top-left slot (the ⋯ trigger keeps the top-right — inline right:auto /
// left:6px beats the base class's right:6px); "inline" reuses the existing
// `cardact-trigger--inline` variant (the element page heading's flow
// context, the law's own always-visible carve-out).
// Click: stopPropagation FIRST (the card click navigates — the toggle's
// never does), then the target state is picked from the SERVED watched flag
// only (watched → "unwatched", else → "watched") and fired through
// useSetItemState, whose onSuccess invalidates the watched-flag readers
// (items / series / series-episodes / item / progress).
export function WatchedToggle(props: {
  itemId: string;
  watched: boolean;
  placement?: "corner" | "inline";
}): ReactElement {
  const setItemState = useSetItemState();
  const corner = (props.placement ?? "corner") === "corner";
  const target: ItemState = props.watched ? "unwatched" : "watched";
  const style: CSSProperties = {
    ...(corner ? { right: "auto", left: "6px" } : {}),
    ...(props.watched
      ? { color: WATCHED_ACCENT, opacity: 1 }
      : { border: "1px solid hsl(var(--border))" }),
  };
  return (
    <button
      type="button"
      className={`cardact-trigger${corner ? "" : " cardact-trigger--inline"}`}
      style={style}
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
