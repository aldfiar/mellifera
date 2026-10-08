// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Collection, {
  captureDate,
  parsedChips,
} from "@/pages/collections/Collection";
import type { ItemDTO, LibraryDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";

// Group-5 slice (boxes 5.1–5.3): the collection page's OWN behavior, asserted
// at the fetch seam (the same idiom as Home.test.tsx). Covered here: the tv
// body's parsed chips + raw filename + limit/offset paging, the photos body's
// folder-chip client-side filter round-trip and masonry date-footers (present
// and honestly absent), and the serial fallthrough to the generic grid. Layout
// itself is CSS's contract.
//
// NOTE on fixtures: pages/collections must never carry a filesystem-path
// literal (D5 — the group probe greps for it), so the fixtures omit the
// library DTO's one path field and fill it by assertion in this test seam only.

function lib(id: number, moduleId: string, name: string): LibraryDTO {
  return { id, module_id: moduleId, display_name: name, description: "" } as LibraryDTO;
}

function doc(parts: {
  title?: string;
  season?: number;
  episode?: number;
  year?: number;
  resolution?: string;
  dateTaken?: string;
  width?: number;
  height?: number;
}): ItemDocument {
  const d: ItemDocument = {};
  const tv: Record<string, unknown> = {};
  if (parts.season !== undefined) tv.season = parts.season;
  if (parts.episode !== undefined) tv.episode = parts.episode;
  if (parts.year !== undefined) tv.year = parts.year;
  if (parts.resolution !== undefined) tv.resolution = parts.resolution;
  if (Object.keys(tv).length > 0) {
    d.sources = { "tv-parser": tv };
  }
  if (parts.dateTaken !== undefined || parts.width !== undefined) {
    const img: Record<string, unknown> = {};
    if (parts.dateTaken !== undefined) img.date_taken = parts.dateTaken;
    if (parts.width !== undefined) img.width = parts.width;
    if (parts.height !== undefined) img.height = parts.height;
    d.sources = { ...(d.sources ?? {}), "image-enricher": img };
  }
  if (parts.title !== undefined) {
    d._view = { title: { value: parts.title, source: "tv-parser", reason: "priority" } };
  }
  return d;
}

function item(
  id: string,
  moduleId: string,
  relativePath: string,
  document: ItemDocument,
): ItemDTO {
  return {
    id,
    module_id: moduleId,
    library_id: 1,
    file_id: `file-${id}`,
    relative_path: relativePath,
    media_type: moduleId === "image" ? "image" : "video",
    document,
    schema_version: 1,
    status: "ready",
  };
}

// fetchWith — a URL-dispatched fetch mock (verbatim from Home.test.tsx):
// handlers maps a URL substring to the response factory; earlier entries win.
// Anything unmatched REJECTS — an off-contract call (e.g. /series from the
// serial fallthrough) fails the test loudly.
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

function renderCollection(id: string): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/collections/${id}`]}>
        <Routes>
          <Route path="/collections/:id" element={<Collection />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The shared header seam every case mounts against: the library list + the
// library's summary.
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
      Promise.resolve(jsonResponse(200, { items: [lib(1, moduleId, "films")] })),
  };
}

describe("Collection — pure chip/date readers", () => {
  it("parsedChips reads season/episode, year and resolution from the source namespaces", () => {
    expect(
      parsedChips(doc({ season: 1, episode: 2, year: 2019, resolution: "1080p" })),
    ).toEqual(["S01E02", "2019", "1080p"]);
    // No parsed facts → no chips, never a guess.
    expect(parsedChips(doc({ title: "plain" }))).toEqual([]);
    // Partial facts render only what exists.
    expect(parsedChips(doc({ year: 2021 }))).toEqual(["2021"]);
  });

  it("captureDate reads date_taken verbatim; absent → null (never a faked date)", () => {
    expect(captureDate(doc({ dateTaken: "2026-07-04T12:21:05Z" }))).toBe(
      "2026-07-04T12:21:05Z",
    );
    expect(captureDate(doc({ title: "no exif" }))).toBeNull();
  });
});

describe("Collection — tv body (box 5.2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders parsed chips, duration, and the raw filename, deep-linking into the item", async () => {
    fetchWith({
      ...headerSeam("tv", 1),
      "/api/v1/items?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item(
                "itm_1_a",
                "tv",
                "Movies/The Thing 2019 1080p.mkv",
                doc({
                  title: "The Thing",
                  season: 1,
                  episode: 2,
                  year: 2019,
                  resolution: "1080p",
                }),
              ),
            ],
          }),
        ),
    });
    renderCollection("1");

    const card = await screen.findByRole("link", { name: /The Thing/ });
    expect(card.getAttribute("href")).toBe("/items/itm_1_a");
    // Parsed chips from the document's source namespaces.
    expect(within(card).getByText("S01E02")).toBeDefined();
    expect(within(card).getByText("2019")).toBeDefined();
    expect(within(card).getByText("1080p")).toBeDefined();
    // The raw filename (relative_path's last segment), verbatim.
    expect(within(card).getByText("The Thing 2019 1080p.mkv")).toBeDefined();
    // No duration fact on this document → no duration chip.
    expect(within(card).queryByText(/^1:\d{2}:\d{2}$|^\d{2}:\d{2}$/)).toBeNull();
  });

  it("pages with limit/offset: Next enabled on a full page, Previous returns", async () => {
    const page = (offset: number, count: number): { items: ItemDTO[] } => ({
      items: Array.from({ length: count }, (_, i) =>
        item(
          `itm_1_${offset + i}`,
          "tv",
          `Movies/film_${offset + i}.mkv`,
          doc({ title: `Film ${offset + i}` }),
        ),
      ),
    });
    fetchWith({
      ...headerSeam("tv", 60),
      // Earlier entries win: the offset page is matched before the generic
      // items handler.
      "offset=50": () => Promise.resolve(jsonResponse(200, page(50, 10))),
      "/api/v1/items": () => Promise.resolve(jsonResponse(200, page(0, 50))),
    });
    renderCollection("1");

    // Full first page (50 = PAGE_SIZE) → Next enabled.
    await screen.findByText("Film 0");
    const next = screen.getByRole("button", { name: "Next" });
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("items 1–50")).toBeDefined();

    fireEvent.click(next);
    // Offset page: 10 remaining items → Next disabled, range updates.
    expect(await screen.findByText("Film 59")).toBeDefined();
    expect(screen.getByText("items 51–60")).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Film 0")).toBeDefined();
  });
});

describe("Collection — image body (box 5.3)", () => {
  const PHOTOS = [
    item("itm_1_p1", "image", "2026/beach.jpg", doc({ dateTaken: "2026-07-04T12:21:05Z", width: 300, height: 200 })),
    item("itm_1_p2", "image", "2025/alps.jpg", doc({ dateTaken: "2025-05-10T09:00:00Z" })),
    item("itm_1_p3", "image", "archive/scan.jpg", doc({})), // no date → no footer
  ];

  const photoSeam = (): Record<string, () => Promise<Response>> => ({
    // BEFORE headerSeam's generic "/api/v1/libraries" — the mock matches by
    // substring and earlier entries win.
    "/api/v1/libraries/1/folders": () =>
      Promise.resolve(
        jsonResponse(200, {
          folders: [
            { path: "2025", items: 1 },
            { path: "2026", items: 1 },
            { path: "archive", items: 1 },
          ],
        }),
      ),
    ...headerSeam("image", 3),
    "/api/v1/items?library=1": () =>
      Promise.resolve(jsonResponse(200, { items: PHOTOS })),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the folder chip row from the folders endpoint and filters client-side; All resets", async () => {
    fetchWith(photoSeam());
    renderCollection("1");

    // All three tiles first, each with a capture-date footer (or honestly none).
    expect(await screen.findByRole("link", { name: "Open beach.jpg" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Open alps.jpg" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Open scan.jpg" })).toBeDefined();

    // Pick the 2026 folder → only its tile remains (client-side prefix filter).
    fireEvent.click(screen.getByRole("button", { name: /2026/ }));
    expect(screen.getByRole("link", { name: "Open beach.jpg" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Open alps.jpg" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open scan.jpg" })).toBeNull();

    // All resets the filter.
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByRole("link", { name: "Open alps.jpg" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Open scan.jpg" })).toBeDefined();
  });

  it("renders capture-date footers from date_taken and omits them when the document has none", async () => {
    fetchWith(photoSeam());
    renderCollection("1");

    // RFC3339 stamps show their date part; every dated tile shows its own.
    const beach = await screen.findByRole("link", { name: "Open beach.jpg" });
    expect(within(beach).getByText("2026-07-04")).toBeDefined();
    const alps = screen.getByRole("link", { name: "Open alps.jpg" });
    expect(within(alps).getByText("2025-05-10")).toBeDefined();
    // No date fact → NO footer date, never a fake one.
    const scan = screen.getByRole("link", { name: "Open scan.jpg" });
    expect(within(scan).queryByText(/^\d{4}-\d{2}-\d{2}/)).toBeNull();
  });
});

describe("Collection — serial fallthrough (box 5.4 pending)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the generic item grid for a serial library and never calls /series", async () => {
    fetchWith({
      ...headerSeam("serial", 1),
      "/api/v1/items?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("itm_1_s1", "serial", "Show/S01E01.mkv", doc({ title: "Show S01E01" })),
            ],
          }),
        ),
    });
    renderCollection("1");

    // The generic grid's card shape: title + type/status chips + filename.
    const card = await screen.findByRole("link", { name: /Show S01E01/ });
    expect(within(card).getByText("video")).toBeDefined();
    expect(within(card).getByText("ready")).toBeDefined();
    expect(within(card).getByText("S01E01.mkv")).toBeDefined();
    // The fetch mock rejects ANY unmatched URL — a /series call would have
    // failed this test; reaching here proves none was made.
  });

  it("renders the summary-driven 'not scanned yet' state for a zero-item collection", async () => {
    fetchWith({
      ...headerSeam("tv", 0),
    });
    renderCollection("1");

    expect(await screen.findByText("Not scanned yet — run a scan from Admin.")).toBeDefined();
  });
});
