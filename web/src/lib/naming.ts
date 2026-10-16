// SPDX-License-Identifier: Apache-2.0
import type { ItemDocument } from "@/lib/document";

// Client mirror of the server-side display-name composer
// (internal/api/display.go — READ-ONLY grounding, display-naming D-1/D-6).
// The Naming section's live preview composes CLIENT-side, so this mirror must
// match the Go composer BYTE-FOR-BYTE; web/src/lib/naming.test.ts pins it with
// golden vectors ({episode} inside the title, 3-digit episodes, an absent
// token rendering as the empty string, Cyrillic verbatim). A composer change
// in display.go without updating the vectors fails naming.test.ts.
//
// Cyrillic — and any non-ASCII text — passes through everything here
// VERBATIM: no normalization, no transliteration, no reformatting (the Go
// file's own rule). A name that cannot resolve from facts floors honestly
// ("") — never a fabricated one.

// ElementTokens — the three template values (display.go elementTokens). A
// null Season or Episode is an ABSENT token — it renders as the EMPTY string,
// never a placeholder and never the raw token. Title is the resolved series
// display name; an absent series title renders empty exactly like an absent
// number token.
export interface ElementTokens {
  title: string;
  season: number | null;
  episode: number | null;
}

// composeItemName — the element-template composer (display.go composeItemName):
// the only tokens are {title}, {season}, {episode}; everything else is free
// text copied through byte-for-byte (Cyrillic included, verbatim). Season and
// episode zero-pad to two digits (padStart(2, "0") / %02d semantics — a 3+
// digit value renders in full). No separator grammar, no conditionals, no
// format specifiers. One pass over the template: injected values are never
// re-scanned for tokens, so a title containing "{episode}" cannot be
// re-substituted.
export function composeItemName(tmpl: string, t: ElementTokens): string {
  let out = "";
  for (let i = 0; i < tmpl.length; ) {
    if (tmpl.startsWith("{title}", i)) {
      out += t.title;
      i += "{title}".length;
    } else if (tmpl.startsWith("{season}", i)) {
      out += pad2(t.season);
      i += "{season}".length;
    } else if (tmpl.startsWith("{episode}", i)) {
      out += pad2(t.episode);
      i += "{episode}".length;
    } else {
      out += tmpl[i];
      i += 1;
    }
  }
  return out;
}

// pad2 — one number token: zero-padded to two digits when shorter (JS
// padStart(2, "0") — %02d), a 3+ digit value in full, an absent token (null)
// as the empty string.
function pad2(v: number | null): string {
  if (v === null) {
    return "";
  }
  return String(v).padStart(2, "0");
}

// ---- preview facts (the sample row's inputs) --------------------------------

// EpisodeFacts — the sample episode's identity: the series anchor plus the
// (season, episode) pair (display.go episodeFacts).
export interface EpisodeFacts {
  path: string;
  season: number;
  episode: number;
}

// strField — one field of a dynamic namespace the way display.go's strField
// reads: a non-empty string, else "" (absent, non-string, and empty all floor
// identically).
function strField(m: unknown, key: string): string {
  if (!m || typeof m !== "object") {
    return "";
  }
  const v = (m as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

// isInt — display.go intField: an integer-valued JSON number (Number.isInteger
// — 2.0 and 2e2 qualify, "2" as a string does not), else false.
function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

// episodeFacts — the item document's episode identity, namespace-agnostically:
// any sources.* namespace carrying BOTH integers qualifies. The read order is
// FIXED — serial-parser, then tv-parser, then the remaining namespaces sorted
// — so key order never leaks into a name (display-naming D-3). Null when any
// leg is missing. episode_end is not consumed in v1.
export function episodeFacts(doc: ItemDocument): EpisodeFacts | null {
  const path = strField(doc.parsed, "series_relative_path");
  if (path === "") {
    return null;
  }
  const sources = doc.sources;
  if (!sources || typeof sources !== "object") {
    return null;
  }
  const names = Object.keys(sources)
    .filter((n) => n !== "serial-parser" && n !== "tv-parser")
    .sort();
  const ordered = [
    ...(Object.prototype.hasOwnProperty.call(sources, "serial-parser")
      ? ["serial-parser"]
      : []),
    ...(Object.prototype.hasOwnProperty.call(sources, "tv-parser")
      ? ["tv-parser"]
      : []),
    ...names,
  ];
  for (const name of ordered) {
    const ns: unknown = sources[name];
    if (!ns || typeof ns !== "object") {
      continue;
    }
    const season = (ns as Record<string, unknown>).season;
    const episode = (ns as Record<string, unknown>).episode;
    if (isInt(season) && isInt(episode)) {
      return { path, season, episode };
    }
  }
  return null;
}

// SeriesNameSource — the structural slice of a series row the seriesName
// mirror reads (a SeriesDTO satisfies it).
export interface SeriesNameSource {
  relative_path: string;
  title_override?: string;
  document: ItemDocument;
}

// seriesName — a series row's display title, precedence-ordered (display.go
// namer.seriesName): the stored manual override first (the operator's name
// beats every document fact), then the cleaned display title serial-parser
// writes into its source namespace, then the raw directory name
// (parsed.dir_name_raw verbatim), else the relative path's last segment.
// groupStyle "raw" switches to override > dir_name_raw > last segment
// ("clean" is the default; "" is the module default, i.e. clean).
export function seriesName(sr: SeriesNameSource, groupStyle: string): string {
  const override = sr.title_override ?? "";
  if (override !== "") {
    return override;
  }
  const doc = sr.document;
  if (groupStyle !== "raw") {
    const title = strField(doc.sources?.["serial-parser"], "title");
    if (title !== "") {
      return title;
    }
  }
  const raw = strField(doc.parsed, "dir_name_raw");
  if (raw !== "") {
    return raw;
  }
  return lastSegment(sr.relative_path);
}

// lastSegment — the raw last path segment, verbatim (display.go lastSegment).
function lastSegment(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i >= 0 ? relPath.slice(i + 1) : relPath;
}
