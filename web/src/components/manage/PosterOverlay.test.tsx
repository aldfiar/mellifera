// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { PosterCandidatesDTO } from "@/lib/api";
import { selectionFor, PosterOverlay } from "@/components/manage/PosterOverlay";
import { TOKEN_KEY } from "@/lib/auth";

// Artwork 3.4's acceptance floor, asserted at the fetch seam (the queries
// test idiom): the overlay states — «Текущий» + reset on a single-source
// series, the honest no-posters hint, the upload in-flight line, a rejected
// file's inline error WITHOUT closing, and select's short-poll until current
// flips before the display keys invalidate.

const HEX = "c".repeat(64);
const ART_PATH = `/api/v1/art/object/art_${HEX}`;
const RAW_REMOTE = "https://cdn.example/posters/wall.jpg";

function stubObjectUrls(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
  const create = vi.fn(
    (blob: Blob) => `blob:art-${String(blob.size)}-${String(create.mock.calls.length)}`,
  );
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true, writable: true });
  return { create, revoke };
}

function artBytes(): Response {
  return new Response("jpeg-bytes", { status: 200, headers: { "Content-Type": "image/jpeg" } });
}

function envelope(current: string): PosterCandidatesDTO {
  return {
    current,
    candidates: [
      { source: "shikimori", url: ART_PATH, current: current === "src:shikimori" },
      { source: "anilib", url: RAW_REMOTE, current: current === "src:anilib" },
    ],
  };
}

function renderOverlay(client: QueryClient, invalidate: readonly unknown[] = ["series", 1]) {
  return render(
    <QueryClientProvider client={client}>
      <PosterOverlay
        open
        kind="series"
        entityId="ser_1"
        name="Оська"
        provenance={{ plugin_id: "shikimori", fetched_at: "2026-10-01T00:00:00Z" }}
        invalidate={invalidate}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("selectionFor — the candidate → PUT vocabulary mapping (3.4)", () => {
  it("maps namespace, thumb, and user candidates onto the served vocabulary", () => {
    expect(selectionFor({ source: "anilib", url: RAW_REMOTE, current: false }, "")).toBe(
      "src:anilib",
    );
    expect(selectionFor({ source: "thumb", url: "/items/itm/media?variant=thumb", current: false }, "")).toBe(
      "thumb",
    );
    expect(selectionFor({ source: "user", url: ART_PATH, current: true }, "")).toBe(
      `user:art_${HEX}`,
    );
    // A user URL without a parseable oid backs onto the envelope's current.
    expect(selectionFor({ source: "user", url: "", current: true }, "user:art_x")).toBe(
      "user:art_x",
    );
  });
});

describe("PosterOverlay (artwork 3.4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem(TOKEN_KEY, "tok-4");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TOKEN_KEY);
  });

  it("a single-source series shows «Текущий» + reset, the staged art riding the authenticated channel", async () => {
    stubObjectUrls();
    vi.spyOn(apiModule, "posterCandidates").mockResolvedValue({
      current: "src:shikimori",
      candidates: [
        { source: "shikimori", url: ART_PATH, current: true },
      ],
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        if (String(input).includes("/art/object/")) {
          return artBytes();
        }
        throw new Error(`unexpected fetch: ${String(input)}`);
      });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderOverlay(client);

    // The active card's label, no promote button on a single source.
    expect(await screen.findByText("Текущий")).toBeDefined();
    expect(screen.queryByText("Сделать главным")).toBeNull();
    expect(screen.getByText("Сбросить к источнику")).toBeDefined();
    // The provenance footer reads the served document's _provenance.poster.
    expect(screen.getByText(/Источник плаката: shikimori/)).toBeDefined();
    // The staged proxy URL rode the authenticated channel.
    await waitFor(() => {
      const art = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/art/object/"));
      expect(art).toHaveLength(1);
      expect((art[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok-4" });
    });
  });

  it("no posters renders the honest hint — no cards, reset still offered", async () => {
    vi.spyOn(apiModule, "posterCandidates").mockResolvedValue({
      current: "",
      candidates: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderOverlay(client);

    expect(
      await screen.findByText(/Плакатов нет — ни один источник не дал подходящее изображение/),
    ).toBeDefined();
    expect(screen.queryByText("Текущий")).toBeNull();
    expect(screen.getByText("Сбросить к источнику")).toBeDefined();
  });

  it("an upload shows the in-flight quiet line and suppresses Esc while in flight", async () => {
    vi.spyOn(apiModule, "posterCandidates").mockResolvedValue(envelope("src:shikimori"));
    vi.spyOn(apiModule, "uploadPoster").mockReturnValue(new Promise(() => {})); // in flight, unresolved
    stubObjectUrls();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("/art/object/") ? artBytes() : Promise.reject(new Error("unexpected")),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderOverlay(client);
    expect(await screen.findByText("Текущий")).toBeDefined();
    expect(screen.queryByText("Загрузка…")).toBeNull();

    // Pick a file through the hidden input (the picker button opens it).
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, {
      target: { files: [new File(["jpeg-bytes"], "a.jpg", { type: "image/jpeg" })] },
    });

    // The quiet line, and the overlay stays open.
    expect(await screen.findByText("Загрузка…")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    // Esc is suppressed while the mutation is in flight.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("a rejected file surfaces the canonical inline error without closing", async () => {
    vi.spyOn(apiModule, "posterCandidates").mockResolvedValue(envelope("src:shikimori"));
    vi.spyOn(apiModule, "uploadPoster").mockRejectedValue(
      new apiModule.ApiError(400, {
        code: "bad_request",
        message: "not an image",
        retryable: false,
      }),
    );
    stubObjectUrls();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("/art/object/") ? artBytes() : Promise.reject(new Error("unexpected")),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderOverlay(client);
    expect(await screen.findByText("Текущий")).toBeDefined();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["jpeg-bytes"], "a.jpg", { type: "image/jpeg" })] },
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("bad_request");
    expect(alert.textContent).toContain("not an image");
    // The overlay STAYS OPEN — the error is inline, the escape hatch intact.
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("an oversize file fails the client pre-check inline — the server is never called", async () => {
    vi.spyOn(apiModule, "posterCandidates").mockResolvedValue(envelope("src:shikimori"));
    const uploadSpy = vi.spyOn(apiModule, "uploadPoster");
    stubObjectUrls();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("/art/object/") ? artBytes() : Promise.reject(new Error("unexpected")),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderOverlay(client);
    expect(await screen.findByText("Текущий")).toBeDefined();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["x".repeat(9 << 20)], "big.jpg", { type: "image/jpeg" })],
      },
    });

    expect(await screen.findByRole("alert").then((el) => el.textContent)).toContain("8 МиБ");
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("select PUTs, then short-polls the candidates read until current flips — display keys invalidate after the flip", async () => {
    // The served envelope reads through a mutable current: the write flips
    // it, a racing read would still serve the old one until the flip.
    let current = "src:shikimori";
    const reads = vi.fn(() => Promise.resolve(envelope(current)));
    vi.spyOn(apiModule, "posterCandidates").mockImplementation(reads);
    const putSpy = vi
      .spyOn(apiModule, "putPoster")
      .mockImplementation((_kind, _id, selection) => {
        current = selection;
        return Promise.resolve({
          entity_id: "ser_1",
          entity_kind: "series",
          selection,
          updated_at: "",
        });
      });
    stubObjectUrls();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("/art/object/") ? artBytes() : Promise.reject(new Error("unexpected")),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    renderOverlay(client);

    // The unstaged raw-URL candidate renders hotlinked (the contractual
    // exception) with its promote button; select it.
    const promote = await screen.findAllByText("Сделать главным");
    expect(promote.length).toBe(1);
    fireEvent.click(promote[0]);

    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith("series", "ser_1", "src:anilib"),
    );
    // The flip: the poll re-read the candidates after the write.
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThanOrEqual(2));
    // Only AFTER the flip do the browse surfaces' display keys invalidate —
    // they keep the previous artwork until then (no flash).
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["series", 1] }),
    );
    // The flipped envelope marks the picked card «Текущий».
    expect(await screen.findAllByText("Текущий")).toHaveLength(1);
  });

  it("«Сбросить к источнику» DELETEs the override and invalidates the display keys", async () => {
    vi.spyOn(apiModule, "posterCandidates").mockResolvedValue(envelope("src:shikimori"));
    const deleteSpy = vi
      .spyOn(apiModule, "deletePoster")
      .mockResolvedValue(undefined);
    stubObjectUrls();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("/art/object/") ? artBytes() : Promise.reject(new Error("unexpected")),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    renderOverlay(client);
    fireEvent.click(await screen.findByText("Сбросить к источнику"));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("series", "ser_1"));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["series", 1] }),
    );
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});
