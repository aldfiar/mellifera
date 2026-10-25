// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import type { ReactElement } from "react";

import * as apiModule from "@/lib/api";
import type { ItemDTO, SeriesDTO, WatchDefaultsDTO } from "@/lib/api";
import AutoNext, { AUTO_NEXT_CANCELLED_KEY } from "@/components/playback/AutoNext";

// watch-flow-polish 3.3 — the auto-next card's acceptance axes: the served
// countdown runs to zero and navigates (the [Смотреть] path, fired), [Отмена]
// suppresses the card for the browsing session through the sessionStorage
// key, an unavailable served shape means buttons only and NEVER autoplay
// (D5 — the SPA bakes no fallback), and films (no parseable episode facts)
// never render the card. The queries are served from a pre-seeded
// staleTime-Infinity client — the same entries the watch view warms — so the
// vectors are synchronous and deterministic under fake timers.

// doc — the episode fixture document: the parsed series anchor plus the
// season/episode numbers out of a dynamic source namespace (the same seams
// nextup.test.ts pins).
function episodeDoc(season: number, n: number): ItemDTO["document"] {
  return {
    parsed: { series_relative_path: "Show" },
    sources: { "tv-parser": { season, episode: n } },
  };
}

function episode(id: string, season: number, n: number, title?: string): ItemDTO {
  return {
    id,
    module_id: "serial",
    library_id: 1,
    file_id: `file-${id}`,
    relative_path: `Show/${id}.mkv`,
    media_type: "serial",
    schema_version: 1,
    status: "ready",
    document: episodeDoc(season, n),
    metadata: title !== undefined ? { episode: { title } } : undefined,
  };
}

// FILM — no parsed series anchor, no episode numbers: episodeFacts resolves
// to null, so no next episode can ever be picked.
const FILM: ItemDTO = {
  id: "itm_1_film",
  module_id: "tv",
  library_id: 1,
  file_id: "file-film",
  relative_path: "Film.mkv",
  media_type: "tv",
  document: {},
  schema_version: 1,
  status: "ready",
};

const SERIES: SeriesDTO = {
  id: "ser_1_show",
  module_id: "serial",
  library_id: 1,
  relative_path: "Show",
  document: {},
  schema_version: 1,
  status: "ready",
  display_name: "Шоу",
};

const CURRENT = episode("itm_1_s1e1", 1, 1);
const NEXT = episode("itm_1_s1e2", 1, 2, "После");
const HARNESS_ID = "itm_1_s1e1"; // the id the harness route renders

// seededClient — the warm watch-view cache: the item, its series row, the
// series' episode list, and (when given) the served countdown shape.
function seededClient(overrides?: {
  current?: ItemDTO;
  episodes?: ItemDTO[];
  defaults?: WatchDefaultsDTO;
}): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["item", HARNESS_ID], { item: overrides?.current ?? CURRENT });
  client.setQueryData(["series", 1], { items: [SERIES] });
  client.setQueryData(["series-episodes", SERIES.id], {
    items: overrides?.episodes ?? [CURRENT, NEXT],
  });
  if (overrides?.defaults !== undefined) {
    client.setQueryData(["watch-defaults"], overrides.defaults);
  }
  return client;
}

// LocationProbe — the navigation sink: the card's [Смотреть] path (and the
// countdown's zero) navigate through the Router; the probe reads where the
// route actually landed.
function LocationProbe(): ReactElement {
  const location = useLocation();
  return <span data-testid="route">{location.pathname}</span>;
}

// WatchPage — the harness route body: AutoNext reads its item id from the
// route param, mirroring the watch view (a navigation into the next episode
// re-keys the reads — the card cannot survive its own navigation).
function WatchPage(props: { ended: boolean }): ReactElement {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <AutoNext itemId={id ?? ""} ended={props.ended} />
      <LocationProbe />
    </>
  );
}

function harness(ended: boolean, client: QueryClient): ReactElement {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/items/${HARNESS_ID}`]}>
        <Routes>
          <Route path="/items/:id" element={<WatchPage ended={ended} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderCard(ended: boolean, client: QueryClient) {
  return render(harness(ended, client));
}

function theCountdown(): string | null {
  const node = screen.queryByTestId("auto-next-countdown");
  return node === null ? null : (node.textContent ?? "");
}

function theRoute(): string {
  return screen.getByTestId("route").textContent ?? "";
}

beforeEach(() => {
  // The unanswered-shape default: a pending promise never resolves, so no
  // vector accidentally grows a countdown from an unseeded defaults key
  // (seeded vectors never reach the client through their staleTime-Infinity
  // cache entries anyway).
  vi.spyOn(apiModule, "fetchWatchDefaults").mockImplementation(
    () => new Promise<WatchDefaultsDTO>(() => {}),
  );
  // Backstops for any unseeded read (e.g. the harness route re-keying after
  // a navigation): a film answer keeps the card from rendering on a bare id.
  vi.spyOn(apiModule, "getItem").mockResolvedValue({ item: FILM });
  vi.spyOn(apiModule, "getSeries").mockResolvedValue({ items: [] });
  vi.spyOn(apiModule, "getSeriesEpisodes").mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("countdown_runs_on_served_value_and_navigates_at_zero", () => {
  it("shows the served seconds, ticks to zero and navigates into the next episode", () => {
    vi.useFakeTimers();
    const client = seededClient({ defaults: { auto_next_countdown_seconds: 3 } });
    renderCard(true, client);

    // The card names the next episode: the served series display name, the
    // SxxEyy label, and the served next-episode title, with both buttons.
    expect(screen.getByTestId("auto-next-card")).toBeDefined();
    expect(screen.getByText("Следующая серия")).toBeDefined();
    expect(screen.getByText("Шоу · S01E02")).toBeDefined();
    expect(screen.getByText("После")).toBeDefined();
    expect(screen.getByRole("button", { name: "Смотреть" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeDefined();
    expect(theCountdown()).toContain("3");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(theCountdown()).toContain("2");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(theCountdown()).toContain("1");

    // Zero IS the [Смотреть] path: the route lands on the next episode.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(theRoute()).toBe("/items/itm_1_s1e2");
    expect(screen.queryByTestId("auto-next-card")).toBeNull();
  });

  it("the [Смотреть] button navigates without waiting for the countdown", () => {
    vi.useFakeTimers();
    const client = seededClient({ defaults: { auto_next_countdown_seconds: 60 } });
    renderCard(true, client);

    fireEvent.click(screen.getByRole("button", { name: "Смотреть" }));
    expect(theRoute()).toBe("/items/itm_1_s1e2");
  });

  it("unmounts on replay (the ended edge closing) and never navigates from a closed card", () => {
    vi.useFakeTimers();
    const client = seededClient({ defaults: { auto_next_countdown_seconds: 2 } });
    const view = renderCard(true, client);
    expect(screen.getByTestId("auto-next-card")).toBeDefined();

    // Replay / seek: the Player closes the edge, the card unmounts with its
    // timer — advancing past the deadline navigates nothing.
    view.rerender(harness(false, client));
    expect(screen.queryByTestId("auto-next-card")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(theRoute()).toBe(`/items/${HARNESS_ID}`);

    // A second end re-opens the card fresh, the full countdown re-armed.
    view.rerender(harness(true, client));
    expect(screen.getByTestId("auto-next-card")).toBeDefined();
    expect(theCountdown()).toContain("2");
  });
});

describe("cancel_suppresses_card_for_session", () => {
  it("writes the session key, stops the countdown and hides the card at once", () => {
    vi.useFakeTimers();
    const client = seededClient({ defaults: { auto_next_countdown_seconds: 5 } });
    renderCard(true, client);

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByTestId("auto-next-card")).toBeNull();
    expect(sessionStorage.getItem(AUTO_NEXT_CANCELLED_KEY)).not.toBeNull();

    // The cancelled countdown must never land: no navigation, ever.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(theRoute()).toBe(`/items/${HARNESS_ID}`);
  });

  it("a later card in the same browsing session stays suppressed", () => {
    vi.useFakeTimers();
    // [Отмена] from an earlier episode's card — the key's presence is the
    // suppression; this session's next ended edge renders no card at all.
    sessionStorage.setItem(AUTO_NEXT_CANCELLED_KEY, "1");
    const client = seededClient({ defaults: { auto_next_countdown_seconds: 5 } });

    renderCard(true, client);
    expect(screen.queryByTestId("auto-next-card")).toBeNull();
    expect(screen.queryByRole("button", { name: "Смотреть" })).toBeNull();
  });
});

describe("unavailable_shape_means_no_autoplay", () => {
  it("renders buttons only while the defaults request is unanswered — and never autoplays", () => {
    vi.useFakeTimers();
    vi.spyOn(apiModule, "fetchWatchDefaults").mockImplementation(
      () => new Promise<WatchDefaultsDTO>(() => {}), // pending forever
    );
    const client = seededClient(); // no ["watch-defaults"] entry

    renderCard(true, client);
    expect(screen.getByTestId("auto-next-card")).toBeDefined();
    expect(screen.queryByTestId("auto-next-countdown")).toBeNull();
    expect(screen.getByRole("button", { name: "Смотреть" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(theRoute()).toBe(`/items/${HARNESS_ID}`);
  });

  it("a served non-usable value is refused, never autoplayed", () => {
    vi.useFakeTimers();
    // The server floors at 1 (task 1.2); a shape that arrives unusable all
    // the same is not a countdown source — the SPA guesses nothing.
    const client = seededClient({ defaults: { auto_next_countdown_seconds: 0 } });
    renderCard(true, client);

    expect(screen.getByTestId("auto-next-card")).toBeDefined();
    expect(screen.queryByTestId("auto-next-countdown")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(theRoute()).toBe(`/items/${HARNESS_ID}`);
  });
});

describe("films_never_render_the_card", () => {
  it("a film — no parseable episode facts — renders no card, even with episodes resolving", () => {
    vi.useFakeTimers();
    const client = seededClient({
      current: FILM,
      episodes: [CURRENT, NEXT],
      defaults: { auto_next_countdown_seconds: 5 },
    });
    renderCard(true, client);

    expect(screen.queryByTestId("auto-next-card")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(theRoute()).toBe(`/items/${HARNESS_ID}`);
  });

  it("the series' last episode renders no card — nothing is strictly after it", () => {
    vi.useFakeTimers();
    const client = seededClient({
      episodes: [CURRENT],
      defaults: { auto_next_countdown_seconds: 5 },
    });
    renderCard(true, client);

    expect(screen.queryByTestId("auto-next-card")).toBeNull();
  });
});
