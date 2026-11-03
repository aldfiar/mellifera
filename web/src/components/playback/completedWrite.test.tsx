// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

import * as apiModule from "@/lib/api";
import type { ItemDTO, PlaybackDescriptor } from "@/lib/api";
import Player from "@/components/playback/Player";

// watched-states 2.4 (design D3) — the completed write at its TWO edges.
// The SPA sets `completed: true` on the progress write at exactly two
// places: the video `ended` edge (the AutoNext edge — finishing the file
// finishes the episode) and the SkipChip credits activation (skipping the
// credits tail jumps to the end and finishes the episode). The flagged
// write BYPASSES the player's floor-second `reportedRef` dedupe — the flag
// forces the write, because ending at an already-reported second is
// exactly the edge the flag exists for and the dedupe must not swallow it.
// NO other write path carries the flag, and the flagless dedupe behaves
// byte-for-byte as before. putProgress is mocked at the api seam; the hls
// loader is mocked at the module seam (every vector here rides the direct
// lane — jsdom has no MSE and the direct floor needs no loader).

vi.mock("hls.js", () => ({ default: class FakeHls {} }));

// DIRECT — the plain <video src> floor: no hls loader, the progress
// reporting effect and the skip chip behave identically on both lanes.
const DIRECT: PlaybackDescriptor = {
  mode: "direct",
  state: "none",
  play_url: "/media/itm_1_9/original?token=tok",
  sections: [],
};

// CREDITED — the same floor with classified intro/credits chapters (the
// served section shapes lib/skipSections classifies; titles from the exact
// lowercase lexicon).
const CREDITED: PlaybackDescriptor = {
  ...DIRECT,
  sections: [
    { kind: "chapter", start: 0, end: 90, title: "Intro" },
    { kind: "chapter", start: 4000, end: 4100, title: "Credits" },
  ],
};

// FILM_ITEM — the benign AutoNext read answer (watch-flow-polish 3.3): a
// film-shaped item carries no episode facts, so the auto-next card never
// renders in these vectors, whatever the ended edge does.
const FILM_ITEM: ItemDTO = {
  id: "itm_1_9",
  module_id: "tv",
  library_id: 1,
  file_id: "file-9",
  relative_path: "Film.mkv",
  media_type: "tv",
  document: {},
  schema_version: 1,
  status: "ready",
};

function wrap(ui: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["item", "itm_1_9"], { item: FILM_ITEM });
  client.setQueryData(["watch-defaults"], {
    auto_next_countdown_seconds: 10,
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/items/itm_1_9"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPlayer(descriptor: PlaybackDescriptor): HTMLVideoElement {
  render(wrap(<Player itemId="itm_1_9" descriptor={descriptor} />));
  return screen.getByRole("region", { name: "Player" }).querySelector("video") as HTMLVideoElement;
}

beforeEach(() => {
  vi.spyOn(apiModule, "putProgress").mockResolvedValue({
    item_id: "itm_1_9",
    position_seconds: 0,
    updated_at: "",
  });
  // AutoNext's overlay reads ride wrap()'s cache seeds; these spies are the
  // backstop so a refetch can never reach the network in a vector here.
  vi.spyOn(apiModule, "getItem").mockResolvedValue({ item: FILM_ITEM });
  vi.spyOn(apiModule, "getSeries").mockResolvedValue({ items: [] });
  vi.spyOn(apiModule, "getSeriesEpisodes").mockResolvedValue({ items: [] });
  vi.spyOn(apiModule, "fetchWatchDefaults").mockResolvedValue({
    auto_next_countdown_seconds: 10,
  });
  vi.spyOn(apiModule, "sendPlaybackEvent").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the ended edge (watched-states D3)", () => {
  it("fires completed: true at an ALREADY-REPORTED floor-second — the flag forces the write past the dedupe", () => {
    const video = renderPlayer(DIRECT);

    // First write at second 42: the pause edge reports it, reportedRef
    // latches 42.
    video.currentTime = 42;
    fireEvent.pause(video);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(1);
    expect(apiModule.putProgress).toHaveBeenLastCalledWith("itm_1_9", 42);

    // The video ends INSIDE the same floor-second. A flagless write would
    // be swallowed (42 === reportedRef) — the completed write must fire.
    video.currentTime = 42.4;
    fireEvent.ended(video);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(2);
    expect(apiModule.putProgress).toHaveBeenLastCalledWith("itm_1_9", 42, {
      completed: true,
    });

    // The bypass is the FLAG's, not a broken dedupe: a flagless pause at
    // the same floor-second is still swallowed as today.
    video.currentTime = 42.9;
    fireEvent.pause(video);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(2);
  });
});

describe("the SkipChip credits activation (watched-states D3)", () => {
  it("fires completed: true with the jump position; an intro skip is a pure seek", () => {
    const video = renderPlayer(CREDITED);

    // Inside the intro range: timeupdate feeds BOTH the playhead tracking
    // and the throttle, so the read itself reports the flagless position.
    video.currentTime = 45;
    fireEvent.timeUpdate(video);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(1);
    expect(apiModule.putProgress).toHaveBeenLastCalledWith("itm_1_9", 45);

    // The chip seeks past the intro — and writes NOTHING: the intro skip is
    // not a completion edge.
    fireEvent.click(screen.getByTestId("skip-chip"));
    expect(video.currentTime).toBe(90.5);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(1);

    // Inside the credits range the chip jumps past the credits tail — that
    // IS finishing the episode: the write carries the flag at the jump
    // position (after the flagless 4050 read the throttle just reported).
    video.currentTime = 4050;
    fireEvent.timeUpdate(video);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(2);
    expect(apiModule.putProgress).toHaveBeenLastCalledWith("itm_1_9", 4050);

    fireEvent.click(screen.getByTestId("skip-chip"));
    expect(video.currentTime).toBe(4100.5);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(3);
    expect(apiModule.putProgress).toHaveBeenLastCalledWith("itm_1_9", 4100, {
      completed: true,
    });
  });
});

describe("the flagless write paths stay flagless (watched-states D3)", () => {
  it("a normal mid-playhead timeupdate write carries NO completed flag", () => {
    const video = renderPlayer(DIRECT);

    video.currentTime = 30;
    fireEvent.timeUpdate(video); // drift ≥5 from reportedRef 0 — reports
    video.currentTime = 40;
    fireEvent.timeUpdate(video);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(2);
    expect(apiModule.putProgress).toHaveBeenLastCalledWith("itm_1_9", 40);
    for (const call of vi.mocked(apiModule.putProgress).mock.calls) {
      expect(call[2]).toBeUndefined();
    }
  });

  it("the flagless floor-second dedupe still swallows same-second writes as today", () => {
    const video = renderPlayer(DIRECT);

    video.currentTime = 42;
    fireEvent.pause(video);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(1);

    video.currentTime = 42.9;
    fireEvent.pause(video);
    expect(apiModule.putProgress).toHaveBeenCalledTimes(1);
  });
});
