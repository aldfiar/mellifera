// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TvModeToggle } from "@/components/TvModeToggle";
import { TV_KEY } from "@/lib/tvmode";

// Group-6 slice: the «Режим ТВ» control's OWN behavior — the exact stored
// value per state under the fixed key (INV-fixed-key), the LIVE class apply
// through lib/tvmode's single writer (design I1 — jsdom's UA carries no TV
// marker, so detection is deterministically desktop and Вкл/Выкл must flip
// the class with no reload), the invalid-value floor to Авто (readTvOverride's
// contract rendered), and the session-only degradation when the store throws.
// fireEvent clicks (no user-event dep, the Sidebar.test.tsx posture).

// pressed — the aria-pressed truth of one tri-state button by its label.
function pressed(label: string): boolean {
  return (
    screen.getByRole("button", { name: label }).getAttribute("aria-pressed") ===
    "true"
  );
}

describe("TvModeToggle — «Режим ТВ» tri-state override", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // Class leakage between tests: every test asserts against a clean <html>.
    document.documentElement.className = "";
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    document.documentElement.className = "";
  });

  it("writes mellifera.tv on/off/auto exactly, per selection", () => {
    render(<TvModeToggle />);

    // Mockup order; each click stores the EXACT fixed-key value and moves the
    // aria-pressed selection with it.
    const selections: Array<[label: string, stored: string]> = [
      ["Вкл", "on"],
      ["Выкл", "off"],
      ["Авто", "auto"],
    ];
    for (const [label, stored] of selections) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(localStorage.getItem(TV_KEY)).toBe(stored);
      expect(pressed(label)).toBe(true);
      for (const [other] of selections) {
        if (other !== label) {
          expect(pressed(other)).toBe(false);
        }
      }
    }
  });

  it("applies the class live through the single writer, without a reload", () => {
    render(<TvModeToggle />);

    // jsdom UA: no TV marker anywhere, so the resolver is deterministically
    // desktop until the override says otherwise.
    expect(document.documentElement.classList.contains("tv")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Вкл" }));
    expect(document.documentElement.classList.contains("tv")).toBe(true);

    // Выкл beats every detection outcome — the class comes back off, live.
    fireEvent.click(screen.getByRole("button", { name: "Выкл" }));
    expect(document.documentElement.classList.contains("tv")).toBe(false);

    // Авто defers to the ladder (desktop here) — no stale class survives.
    fireEvent.click(screen.getByRole("button", { name: "Авто" }));
    expect(document.documentElement.classList.contains("tv")).toBe(false);
    // Same document, no navigation: the root element never changed identity.
    expect(document.documentElement.tagName).toBe("HTML");
  });

  it("renders the Авто selection for an invalid stored value", () => {
    // The resolver floors anything but "on"/"off" to auto (readTvOverride);
    // the control must RENDER that floored truth, not the garbage.
    localStorage.setItem(TV_KEY, "perhaps");

    render(<TvModeToggle />);

    expect(pressed("Авто")).toBe(true);
    expect(pressed("Вкл")).toBe(false);
    expect(pressed("Выкл")).toBe(false);
  });

  it("degrades to session-only when the store throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    render(<TvModeToggle />);

    // The click must not crash the control, the selection still registers in
    // state, and nothing was persisted (session-only: the store is off-limits).
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Вкл" })),
    ).not.toThrow();
    expect(pressed("Вкл")).toBe(true);
    expect(localStorage.getItem(TV_KEY)).toBeNull();
  });
});
