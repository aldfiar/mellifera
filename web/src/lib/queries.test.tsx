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
  usePosterCandidates,
  usePosterMutations,
  useApprovePairing,
  useCreateLibrary,
  useDenyPairing,
  useDevices,
  useItemMedia,
  useItems,
  useLibraries,
  usePairingWait,
  usePairings,
  useRevokeDevice,
  useScanLibrary,
  useStartPairing,
  useWatchDefaults,
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

describe("useItemMedia — object-URL lifecycle (media-preview D5)", () => {
  function stubObjectUrls(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
    const create = vi.fn(() => `blob:mock-${String(Math.random())}`);
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true, writable: true });
    return { create, revoke };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the media URL through the blob channel and revokes the object URL on unmount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } }),
    );
    const { create, revoke } = stubObjectUrls();

    const { result, unmount } = renderHook(() =>
      useItemMedia("/api/v1/items/itm_1_a/media?variant=thumb"),
    );

    await waitFor(() => expect(result.current).toBe(create.mock.results[0]?.value));
    unmount();
    expect(revoke).toHaveBeenCalledWith(create.mock.results[0]?.value);
  });

  it("returns null on any media error (404 thumb miss) — the caller keeps its placeholder", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found", message: "x", retryable: false } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { create } = stubObjectUrls();

    const { result } = renderHook(() =>
      useItemMedia("/api/v1/items/itm_1_a/media?variant=thumb"),
    );

    // The fetch fired, the error settled, and NO object URL was ever minted —
    // the placeholder is the only surface the caller can render.
    await waitFor(() => expect(result.current).toBeNull(), { timeout: 50 });
    await new Promise((r) => setTimeout(r, 10));
    expect(create).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("fires no request for a null URL — the caller's pre-selection said no media fact", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    stubObjectUrls();

    const { result } = renderHook(() => useItemMedia(null));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});

describe("pairing hooks — device-pairing (admin verbs + device bootstrap)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("usePairings / useDevices read the admin pairing surfaces", async () => {
    const pairingsSpy = vi.spyOn(apiModule, "getAdminPairings").mockResolvedValue({
      pairings: [
        { pairing_id: "p1", code: "ABCD-2345", created_at: "c", expires_at: "e" },
      ],
    });
    const devicesSpy = vi.spyOn(apiModule, "getAdminDevices").mockResolvedValue({
      devices: [{ device_id: "dev1", code: "ABCD-2345", created_at: "c" }],
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const pairings = renderHook(() => usePairings(), { wrapper: wrapper(client) });
    await waitFor(() => expect(pairings.result.current.isSuccess).toBe(true));
    expect(pairingsSpy).toHaveBeenCalledTimes(1);
    expect(pairings.result.current.data?.pairings[0]?.pairing_id).toBe("p1");

    const devices = renderHook(() => useDevices(), { wrapper: wrapper(client) });
    await waitFor(() => expect(devices.result.current.isSuccess).toBe(true));
    expect(devicesSpy).toHaveBeenCalledTimes(1);
    expect(devices.result.current.data?.devices[0]?.device_id).toBe("dev1");
  });

  it("useApprovePairing POSTs and invalidates [\"admin-pairings\"] on success", async () => {
    const approveSpy = vi.spyOn(apiModule, "approvePairing").mockResolvedValue({
      pairing_id: "p1",
      status: "approved",
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useApprovePairing(), {
      wrapper: wrapper(queryClient),
    });
    result.current.mutate("p1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(approveSpy).toHaveBeenCalledWith("p1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-pairings"] });
    invalidateSpy.mockRestore();
  });

  it("useDenyPairing and useRevokeDevice invalidate their lists on success", async () => {
    const denySpy = vi.spyOn(apiModule, "denyPairing").mockResolvedValue(undefined);
    const revokeSpy = vi
      .spyOn(apiModule, "revokeDevice")
      .mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const deny = renderHook(() => useDenyPairing(), {
      wrapper: wrapper(queryClient),
    });
    deny.result.current.mutate("p1");
    await waitFor(() => expect(deny.result.current.isSuccess).toBe(true));

    const revoke = renderHook(() => useRevokeDevice(), {
      wrapper: wrapper(queryClient),
    });
    revoke.result.current.mutate("dev1");
    await waitFor(() => expect(revoke.result.current.isSuccess).toBe(true));

    expect(denySpy).toHaveBeenCalledWith("p1");
    expect(revokeSpy).toHaveBeenCalledWith("dev1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-pairings"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-devices"] });
    invalidateSpy.mockRestore();
  });

  it("useStartPairing mints via POST /pair; usePairingWait polls only with an id", async () => {
    const startSpy = vi.spyOn(apiModule, "startPairing").mockResolvedValue({
      pairing_id: "p1",
      code: "ABCD-2345",
    });
    const waitSpy = vi
      .spyOn(apiModule, "waitPairing")
      .mockResolvedValue({ status: "pending" });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
    });

    const start = renderHook(() => useStartPairing(), { wrapper: wrapper(client) });
    start.result.current.mutate();
    await waitFor(() => expect(start.result.current.isSuccess).toBe(true));
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(start.result.current.data?.code).toBe("ABCD-2345");

    // Empty id (the start request has not landed yet) → the poll never fires.
    const idle = renderHook(() => usePairingWait(""), { wrapper: wrapper(client) });
    await waitFor(() => expect(idle.result.current.fetchStatus).toBe("idle"));
    expect(waitSpy).not.toHaveBeenCalled();

    // With the minted id → the poll fires.
    const polling = renderHook(() => usePairingWait("p1"), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(polling.result.current.isSuccess).toBe(true));
    expect(waitSpy).toHaveBeenCalledWith("p1");
  });
});

describe("useWatchDefaults — the served countdown shape (watch-flow-polish 3.3)", () => {
  it("use_watch_defaults_reads_served_shape", async () => {
    const spy = vi
      .spyOn(apiModule, "fetchWatchDefaults")
      .mockResolvedValue({ auto_next_countdown_seconds: 12 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useWatchDefaults(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
    // The served shape read verbatim: the ONLY countdown source the card
    // has — no client-side default exists to fall back to (Q5/D5).
    expect(result.current.data).toEqual({ auto_next_countdown_seconds: 12 });
  });
});

describe("poster hooks — the useTitleOverride pattern (artwork 3.1)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('usePosterCandidates reads the posters read key through posterCandidates', async () => {
    const spy = vi.spyOn(apiModule, "posterCandidates").mockResolvedValue({
      current: "src:shikimori",
      candidates: [
        { source: "shikimori", url: "/api/v1/art/object/art_" + "c".repeat(64), current: true },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePosterCandidates("series", "ser_1"), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith("series", "ser_1");
    expect(result.current.data?.current).toBe("src:shikimori");
  });

  it("usePosterMutations.put PUTs the selection and invalidates the family read", async () => {
    const putSpy = vi.spyOn(apiModule, "putPoster").mockResolvedValue({
      entity_id: "ser_1",
      entity_kind: "series",
      selection: "src:shikimori",
      updated_at: "",
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => usePosterMutations("series", "ser_1"), {
      wrapper: wrapper(queryClient),
    });

    result.current.put.mutate("src:shikimori");
    await waitFor(() => expect(result.current.put.isSuccess).toBe(true));
    expect(putSpy).toHaveBeenCalledWith("series", "ser_1", "src:shikimori");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["posters", "series", "ser_1"] });
    invalidateSpy.mockRestore();
  });

  it("usePosterMutations.upload uploads the file and invalidates the family read", async () => {
    const uploadSpy = vi.spyOn(apiModule, "uploadPoster").mockResolvedValue({
      entity_id: "ser_1",
      entity_kind: "series",
      selection: "user:art_" + "c".repeat(64),
      updated_at: "",
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => usePosterMutations("series", "ser_1"), {
      wrapper: wrapper(queryClient),
    });

    const file = new File(["jpeg-bytes"], "a.jpg", { type: "image/jpeg" });
    result.current.upload.mutate(file);
    await waitFor(() => expect(result.current.upload.isSuccess).toBe(true));
    expect(uploadSpy).toHaveBeenCalledWith("series", "ser_1", file);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["posters", "series", "ser_1"] });
    invalidateSpy.mockRestore();
  });

  it("usePosterMutations.reset DELETEs and invalidates the family read", async () => {
    const deleteSpy = vi.spyOn(apiModule, "deletePoster").mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => usePosterMutations("item", "itm_1_9"), {
      wrapper: wrapper(queryClient),
    });

    result.current.reset.mutate();
    await waitFor(() => expect(result.current.reset.isSuccess).toBe(true));
    expect(deleteSpy).toHaveBeenCalledWith("item", "itm_1_9");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["posters", "item", "itm_1_9"] });
    invalidateSpy.mockRestore();
  });
});
