// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { ItemResponse, LibraryDTO } from "@/lib/api";
import ItemDetail, { type BrowseHandoff } from "@/pages/browse/ItemDetail";

// Group-2 slice: ItemDetail → useItem → getItem (the S5-style consumer joint
// for /api/v1/items/{id}). getItem is mocked at the api seam, so the page's
// document rendering (verbatim values, one card per namespace) and its error
// edges (404 → not-found state, not a crash; other errors → code + message
// inline) are asserted independently of the network. End-to-end is QA1.
//
// Group-3 slice: the audit tiers (sources, provenance, stages) collapsed into
// a native <details> "Technical details" disclosure — collapsed by default,
// full content once expanded. jsdom implements no layout, so "hidden" is
// asserted on the <details> open flag rather than on layout visibility.

/** Expands the Technical details disclosure (native, uncontrolled <details>). */
function expandTechnicalDetails(): HTMLDetailsElement {
  const details = screen.getByText("Technical details").closest(
    "details",
  ) as HTMLDetailsElement | null;
  expect(details).not.toBeNull();
  expect(details!.open).toBe(false);
  details!.open = true;
  return details!;
}

const ITEM_RESPONSE: ItemResponse = {
  item: {
    id: "itm_1_9",
    module_id: "tv",
    library_id: 1,
    file_id: "9",
    relative_path: "shows/Оська/s01e01.mkv",
    media_type: "video",
    schema_version: 1,
    status: "parsed",
    document: {
      identifiers: { tmdb_id: 42, imdb_id: "tt0000042" },
      sources: {
        "tv-parser": { title: "Оська", fps: 23.976023976023978 },
        "second-plugin": { title: "Oska" },
      },
      _view: {
        title: { value: "Оська", source: "tv-parser", lang: "ru", reason: "first" },
      },
      _provenance: {
        title: { plugin_id: "tv-parser", confidence: 0.98 },
      },
      _stages: [
        {
          stage: "metadata_source",
          plugin_id: "tv-parser",
          status: "failed",
          advanced_to: "failed",
          started_at: "2026-08-05T10:00:00Z",
          finished_at: "2026-08-05T10:00:01Z",
          error: "upstream 503",
        },
      ],
    },
  },
};

function renderAtId(id: string, client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/items/${id}`]}>
        <Routes>
          <Route path="/items/:id" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// A library row without the additive module presentation block — the media
// and happy-path renders mock getLibrary at the api seam so the ONLY network
// call a render makes is the hero's (and the identity column degrades to
// name + path, exactly the presentation-absent contract).
const LIBRARY_NO_MODULE: LibraryDTO = {
  id: 1,
  module_id: "tv",
  root_path: "/libs/tv",
  display_name: "Films",
  description: "",
  streams_enabled: true,
};

describe("ItemDetail — happy path (GET /api/v1/items/{id})", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders identifiers, one card per source namespace, view, provenance, and stages after expanding the disclosure", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);

    renderAtId("itm_1_9", freshClient());

    // Core-managed fields.
    expect(await screen.findByText("itm_1_9")).toBeDefined();
    // The raw path renders twice on the media-first page: the identity
    // column's raw path line and the core relative_path field.
    expect(screen.getAllByText("shows/Оська/s01e01.mkv").length).toBeGreaterThan(0);
    expect(screen.getByText("parsed")).toBeDefined();

    // Tier-1 identifiers, verbatim.
    expect(screen.getByText("tmdb_id")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("tt0000042")).toBeDefined();

    expandTechnicalDetails();

    // One SourceCard per namespace, same-named fields NOT merged, numbers
    // render at full precision. ("tv-parser" recurs across card title,
    // provenance, and stages.)
    expect(screen.getAllByText("tv-parser").length).toBeGreaterThan(0);
    expect(screen.getByText("second-plugin")).toBeDefined();
    expect(screen.getAllByText("Оська").length).toBeGreaterThan(0);
    expect(screen.getByText("Oska")).toBeDefined();
    expect(screen.getByText("23.976023976023978")).toBeDefined();

    // _view, _provenance, _stages (incl. the failed stage's error).
    expect(screen.getByText("tv-parser (ru) — first")).toBeDefined();
    expect(screen.getByText("0.98")).toBeDefined();
    expect(screen.getByText("upstream 503")).toBeDefined();
  });
});

describe("ItemDetail — Technical details disclosure", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("collapses sources, provenance, and stages until Technical details is expanded", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);

    renderAtId("itm_1_9", freshClient());

    // The Details surface renders immediately: core fields, identifiers, view.
    expect(await screen.findByText("itm_1_9")).toBeDefined();
    expect(screen.getByText("tmdb_id")).toBeDefined();
    expect(screen.getByText("tt0000042")).toBeDefined();
    expect(screen.getByText("tv-parser (ru) — first")).toBeDefined();

    // The disclosure exists, is collapsed by default, and carries the audit
    // tiers (sources, provenance, stages) inside it.
    const details = expandTechnicalDetails();
    expect(details.textContent).toContain("Sources");
    expect(details.textContent).toContain("Provenance");
    expect(details.textContent).toContain("Pipeline stages");

    // Expanded: the audit tiers render (one card per namespace, badge,
    // per-stage error) — same content as before the restructure.
    expect(screen.getAllByText("tv-parser").length).toBeGreaterThan(0);
    expect(screen.getByText("second-plugin")).toBeDefined();
    expect(screen.getByText("0.98")).toBeDefined();
    expect(screen.getByText("upstream 503")).toBeDefined();
  });
});

describe("ItemDetail — hero media (media-preview walkthrough feedback)", () => {
  // Same seams as the Collection tile tests: jsdom has no
  // createObjectURL/revokeObjectURL (stubbed observable), and the media bytes
  // travel the global fetch — spied here while getItem stays mocked at the
  // module seam, so the ONLY network call a render makes is the hero's.
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

  function mediaCalls(spy: { mock: { calls: unknown[][] } }): string[] {
    return spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/media"));
  }

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  const IMAGE_ITEM: ItemResponse = {
    item: {
      ...ITEM_RESPONSE.item,
      id: "itm_1_img",
      file_id: "img",
      relative_path: "photos/vacation.jpg",
      media_type: "image",
      document: {
        parsed: { absolute_path: "/libs/photos/vacation.jpg" },
      },
    },
  };

  const THUMB_ITEM: ItemResponse = {
    item: {
      ...ITEM_RESPONSE.item,
      id: "itm_1_ep",
      relative_path: "shows/Оська/s01e02.mkv",
      document: {
        sources: { "frame-grabber": { thumbnail_path: "/data/thumbs/ep.jpg" } },
      },
    },
  };

  it("leads the Details surface with the original for an image-typed item with an absolute-path fact", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(IMAGE_ITEM);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
    stubObjectUrls();
    // A FRESH Response per call: a Response body consumes once, and a render
    // now makes several fetches (the progress row joins the hero's).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => mediaResponse());

    renderAtId("itm_1_img", freshClient());

    const img = await screen.findByRole("img", { name: "photos/vacation.jpg" });
    expect(img.getAttribute("src")).toMatch(/^blob:/);
    // The ORIGINAL variant (no ?variant=) through the authenticated channel —
    // exactly one media request; the core fields still render beneath it.
    expect(mediaCalls(fetchSpy)).toEqual(["/api/v1/items/itm_1_img/media"]);
    expect(screen.getByText("itm_1_img")).toBeDefined();
  });

  it("uses the thumb variant for an item carrying the frame-grabber fact", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(THUMB_ITEM);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
    stubObjectUrls();
    // A FRESH Response per call: a Response body consumes once, and a render
    // now makes several fetches (the progress row joins the hero's).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => mediaResponse());

    renderAtId("itm_1_ep", freshClient());

    await screen.findByRole("img", { name: "shows/Оська/s01e02.mkv" });
    expect(mediaCalls(fetchSpy)).toEqual([
      "/api/v1/items/itm_1_ep/media?variant=thumb",
    ]);
  });

  it("renders no hero and fires no media request when no image resolvable (video, no thumb fact)", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
    stubObjectUrls();
    // A FRESH Response per call: a Response body consumes once, and a render
    // now makes several fetches (the progress row joins the hero's).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => mediaResponse());

    renderAtId("itm_1_9", freshClient());

    expect(await screen.findByText("itm_1_9")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
    expect(mediaCalls(fetchSpy)).toEqual([]);
  });
});

describe("ItemDetail — error edges", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders a clear not-found state on 404 not_found — no crash, no data", async () => {
    vi.spyOn(apiModule, "getItem").mockRejectedValue(
      new apiModule.ApiError(404, {
        code: "not_found",
        message: "item not found",
        retryable: false,
      }),
    );

    renderAtId("itm_missing", freshClient());

    expect(await screen.findByText(/Item not found/)).toBeDefined();
    expect(screen.getByText(/itm_missing/)).toBeDefined();
    // No crash: no source namespace and no destructive alert leaked through.
    expect(screen.queryByText("tv-parser")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("surfaces the canonical error inline (code + message) for other failures", async () => {
    vi.spyOn(apiModule, "getItem").mockRejectedValue(
      new apiModule.ApiError(503, {
        code: "unavailable",
        message: "storage busy",
        retryable: true,
      }),
    );

    renderAtId("itm_1_9", freshClient());

    expect(await screen.findByText("unavailable")).toBeDefined();
    expect(screen.getByText("storage busy")).toBeDefined();
    // The not-found state did NOT swallow a non-404 error.
    expect(screen.queryByText(/Item not found/)).toBeNull();
  });
});

// ParserFooter integration (element-pages groups 5.3/5.4): the page composes
// the footer groups — collection chain first (module presentation from
// GET /libraries/{id}), element-attached parsers (extra_parsers) after,
// pill-marked "element only". getLibrary is mocked at the api seam beside
// getItem, so the footer's ordering / slot / skip-absent / composite
// contracts are asserted independently of the network.

const TV_LIBRARY: LibraryDTO = {
  id: 1,
  module_id: "tv",
  root_path: "/libs/tv",
  display_name: "Films",
  description: "",
  streams_enabled: true,
  module: {
    identity_fields: ["title", "year"],
    parsers: [
      {
        id: "tv-parser",
        display_fields: ["title", "year", "resolution", "parsed_from"],
      },
      // Seeded-but-unloaded: no namespace in the document → slot group.
      { id: "frame-grabber", display_fields: ["thumbnail", "grabbed_at"] },
    ],
  },
};

const FOOTER_ITEM: ItemResponse = {
  item: {
    ...ITEM_RESPONSE.item,
    extra_parsers: ["anitomy"],
    document: {
      sources: {
        "tv-parser": {
          title: "Оська",
          year: 1964,
          resolution: "1080p",
          parsed_from: "Oska.1964.mkv",
        },
        anitomy: { release_group: "LEARRI", episode_title: "Дети" },
      },
    },
  },
};

describe("ItemDetail — ParserFooter (chain order, slots, element-only)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders groups in chain order, element-only after the chain, and unloaded parsers as slot groups", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(FOOTER_ITEM);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(TV_LIBRARY);

    renderAtId("itm_1_9", freshClient());

    // Await a surface only the presentation fetch can produce (the unloaded
    // frame-grabber slot group), so the region below is read with the chain
    // groups mounted, not on the extra_parsers-only first render.
    await screen.findByText("No data yet");

    const footer = await screen.findByRole("region", {
      name: "Metadata footer",
    });
    const text = footer.textContent ?? "";
    const idx = (s: string): number => text.indexOf(s);

    // Chain order: tv-parser, then the seeded-but-unloaded frame-grabber in
    // its chain position (slot, not a fabricated row), then the element-only
    // anitomy group after the chain.
    expect(idx("tv-parser")).toBeGreaterThan(-1);
    expect(idx("frame-grabber")).toBeGreaterThan(idx("tv-parser"));
    expect(idx("anitomy")).toBeGreaterThan(idx("frame-grabber"));

    // The unloaded chain parser renders as a slot group in its position.
    expect(text).toContain("No data yet");

    // Declared pair order within the tv-parser group (config IS render order;
    // parsed_from renders humanized).
    expect(idx("resolution")).toBeGreaterThan(idx("year"));
    expect(idx("parsed from")).toBeGreaterThan(idx("resolution"));

    // The element-only group is pill-marked and renders its namespace's own
    // fields, values verbatim.
    expect(text).toContain("element only");
    expect(text).toContain("release group");
    expect(text).toContain("LEARRI");
  });

  it("degrades to name+path identity and a chain-less footer when the presentation fetch fails", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);
    vi.spyOn(apiModule, "getLibrary").mockRejectedValue(
      new apiModule.ApiError(404, {
        code: "not_found",
        message: "library not found",
        retryable: false,
      }),
    );

    renderAtId("itm_1_9", freshClient());

    // The page itself still renders; no identity badges (no presentation),
    // no footer groups at all.
    expect(await screen.findByText("itm_1_9")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Metadata footer" })).toBeNull();
  });
});

describe("ItemDetail — ParserFooter skip-absent and composite labels", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  const IMAGE_LIBRARY: LibraryDTO = {
    id: 2,
    module_id: "image",
    root_path: "/libs/photos",
    display_name: "Photos",
    description: "",
    streams_enabled: true,
    module: {
      identity_fields: ["date_taken"],
      parsers: [
        {
          id: "image-enricher",
          display_fields: ["date_taken", "camera", "dimensions", "gps"],
        },
      ],
    },
  };

  function imageItem(sources: Record<string, Record<string, unknown>>): ItemResponse {
    return {
      item: {
        ...ITEM_RESPONSE.item,
        id: "itm_2_scan",
        module_id: "image",
        library_id: 2,
        media_type: "image",
        relative_path: "photos/1989.jpg",
        document: {
          parsed: { absolute_path: "/libs/photos/1989.jpg" },
          sources,
        },
      },
    };
  }

  it("skips absent pairs instead of zeroing them — dimensions alone when only width/height/format exist", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(
      imageItem({
        "image-enricher": { width: 3072, height: 2304, format: "JPEG" },
      }),
    );
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(IMAGE_LIBRARY);

    renderAtId("itm_2_scan", freshClient());

    const footer = await screen.findByRole("region", {
      name: "Metadata footer",
    });
    const text = footer.textContent ?? "";
    // The dimensions pair renders (composite width×height, values verbatim).
    expect(text).toContain("dimensions");
    expect(text).toContain("3072×2304");
    // The absent pairs (taken, camera, gps) are skipped, never zeroed.
    expect(text).not.toContain("camera");
    expect(text).not.toContain("date taken");
    expect(text).not.toContain("gps");
    // The missing mandatory identity field renders its slot, outside the footer.
    expect(screen.getByText(/date taken — not identified/)).toBeDefined();
  });

  it("joins composite labels from namespace facts — camera as make+model, dimensions as width×height", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(
      imageItem({
        "image-enricher": {
          make: "Minolta",
          model: "Hi-Matic",
          width: 4000,
          height: 3000,
        },
      }),
    );
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(IMAGE_LIBRARY);

    renderAtId("itm_2_scan", freshClient());

    const footer = await screen.findByRole("region", {
      name: "Metadata footer",
    });
    const text = footer.textContent ?? "";
    expect(text).toContain("Minolta Hi-Matic");
    expect(text).toContain("4000×3000");
  });
});

describe("ItemDetail — identity block (episode-name slot state)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  const SERIAL_LIBRARY: LibraryDTO = {
    id: 3,
    module_id: "serial",
    root_path: "/libs/serial",
    display_name: "Serials",
    description: "",
    streams_enabled: true,
    module: {
      identity_fields: ["display_title", "season", "episode"],
      parsers: [
        {
          id: "serial-parser",
          display_fields: ["display_title", "season", "parsed_from"],
        },
      ],
    },
  };

  const EPISODE_ITEM: ItemResponse = {
    item: {
      ...ITEM_RESPONSE.item,
      id: "itm_3_ep",
      module_id: "serial",
      library_id: 3,
      document: {
        sources: { "serial-parser": { season: 1, episode: 2 } },
      },
    },
  };

  it("stands the derived episode number in as the heading and names the missing episode name in a slot", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(EPISODE_ITEM);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(SERIAL_LIBRARY);

    renderAtId("itm_3_ep", freshClient());

    // The SxxEyy eyebrow stands in as the heading; the slot names the missing
    // episode name (never a blank, never a fabricated value). ("S01E02"
    // recurs — eyebrow paragraph + heading — and "episode" recurs across
    // badge, footer label, and slot.)
    expect((await screen.findAllByText("S01E02")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Episode name — not identified/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/season/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/episode/).length).toBeGreaterThan(0);
  });
});

// ---- Browse view + photo slideshow (element-pages groups 6.1–6.4) ----------
//
// The ordered-view handoff (location.state, element-pages 6.2) drives prev/
// next browsing: the page opens at the clicked item's POSITION, ←/→ and the
// chevrons move with wrap-around at both edges, and the counter reflects
// every move (6.1). On photos, S / the button toggles a ~2.5s auto-advance;
// pausing keeps the current photo (6.3); manual navigation resets the timer,
// Esc stops a running slideshow first and only then navigates back, and the
// interval never survives the page (6.4). getItem is mocked per id at the
// api seam; the hero bytes travel the global fetch as in the hero tests.

function photoItem(id: string, path: string): ItemResponse {
  return {
    item: {
      id,
      module_id: "image",
      library_id: 2,
      file_id: id,
      relative_path: path,
      media_type: "image",
      schema_version: 1,
      status: "parsed",
      document: { parsed: { absolute_path: `/libs/photos/${path}` } },
    },
  };
}

const PHOTO_A = photoItem("itm_a", "photos/a.jpg");
const PHOTO_B = photoItem("itm_b", "photos/b.jpg");
const PHOTO_C = photoItem("itm_c", "photos/c.jpg");

function mockItems(...items: ItemResponse[]): void {
  vi.spyOn(apiModule, "getItem").mockImplementation(async (id: string) => {
    const hit = items.find((candidate) => candidate.item.id === id);
    if (hit) {
      return hit;
    }
    throw new apiModule.ApiError(404, {
      code: "not_found",
      message: "item not found",
      retryable: false,
    });
  });
  vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
}

function stubMedia(): ReturnType<typeof vi.fn> {
  const create = vi.fn(() => "blob:mock");
  Object.defineProperty(URL, "createObjectURL", {
    value: create,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
  // A FRESH Response per call — a Response body consumes once, and a browse
  // step fetches the next item's hero.
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response("jpeg-bytes", {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
  );
  return create;
}

function renderBrowse(
  initialId: string,
  handoff: BrowseHandoff,
  client: QueryClient,
): void {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          { pathname: `/items/${initialId}`, state: handoff },
          handoff.backTo,
        ]}
        initialIndex={0}
      >
        <Routes>
          <Route path="/items/:id" element={<ItemDetail />} />
          <Route path="/collections/:id" element={<p>Collection page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// flushTicks — deliver timer-scheduled ticks under the faked clock (TanStack
// Query routes result notifications through setTimeout hops), so a step's new
// item resolves inside act. A 0ms advance runs ONLY due timers — a pending
// slideshow interval (2.5s out) never fires.
async function flushTicks(): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
  }
}

describe("ItemDetail — browse view: handoff position, arrows, wrap-around, counter", () => {
  const HANDOFF: BrowseHandoff = {
    items: ["itm_a", "itm_b", "itm_c"],
    position: 2,
    backTo: "/collections/2",
  };

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("opens at the handed-off position and browses with wrap-around on the arrow keys", async () => {
    mockItems(PHOTO_A, PHOTO_B, PHOTO_C);
    stubMedia();

    renderBrowse("itm_c", HANDOFF, freshClient());

    // Opens at the CLICKED position (third of three), not the first item.
    expect(await screen.findByText("Position 3 / 3")).toBeDefined();

    // → from the last photo wraps to the first, and the counter moves.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Position 1 / 3")).toBeDefined();

    // ← from the first wraps back to the last.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByText("Position 3 / 3")).toBeDefined();

    // Each step is the ordinary single-item fetch of the item it moved to.
    expect(apiModule.getItem).toHaveBeenCalledWith("itm_c");
    expect(apiModule.getItem).toHaveBeenCalledWith("itm_a");
  });

  it("moves with the chevron buttons and renders the keys hint", async () => {
    mockItems(PHOTO_A, PHOTO_B, PHOTO_C);
    stubMedia();

    renderBrowse("itm_c", HANDOFF, freshClient());

    expect(await screen.findByText("Position 3 / 3")).toBeDefined();
    expect(
      screen.getByText("←/→ browse · S slideshow · Esc stop / back"),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Next item" }));
    expect(await screen.findByText("Position 1 / 3")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Previous item" }));
    expect(await screen.findByText("Position 3 / 3")).toBeDefined();
  });
});

describe("ItemDetail — photo slideshow: toggle, ~2.5s auto-advance, pause keeps the photo", () => {
  const HANDOFF: BrowseHandoff = {
    items: ["itm_a", "itm_b"],
    position: 1,
    backTo: "/collections/2",
  };

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("advances at roughly the interval, shows the running state, and S pauses on the current photo", async () => {
    mockItems(PHOTO_A, PHOTO_B);
    stubMedia();

    renderBrowse("itm_b", HANDOFF, freshClient());
    expect(await screen.findByText("Position 2 / 2")).toBeDefined();

    // Fake timers AFTER the initial await: everything below is driven by
    // explicit clock advances.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Start slideshow" }));
    expect(
      screen.getByRole("button", { name: "Pause slideshow" }),
    ).toBeDefined();

    // Under the interval (~2.5s): holds before, advances (wrapping 2/2 →
    // 1/2) at it. The advance that fires navigates to the next item — the
    // trailing act flush lets the stepped item's query resolve.
    await act(async () => {
      vi.advanceTimersByTime(1800);
    });
    expect(screen.getByText("Position 2 / 2")).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await flushTicks();
    expect(screen.getByText("Position 1 / 2")).toBeDefined();

    // S pauses; the current photo is kept.
    fireEvent.keyDown(window, { key: "s" });
    expect(
      screen.getByRole("button", { name: "Start slideshow" }),
    ).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Position 1 / 2")).toBeDefined();
  });
});

describe("ItemDetail — slideshow interplay: manual reset, Esc stop-then-back", () => {
  const HANDOFF: BrowseHandoff = {
    items: ["itm_a", "itm_b"],
    position: 1,
    backTo: "/collections/2",
  };

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("resets the timer on manual navigation; the first Esc stops the slideshow, the second navigates back", async () => {
    mockItems(PHOTO_A, PHOTO_B);
    stubMedia();

    renderBrowse("itm_b", HANDOFF, freshClient());
    expect(await screen.findByText("Position 2 / 2")).toBeDefined();

    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: "s" }); // start via the key
    expect(
      screen.getByRole("button", { name: "Pause slideshow" }),
    ).toBeDefined();

    // 1.5s into the interval a manual → wraps 2/2 → 1/2 and RESETS the
    // timer: the page still holds 2s later, then advances 1s after that
    // (without the reset the 1.5s already elapsed would advance it early).
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await flushTicks();
    expect(screen.getByText("Position 1 / 2")).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Position 1 / 2")).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await flushTicks();
    expect(screen.getByText("Position 2 / 2")).toBeDefined();

    // First Esc: stops the RUNNING slideshow, same photo.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: "Start slideshow" }),
    ).toBeDefined();
    expect(screen.getByText("Position 2 / 2")).toBeDefined();

    // Second Esc (not running): navigates back to the collection.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Collection page")).toBeDefined();
  });
});
