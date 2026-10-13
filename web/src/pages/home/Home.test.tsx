// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Home, {
  continueTitle,
  durationSeconds,
  episodeFacts,
  formatPosition,
  matchSeries,
  nextUpEntries,
  seriesDisplayTitle,
  startedSeries,
} from "@/pages/home/Home";
import type { ItemDTO, LibraryDTO, ProgressDTO, SeriesDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";

// Group-4/5 slice: the collections surface's OWN behavior, asserted at the
// fetch seam (the same idiom as Sidebar.test.tsx). The grid (summary data,
// zero-item state, type-chip client-side filter), the Continue row (recency
// order, series-named titles, thumbs, percent bars, Play deep links), the
// shared empty state and the Next up derivation (series-record keyed, D-8 —
// pure core + the episode-without-series fallback) are the load-bearing
// logic here; layout itself is CSS's contract.

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

// doc — an item document with optional tv-parser episode facts, the optional
// serial-scanner series anchor (parsed.series_relative_path — the D-8 match
// key) and an optional ffprobe duration (the verbatim blob stores it as a
// STRING).
function doc(facts: {
  series?: string;
  seriesPath?: string;
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
  if (facts.seriesPath !== undefined) {
    d.parsed = { series_relative_path: facts.seriesPath };
  }
  if (facts.duration !== undefined) {
    d.ffprobe = { format: { duration: String(facts.duration) } };
  }
  if (facts.title !== undefined) {
    d._view = { title: { value: facts.title, source: "tv-parser", reason: "priority" } };
  }
  return d;
}

// thumbDoc — the base document plus the frame-grabber thumbnail fact (the
// exact fact hasFrameGrabberThumb reads before requesting ?variant=thumb).
function thumbDoc(base: ItemDocument): ItemDocument {
  return {
    ...base,
    sources: {
      ...(base.sources ?? {}),
      "frame-grabber": { thumbnail_path: "/t/ep.jpg" },
    },
  };
}

function item(
  id: string,
  libraryId: number,
  document: ItemDocument,
  moduleId = "serial",
): ItemDTO {
  return {
    id,
    module_id: moduleId,
    library_id: libraryId,
    file_id: `file-${id}`,
    relative_path: `Show/${id}.mkv`,
    media_type: moduleId,
    document,
    schema_version: 1,
    status: "ready",
  };
}

// seriesRow — a SeriesDTO fixture: the row a D-8 match resolves an episode's
// parsed.series_relative_path against (the row's relative_path IS the
// anchor). document defaults to the bare serial-record row.
function seriesRow(
  id: string,
  libraryId: number,
  relativePath: string,
  document: ItemDocument = {},
  overrides: Partial<SeriesDTO> = {},
): SeriesDTO {
  return {
    id,
    module_id: "serial",
    library_id: libraryId,
    relative_path: relativePath,
    document,
    schema_version: 1,
    status: "ready",
    ...overrides,
  };
}

function progress(itemId: string, position: number, at: string): ProgressDTO {
  return { item_id: itemId, position_seconds: position, updated_at: at };
}

// stubObjectUrls — jsdom has no createObjectURL/revokeObjectURL; the media
// hook's whole contract is those two calls, so they are observable stubs here
// (shared by every test that renders a thumb preview).
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

  it("names a serial episode <seriesTitle> · SxxEyy from its series row and renders its thumb; keeps badge-only without the thumb fact; films keep viewTitle", async () => {
    stubObjectUrls();
    const spy = fetchWith({
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              progress("itm_2_ep5", 1488, "2026-10-07T18:00:00Z"),
              progress("itm_2_ep6", 500, "2026-10-06T18:00:00Z"),
              progress("itm_1_film", 2712, "2026-10-05T18:00:00Z"),
            ],
          }),
        ),
      "/api/v1/items/itm_2_ep5": () =>
        Promise.resolve(
          jsonResponse(200, {
            item: item(
              "itm_2_ep5",
              2,
              thumbDoc(doc({ seriesPath: "Show", season: 1, episode: 5, duration: 2400 })),
            ),
          }),
        ),
      "/api/v1/items/itm_2_ep6": () =>
        Promise.resolve(
          jsonResponse(200, {
            item: item("itm_2_ep6", 2, doc({ seriesPath: "Show", season: 1, episode: 6 })),
          }),
        ),
      "/api/v1/items/itm_1_film": () =>
        Promise.resolve(
          jsonResponse(200, {
            item: item("itm_1_film", 1, doc({ title: "Some Film" }), "tv"),
          }),
        ),
      "/api/v1/series?library=2": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              seriesRow("ser_2_show", 2, "Show", {
                sources: { "serial-parser": { title: "Very Cold Show" } },
              }),
            ],
          }),
        ),
      "/api/v1/series/ser_2_show/episodes": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
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

    // The serial episodes resolve their series row through
    // parsed.series_relative_path (D-8) and render <seriesTitle> · SxxEyy;
    // the tv-module film keeps viewTitle.
    const ep5 = await within(continueRow).findByRole("link", {
      name: "Play Very Cold Show · S01E05",
    });
    expect(ep5.getAttribute("href")).toBe("/items/itm_2_ep5");
    expect(
      within(continueRow).getByRole("link", { name: "Play Very Cold Show · S01E06" })
        .getAttribute("href"),
    ).toBe("/items/itm_2_ep6");
    expect(
      within(continueRow).getByRole("link", { name: "Play Some Film" }).getAttribute("href"),
    ).toBe("/items/itm_1_film");

    // The thumb renders only where the document carries the fact, through the
    // authenticated thumb fetch — exactly one media request, no fake media
    // for the fact-less episode or the film.
    await waitFor(() => expect(ep5.querySelector("img")).not.toBeNull());
    expect(
      within(continueRow)
        .getByRole("link", { name: "Play Very Cold Show · S01E06" })
        .querySelector("img"),
    ).toBeNull();
    expect(
      within(continueRow).getByRole("link", { name: "Play Some Film" }).querySelector("img"),
    ).toBeNull();
    expect(
      spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/media")),
    ).toEqual(["/api/v1/items/itm_2_ep5/media?variant=thumb"]);
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

  it("derives from series records and their episode lists — series title, SxxEyy chip, episode thumb; films never enter", async () => {
    stubObjectUrls();
    const spy = fetchWith({
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              progress("itm_2_e02", 1488, "2026-10-07T18:00:00Z"),
              progress("itm_1_film", 30, "2026-10-06T18:00:00Z"),
            ],
          }),
        ),
      "/media": () =>
        Promise.resolve(
          new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } }),
        ),
      "/api/v1/items/itm_2_e02": () =>
        Promise.resolve(
          jsonResponse(200, {
            item: item("itm_2_e02", 2, doc({ seriesPath: "Show", season: 1, episode: 2 })),
          }),
        ),
      "/api/v1/items/itm_1_film": () =>
        Promise.resolve(
          jsonResponse(200, { item: item("itm_1_film", 1, doc({ title: "Film One" }), "tv") }),
        ),
      // The (library, series path) → series-row resolution (D-8): the serial
      // row named from parsed.dir_name_raw.
      "/api/v1/series?library=2": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              seriesRow("ser_2_show", 2, "Show", { parsed: { dir_name_raw: "Show" } }),
            ],
          }),
        ),
      // The started series' episode list — deliberately unsorted: E03 wins as
      // the lowest strictly AFTER S01E02.
      "/api/v1/series/ser_2_show/episodes": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("itm_2_e05", 2, doc({ seriesPath: "Show", season: 1, episode: 5 })),
              item("itm_2_e01", 2, doc({ seriesPath: "Show", season: 1, episode: 1 })),
              item("itm_2_e03", 2, thumbDoc(doc({ seriesPath: "Show", season: 1, episode: 3 }))),
            ],
          }),
        ),
      "/api/v1/items?library=1": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/items?library=2": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films"), lib(2, "serial", "serials")] })),
      "/api/v1/libraries/1/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 1, items: 2, updated_at: "" })),
      "/api/v1/libraries/2/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 2, items: 4, updated_at: "" })),
    });
    renderHome();

    const nextUpRow = await screen.findByRole("region", { name: "Next up" });

    // One card: S01E03 — the lowest (season, episode) strictly after the
    // started S01E02 — with the series' display title and the chip.
    const cards = within(nextUpRow).getAllByRole("link");
    expect(cards.length).toBe(1);
    expect(cards[0]!.getAttribute("aria-label")).toBe("Play Show S01E03");
    expect(cards[0]!.getAttribute("href")).toBe("/items/itm_2_e03");
    expect(within(nextUpRow).getByText("Show")).toBeDefined();
    expect(within(nextUpRow).getByText("S01E03")).toBeDefined();

    // The episode's thumb rides the card through the authenticated thumb
    // fetch; the film's series list was never consulted (films never enter —
    // only library 2 is fetched, and only the rendered card's media).
    await waitFor(() => expect(cards[0]!.querySelector("img")).not.toBeNull());
    expect(
      spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/media")),
    ).toEqual(["/api/v1/items/itm_2_e03/media?variant=thumb"]);
    expect(
      spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/series?library=1")),
    ).toEqual([]);
  });

  it("renders the Next up empty state when the series has no later episode", async () => {
    fetchWith({
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [progress("itm_2_e05", 100, "2026-10-07T18:00:00Z")],
          }),
        ),
      "/api/v1/items/itm_2_e05": () =>
        Promise.resolve(
          jsonResponse(200, {
            item: item("itm_2_e05", 2, doc({ seriesPath: "Show", season: 1, episode: 5 })),
          }),
        ),
      "/api/v1/series?library=2": () =>
        Promise.resolve(
          jsonResponse(200, { items: [seriesRow("ser_2_show", 2, "Show")] }),
        ),
      "/api/v1/series/ser_2_show/episodes": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [item("itm_2_e04", 2, doc({ seriesPath: "Show", season: 1, episode: 4 }))],
          }),
        ),
      "/api/v1/items?library=2": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(2, "serial", "serials")] })),
      "/api/v1/libraries/2/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 2, items: 2, updated_at: "" })),
    });
    renderHome();

    await screen.findByText("No upcoming episodes found.");
  });

  it("omits an episode whose series row does not resolve — the honest empty state, no guessed episode list", async () => {
    const spy = fetchWith({
      "/api/v1/progress": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [progress("itm_2_e01", 100, "2026-10-07T18:00:00Z")],
          }),
        ),
      "/api/v1/items/itm_2_e01": () =>
        Promise.resolve(
          jsonResponse(200, {
            item: item("itm_2_e01", 2, doc({ seriesPath: "Ghost", season: 1, episode: 1 })),
          }),
        ),
      // The library's series list carries NO row matching the "Ghost" anchor
      // (the series was never scanned into a row): Next up stays empty rather
      // than guessing an episode list.
      "/api/v1/series?library=2": () =>
        Promise.resolve(
          jsonResponse(200, { items: [seriesRow("ser_2_other", 2, "Other")] }),
        ),
      "/api/v1/items?library=2": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(2, "serial", "serials")] })),
      "/api/v1/libraries/2/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 2, items: 1, updated_at: "" })),
    });
    renderHome();

    await screen.findByText("No upcoming episodes found.");
    // No row → no episode-list fetch for the unresolved anchor.
    expect(
      spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/episodes")),
    ).toEqual([]);
  });
});

describe("Home — Next up derivation (pure core)", () => {
  const SHOW = (libraryId: number, season: number, episode: number): ItemDTO =>
    item(
      `itm_${libraryId}_s${season}e${episode}`,
      libraryId,
      doc({ seriesPath: "Show", season, episode }),
    );

  it("episodeFacts reads parsed.series_relative_path + the parsed season/episode, null without them", () => {
    expect(episodeFacts(SHOW(1, 2, 7))).toEqual({
      libraryId: 1,
      seriesPath: "Show",
      season: 2,
      episode: 7,
    });
    // Season/episode but NO series anchor — omit rather than guess the key.
    expect(episodeFacts(item("itm_x", 1, doc({ season: 1, episode: 2 })))).toBeNull();
    // Anchor but no parseable episode numbers.
    expect(episodeFacts(item("itm_y", 1, doc({ seriesPath: "Show" })))).toBeNull();
    // No facts at all.
    expect(episodeFacts(item("itm_z", 1, doc({ title: "A film" })))).toBeNull();
  });

  it("seriesDisplayTitle precedence: title_override → serial-parser title → dir_name_raw → last path segment", () => {
    const row = seriesRow("ser_1", 1, "Скрытое/Show (2020)");
    // Neither fact scanned → the relative path's last segment, honest.
    expect(seriesDisplayTitle(row)).toBe("Show (2020)");
    // The raw directory name beats the path; Cyrillic passes through verbatim.
    expect(
      seriesDisplayTitle({ ...row, document: { parsed: { dir_name_raw: "Скрытое" } } }),
    ).toBe("Скрытое");
    // The serial-parser's cleaned title beats the raw name.
    expect(
      seriesDisplayTitle({
        ...row,
        document: {
          parsed: { dir_name_raw: "Скрытое" },
          sources: { "serial-parser": { title: "Hidden" } },
        },
      }),
    ).toBe("Hidden");
    // The operator's override beats every document fact.
    expect(
      seriesDisplayTitle({
        ...row,
        title_override: "Operator Name",
        document: { sources: { "serial-parser": { title: "Hidden" } } },
      }),
    ).toBe("Operator Name");
    // "" is unset — the chain continues.
    expect(seriesDisplayTitle({ ...row, title_override: "", document: {} })).toBe(
      "Show (2020)",
    );
  });

  it("matchSeries resolves by relative_path, skips deleted rows, null when nothing matches", () => {
    const rows = [
      seriesRow("ser_1", 1, "Show"),
      seriesRow("ser_2", 1, "Other", {}, { status: "deleted" }),
    ];
    expect(matchSeries(rows, "Show")?.id).toBe("ser_1");
    expect(matchSeries(rows, "Other")).toBeNull(); // tombstone never matches
    expect(matchSeries(rows, "Ghost")).toBeNull();
  });

  it("startedSeries keeps the highest started episode per (library, series path); films and fact-less items are skipped", () => {
    const progressList = [
      progress("itm_1_s1e3", 10, "2026-10-07T18:00:00Z"),
      progress("itm_1_s1e1", 10, "2026-10-06T18:00:00Z"),
      progress("itm_2_s2e1", 10, "2026-10-05T18:00:00Z"),
      progress("itm_1_nofacts", 10, "2026-10-04T18:00:00Z"),
      progress("itm_1_film", 10, "2026-10-03T18:00:00Z"),
    ];
    const itemById = new Map<string, ItemDTO>([
      ["itm_1_s1e3", SHOW(1, 1, 3)],
      ["itm_1_s1e1", SHOW(1, 1, 1)],
      ["itm_2_s2e1", SHOW(2, 2, 1)],
      ["itm_1_nofacts", item("itm_1_nofacts", 1, doc({ title: "plain" }))],
      // A tv-module film that somehow carries episode facts still never
      // enters Next up — Next up is an episode concept (D-8).
      [
        "itm_1_film",
        item("itm_1_film", 1, doc({ seriesPath: "Show", season: 1, episode: 9 }), "tv"),
      ],
    ]);

    const started = startedSeries(progressList, itemById);
    expect(started).toEqual([
      { libraryId: 1, seriesPath: "Show", season: 1, episode: 3 },
      { libraryId: 2, seriesPath: "Show", season: 2, episode: 1 },
    ]);
  });

  it("nextUpEntries picks the lowest strictly-after episode from the series' list; unresolved and exhausted series are omitted", () => {
    const started: Parameters<typeof nextUpEntries>[0] = [
      { libraryId: 1, seriesPath: "Show", season: 1, episode: 3 },
      { libraryId: 2, seriesPath: "Other", season: 2, episode: 9 }, // exhausted
      { libraryId: 3, seriesPath: "Ghost", season: 1, episode: 1 }, // no series row
    ];
    const seriesByKey = new Map<string, SeriesDTO>([
      ["1|Show", seriesRow("ser_1_show", 1, "Show")],
      ["2|Other", seriesRow("ser_2_other", 2, "Other")],
    ]);
    const episodesBySeriesId = new Map<string, ItemDTO[]>([
      [
        "ser_1_show",
        [
          SHOW(1, 1, 1),
          SHOW(1, 1, 5),
          SHOW(1, 1, 4),
          SHOW(1, 2, 1),
          SHOW(1, 1, 3), // the started episode itself — never suggested
        ],
      ],
      ["ser_2_other", [SHOW(2, 2, 9)]], // nothing after → omitted
    ]);

    const next = nextUpEntries(started, seriesByKey, episodesBySeriesId);
    expect(next.length).toBe(1);
    expect(next[0]!.label).toBe("S01E04");
    expect(next[0]!.item.id).toBe("itm_1_s1e4");
    expect(next[0]!.seriesId).toBe("ser_1_show");
    expect(next[0]!.title).toBe("Show");
  });

  it("continueTitle renders <seriesTitle> · SxxEyy when the row resolves; films and unresolved rows keep viewTitle", () => {
    const ep = item(
      "itm_2_s1e5",
      2,
      doc({ seriesPath: "Show", season: 1, episode: 5, title: "Show S01E05" }),
    );
    const series = seriesRow("ser_2_show", 2, "Show");
    expect(continueTitle(ep, series)).toBe("Show · S01E05");
    // Unresolved row → viewTitle (the honest fallback).
    expect(continueTitle(ep, null)).toBe("Show S01E05");
    // A tv-module film keeps viewTitle even with a resolved row.
    const film = item(
      "itm_1_f",
      1,
      doc({ title: "Film", seriesPath: "Show", season: 1, episode: 2 }),
      "tv",
    );
    expect(continueTitle(film, series)).toBe("Film");
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
