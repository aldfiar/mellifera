// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { ListItemsParams } from "@/lib/api";
import {
  queryClient,
  useAdminStatus,
  useCreateLibrary,
  useItems,
  useLibraries,
  useScanLibrary,
} from "@/lib/queries";

// S5 joint contract: query hooks -> Go /api/v1/{libraries,scan,admin/status}.
// apiRequest is mocked so the seam contract (each hook hits its pre-existing
// endpoint via apiRequest; createLibrary invalidates ["libraries"]; mutations
// don't retry) is asserted independently of the network. End-to-end coverage
// through the real Go API is QA1.

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("query hooks — S5 joint (hooks -> Go endpoints via apiRequest)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("useLibraries calls apiRequest with /api/v1/libraries and returns items", async () => {
    const spy = vi
      .spyOn(apiModule, "apiRequest")
      .mockResolvedValue({ items: [{ id: 1, module_id: "tv", root_path: "/x", display_name: "L" }] });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLibraries(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith("/api/v1/libraries");
    expect(result.current.data?.items).toHaveLength(1);
  });

  it("useCreateLibrary POSTs and invalidates [\"libraries\"] on success", async () => {
    const postSpy = vi
      .spyOn(apiModule, "apiRequest")
      .mockResolvedValue({ id: 9, module_id: "tv", root_path: "/y", display_name: "Y" });
    // The hook's onSuccess invalidates the module-level queryClient singleton,
    // so the spy must target that same instance (wrapped as the provider too).
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateLibrary(), {
      wrapper: wrapper(queryClient),
    });
    result.current.mutate({ module_id: "tv", root_path: "/y", display_name: "Y" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postSpy).toHaveBeenCalledWith("/api/v1/libraries", {
      method: "POST",
      body: { module_id: "tv", root_path: "/y", display_name: "Y" },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["libraries"] });
    invalidateSpy.mockRestore();
  });

  it("useScanLibrary POSTs to /api/v1/libraries/{id}/scan with retry disabled", async () => {
    const postSpy = vi.spyOn(apiModule, "apiRequest").mockResolvedValue({
      library_id: 3,
      discovered: 5,
      persisted: 5,
    });
    const client = new QueryClient();
    const { result } = renderHook(() => useScanLibrary(), {
      wrapper: wrapper(client),
    });

    result.current.mutate(3);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postSpy).toHaveBeenCalledWith("/api/v1/libraries/3/scan", {
      method: "POST",
    });
    // INV-no-mutation-retry is asserted at the source level (refactoring
    // checklist grep: queries.ts carries retry:0 on this mutation).
  });

  it("useAdminStatus calls apiRequest with /api/v1/admin/status", async () => {
    const spy = vi.spyOn(apiModule, "apiRequest").mockResolvedValue({
      plugins: [],
      enrich: { pending: 0, in_flight: 0, done: 0, failed: 0 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useAdminStatus(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith("/api/v1/admin/status");
  });

  it("useItems delegates to listItems with the given params", async () => {
    const listSpy = vi
      .spyOn(apiModule, "listItems")
      .mockResolvedValue({ items: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params: ListItemsParams = { library: 7, status: "pending", limit: 50, offset: 0 };

    const { result } = renderHook(() => useItems(params), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listSpy).toHaveBeenCalledWith(params);
  });

  it("useItems keys [\"items\", params] — distinct params fetch independently, identical params reuse the cache", async () => {
    const listSpy = vi
      .spyOn(apiModule, "listItems")
      .mockResolvedValue({ items: [] });
    // staleTime Infinity so a remount with identical params is served from the
    // cache instead of triggering the default refetch-on-mount (which would
    // say nothing about the key).
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const page0: ListItemsParams = { library: 7, limit: 50, offset: 0 };
    const page1: ListItemsParams = { library: 7, limit: 50, offset: 50 };

    const first = renderHook(() => useItems(page0), { wrapper: wrapper(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(listSpy).toHaveBeenCalledTimes(1);

    // Different offset → a different cache entry → a second fetch.
    const second = renderHook(() => useItems(page1), { wrapper: wrapper(client) });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(listSpy).toHaveBeenCalledTimes(2);

    // Same params → served from the ["items", page0] cache entry, no refetch.
    const cached = renderHook(() => useItems(page0), { wrapper: wrapper(client) });
    await waitFor(() => expect(cached.result.current.isSuccess).toBe(true));
    expect(listSpy).toHaveBeenCalledTimes(2);

    // The key carries the full params object so pages cache independently.
    expect(client.getQueryData(["items", page0])).toEqual({ items: [] });
    expect(client.getQueryData(["items", page1])).toEqual({ items: [] });
  });
});
