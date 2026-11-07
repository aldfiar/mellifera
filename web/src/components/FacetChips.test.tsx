// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { FacetChips } from "@/components/FacetChips";
import Collection, {
  MoviesBody,
  SerialsBody,
} from "@/pages/collections/Collection";
import type {
  FacetDTO,
  ItemDTO,
  LibraryDTO,
  SeriesDTO,
} from "@/lib/api";
import type { ItemDocument } from "@/lib/document";

// browse-scale 5.2 — the FacetChips contract at both levels:
//   component: served values verbatim, served order untouched, active chip =
//   the chip-active color change (aria-pressed), `keys` decides which served
//   facets get wired (an unwired served key is absent, never dead chrome),
//   nothing renders for absent/loading/failed facets.
//   wiring (fetch-seam, the Collection.test idiom): the serial grid puts
//   genre/kind/status on GET /series, the movies grid genre/kind on
//   GET /items — and NO facet-status ever rides /items (its `status` param
//   name is pinned to the enrichment-lifecycle filter) — the aggregates are
//   fetched exactly ONCE per view regardless of chip traffic, photo
//   libraries never mount the lane at all, and a chip pick restarts paging
//   at offset 0 server-side.

// SERVED_FACETS — the aggregates a metadata-enriched media library serves:
// all three keys, values in the served order (count desc, value asc).
const SERVED_FACETS: FacetDTO[] = [
  {
    key: "genres",
    values: [
      { value: "Комедия", count: 7 },
      { value: "Драма", count: 3 },
    ],
  },
  { key: "kind", values: [{ value: "tv", count: 10 }] },
  { key: "status", values: [{ value: "released", count: 10 }] },
];

describe("FacetChips — component", () => {
  it("renders served values verbatim with their counts, one group per served key", () => {
    const onToggle = vi.fn();
    render(
      <FacetChips
        facets={SERVED_FACETS}
        keys={["genres", "kind", "status"]}
        active={{}}
        onToggle={onToggle}
      />,
    );

    // Values verbatim (Cyrillic intact), counts alongside — never re-cased.
    expect(screen.getByRole("button", { name: /Комедия/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Драма/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Комедия/ }).textContent).toBe(
      "Комедия7",
    );
    expect(screen.getByRole("button", { name: /^tv/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /released/ })).toBeDefined();
    // One labelled group per served key, served order preserved.
    expect(screen.getByRole("group", { name: "Filter by genres" })).toBeDefined();
    expect(screen.getByRole("group", { name: "Filter by kind" })).toBeDefined();
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeDefined();
  });

  it("renders ONLY the wired keys — an unwired served facet is absent, not dead chrome", () => {
    const onToggle = vi.fn();
    // The movies grid's wiring: genre/kind only — the served status facet
    // must not render (/items carries no facet-status param).
    render(
      <FacetChips
        facets={SERVED_FACETS}
        keys={["genres", "kind"]}
        active={{}}
        onToggle={onToggle}
      />,
    );

    expect(screen.getByRole("button", { name: /Комедия/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^tv/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /released/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Filter by status" })).toBeNull();
  });

  it("marks the active chip with chip-active + aria-pressed and reports every toggle to onToggle", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <FacetChips
        facets={SERVED_FACETS}
        keys={["genres", "kind", "status"]}
        active={{ genre: "Драма" }}
        onToggle={onToggle}
      />,
    );

    const activeChip = screen.getByRole("button", { name: /Драма/ });
    const idleChip = screen.getByRole("button", { name: /Комедия/ });
    // Active = the color-change class + the AT announcement.
    expect(activeChip.className).toContain("chip-active");
    expect(activeChip.getAttribute("aria-pressed")).toBe("true");
    expect(idleChip.className).not.toContain("chip-active");
    expect(idleChip.getAttribute("aria-pressed")).toBe("false");

    // Clicking an idle chip picks it; clicking the active one is reported
    // too (the caller owns the toggle-off law).
    fireEvent.click(idleChip);
    fireEvent.click(activeChip);
    expect(onToggle.mock.calls).toEqual([
      ["genre", "Комедия"],
      ["genre", "Драма"],
    ]);

    // Rerendered with the new selection, the color change follows.
    rerender(
      <FacetChips
        facets={SERVED_FACETS}
        keys={["genres", "kind", "status"]}
        active={{ genre: "Комедия" }}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByRole("button", { name: /Комедия/ }).className).toContain(
      "chip-active",
    );
    expect(screen.getByRole("button", { name: /Драма/ }).className).not.toContain(
      "chip-active",
    );
  });

  it("renders NOTHING for absent, loading or facetless reads — additive chrome, never a blocker", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <FacetChips
        facets={undefined}
        keys={["genres", "kind", "status"]}
        active={{}}
        onToggle={onToggle}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <FacetChips
        facets={[]}
        keys={["genres", "kind", "status"]}
        active={{}}
        onToggle={onToggle}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});

// ---- wiring: the fetch seam over the real grid bodies -----------------------

function lib(id: number, moduleId: string): LibraryDTO {
  return {
    id,
    module_id: moduleId,
    display_name: "films",
    description: "",
  } as LibraryDTO;
}

function tvItem(id: string, displayName: string): ItemDTO {
  const document: ItemDocument = {};
  return {
    id,
    module_id: "tv",
    library_id: 1,
    file_id: `file-${id}`,
    relative_path: `Movies/${displayName}.mkv`,
    media_type: "tv",
    document,
    schema_version: 1,
    status: "ready",
    display_name: displayName,
  };
}

function seriesRow(id: string, displayName: string): SeriesDTO {
  return {
    id,
    module_id: "serial",
    library_id: 1,
    relative_path: displayName,
    document: {},
    schema_version: 1,
    status: "ready",
    display_name: displayName,
  };
}

// fetchSeam — the URL-dispatched fetch mock (the Collection.test idiom) plus
// a full call log: handlers match by substring (earlier entries win),
// anything unmatched REJECTS so an off-contract request fails loudly, and
// `calls` records every URL in order for the request-count assertions.
function fetchSeam(handlers: Record<string, (url: string) => Promise<Response>>) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    calls.push(url);
    for (const [fragment, respond] of Object.entries(handlers)) {
      if (url.includes(fragment)) {
        return respond(url);
      }
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  return {
    calls,
    facetsCalls: () => calls.filter((u) => u.includes("/facets")),
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// renderBody — the grid bodies under a fresh QueryClient (retry off) and a
// router (SerialsBody reads the ?series= state; the cards carry Links).
function renderBody(node: ReactNode): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/collections/1"]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FacetChips — serial grid wiring (genre/kind/status → /series)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wires every chip into the /series query conjunctively, restarts nothing on the facets read, and fetches the aggregates exactly once", async () => {
    const { calls, facetsCalls } = fetchSeam({
      "/libraries/1/facets": () =>
        Promise.resolve(jsonResponse(200, { facets: SERVED_FACETS })),
      "/api/v1/series?library=1&genre=": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/series": (url) =>
        Promise.resolve(
          jsonResponse(200, {
            items:
              // Unfiltered → two rows; a kind/status-only filter → one.
              url.includes("genre=")
                ? []
                : [
                    seriesRow("ser_1_a", "Show One"),
                    seriesRow("ser_1_b", "Show Two"),
                  ],
          }),
        ),
    });
    renderBody(<SerialsBody libraryId={1} />);

    // The grid lands with the chip lane above it; the aggregates were
    // fetched exactly once for the whole view.
    expect(await screen.findByRole("link", { name: /Show One/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Комедия/ })).toBeDefined();
    expect(facetsCalls()).toHaveLength(1);

    // Pick the Драма genre chip → the request rides ?genre= (server-encoded),
    // and the served empty page renders the HONEST filtered empty state —
    // never "no series scanned yet".
    fireEvent.click(screen.getByRole("button", { name: /Драма/ }));
    expect(
      await screen.findByText("Nothing matches the selected filters."),
    ).toBeDefined();
    expect(
      lastSeriesUrl(calls).includes(`genre=${encodeURIComponent("Драма")}`),
    ).toBe(true);
    expect(facetsCalls()).toHaveLength(1);

    // Toggle it back off → the plain unfiltered query again.
    fireEvent.click(screen.getByRole("button", { name: /Драма/ }));
    expect(await screen.findByRole("link", { name: /Show One/ })).toBeDefined();

    // Status chip → ?status= on /series (the serial grid wires all three).
    fireEvent.click(screen.getByRole("button", { name: /released/ }));
    await waitFor(() => {
      const latest = lastSeriesUrl(calls);
      expect(latest).toContain("status=released");
      expect(latest).not.toContain("genre=");
    });

    // Kind chip on top → CONJUNCTIVE: kind AND status in one request.
    fireEvent.click(screen.getByRole("button", { name: /^tv/ }));
    await waitFor(() => {
      const latest = lastSeriesUrl(calls);
      expect(latest).toContain("kind=tv");
      expect(latest).toContain("status=released");
    });

    // Through every chip interaction: still exactly one facets fetch —
    // fetched once per view, never behind the filter clicks.
    expect(facetsCalls()).toHaveLength(1);
  });
});

function lastSeriesUrl(list: string[]): string {
  const found = list.filter((u) => u.includes("/api/v1/series"));
  expect(found.length).toBeGreaterThan(0);
  return found[found.length - 1] ?? "";
}

describe("FacetChips — movies grid wiring (genre/kind only → /items)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wires genre/kind into the /items query, never a facet-status param; a pick resets paging to offset 0; facets fetched once", async () => {
    const page = (): { items: ItemDTO[] } => ({
      items: Array.from({ length: 50 }, (_, i) =>
        tvItem(`itm_1_${String(i)}`, `Film ${String(i)}`),
      ),
    });
    const { calls, facetsCalls } = fetchSeam({
      "/libraries/1/facets": () =>
        Promise.resolve(jsonResponse(200, { facets: SERVED_FACETS })),
      "/api/v1/progress": () =>
        Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/items": (url) =>
        Promise.resolve(
          jsonResponse(
            200,
            url.includes("genre=") ? { items: [tvItem("itm_1_hit", "Hit")] } : page(),
          ),
        ),
    });
    renderBody(<MoviesBody libraryId={1} />);


    await screen.findByRole("link", { name: "Film 0" });
    // The status facet is SERVED but NOT WIRED here — /items carries no
    // facet-status param (its `status` name is pinned to the enrichment-
    // lifecycle filter), so no status chip exists at all.
    expect(screen.queryByRole("button", { name: /released/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Комедия/ })).toBeDefined();
    expect(facetsCalls()).toHaveLength(1);

    // Page to offset 50 first — a facet pick must restart the page.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(calls.filter((u) => u.includes("offset=50")).length).toBeGreaterThan(0),
    );

    // Pick Комедия → the request rides ?genre= server-side; the pick resets
    // paging to offset 0 (a folder switch, same law).
    fireEvent.click(screen.getByRole("button", { name: /Комедия/ }));
    await waitFor(() => {
      const latest = lastItemsUrl(calls);
      expect(latest).toContain(`genre=${encodeURIComponent("Комедия")}`);
      expect(latest).toContain("offset=0");
    });

    // Kind chip on top → conjunctive on /items — and NO status param anywhere.
    fireEvent.click(screen.getByRole("button", { name: /^tv/ }));
    await waitFor(() => {
      const latest = lastItemsUrl(calls);
      expect(latest).toContain(`genre=${encodeURIComponent("Комедия")}`);
      expect(latest).toContain("kind=tv");
    });
    for (const url of calls.filter((u) => u.includes("/api/v1/items?"))) {
      expect(url.includes("status=")).toBe(false);
    }

    expect(facetsCalls()).toHaveLength(1);
  });
});

function lastItemsUrl(list: string[]): string {
  const found = list.filter((u) => u.includes("/api/v1/items?"));
  expect(found.length).toBeGreaterThan(0);
  return found[found.length - 1] ?? "";
}

describe("FacetChips — photo libraries never mount the lane", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the image body arm issues no /facets request at all", async () => {
    const { calls } = fetchSeam({
      "/api/v1/libraries/1/folders": () =>
        Promise.resolve(jsonResponse(200, { folders: [] })),
      "/api/v1/libraries/1/summary": () =>
        Promise.resolve(
          jsonResponse(200, { library_id: 1, items: 1, updated_at: "" }),
        ),
      "/api/v1/libraries": () =>
        Promise.resolve(jsonResponse(200, { items: [lib(1, "image")] })),
      "/api/v1/items": () =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                id: "itm_1_p1",
                module_id: "image",
                library_id: 1,
                file_id: "file-1",
                relative_path: "2026/beach.jpg",
                media_type: "image",
                document: {},
                schema_version: 1,
                status: "ready",
              } satisfies ItemDTO,
            ],
          }),
        ),
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/collections/1"]}>
          <Routes>
            <Route path="/collections/:id" element={<Collection />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // The photos grid renders; the facets endpoint was never asked — the
    // lane is absent by mount shape, not by empty served data.
    expect(await screen.findByRole("link", { name: "Open beach" })).toBeDefined();
    expect(calls.filter((u) => u.includes("/facets"))).toHaveLength(0);
  });
});
