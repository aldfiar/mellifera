// SPDX-License-Identifier: Apache-2.0
import type { ItemDTO } from "@/lib/api";

// The episode-facts derivation the watch page consumes (watch-flow-polish,
// moved verbatim from pages/home/Home.tsx — names and shapes unchanged):
// EpisodeFacts/episodeFacts plus the sibling pick nextEpisodeAfter. The
// home-only derivation (the started-series grouping, the per-series next-up
// pick, and the series grouping key — with their StartedSeries/NextUpEntry
// era) retired with Home's GET /home swap (browse-scale 5.3/5.4). Types from
// @/lib/api only: no React, no queries, no DOM.

// EpisodeFacts — the parsed episode identity the Next up derivation runs on
// (D-8): the (season, episode) pair out of the source namespaces plus the
// series anchor parsed.series_relative_path the serial-scanner stamps — the
// series row is matched on the PATH fact, never on a title (serial episodes
// carry no title fact).
export interface EpisodeFacts {
  libraryId: number;
  seriesPath: string;
  season: number;
  episode: number;
}

// numberField — an integer field out of a dynamic source namespace, or null.
function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

// stringField — a non-empty string field out of a dynamic namespace, or null
// (same contract as Collection's local copy).
function stringField(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// episodeFacts — the item's (library, series path, season, episode) facts, or
// null when the document carries no parsed.series_relative_path anchor or no
// parseable episode numbers (the caller omits it rather than guessing).
export function episodeFacts(item: ItemDTO): EpisodeFacts | null {
  const parsed = item.document.parsed;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const seriesPath = stringField(
    (parsed as Record<string, unknown>).series_relative_path,
  );
  if (seriesPath === null) {
    return null;
  }
  const sources = item.document.sources;
  if (!sources || typeof sources !== "object") {
    return null;
  }
  for (const namespace of Object.values(sources)) {
    if (!namespace || typeof namespace !== "object") {
      continue;
    }
    const season = numberField(namespace.season);
    const episode = numberField(namespace.episode);
    if (season !== null && episode !== null) {
      return { libraryId: item.library_id, seriesPath, season, episode };
    }
  }
  return null;
}

// tupleGt — (season, episode) ordering: a later season wins; within a season,
// the later episode.
function tupleGt(a: EpisodeFacts, b: EpisodeFacts): boolean {
  return a.season > b.season || (a.season === b.season && a.episode > b.episode);
}

// NextUpEntry — the pick shape the watch page consumes: the episode item to
// deep-link into plus the "S02E06" label composed from the episode's raw
// facts (facts stay on the wire; only the naming moved server-side).
export interface NextUpEntry {
  item: ItemDTO;
  seriesId: string;
  title: string;
  label: string;
}

// nextEpisodeAfter — the watch page's sibling pick (watch-flow-polish 2.2):
// given the episode item being watched and that series' episode items, the
// LOWEST parsed episode facts strictly AFTER the current item's — the same
// (season, episode) tuple ordering the retired home derivation established —
// as a NextUpEntry-like pair: the item to deep-link into plus its SxxEyy
// label (the series row stays with the caller, which composes the served
// title). null when the current item carries no parseable episode facts (a
// film never advances) or nothing is strictly after it — no later episode,
// or the rest carry no parseable facts.
export function nextEpisodeAfter(
  current: ItemDTO,
  items: ItemDTO[],
): Pick<NextUpEntry, "item" | "label"> | null {
  const currentFacts = episodeFacts(current);
  if (!currentFacts) {
    return null;
  }
  let best: EpisodeFacts | null = null;
  let bestItem: ItemDTO | null = null;
  for (const item of items) {
    const facts = episodeFacts(item);
    if (!facts || !tupleGt(facts, currentFacts)) {
      continue;
    }
    if (!best || tupleGt(best, facts)) {
      best = facts;
      bestItem = item;
    }
  }
  if (!best || !bestItem) {
    return null;
  }
  return {
    item: bestItem,
    label: `S${String(best.season).padStart(2, "0")}E${String(best.episode).padStart(2, "0")}`,
  };
}
