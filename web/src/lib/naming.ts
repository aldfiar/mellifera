// SPDX-License-Identifier: Apache-2.0
import type { ItemDocument } from "@/lib/document";

// Client mirror of the server-side display-name composer
// (internal/api/display.go — READ-ONLY grounding, display-naming D-1/D-6 and
// plugin-title-enrichment's title walk). The Naming section's live preview
// composes CLIENT-side, so this mirror must match the Go composer
// BYTE-FOR-BYTE; web/src/lib/naming.test.ts pins it with golden vectors
// ({episode} inside the title, 3-digit episodes, an absent token rendering as
// the empty string, Cyrillic verbatim) AND with the shared composer–SPA
// fixture internal/api/testdata/golden/title_vectors.json (the ONE file both
// suites consume — mutating a vector on either side alone fails that side).
// The walk mirror consumes SERVED inputs only: the title_sources pairs (the
// EFFECTIVE module∧library gate resolution, gate-resolved upstream) and
// language_preference — this mirror NEVER resolves gates.
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
// mirror reads (a SeriesDTO satisfies it). status carries the row's lifecycle
// ("deleted" = tombstone — the item join skips it, never a floor input).
export interface SeriesNameSource {
  relative_path: string;
  title_override?: string;
  status?: string;
  document: ItemDocument;
}

// TitleSourcePair — one SERVED title_sources entry (display.go
// titleSourceBinding): the source's plugin id and its EFFECTIVE enablement
// after the module∧library gate resolution (resolved upstream — this mirror
// never resolves gates).
export interface TitleSourcePair {
  id: string;
  enabled: boolean;
}

// pickLanguage — the language-pick policy (display.go pickLanguage): pref
// "ru" reads the `russian` key, pref "en" reads the `romaji` key, an unknown
// pref code floors to the next pref, and no usable pick floors to "" (the
// caller moves on to the next source).
function pickLanguage(ns: Record<string, unknown>, prefs: string[]): string {
  for (const pref of prefs) {
    const key = pref === "ru" ? "russian" : pref === "en" ? "romaji" : "";
    if (key === "") {
      continue;
    }
    const s = ns[key];
    if (typeof s === "string" && s !== "") {
      return s;
    }
  }
  return "";
}

// sourceTitle — the config-ordered title walk (display.go namer.sourceTitle):
// per binding, in order, a disabled entry, a missing namespace, an empty
// string title, a mistyped title (neither string nor object), or an empty
// language pick all floor to the NEXT source; a string title passes through
// verbatim; an object title is picked by language_preference. Returns "" when
// nothing resolves — the caller floors to its next leg. An empty binding list
// skips the walk entirely.
export function sourceTitle(
  doc: ItemDocument,
  titleSources: TitleSourcePair[],
  langPrefs: string[],
): string {
  if (titleSources.length === 0) {
    return "";
  }
  const sources = doc.sources;
  if (!sources || typeof sources !== "object") {
    return "";
  }
  for (const ts of titleSources) {
    if (!ts.enabled) {
      continue;
    }
    const ns: unknown = (sources as Record<string, unknown>)[ts.id];
    if (!ns || typeof ns !== "object") {
      continue;
    }
    const title = (ns as Record<string, unknown>).title;
    if (typeof title === "string") {
      if (title !== "") {
        return title;
      }
    } else if (title !== null && title !== undefined && typeof title === "object") {
      const picked = pickLanguage(title as Record<string, unknown>, langPrefs);
      if (picked !== "") {
        return picked;
      }
    }
  }
  return "";
}

// viewTitle — the item document's own _view.title.value floor, verbatim
// (display.go viewTitle): a string passes through as-is; a number renders as
// its literal bytes (String(value)); anything else floors to "".
function viewTitle(doc: ItemDocument): string {
  const view = doc._view;
  if (!view || typeof view !== "object") {
    return "";
  }
  const title: unknown = (view as Record<string, unknown>)["title"];
  if (!title || typeof title !== "object") {
    return "";
  }
  const v = (title as Record<string, unknown>).value;
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number") {
    return String(v);
  }
  return "";
}

// seriesNameFrom — the precedence chain with the override as an explicit
// parameter (display.go namer.seriesName(sr, override)): the item join feeds
// the point-read series override, the row surface feeds the row's own.
function seriesNameFrom(
  sr: SeriesNameSource,
  override: string,
  groupStyle: string,
  titleSources: TitleSourcePair[],
  langPrefs: string[],
): string {
  if (override !== "") {
    return override;
  }
  const doc = sr.document;
  if (groupStyle !== "raw") {
    const walked = sourceTitle(doc, titleSources, langPrefs);
    if (walked !== "") {
      return walked;
    }
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

// seriesName — a series row's display title, precedence-ordered (display.go
// namer.seriesName): the stored manual override first (the operator's name
// beats every document fact), then the config-driven title walk over the
// plugin namespaces (plugin-title-enrichment), then the cleaned display title
// serial-parser writes into its source namespace, then the raw directory
// name (parsed.dir_name_raw verbatim), else the relative path's last segment.
// groupStyle "raw" switches to override > dir_name_raw > last segment — the
// walk and the parser title both skipped ("clean" is the default; "" is the
// module default, i.e. clean). The walk inputs are SERVED only (the resolved
// title_sources pairs + language_preference); omitted bindings skip the walk.
export function seriesName(
  sr: SeriesNameSource,
  groupStyle: string,
  titleSources: TitleSourcePair[] = [],
  langPrefs: string[] = [],
): string {
  return seriesNameFrom(sr, sr.title_override ?? "", groupStyle, titleSources, langPrefs);
}

// NamerContext — the served inputs one composition context carries
// (display.go namer): the library's naming options, the gate-resolved title
// chain, the language pick order, the library-wide series map the item join
// reads, and the point-read series override for the row under composition.
export interface NamerContext {
  groupStyle: string;
  elementTemplate: string;
  seriesByPath: SeriesNameSource[];
  seriesOverride: string;
  titleSources: TitleSourcePair[];
  languagePreference: string[];
}

// itemName — an item's display name, precedence exactly (display.go
// namer.itemName): the item's stored title_override first, then the composed
// element name (episode facts joined to the resolved series row, tombstones
// skipped), then the title walk over the item's OWN namespaces, then the
// document's _view.title.value verbatim, then "". Every floor leg is honest.
export function itemName(override: string, doc: ItemDocument, n: NamerContext): string {
  if (override !== "") {
    return override;
  }
  if (n.elementTemplate !== "") {
    const facts = episodeFacts(doc);
    if (facts) {
      const sr = n.seriesByPath.find((s) => s.relative_path === facts.path);
      if (sr && sr.status !== "deleted") {
        return composeItemName(
          n.elementTemplate,
          {
            title: seriesNameFrom(
              sr,
              n.seriesOverride,
              n.groupStyle,
              n.titleSources,
              n.languagePreference,
            ),
            season: facts.season,
            episode: facts.episode,
          },
        );
      }
    }
  }
  const walked = sourceTitle(doc, n.titleSources, n.languagePreference);
  if (walked !== "") {
    return walked;
  }
  return viewTitle(doc);
}

// lastSegment — the raw last path segment, verbatim (display.go lastSegment).
function lastSegment(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i >= 0 ? relPath.slice(i + 1) : relPath;
}
