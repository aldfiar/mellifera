// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Collection, {
  captureDate,
  parsedChips,
} from "@/pages/collections/Collection";
import type { ItemDTO, LibraryDTO, SeriesDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";

// Group-5 slice (boxes 5.1–5.4): the collection page's OWN behavior, asserted
// at the fetch seam (the same idiom as Home.test.tsx). Covered here: the tv
// body's parsed chips + raw filename + limit/offset paging, the photos body's
// folder-chip client-side filter round-trip and masonry date-footers (present
// and honestly absent), and the serial body's series grid (title precedence,
// fact chips, the episode-flow round-trip hitting the episodes endpoint once)
// with its empty and error states. Layout itself is CSS's contract.
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

function renderCollection(id: string): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
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

describe("Collection — serial body (box 5.4)", () => {
  // seriesRow — a /series wire row fixture. The serial-level document is
  // opaque dynamic JSON: `parsed` facts (dir_name_raw, backing) plus the
  // sources.<plugin_id> namespaces serial-parser writes into.
  function seriesRow(parts: {
    id: string;
    title?: string; // serial-parser's cleaned display title
    dirNameRaw?: string; // parsed.dir_name_raw — the raw directory name
    season?: number;
    backing?: string;
    status?: string;
    relativePath?: string;
  }): SeriesDTO {
    const d: ItemDocument = {};
    if (parts.title !== undefined || parts.season !== undefined) {
      const sp: Record<string, unknown> = {};
      if (parts.title !== undefined) sp.title = parts.title;
      if (parts.season !== undefined) sp.season = parts.season;
      d.sources = { "serial-parser": sp };
    }
    const parsed: Record<string, unknown> = {};
    if (parts.dirNameRaw !== undefined) parsed.dir_name_raw = parts.dirNameRaw;
    if (parts.backing !== undefined) parsed.backing = parts.backing;
    if (Object.keys(parsed).length > 0) {
      d.parsed = parsed;
    }
    return {
      id: parts.id,
      module_id: "serial",
      library_id: 1,
      relative_path: parts.relativePath ?? parts.dirNameRaw ?? parts.id,
      document: d,
      schema_version: 1,
      status: parts.status ?? "ready",
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders one card per series with title precedence serial-parser → dir_name_raw, status/season/backing chips, skipping deleted rows", async () => {
    fetchWith({
      ...headerSeam("serial", 3),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              seriesRow({
                id: "ser_1_enriched",
                title: "Тайна Смолвуда",
                dirNameRaw: "smolwood.s01",
                season: 1,
              }),
              seriesRow({ id: "ser_1_raw", dirNameRaw: "Очень Странные Дела" }),
              seriesRow({
                id: "ser_1_stray",
                title: "Stray File",
                dirNameRaw: "stray.mkv",
                backing: "file",
                status: "stale",
              }),
              seriesRow({ id: "ser_1_dead", dirNameRaw: "gone", status: "deleted" }),
            ],
          }),
        ),
    });
    renderCollection("1");

    // Precedence: serial-parser's cleaned title wins over dir_name_raw.
    const enriched = await screen.findByRole("link", { name: /Тайна Смолвуда/ });
    expect(within(enriched).queryByText("smolwood.s01")).toBeNull();
    expect(within(enriched).getByText("Season 1")).toBeDefined();

    // No parser title → the raw directory name, verbatim (Cyrillic intact).
    expect(screen.getByRole("link", { name: /Очень Странные Дела/ })).toBeDefined();

    // File-backed stray: "file" marker + its stale status chip.
    const stray = screen.getByRole("link", { name: /Stray File/ });
    expect(within(stray).getByText("file")).toBeDefined();
    expect(within(stray).getByText("stale")).toBeDefined();

    // Deleted rows are not a browse surface — no card at all.
    expect(screen.queryByRole("link", { name: /gone/ })).toBeNull();

    // Ready status renders as a plain chip on the default cards.
    expect(within(enriched).getByText("ready")).toBeDefined();
  });

  it("navigates a card into the episode flow, fetching the episodes endpoint exactly once", async () => {
    let episodesFetches = 0;
    fetchWith({
      ...headerSeam("serial", 1),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [seriesRow({ id: "ser_1_show", dirNameRaw: "Show 2019" })],
          }),
        ),
      "/api/v1/series/ser_1_show/episodes": () => {
        episodesFetches += 1;
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              item(
                "itm_1_e1",
                "serial",
                "Show 2019/S01E01.mkv",
                doc({ title: "Show 2019 S01E01", season: 1, episode: 1 }),
              ),
            ],
          }),
        );
      },
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("link", { name: /Show 2019/ }));

    // The episode card reuses the movie idiom: parsed chips + raw filename,
    // deep-linking into /items/{id}.
    const ep = await screen.findByRole("link", { name: /Show 2019 S01E01/ });
    expect(ep.getAttribute("href")).toBe("/items/itm_1_e1");
    expect(within(ep).getByText("S01E01")).toBeDefined();
    expect(within(ep).getByText("S01E01.mkv")).toBeDefined();
    expect(episodesFetches).toBe(1);

    // Back into the grid — the episodes endpoint is NOT hit again (cached),
    // and the series list is not re-fetched either.
    fireEvent.click(screen.getByRole("button", { name: "← All series" }));
    expect(await screen.findByRole("link", { name: /Show 2019/ })).toBeDefined();
    expect(episodesFetches).toBe(1);
  });

  it("shows an honest empty state when no series has been scanned", async () => {
    // Summary items > 0: the summary-driven "not scanned yet" gate owns the
    // zero-ITEM case; this exercises the series list's own empty reply.
    fetchWith({
      ...headerSeam("serial", 1),
      "/api/v1/series?library=1": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
    });
    renderCollection("1");

    expect(await screen.findByText("No series scanned yet.")).toBeDefined();
  });

  it("surfaces a failed series fetch on the canonical inline error state", async () => {
    fetchWith({
      ...headerSeam("serial", 1),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(404, {
            error: {
              code: "not_found",
              message: "library not found",
              retryable: false,
            },
          }),
        ),
    });
    renderCollection("1");

    expect(await screen.findByText("not_found")).toBeDefined();
    expect(screen.getByText("library not found")).toBeDefined();
  });

  it("renders the summary-driven 'not scanned yet' state for a zero-item collection", async () => {
    fetchWith({
      ...headerSeam("tv", 0),
    });
    renderCollection("1");

    expect(await screen.findByText("Not scanned yet — run a scan from Admin.")).toBeDefined();
  });
});

describe("Collection — serial title chains (serial-watch-flow group 4)", () => {
  // srow — a /series wire row fixture for the title-chain cases: parser
  // namespace, parsed.dir_name_raw, and the stored title_override ("" when
  // unset) are all independently controllable.
  function srow(parts: {
    id: string;
    title?: string;
    dirNameRaw?: string;
    titleOverride?: string;
  }): SeriesDTO {
    const d: ItemDocument = {};
    if (parts.title !== undefined) {
      d.sources = { "serial-parser": { title: parts.title } };
    }
    if (parts.dirNameRaw !== undefined) {
      d.parsed = { dir_name_raw: parts.dirNameRaw };
    }
    return {
      id: parts.id,
      module_id: "serial",
      library_id: 1,
      relative_path: parts.dirNameRaw ?? parts.id,
      document: d,
      schema_version: 1,
      status: "ready",
      title_override: parts.titleOverride ?? "",
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("series cards resolve override → parser title → raw directory name", async () => {
    fetchWith({
      ...headerSeam("serial", 3),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              srow({
                id: "ser_1_ovr",
                title: "Parser Name",
                dirNameRaw: "dir.raw",
                titleOverride: "Operator's Name",
              }),
              srow({ id: "ser_1_par", title: "Only Parser" }),
              srow({ id: "ser_1_raw", dirNameRaw: "Сырое Имя" }),
            ],
          }),
        ),
    });
    renderCollection("1");

    // The override wins over every document fact.
    const ovr = await screen.findByRole("link", { name: /Operator's Name/ });
    expect(within(ovr).queryByText("Parser Name")).toBeNull();
    expect(within(ovr).queryByText("dir.raw")).toBeNull();
    // No override → the parser title…
    expect(screen.getByRole("link", { name: /Only Parser/ })).toBeDefined();
    // …and no parser title → the raw directory name, verbatim.
    expect(screen.getByRole("link", { name: /Сырое Имя/ })).toBeDefined();
  });

  it("episode rows resolve override → parsed title → file name", async () => {
    const overridden = item(
      "itm_1_e0",
      "serial",
      "Show 2019/S01E00.mkv",
      doc({ title: "Parsed E0" }),
    );
    overridden.title_override = "Renamed Episode";
    const parsedOnly = item(
      "itm_1_e1",
      "serial",
      "Show 2019/S01E01.mkv",
      doc({ title: "Show 2019 S01E01" }),
    );
    const nameless = item("itm_1_e2", "serial", "Show 2019/S01E02.mkv", doc({}));

    fetchWith({
      ...headerSeam("serial", 1),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [srow({ id: "ser_1_show", dirNameRaw: "Show 2019" })],
          }),
        ),
      "/api/v1/series/ser_1_show/episodes": () =>
        Promise.resolve(
          jsonResponse(200, { items: [overridden, parsedOnly, nameless] }),
        ),
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("link", { name: /Show 2019/ }));

    // The override beats the parsed title.
    const e0 = await screen.findByRole("link", { name: /Renamed Episode/ });
    expect(within(e0).queryByText("Parsed E0")).toBeNull();
    // Parsed title with no override.
    expect(screen.getByRole("link", { name: /Show 2019 S01E01/ })).toBeDefined();
    // Neither → the raw file name (title span AND filename span agree).
    const e2 = screen.getByRole("link", { name: /S01E02\.mkv/ });
    expect(within(e2).getAllByText("S01E02.mkv").length).toBe(2);
  });

  it("rename PUTs and the display follows; clear DELETEs back to the chain; a 400 surfaces inline once", async () => {
    let override = "";
    const puts: string[] = [];
    let deletes = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/series/ser_1_show/title")) {
        if (method === "PUT") {
          const { title } = JSON.parse(String(init?.body)) as { title: string };
          puts.push(title);
          if (title.trim() === "") {
            return Promise.resolve(
              jsonResponse(400, {
                error: {
                  code: "bad_request",
                  message: "title is required and must be a non-empty string",
                  retryable: false,
                },
              }),
            );
          }
          override = title;
          return Promise.resolve(
            jsonResponse(200, {
              entity_id: "ser_1_show",
              title,
              updated_at: "2026-10-11T00:00:00Z",
            }),
          );
        }
        deletes += 1;
        override = "";
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.includes("/api/v1/series?library=1")) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              srow({
                id: "ser_1_show",
                dirNameRaw: "Show 2019",
                titleOverride: override || undefined,
              }),
            ],
          }),
        );
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(
          jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }),
        );
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "serial", "films")] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    renderCollection("1");

    // Rename: the PUT fires once and the card's title follows the override.
    fireEvent.click(await screen.findByRole("button", { name: "Rename Show 2019" }));
    fireEvent.change(screen.getByLabelText("New title for Show 2019"), {
      target: { value: "Better Name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const renamed = await screen.findByRole("link", { name: /Better Name/ });
    expect(within(renamed).queryByText("Show 2019")).toBeNull();
    expect(puts).toEqual(["Better Name"]);

    // Clear: the DELETE fires and the chain value returns.
    fireEvent.click(screen.getByRole("button", { name: "Rename Better Name" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByRole("link", { name: /Show 2019/ })).toBeDefined();
    expect(deletes).toBe(1);

    // Invalid submission: whitespace-only → the canonical 400 surfaces
    // inline, exactly once (no auto-retry behind the failure).
    fireEvent.click(screen.getByRole("button", { name: "Rename Show 2019" }));
    fireEvent.change(screen.getByLabelText("New title for Show 2019"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(/bad_request: title is required/)).toBeDefined();
    expect(puts).toEqual(["Better Name", "   "]);
  });
});

describe("Collection — media tiles (media-preview group 2)", () => {
  // stubObjectUrls — jsdom has no createObjectURL/revokeObjectURL; the hook's
  // whole contract is those two calls, so they are observable stubs here.
  function stubObjectUrls(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
    const create = vi.fn(
      (blob: Blob) => `blob:mock-${String(blob.size)}-${String(create.mock.calls.length)}`,
    );
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true, writable: true });
    return { create, revoke };
  }

  function mediaResponse(): Response {
    return new Response("jpeg-bytes", {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });
  }

  // photoDoc — an image document with the media facts (frame-grabber thumb,
  // original absolute_path) the media accessors read.
  function photoDoc(parts: {
    dateTaken?: string;
    width?: number;
    height?: number;
    thumbPath?: string;
    absolutePath?: string;
  }): ItemDocument {
    const d = doc({
      dateTaken: parts.dateTaken,
      width: parts.width,
      height: parts.height,
    });
    if (parts.thumbPath !== undefined) {
      d.sources = {
        ...(d.sources ?? {}),
        "frame-grabber": { thumbnail_path: parts.thumbPath },
      };
    }
    if (parts.absolutePath !== undefined) {
      d.parsed = { absolute_path: parts.absolutePath };
    }
    return d;
  }

  function mediaCalls(spy: ReturnType<typeof fetchWith>): string[] {
    return spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/media"));
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // photosSeam — the URL-dispatched fetch for the photos body over three
  // tiles: p1 carries BOTH facts (→ variant=thumb), p2 only the original (→
  // no variant), p3 NO fact (→ the endpoint is never asked). `media` answers
  // the /media calls.
  function photosSeam(
    media: () => Promise<Response>,
  ): ReturnType<typeof fetchWith> {
    const photos: ItemDTO[] = [
      item(
        "itm_1_p1",
        "image",
        "2026/beach.jpg",
        photoDoc({ dateTaken: "2026-07-04T12:21:05Z", width: 300, height: 200, thumbPath: "/t/p1.jpg", absolutePath: "/lib/1/p1.jpg" }),
      ),
      item("itm_1_p2", "image", "2025/alps.jpg", photoDoc({ absolutePath: "/lib/1/p2.jpg" })),
      item("itm_1_p3", "image", "archive/scan.jpg", doc({})),
    ];
    return fetchWith({}).mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/media")) {
        return media();
      }
      if (url.includes("/api/v1/libraries/1/folders")) {
        return Promise.resolve(jsonResponse(200, { folders: [] }));
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(jsonResponse(200, { library_id: 1, items: 3, updated_at: "" }));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "image", "photos")] }));
      }
      if (url.includes("/api/v1/items")) {
        return Promise.resolve(jsonResponse(200, { items: photos }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it("renders photo tiles through the media fetch — thumb variant when the frame-grabber fact exists, else the original", async () => {
    stubObjectUrls();
    const spy = photosSeam(() => Promise.resolve(mediaResponse()));
    renderCollection("1");

    const beach = await screen.findByRole("link", { name: "Open beach.jpg" });
    await waitFor(() => expect(beach.querySelector("img")).not.toBeNull());
    const alps = screen.getByRole("link", { name: "Open alps.jpg" });
    await waitFor(() => expect(alps.querySelector("img")).not.toBeNull());

    // p1 asked for its thumb; p2 fell back to the original (no variant).
    expect(mediaCalls(spy)).toEqual([
      "/api/v1/items/itm_1_p1/media?variant=thumb",
      "/api/v1/items/itm_1_p2/media",
    ]);

    // p3 has no media fact — no <img>, no media call, placeholder kept.
    const scan = screen.getByRole("link", { name: "Open scan.jpg" });
    expect(scan.querySelector("img")).toBeNull();
    // Capture-date footer unchanged (photo p1 still shows its date part).
    expect(within(beach).getByText("2026-07-04")).toBeDefined();
  });

  it("keeps the placeholder when the media fetch 404s — never a broken-image state", async () => {
    stubObjectUrls();
    const spy = photosSeam(() =>
      Promise.resolve(
        jsonResponse(404, {
          error: { code: "not_found", message: "media file is missing", retryable: false },
        }),
      ),
    );
    renderCollection("1");

    await screen.findByRole("link", { name: "Open beach.jpg" });
    // The fetch was attempted for the fact-bearing tiles…
    await waitFor(() => expect(mediaCalls(spy).length).toBe(2));
    // …but a failed load renders the placeholder, not an <img> and not a
    // broken-image icon.
    for (const link of [
      screen.getByRole("link", { name: "Open beach.jpg" }),
      screen.getByRole("link", { name: "Open alps.jpg" }),
    ]) {
      expect(link.querySelector("img")).toBeNull();
    }
    // The tile is still fully itself: filename + date footer.
    expect(within(screen.getByRole("link", { name: "Open beach.jpg" })).getByText("2026-07-04")).toBeDefined();
  });

  it("renders the movie card's frame-grabber thumb via the media fetch; a card without the fact stays text-only", async () => {
    stubObjectUrls();
    const spy = fetchWith({
      ...headerSeam("tv", 2),
      "/media": () => Promise.resolve(mediaResponse()),
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
                }),
              ),
              item("itm_1_b", "tv", "Movies/plain.mkv", { parsed: {}, sources: { "frame-grabber": { thumbnail_path: "/t/b.jpg" } }, _view: { title: { value: "Plain", source: "tv-parser", reason: "priority" } } }),
            ],
          }),
        ),
    });
    renderCollection("1");

    // The thumb-bearing card fetches ?variant=thumb and renders the img.
    await screen.findByRole("link", { name: /Plain/ });
    await waitFor(() => expect(mediaCalls(spy)).toEqual(["/api/v1/items/itm_1_b/media?variant=thumb"]));
    const withThumb = screen.getByRole("link", { name: /Plain/ });
    await waitFor(() => expect(withThumb.querySelector("img")).not.toBeNull());

    // The card without the fact fires no media request and renders no img.
    const plain = screen.getByRole("link", { name: /The Thing/ });
    expect(plain.querySelector("img")).toBeNull();
  });
});
