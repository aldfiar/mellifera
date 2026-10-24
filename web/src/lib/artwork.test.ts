// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import {
  ENDPOINTS,
  ApiError,
  deletePoster,
  isServedArtPath,
  putPoster,
  uploadPoster,
} from "@/lib/api";
import { artLru, useArtworkObjectUrl } from "@/lib/queries";
import { TOKEN_KEY } from "@/lib/auth";

// Artwork 3.1's acceptance floor, asserted at the fetch seam (the same
// idiom as api.test.ts / queries.test.tsx): the endpoint paths mirror the
// router verbatim; uploadPoster is the multipart twin (part "file", bearer
// header, NO JSON Content-Type); the module-scope LRU consults before any
// fetch and OWNS revocation on eviction and URL change. Hook invalidation
// coverage rides queries.test.tsx.

const HEX = "a".repeat(64);
const ART_PATH = `/api/v1/art/object/art_${HEX}`;

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubObjectUrls(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
  const create = vi.fn(
    (blob: Blob) => `blob:made-${String(blob.size)}-${String(create.mock.calls.length)}`,
  );
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true, writable: true });
  return { create, revoke };
}

describe("artwork endpoints (3.1)", () => {
  it("artObject builds the served object path verbatim", () => {
    expect(ENDPOINTS.artObject(`art_${HEX}`)).toBe(ART_PATH);
  });

  it("the poster family paths mirror the router", () => {
    expect(ENDPOINTS.seriesPosters("ser_1_2")).toBe("/api/v1/series/ser_1_2/posters");
    expect(ENDPOINTS.seriesPoster("ser_1_2")).toBe("/api/v1/series/ser_1_2/poster");
    expect(ENDPOINTS.itemPosters("itm_1_9")).toBe("/api/v1/items/itm_1_9/posters");
    expect(ENDPOINTS.itemPoster("itm_1_9")).toBe("/api/v1/items/itm_1_9/poster");
  });

  it("isServedArtPath accepts only same-origin art object paths", () => {
    expect(isServedArtPath(ART_PATH)).toBe(true);
    expect(isServedArtPath("/api/v1/art/object/art_x")).toBe(true);
    // A raw remote URL (an unmaterialized winner) and the media route are
    // NOT served art paths — a library surface floors them to the fallback.
    expect(isServedArtPath("https://cdn.example/posters/miss.jpg")).toBe(false);
    expect(isServedArtPath("/api/v1/items/itm_1/media?variant=thumb")).toBe(false);
    expect(isServedArtPath(null)).toBe(false);
    expect(isServedArtPath(undefined)).toBe(false);
  });
});

describe("uploadPoster — the multipart twin (3.1)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TOKEN_KEY);
  });

  it("sends the file part named file, the bearer header, and no JSON Content-Type", async () => {
    localStorage.setItem(TOKEN_KEY, "tok-1");
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        okJson({
          entity_id: "ser_1_2",
          entity_kind: "series",
          selection: `user:art_${HEX}`,
          updated_at: "2026-10-24T00:00:00Z",
        }),
      );
    const file = new File(["jpeg-bytes"], "a.jpg", { type: "image/jpeg" });

    const rec = await uploadPoster("series", "ser_1_2", file);

    expect(spy).toHaveBeenCalledTimes(1);
    const [path, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/series/ser_1_2/poster");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toBe(file);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-1");
    // The browser owns the multipart boundary Content-Type — the twin must
    // not stamp the JSON one over it.
    expect(headers["Content-Type"]).toBeUndefined();
    expect(rec.selection).toBe(`user:art_${HEX}`);
  });

  it("rejects the canonical ApiError on a non-2xx (the overlay stays open)", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "bad_request", message: "not an image", retryable: false },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const err = await uploadPoster("item", "itm_1_9", new File(["x"], "a.gif")).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).code).toBe("bad_request");
    expect(spy).toHaveBeenCalledWith(
      "/api/v1/items/itm_1_9/poster",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("putPoster / deletePoster (3.1)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("putPoster PUTs the selection in the served vocabulary", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okJson({ entity_id: "itm_1_9", entity_kind: "item", selection: "thumb", updated_at: "" }));

    await putPoster("item", "itm_1_9", "thumb");

    expect(spy).toHaveBeenCalledTimes(1);
    const [path, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/items/itm_1_9/poster");
    expect(init.method).toBe("PUT");
    // apiRequest JSON.stringifies the body — the served {selection} shape.
    expect(init.body).toBe('{"selection":"thumb"}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("deletePoster DELETEs to the idempotent 204", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await deletePoster("series", "ser_1_2");

    expect(spy).toHaveBeenCalledWith(
      "/api/v1/series/ser_1_2/poster",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("artLru — consult / evict / revoke-on-URL-change (3.1)", () => {
  let revoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    ({ revoke } = stubObjectUrls());
    artLru.reset(); // revokes through the stub — never a real blob
    revoke.mockClear(); // the drain is hygiene, not the behavior under test
  });
  afterEach(() => vi.restoreAllMocks());

  it("consult/store round-trip and refresh recency", () => {
    artLru.store("k1", "blob:1");
    expect(artLru.consult("k1")).toBe("blob:1");
    expect(artLru.consult("k2")).toBeUndefined();
  });

  it("storing a new URL under the same key revokes the prior object URL", () => {
    artLru.store("k1", "blob:1");
    artLru.store("k1", "blob:2");
    expect(revoke).toHaveBeenCalledWith("blob:1");
    expect(artLru.consult("k1")).toBe("blob:2");
    // The same URL re-stored is NOT a change — nothing to revoke.
    revoke.mockClear();
    artLru.store("k1", "blob:2");
    expect(revoke).not.toHaveBeenCalled();
  });

  it("evicts (and revokes) the least-recently-used entry past the cap", () => {
    for (let i = 0; i < 64; i += 1) {
      artLru.store(`k${String(i)}`, `blob:${String(i)}`);
    }
    // k0 is oldest — consulting it refreshes its recency, so k1 becomes
    // the eviction victim when the cap overflows.
    expect(artLru.consult("k0")).toBe("blob:0");
    artLru.store("k64", "blob:64");
    expect(revoke).toHaveBeenCalledWith("blob:1");
    expect(artLru.consult("k1")).toBeUndefined();
    expect(artLru.consult("k0")).toBe("blob:0");
    expect(artLru.consult("k64")).toBe("blob:64");
  });
});

describe("useArtworkObjectUrl — LRU in front of the fetch (3.1)", () => {
  let create: ReturnType<typeof vi.fn>;
  let revoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    ({ create, revoke } = stubObjectUrls());
    artLru.reset(); // drain leftovers through the stub
    revoke.mockClear();
    create.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("consults the LRU before fetching — a warm URL costs zero network", async () => {
    artLru.store(ART_PATH, "blob:warm");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useArtworkObjectUrl(ART_PATH));

    await waitFor(() => expect(result.current).toBe("blob:warm"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches a miss through the authenticated channel and parks the blob", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } }));

    const { result } = renderHook(() => useArtworkObjectUrl(ART_PATH));

    await waitFor(() => expect(result.current).toMatch(/^blob:made-/));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [path, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(ART_PATH);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined(); // no token stored → anonymous posture, the shared channel's rule
    expect(artLru.consult(ART_PATH)).toBe(result.current);
    expect(create).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled(); // the hook never revokes what it hands out
  });

  it("any failure → null, so the surface keeps its generated fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "not_found", message: "no art", retryable: false } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useArtworkObjectUrl(ART_PATH));

    await waitFor(() => expect(result.current).toBeNull());
    expect(artLru.consult(ART_PATH)).toBeUndefined(); // nothing parked on failure
  });

  it("a null URL never fetches and stays null", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useArtworkObjectUrl(null));
    expect(result.current).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
