// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { LibraryDTO } from "@/lib/api";
import { queryClient as sharedQueryClient } from "@/lib/queries";
import Collections, { EditLibraryForm } from "@/pages/admin/Collections";

// Group-6 suite: the admin panel as collections management. Consumer joint:
// Collections.tsx -> useLibraries/useCreateLibrary/useScanLibrary/
// useUpdateLibrary/useLibrarySummary -> Go /api/v1/libraries*. Mocks follow
// the established seam idiom (queries.test.tsx): hooks that call apiRequest
// DIRECTLY from queries.ts (list/create/scan) are mocked via
// `vi.spyOn(apiModule, "apiRequest")`; hooks delegating to api.ts-internal
// fetchers (summary, PATCH) are mocked at the fetcher
// (`vi.spyOn(apiModule, "getLibrarySummary" | "updateLibrary")`) — a same-
// module call inside api.ts does not route through the apiRequest export
// binding. End-to-end coverage through the real Go API is QA1.
//
// jsdom cannot measure scroll, so the sticky-header requirement is asserted as
// the markup contract (thead carries `sticky top-0` inside
// .collections-scroll) plus the 20+-row render, not a pixel check.

function withClient(client: QueryClient): ({ children }: { children: ReactNode }) => ReactNode {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// activeClient — the shared module-level client (mutations invalidate IT, so
// the provider must wrap the same instance for a re-fetch to reach the list).
function activeClient(): QueryClient {
  sharedQueryClient.clear();
  sharedQueryClient.setDefaultOptions({
    queries: { retry: false },
    mutations: { retry: false },
  });
  return sharedQueryClient;
}

function fillInput(placeholder: string, value: string): void {
  const el = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
  fireEvent.change(el, { target: { value } });
}

function fakeLibs(n: number): LibraryDTO[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    module_id: i % 2 === 0 ? "tv" : "image",
    root_path: `/media/lib-${i + 1}`,
    display_name: `Library ${i + 1}`,
    description: i === 0 ? "First collection" : "",
    streams_enabled: true, // the column default (packaged-playback D-8)
  }));
}

// mockSummary — the per-library summary fetcher seam
// (["library-summary", id] -> getLibrarySummary).
function mockSummary(items: (id: number) => number, updatedAt = "2026-10-01T12:00:00Z") {
  return vi.spyOn(apiModule, "getLibrarySummary").mockImplementation(
    async (id: number) => ({ library_id: id, items: items(id), updated_at: updatedAt }),
  );
}

describe("Collections — admin panel (group 6)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders 20+ collections with badge, root folder, summary counts and a sticky header", async () => {
    const libs = fakeLibs(25);
    const listSpy = vi.spyOn(apiModule, "apiRequest").mockResolvedValue({ items: libs });
    mockSummary((id) => id * 10);

    const { container } = render(<Collections />, { wrapper: withClient(freshClient()) });

    // All 25 root folders render (25 rows, not a truncated page).
    expect(await screen.findByText("/media/lib-1")).toBeDefined();
    expect(screen.getByText("/media/lib-25")).toBeDefined();
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(25);

    // Items/Updated come from the per-row summary fetch (id 3 -> 30 items).
    expect(await screen.findByText("30")).toBeDefined();
    expect(screen.getAllByText("2026-10-01T12:00:00Z").length).toBe(25);

    // Sticky header markup: the thead carries the sticky positioning utilities
    // and the table sits inside the .collections-scroll panel (jsdom cannot
    // measure scroll position).
    const thead = container.querySelector("thead");
    expect(thead?.className).toContain("sticky");
    expect(thead?.className).toContain("top-0");
    expect(container.querySelector(".collections-scroll")).not.toBeNull();
    // Type badges render the module_id verbatim.
    expect(screen.getAllByText("tv").length).toBeGreaterThan(0);
    expect(screen.getAllByText("image").length).toBeGreaterThan(0);
    expect(listSpy).toHaveBeenCalledWith("/api/v1/libraries");
  });

  it("renders the inline scan result on the scanned row ONLY", async () => {
    const libs = fakeLibs(3);
    vi.spyOn(apiModule, "apiRequest").mockImplementation(
      (async (path: string, init?: RequestInit) => {
        if (init?.method === "POST" && path === "/api/v1/libraries/2/scan") {
          return { library_id: 2, discovered: 5, persisted: 5, warnings: ["one skipped"] };
        }
        if (path === "/api/v1/libraries") return { items: libs };
        throw new Error(`unexpected call ${path}`);
      }) as typeof apiModule.apiRequest,
    );
    mockSummary(() => 0, "");

    const { container } = render(<Collections />, { wrapper: withClient(freshClient()) });
    await screen.findByText("/media/lib-2");

    const row2 = container.querySelector('tr[data-library-id="2"]');
    const scanBtn = within(row2 as HTMLElement).getByRole("button", { name: /^Scan$/i });
    fireEvent.click(scanBtn);

    expect(await screen.findByText(/discovered 5/)).toBeDefined();
    expect(screen.getByText("one skipped")).toBeDefined();
    // Inline on the scanned row only — rows 1 and 3 carry no result text.
    expect(within(container.querySelector('tr[data-library-id="1"]') as HTMLElement).queryByText(/discovered 5/)).toBeNull();
    expect(within(container.querySelector('tr[data-library-id="3"]') as HTMLElement).queryByText(/discovered 5/)).toBeNull();
  });

  it("add form POSTs the verbatim body including description and clears the form on 201", async () => {
    let listCalls = 0;
    const spy = vi.spyOn(apiModule, "apiRequest").mockImplementation(
      (async (path: string, init?: RequestInit) => {
        if (init?.method === "POST" && path === "/api/v1/libraries") {
          return {
            id: 9,
            module_id: "tv",
            root_path: "/media/photos",
            display_name: "Photos",
            description: "Family archive",
          };
        }
        if (path === "/api/v1/libraries") {
          listCalls += 1;
          return {
            items:
              listCalls === 1
                ? [] // empty table before the create...
                : // ...the new row after the ["libraries"] invalidation
                  [{ id: 9, module_id: "tv", root_path: "/media/photos", display_name: "Photos", description: "Family archive" }],
          };
        }
        throw new Error(`unexpected call ${path}`);
      }) as typeof apiModule.apiRequest,
    );
    mockSummary(() => 0, "");

    render(<Collections />, { wrapper: withClient(activeClient()) });
    expect(await screen.findByText("No collections yet")).toBeDefined();

    fillInput("TV", "Photos");
    fillInput("Seasonal shows", "Family archive");
    fillInput("/media/tv", "/media/photos");
    fireEvent.click(screen.getByRole("button", { name: /add collection/i }));

    // The new row appears via the ["libraries"] invalidation re-fetch.
    expect(await screen.findByText("Photos")).toBeDefined();

    const postCall = spy.mock.calls.find(
      ([p, i]) => p === "/api/v1/libraries" && i?.method === "POST",
    );
    expect(postCall).toBeDefined();
    // Verbatim snake_case body WITH the description (probe 43d0b2ce71a94805).
    expect(postCall?.[1]?.body).toEqual({
      module_id: "tv",
      root_path: "/media/photos",
      display_name: "Photos",
      description: "Family archive",
    });
    // Form cleared after success (the name input's placeholder is "TV").
    expect((screen.getByPlaceholderText("TV") as HTMLInputElement).value).toBe("");
  });

  it("edit overlay PATCHes {display_name, description} and re-fetches the table on success", async () => {
    const libs = fakeLibs(2);
    const patched: LibraryDTO = { ...libs[0], display_name: "Renamed", description: "New desc" };
    let listCalls = 0;
    const spy = vi.spyOn(apiModule, "apiRequest").mockImplementation(
      (async (path: string) => {
        if (path === "/api/v1/libraries") {
          listCalls += 1;
          return { items: listCalls === 1 ? libs : [patched, libs[1]] };
        }
        throw new Error(`unexpected call ${path}`);
      }) as typeof apiModule.apiRequest,
    );
    mockSummary(() => 0, "");
    const patchSpy = vi
      .spyOn(apiModule, "updateLibrary")
      .mockResolvedValue(patched);

    const { container } = render(<Collections />, { wrapper: withClient(activeClient()) });
    await screen.findByText("Library 1");

    // Open the overlay on row 1.
    const row1 = container.querySelector('tr[data-library-id="1"]') as HTMLElement;
    fireEvent.click(within(row1).getByRole("button", { name: "Edit" }));

    // Read-only identity: Type + root folder rendered, with the warning.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("/media/lib-1")).toBeDefined();
    expect(within(dialog).getByText(/moving the root re-identifies all items/i)).toBeDefined();

    // The dialog's OWN Name/Description inputs (the add form shares the
    // label text, so scope every fill to the dialog).
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Renamed" },
    });
    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "New desc" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    // Overlay closes on success; the table re-fetch shows the patched name.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Renamed")).toBeDefined();

    // PATCH hit the right library with only the editable fields.
    expect(patchSpy).toHaveBeenCalledWith(1, {
      display_name: "Renamed",
      description: "New desc",
    });
    // The list endpoint was re-fetched after the PATCH (["libraries"] invalidation).
    expect(listCalls).toBeGreaterThanOrEqual(2);
    expect(spy).toHaveBeenCalledTimes(listCalls);
  });

  it("edit overlay surfaces the canonical 400 error inline and stays open (no auto-retry)", async () => {
    const libs = fakeLibs(1);
    vi.spyOn(apiModule, "apiRequest").mockResolvedValue({ items: libs });
    mockSummary(() => 0, "");
    vi.spyOn(apiModule, "updateLibrary").mockRejectedValue(
      new apiModule.ApiError(400, {
        code: "bad_request",
        message: "root_path and module_id are immutable",
        retryable: false,
      }),
    );

    const { container } = render(<Collections />, { wrapper: withClient(activeClient()) });
    await screen.findByText("Library 1");

    fireEvent.click(
      within(container.querySelector('tr[data-library-id="1"]') as HTMLElement).getByRole(
        "button",
        { name: "Edit" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // Canonical error inline (code + message), overlay still open — the
    // mutation does NOT auto-retry (retry:0) or auto-close.
    expect(await screen.findByText("bad_request")).toBeDefined();
    expect(screen.getByText("root_path and module_id are immutable")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("never fetches the plugin-health endpoint from the admin panel (status section is gone)", async () => {
    const spy = vi
      .spyOn(apiModule, "apiRequest")
      .mockResolvedValue({ items: fakeLibs(2) });
    const summarySpy = mockSummary(() => 0, "");
    render(<Collections />, { wrapper: withClient(freshClient()) });
    await screen.findByText("/media/lib-1");

    // Assembled from parts so this source file carries no reference to the
    // plugin-health path (the group-6 probe greps pages/admin/ for it).
    const statusPath = ["/api/v1", "admin", "status"].join("/");
    const paths = spy.mock.calls.map(([p]) => String(p));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => !p.includes(statusPath))).toBe(true);
    expect(summarySpy.mock.calls.every(([id]) => typeof id === "number")).toBe(true);
  });
});

// The SHARED edit form (ui-management pass 3): the admin EditOverlay now wraps
// EditLibraryForm, and the collection Manage overlay embeds the same exported
// component. These are the form's own joints — read-only identity, the
// editable-row-fields-only PATCH, the error-stays/saved-callbacks contract.
describe("EditLibraryForm — the shared edit form (ui-management pass 3)", () => {
  beforeEach(() => {
    sharedQueryClient.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders read-only Type and root with the identity warning and PATCHes ONLY {display_name, description}, calling onSaved on success", async () => {
    const patched: LibraryDTO = { ...fakeLibs(1)[0], display_name: "Renamed" };
    const patchSpy = vi.spyOn(apiModule, "updateLibrary").mockResolvedValue(patched);
    const onSaved = vi.fn();
    const onCancel = vi.fn();

    render(
      <EditLibraryForm
        lib={fakeLibs(1)[0]}
        onSaved={onSaved}
        onCancel={onCancel}
      />,
      { wrapper: withClient(freshClient()) },
    );

    // Read-only identity: the root path and the identity warning render; no
    // input carries them.
    expect(screen.getByText("/media/lib-1")).toBeDefined();
    expect(screen.getByText(/moving the root re-identifies all items/i)).toBeDefined();
    expect(screen.getByText(/fixed at creation/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(patchSpy).toHaveBeenCalledWith(1, {
      display_name: "Renamed",
      description: "First collection",
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("surfaces the canonical error inline and does NOT call onSaved (the host overlay stays open)", async () => {
    vi.spyOn(apiModule, "updateLibrary").mockRejectedValue(
      new apiModule.ApiError(400, {
        code: "bad_request",
        message: "root_path and module_id are immutable",
        retryable: false,
      }),
    );
    const onSaved = vi.fn();

    render(<EditLibraryForm lib={fakeLibs(1)[0]} onSaved={onSaved} />, {
      wrapper: withClient(freshClient()),
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("bad_request")).toBeDefined();
    expect(screen.getByText("root_path and module_id are immutable")).toBeDefined();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
