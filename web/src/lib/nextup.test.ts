// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import type { ItemDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";
import { episodeFacts, nextEpisodeAfter } from "@/lib/nextup";

// watch-flow-polish 2.1 — table-driven vectors over the episode-facts core
// the watch page consumes: parsed.series_relative_path as the D-8 match key
// and season/episode out of a dynamic source namespace. The home-only
// derivation vectors (startedSeries/seriesKey/nextUpEntries) retired with
// the derivation itself (browse-scale 5.4).

// doc — an item document with the optional serial-scanner series anchor
// (parsed.series_relative_path) and optional parsed season/episode numbers
// out of a "tv-parser" source namespace.
function doc(facts: {
  seriesPath?: string;
  season?: number;
  episode?: number;
}): ItemDocument {
  const d: ItemDocument = {};
  const source: Record<string, unknown> = {};
  if (facts.season !== undefined) source.season = facts.season;
  if (facts.episode !== undefined) source.episode = facts.episode;
  if (Object.keys(source).length > 0) {
    d.sources = { "tv-parser": source };
  }
  if (facts.seriesPath !== undefined) {
    d.parsed = { series_relative_path: facts.seriesPath };
  }
  return d;
}

// item — a serial-module item fixture ("tv" passed explicitly for the
// film-skip vectors).
function item(
  id: string,
  libraryId: number,
  document: ItemDocument,
  moduleId = "serial",
): ItemDTO {
  return {
    id,
    module_id: moduleId,
    library_id: libraryId,
    file_id: `file-${id}`,
    relative_path: `Show/${id}.mkv`,
    media_type: moduleId,
    document,
    schema_version: 1,
    status: "ready",
  };
}

// SHOW — a serial episode item on the "Show" series path.
const SHOW = (libraryId: number, season: number, episode: number): ItemDTO =>
  item(
    `itm_${String(libraryId)}_s${String(season)}e${String(episode)}`,
    libraryId,
    doc({ seriesPath: "Show", season, episode }),
  );

describe("moved_core_parity", () => {
  it.each([
    {
      name: "full facts — the anchor plus parsed season/episode out of a namespace",
      item: SHOW(1, 2, 7),
      want: { libraryId: 1, seriesPath: "Show", season: 2, episode: 7 },
    },
    {
      name: "season/episode without the series anchor — omitted, never guessed",
      item: item("itm_x", 1, doc({ season: 1, episode: 2 })),
      want: null,
    },
    {
      name: "anchor without parseable episode numbers — omitted",
      item: item("itm_y", 1, doc({ seriesPath: "Show" })),
      want: null,
    },
    {
      name: "no facts at all (a film) — omitted",
      item: item("itm_z", 1, doc({})),
      want: null,
    },
    {
      name: "a non-integer episode value is not a parseable fact",
      item: item("itm_w", 1, {
        sources: { "tv-parser": { season: 1, episode: "2" } },
        parsed: { series_relative_path: "Show" },
      }),
      want: null,
    },
  ])("episodeFacts: $name", ({ item, want }) => {
    expect(episodeFacts(item)).toEqual(want);
  });
});

// watch-flow-polish 2.2 — table-driven vectors over the watch page's sibling
// pick: the lowest parsed episode facts strictly AFTER the current item's,
// on the (season, episode) tuple ordering episodeFacts establishes.
describe("next_episode_after_picks_lowest_strictly_after", () => {
  it.each([
    {
      name: "adjacent pick — watching S01E02, the list's S01E03 is next",
      current: SHOW(1, 1, 2),
      items: [SHOW(1, 1, 1), SHOW(1, 1, 2), SHOW(1, 1, 3)],
      want: { item: SHOW(1, 1, 3), label: "S01E03" },
    },
    {
      name: "skip-across ordering — the lowest strictly-after wins, not the first seen",
      current: SHOW(1, 1, 4),
      items: [SHOW(1, 1, 2), SHOW(1, 2, 3), SHOW(1, 2, 1), SHOW(1, 3, 9)],
      want: { item: SHOW(1, 2, 1), label: "S02E01" },
    },
    {
      name: "equal facts are not strictly after — the current item itself never wins",
      current: SHOW(1, 1, 2),
      items: [SHOW(1, 1, 1), SHOW(1, 1, 2)],
      want: null,
    },
    {
      name: "last episode — nothing strictly after, null",
      current: SHOW(1, 2, 1),
      items: [SHOW(1, 1, 3), SHOW(1, 2, 1)],
      want: null,
    },
    {
      name: "current without episode facts (a film) — null, never guessed",
      current: item("itm_film", 1, doc({})),
      items: [SHOW(1, 1, 2)],
      want: null,
    },
    {
      name: "facts-less candidates are skipped, never fatal",
      current: SHOW(1, 1, 1),
      items: [item("itm_x", 1, doc({ seriesPath: "Show" })), SHOW(1, 1, 2)],
      want: { item: SHOW(1, 1, 2), label: "S01E02" },
    },
  ])("nextEpisodeAfter: $name", ({ current, items, want }) => {
    expect(nextEpisodeAfter(current, items)).toEqual(want);
  });
});
