// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import type { ItemDTO, ProgressDTO, SeriesDTO } from "@/lib/api";
import type { ItemDocument } from "@/lib/document";
import {
  episodeFacts,
  nextEpisodeAfter,
  nextUpEntries,
  seriesKey,
  startedSeries,
} from "@/lib/nextup";

// watch-flow-polish 2.1 — table-driven parity vectors over the Home Next up
// pure core moved verbatim from pages/home/Home.tsx (D3 — moves, not forks).
// The tables mirror Home.test.tsx's "Next up derivation (pure core)" coverage
// scenario-for-scenario and run against the moved module's own home: any
// behavior drift in the move fails here, and any later edit to the core that
// changes an outcome fails before Home or AutoNext consume it. The fixtures
// are the same seams Home.test.tsx pins: parsed.series_relative_path as the
// D-8 match key, season/episode out of a dynamic source namespace, and the
// SERVED series display_name consumed verbatim.

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

function progress(itemId: string, position: number, at: string): ProgressDTO {
  return { item_id: itemId, position_seconds: position, updated_at: at };
}

// seriesRow — a SeriesDTO fixture: the row the (library, series path) key
// resolves against (its relative_path IS the anchor).
function seriesRow(
  id: string,
  libraryId: number,
  relativePath: string,
  overrides: Partial<SeriesDTO> = {},
): SeriesDTO {
  return {
    id,
    module_id: "serial",
    library_id: libraryId,
    relative_path: relativePath,
    document: {},
    schema_version: 1,
    status: "ready",
    ...overrides,
  };
}

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

  it.each([
    {
      name: "keeps the highest started (season, episode) per (library, series path) in first-seen (recency) order",
      records: [
        progress("itm_1_s1e3", 10, "2026-10-07T18:00:00Z"),
        progress("itm_1_s1e1", 10, "2026-10-06T18:00:00Z"),
        progress("itm_2_s2e1", 10, "2026-10-05T18:00:00Z"),
      ],
      itemById: new Map<string, ItemDTO>([
        ["itm_1_s1e3", SHOW(1, 1, 3)],
        ["itm_1_s1e1", SHOW(1, 1, 1)],
        ["itm_2_s2e1", SHOW(2, 2, 1)],
      ]),
      want: [
        { libraryId: 1, seriesPath: "Show", season: 1, episode: 3 },
        { libraryId: 2, seriesPath: "Show", season: 2, episode: 1 },
      ],
    },
    {
      name: "a tv-module film never enters even with full episode facts — Next up is an episode concept",
      records: [
        progress("itm_1_film", 10, "2026-10-07T18:00:00Z"),
        progress("itm_1_s1e2", 10, "2026-10-06T18:00:00Z"),
      ],
      itemById: new Map<string, ItemDTO>([
        [
          "itm_1_film",
          item(
            "itm_1_film",
            1,
            doc({ seriesPath: "Show", season: 1, episode: 9 }),
            "tv",
          ),
        ],
        ["itm_1_s1e2", SHOW(1, 1, 2)],
      ]),
      want: [{ libraryId: 1, seriesPath: "Show", season: 1, episode: 2 }],
    },
    {
      name: "a record whose item carries no parseable facts is skipped",
      records: [progress("itm_1_nofacts", 10, "2026-10-07T18:00:00Z")],
      itemById: new Map<string, ItemDTO>([
        ["itm_1_nofacts", item("itm_1_nofacts", 1, doc({}))],
      ]),
      want: [],
    },
    {
      name: "a record whose item vanished since (absent from the map) is skipped",
      records: [progress("itm_gone", 10, "2026-10-07T18:00:00Z")],
      itemById: new Map<string, ItemDTO>(),
      want: [],
    },
  ])("startedSeries: $name", ({ records, itemById, want }) => {
    expect(startedSeries(records, itemById)).toEqual(want);
  });

  it.each([
    {
      name: "library id and series path join with a pipe",
      facts: { libraryId: 1, seriesPath: "Show" },
      want: "1|Show",
    },
    {
      name: "different libraries never share a key, even on one path",
      facts: { libraryId: 2, seriesPath: "Show" },
      want: "2|Show",
    },
  ])("seriesKey: $name", ({ facts, want }) => {
    expect(seriesKey(facts)).toBe(want);
  });

  it.each([
    {
      name: "picks the lowest strictly-after (season, episode) from a shuffled list — the started episode itself never resurfaces",
      started: [{ libraryId: 1, seriesPath: "Show", season: 1, episode: 3 }],
      seriesByKey: new Map<string, SeriesDTO>([
        [
          "1|Show",
          seriesRow("ser_1_show", 1, "Show", { display_name: "Моё имя" }),
        ],
      ]),
      episodesBySeriesId: new Map<string, ItemDTO[]>([
        [
          "ser_1_show",
          [SHOW(1, 1, 1), SHOW(1, 1, 5), SHOW(1, 1, 4), SHOW(1, 2, 1), SHOW(1, 1, 3)],
        ],
      ]),
      want: [
        {
          item: SHOW(1, 1, 4),
          seriesId: "ser_1_show",
          title: "Моё имя",
          label: "S01E04",
        },
      ],
    },
    {
      name: "a later season outranks a bigger in-season number",
      started: [{ libraryId: 1, seriesPath: "Show", season: 1, episode: 5 }],
      seriesByKey: new Map<string, SeriesDTO>([
        ["1|Show", seriesRow("ser_1", 1, "Show")],
      ]),
      episodesBySeriesId: new Map<string, ItemDTO[]>([
        ["ser_1", [SHOW(1, 1, 1), SHOW(1, 2, 1)]],
      ]),
      want: [
        { item: SHOW(1, 2, 1), seriesId: "ser_1", title: "", label: "S02E01" },
      ],
    },
    {
      name: "titles carry the served display_name verbatim — a floor-empty name stays empty, never a client fallback",
      started: [{ libraryId: 4, seriesPath: "Bare", season: 1, episode: 1 }],
      seriesByKey: new Map<string, SeriesDTO>([
        ["4|Bare", seriesRow("ser_4_bare", 4, "Bare", { display_name: "" })],
      ]),
      episodesBySeriesId: new Map<string, ItemDTO[]>([
        ["ser_4_bare", [SHOW(4, 1, 2)]],
      ]),
      want: [
        {
          item: SHOW(4, 1, 2),
          seriesId: "ser_4_bare",
          title: "",
          label: "S01E02",
        },
      ],
    },
    {
      name: "a series with no strictly-after episode (exhausted) is omitted",
      started: [{ libraryId: 2, seriesPath: "Other", season: 2, episode: 9 }],
      seriesByKey: new Map<string, SeriesDTO>([
        ["2|Other", seriesRow("ser_2_other", 2, "Other")],
      ]),
      episodesBySeriesId: new Map<string, ItemDTO[]>([
        ["ser_2_other", [SHOW(2, 2, 9)]],
      ]),
      want: [],
    },
    {
      name: "a series whose row did not resolve (episode-without-series) is omitted",
      started: [{ libraryId: 3, seriesPath: "Ghost", season: 1, episode: 1 }],
      seriesByKey: new Map<string, SeriesDTO>(),
      episodesBySeriesId: new Map<string, ItemDTO[]>([
        ["ser_ghost", [SHOW(3, 1, 2)]],
      ]),
      want: [],
    },
    {
      name: "a resolved series whose episode list has not landed is omitted",
      started: [{ libraryId: 1, seriesPath: "Show", season: 1, episode: 1 }],
      seriesByKey: new Map<string, SeriesDTO>([
        ["1|Show", seriesRow("ser_1_show", 1, "Show")],
      ]),
      episodesBySeriesId: new Map<string, ItemDTO[]>(),
      want: [],
    },
    {
      name: "episodes without parseable facts never become suggestions",
      started: [{ libraryId: 1, seriesPath: "Show", season: 1, episode: 1 }],
      seriesByKey: new Map<string, SeriesDTO>([
        ["1|Show", seriesRow("ser_1_show", 1, "Show")],
      ]),
      episodesBySeriesId: new Map<string, ItemDTO[]>([
        ["ser_1_show", [item("itm_broken", 1, doc({ seriesPath: "Show" }))]],
      ]),
      want: [],
    },
  ])(
    "nextUpEntries: $name",
    ({ started, seriesByKey, episodesBySeriesId, want }) => {
      expect(nextUpEntries(started, seriesByKey, episodesBySeriesId)).toEqual(
        want,
      );
    },
  );
});

// watch-flow-polish 2.2 — table-driven vectors over the watch page's sibling
// pick: the lowest parsed episode facts strictly AFTER the current item's,
// on the same (season, episode) tuple ordering the moved core establishes.
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
