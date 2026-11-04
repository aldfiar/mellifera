// SPDX-License-Identifier: Apache-2.0
import type { CSSProperties, ReactElement } from "react";

import type { ItemState } from "@/lib/api";
import { useSetItemState } from "@/lib/queries";

// The library's pastel accent — the .watched-mark token (index.css), kept as
// a literal here because the toggle's watched fill rides the inline style
// (the chip's whole state split is inline — see WatchedToggle below).
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

// WatchedToggle — the watched slot as a REAL <button> (collections-ux 2.2,
// reworked by watched-toggle-label 1.1): hence a D-pad addressable walker
// target (focusWalker's a[href]/button set) in tv mode. The slot flips to
// the TOP-RIGHT corner — inline right:40px, NO left override — sitting one
// stylesheet gutter (6px) left of the ⋯ cardact trigger (its own top:6px /
// right:6px 28px slot is untouched; 40px clears the ⋯'s 34px left edge).
// The ✓ glyph becomes a quiet `watched` TEXT CHIP (inline padding 2px 8px on
// the class carrier's rounded 28px-ish box idiom):
// - watched: the pastel accent text (WATCHED_ACCENT);
// - unwatched: muted ghost text + a 1px ring in the --border token.
// The disclosure law (opacity 0 at rest, hover/focus reveal) is RETIRED for
// this control: BOTH states pin inline `opacity: 1` — always visible. The
// coarse-pointer 40px hit block and the html.tv twin are beaten the same
// way: inline width/height auto + the chip padding override their fixed
// sizes (the established inline-override idiom, no new CSS class); the ⋯
// trigger's own law in index.css is untouched (pinned by the stylesheet
// sweep). Placement: "corner" (default) is the card slot; "inline" reuses
// the existing `cardact-trigger--inline` variant (the element page heading's
// flow context, its own always-visible carve-out) and carries no corner
// offsets — corner-scoped overrides stay corner-scoped.
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
    // Always visible — the disclosure law is retired for this control.
    opacity: 1,
    // Beat the class carrier's fixed 28px box AND the coarse-pointer/html.tv
    // 40px twins: the chip sizes itself from the padding.
    width: "auto",
    height: "auto",
    padding: "2px 8px",
    ...(corner ? { right: "40px" } : {}),
    ...(props.watched
      ? { color: WATCHED_ACCENT }
      : {
          color: "hsl(var(--muted-foreground))",
          border: "1px solid hsl(var(--border))",
        }),
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
      <span aria-hidden="true">watched</span>
    </button>
  );
}
