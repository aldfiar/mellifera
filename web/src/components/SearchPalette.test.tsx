// SPDX-License-Identifier: Apache-2.0
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import { SearchPalette } from "@/components/SearchPalette";
import type { SearchResponse } from "@/lib/api";

// browse-scale 5.1 — the palette's mandated vitest coverage: BOTH the
// one-request-per-keystroke count (a typing burst collapses to exactly ONE
// request for the settled query; every further settled query adds exactly
// one) AND the abort path (the superseded request's AbortSignal fires; the
// aborted fetch's rejection is swallowed, never an error state). Plus the
// render contract: served arrays verbatim, the honest empty/no-result
// states, the canonical error retry:0, and the ↑↓↵Esc walk.
//
// Timing is hermetic: fake timers drive the 120 ms debounce
// (advanceTimersByTimeAsync also drains the fetch promise chain); jsdom
// history is walked back to a stamped base entry after each test (the
// DialogShell.test.tsx idiom — the shell pushes ONE overlay entry per open).

const BASE_MARKER = { __paletteBase: true };

function baseState(): Record<string, unknown> | null {
  return window.history.state as Record<string, unknown> | null;
}

async function flushHistory(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  window.history.replaceState(BASE_MARKER, "");
  vi.useFakeTimers();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Settle the shell's deferred history consumption, then walk back to the
  // stamped base — at most a few pushes deep.
  await flushHistory();
  for (let i = 0; i < 20; i++) {
    if (baseState()?.__paletteBase) {
      break;
    }
    await act(async () => {
      window.history.back();
    });
    await flushHistory();
  }
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// respondWith — the happy-path mock: every /api/v1/search call answers the
// given body once, then keeps answering it (each call gets a FRESH Response
// — a consumed body cannot be re-read).
function respondWith(body: unknown, status = 200): MockInstance {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(jsonResponse(status, body)),
  );
}

// deferredFetch — never-settling calls the test resolves/rejects manually;
// each call's AbortSignal is captured for the abort-path assertions.
function deferredFetch(): Array<{
  resolve: (res: Response) => void;
  reject: (err: unknown) => void;
  signal: AbortSignal;
}> {
  const pending: Array<{
    resolve: (res: Response) => void;
    reject: (err: unknown) => void;
    signal: AbortSignal;
  }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (_input, init) =>
      new Promise<Response>((resolve, reject) => {
        pending.push({
          resolve,
          reject,
          signal: (init as RequestInit).signal as AbortSignal,
        });
      }),
  );
  return pending;
}

function searchBody(overrides: Partial<SearchResponse>): SearchResponse {
  return { series: [], items: [], ...overrides };
}

function srow(id: string, name: string): SearchResponse["series"][number] {
  return {
    id,
    module_id: "serial",
    library_id: 1,
    relative_path: id,
    document: {},
    schema_version: 1,
    status: "ready",
    display_name: name,
  };
}

function irow(id: string, name: string): SearchResponse["items"][number] {
  return {
    id,
    module_id: "audio",
    library_id: 1,
    file_id: `file-${id}`,
    relative_path: `Shelf/${id}.m4a`,
    media_type: "audio",
    document: {},
    schema_version: 1,
    status: "ready",
    display_name: name,
  };
}

// CollectionProbe / ItemProbe — the navigation targets rendered as probes so
// a ↵/click is asserted at the REAL router seam (the palette's useNavigate
// is the production one inside MemoryRouter).
function CollectionProbe(): React.ReactElement {
  const { libraryId } = useParams();
  const [sp] = useSearchParams();
  return (
    <div>
      collection-probe {libraryId} {sp.get("series") ?? ""}
    </div>
  );
}

function ItemProbe(): React.ReactElement {
  const { id } = useParams();
  return <div>item-probe {id}</div>;
}

function renderPalette(): void {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<SearchPalette />} />
        <Route path="/collections/:libraryId" element={<CollectionProbe />} />
        <Route path="/items/:id" element={<ItemProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openPalette(): HTMLElement {
  renderPalette();
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  return screen.getByRole("textbox", { name: "Search" });
}

// settle — drain the debounce timer AND the fetch promise chain: one async
// timer advance covers both (microtasks flush between timers).
async function settle(ms = 120): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// type — one change event per keystroke (the palette sees value deltas).
async function type(input: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
}

function qOf(call: unknown[]): string {
  return new URL(String(call[0]), "http://localhost").searchParams.get("q") ?? "";
}

describe("SearchPalette — open/close mechanics", () => {
  it("⌘K opens the palette; a fresh open shows the honest empty hint and fires nothing", () => {
    const fetchMock = respondWith(searchBody({}));
    openPalette();

    expect(screen.getByRole("dialog", { name: "Search" })).toBeDefined();
    expect(
      screen.getByText("Type to search every collection."),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Esc closes through the shell's forwarded onEscape; a reopen is a fresh palette", async () => {
    respondWith(searchBody({ series: [srow("sr_1", "aria")] }));
    const input = openPalette();

    await type(input, "aria");
    await settle();
    expect(screen.getByRole("button", { name: "aria" })).toBeDefined();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();

    // Reopen — the reset law: hint state again, not the stale results.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      screen.getByText("Type to search every collection."),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "aria" })).toBeNull();
  });
});

describe("SearchPalette — the request-count contract", () => {
  it("a four-keystroke burst collapses to exactly ONE request for the settled query; the next settled query adds exactly one more", async () => {
    const fetchMock = respondWith(searchBody({}));
    const input = openPalette();

    // Four keystrokes inside the debounce window: every change resets the
    // single timer, so NOTHING fires until it survives 120 ms.
    await type(input, "a");
    await type(input, "ar");
    await type(input, "ari");
    await type(input, "aria");
    expect(fetchMock.mock.calls.length).toBe(0);

    await settle();
    expect(fetchMock.mock.calls.length).toBe(1);
    expect(qOf(fetchMock.mock.calls[0])).toBe("aria");

    // One more keystroke after the burst settled: exactly one more request,
    // for the new query.
    await type(input, "ariax");
    await settle();
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(qOf(fetchMock.mock.calls[1])).toBe("ariax");
  });

  it("an empty/whitespace query never fires — the honest empty state is request-free", async () => {
    const fetchMock = respondWith(searchBody({}));
    const input = openPalette();

    await type(input, "   ");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Type to search every collection."),
    ).toBeDefined();
  });
});

describe("SearchPalette — the abort path", () => {
  it("a superseding settled query aborts the in-flight request's signal; closing aborts the live one", async () => {
    const pending = deferredFetch();
    const input = openPalette();

    await type(input, "aria");
    await settle();
    expect(pending.length).toBe(1);
    expect(pending[0].signal.aborted).toBe(false);

    // The next settled query aborts request #1 and issues request #2.
    await type(input, "ariax");
    await settle();
    expect(pending.length).toBe(2);
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);

    // Esc while request #2 is in flight: the effect cleanup aborts it.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(pending[1].signal.aborted).toBe(true);
  });

  it("the aborted fetch's rejection is swallowed — never a canonical error state; the superseding answer paints", async () => {
    const pending = deferredFetch();
    const input = openPalette();

    await type(input, "aria");
    await settle();

    await type(input, "ariax");
    await settle();
    expect(pending[0].signal.aborted).toBe(true);

    // Request #1 rejects the way an aborted fetch does; request #2 answers.
    await act(async () => {
      pending[0].reject(new DOMException("The operation was aborted.", "AbortError"));
      pending[1].resolve(
        jsonResponse(200, searchBody({ series: [srow("sr_1", "Ария")] })),
      );
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Ария" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a late answer from an already-aborted request never paints (the stale-response guard)", async () => {
    const pending = deferredFetch();
    const input = openPalette();

    await type(input, "aria");
    await settle();
    const stale = pending[0];

    await type(input, "ariax");
    await settle();
    // Resolve request #1 AFTER its abort — the signal check must drop it.
    await act(async () => {
      stale.resolve(
        jsonResponse(200, searchBody({ series: [srow("sr_stale", "Stale")] })),
      );
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "Stale" })).toBeNull();
  });
});

describe("SearchPalette — the served-bytes render", () => {
  it("rows render the two served arrays verbatim — served order, both groups headed, nothing re-ranked", async () => {
    respondWith(
      searchBody({
        series: [srow("sr_1", "Ария"), srow("sr_2", "Belle du Seigneur")],
        items: [irow("itm_9", "Bell")],
      }),
    );
    const input = openPalette();

    await type(input, "bell");
    await settle();

    // DOM order of the palette's row buttons IS the served order: series
    // group first, then items — verbatim, never re-sorted client-side.
    const dialog = screen.getByRole("dialog", { name: "Search" });
    const rowTexts = Array.from(dialog.querySelectorAll("button.cardact-row")).map(
      (b) => b.textContent,
    );
    expect(rowTexts).toEqual(["Ария", "Belle du Seigneur", "Bell"]);
    expect(screen.getByText("Series")).toBeDefined();
    expect(screen.getByText("Items")).toBeDefined();
    expect(input).toBeDefined();
  });

  it("no match is an honest empty state, not an error — the served empty arrays", async () => {
    respondWith(searchBody({}));
    const input = openPalette();

    await type(input, "zzz");
    await settle();
    expect(screen.getByText("Nothing found for “zzz”")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a canonical error renders code + message inline through ErrorState, retry:0 — no Retry affordance", async () => {
    respondWith(
      { error: { code: "internal_error", message: "boom", retryable: false } },
      500,
    );
    const input = openPalette();

    await type(input, "aria");
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("internal_error");
    expect(alert.textContent).toContain("boom");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("SearchPalette — the keyboard walk", () => {
  it("↑↓ walk the flattened rows; ↵ navigates the active row and closes", async () => {
    respondWith(
      searchBody({
        series: [srow("sr_1", "Ария")],
        items: [irow("itm_9", "Bell")],
      }),
    );
    const input = openPalette();

    await type(input, "b");
    await settle();

    // The walk: row 0 active at rest, ↓ to row 1, ↑ back, ↓ again.
    const rowButtons = () =>
      Array.from(
        screen.getByRole("dialog", { name: "Search" }).querySelectorAll("button.cardact-row"),
      );
    expect(rowButtons()[0].classList.contains("search-row--active")).toBe(true);
    expect(rowButtons()[1].classList.contains("search-row--active")).toBe(false);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(rowButtons()[1].classList.contains("search-row--active")).toBe(true);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(rowButtons()[0].classList.contains("search-row--active")).toBe(true);
    fireEvent.keyDown(input, { key: "ArrowDown" });

    // ↵ on the active row (the item): navigates to the element page probe
    // and closes the palette.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("item-probe itm_9")).toBeDefined();
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
  });

  it("↵ on a series row rides the collection's ?series= deep link", async () => {
    respondWith(searchBody({ series: [srow("sr_1", "Ария")] }));
    const input = openPalette();

    await type(input, "a");
    await settle();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("collection-probe 1 sr_1")).toBeDefined();
  });
});
