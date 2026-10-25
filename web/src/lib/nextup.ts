// SPDX-License-Identifier: Apache-2.0
import type { ItemDTO, ProgressDTO, SeriesDTO } from "@/lib/api";

// The Home Next up derivation's pure core (watch-flow-polish 2.1, D3 —
// moves, not forks): EpisodeFacts/episodeFacts, StartedSeries/startedSeries,
// NextUpEntry/nextUpEntries moved VERBATIM from pages/home/Home.tsx — names
// and shapes unchanged — so Home (which re-exports them) and the watch page's
// AutoNext share one framework-free home. Types from @/lib/api only: no
// React, no queries, no DOM. Parity vectors over the moved functions live in
// nextup.test.ts; Home.test.tsx keeps covering the re-export seam.

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

// seriesKey — the (library, series path) grouping key. The one helper the
// move EXPORTS: Home's NextUpRow builds the series/episode maps with the
// same key, and a forked copy could drift from nextUpEntries' own lookups —
// one definition (D3, moves-not-forks).
export function seriesKey(
  facts: { libraryId: number; seriesPath: string },
): string {
  return `${String(facts.libraryId)}|${facts.seriesPath}`;
}

// tupleGt — (season, episode) ordering: a later season wins; within a season,
// the later episode.
function tupleGt(a: EpisodeFacts, b: EpisodeFacts): boolean {
  return a.season > b.season || (a.season === b.season && a.episode > b.episode);
}

// StartedSeries — one touched series: the HIGHEST started (season, episode)
// across its progress items (recency order comes from the progress list,
// which the server returns newest-first).
export interface StartedSeries {
  libraryId: number;
  seriesPath: string;
  season: number;
  episode: number;
}

// startedSeries — groups the progress list into touched series. tv-module
// items (films) never enter — Next up is an episode concept; records whose
// item has no parseable episode facts are skipped (the Next up fallback).
export function startedSeries(
  progress: ProgressDTO[],
  itemById: Map<string, ItemDTO>,
): StartedSeries[] {
  const byKey = new Map<string, StartedSeries>();
  for (const record of progress) {
    const item = itemById.get(record.item_id);
    if (!item || item.module_id === "tv") {
      continue;
    }
    const facts = episodeFacts(item);
    if (!facts) {
      continue;
    }
    const key = seriesKey(facts);
    const existing = byKey.get(key);
    if (!existing || tupleGt(facts, existing)) {
      byKey.set(key, facts);
    }
  }
  return [...byKey.values()];
}

// NextUpEntry — one Play-able suggestion: the episode item to deep-link into,
// the series record that owns it, its SERVED display title and the "S02E06"
// label composed from the episode's raw facts (facts stay on the wire; only
// the naming moved server-side).
export interface NextUpEntry {
  item: ItemDTO;
  seriesId: string;
  title: string;
  label: string;
}

// nextUpEntries — per started series (progress recency order), the
// lowest-numbered episode strictly AFTER the highest started one, taken from
// the series record's episode list (GET /series/{id}/episodes — one cached
// fetch per started series). A series whose row did not resolve (the
// episode-without-series fallback) or that has no later episode — none
// exists, or its items carry no parseable facts — is omitted.
export function nextUpEntries(
  started: StartedSeries[],
  seriesByKey: Map<string, SeriesDTO>,
  episodesBySeriesId: Map<string, ItemDTO[]>,
): NextUpEntry[] {
  const out: NextUpEntry[] = [];
  for (const s of started) {
    const series = seriesByKey.get(seriesKey(s));
    if (!series) {
      continue;
    }
    const episodes = episodesBySeriesId.get(series.id);
    if (!episodes) {
      continue;
    }
    let best: EpisodeFacts | null = null;
    let bestItem: ItemDTO | null = null;
    for (const item of episodes) {
      const facts = episodeFacts(item);
      if (!facts || !tupleGt(facts, s)) {
        continue;
      }
      if (!best || tupleGt(best, facts)) {
        best = facts;
        bestItem = item;
      }
    }
    if (best && bestItem) {
      out.push({
        item: bestItem,
        seriesId: series.id,
        // The SERVED series name VERBATIM (display-naming) — a floor-empty ""
        // renders empty, never a client-side file-name fallback; the `?? ""`
        // only normalizes the optional TS field's absence.
        title: series.display_name ?? "",
        label: `S${String(best.season).padStart(2, "0")}E${String(best.episode).padStart(2, "0")}`,
      });
    }
  }
  return out;
}

// nextEpisodeAfter — the watch page's sibling pick (watch-flow-polish 2.2):
// given the episode item being watched and that series' episode items, the
// LOWEST parsed episode facts strictly AFTER the current item's — the same
// (season, episode) tuple ordering nextUpEntries establishes — as a
// NextUpEntry-like pair: the item to deep-link into plus its SxxEyy label
// (the series row stays with the caller, which composes the served title).
// null when the current item carries no parseable episode facts (a film
// never advances) or nothing is strictly after it — no later episode, or
// the rest carry no parseable facts (the same fallback nextUpEntries
// omits a series by).
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
