// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Sidebar, { SIDE_KEY } from "@/components/Sidebar";
import { DEVICE_TOKEN_KEY, TOKEN_KEY } from "@/lib/auth";

// Group-3 slice: the sidebar shell's OWN behavior, asserted at the fetch seam
// (the S4-style joint). Open/close mechanics (hidden by default, FAB opens,
// Escape closes), the mellifera.side persistence contract, the async count
// rule (opening never waits on summaries) and the served-identity law
// (l6-accounts 8.3: admin surfaces from the SERVED GET /profile role — the
// D7 /admin/status role probe is REMOVED, never fetched) are the load-bearing
// logic — the CSS slide itself is index.css's contract, asserted by the
// wf:probe greps.
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

// The served GET /profile shapes, VERBATIM per principal kind
// (profile.go profileResponse — the same bodies TestProfileEndpoint pins).
// user_id is present only on kind "user" (omitempty); prefs crosses
// verbatim ("{}" for the env admin, null for a device) and is 8.4's
// concern, never the sidebar's.
const ADMIN_PROFILE = {
  kind: "admin",
  name: "admin",
  role: "admin",
  groups: [],
  prefs: {},
};
const ADMIN_ROLE_SESSION_PROFILE = {
  kind: "user",
  user_id: 2,
  name: "Root",
  role: "admin",
  groups: [{ id: 1, name: "household" }],
  prefs: { tv_mode: "on" },
};
const USER_PROFILE = {
  kind: "user",
  user_id: 3,
  name: "Alice",
  role: "user",
  groups: [{ id: 1, name: "household" }, { id: 2, name: "kids" }],
  prefs: {},
};
const DEVICE_PROFILE = {
  kind: "device",
  name: "device",
  role: "client",
  groups: [],
  prefs: null,
};

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

function renderSidebar(initialPath: string = "/"): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function freshLibraries(
  profile: unknown = ADMIN_PROFILE,
): Record<string, () => Promise<Response>> {
  return {
    "/api/v1/libraries/1/summary": () =>
      Promise.resolve(jsonResponse(200, SUMMARY_1)),
    "/api/v1/libraries/2/summary": () =>
      Promise.resolve(jsonResponse(200, SUMMARY_2)),
    "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, LIBRARIES_BODY)),
    "/api/v1/profile": () => Promise.resolve(jsonResponse(200, profile)),
  };
}

// assertNoProbe — the probe-removal law (l6-accounts 8.3): the sidebar NEVER
// fetches the operator /admin/status endpoint for identity. Asserted against
// the recorded fetch URLs; note freshLibraries no longer stubs the endpoint
// either, so a stray probe would hit the mock's unexpected-fetch rejection
// and fail the very assertions below with an error state.
function assertNoProbe(spy: { mock: { calls: unknown[][] } }): void {
  const urls = spy.mock.calls.map((c) => String(c[0]));
  expect(urls.some((u) => u.includes("/api/v1/admin/status"))).toBe(false);
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
    // The admin rows gate on the SERVED profile — they arrive with the
    // identity, asynchronously (l6-accounts 8.3).
    expect(await screen.findByRole("link", { name: /Admin/ })).toBeDefined();

    // The collections list renders every library with its async count.
    expect(await screen.findByRole("link", { name: /serials/ })).toBeDefined();
    expect(await screen.findByText("37")).toBeDefined();
    expect(await screen.findByText("214")).toBeDefined();
    // The libraries list itself was fetched (only once the panel opened).
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/v1/libraries"))).toBe(true);
  });

  it("renders the Plugins row linking /admin/plugins with the active highlight", async () => {
    // plugin-admin-surfaces: the nav is Home/Admin/Plugins — the Plugins row
    // links /admin/plugins and highlights while that page is open.
    fetchWith(freshLibraries());

    renderSidebar("/admin/plugins");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const plugins = await screen.findByRole("link", { name: /Plugins/ });
    expect(plugins.getAttribute("href")).toBe("/admin/plugins");
    expect(plugins.className).toContain("slink-active");
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

  it("highlights the parent collection entry while an item detail page is open", async () => {
    // The sidebar SHALL: detail pages highlight their parent collection. The
    // item fetch reuses ItemDetail's ["item", id] cache key, so exactly ONE
    // item request is made even though both surfaces read it.
    const fetchSpy = fetchWith({
      ...freshLibraries(),
      "/api/v1/items/tv_abc": () =>
        Promise.resolve(
          jsonResponse(200, {
            item: {
              id: "tv_abc",
              library_id: 2,
              module_id: "tv",
              relative_path: "Film 2019.mkv",
              media_type: "tv",
              status: "ready",
              document: {},
            },
          }),
        ),
    });

    renderSidebar("/items/tv_abc");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const films = await screen.findByRole("link", { name: /films/ });
    expect(films.className).toContain("clink-active");
    const serials = screen.getByRole("link", { name: /serials/ });
    expect(serials.className).not.toContain("clink-active");

    // Cache sharing: the panel issued exactly one item request for the
    // detail page's own item — never a duplicate.
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("/api/v1/items/tv_abc")).length).toBe(1);
  });

  it("highlights no collection entry off the detail route without an item request", async () => {
    const fetchSpy = fetchWith(freshLibraries());

    renderSidebar("/collections/2");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    await screen.findByRole("link", { name: /films/ });
    const films = screen.getByRole("link", { name: /films/ });
    // On the collection page itself NavLink's isActive carries the highlight.
    expect(films.className).toContain("clink-active");
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/v1/items/"))).toBe(false);
  });

  it("renders the «Режим ТВ» tri-state control in the foot beside the theme toggle", async () => {
    // tv-mode D9: the side-foot is the display-preferences home — the
    // tri-state override group sits beside ThemeToggle inside the pinned
    // profile block, so a TV operator reaches it through the menu FAB.
    fetchWith(freshLibraries());
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const foot = screen.getByRole("group", { name: "Режим ТВ" }).closest(".side-foot");
    expect(foot).not.toBeNull();
    // The three mockup states, one aria-pressed each, in the same foot as the
    // theme toggle (matchMedia is stubbed to light → "Switch to dark theme").
    for (const label of ["Авто", "Вкл", "Выкл"]) {
      expect(
        foot!.querySelector(`button[aria-pressed][title="Режим ТВ: ${label}"]`),
      ).not.toBeNull();
    }
    expect(
      foot!.querySelector('[aria-label="Switch to dark theme"]'),
    ).not.toBeNull();
  });

  it("renders collection names immediately while the summary counts are still in flight", async () => {
    // The summary endpoints NEVER resolve: opening must not wait on them.
    fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, LIBRARIES_BODY)),
      "/api/v1/profile": () => Promise.resolve(jsonResponse(200, ADMIN_PROFILE)),
    });
    
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(await screen.findByRole("link", { name: /serials/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /films/ })).toBeDefined();
    // No count rendered yet — and no crash.
    expect(screen.queryByText("37")).toBeNull();
  });
});

describe("Sidebar — served identity (l6-accounts 8.3)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("env admin served: admin surfaces render, the identity block reads the served name and role", async () => {
    const fetchSpy = fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/profile": () => Promise.resolve(jsonResponse(200, ADMIN_PROFILE)),
    });

    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(await screen.findByRole("link", { name: /Admin/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Plugins/ })).toBeDefined();
    // The served name AND role label are both the literal "admin" — the
    // block's b and small, exactly two nodes.
    expect((await screen.findAllByText("admin")).length).toBe(2);
    // The avatar derives its initials from the served name.
    expect(screen.getByText("AD")).toBeDefined();
    assertNoProbe(fetchSpy);
  });

  it("admin-role session served (kind user, role admin): admin surfaces render and the served groups list", async () => {
    const fetchSpy = fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/profile": () =>
        Promise.resolve(jsonResponse(200, ADMIN_ROLE_SESSION_PROFILE)),
    });

    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(await screen.findByRole("link", { name: /Admin/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Plugins/ })).toBeDefined();
    expect(await screen.findByText("Root")).toBeDefined();
    expect(screen.getByText("admin")).toBeDefined();
    // The served groups, names joined on one line.
    expect(screen.getByText("household")).toBeDefined();
    assertNoProbe(fetchSpy);
  });

  it("user-role session served: admin surfaces are ABSENT, label degrades to client, groups listed", async () => {
    const fetchSpy = fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/profile": () => Promise.resolve(jsonResponse(200, USER_PROFILE)),
    });

    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(await screen.findByText("Alice")).toBeDefined();
    expect(screen.queryByRole("link", { name: /Admin/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Plugins/ })).toBeNull();
    expect(screen.getByText("client")).toBeDefined();
    expect(screen.getByText("household, kids")).toBeDefined();
    assertNoProbe(fetchSpy);
  });

  it("device served: minimal block, no admin surfaces", async () => {
    const fetchSpy = fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/profile": () => Promise.resolve(jsonResponse(200, DEVICE_PROFILE)),
    });

    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(await screen.findByText("device")).toBeDefined();
    expect(screen.queryByRole("link", { name: /Admin/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Plugins/ })).toBeNull();
    expect(screen.getByText("client")).toBeDefined();
    assertNoProbe(fetchSpy);
  });

  it("fail closed while the identity is in flight: no admin surfaces, fallback block", async () => {
    fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/profile": () => new Promise<Response>(() => undefined), // never resolves
    });

    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    // While the identity loads the gate is already closed, and the block
    // shows the fallback name + the "…" posture (never blocks the panel).
    expect(screen.getByRole("link", { name: /Home/ })).toBeDefined();
    expect(screen.queryByRole("link", { name: /Admin/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Plugins/ })).toBeNull();
    expect(screen.getByText("Operator")).toBeDefined();
    expect(screen.getByText("…")).toBeDefined();
  });

  it("fail closed when the identity fetch fails: client label, fallback name, NO probe fallback", async () => {
    const fetchSpy = fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/profile": () => Promise.reject(new Error("network down")),
    });

    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    // The identity never arrives — the fallback name + the least-privilege
    // client label stand, admin rows stay absent, and no /admin/status
    // fallback probe fires (the probe is REMOVED, not demoted to a fallback).
    expect(await screen.findByText("client")).toBeDefined();
    expect(screen.getByText("Operator")).toBeDefined();
    expect(screen.queryByRole("link", { name: /Admin/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Plugins/ })).toBeNull();
    assertNoProbe(fetchSpy);
  });

  it("a 401 on the profile fetch fires the rotation seam — never a silent empty sidebar", async () => {
    // The session credential is in the slot (8.2's storage law); the served
    // identity answers 401 — the standard wrapper rotation (handle401)
    // clears BOTH credential slots and redirects to /login.
    localStorage.setItem(TOKEN_KEY, "sess-token-1");
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignSpy },
    });
    const fetchSpy = fetchWith({
      "/api/v1/libraries": () => Promise.resolve(jsonResponse(200, { items: [] })),
      "/api/v1/profile": () =>
        Promise.resolve(
          jsonResponse(401, {
            error: {
              code: "unauthorized",
              message: "session expired",
              retryable: false,
            },
          }),
        ),
    });

    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    await waitFor(() => {
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(DEVICE_TOKEN_KEY)).toBeNull();
      expect(assignSpy).toHaveBeenCalledWith("/login");
    });
    assertNoProbe(fetchSpy);
  });
});
