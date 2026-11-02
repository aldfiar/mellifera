// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";

import TvFocusRoot from "@/components/TvFocusRoot";

// tv-mode 3.2 — the harness contracts over the pure walker core: arrows walk
// the VISIBLE link set in DOM order (hidden targets are skipped, an
// unanchored press enters at the head), the three structural yield guards
// ([data-tv-yield] subtree, text-entry target, mounted .overlay-backdrop)
// each suppress the walk, the listener is inert without the `tv` class on
// documentElement, and a non-arrow key falls through untouched (design
// I3/I4/D5). jsdom evaluates no layout, so visibility arrives stubbed over
// the same offsetWidth/offsetHeight seam the browser predicate reads (the
// focusWalker injection posture); the component itself renders null, so it
// mounts alongside plain grid markup without a router.

// ROW_TOPS — a 3-col × 2-row grid's stubbed offsetTops (row-major in DOM).
const ROW_A = 0;
const ROW_B = 200;

// stubBox — pins the geometry the harness's real predicate reads. jsdom
// reports offsetWidth/offsetHeight/offsetTop as 0; a visible target gets a
// real box, an invisible one keeps the 0s.
function stubBox(el: HTMLElement, top: number, visible = true): void {
  Object.defineProperty(el, "offsetTop", { value: top, configurable: true });
  Object.defineProperty(el, "offsetWidth", {
    value: visible ? 120 : 0,
    configurable: true,
  });
  Object.defineProperty(el, "offsetHeight", {
    value: visible ? 40 : 0,
    configurable: true,
  });
}

// grid — the 3-col × 2-row grid plus one HIDDEN link (a display:none card)
// sitting mid-DOM at row A: the walk must skip it, so row A holds l1..l3 and
// row B holds l4..l6 across six ADDRESSABLE targets.
function grid(): ReactElement {
  return (
    <>
      <a href="/1" id="l1">1</a>
      <a href="/2" id="l2">2</a>
      <a href="/hidden" id="lh">hidden</a>
      <a href="/3" id="l3">3</a>
      <a href="/4" id="l4">4</a>
      <a href="/5" id="l5">5</a>
      <a href="/6" id="l6">6</a>
    </>
  );
}

// mountGrid — renders the harness (null) plus the grid markup, then stubs
// the boxes: row A tops ROW_A, the hidden card, then row B tops ROW_B.
function mountGrid(): void {
  render(
    <div>
      <TvFocusRoot />
      {grid()}
    </div>,
  );
  const tops: Record<string, number> = {
    l1: ROW_A,
    l2: ROW_A,
    lh: ROW_A,
    l3: ROW_A,
    l4: ROW_B,
    l5: ROW_B,
    l6: ROW_B,
  };
  for (const [id, top] of Object.entries(tops)) {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`missing #${id}`);
    }
    stubBox(el, top, id !== "lh");
  }
}

function press(id: string, key: string): void {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`missing #${id}`);
  }
  el.focus();
  fireEvent.keyDown(el, { key });
}

function focusedId(): string | null {
  return document.activeElement instanceof HTMLElement
    ? document.activeElement.id
    : null;
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("tv");
});

describe("TvFocusRoot", () => {
  it("arrows_walk_visible_links", () => {
    document.documentElement.classList.add("tv");
    mountGrid();

    press("l1", "ArrowRight"); // row A, col 1 → col 2
    expect(focusedId()).toBe("l2");
    press("l2", "ArrowDown"); // row A col 2 → row B col 2 (hidden #lh skipped)
    expect(focusedId()).toBe("l5");
    press("l5", "ArrowLeft"); // row B col 2 → col 1
    expect(focusedId()).toBe("l4");
    press("l4", "ArrowLeft"); // first col clamps: holds
    expect(focusedId()).toBe("l4");
    press("l6", "ArrowDown"); // last row clamps: holds
    expect(focusedId()).toBe("l6");

    // Unanchored press — focus sits on a non-addressable element — enters
    // the grid at its head.
    const span = document.createElement("span");
    span.tabIndex = 0; // focusable, but not an a[href]/button → not a target
    document.body.appendChild(span);
    span.focus();
    fireEvent.keyDown(span, { key: "ArrowRight" });
    expect(focusedId()).toBe("l1");
  });

  it("yields_inside_data_tv_yield", () => {
    document.documentElement.classList.add("tv");
    render(
      <div>
        <TvFocusRoot />
        {/* Both orders pinned: the yield suppresses whether the press is
            carried by the target INSIDE the subtree or merely focused there
            while arriving from a sibling — structural, not order-dependent. */}
        <div data-tv-yield>
          <a href="/stage" id="inside">stage</a>
        </div>
        <a href="/out" id="outside">out</a>
      </div>,
    );
    for (const id of ["inside", "outside"]) {
      const el = document.getElementById(id);
      if (!el) {
        throw new Error(`missing #${id}`);
      }
      stubBox(el, 0);
    }

    press("inside", "ArrowRight"); // guard (a): the marker subtree owns it
    expect(focusedId()).toBe("inside");
    press("outside", "ArrowRight"); // outside any marker: the walk runs
    expect(focusedId()).toBe("outside");
  });

  it("yields_text_entry_and_overlays", () => {
    document.documentElement.classList.add("tv");
    render(
      <div>
        <TvFocusRoot />
        <a href="/1" id="l1">1</a>
        <a href="/2" id="l2">2</a>
        <input id="field" />
      </div>,
    );
    for (const id of ["l1", "l2"]) {
      const el = document.getElementById(id);
      if (!el) {
        throw new Error(`missing #${id}`);
      }
      stubBox(el, 0);
    }

    // Guard (b): a text-entry target keeps its keys (typing, not transport).
    press("field", "ArrowRight");
    expect(focusedId()).toBe("field");

    // Guard (c): a mounted .overlay-backdrop owns the keys even when a
    // focusable grid target holds focus (the DialogShell focus trap does).
    const backdrop = document.createElement("div");
    backdrop.className = "overlay-backdrop";
    document.body.appendChild(backdrop);
    try {
      press("l1", "ArrowRight");
      expect(focusedId()).toBe("l1");
    } finally {
      backdrop.remove();
    }

    // Backdrop gone, the same press walks again — the guard is per-event.
    press("l1", "ArrowRight");
    expect(focusedId()).toBe("l2");
  });

  it("inert_without_tv_class", () => {
    // No `tv` class on documentElement: the listener is mounted but the
    // per-event check (design I1/I6) disarms every press.
    mountGrid();
    press("l1", "ArrowRight");
    expect(focusedId()).toBe("l1");
    press("l1", "ArrowDown");
    expect(focusedId()).toBe("l1");
  });

  it("non_arrow_key_falls_through_untouched", () => {
    document.documentElement.classList.add("tv");
    mountGrid();

    // Enter is native activation (never the walker's, design I3) and a
    // letter key is nobody's here — focus holds and the event propagates.
    press("l1", "Enter");
    expect(focusedId()).toBe("l1");
    press("l1", "a");
    expect(focusedId()).toBe("l1");

    // The fall-through consumed nothing: a bubbling listener still sees the
    // key and the default was not prevented.
    let seen: string | null = null;
    const witness = (event: KeyboardEvent): void => {
      seen = event.key;
    };
    window.addEventListener("keydown", witness);
    try {
      press("l1", "MediaPlayPause");
      expect(focusedId()).toBe("l1");
      expect(seen).toBe("MediaPlayPause");
    } finally {
      window.removeEventListener("keydown", witness);
    }
  });
});
