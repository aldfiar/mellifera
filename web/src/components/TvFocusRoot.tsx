// SPDX-License-Identifier: Apache-2.0
import { useEffect } from "react";
import type { ReactElement } from "react";

import { columnsFromTops, nextIndex, walkTargets } from "@/lib/focusWalker";
import { isTextEntryTarget } from "@/lib/playerShortcuts";

// TvFocusRoot (tv-mode 3.2, design D5) — the thin harness around the pure
// focusWalker core: ONE window keydown listener, armed only while the root
// element carries the `tv` class (design I1/I6 — activation is checked PER
// EVENT, not per mount, so a live mode switch needs no listener churn).
// The component renders null; it is mounted AFTER <Routes> in App.tsx so it
// participates in no layout and owns no surface — it only moves focus.
//
// Arrows only (design I3): the walker never handles media keys or Enter —
// nextIndex returns null for anything but the four arrows and the harness
// then leaves the event untouched (no preventDefault, no stopPropagation),
// so the playerShortcuts table and native activation keep their events.
//
// The yield protocol is STRUCTURAL and order-independent (design I4) — a
// press is ignored when (a) the event target or the focused element sits
// inside any [data-tv-yield] subtree (ItemDetail's stage/watch container
// carries the marker), (b) the target passes playerShortcuts'
// isTextEntryTarget (reused, never reimplemented), or (c) an
// .overlay-backdrop is mounted (overlays own their keys; DialogShell's
// focus trap keeps focus). Listener registration order can never matter.
//
// Every DOM-dependent input of the pure core is supplied here, not there:
// the visible a[href]/button set via walkTargets over the whole document
// (grids are row-major in DOM order), the column count from the first row's
// offsetTops via columnsFromTops, and the focused element's index in that
// set. An unanchored press — nothing in the grid holds focus yet, the page
// just loaded — moves focus to the FIRST visible target: the D-pad's way in.

// isElementVisible — the real visibility predicate walkTargets takes as its
// injected argument: a laid-out box that is not hidden. jsdom evaluates no
// layout, so the tests stub offsetWidth/offsetHeight over the same seam the
// browser reads here (the focusWalker injection posture).
function isElementVisible(el: HTMLElement): boolean {
  if (el.offsetWidth <= 0 || el.offsetHeight <= 0) {
    return false;
  }
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

// insideYieldSubtree — guard (a): any [data-tv-yield] ancestor, checked on
// both the event target and the focused element so the protocol holds no
// matter which of the two carries the press (closest is order-independent).
function insideYieldSubtree(el: Element | null): boolean {
  return el != null && el.closest("[data-tv-yield]") != null;
}

function handleTvKeyDown(event: KeyboardEvent): void {
  if (!document.documentElement.classList.contains("tv")) {
    return; // inert outside tv mode (I1): desktop keeps its native keys
  }
  if (document.querySelector(".overlay-backdrop") != null) {
    return; // guard (c): a mounted overlay owns its keys
  }
  const target = event.target;
  if (isTextEntryTarget(target)) {
    return; // guard (b): the operator is typing
  }
  const focused = document.activeElement;
  if (
    insideYieldSubtree(target instanceof Element ? target : null) ||
    insideYieldSubtree(focused)
  ) {
    return; // guard (a): a yield subtree owns this press
  }

  const targets = walkTargets(document, isElementVisible);
  if (targets.length === 0) {
    return; // nothing addressable on this surface
  }
  const current = targets.findIndex((el) => el === focused);
  if (current < 0) {
    targets[0].focus(); // unanchored press: enter the grid at its head
    event.preventDefault();
    return;
  }
  const next = nextIndex({
    count: targets.length,
    current,
    cols: columnsFromTops(targets.map((el) => el.offsetTop)),
    key: event.key,
  });
  if (next === null) {
    return; // not an arrow (I3): fall through untouched
  }
  targets[next].focus();
  event.preventDefault(); // handled: keep the page from scrolling too
}

// TvFocusRoot — renders null, owns the one listener. Mounted after <Routes>
// (design I6); the tv-class check inside the handler is the entire arming
// mechanism, so mounting is unconditional and mode switches are live.
export default function TvFocusRoot(): ReactElement | null {
  useEffect(() => {
    window.addEventListener("keydown", handleTvKeyDown);
    return () => window.removeEventListener("keydown", handleTvKeyDown);
  }, []);
  return null;
}
