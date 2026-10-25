// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import Hls from "hls.js/light";

import type { PlaybackDescriptor } from "@/lib/api";
import { putProgress } from "@/lib/api";
import { skipSections } from "@/lib/skipSections";
import SkipChip from "@/components/playback/SkipChip";
import AutoNext from "@/components/playback/AutoNext";

// Player — the packaged-playback surface for ONE item (spec "Playback
// descriptor and verb split" consumer side). Two lanes, zero client logic:
//
//   - mode "hls": the stream playlist via hls.js (the LIGHT build — the
//     artifacts are already fMP4, so the full build's alt-mux machinery is
//     dead weight, D-12); on browsers with native HLS the plain src path
//     below takes over automatically (Hls.isSupported() gate). The playlist
//     is attached REGARDLESS of packaging state: a partial build (no
//     ENDLIST) is attached and live-polled by hls.js natively — that is the
//     head-first contract, not a special case.
//   - mode "direct": the native <video> at the minted play_url (the direct
//     floor — original bytes, range-served; the descriptor's cookie plus the
//     URL's query token authenticate every fetch).
//
// Sections: the descriptor's chapter-kind list, each a click-to-seek onto
// video.currentTime — a STANDARD media seek, so a TV remote's transport keys
// behave identically. Skip chip (watch-flow-polish 3.1): the descriptor's
// classified intro/credits ranges (lib/skipSections, D2 — SPA-side on served
// data) surface a soft chip over the video's bottom-right while the playhead
// is inside one; activation is the same standard seek, a beat past the
// range's end. Auto-next (watch-flow-polish 3.3): the video's ended edge
// opens the «Следующая серия» card over the overlay (AutoNext — episodes only,
// session-cancellable, served countdown); the card's reads run for the whole
// playback so they are warm before any episode can end.
// Progress: best-effort PUT /progress/{item_id} reporting
// (throttled to ≥5 s of drift, plus pause/ended/unmount) — a progress
// failure never interrupts playback.
//
// Retry: a failed packaging run (state "failed") renders the retry affordance
// wired to the page's onRetry (POST /play {retry:true}) — the ONLY playback
// mutation (D-7).

// PROGRESS_DRIFT_SECONDS — the reporting throttle: report when the playhead
// has moved ≥5 s since the last report (plus the pause/ended/unmount edges).
const PROGRESS_DRIFT_SECONDS = 5;

export interface PlayerProps {
  itemId: string;
  descriptor: PlaybackDescriptor;
  /** Wired by the page to POST /play {retry:true}; the affordance renders only when set. */
  onRetry?: () => void;
  /** True while the retry POST is in flight (disables the affordance). */
  retrying?: boolean;
  /** Object URL of the converted WebVTT subtitle track (serial-watch-flow 5.1);
   *  null/absent = subtitles off. Remounted per URL so the browser reloads it. */
  subtitleTrackUrl?: string | null;
  /** Selected voiceover as the hls audioTrack index (serial-watch-flow 5.3):
   *  0 = embedded audio, k+1 = the descriptor's k-th voiceover (the pack
   *  lane's pinned build order). hls lane only — switching never restarts
   *  the video; null/absent leaves the loader's default rendition. */
  voiceoverTrack?: number | null;
  /** Poster frame (fix-episode-playback R4): the item's frame-grabber thumb
   *  blob object URL, handed over by the page. Rendered as the <video>'s
   *  poster attribute; null/absent = no attribute at all — no poster and no
   *  broken-image state. */
  poster?: string | null;
}

export default function Player(props: PlayerProps): ReactElement {
  const { itemId, descriptor } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<InstanceType<typeof Hls> | null>(null);
  const reportedRef = useRef(0);
  const [fatal, setFatal] = useState(false);
  // Playhead read for the overlay chip: `timeupdate` is the standard
  // position signal — the chip itself decides in-range rendering, no
  // throttling here (the progress reporting throttle below is separate).
  const [playhead, setPlayhead] = useState(0);
  // The ended edge (watch-flow-polish 3.3): the auto-next card's open
  // window, tracked here so the card never outlives it (see the effect
  // below).
  const [ended, setEnded] = useState(false);

  const isHls = descriptor.mode === "hls";

  // The classified intro/credits ranges (watch-flow-polish 3.1, D2): pure
  // SPA-side classification of the served sections — re-derived only when
  // the descriptor's section list changes.
  const skipRanges = useMemo(
    () => skipSections(descriptor.sections),
    [descriptor.sections],
  );

  // Attach — keyed on the play URL (a repack or re-mint swaps it). The hls
  // loader is destroyed on change/unmount; the direct lane resets the src.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    reportedRef.current = 0;
    setFatal(false);
    if (isHls && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(descriptor.play_url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setFatal(true);
        }
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
    // Direct floor (and HLS on native-HLS browsers): standard src playback.
    video.src = descriptor.play_url;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [descriptor.play_url, isHls]);

  // Voiceover rendition (serial-watch-flow 5.3): the page's selection maps
  // document order → hls.audioTrack (0 = embedded, k+1 = the descriptor's
  // k-th voiceover — the pack lane's pinned rendition order). Setting
  // audioTrack is hls.js's native switch: segments swap, the video element
  // and its playhead are untouched — no restart. Re-applied on every
  // (re)attach (play_url change) AND on selection change; the
  // AUDIO_TRACKS_UPDATED listener covers a selection made before the
  // manifest's audio groups are known. Direct builds have no hls loader —
  // the page disables the control there.
  const voiceoverTrack = props.voiceoverTrack ?? null;
  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || voiceoverTrack === null) {
      return;
    }
    const apply = (): void => {
      if (
        Array.isArray(hls.audioTracks) &&
        voiceoverTrack < hls.audioTracks.length &&
        hls.audioTrack !== voiceoverTrack
      ) {
        hls.audioTrack = voiceoverTrack;
      }
    };
    apply();
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, apply);
    return () => {
      hls.off(Hls.Events.AUDIO_TRACKS_UPDATED, apply);
    };
  }, [voiceoverTrack, descriptor.play_url, isHls]);

  // Progress reporting — best-effort; the playhead edges (pause/ended) and
  // unmount flush the tail position.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const report = (position: number): void => {
      const seconds = Math.floor(position);
      if (seconds === reportedRef.current) {
        return;
      }
      reportedRef.current = seconds;
      putProgress(itemId, seconds).catch(() => {
        // progress is never load-bearing — swallow and keep playing
      });
    };
    const onTimeUpdate = (): void => {
      if (Math.abs(video.currentTime - reportedRef.current) >= PROGRESS_DRIFT_SECONDS) {
        report(video.currentTime);
      }
    };
    const onEdge = (): void => report(video.currentTime);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", onEdge);
    video.addEventListener("ended", onEdge);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onEdge);
      video.removeEventListener("ended", onEdge);
      if (video.currentTime > 0) {
        report(video.currentTime); // flush the tail on unmount
      }
    };
  }, [itemId]);

  // Playhead tracking — the skip chip's in-range input (watch-flow-polish
  // 3.1): every timeupdate re-reads currentTime; the chip renders only while
  // the position sits inside a classified range.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const onTime = (): void => setPlayhead(video.currentTime);
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, []);

  // Ended edge tracking (watch-flow-polish 3.3): the video's ended event
  // opens the auto-next window; a replay (`play`) or a seek (`seeking` —
  // any seek clears the media element's ended state) closes it, so the card
  // never lingers over live playback. Re-armed per play URL: a re-attach
  // (repack / re-mint) starts fresh.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setEnded(false);
    const onEnded = (): void => setEnded(true);
    const onLive = (): void => setEnded(false);
    video.addEventListener("ended", onEnded);
    video.addEventListener("play", onLive);
    video.addEventListener("seeking", onLive);
    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("play", onLive);
      video.removeEventListener("seeking", onLive);
    };
  }, [descriptor.play_url, isHls]);

  // seekTo — a standard media seek onto video.currentTime (section jumps and
  // TV-remote transport keys are the same mechanism, structurally segment
  // fetches on the hls lane).
  const seekTo = (start: number): void => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = start;
    }
  };

  return (
    <section aria-label="Player" className="flex flex-col gap-3">
      {fatal ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Playback failed — the stream could not be played to the end.
        </p>
      ) : null}
      <div className="relative">
        <video
          ref={videoRef}
          controls
          playsInline
          poster={props.poster ?? undefined}
          className="w-full rounded-lg border bg-black"
          aria-label={descriptor.mode === "hls" ? "Streamed playback" : "Original playback"}
        >
          {/* Subtitles (serial-watch-flow 5.1): the client-converted WebVTT as
              a standard timed track — keyed per URL so a selection change
              remounts the track and the browser loads the new bytes. */}
          {props.subtitleTrackUrl ? (
            <track
              key={props.subtitleTrackUrl}
              kind="subtitles"
              src={props.subtitleTrackUrl}
              label="Subtitles"
              default
            />
          ) : null}
        </video>

        {/* Skip chip (watch-flow-polish 3.1): over the video's bottom-right,
            rendered only inside a classified range; activation rides the
            standard seekTo above. */}
        {skipRanges.length > 0 ? (
          <SkipChip sections={skipRanges} currentTime={playhead} onSkip={seekTo} />
        ) : null}

        {/* Auto-next card (watch-flow-polish 3.3): mounted for the WHOLE
            playback so its reads warm long before an episode can end; the
            card itself renders only on the ended edge tracked above — the
            component gates internally (films and session-cancelled sessions
            never see it). */}
        <AutoNext itemId={itemId} ended={ended} />
      </div>

      {descriptor.state === "partial" ? (
        <p className="text-sm text-muted-foreground">
          Packaging in progress — playback starts from the packaged head while
          the rest of the file arrives.
        </p>
      ) : null}

      {descriptor.state === "failed" && props.onRetry ? (
        <div>
          <button
            type="button"
            onClick={props.onRetry}
            disabled={props.retrying}
            className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent disabled:opacity-50"
          >
            {props.retrying ? "Retrying…" : "Retry packaging"}
          </button>
        </div>
      ) : null}

      {descriptor.sections.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Sections</h3>
          <ul className="flex flex-wrap gap-2">
            {descriptor.sections.map((section, i) => (
              <li key={`${section.start}-${i}`}>
                <button
                  type="button"
                  onClick={() => seekTo(section.start)}
                  className="rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-accent"
                >
                  {section.title ?? `Section ${i + 1}`}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {formatTime(section.start)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// formatTime renders a section start as m:ss / h:mm:ss (the seek target).
function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
