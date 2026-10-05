// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  apiRequest,
  ENDPOINTS,
  getItem,
  listItems,
  type LibrariesResponse,
  type ListItemsParams,
} from "@/lib/api";
import { setToken, TOKEN_KEY } from "@/lib/auth";

// S4 joint contract: apiRequest <-> Go /api/v1/* (authMiddleware expects
// Bearer; canonical error body {error:{code,message,retryable}}). The wrapper
// is exercised against a controlled fetch so the seam contract (not network)
// is asserted. End-to-end coverage through the real Go API is QA1.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiRequest — Bearer + verbatim parse (S4 joint)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("attaches Authorization Bearer + Accept json when a token is present and parses the body verbatim", async () => {
    setToken("t1");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse(200, { items: [{ id: 7, module_id: "tv", root_path: "/x", display_name: "L" }] }),
      );

    const out = await apiRequest<LibrariesResponse>(ENDPOINTS.libraries);

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t1");
    expect(headers.Accept).toBe("application/json");
    // verbatim — no rounding / no field renaming
    expect(out.items[0]).toEqual({ id: 7, module_id: "tv", root_path: "/x", display_name: "L" });
  });

  it("on 401 clears the token and redirects to /login and rejects", async () => {
    setToken("t1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(401, { error: { code: "unauthorized", message: "no", retryable: false } }));
    // jsdom makes window.location.assign non-configurable; replace the whole
    // location property with a stub so the redirect is observable.
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignSpy },
    });

    await expect(apiRequest<LibrariesResponse>(ENDPOINTS.libraries)).rejects.toBeInstanceOf(ApiError);

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull(); // clearToken ran
    expect(assignSpy).toHaveBeenCalledWith("/login"); // redirect fired
  });

  it("on a non-2xx canonical body rejects ApiError{code,message,retryable}", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, { error: { code: "bad_request", message: "root_path required", retryable: false } }),
    );

    let caught: unknown;
    try {
      await apiRequest<unknown>(ENDPOINTS.libraries);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.code).toBe("bad_request");
    expect(err.message).toBe("root_path required");
    expect(err.retryable).toBe(false);
    expect(err.status).toBe(400);
  });

  it("lossless: a document numeric value round-trips without rounding", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, { rating: 8.9 }));

    const out = await apiRequest<{ rating: number }>("/api/v1/_probe");
    expect(out.rating).toBe(8.9); // not 9, not "8.90"
  });
});

describe("items client — S4 joint (listItems/getItem <-> Go /api/v1/items)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("listItems hits /api/v1/items with library required and optional params only when set", async () => {
    setToken("t1");
    // mockImplementation (not mockResolvedValue): a Response body can be read
    // only once, and this test awaits two requests.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse(200, { items: [] }));

    const full: ListItemsParams = { library: 7, status: "pending", limit: 50, offset: 100 };
    await listItems(full);

    const [path] = fetchSpy.mock.calls[0]!;
    expect(path).toBe("/api/v1/items?library=7&status=pending&limit=50&offset=100");

    // status/limit/offset omitted when unset — empty status = all (server INV).
    await listItems({ library: 3 });
    const [minimalPath] = fetchSpy.mock.calls[1]!;
    expect(minimalPath).toBe("/api/v1/items?library=3");
  });

  it("listItems parses the page verbatim incl. the full document", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, {
        items: [
          {
            id: "itm_7_abc",
            module_id: "tv",
            library_id: 7,
            file_id: "abc",
            relative_path: "Сериалы/Breaking Bad/s01e01.mkv",
            media_type: "video",
            document: { _view: { title: { value: "Во все тяжкие", source: "tv-parser", reason: "parsed" } } },
            schema_version: 1,
            status: "parsed",
          },
        ],
      }),
    );

    const out = await listItems({ library: 7 });

    expect(out.items).toHaveLength(1);
    const item = out.items[0]!;
    expect(item.id).toBe("itm_7_abc");
    expect(item.library_id).toBe(7);
    expect(item.relative_path).toBe("Сериалы/Breaking Bad/s01e01.mkv"); // Cyrillic passthrough
    expect(item.document._view?.title?.value).toBe("Во все тяжкие");
    expect(item.schema_version).toBe(1);
    expect(item.status).toBe("parsed");
  });

  it("getItem hits /api/v1/items/{id} with the raw string id", async () => {
    setToken("t1");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, {
        item: {
          id: "itm_7_abc",
          module_id: "tv",
          library_id: 7,
          file_id: "abc",
          relative_path: "x.mkv",
          media_type: "video",
          document: {},
          schema_version: 1,
          status: "new",
        },
      }),
    );

    const out = await getItem("itm_7_abc");

    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/v1/items/itm_7_abc");
    expect(out.item.id).toBe("itm_7_abc");
  });

  it("getItem surfaces a 404 not_found as ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(404, { error: { code: "not_found", message: "item x not found", retryable: false } }),
    );

    let caught: unknown;
    try {
      await getItem("x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe("not_found");
    expect((caught as ApiError).status).toBe(404);
  });
});
