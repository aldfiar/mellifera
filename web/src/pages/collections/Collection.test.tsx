// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Collection, {
  captureDate,
  parsedChips,
} from "@/pages/collections/Collection";
import type {
  ItemDTO,
  LibraryDTO,
  ModulePresentation,
  ParserBinding,
  SeriesDTO,
} from "@/lib/api";
import type { ItemDocument } from "@/lib/document";
import { queryClient as sharedQueryClient } from "@/lib/queries";

// Group-5 slice (boxes 5.1–5.4) + ui-management pass 1: the collection page's
// OWN behavior, asserted at the fetch seam (the same idiom as Home.test.tsx).
// Covered here: the tv body's muted meta line + served-title floor, the
// photos body's folder-chip client-side filter round-trip and masonry
// date-footers (present and honestly absent), the serial body's series grid
// (title precedence, the episode-flow round-trip hitting the episodes
// endpoint once) with its empty and error states, and the INV-no-filenames
// surface rules (no raw filename anywhere; floors per surface). Layout itself
// is CSS's contract.
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
  displayName?: string,
): ItemDTO {
  return {
    id,
    module_id: moduleId,
    library_id: 1,
    file_id: `file-${id}`,
    relative_path: relativePath,
    media_type: moduleId, // image → "image", tv → "tv", serial → "serial"
    document,
    schema_version: 1,
    status: "ready",
    ...(displayName !== undefined ? { display_name: displayName } : {}),
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

function renderCollection(
  id: string,
  client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
): ReturnType<typeof render> {
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
  it("parsedChips reads year and resolution from the source namespaces — never the SxxExx token", () => {
    expect(
      parsedChips(doc({ season: 1, episode: 2, year: 2019, resolution: "1080p" })),
    ).toEqual(["2019", "1080p"]);
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

  it("renders the served title and ONE muted meta line, deep-linking into the item — never the raw filename or an SxxExx chip", async () => {
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
                "The Thing",
              ),
            ],
          }),
        ),
    });
    renderCollection("1");

    const card = await screen.findByRole("link", { name: /The Thing/ });
    expect(card.getAttribute("href")).toBe("/items/itm_1_a");
    // The meta line: the parsed facts, dot-separated — no pill chips.
    expect(within(card).getByText("2019 · 1080p")).toBeDefined();
    // The SxxExx token is gone (it duplicated the served name's own suffix).
    expect(within(card).queryByText("S01E02")).toBeNull();
    // INV-no-filenames: the raw filename never renders.
    expect(within(card).queryByText("The Thing 2019 1080p.mkv")).toBeNull();
    expect(within(card).queryByText(/\.mkv/)).toBeNull();
    // No duration fact on this document → no duration segment.
    expect(within(card).queryByText(/^1:\d{2}:\d{2}$|^\d{2}:\d{2}$/)).toBeNull();
    // Identified row → no "Not identified" marker.
    expect(within(card).queryByText("Not identified")).toBeNull();
  });

  it("pages with limit/offset: Next enabled on a full page, Previous returns", async () => {
    const page = (offset: number, count: number): { items: ItemDTO[] } => ({
      items: Array.from({ length: count }, (_, i) =>
        item(
          `itm_1_${offset + i}`,
          "tv",
          `Movies/film_${offset + i}.mkv`,
          doc({ title: `Film ${offset + i}` }),
          `Film ${offset + i}`,
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
    expect(await screen.findByRole("link", { name: "Open beach" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Open alps" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Open scan" })).toBeDefined();

    // Pick the 2026 folder → only its tile remains (client-side prefix filter).
    fireEvent.click(screen.getByRole("button", { name: /2026/ }));
    expect(screen.getByRole("link", { name: "Open beach" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Open alps" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open scan" })).toBeNull();

    // All resets the filter.
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByRole("link", { name: "Open alps" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Open scan" })).toBeDefined();
  });

  it("renders capture-date footers from date_taken and omits them when the document has none", async () => {
    fetchWith(photoSeam());
    renderCollection("1");

    // RFC3339 stamps show their date part; every dated tile shows its own.
    const beach = await screen.findByRole("link", { name: "Open beach" });
    expect(within(beach).getByText("2026-07-04")).toBeDefined();
    const alps = screen.getByRole("link", { name: "Open alps" });
    expect(within(alps).getByText("2025-05-10")).toBeDefined();
    // INV-no-filenames: the raw filename never renders in a footer.
    expect(within(beach).queryByText("beach.jpg")).toBeNull();
    // No date fact → NO footer at all (the filename that used to anchor it is
    // gone), never a fake date.
    const scan = screen.getByRole("link", { name: "Open scan" });
    expect(within(scan).queryByText(/^\d{4}-\d{2}-\d{2}/)).toBeNull();
    expect(scan.querySelector("footer")).toBeNull();
  });
});

describe("Collection — serial body (box 5.4)", () => {
  // seriesRow — a /series wire row fixture. The serial-level document is
  // opaque dynamic JSON: `parsed` facts (dir_name_raw, backing) plus the
  // sources.<plugin_id> namespaces serial-parser writes into. displayName is
  // the SERVED display_name the card must render verbatim.
  function seriesRow(parts: {
    id: string;
    title?: string; // serial-parser's cleaned display title
    dirNameRaw?: string; // parsed.dir_name_raw — the raw directory name
    season?: number;
    backing?: string;
    status?: string;
    relativePath?: string;
    displayName?: string;
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
      ...(parts.displayName !== undefined ? { display_name: parts.displayName } : {}),
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders one card per series with the SERVED display_name (document facts never leak), the season chip only, skipping deleted rows", async () => {
    fetchWith({
      ...headerSeam("serial", 3),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              seriesRow({
                id: "ser_1_enriched",
                title: "Parser Name Decoy",
                dirNameRaw: "smolwood.s01",
                season: 1,
                displayName: "Тайна Смолвуда",
              }),
              seriesRow({
                id: "ser_1_raw",
                dirNameRaw: "Очень Странные Дела",
                displayName: "Очень Странные Дела",
              }),
              seriesRow({
                id: "ser_1_stray",
                displayName: "Stray File",
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

    // The served name wins verbatim; the row's document facts (parser title,
    // dir_name_raw) never leak into the card.
    const enriched = await screen.findByRole("link", { name: /Тайна Смолвуда/ });
    expect(within(enriched).queryByText("Parser Name Decoy")).toBeNull();
    expect(within(enriched).queryByText("smolwood.s01")).toBeNull();
    expect(within(enriched).getByText("Season 1")).toBeDefined();

    // The raw-named row renders its served name, verbatim (Cyrillic intact).
    expect(screen.getByRole("link", { name: /Очень Странные Дела/ })).toBeDefined();

    // File-backed stray: its served name renders verbatim; the "file" chip is
    // OFF the card (the backing fact re-lands as the menu footer) and the
    // lifecycle status pill is off every card.
    const stray = screen.getByRole("link", { name: /Stray File/ });
    expect(within(stray).queryByText("file")).toBeNull();
    expect(within(stray).queryByText("stale")).toBeNull();

    // Deleted rows are not a browse surface — no card at all.
    expect(screen.queryByRole("link", { name: /gone/ })).toBeNull();

    // Ready status renders no chip on the default cards either.
    expect(within(enriched).queryByText("ready")).toBeNull();
  });

  it("navigates a card into the episode flow, fetching the episodes endpoint exactly once", async () => {
    let episodesFetches = 0;
    fetchWith({
      ...headerSeam("serial", 1),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              // The SERVED name rides on the row (display-naming) — the card
              // renders it verbatim; dir_name_raw never leaks.
              seriesRow({ id: "ser_1_show", dirNameRaw: "Show 2019", displayName: "Show 2019" }),
            ],
          }),
        ),
      "/api/v1/series/ser_1_show/episodes": () => {
        episodesFetches += 1;
        const ep1 = item(
          "itm_1_e1",
          "serial",
          "Show 2019/S01E01.mkv",
          doc({ season: 1, episode: 1 }),
        );
        // The SERVED composed name (display-naming) rides on the episode row.
        ep1.display_name = "Show 2019 · S01E01";
        return Promise.resolve(
          jsonResponse(200, { items: [ep1] }),
        );
      },
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("link", { name: /Show 2019/ }));

    // The episode card reuses the movie idiom: the served composed name, the
    // muted meta line, deep-linking into /items/{id} — no filename, no
    // SxxExx chip.
    const ep = await screen.findByRole("link", { name: /Show 2019 · S01E01/ });
    expect(ep.getAttribute("href")).toBe("/items/itm_1_e1");
    expect(within(ep).queryByText("S01E01")).toBeNull();
    expect(within(ep).queryByText("S01E01.mkv")).toBeNull();
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

describe("Collection — served display_name (display-naming group 4)", () => {
  // srow — a /series wire row fixture for the naming cases: parser
  // namespace, parsed.dir_name_raw, the stored title_override ("" when
  // unset) and the SERVED display_name are all independently controllable.
  function srow(parts: {
    id: string;
    title?: string;
    dirNameRaw?: string;
    titleOverride?: string;
    displayName?: string;
    backing?: string;
  }): SeriesDTO {
    const d: ItemDocument = {};
    if (parts.title !== undefined) {
      d.sources = { "serial-parser": { title: parts.title } };
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
      relative_path: parts.dirNameRaw ?? parts.id,
      document: d,
      schema_version: 1,
      status: "ready",
      title_override: parts.titleOverride ?? "",
      ...(parts.displayName !== undefined ? { display_name: parts.displayName } : {}),
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("series cards render the SERVED display_name verbatim — override tier included, document facts never leak; a file-backed floor renders the stem, a dir-backed composed name is never flagged", async () => {
    fetchWith({
      ...headerSeam("serial", 4),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              srow({
                id: "ser_1_ovr",
                title: "Parser Decoy",
                dirNameRaw: "dir.raw",
                titleOverride: "Operator's Name",
                displayName: "Operator's Name",
              }),
              srow({ id: "ser_1_par", title: "Parser Decoy 2", displayName: "Only Served" }),
              srow({
                id: "ser_1_raw",
                dirNameRaw: "Сырое Имя",
                displayName: "",
                backing: "file",
              }),
              // Directory-backed composed name: the served name IS the
              // directory's own name — the filename floor must NOT fire
              // ("Show.S01" must never corrupt into "Show").
              srow({
                id: "ser_1_dir",
                dirNameRaw: "Show.S01",
                displayName: "Show.S01",
              }),
            ],
          }),
        ),
    });
    renderCollection("1");

    // The served name wins verbatim — for the overridden row it IS the
    // override; neither document fact leaks.
    const ovr = await screen.findByRole("link", { name: /Operator's Name/ });
    expect(within(ovr).queryByText("Parser Decoy")).toBeNull();
    expect(within(ovr).queryByText("dir.raw")).toBeNull();
    // A served composed name renders verbatim, not the row's parser title.
    expect(screen.getByRole("link", { name: /Only Served/ })).toBeDefined();
    expect(screen.queryByRole("link", { name: /Parser Decoy 2/ })).toBeNull();
    // File-backed floor: the served name is its own filename → the
    // extension-less STEM renders, silently (series never wear the "Not
    // identified" marker — no Identify on series).
    const raw = screen.getByRole("link", { name: /Сырое Имя/ });
    expect(within(raw).getByText("Сырое Имя")).toBeDefined();
    expect(within(raw).queryByText("Not identified")).toBeNull();
    expect(within(raw).queryByText("file")).toBeNull();
    // Dir-backed composed name: verbatim, never stemmed, never flagged.
    const dir = screen.getByRole("link", { name: "Open Show.S01" });
    expect(within(dir).getByText("Show.S01")).toBeDefined();
    expect(within(dir).queryByText("Not identified")).toBeNull();
    // Rename moved behind the card menu: no always-visible Rename button;
    // the ⋯ trigger's label follows the floored title.
    expect(screen.queryByRole("button", { name: /^Rename/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Actions for Сырое Имя$/ }).length).toBe(1);
  });

  it("episode rows render the SERVED display_name verbatim — override tier included; floor-empty floors to the stem with the marker", async () => {
    const overridden = item(
      "itm_1_e0",
      "serial",
      "Show 2019/S01E00.mkv",
      doc({ season: 1, episode: 0 }),
    );
    overridden.title_override = "Renamed Episode";
    overridden.display_name = "Renamed Episode";
    const composed = item(
      "itm_1_e1",
      "serial",
      "Show 2019/S01E01.mkv",
      doc({ title: "View Decoy", season: 1, episode: 1 }),
    );
    composed.display_name = "Show 2019 · S01E01";
    const nameless = item("itm_1_e2", "serial", "Show 2019/S01E02.mkv", doc({}));

    fetchWith({
      ...headerSeam("serial", 1),
      "/api/v1/series?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              srow({ id: "ser_1_show", dirNameRaw: "Show 2019", displayName: "Show 2019" }),
            ],
          }),
        ),
      "/api/v1/series/ser_1_show/episodes": () =>
        Promise.resolve(
          jsonResponse(200, { items: [overridden, composed, nameless] }),
        ),
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("link", { name: /Show 2019/ }));

    // The override tier rides inside the served name.
    const e0 = await screen.findByRole("link", { name: /Renamed Episode/ });
    expect(within(e0).queryByText("View Decoy")).toBeNull();
    // The served composed name renders verbatim — the document's `_view`
    // title never leaks.
    expect(screen.getByRole("link", { name: /Show 2019 · S01E01/ })).toBeDefined();
    expect(screen.queryByText("View Decoy")).toBeNull();
    // Floor-empty (no display_name at all) → the extension-less STEM renders
    // in the normal title style plus the muted "Not identified" line; the
    // raw filename never appears.
    const e2 = screen.getByRole("link", { name: /Not identified/ });
    expect(within(e2).getByText("S01E02")).toBeDefined();
    expect(within(e2).queryByText("S01E02.mkv")).toBeNull();
    // Item cards render no always-visible Rename affordance (rename lives in
    // the card menu).
    expect(screen.queryByRole("button", { name: /^Rename/ })).toBeNull();
  });

  it("rename PUTs and the display follows; clear DELETEs back to the chain; a 400 surfaces inline once with the overlay open", async () => {
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
                // The SERVED name follows the stored override; on clear the
                // chain value comes back served (strict served-verbatim — the
                // client never floors to the path name) — display-naming.
                displayName: override !== "" ? override : "Show 2019",
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

    // Rename through the card menu: trigger → Rename… row → the form. The
    // PUT fires once, the awaited collapse closes the overlay, and the card's
    // title follows the override.
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Show 2019" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename…" }));
    fireEvent.change(screen.getByLabelText("New title for Show 2019"), {
      target: { value: "Better Name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const renamed = await screen.findByRole("link", { name: /Better Name/ });
    expect(within(renamed).queryByText("Show 2019")).toBeNull();
    expect(puts).toEqual(["Better Name"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Clear: the DELETE fires, the overlay collapses, and the chain value
    // returns.
    fireEvent.click(screen.getByRole("button", { name: "Actions for Better Name" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename…" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByRole("link", { name: /Show 2019/ })).toBeDefined();
    expect(deletes).toBe(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Invalid submission: whitespace-only → the canonical 400 surfaces
    // inline, exactly once (no auto-retry behind the failure), and the
    // overlay STAYS OPEN so the operator can correct the value.
    fireEvent.click(screen.getByRole("button", { name: "Actions for Show 2019" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename…" }));
    fireEvent.change(screen.getByLabelText("New title for Show 2019"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(/bad_request: title is required/)).toBeDefined();
    expect(puts).toEqual(["Better Name", "   "]);
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

describe("Collection — CardActions shell (ui-management pass 1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // oneSeriesSeam — a serial library with the given rows; title PUTs follow
  // the same contract as the rename test (empty title → 400).
  function oneSeriesSeam(rows: SeriesDTO[]): void {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/title")) {
        const { title } = JSON.parse(String(init?.body)) as { title: string };
        if (method === "PUT") {
          return title.trim() === ""
            ? Promise.resolve(
                jsonResponse(400, {
                  error: { code: "bad_request", message: "title is required and must be a non-empty string", retryable: false },
                }),
              )
            : Promise.resolve(
                jsonResponse(200, { entity_id: rows[0].id, title, updated_at: "2026-10-16T00:00:00Z" }),
              );
        }
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.includes("/api/v1/series?library=1")) {
        return Promise.resolve(jsonResponse(200, { items: rows }));
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(jsonResponse(200, { library_id: 1, items: rows.length, updated_at: "" }));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "serial", "films")] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  function srow1(id: string, displayName: string, backing?: string): SeriesDTO {
    const d: ItemDocument = {};
    if (backing !== undefined) d.parsed = { backing };
    return {
      id,
      module_id: "serial",
      library_id: 1,
      relative_path: displayName,
      document: d,
      schema_version: 1,
      status: "ready",
      title_override: "",
      display_name: displayName,
    };
  }

  it("the trigger carries the dialog a11y pair; the menu flips to the rename view; Esc walks view→menu→close-all", async () => {
    oneSeriesSeam([srow1("ser_1_show", "Show 2019")]);
    renderCollection("1");

    const trigger = await screen.findByRole("button", { name: "Actions for Show 2019" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.hasAttribute("data-open")).toBe(true);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // data-open persists the open state (load-bearing: the panel is
    // portaled, so :focus-within goes false once focus enters it).
    expect(trigger.hasAttribute("data-open")).toBe(true);

    // menu → rename view
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename…" }));
    expect(await screen.findByLabelText("New title for Show 2019")).toBeDefined();

    // Esc in a view → back to the menu (the overlay never closes mid-walk).
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(await screen.findByRole("button", { name: "Rename…" })).toBeDefined();

    // Esc in the menu → close all.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("data-open")).toBe(false);
  });

  it("Esc is IGNORED while a mutation is pending; the awaited collapse closes afterwards", async () => {
    let releasePut: (r: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/title") && method === "PUT") {
        return new Promise<Response>((res) => {
          releasePut = res;
        });
      }
      if (url.includes("/api/v1/series?library=1")) {
        return Promise.resolve(jsonResponse(200, { items: [srow1("ser_1_show", "Show 2019")] }));
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "serial", "films")] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Show 2019" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename…" }));
    fireEvent.change(screen.getByLabelText("New title for Show 2019"), {
      target: { value: "Better Name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // In flight: Esc does nothing — an unmounted view could never render the
    // canonical inline error.
    expect(await screen.findByRole("dialog")).toBeDefined();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByLabelText("New title for Show 2019")).toBeDefined();

    // The awaited mutation completes → its collapse closes the overlay.
    releasePut(
      jsonResponse(200, { entity_id: "ser_1_show", title: "Better Name", updated_at: "2026-10-16T00:00:00Z" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("traps focus with the two-sentinel Tab loop and returns focus to the trigger on close", async () => {
    oneSeriesSeam([srow1("ser_1_show", "Show 2019")]);
    renderCollection("1");

    const trigger = await screen.findByRole("button", { name: "Actions for Show 2019" });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");

    // On open, focus moves into the panel (its first focusable row).
    const renameRow = within(dialog).getByRole("button", { name: "Rename…" });
    await waitFor(() => expect(document.activeElement).toBe(renameRow));

    // Sentinel wraps: bottom → first focusable, top → last focusable.
    const sentinels = dialog.querySelectorAll<HTMLElement>(".cardact-sentinel");
    expect(sentinels.length).toBe(2);
    fireEvent.focus(sentinels[sentinels.length - 1]);
    expect(document.activeElement).toBe(renameRow);
    fireEvent.focus(sentinels[0]);
    expect(document.activeElement).toBe(renameRow);

    // Scrim click-away closes all and returns focus to the trigger.
    const backdrop = document.querySelector(".overlay-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("the series menu carries the 'File-backed series' footer only for file-backed rows", async () => {
    oneSeriesSeam([
      srow1("ser_1_dir", "Dir Show"),
      srow1("ser_1_file", "File Show", "file"),
    ]);
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Dir Show" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("File-backed series")).toBeNull();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Actions for File Show" }));
    expect(await screen.findByText("File-backed series")).toBeDefined();
  });
});

describe("Collection — Mark watched row (ui-management pass 1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // tvSeam — a tv library over the given rows; progress PUTs are recorded.
  function tvSeam(rows: ItemDTO[]): { puts: { url: string; body: unknown }[] } {
    const puts: { url: string; body: unknown }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/progress/") && method === "PUT") {
        puts.push({ url, body: JSON.parse(String(init?.body)) });
        const itemId = url.split("/").pop() ?? "";
        return Promise.resolve(
          jsonResponse(200, {
            item_id: itemId,
            position_seconds: 1,
            updated_at: "2026-10-16T00:00:00Z",
          }),
        );
      }
      if (url.includes("/api/v1/items?library=1")) {
        return Promise.resolve(jsonResponse(200, { items: rows }));
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(jsonResponse(200, { library_id: 1, items: rows.length, updated_at: "" }));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films")] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    return { puts };
  }

  it("shows Mark watched only on a known duration, PUTs position_seconds=durationSeconds, and keeps the menu open on success", async () => {
    const withDuration = doc({ year: 2019 });
    withDuration.ffprobe = { format: { duration: "1430.4" } };
    const { puts } = tvSeam([
      item("itm_1_wd", "tv", "Movies/wd.mkv", withDuration, "With Duration"),
      item("itm_1_nd", "tv", "Movies/nd.mkv", doc({}), "No Duration"),
    ]);
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Actions for With Duration" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark watched" }));

    // The PUT carries the item's full whole-second duration (1430.4 → 1430).
    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].url).toContain("/api/v1/progress/itm_1_wd");
    expect(puts[0].body).toEqual({ position_seconds: 1430 });

    // Success keeps the menu open — the row is an action, not a view.
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark watched" })).toBeDefined();

    // The unprobed row never sees the row — never a guessed duration.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Actions for No Duration" }));
    const dialogB = await screen.findByRole("dialog");
    expect(within(dialogB).queryByRole("button", { name: "Mark watched" })).toBeNull();
  });

  it("renders a row-local transient error on failure and keeps the menu open", async () => {
    const withDuration = doc({});
    withDuration.ffprobe = { format: { duration: "600" } };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/api/v1/progress/") && (init?.method ?? "GET") === "PUT") {
        return Promise.resolve(
          jsonResponse(500, {
            error: { code: "internal", message: "progress write failed", retryable: false },
          }),
        );
      }
      if (url.includes("/api/v1/items?library=1")) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [item("itm_1_wd", "tv", "Movies/wd.mkv", withDuration, "With Duration")],
          }),
        );
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films")] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Actions for With Duration" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark watched" }));

    // The canonical error renders row-locally; the menu stays open.
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(/internal: progress write failed/)).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark watched" })).toBeDefined();
  });
});

describe("Collection — INV-no-filenames title floors (ui-management pass 1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("MovieCard floors an empty or filename-equal display_name to the stem + 'Not identified'; a Part.2-style suffix survives; the duration joins the meta line", async () => {
    const withDuration = doc({ title: "decoy" });
    withDuration.ffprobe = { format: { duration: "1430.4" } };
    fetchWith({
      ...headerSeam("tv", 3),
      "/api/v1/items?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              // Empty served name → stem + marker.
              item("itm_1_f1", "tv", "Movies/Totide 2019 1080p.mkv", doc({ year: 2019, resolution: "1080p" }), ""),
              // Served name IS the filename → stem + marker.
              item("itm_1_f2", "tv", "Movies/Untitled Part.2.mkv", doc({}), "Untitled Part.2.mkv"),
              // Identified name whose stem would lose a "Part.2" suffix →
              // verbatim, no marker; the ffprobe duration joins the meta line.
              item("itm_1_f3", "tv", "Movies/Show Part.2.mkv", withDuration, "Show Part.2"),
            ],
          }),
        ),
    });
    renderCollection("1");

    const f1 = await screen.findByRole("link", { name: /Totide 2019 1080p/ });
    expect(within(f1).getByText("Not identified")).toBeDefined();
    expect(within(f1).getByText("2019 · 1080p")).toBeDefined();
    const f2 = screen.getByRole("link", { name: /Untitled Part\.2/ });
    expect(within(f2).getByText("Not identified")).toBeDefined();
    expect(within(f2).queryByText("Untitled Part.2.mkv")).toBeNull();
    // The anchored 2–4-char extension regex strips only the real extension.
    const f3 = screen.getByRole("link", { name: /Show Part\.2/ });
    expect(within(f3).queryByText("Not identified")).toBeNull();
    expect(within(f3).getByText("23:50")).toBeDefined();
    // Exactly two flagged cards — the identified one is untouched.
    expect(screen.getAllByText("Not identified").length).toBe(2);
  });

  it("ItemGrid floors an empty display_name to the stem with NO marker and no filename row", async () => {
    fetchWith({
      ...headerSeam("audiobook", 2),
      "/api/v1/items?library=1": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              item("itm_1_g1", "audiobook", "Books/Some Book.m4b", doc({}), ""),
              item("itm_1_g2", "audiobook", "Books/Named.m4b", doc({}), "Named"),
            ],
          }),
        ),
    });
    renderCollection("1");

    const g1 = await screen.findByRole("link", { name: /Some Book/ });
    expect(within(g1).getByText("Some Book")).toBeDefined();
    // Markerless surface: no menu here, so no "Not identified" line.
    expect(within(g1).queryByText("Not identified")).toBeNull();
    expect(within(g1).queryByText("Some Book.m4b")).toBeNull();
    const g2 = screen.getByRole("link", { name: /Named/ });
    expect(within(g2).getByText("Named")).toBeDefined();
  });
});

describe("Collection — Identify view (ui-management pass 2)", () => {
  // CHAIN — the module block's declared parser chain for the identify cases:
  // three declared parsers, served order.
  const CHAIN: ParserBinding[] = [
    { id: "anitomy", display_fields: [] },
    { id: "tmdb", display_fields: [] },
    { id: "tvmaze", display_fields: [] },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // identifySeam — a tv library whose library DETAIL (GET /libraries/1) is
  // the module block's only carrier (the list endpoint never has it), and
  // whose item detail (GET /items/{detailId}) is DEFERRED until released so
  // the fetch-before-render contract is observable. Seam order matters: the
  // summary and the /libraries/1 detail fragments precede the generic
  // /libraries list (substring matching, earlier wins).
  function identifySeam(parts: {
    module?: ModulePresentation;
    rows: ItemDTO[];
    detailId: string;
  }): { releaseDetail: (withExtras?: string[]) => void; detailFetches: () => number } {
    let fetches = 0;
    let release: (r: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(
          jsonResponse(200, { library_id: 1, items: parts.rows.length, updated_at: "" }),
        );
      }
      if (url.includes("/api/v1/libraries/1")) {
        const detail = lib(1, "tv", "films");
        if (parts.module !== undefined) {
          detail.module = parts.module;
        }
        return Promise.resolve(jsonResponse(200, detail));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films")] }));
      }
      if (url.includes("/api/v1/items?library=1")) {
        return Promise.resolve(jsonResponse(200, { items: parts.rows }));
      }
      if (url.includes(`/api/v1/items/${parts.detailId}`)) {
        fetches += 1;
        return new Promise<Response>((res) => {
          release = res;
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    const row = parts.rows.find((r) => r.id === parts.detailId) ?? parts.rows[0];
    return {
      detailFetches: () => fetches,
      releaseDetail: (withExtras?: string[]) =>
        release(
          jsonResponse(200, {
            item: {
              ...row,
              ...(withExtras !== undefined ? { extra_parsers: withExtras } : {}),
            },
          }),
        ),
    };
  }

  it("opens with the MANDATORY detail fetch before rendering the lists; attachable = declared − extra_parsers (present case)", async () => {
    const { releaseDetail, detailFetches } = identifySeam({
      module: { identity_fields: ["title"], parsers: CHAIN },
      rows: [item("itm_1_a", "tv", "Movies/known.mkv", doc({ title: "Known" }), "Known")],
      detailId: "itm_1_a",
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Known" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Identify…" }),
    );

    // The detail fetch fires on open and GATES the view: no parser list
    // renders before the detail endpoint answers.
    await waitFor(() => expect(detailFetches()).toBe(1));
    expect(screen.queryByRole("list", { name: "Attached parsers" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Parser chain" })).toBeNull();

    // The detail carries extra_parsers: one attached of three declared.
    releaseDetail(["anitomy"]);
    const chainRows = within(
      await screen.findByRole("list", { name: "Parser chain" }),
    ).getAllByRole("listitem");
    expect(chainRows.length).toBe(3);
    expect(within(chainRows[0]).getByText("anitomy")).toBeDefined();
    expect(within(chainRows[0]).getByText("attached")).toBeDefined();
    expect(within(chainRows[1]).getByText("tmdb")).toBeDefined();
    expect(within(chainRows[1]).getByText("attachable")).toBeDefined();
    expect(within(chainRows[2]).getByText("tvmaze")).toBeDefined();
    expect(within(chainRows[2]).getByText("attachable")).toBeDefined();

    // The attached draft renders the attachment, reorder edge-disabled.
    const attachedRows = within(
      screen.getByRole("list", { name: "Attached parsers" }),
    ).getAllByRole("listitem");
    expect(within(attachedRows[0]).getByText("anitomy")).toBeDefined();
    expect(
      within(attachedRows[0]).getByRole("button", { name: "Move anitomy up" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(attachedRows[0]).getByRole("button", { name: "Move anitomy down" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("absent extra_parsers → nothing attached and every declared parser attachable", async () => {
    const { releaseDetail } = identifySeam({
      module: { identity_fields: ["title"], parsers: CHAIN },
      rows: [item("itm_1_a", "tv", "Movies/known.mkv", doc({ title: "Known" }), "Known")],
      detailId: "itm_1_a",
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Known" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Identify…" }),
    );
    // No extra_parsers field at all → attachments are empty (never guessed).
    releaseDetail();

    await screen.findByRole("list", { name: "Parser chain" });
    expect(screen.getByText("Nothing attached.")).toBeDefined();
    expect(screen.queryByRole("list", { name: "Attached parsers" })).toBeNull();
    const chainRows = within(
      screen.getByRole("list", { name: "Parser chain" }),
    ).getAllByRole("listitem");
    expect(chainRows.length).toBe(3);
    for (const row of chainRows) {
      expect(within(row).getByText("attachable")).toBeDefined();
    }
  });

  it("the up/down buttons reorder the attachment draft in place", async () => {
    const { releaseDetail } = identifySeam({
      module: { identity_fields: ["title"], parsers: CHAIN },
      rows: [item("itm_1_a", "tv", "Movies/known.mkv", doc({ title: "Known" }), "Known")],
      detailId: "itm_1_a",
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Known" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Identify…" }),
    );
    releaseDetail(["tmdb", "anitomy"]);

    const attachedList = await screen.findByRole("list", { name: "Attached parsers" });
    const rows = within(attachedList).getAllByRole("listitem");
    expect(within(rows[0]).getByText("tmdb")).toBeDefined();
    expect(within(rows[1]).getByText("anitomy")).toBeDefined();
    // Edges: the top row cannot go up, the bottom row cannot go down.
    expect(
      within(rows[0]).getByRole("button", { name: "Move tmdb up" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(rows[1]).getByRole("button", { name: "Move anitomy down" }).hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(within(rows[0]).getByRole("button", { name: "Move tmdb down" }));
    const after = within(screen.getByRole("list", { name: "Attached parsers" })).getAllByRole(
      "listitem",
    );
    expect(within(after[0]).getByText("anitomy")).toBeDefined();
    expect(within(after[1]).getByText("tmdb")).toBeDefined();
  });

  it("promotes Identify… to the first menu row on an unidentified card; an identified card keeps Rename… first", async () => {
    identifySeam({
      module: { identity_fields: ["title"], parsers: CHAIN },
      rows: [
        item("itm_1_a", "tv", "Movies/known.mkv", doc({ title: "Known" }), "Known"),
        // Empty served name → stem title + "Not identified" marker.
        item("itm_1_b", "tv", "Movies/Unknown.mkv", doc({}), ""),
      ],
      detailId: "itm_1_a",
    });
    renderCollection("1");

    const identified = await screen.findByRole("button", { name: "Actions for Known" });
    fireEvent.click(identified);
    const dialogA = await screen.findByRole("dialog");
    const identifiedRows = within(dialogA).getAllByRole("button");
    expect(identifiedRows[0].textContent).toBe("Rename…");
    expect(identifiedRows[1].textContent).toBe("Identify…");
    fireEvent.keyDown(dialogA, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unknown" }));
    const dialogB = await screen.findByRole("dialog");
    const unidentifiedRows = within(dialogB).getAllByRole("button");
    expect(unidentifiedRows[0].textContent).toBe("Identify…");
    expect(unidentifiedRows[1].textContent).toBe("Rename…");
  });

  it("hides the Identify row without the module block and with an empty chain — a designed absence, never a spinner", async () => {
    // Module block ABSENT: the menu carries only Rename…
    identifySeam({
      rows: [item("itm_1_a", "tv", "Movies/known.mkv", doc({ title: "Known" }), "Known")],
      detailId: "itm_1_a",
    });
    const { unmount } = renderCollection("1");
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Known" }));
    const dialogA = await screen.findByRole("dialog");
    expect(within(dialogA).queryByRole("button", { name: "Identify…" })).toBeNull();
    expect(within(dialogA).getByRole("button", { name: "Rename…" })).toBeDefined();
    unmount();

    // Module block PRESENT but the chain EMPTY: still hidden.
    vi.restoreAllMocks();
    identifySeam({
      module: { identity_fields: [], parsers: [] },
      rows: [item("itm_1_a", "tv", "Movies/known.mkv", doc({ title: "Known" }), "Known")],
      detailId: "itm_1_a",
    });
    renderCollection("1");
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Known" }));
    const dialogB = await screen.findByRole("dialog");
    expect(within(dialogB).queryByRole("button", { name: "Identify…" })).toBeNull();
  });
});

describe("Collection — Identify save (ui-management pass 2)", () => {
  const CHAIN: ParserBinding[] = [
    { id: "anitomy", display_fields: [] },
    { id: "tmdb", display_fields: [] },
    { id: "tvmaze", display_fields: [] },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // saveSeam — a tv library with a wired chain whose item detail answers
  // immediately with the given extra_parsers; the parsers PUT is recorded
  // and answered by `respond`. The GET counters expose the invalidation
  // keys' refetches. Seam order matters: the /parsers and /libraries/1
  // fragments precede the generic /libraries and /items matches (substring
  // matching, earlier wins).
  function saveSeam(parts: {
    extraParsers?: string[];
    respond: () => Promise<Response>;
  }): {
    puts: { parsers: string[] }[];
    detailGets: () => number;
    listGets: () => number;
  } {
    const puts: { parsers: string[] }[] = [];
    let detailGets = 0;
    let listGets = 0;
    const row = item("itm_1_a", "tv", "Movies/known.mkv", doc({ title: "Known" }), "Known");
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (
        url.includes("/api/v1/items/itm_1_a/parsers") &&
        (init?.method ?? "GET") === "PUT"
      ) {
        puts.push({
          parsers: (JSON.parse(String(init?.body)) as { parsers: string[] }).parsers,
        });
        return parts.respond();
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(
          jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }),
        );
      }
      if (url.includes("/api/v1/libraries/1")) {
        const detail = lib(1, "tv", "films");
        detail.module = { identity_fields: ["title"], parsers: CHAIN };
        return Promise.resolve(jsonResponse(200, detail));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films")] }));
      }
      if (url.includes("/api/v1/items?library=1")) {
        listGets += 1;
        return Promise.resolve(jsonResponse(200, { items: [row] }));
      }
      if (url.includes("/api/v1/items/itm_1_a")) {
        detailGets += 1;
        return Promise.resolve(
          jsonResponse(200, {
            item: {
              ...row,
              ...(parts.extraParsers !== undefined
                ? { extra_parsers: parts.extraParsers }
                : {}),
            },
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    return { puts, detailGets: () => detailGets, listGets: () => listGets };
  }

  async function openIdentify(): Promise<void> {
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Known" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Identify…" }),
    );
    await screen.findByRole("list", { name: "Attached parsers" });
  }

  it("Save PUTs the FULL ordered draft, fires the invalidation keys, and collapses via the awaited success", async () => {
    const seam = saveSeam({
      extraParsers: ["tmdb", "anitomy"],
      respond: () => Promise.resolve(jsonResponse(200, { parsers: ["anitomy", "tmdb"] })),
    });
    renderCollection("1");
    await openIdentify();

    // Reorder the draft: tmdb moves below anitomy.
    const rows = within(
      screen.getByRole("list", { name: "Attached parsers" }),
    ).getAllByRole("listitem");
    expect(within(rows[0]).getByText("tmdb")).toBeDefined();
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Move tmdb down" }));

    // The staleness copy renders verbatim (staleness handling is copy-only).
    expect(
      screen.getByText(
        "Enrichment runs in the background; the name updates when it lands. A recently failed row waits out its cooldown before retrying.",
      ),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The PUT body is the COMPLETE ordered list — both ids in draft order,
    // never a diff.
    await waitFor(() =>
      expect(seam.puts).toEqual([{ parsers: ["anitomy", "tmdb"] }]),
    );
    // The awaited success collapses the overlay.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The invalidation keys fired: the caller's read (["items"] → the items
    // list) and the detail read (["item", id]) both refetched.
    await waitFor(() => expect(seam.listGets()).toBe(2));
    await waitFor(() => expect(seam.detailGets()).toBe(2));
  });

  it("removing every attached parser PUTs the emptied list", async () => {
    const seam = saveSeam({
      extraParsers: ["tmdb", "anitomy"],
      respond: () => Promise.resolve(jsonResponse(200, { parsers: [] })),
    });
    renderCollection("1");
    await openIdentify();

    fireEvent.click(screen.getByRole("button", { name: "Remove tmdb" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove anitomy" }));
    expect(screen.getByText("Nothing attached.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Empty is a legal FULL-replacement body — it clears the attachments.
    await waitFor(() => expect(seam.puts).toEqual([{ parsers: [] }]));
  });

  it("a 400 (unknown parser) renders inline once and the overlay stays open on the identify view", async () => {
    const seam = saveSeam({
      extraParsers: ["tmdb"],
      respond: () =>
        Promise.resolve(
          jsonResponse(400, {
            error: {
              code: "bad_request",
              message: "unknown parser tmdb",
              retryable: false,
            },
          }),
        ),
    });
    renderCollection("1");
    await openIdentify();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The canonical error renders inline, exactly once (no auto-retry), and
    // the overlay STAYS OPEN so the draft survives.
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(/bad_request: unknown parser tmdb/)).toBeDefined();
    await waitFor(() => expect(seam.puts.length).toBe(1));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("list", { name: "Attached parsers" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });
});

describe("Collection — per-item Refresh view (ui-management pass 2)", () => {
  const CHAIN: ParserBinding[] = [
    { id: "anitomy", display_fields: [] },
    { id: "tmdb", display_fields: [] },
    { id: "tvmaze", display_fields: [] },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // refreshSeamTv — a tv library with a wired chain and one item; the
  // refresh POST is recorded and answered by `respond`. Seam order matters:
  // /refresh and /libraries/1 precede the generic fragments (substring
  // matching, earlier wins).
  function refreshSeamTv(respond: () => Promise<Response>): {
    posts: { plugin_id: string; row_ids: string[] }[];
  } {
    const posts: { plugin_id: string; row_ids: string[] }[] = [];
    const row = item("itm_1_a", "tv", "Movies/known.mkv", doc({ title: "Known" }), "Known");
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (
        url.includes("/api/v1/libraries/1/refresh") &&
        (init?.method ?? "GET") === "POST"
      ) {
        posts.push(JSON.parse(String(init?.body)) as { plugin_id: string; row_ids: string[] });
        return respond();
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(
          jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }),
        );
      }
      if (url.includes("/api/v1/libraries/1")) {
        const detail = lib(1, "tv", "films");
        detail.module = { identity_fields: ["title"], parsers: CHAIN };
        return Promise.resolve(jsonResponse(200, detail));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films")] }));
      }
      if (url.includes("/api/v1/items?library=1")) {
        return Promise.resolve(jsonResponse(200, { items: [row] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    return { posts };
  }

  async function openRefreshTv(): Promise<void> {
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Known" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Refresh metadata…" }),
    );
    await screen.findByRole("radiogroup", { name: "Refresh with parser" });
  }

  it("radio selection drives plugin_id; the POST body row_ids is exactly the one item id; the 202 counts render inline", async () => {
    const { posts } = refreshSeamTv(() =>
      Promise.resolve(jsonResponse(202, { queued: 1, stripped: 0, deferred: 0 })),
    );
    renderCollection("1");
    await openRefreshTv();

    // The chain's radios render; the served-first parser is the
    // preselection (a plain confirm is always well-formed).
    const group = screen.getByRole("radiogroup", { name: "Refresh with parser" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.length).toBe(3);
    expect(radios[0].checked).toBe(true);

    // Selecting tmdb drives the body's plugin_id.
    fireEvent.click(within(group).getByRole("radio", { name: "tmdb" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() =>
      expect(posts).toEqual([{ plugin_id: "tmdb", row_ids: ["itm_1_a"] }]),
    );
    // The 202 counts render inline; the view stays open.
    expect(await screen.findByText(/1 queued .* 0 stripped .* 0 deferred/)).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("radiogroup", { name: "Refresh with parser" })).toBeDefined();
  });

  it("a 202 with deferred rows renders the kept-its-data copy inline", async () => {
    const { posts } = refreshSeamTv(() =>
      Promise.resolve(jsonResponse(202, { queued: 0, stripped: 2, deferred: 1 })),
    );
    renderCollection("1");
    await openRefreshTv();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].row_ids).toEqual(["itm_1_a"]);
    expect(await screen.findByText("kept its data — try again shortly")).toBeDefined();
  });

  it("409 refresh_in_flight renders its copy; 503 unwired renders the canonical inline error — both stay open, no auto-retry", async () => {
    let respond: () => Promise<Response> = () =>
      Promise.resolve(jsonResponse(202, { queued: 0, stripped: 0, deferred: 0 }));
    const { posts } = refreshSeamTv(() => respond());
    renderCollection("1");
    await openRefreshTv();

    // 409: the conflict copy renders inline, the view stays open.
    respond = () =>
      Promise.resolve(
        jsonResponse(409, {
          error: {
            code: "refresh_in_flight",
            message: "a whole-library refresh is already in flight",
            retryable: false,
          },
        }),
      );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("A refresh is already running")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    await waitFor(() => expect(posts.length).toBe(1));

    // 503 (endpoint unwired): the canonical error renders inline — same
    // posture, still no auto-retry behind the failures.
    respond = () =>
      Promise.resolve(
        jsonResponse(503, {
          error: {
            code: "unavailable",
            message: "refresh endpoint disabled",
            retryable: false,
          },
        }),
      );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/unavailable: refresh endpoint disabled/)).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    await waitFor(() => expect(posts.length).toBe(2));
  });

  it("the series menu's Refresh metadata… row passes the SERIES id as the single row id", async () => {
    const posts: { plugin_id: string; row_ids: string[] }[] = [];
    const d: ItemDocument = {};
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (
        url.includes("/api/v1/libraries/1/refresh") &&
        (init?.method ?? "GET") === "POST"
      ) {
        posts.push(JSON.parse(String(init?.body)) as { plugin_id: string; row_ids: string[] });
        return Promise.resolve(
          jsonResponse(202, { queued: 1, stripped: 1, deferred: 0 }),
        );
      }
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(
          jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }),
        );
      }
      if (url.includes("/api/v1/libraries/1")) {
        const detail = lib(1, "serial", "shows");
        detail.module = { identity_fields: ["title"], parsers: CHAIN };
        return Promise.resolve(jsonResponse(200, detail));
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "serial", "shows")] }));
      }
      if (url.includes("/api/v1/series?library=1")) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                id: "ser_1_show",
                module_id: "serial",
                library_id: 1,
                relative_path: "Show 2019",
                document: d,
                schema_version: 1,
                status: "ready",
                display_name: "Show 2019",
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Show 2019" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Refresh metadata…" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    // Series rows live in the same row space: the body carries the series
    // id, exactly one.
    await waitFor(() =>
      expect(posts).toEqual([{ plugin_id: "anitomy", row_ids: ["ser_1_show"] }]),
    );
    expect(await screen.findByText(/1 queued .* 1 stripped .* 0 deferred/)).toBeDefined();
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

    const beach = await screen.findByRole("link", { name: "Open beach" });
    await waitFor(() => expect(beach.querySelector("img")).not.toBeNull());
    const alps = screen.getByRole("link", { name: "Open alps" });
    await waitFor(() => expect(alps.querySelector("img")).not.toBeNull());

    // p1 asked for its thumb; p2 fell back to the original (no variant).
    expect(mediaCalls(spy)).toEqual([
      "/api/v1/items/itm_1_p1/media?variant=thumb",
      "/api/v1/items/itm_1_p2/media",
    ]);

    // p3 has no media fact — no <img>, no media call, placeholder kept.
    const scan = screen.getByRole("link", { name: "Open scan" });
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

    await screen.findByRole("link", { name: "Open beach" });
    // The fetch was attempted for the fact-bearing tiles…
    await waitFor(() => expect(mediaCalls(spy).length).toBe(2));
    // …but a failed load renders the placeholder, not an <img> and not a
    // broken-image icon.
    for (const link of [
      screen.getByRole("link", { name: "Open beach" }),
      screen.getByRole("link", { name: "Open alps" }),
    ]) {
      expect(link.querySelector("img")).toBeNull();
    }
    // The tile is still fully itself: capture-date footer, no filename.
    expect(within(screen.getByRole("link", { name: "Open beach" })).getByText("2026-07-04")).toBeDefined();
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
                "The Thing",
              ),
              item(
                "itm_1_b",
                "tv",
                "Movies/plain.mkv",
                { parsed: {}, sources: { "frame-grabber": { thumbnail_path: "/t/b.jpg" } }, _view: { title: { value: "Plain", source: "tv-parser", reason: "priority" } } },
                "Plain",
              ),
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
    // INV-no-filenames: neither card shows its raw filename.
    expect(within(withThumb).queryByText("plain.mkv")).toBeNull();
    expect(within(plain).queryByText(/\.mkv/)).toBeNull();
  });
});

describe("Collection — Manage overlay (ui-management pass 3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // manageSeam — a tv library whose GET /libraries/1 detail carries the
  // additive module block (a WIRED module). Entry order matters: the summary
  // and detail paths are checked before the bare list fragment.
  function manageSeam(moduleBlock?: ModulePresentation): void {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(
          jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }),
        );
      }
      if (url.endsWith("/api/v1/libraries/1")) {
        return Promise.resolve(
          jsonResponse(200, {
            ...lib(1, "tv", "films"),
            streams_enabled: true,
            naming_group_style: "",
            naming_element_name: "",
            ...(moduleBlock ? { module: moduleBlock } : {}),
          }),
        );
      }
      if (url.includes("/api/v1/libraries")) {
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films")] }));
      }
      if (url.includes("/api/v1/items?")) {
        return Promise.resolve(jsonResponse(200, { items: [] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it("the header gear opens the wide Manage sheet through the lifted shell: aria-modal, five sections, Esc closes with focus-return", async () => {
    manageSeam({ identity_fields: [], parsers: [{ id: "tv-parser", display_fields: [] }] });
    renderCollection("1");

    const gear = await screen.findByRole("button", { name: "Manage collection" });
    // The gear carries the dialog a11y pair and is keyboard-reachable.
    expect(gear.getAttribute("aria-haspopup")).toBe("dialog");
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(gear);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(gear.getAttribute("aria-expanded")).toBe("true");

    // The five sections render as independent save boundaries (each
    // section's controls land in its own box).
    for (const title of ["Rescan", "Parser chain", "Naming", "Refresh metadata", "Edit library"]) {
      expect(within(dialog).getByRole("heading", { name: title })).toBeDefined();
    }

    // On open, focus moves into the sheet (its first focusable — Close).
    const close = within(dialog).getByRole("button", { name: "Close" });
    await waitFor(() => expect(document.activeElement).toBe(close));

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(gear);
    expect(gear.getAttribute("aria-expanded")).toBe("false");
  });

  it("scrim click-away closes and returns focus to the gear; the two-sentinel trap wraps at both edges", async () => {
    manageSeam();
    renderCollection("1");

    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));
    const dialog = await screen.findByRole("dialog");

    // Sentinels wrap: bottom → first focusable, top → last focusable (the
    // sheet's focusable set grows with its sections — derive the edges).
    const close = within(dialog).getByRole("button", { name: "Close" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    const tabbables = Array.from(
      dialog.querySelectorAll<HTMLElement>("button"),
    ).filter((el) => !el.classList.contains("cardact-sentinel"));
    const sentinels = dialog.querySelectorAll<HTMLElement>(".cardact-sentinel");
    expect(sentinels.length).toBe(2);
    fireEvent.focus(sentinels[sentinels.length - 1]);
    expect(document.activeElement).toBe(tabbables[0]);
    fireEvent.focus(sentinels[0]);
    expect(document.activeElement).toBe(tabbables[tabbables.length - 1]);

    // Scrim click-away closes all and returns focus to the gear.
    const backdrop = document.querySelector(".overlay-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Manage collection" }),
    );
  });

  // saveSeam — the manage seam with the WRITE side: PATCH bodies to
  // /libraries/1 are recorded (and answered with a module-block-less DTO —
  // the server truth: PATCH responses never carry the module block), the
  // module block carries a three-parser chain, and the naming section's
  // sample row (the library's FIRST episode) + its series are served.
  const CHAIN: ParserBinding[] = [
    { id: "tv-parser", display_fields: [] },
    { id: "frame-grabber", display_fields: [] },
    { id: "image-enricher", display_fields: [] },
  ];

  function episodeRow(): ItemDTO {
    return item("itm_1_ep1", "serial", "Show (2019)/S01E05.mkv", {
      parsed: { series_relative_path: "Show (2019)" },
      sources: { "serial-parser": { season: 1, episode: 5 } },
    });
  }

  function seriesRow(): SeriesDTO {
    return {
      id: "ser_1_show",
      module_id: "serial",
      library_id: 1,
      relative_path: "Show (2019)",
      document: { sources: { "serial-parser": { title: "Ход королевы" } } },
      schema_version: 1,
      status: "ready",
    };
  }

  function saveSeam(opts?: {
    patch?: () => Response;
    scan?: () => Response;
    detailAfterPatch?: () => ModulePresentation;
  }): {
    patches: Record<string, unknown>[];
    detailGets: () => number;
    listGets: () => number;
  } {
    const patches: Record<string, unknown>[] = [];
    let detailGets = 0;
    let listGets = 0;
    const patched = {
      ...lib(1, "tv", "films"),
      streams_enabled: true,
      naming_group_style: "",
      naming_element_name: "{title} · S{season}E{episode}",
    };
    const patchOk = (): Response => jsonResponse(200, patched);
    const scanOk = (): Response =>
      jsonResponse(200, { library_id: 1, discovered: 2, persisted: 2 });
    // After the FIRST patch the GET detail can serve a different chain
    // (detailAfterPatch) — the hook that proves a section re-reads the
    // SERVED chain, not the PATCH body/response.
    let patchedOnce = false;
    const moduleBlock = (): ModulePresentation => ({
      identity_fields: [],
      parsers:
        patchedOnce && opts?.detailAfterPatch ? opts.detailAfterPatch() : CHAIN,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/libraries/1/summary")) {
        return Promise.resolve(
          jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }),
        );
      }
      if (url.endsWith("/api/v1/libraries/1")) {
        if (method === "PATCH") {
          patchedOnce = true;
          patches.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return Promise.resolve(opts?.patch ? opts.patch() : patchOk());
        }
        detailGets += 1;
        return Promise.resolve(
          jsonResponse(200, {
            ...patched,
            module: moduleBlock(),
          }),
        );
      }
      if (url.includes("/api/v1/libraries")) {
        if (method === "POST") {
          // POST /libraries/1/scan — the Rescan section's save boundary.
          return Promise.resolve(opts?.scan ? opts.scan() : scanOk());
        }
        listGets += 1;
        return Promise.resolve(jsonResponse(200, { items: [lib(1, "tv", "films")] }));
      }
      if (url.includes("/api/v1/items?library=1&limit=1")) {
        return Promise.resolve(jsonResponse(200, { items: [episodeRow()] }));
      }
      if (url.includes("/api/v1/items?")) {
        return Promise.resolve(jsonResponse(200, { items: [] }));
      }
      if (url.includes("/api/v1/series?")) {
        return Promise.resolve(jsonResponse(200, { items: [seriesRow()] }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    return { patches, detailGets: () => detailGets, listGets: () => listGets };
  }

  function manageSection(title: string): HTMLElement {
    const dialog = screen.getByRole("dialog");
    return within(dialog)
      .getByRole("heading", { name: title })
      .closest("section") as HTMLElement;
  }

  // activeClient — the shared module-level client (same idiom as the admin
  // suite): useUpdateLibrary's onSuccess invalidates THE MODULE CLIENT
  // (queries.ts's exported queryClient — the one the app provides), so the
  // invalidation cases must render the provider over that same instance for
  // the refetch to be observable at the seam.
  function activeClient(): QueryClient {
    sharedQueryClient.clear();
    sharedQueryClient.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });
    return sharedQueryClient;
  }

  it("the chain section edits a draft of the served order and each Save PATCHes ONLY parsers, re-reading the SERVED chain after the invalidation", async () => {
    // After the first PATCH the GET detail serves a REORDERED chain — one
    // that matches neither the draft nor the PATCH body — so the display can
    // only come from the refetched GET module block.
    const REORDERED: ParserBinding[] = [
      { id: "image-enricher", display_fields: [] },
      { id: "tv-parser", display_fields: [] },
      { id: "frame-grabber", display_fields: [] },
    ];
    let reorderedServed = true;
    const seam = saveSeam({
      detailAfterPatch: () => (reorderedServed ? REORDERED : CHAIN),
    });
    // The invalidation cases render over the shared module client — the one
    // useUpdateLibrary's onSuccess actually invalidates.
    renderCollection("1", activeClient());
    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));
    const section = manageSection("Parser chain");

    // The served order renders numbered, from the module block.
    expect(within(section).getByText("1. tv-parser")).toBeDefined();
    expect(within(section).getByText("2. frame-grabber")).toBeDefined();
    expect(within(section).getByText("3. image-enricher")).toBeDefined();
    expect(within(section).getByText("Order is enrichment priority")).toBeDefined();

    // Reorder + remove the draft; Save PATCHes ONLY the drafted parsers.
    fireEvent.click(within(section).getByRole("button", { name: "Move tv-parser down" }));
    fireEvent.click(within(section).getByRole("button", { name: "Remove image-enricher" }));
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(seam.patches.length).toBe(1));
    expect(seam.patches[0]).toEqual({ parsers: ["frame-grabber", "tv-parser"] });

    // The save/invalidation contract: BOTH the ["libraries"] list AND the
    // ["library", id] detail re-fetch (initial page load already counts one
    // of each).
    await waitFor(() => expect(seam.listGets()).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(seam.detailGets()).toBeGreaterThanOrEqual(2));

    // The chain re-reads from the refetched GET detail — which carries the
    // module block — NEVER from the PATCH body/response (both carry only the
    // drafted parsers; a body-side re-read would silently keep the STALE
    // chain while looking correct). The reordered SERVED chain is on top.
    expect(await within(section).findByText("1. image-enricher")).toBeDefined();
    expect(within(section).getByText("2. tv-parser")).toBeDefined();
    expect(within(section).getByText("3. frame-grabber")).toBeDefined();

    // The add path on the new served order: remove one, add it back; the
    // second save is again its own request, parsers alone.
    reorderedServed = false;
    fireEvent.click(within(section).getByRole("button", { name: "Remove image-enricher" }));
    fireEvent.click(within(section).getByRole("button", { name: "Add image-enricher" }));
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(seam.patches.length).toBe(2));
    expect(seam.patches[1]).toEqual({
      parsers: ["tv-parser", "frame-grabber", "image-enricher"],
    });
  });

  it("the chain save is blocked from submitting an emptied list (present-and-empty is a server 400)", async () => {
    const { patches } = saveSeam();
    renderCollection("1");
    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));
    const section = manageSection("Parser chain");

    for (const b of CHAIN) {
      fireEvent.click(within(section).getByRole("button", { name: `Remove ${b.id}` }));
    }
    const save = within(section).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(within(section).getByText(/cannot be emptied/)).toBeDefined();
    fireEvent.click(save);
    expect(patches.length).toBe(0);
  });

  it("the naming section previews the first episode CLIENT-side and Save PATCHes ONLY the naming fields", async () => {
    const { patches } = saveSeam();
    renderCollection("1");
    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));
    const section = manageSection("Naming");

    // The live preview composes from the sample episode (season 1, episode 5)
    // + its resolved series' name — Cyrillic verbatim through the mirror.
    expect(await within(section).findByText("Ход королевы · S01E05")).toBeDefined();

    // Edits preview live (free text + Cyrillic copied through byte-for-byte).
    fireEvent.change(within(section).getByLabelText("Element name template"), {
      target: { value: "{title} — серия {episode}" },
    });
    expect(within(section).getByText("Ход королевы — серия 05")).toBeDefined();

    // Save PATCHes ONLY the two naming fields — never parsers.
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patches.length).toBe(1));
    expect(patches[0]).toEqual({
      naming_group_style: "",
      naming_element_name: "{title} — серия {episode}",
    });
  });

  it("the Edit section reuses the shared form; its save PATCHes ONLY the row fields, invalidates list AND detail, and success closes the sheet", async () => {
    const seam = saveSeam();
    renderCollection("1", activeClient());
    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));

    // The Edit library section IS the shared admin form: the same editable
    // Name / read-only Type + root layout.
    const edit = manageSection("Edit library");
    const nameInput = await within(edit).findByLabelText("Name");
    expect((nameInput as HTMLInputElement).value).toBe("films");
    fireEvent.change(nameInput, { target: { value: "renamed films" } });
    fireEvent.click(within(edit).getByRole("button", { name: "Save" }));

    // The PATCH carries ONLY the editable row fields — never parsers, never
    // the naming fields (each section is its own save boundary).
    await waitFor(() => expect(seam.patches.length).toBe(1));
    expect(seam.patches[0]).toEqual({
      display_name: "renamed films",
      description: "",
    });

    // The save/invalidation contract is asserted on the chain test's save
    // (this section's own success CLOSES the sheet — asserted below — so the
    // post-save re-read is inspected there, where the sheet stays open).

    // Success closes the WHOLE sheet — the edit landing is this section's
    // done signal — and focus returns to the gear.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Manage collection" }),
    );
  });

  it("a failed edit keeps the sheet open with the canonical error inline", async () => {
    let fail = true;
    saveSeam({
      patch: () =>
        fail
          ? jsonResponse(400, {
              error: { code: "invalid_request", message: "bad row", retryable: false },
            })
          : jsonResponse(200, { ...lib(1, "tv", "renamed films"), description: "" }),
    });
    renderCollection("1");
    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));

    const edit = manageSection("Edit library");
    fireEvent.change(await within(edit).findByLabelText("Name"), {
      target: { value: "renamed films" },
    });
    fireEvent.click(within(edit).getByRole("button", { name: "Save" }));

    // The canonical 400 renders inline in the section and the sheet STAYS
    // open (no auto-retry, no auto-close on failure).
    const alert = await within(edit).findByRole("alert");
    expect(alert.textContent).toContain("invalid_request");
    expect(alert.textContent).toContain("bad row");
    expect(screen.queryByRole("dialog")).not.toBeNull();

    // The retry lands — success closes the sheet.
    fail = false;
    fireEvent.click(within(edit).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Rescan renders discovered · persisted inline and omits the warnings list when none are reported", async () => {
    saveSeam();
    renderCollection("1");
    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));
    const section = manageSection("Rescan");

    fireEvent.click(within(section).getByRole("button", { name: "Rescan" }));
    expect(
      await within(section).findByText("discovered 2 · persisted 2"),
    ).toBeDefined();
    // warnings is omitempty on the wire — no warnings means NO list, never
    // a padded empty one.
    expect(within(section).queryByRole("list")).toBeNull();
  });

  it("Rescan renders the warnings list when the scan reports any", async () => {
    saveSeam({
      scan: () =>
        jsonResponse(200, {
          library_id: 1,
          discovered: 5,
          persisted: 4,
          warnings: ["skipped 1 unreadable file"],
        }),
    });
    renderCollection("1");
    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));
    const section = manageSection("Rescan");

    fireEvent.click(within(section).getByRole("button", { name: "Rescan" }));
    expect(
      await within(section).findByText("discovered 5 · persisted 4"),
    ).toBeDefined();
    expect(
      await within(section).findByText("skipped 1 unreadable file"),
    ).toBeDefined();
  });

  it("Rescan surfaces the canonical error inline and the sheet stays open", async () => {
    saveSeam({
      scan: () =>
        jsonResponse(503, {
          error: { code: "unavailable", message: "scan disabled", retryable: false },
        }),
    });
    renderCollection("1");
    fireEvent.click(await screen.findByRole("button", { name: "Manage collection" }));
    const section = manageSection("Rescan");

    fireEvent.click(within(section).getByRole("button", { name: "Rescan" }));
    const alert = await within(section).findByRole("alert");
    expect(alert.textContent).toContain("unavailable");
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });
});
