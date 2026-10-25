// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { ItemResponse, LibraryDTO, PlaybackDescriptor } from "@/lib/api";
import { TOKEN_KEY } from "@/lib/auth";
import ItemDetail, { type BrowseHandoff } from "@/pages/browse/ItemDetail";

// Group-2 slice: ItemDetail → useItem → getItem (the S5-style consumer joint
// for /api/v1/items/{id}). getItem is mocked at the api seam, so the page's
// document rendering (verbatim values, one card per namespace) and its error
// edges (404 → not-found state, not a crash; other errors → code + message
// inline) are asserted independently of the network. End-to-end is QA1.
//
// Group-2 slice: the "Item" core fields, identifiers, and view folded into
// the same "Technical details" disclosure, ahead of the audit tiers — the
// always-visible tier is the media-first ladder, the identity block, and the
// ParserFooter.
//
// The disclosure is a native <details>, collapsed by default, full content
// once expanded. jsdom implements no layout, so "hidden" is asserted on the
// <details> open flag rather than on layout visibility.

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
    module_id: "serial",
    library_id: 1,
    file_id: "9",
    relative_path: "shows/Оська/s01e01.mkv",
    media_type: "serial",
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

  it("renders core fields, identifiers, one card per source namespace, view, provenance, and stages after expanding the disclosure", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);

    renderAtId("itm_1_9", freshClient());

    // The always-visible tier mounts (the identity column's heading) before
    // the disclosure is touched.
    expect((await screen.findAllByText("Оська")).length).toBeGreaterThan(0);

    expandTechnicalDetails();

    // Core-managed fields (folded under the disclosure).
    expect(screen.getAllByText("itm_1_9").length).toBeGreaterThan(0);
    // The raw path renders twice on the page: the identity column's raw path
    // line and the folded core relative_path field.
    expect(screen.getAllByText("shows/Оська/s01e01.mkv").length).toBeGreaterThan(0);
    expect(screen.getByText("parsed")).toBeDefined();

    // Tier-1 identifiers, verbatim.
    expect(screen.getByText("tmdb_id")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("tt0000042")).toBeDefined();

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

  it("collapses core fields, identifiers, view, sources, provenance, and stages until Technical details is expanded", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);

    renderAtId("itm_1_9", freshClient());

    // The always-visible tier (media-first ladder, identity block, footer)
    // renders immediately; the folded tiers wait behind the disclosure.
    expect((await screen.findAllByText("Оська")).length).toBeGreaterThan(0);

    // The disclosure exists, is collapsed by default (the open flag), and
    // carries the folded core fields, identifiers, view, and the audit tiers
    // (sources, provenance, stages) inside it.
    const details = expandTechnicalDetails();
    expect(details.textContent).toContain("Sources");
    expect(details.textContent).toContain("Provenance");
    expect(details.textContent).toContain("Pipeline stages");

    // Expanded: the folded tiers render — core fields, identifiers, view,
    // one card per namespace, badge, per-stage error — same content as
    // before the restructure.
    expect(screen.getAllByText("itm_1_9").length).toBeGreaterThan(0);
    expect(screen.getByText("tmdb_id")).toBeDefined();
    expect(screen.getByText("tt0000042")).toBeDefined();
    expect(screen.getByText("tv-parser (ru) — first")).toBeDefined();
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
    // exactly one media request; the id text (inside the disclosure) still
    // mounts.
    expect(mediaCalls(fetchSpy)).toEqual(["/api/v1/items/itm_1_img/media"]);
    expect(screen.getByText("itm_1_img")).toBeDefined();
  });

  it("still fetches the thumb variant for an item carrying the frame-grabber fact — but renders no hero img (fix-episode-playback 3.1: the thumb rides the player as its poster)", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(THUMB_ITEM);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
    stubObjectUrls();
    // A FRESH Response per call: a Response body consumes once, and a render
    // now makes several fetches (the progress row joins the hero's).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => mediaResponse());

    renderAtId("itm_1_ep", freshClient());

    // The thumb fetch fires on the fact (pre-selection unchanged), but the
    // video lane renders no separate hero <img> — the blob is the player's
    // poster, and with no descriptor mocked here no player mounts.
    await screen.findByText("itm_1_ep");
    expect(mediaCalls(fetchSpy)).toEqual([
      "/api/v1/items/itm_1_ep/media?variant=thumb",
    ]);
    expect(screen.queryByRole("img")).toBeNull();
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

// fix-episode-playback 3.1 — the episode page shows only the player: the
// frame-grabber thumb blob rides the <video> as its poster attribute, the
// video lane renders NO separate hero <img>, and the photo lane keeps its
// hero photo (asserted by the "leads the Details surface with the original"
// test above — the photo lane is untouched). getItem/getPlayback mocked at
// the api seam; the thumb bytes travel the global fetch as in the hero tests.
describe("ItemDetail — episode poster (fix-episode-playback 3.1)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  const EPISODE_WITH_THUMB: ItemResponse = {
    item: {
      ...ITEM_RESPONSE.item,
      id: "itm_poster_ep",
      status: "ready",
      relative_path: "shows/Оська/s01e03.mkv",
      document: {
        sources: { "frame-grabber": { thumbnail_path: "/data/thumbs/ep3.jpg" } },
      },
    },
  };

  it("renders the player carrying the thumb poster URL and NO separate hero img in the video lane", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(EPISODE_WITH_THUMB);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
    vi.spyOn(apiModule, "getPlayback").mockResolvedValue(HLS_PLAYBACK);
    // The progress PUT is Player-internal and irrelevant here.
    vi.spyOn(apiModule, "putProgress").mockResolvedValue({
      item_id: "itm_poster_ep",
      position_seconds: 0,
      updated_at: "",
    });
    // jsdom has no blob URL factory — the stubbed observable, as in the hero
    // tests. Fetch answers media URLs with thumb bytes, everything else
    // (the progress list) with an empty JSON body.
    const create = vi.fn((blob: Blob) => `blob:thumb-${String(blob.size)}-poster`);
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
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        if (String(input).includes("/media")) {
          return new Response("jpeg-bytes", {
            status: 200,
            headers: { "Content-Type": "image/jpeg" },
          });
        }
        return new Response('{"items":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

    renderAtId("itm_poster_ep", freshClient());

    // The player mounts on the resolved descriptor in the video lane.
    expect(await screen.findByRole("region", { name: "Player" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Media stage" })).toBeDefined();

    // The thumb blob (resolved through the authenticated channel) arrives as
    // the <video>'s poster attribute — not as a separate hero <img>.
    await waitFor(() => {
      expect(theVideo().getAttribute("poster")).toMatch(/^blob:thumb-\d+-poster$/);
    });
    expect(create.mock.calls[0][0]).toMatchObject({ type: "image/jpeg" });
    expect(
      fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/media")),
    ).toEqual(["/api/v1/items/itm_poster_ep/media?variant=thumb"]);
    expect(screen.queryByRole("img")).toBeNull();
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
          display_fields: ["display_title", "season_episode", "parsed_from"],
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
        sources: {
          "serial-parser": { season: 1, episode: 2, parsed_from: "Show/S01E02.mkv" },
        },
      },
    },
  };

  const SERIES_ITEM: ItemResponse = {
    item: {
      ...ITEM_RESPONSE.item,
      id: "itm_3_series",
      module_id: "serial",
      library_id: 3,
      document: {
        sources: {
          "serial-parser": { season: 2, parsed_from: "Show (2023)" },
        },
      },
    },
  };

  it("stands the derived episode number in as the heading and names the missing name in its identity slot", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(EPISODE_ITEM);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(SERIAL_LIBRARY);

    renderAtId("itm_3_ep", freshClient());

    // The SxxEyy eyebrow stands in as the heading; the identity slot names
    // the missing name field and carries its cure inline (management-ui E:
    // a curable slot states the cure) — no second "Episode name" note for
    // the same missing fact. ("S01E02" recurs — eyebrow paragraph + heading
    // — and "episode" recurs across badge, footer label, and slot.)
    expect((await screen.findAllByText("S01E02")).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/display title — not identified/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Name manually…").length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Episode name — not identified/)).toHaveLength(
      0,
    );
    expect(screen.getAllByText(/season/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/episode/).length).toBeGreaterThan(0);

    // The footer's season_episode pair renders the label-aware composite from
    // the namespace facts (unified-parser 3.1).
    const footer = await screen.findByRole("region", { name: "Metadata footer" });
    expect(footer.textContent).toContain("Season 1 · Episode 2");
  });

  it("renders season_episode as the bare season label when the episode fact is absent (series document)", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(SERIES_ITEM);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(SERIAL_LIBRARY);

    renderAtId("itm_3_series", freshClient());

    // Season alone → "Season 2"; no Episode part is fabricated.
    const footer = await screen.findByRole("region", { name: "Metadata footer" });
    expect(footer.textContent).toContain("Season 2");
    expect(footer.textContent).not.toContain("Episode 2");
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

// ---- Watch controls (serial-watch-flow group 5) ----------------------------
//
// The episode page's subtitle + voiceover selection. getItem/getPlayback are
// mocked at the api seam; the sidecar bytes travel the global fetch (spied),
// the converted WebVTT rides stubbed blob URLs, and hls.js is mocked at the
// module seam exactly as in Player.test.tsx (jsdom has no MSE) — so the
// control's contracts (sidecar list + not-renderable state, document-indexed
// authenticated fetch, direct-build disabled state, per-visit selections)
// are asserted independently of the network. The mock is file-wide but only
// load-bearing here: the earlier describes' playback fetch fails, so their
// Player never mounts.

const watchHls = vi.hoisted(() => {
  const instances: WatchFakeHls[] = [];
  class WatchFakeHls {
    static isSupported = vi.fn(() => true);
    static Events = { ERROR: "error", AUDIO_TRACKS_UPDATED: "hlsAudioTracksUpdated" };
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    on = vi.fn();
    off = vi.fn();
    audioTracks: string[] = ["embedded", "rus"];
    audioTrack = 0;
    constructor() {
      instances.push(this);
    }
  }
  return { FakeHls: WatchFakeHls, instances };
});

vi.mock("hls.js/light", () => ({ default: watchHls.FakeHls }));

// An episode with the sidecar facts (serial-scanner posture): one top-level
// .ass, one AUDIO sidecar interleaved at document index 1 (the n= space the
// media endpoint resolves is the FULL list), one language-stamped .srt in a
// folder, and one .sub — the not-renderable case (box 5.2).
const SIDECAR_EPISODE: ItemResponse = {
  item: {
    ...ITEM_RESPONSE.item,
    id: "itm_5_ep",
    document: {
      parsed: {
        sidecars: [
          { relative_path: "s01e01.ass", kind: "subtitle", language: "" },
          {
            relative_path: "Rus sound/s01e01.mka",
            kind: "audio",
            language: "Русская",
          },
          {
            relative_path: "Rus subs/s01e01.srt",
            kind: "subtitle",
            language: "Русская",
          },
          { relative_path: "s01e01.sub", kind: "subtitle", language: "" },
        ],
      },
    },
  },
};

// The stepped-to episode carries the SAME sidecar facts, so the reset
// assertion reads the controls on a page that still renders them.
const NEXT_EPISODE: ItemResponse = {
  item: {
    ...SIDECAR_EPISODE.item,
    id: "itm_5_next",
    relative_path: "shows/Оська/s01e02.mkv",
  },
};

// A plain episode — no sidecar facts, no watch-control surface.
const PLAIN_EPISODE: ItemResponse = {
  item: {
    ...SIDECAR_EPISODE.item,
    id: "itm_5_next",
    relative_path: "shows/Оська/s01e02.mkv",
    document: {},
  },
};

const HLS_PLAYBACK: PlaybackDescriptor = {
  mode: "hls",
  state: "complete",
  play_url: "/media/itm_5_ep/abc123/index.m3u8?token=tok",
  sections: [],
  voiceovers: [{ index: 1, label: "Русская" }],
};

const DIRECT_PLAYBACK: PlaybackDescriptor = {
  mode: "direct",
  state: "none",
  play_url: "/media/itm_5_ep/original?token=tok",
  sections: [],
  voiceovers: [{ index: 1, label: "Русская" }],
};

const SRT_BYTES = [
  "1",
  "00:00:01,000 --> 00:00:04,000",
  "Привет",
].join("\n");

function mockPlayback(descriptor: PlaybackDescriptor): void {
  vi.spyOn(apiModule, "getItem").mockImplementation(async (id: string) => {
    if (id === SIDECAR_EPISODE.item.id) {
      return SIDECAR_EPISODE;
    }
    if (id === NEXT_EPISODE.item.id) {
      return NEXT_EPISODE;
    }
    throw new apiModule.ApiError(404, {
      code: "not_found",
      message: "item not found",
      retryable: false,
    });
  });
  vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
  vi.spyOn(apiModule, "getPlayback").mockResolvedValue(descriptor);
  // The progress PUT is Player-internal and irrelevant here.
  vi.spyOn(apiModule, "putProgress").mockResolvedValue({
    item_id: SIDECAR_EPISODE.item.id,
    position_seconds: 0,
    updated_at: "",
  });
}

// stubSidecarChannel — blob URL stubs (jsdom has none) plus a fetch spy that
// answers sidecar URLs with the given subtitle bytes and everything else
// (the progress list) with an empty JSON body. The spy stays in the closure;
// the tests read the sidecar calls' URLs through sidecarCalls().
function stubSidecarChannel(content: string): {
  sidecarCalls: () => Array<{ url: string; init?: RequestInit }>;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn(() => `blob:vtt-${String(create.mock.calls.length)}`);
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
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      if (String(input).includes("variant=sidecar")) {
        return new Response(content, { status: 200 });
      }
      return new Response('{"items":[]}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
  return {
    sidecarCalls: () =>
      fetchSpy.mock.calls
        .map((c) => ({ url: String(c[0]), init: c[1] as RequestInit }))
        .filter((call) => call.url.includes("variant=sidecar")),
    create,
  };
}

function theVideo(): HTMLVideoElement {
  return screen
    .getByRole("region", { name: "Player" })
    .querySelector("video") as HTMLVideoElement;
}

// Structural video-ness (video-item-pages 1.1): a ready serial episode —
// media_type "serial", the production vocabulary (no scanner ever writes the
// literal "video") — takes the media-first VIDEO lane and mounts the Player
// once the mocked descriptor resolves. The old media_type equality gates
// muted every real item; this pins the predicate flip.
describe("ItemDetail — structural video-ness (ready serial episode plays)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders the video lane and mounts the Player when the descriptor resolves", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue({
      item: {
        ...ITEM_RESPONSE.item,
        id: "itm_ready_ep",
        status: "ready",
        document: {},
      },
    });
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
    vi.spyOn(apiModule, "getPlayback").mockResolvedValue(HLS_PLAYBACK);
    // The progress PUT is Player-internal and irrelevant here.
    vi.spyOn(apiModule, "putProgress").mockResolvedValue({
      item_id: "itm_ready_ep",
      position_seconds: 0,
      updated_at: "",
    });

    renderAtId("itm_ready_ep", freshClient());

    // The Player mounts a real <video> on the resolved descriptor, the
    // media-first video lane's Media stage section leads, and the identity
    // block's resume row reads the same video-ness (no stored progress →
    // "Play from the start.").
    expect(await screen.findByRole("region", { name: "Player" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Media stage" })).toBeDefined();
    expect(screen.getByText("Play from the start.")).toBeDefined();
    expect(theVideo()).not.toBeNull();
  });
});

describe("ItemDetail — subtitle control (serial-watch-flow 5.1/5.2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem(TOKEN_KEY, "tok-5");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TOKEN_KEY);
  });

  it("lists the sidecars language-then-folder-then-file with the .sub entry not renderable", async () => {
    mockPlayback(HLS_PLAYBACK);
    stubSidecarChannel(SRT_BYTES);

    renderAtId("itm_5_ep", freshClient());

    const select = (await screen.findByLabelText(
      "Subtitles",
    )) as HTMLSelectElement;
    expect(
      Array.from(select.options).map((option) => ({
        text: option.textContent,
        disabled: option.disabled,
      })),
    ).toEqual([
      { text: "Off", disabled: false },
      { text: "s01e01.ass", disabled: false },
      { text: "Русская", disabled: false },
      // Box 5.2: an explicit not-renderable state — listed, NOT selectable.
      { text: "s01e01.sub — not renderable", disabled: true },
    ]);
  });

  it("fetches the selected sidecar by DOCUMENT index through the bearer channel and renders the converted track", async () => {
    mockPlayback(HLS_PLAYBACK);
    const { sidecarCalls, create } = stubSidecarChannel(SRT_BYTES);

    renderAtId("itm_5_ep", freshClient());

    // The language-stamped .srt sits at DOCUMENT index 2 (the interleaved
    // audio sidecar occupies index 1) — the fetch's n= is that index.
    fireEvent.change(await screen.findByLabelText("Subtitles"), {
      target: { value: "2" },
    });

    await waitFor(() => {
      expect(sidecarCalls()).toHaveLength(1);
    });
    expect(sidecarCalls()[0].url).toBe(
      "/api/v1/items/itm_5_ep/media?variant=sidecar&n=2",
    );
    // The bearer channel: same Authorization posture as every /api/v1 call.
    expect(sidecarCalls()[0].init).toMatchObject({
      headers: { Authorization: "Bearer tok-5" },
    });

    // The bytes became ONE text/vtt blob object URL riding the <video> as a
    // default subtitles <track>.
    await waitFor(() => {
      expect(theVideo().querySelector("track")).not.toBeNull();
    });
    const track = theVideo().querySelector("track")!;
    expect(track.getAttribute("kind")).toBe("subtitles");
    expect(track.getAttribute("src")).toMatch(/^blob:/);
    expect(create.mock.calls[0][0]).toMatchObject({ type: "text/vtt" });
  });

  it("renders no subtitle control when the document carries no subtitle sidecars", async () => {
    mockPlayback(HLS_PLAYBACK);
    vi.spyOn(apiModule, "getItem").mockImplementation(async () => PLAIN_EPISODE);
    stubSidecarChannel(SRT_BYTES);

    renderAtId("itm_5_next", freshClient());

    expect(await screen.findByText("itm_5_next")).toBeDefined();
    expect(screen.queryByLabelText("Subtitles")).toBeNull();
  });
});

describe("ItemDetail — voiceover control (serial-watch-flow 5.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    watchHls.instances.length = 0; // this file's renders accumulate fake loaders
  });
  afterEach(() => vi.restoreAllMocks());

  it("lists embedded audio plus the descriptor's voiceovers and switches the hls audioTrack in place", async () => {
    mockPlayback(HLS_PLAYBACK);

    renderAtId("itm_5_ep", freshClient());

    const select = (await screen.findByLabelText(
      "Voiceover",
    )) as HTMLSelectElement;
    expect(
      Array.from(select.options).map((option) => option.textContent),
    ).toEqual(["Embedded audio", "Русская"]);

    // Document order → rendition k+1: the first voiceover is audioTrack 1.
    fireEvent.change(select, { target: { value: "1" } });
    await waitFor(() => {
      expect(watchHls.instances[0]?.audioTrack).toBe(1);
    });
    // One loader for the play URL — a switch, never a restart.
    expect(watchHls.instances).toHaveLength(1);
  });

  it("renders the control disabled with the packaged-build reason on a direct build", async () => {
    mockPlayback(DIRECT_PLAYBACK);

    renderAtId("itm_5_ep", freshClient());

    const select = (await screen.findByLabelText(
      "Voiceover",
    )) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    // The voiceovers still LIST (embedded + the descriptor's), and the named
    // reason is visible — never a silently dead control.
    expect(
      Array.from(select.options).map((option) => option.textContent),
    ).toEqual(["Embedded audio", "Русская"]);
    expect(
      screen.getByText(/Audio selection requires the packaged build/),
    ).toBeDefined();
  });
});

describe("ItemDetail — watch selections do not survive navigation (serial-watch-flow 5.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    watchHls.instances.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it("drops the subtitle and voiceover selections when stepping to another episode", async () => {
    mockPlayback(HLS_PLAYBACK);
    stubSidecarChannel(SRT_BYTES);

    const HANDOFF: BrowseHandoff = {
      items: ["itm_5_ep", "itm_5_next"],
      position: 0,
      backTo: "/collections/1",
    };
    render(
      <QueryClientProvider client={freshClient()}>
        <MemoryRouter
          initialEntries={[
            { pathname: "/items/itm_5_ep", state: HANDOFF },
            HANDOFF.backTo,
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

    // A subtitle and a voiceover are selected on the first episode.
    fireEvent.change(await screen.findByLabelText("Subtitles"), {
      target: { value: "2" },
    });
    fireEvent.change(await screen.findByLabelText("Voiceover"), {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(theVideo().querySelector("track")).not.toBeNull();
    });

    // Step to the next episode: both controls reset — per-visit state, the
    // selection never carries onto another episode.
    fireEvent.click(screen.getByRole("button", { name: "Next item" }));
    // The path renders twice on the page (identity heading + core field).
    expect(
      (await screen.findAllByText("shows/Оська/s01e02.mkv")).length,
    ).toBeGreaterThan(0);
    // The stepped-to page's own controls (the playback query resolves per
    // item) come back in the RESET state — Off, embedded, no track.
    expect(
      ((await screen.findByLabelText("Subtitles")) as HTMLSelectElement)
        .value,
    ).toBe("");
    expect(
      (await screen.findByLabelText("Voiceover") as HTMLSelectElement).value,
    ).toBe("0");
    expect(theVideo().querySelector("track")).toBeNull();
  });
});

// The display-naming + on-page management slice: the heading follows the
// SERVED display_name (override-aware — the SPA never re-derives the name),
// the embedded SxxEyy tail de-duplicates the eyebrow paragraph, and the
// missing-name slot's cure opens the rename form (PUT /items/{id}/title via
// the shared ManageActions unit the cards host).
describe("ItemDetail — display name heading + on-page rename", () => {
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
          display_fields: ["display_title", "season_episode", "parsed_from"],
        },
      ],
    },
  };

  const EPISODE_WITH_NAME: ItemResponse = {
    item: {
      ...ITEM_RESPONSE.item,
      id: "itm_3_ep",
      module_id: "serial",
      library_id: 3,
      display_name: "Проснись, Ария! · S01E02",
      title_override: "",
      document: {
        sources: {
          "serial-parser": { season: 1, episode: 2, parsed_from: "Show/S01E02.mkv" },
        },
      },
    },
  };

  it("heads the page with the served display_name and drops the duplicated eyebrow tail", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(EPISODE_WITH_NAME);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(SERIAL_LIBRARY);

    renderAtId("itm_3_ep", freshClient());

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Проснись, Ария! · S01E02",
    });
    expect(heading).toBeDefined();
    // The composed name embeds its "· S01E02" tail — the eyebrow paragraph
    // (the mono SxxEyy line) must not stack the same number above it.
    expect(screen.queryByText("S01E02")).toBeNull();
  });

  it("opens the rename form from the missing-name slot and PUTs the title override", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(EPISODE_WITH_NAME);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(SERIAL_LIBRARY);
    const setItemTitle = vi.spyOn(apiModule, "setItemTitle").mockResolvedValue({
      entity_id: "itm_3_ep",
      title: "Пробуждение",
      updated_at: "2026-10-21T00:00:00Z",
    });

    renderAtId("itm_3_ep", freshClient());

    // The slot's shortcut: "Name manually…" opens the shared rename form.
    fireEvent.click(await screen.findByRole("button", { name: "Name manually…" }));
    const input = await screen.findByLabelText(/New title for/);
    fireEvent.change(input, { target: { value: "Пробуждение" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(setItemTitle).toHaveBeenCalledWith("itm_3_ep", "Пробуждение");
    });
  });

  it("hosts the ⋯ management menu with Rename, Identify, and Refresh metadata rows", async () => {
    const library: LibraryDTO = {
      ...SERIAL_LIBRARY,
      module: {
        identity_fields: ["display_title", "season", "episode"],
        parsers: [
          {
            id: "serial-parser",
            display_fields: ["display_title", "season_episode"],
          },
        ],
        refresh_sources: [{ id: "shikimori", enabled: true }],
      },
    };
    vi.spyOn(apiModule, "getItem").mockResolvedValue(EPISODE_WITH_NAME);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(library);

    renderAtId("itm_3_ep", freshClient());

    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for Проснись, Ария! · S01E02" }),
    );
    expect(await screen.findByRole("button", { name: "Rename…" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Identify…" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Refresh metadata…" })).toBeDefined();
  });

  it("renames the SERIES from the episode page — the override recomposes the whole show", async () => {
    // The serial case (user-locked 2026-10-21): an episode's composed name
    // carries the series title from the series document — shikimori can
    // match it wrong. The ⋯ menu gains "Rename series…" once the episode's
    // series anchor resolves to a series row (matched BY PATH through the
    // shared series cache), and the save PUTs the SERIES override.
    vi.spyOn(apiModule, "getItem").mockResolvedValue({
      item: {
        ...EPISODE_WITH_NAME.item,
        document: {
          ...EPISODE_WITH_NAME.item.document,
          parsed: { series_relative_path: "Ария (2005)" },
        },
      },
    });
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(SERIAL_LIBRARY);
    vi.spyOn(apiModule, "getSeries").mockResolvedValue({
      items: [
        {
          id: "ser_3_aria",
          module_id: "serial",
          library_id: 3,
          relative_path: "Ария (2005)",
          document: {},
          schema_version: 1,
          status: "ready",
          title_override: "",
          display_name: "Проснись, Ария!",
        },
      ],
    });
    const setSeriesTitle = vi
      .spyOn(apiModule, "setSeriesTitle")
      .mockResolvedValue({
        entity_id: "ser_3_aria",
        title: "Aria",
        updated_at: "2026-10-21T00:00:00Z",
      });

    renderAtId("itm_3_ep", freshClient());

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Actions for Проснись, Ария! · S01E02",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Rename series…" }),
    );
    const input = await screen.findByLabelText(/New title for Проснись, Ария!/);
    fireEvent.change(input, { target: { value: "Aria" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(setSeriesTitle).toHaveBeenCalledWith("ser_3_aria", "Aria");
    });
  });

  it("shows the SHOW's About panel beside the player — the series' served metadata block, not the episode's", async () => {
    // The Plex idiom (user-locked 2026-10-21): the episode page carries the
    // series' SERVED metadata.about (media-data-convention) — the episode's
    // own row never does. The panel renders from the SAME series resolution
    // that feeds Rename series (path-anchored through the shared series
    // cache); the decoy description in the series DOCUMENT proves the panel
    // consumes the served block, not a client-side namespace walk.
    vi.spyOn(apiModule, "getItem").mockResolvedValue({
      item: {
        ...EPISODE_WITH_NAME.item,
        document: {
          ...EPISODE_WITH_NAME.item.document,
          parsed: { series_relative_path: "Ария (2005)" },
        },
      },
    });
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(SERIAL_LIBRARY);
    vi.spyOn(apiModule, "getSeries").mockResolvedValue({
      items: [
        {
          id: "ser_3_aria",
          module_id: "serial",
          library_id: 3,
          relative_path: "Ария (2005)",
          document: {
            sources: {
              // decoy: the client walk is retired — a description in the
              // document's namespace must NOT reach the panel anymore.
              shikimori: {
                description: "Синопсис из документа — не рендерится.",
              },
            },
          },
          schema_version: 1,
          status: "ready",
          title_override: "",
          display_name: "Aria",
          metadata: {
            about: {
              source: "shikimori",
              description: "Действие разворачивается на Аквамарине.",
              genres: ["Фэнтези", "Повседневность"],
              score: 4.65,
              kind: "tv",
              status: "released",
              episodes: 13,
              aired_on: "2005-10-05",
            },
          },
        },
      ],
    });

    renderAtId("itm_3_ep", freshClient());

    const panel = await screen.findByRole("region", { name: "About" });
    expect(panel.textContent).toContain("Действие разворачивается");
    // The served block, not the document's namespace description.
    expect(panel.textContent).not.toContain("не рендерится");
    expect(screen.getByText("Фэнтези")).toBeDefined();
    expect(
      screen.getByText("★ 4.65 · tv · released · 13 ep · 2005"),
    ).toBeDefined();
  });
});

// Artwork 3.3: the identity column's lead image reads ONLY the served
// `artwork` field, through the authenticated art channel; absent artwork
// keeps the frame-grab hero fallback exactly as before; the Player's poster
// prop stays the thumb — artwork never rides the <video>.
describe("ItemDetail — served artwork lead image (artwork 3.3)", () => {
  const HEX = "b".repeat(64);
  const ART_PATH = `/api/v1/art/object/art_${HEX}`;

  const EPISODE_WITH_ART: ItemResponse = {
    item: {
      ...ITEM_RESPONSE.item,
      id: "itm_art_ep",
      relative_path: "shows/Оська/s01e01.mkv",
      media_type: "serial",
      status: "ready",
      // The base document's served _view title keeps the identity heading
      // "Оська"; frame-grabber joins the namespaces for the thumb leg.
      document: {
        ...ITEM_RESPONSE.item.document,
        sources: {
          ...ITEM_RESPONSE.item.document.sources,
          "frame-grabber": { thumbnail_path: "/data/thumbs/ep1.jpg" },
        },
      },
      artwork: ART_PATH,
    },
  };

  function stubObjectUrls(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
    const create = vi.fn(
      (blob: Blob) => `blob:art-${String(blob.size)}-${String(create.mock.calls.length)}`,
    );
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true, writable: true });
    return { create, revoke };
  }

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TOKEN_KEY);
  });

  function renderEpisode(item: ItemResponse): ReturnType<typeof render> {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(item);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
    vi.spyOn(apiModule, "getPlayback").mockResolvedValue(HLS_PLAYBACK);
    vi.spyOn(apiModule, "putProgress").mockResolvedValue({
      item_id: item.item.id,
      position_seconds: 0,
      updated_at: "",
    });
    return renderAtId2(item.item.id);
  }

  // renderAtId2 — renderAtId plus the fetch seam the art bytes ride: art
  // object URLs answer JPEG bytes, media URLs thumb bytes, everything else
  // (the progress list) an empty list.
  function renderAtId2(id: string): ReturnType<typeof render> {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/art/object/")) {
        return new Response("art-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } });
      }
      if (url.includes("/media")) {
        return new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } });
      }
      return new Response('{"items":[]}', { status: 200, headers: { "Content-Type": "application/json" } });
    });
    return render(
      <QueryClientProvider client={freshClient()}>
        <MemoryRouter initialEntries={[`/items/${id}`]}>
          <Routes>
            <Route path="/items/:id" element={<ItemDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("served artwork wins as the identity lead image, fetched through the authenticated channel", async () => {
    stubObjectUrls();
    localStorage.setItem(TOKEN_KEY, "tok-art");
    renderEpisode(EPISODE_WITH_ART);

    // The video lane mounts the player; the identity column carries the
    // lead poster from the served artwork field.
    expect(await screen.findByRole("region", { name: "Player" })).toBeDefined();
    const lead = await screen.findByRole("img", { name: "Оська" });
    await waitFor(() => expect(lead.getAttribute("src")).toMatch(/^blob:art-/));

    const artCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => String(c[0]).includes("/art/object/"),
    );
    expect(artCalls).toHaveLength(1);
    expect(String(artCalls[0][0])).toBe(ART_PATH);
    expect((artCalls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok-art" });
  });

  it("absent artwork keeps the hero thumb — no lead img, no art fetch", async () => {
    const { revoke } = stubObjectUrls();
    renderEpisode({
      item: { ...EPISODE_WITH_ART.item, artwork: undefined },
    });

    expect(await screen.findByRole("region", { name: "Player" })).toBeDefined();
    await waitFor(() => expect(theVideo().getAttribute("poster")).toMatch(/^blob:art-/));
    // No lead image in the identity column and no request to the art route —
    // the frame-grab hero fallback covers the page exactly as before.
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
        String(c[0]).includes("/art/object/"),
      ),
    ).toHaveLength(0);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("the player poster prop stays the thumb — artwork never rides the <video>", async () => {
    const { create } = stubObjectUrls();
    localStorage.setItem(TOKEN_KEY, "tok-art");
    renderEpisode(EPISODE_WITH_ART);

    expect(await screen.findByRole("region", { name: "Player" })).toBeDefined();
    await waitFor(() => expect(theVideo().getAttribute("poster")).toMatch(/^blob:art-/));
    const poster = theVideo().getAttribute("poster") as string;
    const lead = screen.getByRole("img", { name: "Оська" });
    await waitFor(() => expect(lead.getAttribute("src")).toMatch(/^blob:art-/));
    // Two distinct blobs: the video poster is the THUMB's, the lead img the
    // art object's — the player poster behavior is byte-identical to the
    // pre-artwork contract.
    expect(poster).not.toBe(lead.getAttribute("src"));
    const mediaCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes("/media"));
    expect(mediaCalls).toEqual(["/api/v1/items/itm_art_ep/media?variant=thumb"]);
    expect(create).toHaveBeenCalled();
  });
});

// Watch-flow-polish 3.2 — the watch view's info column: the video lane
// composes the player LEFT and the watch info column RIGHT, the column
// carries the episode's blocks from the served ElementMetadata projection,
// and the About panel lives there EXACTLY once (the identity block's own
// panel is suppressed on the watch lane — it remains the photo lane's).
// getItem/getPlayback/getSeries are mocked at the api seam; the bytes travel
// the global fetch as in the artwork tests above.
describe("ItemDetail — watch view info column (watch-flow-polish 3.2)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TOKEN_KEY);
  });

  const INFO_EPISODE: ItemResponse = {
    item: {
      ...ITEM_RESPONSE.item,
      id: "itm_info_ep",
      status: "ready",
      display_name: "Проснись, Ария! · S01E02",
      document: {
        parsed: { series_relative_path: "Ария (2005)" },
        sources: { "serial-parser": { season: 1, episode: 2 } },
      },
      metadata: {
        episode: {
          title: "Пробуждение",
          description: "Аста просыпается в хижине.",
        },
        cast: [{ name: "Аста", role: "Главный герой" }],
      },
    },
  };

  // The series row the episode's PATH anchor resolves to — its served about
  // block is the About panel's source for an episode.
  const INFO_SERIES = {
    id: "ser_1_aria",
    module_id: "serial",
    library_id: 1,
    relative_path: "Ария (2005)",
    document: {},
    schema_version: 1,
    status: "ready",
    title_override: "",
    display_name: "Проснись, Ария!",
    metadata: {
      about: {
        source: "shikimori",
        description: "Действие разворачивается на Аквамарине.",
      },
    },
  };

  it("watch_view_composes_player_and_info_column", async () => {
    localStorage.setItem(TOKEN_KEY, "tok-info");
    vi.spyOn(apiModule, "getItem").mockResolvedValue(INFO_EPISODE);
    vi.spyOn(apiModule, "getLibrary").mockResolvedValue(LIBRARY_NO_MODULE);
    vi.spyOn(apiModule, "getPlayback").mockResolvedValue(HLS_PLAYBACK);
    // The progress PUT is Player-internal and irrelevant here.
    vi.spyOn(apiModule, "putProgress").mockResolvedValue({
      item_id: "itm_info_ep",
      position_seconds: 0,
      updated_at: "",
    });
    vi.spyOn(apiModule, "getSeries").mockResolvedValue({
      items: [INFO_SERIES],
    });
    // The thumb bytes ride the global fetch; everything else (the progress
    // list) answers an empty JSON body — no cast photo is served here, so
    // no art-channel request is expected.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/media")) {
        return new Response("jpeg-bytes", {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      return new Response('{"items":[]}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderAtId("itm_info_ep", freshClient());

    // The player mounts in the Media stage section (the lane's LEFT cell)
    // and the watch info column in the RIGHT cell — the lane's grid carries
    // media stage first, info column second.
    const stage = await screen.findByRole("region", { name: "Media stage" });
    expect(await screen.findByRole("region", { name: "Player" })).toBeDefined();
    const column = screen.getByRole("region", { name: "Watch info" });
    const lane = stage.parentElement as HTMLElement;
    expect(lane).not.toBeNull();
    expect(lane.firstElementChild).toBe(stage);
    expect(
      stage.compareDocumentPosition(column) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The column's blocks come from the served projection: the SxxEyy
    // eyebrow with the served episode title, the «Серия» description, and
    // the «В ролях» entry.
    expect(within(column).getByText("S01E02")).toBeDefined();
    expect(
      within(column).getByRole("heading", { name: "Пробуждение" }),
    ).toBeDefined();
    expect(within(column).getByText("Серия")).toBeDefined();
    expect(
      within(column).getByText("Аста просыпается в хижине."),
    ).toBeDefined();
    expect(within(column).getByText("В ролях")).toBeDefined();
    expect(within(column).getByText("Аста")).toBeDefined();
    expect(within(column).getByText("Главный герой")).toBeDefined();

    // The About panel stands in the info column — the series row's served
    // block — and renders EXACTLY once on the watch lane: the identity
    // block no longer duplicates it.
    const abouts = within(column).getAllByRole("region", { name: "About" });
    expect(abouts).toHaveLength(1);
    expect(screen.getAllByRole("region", { name: "About" })).toHaveLength(1);
    expect(abouts[0].textContent).toContain("Аквамарине");

    // The identity/management block still lives in the same column beneath
    // (the page's h1 and the resume row) — extended, not restructured.
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Проснись, Ария! · S01E02",
      }),
    ).toBeDefined();
    expect(screen.getByText("Play from the start.")).toBeDefined();
  });
});
