// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

import * as apiModule from "@/lib/api";
import type { ItemDTO, PlaybackDescriptor } from "@/lib/api";
import Player from "@/components/playback/Player";

// Box 3.4 — the player's Vitest floor, one describe per acceptance axis:
// packaged attach (hls.js loader over the minted playlist URL), section
// seek (a standard media seek onto video.currentTime), partial-vs-complete
// attach (a playlist without ENDLIST is attached exactly like a complete
// one — hls.js live-polls natively), the direct native path (a plain
// <video src> at the minted URL, no hls loader), and the retry affordance
// (state "failed" → the wired POST /play retry callback). hls.js is mocked
// at the module seam (jsdom has no MSE); putProgress at the api seam.

// The fake hls loader: records instances so each attach assertion can read
// exactly what the component handed it (source URL + attached element). The
// audio-track surface (serial-watch-flow 5.3) mirrors the real loader's:
// audioTracks is the manifest's rendition list, audioTrack the selected index.
const hls = vi.hoisted(() => {
  const instances: FakeHls[] = [];
  class FakeHls {
    static isSupported = vi.fn(() => true);
    static Events = { ERROR: "error", AUDIO_TRACKS_UPDATED: "hlsAudioTracksUpdated" };
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    on = vi.fn();
    off = vi.fn();
    audioTracks: string[] = ["embedded", "dub", "rus"];
    audioTrack = 0;
    constructor() {
      instances.push(this);
    }
  }
  return { FakeHls, instances };
});

vi.mock("hls.js/light", () => ({ default: hls.FakeHls }));

const HLS_DESCRIPTOR: PlaybackDescriptor = {
  mode: "hls",
  state: "complete",
  play_url: "/media/itm_1_9/abc123/index.m3u8?token=tok",
  sections: [],
};

const DIRECT_DESCRIPTOR: PlaybackDescriptor = {
  mode: "direct",
  state: "none",
  play_url: "/media/itm_1_9/original?token=tok",
  sections: [],
};

function hlsDescriptor(overrides: Partial<PlaybackDescriptor>): PlaybackDescriptor {
  return { ...HLS_DESCRIPTOR, ...overrides };
}

// FILM_ITEM — the benign AutoNext read answer (watch-flow-polish 3.3): a
// film-shaped item carries no episode facts, so the auto-next card never
// renders in these player-scoped vectors, whatever the ended edge does.
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

// wrap — the harness every render in this file rides: AutoNext (mounted
// inside the Player overlay since watch-flow-polish 3.3) needs a
// QueryClient and a Router context. The client is pre-seeded with the
// benign film-shape answers at staleTime Infinity, so the overlay's reads
// resolve synchronously from the cache — no network, no async updates.
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

function renderPlayer(
  descriptor: PlaybackDescriptor,
  props?: {
    onRetry?: () => void;
    retrying?: boolean;
    subtitleTrackUrl?: string | null;
    voiceoverTrack?: number | null;
    poster?: string | null;
  },
): void {
  render(wrap(<Player itemId="itm_1_9" descriptor={descriptor} {...props} />));
}

function theVideo(): HTMLVideoElement {
  return screen.getByRole("region", { name: "Player" }).querySelector("video") as HTMLVideoElement;
}

beforeEach(() => {
  hls.instances.length = 0;
  hls.FakeHls.isSupported.mockReturnValue(true);
  vi.spyOn(apiModule, "putProgress").mockResolvedValue({
    item_id: "itm_1_9",
    position_seconds: 0,
    updated_at: "",
  });
  // The failure beacon (tv-playback-unblock 4.3): spied like putProgress so
  // no vector reaches the network; the rejected-beacon vector overrides it.
  vi.spyOn(apiModule, "sendPlaybackEvent").mockResolvedValue(undefined);
  // AutoNext's overlay reads (watch-flow-polish 3.3): wrap() normally
  // serves them from its seeds; these spies are the backstop so a refetch
  // can never reach the network in a player vector.
  vi.spyOn(apiModule, "getItem").mockResolvedValue({ item: FILM_ITEM });
  vi.spyOn(apiModule, "getSeries").mockResolvedValue({ items: [] });
  vi.spyOn(apiModule, "getSeriesEpisodes").mockResolvedValue({ items: [] });
  vi.spyOn(apiModule, "fetchWatchDefaults").mockResolvedValue({
    auto_next_countdown_seconds: 10,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Player — packaged attach (hls.js over the stream playlist)", () => {
  it("attaches the minted playlist URL to a <video> through the hls loader", () => {
    renderPlayer(HLS_DESCRIPTOR);

    expect(hls.instances).toHaveLength(1);
    expect(hls.instances[0].loadSource).toHaveBeenCalledWith(HLS_DESCRIPTOR.play_url);
    expect(hls.instances[0].attachMedia).toHaveBeenCalledWith(theVideo());
    // The <video> itself carries NO src — the loader feeds it.
    expect(theVideo().getAttribute("src")).toBeNull();
  });

  it("destroys the loader when the play URL changes (repack / re-mint)", () => {
    const { rerender } = render(wrap(<Player itemId="itm_1_9" descriptor={HLS_DESCRIPTOR} />));
    rerender(wrap(<Player itemId="itm_1_9" descriptor={hlsDescriptor({ play_url: "/media/itm_1_9/def456/index.m3u8?token=t2" })} />));

    expect(hls.instances).toHaveLength(2);
    expect(hls.instances[0].destroy).toHaveBeenCalled();
    expect(hls.instances[1].loadSource).toHaveBeenCalledWith("/media/itm_1_9/def456/index.m3u8?token=t2");
  });
});

describe("Player — partial vs complete attach", () => {
  it("attaches a PARTIAL build exactly like a complete one (native live-poll)", () => {
    renderPlayer(hlsDescriptor({ state: "partial" }));

    // Head-first: the growing playlist is attached, never gated on ENDLIST.
    expect(hls.instances).toHaveLength(1);
    expect(hls.instances[0].attachMedia).toHaveBeenCalledWith(theVideo());
    // The in-progress note is the only packaging-state surface.
    expect(screen.getByText(/Packaging in progress/)).toBeDefined();
  });

  it("renders no in-progress note for a complete build", () => {
    renderPlayer(HLS_DESCRIPTOR);
    expect(screen.queryByText(/Packaging in progress/)).toBeNull();
  });
});

describe("Player — direct native path", () => {
  it("plays the minted URL through the native <video> with NO hls loader", () => {
    renderPlayer(DIRECT_DESCRIPTOR);

    // No loader instance at all — the direct floor is plain src playback.
    expect(hls.instances).toHaveLength(0);
    expect(theVideo().getAttribute("src")).toBe(DIRECT_DESCRIPTOR.play_url);
  });

  it("falls back to the native src when MSE is unavailable (native-HLS browsers)", () => {
    hls.FakeHls.isSupported.mockReturnValue(false);
    renderPlayer(HLS_DESCRIPTOR);

    expect(hls.instances).toHaveLength(0);
    expect(theVideo().getAttribute("src")).toBe(HLS_DESCRIPTOR.play_url);
  });
});

describe("Player — sections (click-to-seek)", () => {
  const SEEDED: PlaybackDescriptor = {
    ...HLS_DESCRIPTOR,
    sections: [
      { kind: "chapter", start: 90, end: 300, title: "Cold open" },
      { kind: "chapter", start: 3661 },
    ],
  };

  it("seeks the video to the section start on click (standard media seek)", () => {
    renderPlayer(SEEDED);
    const video = theVideo();

    fireEvent.click(screen.getByRole("button", { name: /Cold open/ }));
    expect(video.currentTime).toBe(90);

    fireEvent.click(screen.getByRole("button", { name: /Section 2/ }));
    expect(video.currentTime).toBe(3661);
  });

  it("renders untitled sections with a positional name and the seek target time", () => {
    renderPlayer(SEEDED);
    expect(screen.getByRole("button", { name: /Section 2/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /1:01:01/ })).toBeDefined();
  });

  it("reports no sections surface when the descriptor carries none", () => {
    renderPlayer(HLS_DESCRIPTOR);
    expect(screen.queryByText("Sections")).toBeNull();
  });
});

describe("Player — progress reporting (PUT /progress)", () => {
  it("reports the position on pause and on ended", () => {
    renderPlayer(HLS_DESCRIPTOR);
    const video = theVideo();

    video.currentTime = 42;
    fireEvent.pause(video);
    expect(apiModule.putProgress).toHaveBeenCalledWith("itm_1_9", 42);

    video.currentTime = 90;
    fireEvent.ended(video);
    expect(apiModule.putProgress).toHaveBeenLastCalledWith("itm_1_9", 90);
  });

  it("throttles timeupdate reporting to ≥5 s of drift", () => {
    renderPlayer(HLS_DESCRIPTOR);
    const video = theVideo();

    video.currentTime = 2;
    fireEvent.timeUpdate(video);
    video.currentTime = 4;
    fireEvent.timeUpdate(video);
    expect(apiModule.putProgress).not.toHaveBeenCalled();

    video.currentTime = 10;
    fireEvent.timeUpdate(video);
    expect(apiModule.putProgress).toHaveBeenCalledWith("itm_1_9", 10);
  });

  it("never throws when the progress PUT rejects (best-effort channel)", () => {
    vi.spyOn(apiModule, "putProgress").mockRejectedValue(new Error("offline"));
    renderPlayer(HLS_DESCRIPTOR);
    const video = theVideo();

    expect(() => {
      video.currentTime = 30;
      fireEvent.pause(video);
    }).not.toThrow();
  });
});

describe("Player — retry affordance (pack_failed → POST /play retry)", () => {  it("renders the affordance only for a failed run with a wired callback", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      wrap(<Player itemId="itm_1_9" descriptor={hlsDescriptor({ state: "failed" })} onRetry={onRetry} />),
    );
    expect(screen.getByRole("button", { name: /Retry packaging/ })).toBeDefined();

    // Not failed → no affordance, even with the callback wired.
    rerender(wrap(<Player itemId="itm_1_9" descriptor={HLS_DESCRIPTOR} onRetry={onRetry} />));
    expect(screen.queryByRole("button", { name: /Retry packaging/ })).toBeNull();

    // Failed but no callback wired → no affordance (the page owns the POST).
    rerender(wrap(<Player itemId="itm_1_9" descriptor={hlsDescriptor({ state: "failed" })} />));
    expect(screen.queryByRole("button", { name: /Retry packaging/ })).toBeNull();
  });

  it("invokes the wired retry callback on click and disables while retrying", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      wrap(<Player itemId="itm_1_9" descriptor={hlsDescriptor({ state: "failed" })} onRetry={onRetry} />),
    );
    fireEvent.click(screen.getByRole("button", { name: /Retry packaging/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      wrap(<Player itemId="itm_1_9" descriptor={hlsDescriptor({ state: "failed" })} onRetry={onRetry} retrying />),
    );
    const button = screen.getByRole("button", { name: /Retrying/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

// serial-watch-flow 5.1/5.3 — the watch-surface additions: the client-
// converted subtitle track rides the <video> as a standard <track> (remounted
// per URL so the browser loads the new bytes), and the voiceover selection is
// the hls audioTrack switch — segments swap, the loader and the video element
// are untouched (no restart).

describe("Player — subtitle track (serial-watch-flow 5.1)", () => {
  it("renders the converted WebVTT as a default subtitles <track> over the video", () => {
    renderPlayer(HLS_DESCRIPTOR, { subtitleTrackUrl: "blob:vtt-1" });

    const track = theVideo().querySelector("track");
    expect(track).not.toBeNull();
    expect(track!.getAttribute("kind")).toBe("subtitles");
    expect(track!.getAttribute("src")).toBe("blob:vtt-1");
    expect(track!.hasAttribute("default")).toBe(true);
  });

  it("swaps the track per URL change and drops it when subtitles turn off", () => {
    const { rerender } = render(
      wrap(<Player itemId="itm_1_9" descriptor={HLS_DESCRIPTOR} subtitleTrackUrl="blob:a" />),
    );
    rerender(
      wrap(<Player itemId="itm_1_9" descriptor={HLS_DESCRIPTOR} subtitleTrackUrl="blob:b" />),
    );
    expect(theVideo().querySelector("track")!.getAttribute("src")).toBe("blob:b");

    rerender(
      wrap(<Player itemId="itm_1_9" descriptor={HLS_DESCRIPTOR} subtitleTrackUrl={null} />),
    );
    expect(theVideo().querySelector("track")).toBeNull();
  });

  it("renders no <track> when no subtitle URL is set", () => {
    renderPlayer(HLS_DESCRIPTOR);
    expect(theVideo().querySelector("track")).toBeNull();
  });
});

describe("Player — voiceover selection (serial-watch-flow 5.3)", () => {
  it("applies the selected voiceover as the hls audioTrack (0 embedded, k+1 voiceovers[k])", () => {
    renderPlayer(HLS_DESCRIPTOR, { voiceoverTrack: 2 });

    expect(hls.instances).toHaveLength(1);
    expect(hls.instances[0].audioTrack).toBe(2);
  });

  it("switches the audioTrack in place when the selection changes — no re-attach", () => {
    const { rerender } = render(
      wrap(<Player itemId="itm_1_9" descriptor={HLS_DESCRIPTOR} voiceoverTrack={0} />),
    );
    rerender(
      wrap(<Player itemId="itm_1_9" descriptor={HLS_DESCRIPTOR} voiceoverTrack={1} />),
    );

    // Exactly one loader for the same play URL: the switch is the native
    // audioTrack operation, never a re-attach (a restart).
    expect(hls.instances).toHaveLength(1);
    expect(hls.instances[0].audioTrack).toBe(1);
  });

  it("registers the audioTracks-updated listener so an early selection survives the manifest parse", () => {
    renderPlayer(HLS_DESCRIPTOR, { voiceoverTrack: 1 });

    expect(hls.instances[0].on).toHaveBeenCalledWith(
      "hlsAudioTracksUpdated",
      expect.any(Function),
    );
  });

  it("leaves the direct lane untouched — no hls loader, no audioTrack", () => {
    renderPlayer(DIRECT_DESCRIPTOR, { voiceoverTrack: 1 });

    expect(hls.instances).toHaveLength(0);
  });
});

// fix-episode-playback 3.1 — the episode page's poster: the frame-grabber
// thumb blob rides the <video> itself as its poster attribute; a null or
// absent prop leaves NO attribute at all — no poster, no broken-image state.
describe("Player — poster (fix-episode-playback 3.1)", () => {
  it("sets the poster attribute from the prop", () => {
    renderPlayer(HLS_DESCRIPTOR, { poster: "blob:thumb-1" });

    expect(theVideo().getAttribute("poster")).toBe("blob:thumb-1");
  });

  it("renders no poster attribute when the prop is null or absent", () => {
    renderPlayer(HLS_DESCRIPTOR, { poster: null });
    expect(theVideo().hasAttribute("poster")).toBe(false);

    cleanup();
    renderPlayer(DIRECT_DESCRIPTOR);
    expect(theVideo().hasAttribute("poster")).toBe(false);
  });
});

// tv-playback-unblock 4.3 — failure surfacing (web-ui delta "Playback
// failure surfacing" + "Playback event beacon client"): the direct lane's
// media error event becomes a named class banner + one best-effort beacon
// (previously the lane failed silently), hls fatals carry type/details/HTTP
// status, banners clear on re-attach, and progress reporting never notices.
// Media errors ride numeric codes — happy-dom does not expose the
// MediaError constructor constants.

// fireHlsFatal — drives the ERROR listener the component registered on the
// mocked loader (the seam jsdom/happy-dom has no real hls.js behind).
function fireHlsFatal(data: Record<string, unknown>): void {
  const call = hls.instances[0].on.mock.calls.find(([event]) => event === "error");
  expect(call).toBeDefined();
  const handler = call![1] as (event: unknown, data: Record<string, unknown>) => void;
  act(() => {
    handler(null, data);
  });
}

// setMediaError — plants the media element's error object (happy-dom leaves
// video.error null; the component reads it off the event's target).
function setMediaError(video: HTMLVideoElement, code: number, message: string): void {
  Object.defineProperty(video, "error", {
    configurable: true,
    value: { code, message },
  });
}

describe("Player — failure surfacing (tv-playback-unblock 4.3)", () => {
  it("renders the undecodable-container banner and beacons once on a direct-lane video error", () => {
    renderPlayer(DIRECT_DESCRIPTOR);
    const video = theVideo();
    setMediaError(video, 4, "DEMUXER_ERROR_COULD_NOT_OPEN");

    fireEvent.error(video);

    // Source-not-supported is its own class — the undecodable container.
    const banner = screen.getByRole("alert");
    expect(banner.getAttribute("data-media-error-class")).toBe("source-not-supported");
    expect(banner.textContent).toContain("не декодируется");
    expect(apiModule.sendPlaybackEvent).toHaveBeenCalledTimes(1);
    expect(apiModule.sendPlaybackEvent).toHaveBeenCalledWith(
      "itm_1_9",
      "direct",
      "video-error",
      "source-not-supported",
      "DEMUXER_ERROR_COULD_NOT_OPEN",
    );
  });

  it("renders a distinct class for the network media error", () => {
    renderPlayer(DIRECT_DESCRIPTOR);
    setMediaError(theVideo(), 2, "");

    fireEvent.error(theVideo());

    const banner = screen.getByRole("alert");
    expect(banner.getAttribute("data-media-error-class")).toBe("network");
    expect(banner.textContent).not.toContain("не декодируется");
    expect(apiModule.sendPlaybackEvent).toHaveBeenCalledWith(
      "itm_1_9",
      "direct",
      "video-error",
      "network",
      "",
    );
  });

  it("renders no banner without an error event", () => {
    renderPlayer(DIRECT_DESCRIPTOR);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(apiModule.sendPlaybackEvent).not.toHaveBeenCalled();
  });

  it("renders the hls fatal banner with type, details and HTTP status, and beacons once", () => {
    renderPlayer(HLS_DESCRIPTOR);

    fireHlsFatal({
      fatal: true,
      type: "networkError",
      details: "manifestLoadError",
      response: { code: 403 },
    });

    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("networkError/manifestLoadError");
    expect(banner.textContent).toContain("HTTP 403");
    expect(apiModule.sendPlaybackEvent).toHaveBeenCalledTimes(1);
    expect(apiModule.sendPlaybackEvent).toHaveBeenCalledWith(
      "itm_1_9",
      "hls",
      "fatal",
      "networkError/manifestLoadError",
      "403",
    );
  });

  it("omits the status from banner and beacon when the fatal carries no response", () => {
    renderPlayer(HLS_DESCRIPTOR);

    fireHlsFatal({ fatal: true, type: "mediaError", details: "bufferAppendError" });

    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("mediaError/bufferAppendError");
    expect(banner.textContent).not.toContain("HTTP");
    expect(apiModule.sendPlaybackEvent).toHaveBeenCalledWith(
      "itm_1_9",
      "hls",
      "fatal",
      "mediaError/bufferAppendError",
      "",
    );
  });

  it("sends no beacon and renders no banner for a NON-fatal hls error", () => {
    renderPlayer(HLS_DESCRIPTOR);

    fireHlsFatal({ fatal: false, type: "networkError", details: "bufferStalledError" });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(apiModule.sendPlaybackEvent).not.toHaveBeenCalled();
  });

  it("clears the banner on re-attach (play URL change)", () => {
    const { rerender } = render(wrap(<Player itemId="itm_1_9" descriptor={DIRECT_DESCRIPTOR} />));
    setMediaError(theVideo(), 4, "");
    fireEvent.error(theVideo());
    expect(screen.queryByRole("alert")).not.toBeNull();

    rerender(
      wrap(
        <Player
          itemId="itm_1_9"
          descriptor={{ ...DIRECT_DESCRIPTOR, play_url: "/media/itm_1_9/original?token=t2" }}
        />,
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("swallows a failing beacon send and keeps progress reporting working", () => {
    vi.spyOn(apiModule, "sendPlaybackEvent").mockRejectedValue(new Error("offline"));
    renderPlayer(DIRECT_DESCRIPTOR);
    const video = theVideo();
    setMediaError(video, 4, "");

    expect(() => fireEvent.error(video)).not.toThrow();

    // Progress reporting is untouched by the failure surface.
    video.currentTime = 42;
    fireEvent.pause(video);
    expect(apiModule.putProgress).toHaveBeenCalledWith("itm_1_9", 42);
  });
});
