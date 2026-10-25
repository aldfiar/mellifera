// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import type { ItemDTO, WatchDefaultsDTO } from "@/lib/api";
import { episodeFacts, nextEpisodeAfter } from "@/lib/nextup";
import {
  useItem,
  useSeries,
  useSeriesEpisodes,
  useWatchDefaults,
} from "@/lib/queries";

// AutoNext — the «Следующая серия» card (watch-flow-polish 3.3), the Player
// overlay's ended-edge sibling of SkipChip. The Player mounts it for the
// WHOLE playback (always rendered) so its reads warm long before an episode
// can end (the contract's handoff note); the card itself renders only on the
// `ended` edge of an EPISODE — an item with parseable episode facts
// (lib/nextup episodeFacts) whose series row resolves a later episode via
// nextEpisodeAfter (the pure pick — no second derivation). Films never
// render the card: no facts → no pick, decided on the served facts, never on
// a media-type literal.
//
// Reads, warm for the whole playback: the current item rides the page's
// ["item", id] entry; the series row rides ["series", library] matched BY
// PATH on the parsed series anchor (the same resolution ItemDetail's
// identity block uses — never a title match); the episode list rides
// ["series-episodes", seriesId]; the countdown shape rides
// ["watch-defaults"].
//
// Countdown (D5/Q5): the duration comes ONLY from the served
// GET /api/v1/watch-defaults shape (auto_next_countdown_seconds) via
// useWatchDefaults; reaching zero fires the [Смотреть] path. A shape that
// has not answered (or failed) at the card's open — or one that is not a
// usable positive integer — means NO countdown and NEVER autoplay: the SPA
// bakes no fallback value; the buttons stay the always-available manual
// path.
//
// Cancel (D4/Q6): [Отмена] stops the countdown and suppresses the card for
// the rest of the browsing session through the sessionStorage key
// mellifera.autoNextCancelled — writer and reader BOTH live in this module
// (design.md Interfaces); no other module touches the key. sessionStorage
// (never localStorage): the suppression survives reloads and dies with the
// tab; the durable per-user opt-out arrives with Layer 6.

// AUTO_NEXT_CANCELLED_KEY — the session-scoped suppression key. Set-once
// per session (this module never clears it); its PRESENCE suppresses the
// card. Exported as the tests' seam only.
export const AUTO_NEXT_CANCELLED_KEY = "mellifera.autoNextCancelled";

// cancelledForSession — the card's render gate: the key's presence (any
// value) suppresses.
function cancelledForSession(): boolean {
  return sessionStorage.getItem(AUTO_NEXT_CANCELLED_KEY) !== null;
}

// cancelForSession — the [Отмена] write.
function cancelForSession(): void {
  sessionStorage.setItem(AUTO_NEXT_CANCELLED_KEY, "1");
}

// servedCountdown — the SERVED countdown, or null when the shape is not a
// usable positive integer (unanswered, failed, malformed). null is NOT a
// default — it is the refusal to guess (Q5/D5): no countdown, no autoplay.
function servedCountdown(defaults: WatchDefaultsDTO | undefined): number | null {
  const seconds = defaults?.auto_next_countdown_seconds;
  return typeof seconds === "number" && Number.isInteger(seconds) && seconds >= 1
    ? seconds
    : null;
}

// servedEpisodeTitle — the next episode's served episode-block title
// (metadata.episode.title) when present; "" otherwise — the line is
// omitted, never fabricated (field-driven like every block).
function servedEpisodeTitle(item: ItemDTO): string {
  const title = item.metadata?.episode?.title;
  return typeof title === "string" && title !== "" ? title : "";
}

export interface AutoNextProps {
  itemId: string;
  /** The Player's ended edge — true from the video's `ended` event until a replay, a seek, or a re-attach closes it. */
  ended: boolean;
}

export default function AutoNext(props: AutoNextProps): ReactElement | null {
  const item = useItem(props.itemId).data?.item;
  const facts = item !== undefined ? episodeFacts(item) : null;
  const libraryId = item !== undefined ? item.library_id : Number.NaN;
  const seriesList = useSeries(facts === null ? Number.NaN : libraryId);
  const series = useMemo(() => {
    if (facts === null) {
      return null;
    }
    return (
      seriesList.data?.items.find(
        (candidate) => candidate.relative_path === facts.seriesPath,
      ) ?? null
    );
  }, [facts, seriesList.data]);
  const episodes = useSeriesEpisodes(series === null ? "" : series.id);
  const next = useMemo(() => {
    if (item === undefined || series === null) {
      return null;
    }
    return nextEpisodeAfter(item, episodes.data?.items ?? []);
  }, [item, series, episodes.data]);
  const defaults = useWatchDefaults();

  const navigate = useNavigate();
  const watch = useCallback(() => {
    if (next !== null) {
      navigate(`/items/${next.item.id}`);
    }
  }, [next, navigate]);

  if (!props.ended || next === null) {
    return null;
  }

  // The identity line: the SERVED series display name beside the SxxEyy
  // label (facts stay on the wire; only the naming is served — the same
  // floor as nextup.ts: an empty name renders as the label alone, never a
  // client-side file-name fallback).
  const nameLine = [series?.display_name ?? "", next.label]
    .filter((part) => part !== "")
    .join(" · ");

  return (
    <AutoNextCard
      nameLine={nameLine}
      episodeTitle={servedEpisodeTitle(next.item)}
      countdownSeconds={servedCountdown(defaults.data)}
      onWatch={watch}
    />
  );
}

// AutoNextCard — the card proper, mounted ONLY on an open edge (the ended
// edge with a resolved pick): the session-suppression check and the
// countdown snapshot both read at THIS mount, so a [Отмена] from an earlier
// card in the same browsing session suppresses this one before it renders,
// and a defaults answer that was not yet in at open never starts a countdown
// (D5 — a late answer never autoplays). The Player closes the edge on a
// replay or a seek, unmounting the card with its timer — it never lingers
// over live playback.
function AutoNextCard(props: {
  nameLine: string;
  episodeTitle: string;
  countdownSeconds: number | null;
  onWatch: () => void;
}): ReactElement | null {
  const { onWatch } = props;
  const [cancelled, setCancelled] = useState<boolean>(() =>
    cancelledForSession(),
  );
  // The countdown snapshot — taken once at the card's open. null = the
  // served shape was not usable THEN: no countdown, never autoplay.
  const [remaining, setRemaining] = useState<number | null>(
    () => props.countdownSeconds,
  );

  // The tick: one second at a time down to zero; zero fires the [Смотреть]
  // path. A cancelled card stops ticking (the gate below) — cancellation
  // must never let the countdown land.
  useEffect(() => {
    if (cancelled || remaining === null) {
      return;
    }
    if (remaining <= 0) {
      onWatch();
      return;
    }
    const timer = window.setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cancelled, remaining, onWatch]);

  if (cancelled) {
    return null;
  }

  return (
    <aside
      data-testid="auto-next-card"
      aria-label="Следующая серия"
      className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 rounded-lg border bg-card/95 p-4 shadow-lg"
    >
      <p className="text-sm font-semibold">Следующая серия</p>
      {props.nameLine !== "" ? (
        <p className="text-sm text-muted-foreground">{props.nameLine}</p>
      ) : null}
      {props.episodeTitle !== "" ? (
        <p className="text-sm">{props.episodeTitle}</p>
      ) : null}
      {remaining !== null ? (
        <p
          data-testid="auto-next-countdown"
          className="text-xs text-muted-foreground"
        >
          Автопереход через {String(remaining)} с
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onWatch}
          className="rounded-md bg-emerald-100/95 px-3 py-1.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-200/95"
        >
          Смотреть
        </button>
        <button
          type="button"
          onClick={() => {
            cancelForSession();
            setCancelled(true);
          }}
          className="rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-accent"
        >
          Отмена
        </button>
      </div>
    </aside>
  );
}
