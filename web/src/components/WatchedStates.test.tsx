// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Collection from "@/pages/collections/Collection";
import ItemDetail from "@/pages/browse/ItemDetail";
import { isWatchedElement, watchedPercent } from "@/components/WatchedStates";
import * as apiModule from "@/lib/api";
import type { ItemDTO, ItemResponse, LibraryDTO, SeriesDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";

// Task 2.3 (watched-states): the element states on the browsable surfaces —
// episode rows (EpisodesView), series cards (SeriesGrid), item-grid cards
// (ItemGrid — the film/tv grid under the html.tv CSS layer too), and the
// element page heading. The tri-state law is asserted AT the real components
// through the same seams the pages' own suites use (Collection.test.tsx's
// fetchWith idiom, ItemDetail.test.tsx's api-seam spies): a watched element
// renders the ✓ pastel mark + dimmed title + NO progress bar even when a
// served position exists; an in-progress sibling keeps today's bar; a new
// element renders clean; wire absence (the omitempty field gone) behaves as
// not-watched. The ✓ mark is a color-change span — its layout/cost is CSS's
// contract (index.css, outside the tv shell block, so the state survives the
// html.tv layer unchanged; tvCssContract pins that block by text).

// fetchWith — a URL-dispatched fetch mock (verbatim from Collection.test.tsx):
// handlers maps a URL substring to the response factory; earlier entries win.
// Anything unmatched REJECTS — an off-contract call fails the test loudly.
function fetchWith(handlers: Record<string, () => Promise<Response>>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    for (const [fragment, respond] of Object.entries(handlers)) {
      if (url.includes(fragment)) {
        return respond();
      }
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// The shared header seam every Collection mount needs: the library list +
// the library's summary (verbatim from Collection.test.tsx).
function headerSeam(
  moduleId: string,
  summaryItems: number,
): Record<string, () => Promise<Response>> {
  return {
    "/api/v1/libraries/1/summary": () =>
      Promise.resolve(
        jsonResponse(200, { library_id: 1, items: summaryItems, updated_at: "" }),
      ),
    "/api/v1/libraries": () =>
      Promise.resolve(
        jsonResponse(200, { items: [lib(1, moduleId, "shelf")] }),
      ),
  };
}

function lib(id: number, moduleId: string, name: string): LibraryDTO {
  return {
    id,
    module_id: moduleId,
    display_name: name,
    description: "",
  } as LibraryDTO;
}

function doc(parts: { title?: string; duration?: number }): ItemDocument {
  const d: ItemDocument = {};
  if (parts.title !== undefined) {
    d.sources = { "serial-parser": { title: parts.title } };
    d._view = {
      title: { value: parts.title, source: "serial-parser", reason: "priority" },
    };
  }
  if (parts.duration !== undefined) {
    d.ffprobe = { format: { duration: String(parts.duration) } };
  }
  return d;
}

function item(
  id: string,
  parts: {
    title?: string;
    duration?: number;
    watched?: boolean;
    moduleId?: string;
  },
): ItemDTO {
  return {
    id,
    module_id: parts.moduleId ?? "audio",
    library_id: 1,
    file_id: `file-${id}`,
    relative_path: `Shelf/${id}.m4a`,
    media_type: parts.moduleId ?? "audio",
    document: doc(parts),
    schema_version: 1,
    status: "ready",
    ...(parts.title !== undefined ? { display_name: parts.title } : {}),
    ...(parts.watched !== undefined ? { watched: parts.watched } : {}),
  };
}

function srow(parts: { id: string; name: string; watched?: boolean }): SeriesDTO {
  return {
    id: parts.id,
    module_id: "serial",
    library_id: 1,
    relative_path: parts.id,
    document: {},
    schema_version: 1,
    status: "ready",
    display_name: parts.name,
    ...(parts.watched !== undefined ? { watched: parts.watched } : {}),
  };
}

function progressRow(itemId: string, position: number, watched?: boolean) {
  return {
    item_id: itemId,
    position_seconds: position,
    updated_at: "",
    ...(watched !== undefined ? { watched } : {}),
  };
}

function renderCollection(at: string): void {
  render(
    <QueryClientProvider client={freshClient()}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/collections/:id" element={<Collection />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// cardOf — the <li> hosting the card whose title text is rendered (the grid
// children are li > card, both for SeriesGrid and the item/episode grids).
function cardOf(title: string): HTMLElement {
  return screen.getByText(title).closest("li") as HTMLElement;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("WatchedStates — pure leaves", () => {
  it("isWatchedElement reads the SERVED flag true-only — absence is not-watched, never a type hole", () => {
    expect(isWatchedElement(true)).toBe(true);
    expect(isWatchedElement(false)).toBe(false);
    expect(isWatchedElement(undefined)).toBe(false);
  });

  it("watchedPercent — today's rail math: rounded, clamped, null on unknown durations (never a guessed percent)", () => {
    expect(watchedPercent(200, 600)).toBe(33);
    expect(watchedPercent(600, 600)).toBe(100);
    expect(watchedPercent(900, 600)).toBe(100);
    expect(watchedPercent(1, null)).toBeNull();
    expect(watchedPercent(1, 0)).toBeNull();
  });
});

describe("WatchedStates — episode rows (EpisodesView)", () => {
  it("a watched episode renders the mark + dimmed title + NO bar even with a served position; the in-progress sibling keeps its bar; a new sibling renders clean", async () => {
    fetchWith({
      ...headerSeam("serial", 3),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, { items: [srow({ id: "sr_1", name: "Hot Show" })] }),
        ),
      "/api/v1/series/sr_1/episodes": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("ep_w", { title: "Pilot", duration: 600, watched: true }),
              item("ep_s", { title: "Second Wind", duration: 600 }),
              item("ep_n", { title: "Cold Open", duration: 600 }),
            ],
          }),
        ),
      // include=watched (the shared query 2.1 wired) — the watched row is
      // served, and the watched CARD must still render NO bar off it.
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              progressRow("ep_w", 600, true),
              progressRow("ep_s", 200),
            ],
          }),
        ),
    });

    renderCollection("/collections/1?series=sr_1");
    await screen.findByText("Pilot");

    // Watched: ✓ mark + dimmed title…
    const pilot = cardOf("Pilot");
    const mark = within(pilot).getByRole("img", { name: "Watched" });
    expect(mark.textContent).toBe("✓");
    expect(screen.getByText("Pilot").classList.contains("watched-dim")).toBe(
      true,
    );
    // …and NO progress bar, even though the served list carries its row
    // (600/600 would announce "100% watched" — the tri-state suppresses it).
    // The in-progress sibling's bar is awaited FIRST so the shared
    // ["progress"] cache has landed before any absence is asserted.
    const second = cardOf("Second Wind");
    await within(second).findByRole("img", { name: "33% watched" });
    expect(screen.queryByRole("img", { name: "100% watched" })).toBeNull();
    expect(
      screen.getByText("Second Wind").classList.contains("watched-dim"),
    ).toBe(false);
    expect(within(second).queryByRole("img", { name: "Watched" })).toBeNull();

    // New sibling: clean — no mark, no bar, no dim.
    const cold = cardOf("Cold Open");
    expect(within(cold).queryByRole("img")).toBeNull();
    expect(
      screen.getByText("Cold Open").classList.contains("watched-dim"),
    ).toBe(false);
  });
});

describe("WatchedStates — series cards (SeriesGrid)", () => {
  it("an all-watched series renders the mark + dimmed title; an unwatched sibling renders clean", async () => {
    fetchWith({
      ...headerSeam("serial", 2),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              srow({ id: "sr_done", name: "Long Show", watched: true }),
              srow({ id: "sr_fresh", name: "Fresh Show" }),
            ],
          }),
        ),
    });

    renderCollection("/collections/1");
    await screen.findByText("Long Show");

    const done = cardOf("Long Show");
    expect(within(done).getByRole("img", { name: "Watched" }).textContent).toBe(
      "✓",
    );
    expect(
      screen.getByText("Long Show").classList.contains("watched-dim"),
    ).toBe(true);
    // No series-level position is served — a series card never renders a bar.
    expect(screen.queryByRole("img", { name: /% watched/ })).toBeNull();

    // Wire absence (the omitempty field gone) behaves as not-watched.
    const fresh = cardOf("Fresh Show");
    expect(within(fresh).queryByRole("img", { name: "Watched" })).toBeNull();
    expect(
      screen.getByText("Fresh Show").classList.contains("watched-dim"),
    ).toBe(false);
  });
});

describe("WatchedStates — item-grid cards (ItemGrid, the film/tv grid)", () => {
  it("watched card: mark + dimmed title + NO bar; in-progress sibling keeps today's bar; wire-absence renders clean", async () => {
    fetchWith({
      ...headerSeam("audio", 3),
      "/api/v1/items?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("itm_w", { title: "Done Film", duration: 600, watched: true }),
              item("itm_s", { title: "Started Film", duration: 600 }),
              item("itm_n", { title: "New Film", duration: 600 }),
            ],
          }),
        ),
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              progressRow("itm_w", 600, true),
              progressRow("itm_s", 200),
            ],
          }),
        ),
    });

    renderCollection("/collections/1");
    await screen.findByText("Done Film");

    const done = cardOf("Done Film");
    within(done).getByRole("img", { name: "Watched" });
    expect(
      screen.getByText("Done Film").classList.contains("watched-dim"),
    ).toBe(true);

    // The in-progress sibling's bar awaited first (shared cache landed),
    // then the watched card's bar absence is meaningful.
    const started = cardOf("Started Film");
    await within(started).findByRole("img", { name: "33% watched" });
    expect(screen.queryByRole("img", { name: "100% watched" })).toBeNull();
    expect(
      screen.getByText("Started Film").classList.contains("watched-dim"),
    ).toBe(false);

    const fresh = cardOf("New Film");
    expect(within(fresh).queryByRole("img")).toBeNull();
    expect(
      screen.getByText("New Film").classList.contains("watched-dim"),
    ).toBe(false);
  });
});

describe("WatchedStates — the element page heading", () => {
  function detailSeam(itemBody: ItemDTO): void {
    const response: ItemResponse = { item: itemBody };
    vi.spyOn(apiModule, "getItem").mockResolvedValue(response);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(
      lib(1, "serial", "serials"),
    );
    vi.spyOn(apiModule, "listProgress").mockResolvedValue({ items: [] });
  }

  function detailItem(watched?: boolean): ItemDTO {
    return {
      id: "itm_9",
      module_id: "serial",
      library_id: 1,
      file_id: "9",
      relative_path: "shows/Hot Show/s01e01.mkv",
      media_type: "serial",
      schema_version: 1,
      status: "ready",
      display_name: "Hot Show S01E01",
      document: doc({ title: "Pilot", duration: 600 }),
      ...(watched !== undefined ? { watched } : {}),
    };
  }

  function renderDetail(): void {
    render(
      <QueryClientProvider client={freshClient()}>
        <MemoryRouter initialEntries={["/items/itm_9"]}>
          <Routes>
            <Route path="/items/:id" element={<ItemDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("a watched element's heading gains the ✓ beside the served display name", async () => {
    detailSeam(detailItem(true));
    renderDetail();

    const h1 = await screen.findByRole("heading", { level: 1 });
    await waitFor(() =>
      expect(within(h1).getByRole("img", { name: "Watched" }).textContent).toBe(
        "✓",
      ),
    );
    // The served display name is dimmed; the mark itself carries the accent.
    expect(
      within(h1).getByText("Hot Show S01E01").classList.contains("watched-dim"),
    ).toBe(true);
  });

  it("wire absence (no served watched flag) leaves the heading clean", async () => {
    detailSeam(detailItem());
    renderDetail();

    const h1 = await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(within(h1).getByText("Hot Show S01E01")).toBeDefined());
    expect(within(h1).queryByRole("img", { name: "Watched" })).toBeNull();
    expect(
      within(h1).getByText("Hot Show S01E01").classList.contains("watched-dim"),
    ).toBe(false);
  });
});
