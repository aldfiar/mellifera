// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as apiModule from "@/lib/api";
import type { ItemDTO } from "@/lib/api";
import { TOKEN_KEY } from "@/lib/auth";
import InfoColumn from "@/components/watch/InfoColumn";

// InfoColumn (watch-flow-polish 3.2): every block is FIELD-DRIVEN off the
// served ElementMetadata projection — the full projection renders all four
// blocks (the SxxEyy eyebrow + served episode title heading, «Серия», «В
// ролях», the shipped About panel), and an absent field leaves its block
// absent — never a placeholder, never an empty frame, never a fabricated
// value or a source literal. getSeries is mocked at the api seam (the About
// source resolves the series row through the shared series cache, matched
// BY PATH); the cast photo rides the authenticated art channel, so jsdom's
// missing blob-URL factory is stubbed and the bytes travel the global fetch
// — the same posture as the artwork tests in ItemDetail.test.tsx.

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderColumn(item: ItemDTO): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={freshClient()}>
      <InfoColumn item={item} />
    </QueryClientProvider>,
  );
}

const HEX = "c".repeat(64);
const PHOTO_PATH = `/api/v1/art/object/art_${HEX}`;

// A full-projection episode: parsed series anchor + episode numbers (the
// SxxEyy facts), a served episode block (title + description), cast entries
// (one with role + served-proxy photo, one role-only), and an about block
// on the ITEM row that must LOSE to the series row's (the decoy below).
const EPISODE: ItemDTO = {
  id: "itm_w_ep",
  module_id: "serial",
  library_id: 7,
  file_id: "w",
  relative_path: "shows/Ария/s01e02.mkv",
  media_type: "serial",
  schema_version: 1,
  status: "ready",
  display_name: "Проснись, Ария! · S01E02",
  document: {
    parsed: { series_relative_path: "Ария (2005)" },
    sources: { "serial-parser": { season: 1, episode: 2 } },
  },
  metadata: {
    about: {
      source: "shikimori",
      description: "Локальный синопсис эпизода — не рендерится.",
    },
    episode: {
      title: "Пробуждение",
      description: "Аста просыпается в хижине.",
    },
    cast: [
      { name: "Аста", role: "Главный герой", photo_url: PHOTO_PATH },
      { name: "Ноэлла", role: "Ведьма" },
    ],
  },
};

// The series row the episode's PATH anchor resolves to — its served about
// block is the About panel's source for an episode.
const SERIES_ROW = {
  id: "ser_7_aria",
  module_id: "serial",
  library_id: 7,
  relative_path: "Ария (2005)",
  document: {},
  schema_version: 1,
  status: "ready",
  title_override: "",
  display_name: "Проснись, Ария!",
  metadata: {
    about: {
      source: "shikimori",
      description: "Действие разворачивается на Аквамарине.",
      genres: ["Фэнтези"],
    },
  },
};

describe("InfoColumn — blocks render from the served projection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem(TOKEN_KEY, "tok-info");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(TOKEN_KEY);
  });

  it("blocks_render_from_served_projection", async () => {
    vi.spyOn(apiModule, "getSeries").mockResolvedValue({
      items: [SERIES_ROW],
    });
    const create = vi.fn(() => "blob:cast-photo");
    Object.defineProperty(URL, "createObjectURL", {
      value: create,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        if (String(input).includes("/art/object/")) {
          return new Response("cast-bytes", {
            status: 200,
            headers: { "Content-Type": "image/jpeg" },
          });
        }
        return new Response('{"items":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

    renderColumn(EPISODE);

    const column = screen.getByRole("region", { name: "Watch info" });

    // Heading: the SxxEyy eyebrow with the SERVED episode title — the
    // display name (which already embeds its own SxxEyy tail) is not the
    // column's heading source here.
    expect(within(column).getByText("S01E02")).toBeDefined();
    expect(
      within(column).getByRole("heading", { name: "Пробуждение" }),
    ).toBeDefined();

    // «Серия»: the served episode description, verbatim.
    expect(within(column).getByText("Серия")).toBeDefined();
    expect(
      within(column).getByText("Аста просыпается в хижине."),
    ).toBeDefined();

    // «В ролях»: each served entry — the name, its optional role when
    // present (both entries carry one here).
    expect(within(column).getByText("В ролях")).toBeDefined();
    expect(within(column).getByText("Аста")).toBeDefined();
    expect(within(column).getByText("Главный герой")).toBeDefined();
    expect(within(column).getByText("Ноэлла")).toBeDefined();
    expect(within(column).getByText("Ведьма")).toBeDefined();

    // The image renders only where photo_url is present — and only the
    // SERVED proxy form rides the authenticated art channel (one request,
    // bearer-carried); the photo-less entry shows the generated initial
    // (PosterFrame's fallback), firing no second request.
    await waitFor(() => {
      const photo = within(column).getByRole("img", { name: "Аста" });
      expect(photo.getAttribute("src")).toBe("blob:cast-photo");
    });
    const artCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/art/object/"),
    );
    expect(artCalls).toHaveLength(1);
    expect(String(artCalls[0][0])).toBe(PHOTO_PATH);
    expect((artCalls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer tok-info",
    });
    expect(
      within(column).getByRole("img", { name: "Ноэлла" }).textContent,
    ).toContain("Н");

    // The About panel: the SERIES row's served about block — the episode's
    // own about (the decoy) loses, and the panel never names its source.
    const about = within(column).getByRole("region", { name: "About" });
    expect(about.textContent).toContain("Аквамарине");
    expect(about.textContent).not.toContain("не рендерится");
    expect(about.textContent).not.toContain("shikimori");
  });
});

describe("InfoColumn — absent fields leave absent blocks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // The series read stays answered (empty — no row resolves) so the
    // absence assertions below never ride a dangling query.
    vi.spyOn(apiModule, "getSeries").mockResolvedValue({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it("absent_fields_leave_absent_blocks", async () => {
    // (a) Title without a description, no cast, no about anywhere: the
    // eyebrow + served title heading renders; «Серия», «В ролях», and About
    // stay absent — no placeholder, no empty frame.
    const titleOnly: ItemDTO = {
      ...EPISODE,
      metadata: { episode: { title: "Пробуждение" } },
    };
    const first = renderColumn(titleOnly);
    const column = screen.getByRole("region", { name: "Watch info" });
    expect(within(column).getByText("S01E02")).toBeDefined();
    expect(
      within(column).getByRole("heading", { name: "Пробуждение" }),
    ).toBeDefined();
    expect(within(column).queryByText("Серия")).toBeNull();
    expect(within(column).queryByText("В ролях")).toBeNull();
    expect(
      within(column).queryByRole("region", { name: "About" }),
    ).toBeNull();
    first.unmount();

    // (b) A description without a title: the block inverts — the eyebrow
    // heads ALONE (no title is fabricated — no h2) and «Серия» renders its
    // text.
    const descriptionOnly: ItemDTO = {
      ...EPISODE,
      metadata: { episode: { description: "Аста просыпается в хижине." } },
    };
    const second = renderColumn(descriptionOnly);
    const soloEyebrow = screen.getByRole("region", { name: "Watch info" });
    expect(within(soloEyebrow).getByText("S01E02")).toBeDefined();
    expect(within(soloEyebrow).queryByRole("heading", { level: 2 })).toBeNull();
    expect(within(soloEyebrow).getByText("Серия")).toBeDefined();
    expect(
      within(soloEyebrow).getByText("Аста просыпается в хижине."),
    ).toBeDefined();
    second.unmount();

    // (c) A film: no parsed episode facts, no episode block, no cast, no
    // about — the column heads with the SERVED display name and nothing
    // else (no eyebrow is fabricated from the file name).
    const film: ItemDTO = {
      ...EPISODE,
      relative_path: "films/Оська.mkv",
      display_name: "Оська",
      document: {},
      metadata: undefined,
    };
    const third = renderColumn(film);
    const filmColumn = screen.getByRole("region", { name: "Watch info" });
    expect(within(filmColumn).queryByText("S01E02")).toBeNull();
    expect(
      within(filmColumn).getByRole("heading", { name: "Оська" }),
    ).toBeDefined();
    expect(within(filmColumn).queryByText("Серия")).toBeNull();
    expect(within(filmColumn).queryByText("В ролях")).toBeNull();
    expect(
      within(filmColumn).queryByRole("region", { name: "About" }),
    ).toBeNull();
    third.unmount();

    // (d) Nothing served at all — the column renders nothing at all: no
    // empty frame mounts in the watch lane.
    const bare: ItemDTO = { ...film, display_name: undefined };
    const fourth = renderColumn(bare);
    expect(screen.queryByRole("region", { name: "Watch info" })).toBeNull();
    fourth.unmount();
  });
});
