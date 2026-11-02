// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import TvDebugOverlay from "@/components/TvDebugOverlay";

// tv-debug-overlay 1.1 — the harness contracts over the query-param gate and
// the two rolling logs: the overlay renders null without ?tvdebug=1, mounts
// with it (UA line, viewport line, and the "(absent)" meta floor), a
// dispatched keydown lands in the visible key log (newest first), a
// pointermove lands in the pointer log, and an <html> class mutation flips
// the tv-state line live through the MutationObserver. jsdom per the
// existing component-test patterns; no providers needed — the overlay is a
// plain fixed div.

// goto — jsdom's URL seam: history.replaceState rewrites location.search
// in place, which is exactly what the gate reads.
function goto(search: string): void {
  window.history.replaceState(null, "", search);
}

// removeClientUaMeta — guarantees the meta floor: no shell-injected UA in
// the test document, so the meta line must show "(absent)".
function removeClientUaMeta(): void {
  document.querySelector('meta[name="mellifera-client-ua"]')?.remove();
}

// dispatchPointerMove — jsdom 25 has no PointerEvent constructor, so the
// geometry is assigned onto a plain Event of the right type (exactly what
// @testing-library's own fallback would hand the window listener).
function dispatchPointerMove(x: number, y: number): void {
  act(() => {
    window.dispatchEvent(
      Object.assign(new window.Event("pointermove"), {
        clientX: x,
        clientY: y,
      }),
    );
  });
}

afterEach(() => {
  cleanup();
  goto("/");
  removeClientUaMeta();
  document.documentElement.classList.remove("tv");
  localStorage.clear();
});

describe("TvDebugOverlay", () => {
  it("renders_null_without_the_param", () => {
    goto("/");
    const { container } = render(<TvDebugOverlay />);
    expect(container.textContent).toBe("");
  });

  it("mounts_static_lines_with_the_param", () => {
    goto("/?tvdebug=1");
    removeClientUaMeta();
    const { container } = render(<TvDebugOverlay />);
    const text = container.textContent ?? "";
    // The JS-visible UA line and the viewport line carry the live values.
    expect(text).toContain(`ua: ${window.navigator.userAgent}`);
    expect(text).toContain(
      `viewport: ${window.innerWidth}x${window.innerHeight}`,
    );
    // No meta in the document: the defensive read floors to "(absent)".
    expect(text).toContain("client-ua meta: (absent)");
    // The guarded storage read floors likewise with an empty store.
    expect(text).toContain("mellifera.tv: (absent)");
  });

  it("keydown_lands_in_the_visible_log_newest_first", () => {
    goto("/?tvdebug=1");
    const { container } = render(<TvDebugOverlay />);
    fireEvent.keyDown(window, {
      key: "ArrowUp",
      code: "ArrowUp",
      keyCode: 38,
    });
    fireEvent.keyDown(window, {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
    });
    const text = container.textContent ?? "";
    expect(text).toContain("key=Enter code=Enter keyCode=13");
    expect(text).toContain("key=ArrowUp code=ArrowUp keyCode=38");
    // Newest first: the later press renders above the earlier one.
    expect(text.indexOf("key=Enter")).toBeLessThan(
      text.indexOf("key=ArrowUp"),
    );
  });

  it("pointermove_lands_in_the_pointer_log", () => {
    goto("/?tvdebug=1");
    const { container } = render(<TvDebugOverlay />);
    dispatchPointerMove(320, 240);
    expect(container.textContent).toContain("pointermove x=320 y=240");
  });

  it("tv_class_mutation_flips_the_state_line_live", async () => {
    goto("/?tvdebug=1");
    const { container } = render(<TvDebugOverlay />);
    expect(container.textContent).toContain("tv class: OFF");

    // The boot apply / «Режим ТВ» control writes the class behind this
    // component's back — the MutationObserver must flip the line anyway.
    document.documentElement.classList.add("tv");
    await waitFor(() =>
      expect(container.textContent).toContain("tv class: ON"),
    );
    document.documentElement.classList.remove("tv");
    await waitFor(() =>
      expect(container.textContent).toContain("tv class: OFF"),
    );
  });
});
