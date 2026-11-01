// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { setToken, TOKEN_KEY } from "@/lib/auth";
import {
  claimOnce,
  executeDescriptor,
  postResult,
  resetRelayPacing,
  type RelayClaim,
  type RelayClock,
  type RelayPlanSpec,
  type RelayResult,
} from "@/lib/relay";

// client-relayed-fetch 6.1 — table-driven vectors over the relay client core
// with a mocked fetch. The served wire contract is the ground truth: the
// claim descriptor rides store.PlanSpec json tags verbatim (body = the base64
// string the Go []byte emits), the result route decodes body STRICTLY as
// base64 ([]byte — internal/api/relay_test.go relayDoneBody is "the exact
// shape 6.1's postResult posts"), so both directions carry base64 bodies and
// the descriptor fields go out unmodified.

const UPSTREAM = "https://upstream.example.com/v1/search";

// b64 — the platform's own encoder as the fixture reference (never the
// module-under-test's helper, so the vectors cannot tautologically pass).
const b64 = (s: string): string => btoa(s);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(status: number): Response {
  return jsonResponse(status, {
    error: { code: "internal_error", message: "boom", retryable: false },
  });
}

// descriptorTable — the "executed verbatim" vectors: whatever the server
// served goes out byte-identical (method, url, headers, decoded body bytes),
// and the response lands as {http_status, headers, body(base64)}.
const descriptorTable: {
  name: string;
  spec: RelayPlanSpec;
  respond: () => Response;
  wantBodyBytes: number[] | null;
  wantResult: RelayResult;
}[] = [
  {
    name: "GET with headers goes out verbatim, body decoded, text response base64",
    spec: {
      method: "GET",
      url: `${UPSTREAM}?q=x`,
      headers: { Accept: "application/json" },
      binary_safe: false,
      timeout_seconds: 3,
      min_interval_ms: 0,
    },
    respond: () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    wantBodyBytes: null as number[] | null,
    wantResult: {
      http_status: 200,
      headers: { "content-type": "application/json" },
      body: b64('{"ok":true}'),
    },
  },
  {
    name: "POST with a served body rides as decoded bytes, headers verbatim",
    spec: {
      method: "POST",
      url: UPSTREAM,
      headers: { "X-Api-Key": "k1", Accept: "application/json" },
      body: b64("payload"),
      binary_safe: false,
      timeout_seconds: 5,
      min_interval_ms: 0,
    },
    respond: () =>
      new Response("done", { status: 200, headers: { "Content-Type": "text/plain" } }),
    wantBodyBytes: [0x70, 0x61, 0x79, 0x6c, 0x6f, 0x61, 0x64],
    wantResult: {
      http_status: 200,
      headers: { "content-type": "text/plain" },
      body: b64("done"),
    },
  },
  {
    name: "no served headers field → no request headers added",
    spec: {
      method: "GET",
      url: UPSTREAM,
      binary_safe: false,
      timeout_seconds: 2,
      min_interval_ms: 0,
    },
    respond: () =>
      new Response("ok", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    wantBodyBytes: null,
    wantResult: {
      http_status: 200,
      headers: { "content-type": "application/json" },
      body: b64("ok"),
    },
  },
  {
    name: "empty response body → result carries no body field (omitempty)",
    spec: {
      method: "GET",
      url: UPSTREAM,
      binary_safe: true,
      timeout_seconds: 2,
      min_interval_ms: 0,
    },
    respond: () => new Response(null, { status: 204 }),
    wantBodyBytes: null,
    wantResult: { http_status: 204 },
  },
];

describe("executeDescriptor", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRelayPacing();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(descriptorTable)("executes_descriptor_verbatim — $name", async (tc) => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => tc.respond());

    const result = await executeDescriptor(tc.spec);

    // the descriptor's own fields out verbatim — nothing merged or fixed up
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(tc.spec.url);
    expect(init?.method).toBe(tc.spec.method);
    expect(init?.headers).toEqual(tc.spec.headers);
    if (tc.wantBodyBytes === null) {
      expect(init?.body).toBeUndefined();
    } else {
      expect(Array.from(init?.body as Uint8Array)).toEqual(tc.wantBodyBytes);
    }
    expect(result).toEqual(tc.wantResult);
  });

  it("posts_result_base64_when_binary_safe", async () => {
    // not valid UTF-8 text — the case binary_safe exists for
    const bytes = new Uint8Array([0x00, 0xff, 0x7f]);
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } }),
      );

    const result = await executeDescriptor({
      method: "GET",
      url: UPSTREAM,
      binary_safe: true,
      timeout_seconds: 3,
      min_interval_ms: 0,
    });

    const wantBody = btoa(String.fromCharCode(...bytes)); // "AP9/" platform-encoded
    expect(result).toEqual({
      http_status: 200,
      headers: { "content-type": "image/png" },
      body: wantBody,
    });

    // the outcome posts with the body still base64 — the ONLY encoding the
    // Go []byte decode accepts on /relay/{id}/result
    spy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await postResult(7, result);
    const [url, init] = spy.mock.calls[1]!;
    expect(url).toBe("/api/v1/relay/7/result");
    expect(init?.method).toBe("POST");
    // apiRequestVoid's posture: Accept always, Content-Type for the body
    expect(init?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      http_status: 200,
      headers: { "content-type": "image/png" },
      body: wantBody,
    });
  });

  it("a non-2xx upstream answer is still a posted outcome (no error field)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("boom", { status: 503, headers: { "Content-Type": "text/plain" } }),
      );

    const result = await executeDescriptor({
      method: "GET",
      url: UPSTREAM,
      binary_safe: false,
      timeout_seconds: 3,
      min_interval_ms: 0,
    });

    expect(result).toEqual({
      http_status: 503,
      headers: { "content-type": "text/plain" },
      body: b64("boom"),
    });
    expect(result.error).toBeUndefined();

    spy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(postResult(9, result)).resolves.toBeUndefined();
    const [, init] = spy.mock.calls[1]!;
    expect(JSON.parse(init?.body as string)).toEqual({
      http_status: 503,
      headers: { "content-type": "text/plain" },
      body: b64("boom"),
    });
  });

  it("timeout abort posts the error outcome", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    const pending = executeDescriptor({
      method: "GET",
      url: UPSTREAM,
      binary_safe: false,
      timeout_seconds: 2,
      min_interval_ms: 0,
    });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;

    expect(result).toEqual({ error: "timeout after 2s" });
    expect(result.http_status).toBeUndefined();

    // the failed shape rides the same route error-only
    spy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await postResult(4, result);
    const [, init] = spy.mock.calls[1]!;
    expect(init?.body).toBe('{"error":"timeout after 2s"}');
  });

  it("a network failure is an error-only outcome (timeout_seconds 0 arms no abort)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    const result = await executeDescriptor({
      method: "GET",
      url: UPSTREAM,
      binary_safe: false,
      timeout_seconds: 0,
      min_interval_ms: 0,
    });

    expect(result).toEqual({ error: "fetch failed" });
  });

  it("min_interval_ms paces start-to-start between executions (injectable clock)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } }),
      );
    let t = 1000;
    const delays: number[] = [];
    const clock: RelayClock = {
      now: () => t,
      delay: async (ms) => {
        delays.push(ms);
        t += ms;
      },
    };

    await executeDescriptor(
      { method: "GET", url: UPSTREAM, binary_safe: false, timeout_seconds: 0, min_interval_ms: 0 },
      clock,
    );
    expect(delays).toEqual([]); // the first execution never waits

    t += 50; // only 50 ms have passed when the second descriptor arrives
    await executeDescriptor(
      { method: "GET", url: UPSTREAM, binary_safe: false, timeout_seconds: 0, min_interval_ms: 250 },
      clock,
    );
    expect(delays).toEqual([200]); // waited out 250 − 50, best-effort
    expect(t).toBe(1250); // second send stamped at first + min_interval
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("claimOnce", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRelayPacing();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("claim_204_is_a_no_op", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(claimOnce()).resolves.toBeNull();

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("/api/v1/relay/claim");
    expect(init?.method).toBe("POST");
  });

  it("a 200 claim parses the served descriptor verbatim through the wrapper", async () => {
    setToken("t1"); // the poll rides the authenticated wrapper's bearer
    const claim: RelayClaim = {
      id: 9,
      purpose: "enrich",
      plan: [
        {
          method: "GET",
          url: `${UPSTREAM}?id=42`,
          binary_safe: true,
          timeout_seconds: 4,
          min_interval_ms: 250,
        },
      ],
    };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, claim));

    await expect(claimOnce()).resolves.toEqual(claim);

    const [, init] = spy.mock.calls[0]!;
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer t1",
    });
  });

  it("a 401 propagates as ApiError after the wrapper's rotation", async () => {
    setToken("t1");
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonError(401));

    await expect(claimOnce()).rejects.toBeInstanceOf(ApiError);
    await expect(claimOnce()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(assign).toHaveBeenCalledWith("/login"); // the existing 401 path ran
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("a 500 propagates as ApiError — never swallowed as idle", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonError(500));

    await expect(claimOnce()).rejects.toMatchObject({ status: 500 });
  });
});
