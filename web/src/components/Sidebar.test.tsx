// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Sidebar, { SIDE_KEY } from "@/components/Sidebar";

// Group-3 slice: the sidebar shell's OWN behavior, asserted at the fetch seam
// (the S4-style joint). Open/close mechanics (hidden by default, FAB opens,
// Escape closes), the mellifera.side persistence contract, the async count
// rule (opening never waits on summaries) and the D7 role probe (admin on
// 200, client on 403/failure) are the load-bearing logic — the CSS slide
// itself is index.css's contract, asserted by the wf:probe greps.
// We avoid user-event (not a dep, like the admin tests) and click via
// fireEvent; the async assertions use findBy* so React state updates settle.

vi.hoisted(() => {
  // ThemeToggle's module-evaluation boot apply reads matchMedia; jsdom does
  // not implement it. Stub before the Sidebar import tree evaluates.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
});

const LIBRARIES_BODY = {
  items: [
    {
      id: 1,
      module_id: "serial",
      root_path: "/data/serials",
      display_name: "serials",
      description: "",
    },
    {
      id: 2,
      module_id: "tv",
      root_path: "/data/films",
      display_name: "films",
      description: "",
    },
  ],
};

const SUMMARY_1 = { library_id: 1, items: 37, updated_at: "" };
const SUMMARY_2 = { library_id: 2, items: 214, updated_at: "" };

// fetchWith — a URL-dispatched fetch mock. handlers maps a substring of the
// request URL to the response factory, so each test controls exactly which
// endpoints answer (and how slowly).
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

function renderSidebar(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function freshLibraries(): Record<string, () => Promise<Response>> {
  return {
    "/api/v1/libraries/1/summary": () =>
      Promise.resolve(jsonResponse(200, SUMMARY_1)),
    "/api/v1/libraries/2/summary": () =>
      Promise.resolve(jsonResponse(200, SUMMARY_2)),
    "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, LIBRARIES_BODY)),
    "/api/v1/admin/status": () => Promise.resolve(jsonResponse(200, { plugins: [], enrich: {} })),
  };
}

describe("Sidebar — open/close mechanics + persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("is hidden by default: no side-open class, panel content unmounted, FAB visible", () => {
    fetchWith(freshLibraries());
    renderSidebar();

    expect(document.body.classList.contains("side-open")).toBe(false);
    // The FAB is the only visible affordance; the panel's rows are not in the
    // tree while closed (closed sessions fire no library requests either).
    expect(screen.getByRole("button", { name: "Open menu" })).toBeDefined();
    expect(screen.queryByText("Home")).toBeNull();
    // Default is closed even with no persisted choice.
    expect(localStorage.getItem(SIDE_KEY)).toBeNull();
  });

  it("opens from the floating button, renders nav + collections with counts, and persists open", async () => {
    const fetchSpy = fetchWith(freshLibraries());
    
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(document.body.classList.contains("side-open")).toBe(true);
    expect(localStorage.getItem(SIDE_KEY)).toBe("open");
    expect(screen.getByText("Mellifera")).toBeDefined();
    expect(screen.getByRole("link", { name: /Home/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Admin/ })).toBeDefined();

    // The collections list renders every library with its async count.
    expect(await screen.findByRole("link", { name: /serials/ })).toBeDefined();
    expect(await screen.findByText("37")).toBeDefined();
    expect(await screen.findByText("214")).toBeDefined();
    // The libraries list itself was fetched (only once the panel opened).
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/v1/libraries"))).toBe(true);
  });

  it("closes on Escape and persists closed", async () => {
    fetchWith(freshLibraries());
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.body.classList.contains("side-open")).toBe(true);

    // The keydown lands outside fireEvent's act(), so flush the resulting
    // state update explicitly.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(document.body.classList.contains("side-open")).toBe(false);
    expect(localStorage.getItem(SIDE_KEY)).toBe("closed");
    expect(screen.queryByText("Mellifera")).toBeNull();
  });

  it("closes from the panel chevron", async () => {
    fetchWith(freshLibraries());
    
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));

    expect(document.body.classList.contains("side-open")).toBe(false);
    expect(localStorage.getItem(SIDE_KEY)).toBe("closed");
  });

  it("restores a persisted open choice on mount", () => {
    fetchWith(freshLibraries());
    localStorage.setItem(SIDE_KEY, "open");
    renderSidebar();

    expect(document.body.classList.contains("side-open")).toBe(true);
    expect(screen.getByText("Mellifera")).toBeDefined();
  });

  it("renders collection names immediately while the summary counts are still in flight", async () => {
    // The summary endpoints NEVER resolve: opening must not wait on them.
    fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, LIBRARIES_BODY)),
      "/api/v1/admin/status": () =>
        Promise.resolve(jsonResponse(200, { plugins: [], enrich: {} })),
    });
    
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(await screen.findByRole("link", { name: /serials/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /films/ })).toBeDefined();
    // No count rendered yet — and no crash.
    expect(screen.queryByText("37")).toBeNull();
  });
});

describe("Sidebar — profile role probe (D7)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows admin when GET /admin/status succeeds", async () => {
    fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/admin/status": () => Promise.resolve(jsonResponse(200, { plugins: [], enrich: {} })),
    });
    
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(await screen.findByText("admin")).toBeDefined();
  });

  it("shows client on 403", async () => {
    fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/admin/status": () =>
        Promise.resolve(
          jsonResponse(403, {
            error: { code: "forbidden", message: "client role", retryable: false },
          }),
        ),
    });
    
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(await screen.findByText("client")).toBeDefined();
  });

  it("shows client when the probe fails outright", async () => {
    fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/admin/status": () => Promise.reject(new Error("network down")),
    });
    
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(await screen.findByText("client")).toBeDefined();
  });
});
