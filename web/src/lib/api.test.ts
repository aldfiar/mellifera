// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  apiRequest,
  approvePairing,
  denyPairing,
  ENDPOINTS,
  fetchItemMediaObjectUrl,
  getAdminDevices,
  getAdminPairings,
  getItem,
  hasFrameGrabberThumb,
  hasOriginalFile,
  listEnrichFailures,
  listItems,
  revokeDevice,
  startPairing,
  waitPairing,
  type LibrariesResponse,
  type ListEnrichFailuresParams,
  type ListItemsParams,
} from "@/lib/api";
import { DEVICE_TOKEN_KEY, setDeviceToken, setToken, TOKEN_KEY } from "@/lib/auth";

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

// Bearer selection (the paired-device fix): the channels attach
// getBearerToken() — admin token when stored, else the device token. Before
// this, a device-only browser sent every shell call with NO header: the
// shell 401'd, handle401 cleared the just-minted token, and the device
// bounced back to a fresh pairing code — approved forever, never entered.
describe("bearer selection — the paired device's credential rides the wire", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("a device-only browser sends the DEVICE token as the bearer (the paired TV's RoleClient credential)", async () => {
    setDeviceToken("dev-token-1");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { items: [] }));

    await apiRequest<LibrariesResponse>(ENDPOINTS.libraries);

    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer dev-token-1",
    );
  });

  it("with both credentials stored the admin token wins (the operator path is unchanged)", async () => {
    setToken("t1");
    setDeviceToken("dev-token-1");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { items: [] }));

    await apiRequest<LibrariesResponse>(ENDPOINTS.libraries);

    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer t1",
    );
  });

  it("with no credential stored no Authorization header is sent (the pairing bootstrap posture)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { items: [] }));

    await apiRequest<LibrariesResponse>(ENDPOINTS.libraries);

    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("the media blob channel rides the device token too (a paired TV's posters)", async () => {
    setDeviceToken("dev-token-1");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } }),
    );
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:mocked"),
      configurable: true,
      writable: true,
    });

    await fetchItemMediaObjectUrl("/api/v1/items/itm_7_abc/media?variant=thumb");

    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer dev-token-1",
    );
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
            media_type: "tv",
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
          media_type: "tv",
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

describe("enrich failures client — D10 (listEnrichFailures <-> Go /api/v1/enrich/failures)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("sends plugin_id/limit/offset verbatim — all optional, absent = the bare endpoint", async () => {
    setToken("t1");
    // mockImplementation (not mockResolvedValue): a Response body can be read
    // only once, and this test awaits three requests.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse(200, { failures: [] }));

    const full: ListEnrichFailuresParams = {
      plugin_id: "shikimori",
      limit: 25,
      offset: 50,
    };
    await listEnrichFailures(full);
    const [fullPath] = fetchSpy.mock.calls[0]!;
    expect(fullPath).toBe(
      "/api/v1/enrich/failures?plugin_id=shikimori&limit=25&offset=50",
    );

    // Every parameter is optional (the handler contract): a no-parameter
    // request is the BARE endpoint — the handler answers the full
    // unfiltered ledger, never a client-shaped default.
    await listEnrichFailures();
    const [barePath] = fetchSpy.mock.calls[1]!;
    expect(barePath).toBe("/api/v1/enrich/failures");

    // A partial parameter set sends only the present keys.
    await listEnrichFailures({ plugin_id: "tv-parser" });
    const [scopedPath] = fetchSpy.mock.calls[2]!;
    expect(scopedPath).toBe("/api/v1/enrich/failures?plugin_id=tv-parser");
  });

  it("parses the served ledger rows verbatim (row_kind, stamps, the gone kind included)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, {
        failures: [
          {
            row_id: "ser_3_abc",
            row_kind: "series",
            title: "Во все тяжкие",
            plugin_id: "shikimori",
            status: "relayed",
            reason: "relayed: dial tcp 1.2.3.4:443: connect refused",
            attempts: 1,
            failed_at: "2026-10-27T10:00:00Z",
            next_eligible_at: "2026-10-27T10:10:00Z",
          },
          {
            row_id: "itm_9_gone",
            row_kind: "gone",
            title: "",
            plugin_id: "shikimori",
            status: "exhausted",
            reason: "no_data: chain exhausted",
            attempts: 3,
            failed_at: "2026-10-26T09:00:00Z",
            next_eligible_at: "2026-10-26T09:40:00Z",
          },
        ],
      }),
    );

    const out = await listEnrichFailures({ plugin_id: "shikimori", limit: 200 });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "/api/v1/enrich/failures?plugin_id=shikimori&limit=200",
    );
    expect(out.failures).toHaveLength(2);
    expect(out.failures[0]).toEqual({
      row_id: "ser_3_abc",
      row_kind: "series",
      title: "Во все тяжкие",
      plugin_id: "shikimori",
      status: "relayed",
      reason: "relayed: dial tcp 1.2.3.4:443: connect refused",
      attempts: 1,
      failed_at: "2026-10-27T10:00:00Z",
      next_eligible_at: "2026-10-27T10:10:00Z",
    });
    // Loop-safety rows render too — "gone" is a served kind, never filtered.
    expect(out.failures[1]!.row_kind).toBe("gone");
    expect(out.failures[1]!.status).toBe("exhausted");
  });
});

describe("itemMedia — media URL + authenticated blob channel (media-preview group 2)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("ENDPOINTS.itemMedia builds the media URL, adding ?variant=thumb only when asked", () => {
    expect(ENDPOINTS.itemMedia("itm_7_abc")).toBe("/api/v1/items/itm_7_abc/media");
    expect(ENDPOINTS.itemMedia("itm_7_abc", "thumb")).toBe(
      "/api/v1/items/itm_7_abc/media?variant=thumb",
    );
  });

  it("media-fact accessors mirror the exact facts the Go documentMediaPath reads", () => {
    // The thumb fact: sources["frame-grabber"].thumbnail_path, non-empty.
    expect(
      hasFrameGrabberThumb({
        sources: { "frame-grabber": { thumbnail_path: "/data/thumbs/x.jpg" } },
      }),
    ).toBe(true);
    // Absent / empty / wrong-namespace facts are all false — never request
    // variant=thumb without the fact (D6: a thumb miss is a 404).
    expect(hasFrameGrabberThumb({ sources: { "frame-grabber": {} } })).toBe(false);
    expect(
      hasFrameGrabberThumb({
        sources: { "frame-grabber": { thumbnail_path: "" } },
      }),
    ).toBe(false);
    expect(
      hasFrameGrabberThumb({ sources: { "tv-parser": { thumbnail_path: "/x" } } }),
    ).toBe(false);
    expect(hasFrameGrabberThumb({})).toBe(false);
    // The original fact: parsed.absolute_path, non-empty.
    expect(hasOriginalFile({ parsed: { absolute_path: "/media/f.jpg" } })).toBe(true);
    expect(hasOriginalFile({ parsed: { absolute_path: "" } })).toBe(false);
    expect(hasOriginalFile({ parsed: {} })).toBe(false);
    expect(hasOriginalFile({})).toBe(false);
  });

  it("fetchItemMediaObjectUrl carries the bearer header and returns an object URL for the blob", async () => {
    setToken("t1");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } }),
    );
    const createObjectURL = vi.fn(() => "blob:mocked");
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL,
      configurable: true,
      writable: true,
    });

    const url = await fetchItemMediaObjectUrl("/api/v1/items/itm_7_abc/media?variant=thumb");

    const [path, init] = fetchSpy.mock.calls[0]!;
    expect(path).toBe("/api/v1/items/itm_7_abc/media?variant=thumb");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer t1");
    expect(url).toBe("blob:mocked");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("fetchItemMediaObjectUrl rejects ApiError not_found on a 404 thumb miss", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(404, { error: { code: "not_found", message: "no media fact", retryable: false } }),
    );

    let caught: unknown;
    try {
      await fetchItemMediaObjectUrl("/api/v1/items/x/media?variant=thumb");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe("not_found");
    expect((caught as ApiError).status).toBe(404);
  });
});

describe("pairing client — device-pairing (wire shapes + endpoint paths)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("startPairing POSTs /api/v1/pair and parses the PairingRequest shape verbatim", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { pairing_id: "3f9a1c2e", code: "ABCD-2345" }),
    );

    const out = await startPairing();

    const [path, init] = fetchSpy.mock.calls[0]!;
    expect(path).toBe("/api/v1/pair");
    expect(init?.method).toBe("POST");
    expect(out.pairing_id).toBe("3f9a1c2e");
    expect(out.code).toBe("ABCD-2345");
  });

  it("waitPairing GETs /api/v1/pair/{id}/wait — device_token rides only when served", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        jsonResponse(200, { status: "approved", device_token: "dev-token-1" }),
      );

    const approved = await waitPairing("3f9a1c2e");
    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/v1/pair/3f9a1c2e/wait");
    expect(approved.status).toBe("approved");
    expect(approved.device_token).toBe("dev-token-1");

    // A pending (or consumed) poll omits the field entirely — absence, not null.
    fetchSpy.mockImplementation(async () => jsonResponse(200, { status: "pending" }));
    const pending = await waitPairing("3f9a1c2e");
    expect(pending.status).toBe("pending");
    expect(pending.device_token).toBeUndefined();
  });

  it("getAdminPairings hits /api/v1/admin/pairings and parses the pending list verbatim", async () => {
    setToken("t1");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, {
        pairings: [
          {
            pairing_id: "3f9a1c2e",
            code: "ABCD-2345",
            created_at: "2026-10-23T10:00:00Z",
            expires_at: "2026-10-23T10:05:00Z",
          },
        ],
      }),
    );

    const out = await getAdminPairings();

    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/v1/admin/pairings");
    expect(out.pairings[0]).toEqual({
      pairing_id: "3f9a1c2e",
      code: "ABCD-2345",
      created_at: "2026-10-23T10:00:00Z",
      expires_at: "2026-10-23T10:05:00Z",
    });
  });

  it("approvePairing POSTs the approve route; denyPairing POSTs the deny route without a body parse", async () => {
    setToken("t1");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (path) =>
        String(path).endsWith("/deny")
          ? new Response(null, { status: 200 })
          : jsonResponse(200, { pairing_id: "p1", status: "approved" }),
      );

    const approve = await approvePairing("p1");
    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/v1/admin/pairings/p1/approve");
    expect(fetchSpy.mock.calls[0]![1]?.method).toBe("POST");
    expect(approve.status).toBe("approved");

    await denyPairing("p1");
    expect(fetchSpy.mock.calls[1]![0]).toBe("/api/v1/admin/pairings/p1/deny");
    expect(fetchSpy.mock.calls[1]![1]?.method).toBe("POST");
  });

  it("getAdminDevices hits /api/v1/admin/devices; revokeDevice DELETEs the device route", async () => {
    setToken("t1");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (path) =>
        String(path).includes("/admin/devices/")
          ? new Response(null, { status: 204 })
          : jsonResponse(200, {
              devices: [
                {
                  device_id: "dev1",
                  code: "ABCD-2345",
                  created_at: "2026-10-23T10:01:00Z",
                },
              ],
            }),
      );

    const out = await getAdminDevices();
    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/v1/admin/devices");
    expect(out.devices[0]).toEqual({
      device_id: "dev1",
      code: "ABCD-2345",
      created_at: "2026-10-23T10:01:00Z",
    });

    await revokeDevice("dev1");
    expect(fetchSpy.mock.calls[1]![0]).toBe("/api/v1/admin/devices/dev1");
    expect(fetchSpy.mock.calls[1]![1]?.method).toBe("DELETE");
  });

  it("a 401 clears BOTH credentials — admin token and device token", async () => {
    setToken("t1");
    setDeviceToken("dev-token-1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(401, {
        error: { code: "unauthorized", message: "revoked", retryable: false },
      }),
    );
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignSpy },
    });

    await expect(waitPairing("p1")).rejects.toBeInstanceOf(ApiError);

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(DEVICE_TOKEN_KEY)).toBeNull(); // device cleared too (D8)
    expect(assignSpy).toHaveBeenCalledWith("/login"); // admin rotation unchanged
  });
});
