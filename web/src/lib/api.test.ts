// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, ENDPOINTS, type LibrariesResponse } from "@/lib/api";
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
