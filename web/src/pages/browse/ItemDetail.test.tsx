// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { ItemResponse } from "@/lib/api";
import ItemDetail from "@/pages/browse/ItemDetail";

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

describe("ItemDetail — happy path (GET /api/v1/items/{id})", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders identifiers, one card per source namespace, view, provenance, and stages after expanding the disclosure", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);

    renderAtId("itm_1_9", freshClient());

    // Core-managed fields.
    expect(await screen.findByText("itm_1_9")).toBeDefined();
    expect(screen.getByText("shows/Оська/s01e01.mkv")).toBeDefined();
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
    stubObjectUrls();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mediaResponse());

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
    stubObjectUrls();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mediaResponse());

    renderAtId("itm_1_ep", freshClient());

    await screen.findByRole("img", { name: "shows/Оська/s01e02.mkv" });
    expect(mediaCalls(fetchSpy)).toEqual([
      "/api/v1/items/itm_1_ep/media?variant=thumb",
    ]);
  });

  it("renders no hero and fires no media request when no image resolvable (video, no thumb fact)", async () => {
    vi.spyOn(apiModule, "getItem").mockResolvedValue(ITEM_RESPONSE);
    stubObjectUrls();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mediaResponse());

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
