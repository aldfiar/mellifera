// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Home, { formatPosition } from "@/pages/home/Home";
import type { ContinueRow, ItemDTO, LibraryDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";

// The collections surface's OWN behavior, asserted at the fetch seam (the
// same idiom as Sidebar.test.tsx). The grid (summary data, zero-item state,
// type-chip client-side filter) and the Continue rail — ONE GET /api/v1/home
// round-trip, served rows rendered verbatim in served order, the bar only
// when duration_seconds exists, the next affordance from the served label,
// the shared empty state — are the load-bearing logic here; layout itself is
// CSS's contract.

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

// item — an ItemDTO fixture for the collection-card preview pages (the
// Continue rail consumes served rows, never item documents).
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

// row — a served ContinueRow fixture (home.go's wire shape): the fields the
// rail renders verbatim. Defaults give the row a served series (with the
// parsed S01E05 identity), a composed display name, a 1488s position over a
// 2400s duration (62%) and the next offer; overrides strip any of them to
// the honest absence shapes (a film row: no series, no season/episode, no
// duration, no next).
function row(overrides: {
  itemId?: string;
  display?: string;
  series?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  position?: number;
  duration?: number;
  libraryName?: string;
  artwork?: string;
  next?: { item_id: string; label: string } | null;
}): ContinueRow {
  // The parsed episode identity: S01E05 for the default serial row, the
  // overridden pair when one is given, ABSENT for a film row (a series-less
  // row — the server omits the fields, never zeroes them).
  const identity =
    overrides.episode !== undefined
      ? { season: overrides.season ?? 1, episode: overrides.episode }
      : overrides.series
        ? { season: 1, episode: 5 }
        : {};
  return {
    series_id: overrides.series !== undefined && overrides.series !== "" ? "ser_2_show" : "",
    series_display_name: overrides.series ?? "",
    library_id: 2,
    library_name: overrides.libraryName ?? "serials",
    ...(overrides.artwork !== undefined ? { artwork: overrides.artwork } : {}),
    current: {
      item_id: overrides.itemId ?? "itm_2_ep5",
      display_name: overrides.display ?? "Very Cold Show · S01E05",
      ...identity,
      ...(overrides.episodeTitle !== undefined
        ? { episode_title: overrides.episodeTitle }
        : {}),
      position_seconds: overrides.position ?? 1488,
      ...(overrides.duration !== undefined
        ? { duration_seconds: overrides.duration }
        : {}),
    },
    ...(overrides.next !== undefined && overrides.next !== null
      ? { next: overrides.next }
      : {}),
  };
}

// stubObjectUrls — jsdom has no createObjectURL/revokeObjectURL; the media
// hook's whole contract is those two calls, so they are observable stubs here
// (shared by every test that renders a thumb or artwork preview).
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
    // The rail's ONE request — the grid tests render it empty (the empty
    // state), the grid itself is the subject here.
    "/api/v1/home": () => Promise.resolve(jsonResponse(200, { continue: [] })),
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

describe("Home — Continue rail (the single /home request)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the served rows verbatim in served order from exactly ONE /home request — no /progress, no series or episode fetches; bar only with duration; next affordance from the served label", async () => {
    const spy = fetchWith({
      // The served order is the server's rec_score order — row A first even
      // though nothing about the row ids suggests it; the rail re-sorts
      // nothing.
      "/api/v1/home": () =>
        Promise.resolve(
          jsonResponse(200, {
            continue: [
              row({
                series: "Very Cold Show",
                display: "Very Cold Show · S01E05",
                episodeTitle: "The Long Dark",
                position: 1488,
                duration: 2400,
                next: { item_id: "itm_2_ep6", label: "S01E06" },
              }),
              // The film row: series fields honestly empty (no series, no
              // parsed identity), NO duration fact (the bar-less row), no
              // next (an episode concept).
              row({
                itemId: "itm_1_film",
                series: "",
                display: "Film Two",
                position: 2712,
                duration: undefined,
                episodeTitle: undefined,
                libraryName: "films",
              }),
            ],
          }),
        ),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(2, "serial", "serials")] })),
      "/api/v1/libraries/2/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 2, items: 4, updated_at: "" })),
      "/api/v1/items?library=2": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
    });
    renderHome();

    const rail = await screen.findByRole("region", { name: "Continue" });

    // THE one-request assertion: exactly one GET /api/v1/home, and NONE of
    // the old fan-out's fetches — no /progress listing, no per-series lists,
    // no episode lists, no per-item document fetches.
    const urls = spy.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("/api/v1/home"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/api/v1/progress"))).toEqual([]);
    expect(urls.filter((u) => u.includes("/api/v1/series"))).toEqual([]);
    expect(urls.filter((u) => /\/api\/v1\/items\/[^?]/.test(u))).toEqual([]);

    // EXACTLY the served rows, in the served order. Each card carries its
    // Play link (the current item) and — where served — the Next affordance.
    const links = within(rail)
      .getAllByRole("link")
      .map((l) => l.getAttribute("aria-label"));
    expect(links).toEqual([
      "Play Very Cold Show · S01E05",
      "Next S01E06",
      "Play Film Two",
    ]);

    // Play deep-links into the current item; the served next label navigates
    // into next.item_id — neither composed client-side.
    expect(
      within(rail).getByRole("link", { name: "Play Very Cold Show · S01E05" }).getAttribute("href"),
    ).toBe("/items/itm_2_ep5");
    const nextLink = within(rail).getByRole("link", { name: "Next S01E06" });
    expect(nextLink.getAttribute("href")).toBe("/items/itm_2_ep6");
    expect(nextLink.textContent).toContain("S01E06");
    expect(
      within(rail).getByRole("link", { name: "Play Film Two" }).getAttribute("href"),
    ).toBe("/items/itm_1_film");

    // Served fields verbatim: the series line, the composed display name and
    // the episode's own served title.
    expect(within(rail).getByText("Very Cold Show")).toBeDefined();
    expect(within(rail).getByText("The Long Dark")).toBeDefined();

    // The percent bar renders ONLY where the row carries duration_seconds
    // (62%); the bar-less film row still shows its position label (45:12) —
    // the honest absence, never a fake bar.
    expect(screen.getByRole("img", { name: "62% watched" })).toBeDefined();
    expect(within(rail).getAllByRole("img").length).toBe(1);
    expect(await within(rail).findByText(/45:12/)).toBeDefined();
    // The film row renders no next affordance — exactly one Next link total.
    expect(within(rail).getAllByRole("link", { name: /^Next/ })).toHaveLength(1);
  });

  it("renders the shared empty state when the /home response carries no rows", async () => {
    fetchWith(gridFetch());
    renderHome();

    await screen.findByText("films");
    expect(await screen.findByText(/Nothing in progress yet/)).toBeDefined();
    expect(screen.queryByRole("region", { name: "Continue" })).toBeNull();
  });

  it("rides the artwork preview only through the served proxy URL — absent or raw-remote artwork keeps the honest badge-only card", async () => {
    stubObjectUrls();
    const spy = fetchWith({
      "/api/v1/home": () =>
        Promise.resolve(
          jsonResponse(200, {
            continue: [
              // The staged winner's proxy form — the ONE shape that rides the
              // authenticated byte channel.
              row({ artwork: "/api/v1/art/object/art_abc" }),
              // A raw remote URL (an unmaterialized winner's transient) is
              // NEVER fetched — no bearer leak, no external request; the
              // badge-only card until the proxy form lands.
              row({
                itemId: "itm_2_ep7",
                display: "Very Cold Show · S01E07",
                artwork: "https://remote.example/poster.jpg",
              }),
              // No artwork at all — the badge-only card.
              row({ itemId: "itm_2_ep8", display: "Very Cold Show · S01E08" }),
            ],
          }),
        ),
      "/api/v1/art/object/": () =>
        Promise.resolve(
          new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } }),
        ),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(2, "serial", "serials")] })),
      "/api/v1/libraries/2/summary": () =>
        Promise.resolve(jsonResponse(200, { library_id: 2, items: 4, updated_at: "" })),
      "/api/v1/items?library=2": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
    });
    renderHome();

    const rail = await screen.findByRole("region", { name: "Continue" });
    const withArt = within(rail).getByRole("link", { name: "Play Very Cold Show · S01E05" });
    await waitFor(() => expect(withArt.querySelector("img")).not.toBeNull());
    // Exactly ONE byte fetch — the proxy URL. The remote URL and the absent
    // artwork fetched nothing, and their cards carry no img at all.
    expect(
      spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/api/v1/art/object/")),
    ).toEqual(["/api/v1/art/object/art_abc"]);
    expect(spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("remote.example"))).toEqual([]);
    expect(
      within(rail).getByRole("link", { name: "Play Very Cold Show · S01E07" }).querySelector("img"),
    ).toBeNull();
    expect(
      within(rail).getByRole("link", { name: "Play Very Cold Show · S01E08" }).querySelector("img"),
    ).toBeNull();
  });
});

describe("Home — pure formatting", () => {
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
      "/api/v1/home": () => Promise.resolve(jsonResponse(200, { continue: [] })),
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
      "/api/v1/home": () => Promise.resolve(jsonResponse(200, { continue: [] })),
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
