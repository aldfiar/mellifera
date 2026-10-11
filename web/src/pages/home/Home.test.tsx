// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Home, {
  durationSeconds,
  episodeFacts,
  formatPosition,
  nextUpEntries,
  startedSeries,
} from "@/pages/home/Home";
import type { ItemDTO, LibraryDTO, ProgressDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";

// Group-4 slice: the collections surface's OWN behavior, asserted at the
// fetch seam (the same idiom as Sidebar.test.tsx). The grid (summary data,
// zero-item state, type-chip client-side filter), the Continue row (recency
// order, percent bars, Play deep links), the shared empty state and the
// Next up derivation (pure core + the no-parseable-facts fallback) are the
// load-bearing logic here; layout itself is CSS's contract.

// NOTE on fixtures: pages/home must never carry a filesystem-path literal
// (D5 — the group probe greps for it), so the fixtures omit the library
// DTO's one path field and fill it by assertion in this test seam only.
function lib(
  id: number,
  moduleId: string,
  name: string,
  description = "",
): LibraryDTO {
  return { id, module_id: moduleId, display_name: name, description } as LibraryDTO;
}

function viewTitleDoc(title: string): ItemDocument {
  return {
    _view: { title: { value: title, source: "tv-parser", reason: "priority" } },
  };
}

// doc — an item document with optional tv-parser episode facts and an
// optional ffprobe duration (the verbatim blob stores it as a STRING).
function doc(facts: {
  series?: string;
  season?: number;
  episode?: number;
  duration?: number;
  title?: string;
}): ItemDocument {
  const d: ItemDocument = {};
  const source: Record<string, unknown> = {};
  if (facts.series !== undefined) source.title = facts.series;
  if (facts.season !== undefined) source.season = facts.season;
  if (facts.episode !== undefined) source.episode = facts.episode;
  if (Object.keys(source).length > 0) {
    d.sources = { "tv-parser": source };
  }
  if (facts.duration !== undefined) {
    d.ffprobe = { format: { duration: String(facts.duration) } };
  }
  if (facts.title !== undefined) {
    d._view = { title: { value: facts.title, source: "tv-parser", reason: "priority" } };
  }
  return d;
}

function item(id: string, libraryId: number, document: ItemDocument): ItemDTO {
  return {
    id,
    module_id: "serial",
    library_id: libraryId,
    file_id: `file-${id}`,
    relative_path: `Show/${id}.mkv`,
    media_type: "serial",
    document,
    schema_version: 1,
    status: "ready",
  };
}

function progress(itemId: string, position: number, at: string): ProgressDTO {
  return { item_id: itemId, position_seconds: position, updated_at: at };
}

// fetchWith — a URL-dispatched fetch mock (verbatim from Sidebar.test.tsx):
// handlers maps a URL substring to the response factory; earlier entries win.
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

function renderHome(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The three-collection fixture shared by the grid tests.
const LIBRARIES_BODY = {
  items: [
    lib(1, "tv", "films", "Feature films and documentaries."),
    lib(2, "serial", "serials"),
    lib(3, "image", "photos"),
  ],
};

const SUMMARIES: Record<string, unknown> = {
  "/api/v1/libraries/1/summary": {
    library_id: 1,
    items: 214,
    updated_at: "2026-09-20T10:00:00Z",
  },
  "/api/v1/libraries/2/summary": { library_id: 2, items: 37, updated_at: "" },
  "/api/v1/libraries/3/summary": { library_id: 3, items: 0, updated_at: "" },
};

function gridFetch(): Record<string, () => Promise<Response>> {
  return {
    "/api/v1/progress": () => Promise.resolve(jsonResponse(200, { items: [] })),
    // The cards' representative-item scan (media-preview D8): empty pages —
    // the grid tests assert the badge/summary layout, whose fallback is the
    // badge-only card.
    "/api/v1/items?library=": () =>
      Promise.resolve(jsonResponse(200, { items: [] })),
    ...Object.fromEntries(
      Object.entries(SUMMARIES).map(([k, v]) => [
        k,
        () => Promise.resolve(jsonResponse(200, v)),
      ]),
    ),
    "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, LIBRARIES_BODY)),
  };
}

describe("Home — collections grid", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders cards with type badge, description, count and updated date; zero items → explicit empty card", async () => {
    fetchWith(gridFetch());
    renderHome();

    // Badge + name + description (scoped to the card — the filter chips
    // carry the same human labels).
    const filmsCard = await screen.findByRole("link", { name: /films/ });
    expect(within(filmsCard).getByText("Movies")).toBeDefined();
    expect(within(filmsCard).getByText("Feature films and documentaries.")).toBeDefined();
    // serials has NO description — the card renders without one, no crash.
    const serialsCard = screen.getByRole("link", { name: /serials/ });
    expect(within(serialsCard).getByText("Serials")).toBeDefined();
    expect(within(serialsCard).queryByText("Feature films")).toBeNull();
    // Count + updated stamp from the summary; "" updated_at renders count only.
    expect(await screen.findByText("214 items · updated 2026-09-20")).toBeDefined();
    expect(await screen.findByText("37 items")).toBeDefined();
    // Zero-item collection: the explicit "not scanned yet" card state.
    expect(await screen.findByText("Not scanned yet")).toBeDefined();
  });

  it("filters the grid client-side from the type chips and back via All", async () => {
    fetchWith(gridFetch());
    renderHome();

    expect(await screen.findByText("films")).toBeDefined();
    expect(screen.getByText("serials")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Movies" }));
    expect(screen.getByText("films")).toBeDefined();
    expect(screen.queryByText("serials")).toBeNull();
    expect(screen.queryByText("photos")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("films")).toBeDefined();
    expect(screen.getByText("serials")).toBeDefined();
    expect(screen.getByText("photos")).toBeDefined();
  });
});

describe("Home — Continue row", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders records in server (newest-first) order with percent bars and Play deep links", async () => {
    const ITEM_C = item("itm_1_c", 1, doc({ title: "The Thing", duration: 6000 }));
    const ITEM_A = item(
      "itm_1_a",
      1,
      doc({ series: "Show", season: 1, episode: 2, duration: 2400, title: "Show S01E02" }),
    );
    const ITEM_B = item("itm_2_b", 2, doc({ title: "Film B" })); // no duration

    fetchWith({
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              progress("itm_1_c", 2000, "2026-10-07T18:00:00Z"),
              progress("itm_1_a", 1488, "2026-10-06T18:00:00Z"),
              progress("itm_2_b", 2712, "2026-10-05T18:00:00Z"),
            ],
          }),
        ),
      "/api/v1/items/itm_1_c": () =>
        Promise.resolve(jsonResponse(200, { item: ITEM_C })),
      "/api/v1/items/itm_1_a": () =>
        Promise.resolve(jsonResponse(200, { item: ITEM_A })),
      "/api/v1/items/itm_2_b": () =>
        Promise.resolve(jsonResponse(200, { item: ITEM_B })),
      "/api/v1/items?library=1": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/items?library=2": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films"), lib(2, "serial", "serials")] })),
      "/api/v1/libraries/1/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 1, items: 2, updated_at: "" })),
      "/api/v1/libraries/2/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 2, items: 2, updated_at: "" })),
    });
    renderHome();

    const continueRow = await screen.findByRole("region", { name: "Continue" });

    // EXACTLY the progress records, in the server's newest-first order.
    const links = within(continueRow)
      .getAllByRole("link")
      .map((l) => l.getAttribute("aria-label"));
    expect(links).toEqual(["Play The Thing", "Play Show S01E02", "Play Film B"]);

    // Play deep-links into the item detail (no inline streaming).
    expect(
      within(continueRow).getByRole("link", { name: "Play The Thing" }).getAttribute("href"),
    ).toBe("/items/itm_1_c");
    expect(
      within(continueRow).getByRole("link", { name: "Play Show S01E02" }).getAttribute("href"),
    ).toBe("/items/itm_1_a");

    // Percent bars render only where a duration is known (33% and 62%).
    expect(screen.getByRole("img", { name: "33% watched" })).toBeDefined();
    expect(screen.getByRole("img", { name: "62% watched" })).toBeDefined();
    expect(within(continueRow).getAllByRole("img").length).toBe(2);
    // No duration → position label only (45:12), never a fake bar.
    expect(await within(continueRow).findByText(/45:12/)).toBeDefined();
  });

  it("renders the shared empty state in both rows when the progress list is empty", async () => {
    fetchWith(gridFetch());
    renderHome();

    await screen.findByText("films");
    const empties = await screen.findAllByText(/Nothing in progress yet/);
    expect(empties.length).toBe(2); // Continue + Next up share one empty state
    expect(screen.queryByRole("region", { name: "Continue" })).toBeNull();
  });
});

describe("Home — Next up row", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers the lowest-numbered episode after the highest started one and omits series without parseable facts", async () => {
    const STARTED = item(
      "itm_1_a",
      1,
      doc({ series: "Show", season: 1, episode: 2, title: "Show S01E02" }),
    );
    const E01 = item("itm_1_e01", 1, doc({ series: "Show", season: 1, episode: 1, title: "Show S01E01" }));
    const E03 = item("itm_1_e03", 1, doc({ series: "Show", season: 1, episode: 3, title: "Show S01E03" }));
    const E05 = item("itm_1_e05", 1, doc({ series: "Show", season: 1, episode: 5, title: "Show S01E05" }));
    const NO_FACTS = item("itm_2_z", 2, doc({ title: "Just a film" }));

    fetchWith({
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              progress("itm_1_a", 1488, "2026-10-07T18:00:00Z"),
              progress("itm_2_z", 30, "2026-10-06T18:00:00Z"),
            ],
          }),
        ),
      "/api/v1/items/itm_1_a": () => Promise.resolve(jsonResponse(200, { item: STARTED })),
      "/api/v1/items/itm_2_z": () => Promise.resolve(jsonResponse(200, { item: NO_FACTS })),
      "/api/v1/items?library=1": () =>
        Promise.resolve(jsonResponse(200, { items: [E05, E01, E03] })),
      "/api/v1/items?library=2": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(1, "serial", "serials"), lib(2, "tv", "films")] })),
      "/api/v1/libraries/1/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 1, items: 4, updated_at: "" })),
      "/api/v1/libraries/2/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 2, items: 1, updated_at: "" })),
    });
    renderHome();

    const nextUpRow = await screen.findByRole("region", { name: "Next up" });

    // S01E03 — the lowest episode strictly AFTER the started S01E02 (E01 and
    // E05 are skipped as behind/ahead-of-need). One card: the fact-less
    // series is omitted, not guessed.
    const cards = within(nextUpRow).getAllByRole("link");
    expect(cards.length).toBe(1);
    expect(cards[0]!.getAttribute("aria-label")).toBe("Play Show S01E03");
    expect(cards[0]!.getAttribute("href")).toBe("/items/itm_1_e03");
    expect(within(nextUpRow).getByText("S01E03")).toBeDefined();
  });

  it("renders the Next up empty state when no later episode exists", async () => {
    const STARTED = item(
      "itm_1_a",
      1,
      doc({ series: "Show", season: 1, episode: 5, title: "Show S01E05" }),
    );
    const E04 = item("itm_1_e04", 1, doc({ series: "Show", season: 1, episode: 4, title: "Show S01E04" }));

    fetchWith({
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, { items: [progress("itm_1_a", 100, "2026-10-07T18:00:00Z")] }),
        ),
      "/api/v1/items/itm_1_a": () => Promise.resolve(jsonResponse(200, { item: STARTED })),
      "/api/v1/items?library=1": () =>
        Promise.resolve(jsonResponse(200, { items: [E04] })),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(1, "serial", "serials")] })),
      "/api/v1/libraries/1/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 1, items: 2, updated_at: "" })),
    });
    renderHome();

    await screen.findByText("No upcoming episodes found.");
  });
});

describe("Home — Next up derivation (pure core)", () => {
  const SHOW = (libraryId: number, season: number, episode: number): ItemDTO =>
    item(
      `itm_${libraryId}_s${season}e${episode}`,
      libraryId,
      doc({ series: "Show", season, episode }),
    );

  it("episodeFacts reads the parsed season/episode + series title, null without them", () => {
    expect(episodeFacts(SHOW(1, 2, 7))).toEqual({
      libraryId: 1,
      seriesKey: "Show",
      season: 2,
      episode: 7,
    });
    // No sources at all.
    expect(episodeFacts(item("itm_x", 1, doc({ title: "A film" })))).toBeNull();
    // Episode facts but NO series title — omit rather than guess the key.
    const noTitle = item("itm_y", 1, doc({ season: 1, episode: 2 }));
    expect(episodeFacts(noTitle)).toBeNull();
  });

  it("startedSeries keeps the highest started episode per (library, series) in recency order", () => {
    const progressList = [
      progress("itm_1_s1e3", 10, "2026-10-07T18:00:00Z"),
      progress("itm_1_s1e1", 10, "2026-10-06T18:00:00Z"),
      progress("itm_2_s2e1", 10, "2026-10-05T18:00:00Z"),
      progress("itm_1_nofacts", 10, "2026-10-04T18:00:00Z"),
    ];
    const itemById = new Map<string, ItemDTO>([
      ["itm_1_s1e3", SHOW(1, 1, 3)],
      ["itm_1_s1e1", SHOW(1, 1, 1)],
      ["itm_2_s2e1", SHOW(2, 2, 1)],
      ["itm_1_nofacts", item("itm_1_nofacts", 1, doc({ title: "plain" }))],
    ]);

    const started = startedSeries(progressList, itemById);
    expect(started).toEqual([
      { libraryId: 1, seriesKey: "Show", season: 1, episode: 3 },
      { libraryId: 2, seriesKey: "Show", season: 2, episode: 1 },
    ]);
  });

  it("nextUpEntries picks the lowest episode after the started one, per series, omitting exhausted ones", () => {
    const started = [
      { libraryId: 1, seriesKey: "Show", season: 1, episode: 3 },
      { libraryId: 2, seriesKey: "Other", season: 2, episode: 9 },
    ];
    const collectionItems = [
      SHOW(1, 1, 1),
      SHOW(1, 1, 5),
      SHOW(1, 1, 4),
      SHOW(1, 2, 1),
      SHOW(1, 1, 3), // the started episode itself — never suggested
      SHOW(2, 2, 9), // exhausted series: nothing after → omitted
    ];

    const next = nextUpEntries(started, collectionItems);
    expect(next.length).toBe(1);
    expect(next[0]!.label).toBe("S01E04");
    expect(next[0]!.item.id).toBe("itm_1_s1e4");
  });

  it("durationSeconds parses the ffprobe blob's duration; anything else is null", () => {
    expect(durationSeconds(doc({ duration: 3725 }))).toBe(3725);
    expect(durationSeconds(viewTitleDoc("no probe"))).toBeNull();
    expect(durationSeconds({ ffprobe: { format: { duration: "not-a-number" } } })).toBeNull();
  });

  it("formatPosition renders whole seconds as MM:SS / H:MM:SS", () => {
    expect(formatPosition(0)).toBe("00:00");
    expect(formatPosition(89)).toBe("01:29");
    expect(formatPosition(3725)).toBe("1:02:05");
  });
});

describe("Home — collection card previews (media-preview group 2)", () => {
  // stubObjectUrls — jsdom has no createObjectURL/revokeObjectURL; the hook's
  // whole contract is those two calls, so they are observable stubs here.
  function stubObjectUrls(): void {
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn((blob: Blob) => `blob:mock-${String(blob.size)}`),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("previews a representative item's media; keeps badge-only when nothing resolves; zero-item card has no preview area", async () => {
    stubObjectUrls();
    const spy = fetchWith({
      "/api/v1/progress": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/media": () =>
        Promise.resolve(
          new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } }),
        ),
      // films: a fact-less item first, then a frame-grabber item — the
      // representative is the FIRST item whose media can resolve (itm_1_b).
      "/api/v1/items?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("itm_1_a", 1, viewTitleDoc("Factless")),
              item("itm_1_b", 1, {
                sources: { "frame-grabber": { thumbnail_path: "/t/b.jpg" } },
              }),
            ],
          }),
        ),
      // serials: items exist but none carries a resolvable media fact.
      "/api/v1/items?library=2": () =>
        Promise.resolve(
          jsonResponse(200, { items: [item("itm_2_a", 2, viewTitleDoc("No Facts"))] }),
        ),
      // photos: zero items.
      "/api/v1/items?library=3": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      ...Object.fromEntries(
        Object.entries(SUMMARIES).map(([k, v]) => [
          k,
          () => Promise.resolve(jsonResponse(200, v)),
        ]),
      ),
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, LIBRARIES_BODY)),
    });
    renderHome();

    // films: the preview area appears once the representative's media has
    // actually loaded — and it asked for the thumb variant of itm_1_b only.
    const films = await screen.findByRole("link", { name: /films/ });
    await waitFor(() => expect(films.querySelector("img")).not.toBeNull());
    expect(
      spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/media")),
    ).toEqual(["/api/v1/items/itm_1_b/media?variant=thumb"]);
    // The badge row still renders under the preview.
    expect(within(films).getByText("Movies")).toBeDefined();

    // serials: items but no resolvable media — the badge-only card, no img,
    // no media request.
    const serials = screen.getByRole("link", { name: /serials/ });
    expect(serials.querySelector("img")).toBeNull();

    // photos: zero items — the explicit "not scanned yet" card, no preview.
    const photos = screen.getByRole("link", { name: /photos/ });
    expect(photos.textContent).toContain("Not scanned yet");
    expect(photos.querySelector("img")).toBeNull();
  });

  it("keeps the badge-only card when the representative item's media fetch fails", async () => {
    stubObjectUrls();
    fetchWith({
      "/api/v1/progress": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/media": () =>
        Promise.resolve(
          jsonResponse(404, {
            error: { code: "not_found", message: "media file is missing", retryable: false },
          }),
        ),
      "/api/v1/items?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("itm_1_b", 1, {
                sources: { "frame-grabber": { thumbnail_path: "/t/b.jpg" } },
              }),
            ],
          }),
        ),
      "/api/v1/items?library=2": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/items?library=3": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      ...Object.fromEntries(
        Object.entries(SUMMARIES).map(([k, v]) => [
          k,
          () => Promise.resolve(jsonResponse(200, v)),
        ]),
      ),
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, LIBRARIES_BODY)),
    });
    renderHome();

    // The preview is attempted (a fact exists) but the 404 sends the card
    // back to its badge-only layout — never a broken-image state.
    await screen.findByRole("link", { name: /films/ });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /films/ }).querySelector("img")).toBeNull(),
    );
    expect(within(screen.getByRole("link", { name: /films/ })).getByText("Movies")).toBeDefined();
    expect(within(screen.getByRole("link", { name: /films/ })).getByText("214 items · updated 2026-09-20")).toBeDefined();
  });
});
