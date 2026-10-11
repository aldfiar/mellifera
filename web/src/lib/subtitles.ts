// SPDX-License-Identifier: Apache-2.0
import type { ItemDocument } from "@/lib/document";

// Client-side subtitle conversion (serial-watch-flow D-3): the media endpoint
// serves the sidecar FILE verbatim (?variant=sidecar&n=, the static-bytes
// posture) and the conversion happens HERE, in the browser — a <track src>
// cannot carry the bearer header, so the SPA fetches the bytes through the
// authenticated channel (fetchSidecarText) and renders them over the playing
// video. Supported: .vtt passthrough, .srt → WebVTT (the trivial text
// transform), .ass/.ssa dialogue extraction (timing + text; styling is
// dropped — v1 scope, a WASM renderer is the deferred upgrade). A .sub
// (MicroDVD — frame-based timing) is NEVER converted: it is listed in the
// control with an explicit not-renderable state (box 5.2) rather than turned
// into garbage. Pure module — no React, no fetch; unit-tested in
// subtitles.test.ts.

// SubtitleSidecar — one selectable subtitle entry for the watch control:
//   index      the entry's DOCUMENT index — the n= the media endpoint
//              resolves against parsed.sidecars, the FULL stored list (audio
//              sidecars included), never a subtitle-only position
//   label      the presentation label, language-then-folder-then-file
//   path       the sidecar's stored relative_path (verbatim)
//   renderable whether the browser can render it (false → the control lists
//              the entry as an explicit not-renderable state, never a
//              selectable entry that does nothing)
export interface SubtitleSidecar {
  index: number;
  label: string;
  path: string;
  renderable: boolean;
}

// RENDERABLE_EXTENSIONS — the formats convertToVtt accepts. Anything else
// (notably .sub) stays listed-but-unselectable.
const RENDERABLE_EXTENSIONS = new Set([".vtt", ".srt", ".ass", ".ssa"]);

// extensionOf — the lowercased extension INCLUDING the dot; "" when the name
// carries none.
function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return path.slice(dot).toLowerCase();
}

// isRenderableSubtitle — whether convertToVtt can produce timed text for this
// file name. Exported pure for tests; the control uses it to decide between a
// selectable entry and the not-renderable state.
export function isRenderableSubtitle(path: string): boolean {
  return RENDERABLE_EXTENSIONS.has(extensionOf(path));
}

// sidecarLabel — the language-then-folder-then-file chain: the sidecar's
// stamped language when present, else its containing folder's name ("Rus
// subs/"), else the bare file name for a top-level sidecar. Exported pure
// for tests.
export function sidecarLabel(path: string, language: string): string {
  if (language !== "") {
    return language;
  }
  const segments = path.split("/");
  return segments.length >= 2
    ? segments[segments.length - 2]
    : (segments[segments.length - 1] ?? path);
}

// subtitleSidecars — the document's SUBTITLE sidecars in document order, each
// carrying its document index (the n= of the sidecar media variant). A
// document without parsed.sidecars (non-serial media, not yet parsed) yields
// [] — the control renders nothing rather than an empty list.
export function subtitleSidecars(doc: ItemDocument): SubtitleSidecar[] {
  const parsed = doc.parsed;
  const sidecars =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).sidecars
      : undefined;
  if (!Array.isArray(sidecars)) {
    return [];
  }
  const out: SubtitleSidecar[] = [];
  sidecars.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const record = entry as Record<string, unknown>;
    if (record.kind !== "subtitle" || typeof record.relative_path !== "string") {
      return;
    }
    const path = record.relative_path;
    out.push({
      index,
      path,
      label: sidecarLabel(
        path,
        typeof record.language === "string" ? record.language : "",
      ),
      renderable: isRenderableSubtitle(path),
    });
  });
  return out;
}

// convertToVtt — the format dispatch: the WebVTT text for the given sidecar
// content, or null when the format is not renderable (.sub and unknown
// extensions — the caller keeps the entry unselectable, never converts).
export function convertToVtt(fileName: string, content: string): string | null {
  switch (extensionOf(fileName)) {
    case ".vtt":
      return content;
    case ".srt":
      return srtToVtt(content);
    case ".ass":
    case ".ssa":
      return assToVtt(content);
    default:
      return null;
  }
}

// srtToVtt — the SRT → WebVTT text transform: the WEBVTT header ahead of the
// blocks and the timing lines' comma millis replaced with a dot. Cue order,
// numbering, and text pass through untouched (both formats accept them).
function srtToVtt(content: string): string {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const out: string[] = ["WEBVTT", ""];
  for (const line of lines) {
    out.push(line.includes("-->") ? line.replace(/,/g, ".") : line);
  }
  return out.join("\n");
}

// DEFAULT_ASS_FIELDS — the ASS/SSA [Events] Format line's conventional field
// order, used only when the file carries no Format declaration of its own.
// Text is ALWAYS the last field and may itself contain commas.
const DEFAULT_ASS_FIELDS = [
  "layer",
  "start",
  "end",
  "style",
  "name",
  "marginl",
  "marginr",
  "marginv",
  "effect",
  "text",
];

// assToVtt — ASS/SSA dialogue extraction: every [Events] Dialogue line
// becomes one WebVTT cue with its start/end timing and its text. Styling is
// dropped by design (D-3 v1): {...} override blocks are stripped, the \N/\n
// soft breaks become real newlines, \h hard spaces become plain spaces.
function assToVtt(content: string): string {
  const cues: string[] = [];
  let fields: string[] | null = null;
  let inEvents = false;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) {
      inEvents = section[1].toLowerCase() === "events";
      continue;
    }
    if (!inEvents) {
      continue;
    }
    if (/^format:/i.test(line)) {
      fields = line
        .slice(line.indexOf(":") + 1)
        .split(",")
        .map((field) => field.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue:/i.test(line)) {
      continue;
    }
    const cue = dialogueCue(
      fields ?? DEFAULT_ASS_FIELDS,
      line.slice(line.indexOf(":") + 1),
    );
    if (cue !== null) {
      cues.push(cue);
    }
  }
  return ["WEBVTT", "", ...cues.join("\n\n").split("\n")].join("\n");
}

// dialogueCue — one Dialogue line's comma-split values against the Format
// order → "start --> end\nlines". The text field is LAST and may contain
// commas, so the tail beyond the declared fields is joined back. A cue with
// an unparseable timing is dropped (a malformed line never breaks the rest).
function dialogueCue(fields: string[], values: string): string | null {
  const parts = values.split(",");
  const start = assTimeToVtt(parts[fields.indexOf("start")] ?? "");
  const end = assTimeToVtt(parts[fields.indexOf("end")] ?? "");
  if (start === null || end === null) {
    return null;
  }
  const text = parts
    .slice(fields.length - 1)
    .join(",")
    .replace(/\{[^}]*\}/g, "") // {...} override blocks — styling, dropped
    .replace(/\\[Nn]/g, "\n") // \N / \n soft line breaks
    .replace(/\\h/g, " ") // \h hard space
    .trim();
  return `${start} --> ${end}\n${text}`;
}

// assTimeToVtt — ASS centisecond timing (H:MM:SS.CC) → WebVTT millis
// (HH:MM:SS.mmm). Returns null for anything that is not a clock time.
function assTimeToVtt(raw: string): string | null {
  const match = /^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(raw.trim());
  if (!match) {
    return null;
  }
  return `${match[1].padStart(2, "0")}:${match[2].padStart(2, "0")}:${match[3].padStart(2, "0")}.${match[4].padEnd(3, "0")}`;
}
