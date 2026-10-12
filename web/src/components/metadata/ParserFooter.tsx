// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import { JsonValue } from "@/components/metadata/JsonValue";
import type { SourceNamespace } from "@/lib/document";

// ParserFooter — the metadata footer beneath the identity block (element-pages
// D-5). The caller passes the parser groups in render order — the collection
// chain first (the module presentation's `parsers`, chain priority order), then
// the element-attached parsers (`extra_parsers`); ItemDetail composes that
// order. This module owns the per-group rendering AND the per-pair resolution
// contract:
//
//   - one group per parser in the given order: the collection chain first,
//     element-only groups after, each pill-marked "element only";
//   - one label/value pair per declared display_field, in the parser's
//     declared order (module config `display_fields` — config IS render
//     order, AC-4); an element-attached group (its wire shape carries ids
//     only, no declared fields) renders its namespace's own keys in
//     insertion order;
//   - values resolve verbatim from the parser's OWN `sources.<plugin_id>`
//     namespace — namespaces are never merged, values never reshaped
//     (INV-no-rounding); scalars render through <JsonValue>;
//   - composite display fields join their component namespace facts:
//     `camera` = make + model, `dimensions` = width × height,
//     `season_episode` = the season and episode facts rendered label-aware
//     ("Season N · Episode M"; the season part alone as "Season N", the
//     episode part alone as "Episode M") — the join is the declared contract,
//     the component values stay verbatim;
//   - `thumbnail`/`grabbed_at` resolve from the frame-grabber namespace
//     (thumbnail via its written field `thumbnail_path`);
//   - a pair whose facts are absent is skipped silently (soft-fail posture —
//     never a blank, never a zero, never a fabricated value); absent pairs
//     stay hidden;
//   - a group with no displayable pairs renders as a slot group in its chain
//     position (the seeded-but-unloaded provider case): pill + slot note,
//     never a fabricated row.

// COMPOSITE_PARTS — display field → its component namespace fields, in join
// order. COMPOSITE_SEPS — the join separator per composite (`camera` renders
// "Make Model", `dimensions` renders "1920×1080", `season_episode` renders
// "Season N · Episode M"). COMPOSITE_LABELS — per-part label templates for
// composites whose parts carry their own word; composites without an entry
// render their parts bare. Absent parts drop out of the join; the pair skips
// silently only when no part is present.
const COMPOSITE_PARTS: Record<string, string[]> = {
  camera: ["make", "model"],
  dimensions: ["width", "height"],
  season_episode: ["season", "episode"],
};

const COMPOSITE_SEPS: Record<string, string> = {
  camera: " ",
  dimensions: "×",
  season_episode: " · ",
};

const COMPOSITE_LABELS: Record<string, Record<string, string>> = {
  season_episode: { season: "Season {v}", episode: "Episode {v}" },
};

// FIELD_ALIASES — display field → the namespace field(s) that actually carry
// it, first present wins. The frame-grabber namespace writes `thumbnail_path`
// while its declared display field is `thumbnail`; undeclared fields resolve
// under their own name.
const FIELD_ALIASES: Record<string, string[]> = {
  thumbnail: ["thumbnail_path", "thumbnail"],
  grabbed_at: ["grabbed_at"],
};

// DisplayPair — one resolved footer pair: the declared field name, its
// humanized label, and the verbatim value (a joined string for composites,
// the raw JSON value otherwise — rendered through <JsonValue>).
export interface DisplayPair {
  field: string;
  label: string;
  value: unknown;
}

// humanizeField — `parsed_from` → "parsed from". Labels only; values are
// never touched.
export function humanizeField(field: string): string {
  return field.replace(/_/g, " ");
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

// resolveDisplayPair — one declared display field against one parser
// namespace. Returns null when the pair's facts are absent (skip-silent);
// a composite joins whichever of its parts are present and is skipped only
// when none are.
export function resolveDisplayPair(
  field: string,
  namespace: SourceNamespace,
): DisplayPair | null {
  const parts = COMPOSITE_PARTS[field];
  if (parts) {
    const labels = COMPOSITE_LABELS[field];
    const rendered = parts
      .filter((part) => present(namespace[part]))
      .map((part) => {
        const value = String(namespace[part]);
        const template = labels?.[part];
        return template ? template.replace("{v}", value) : value;
      });
    if (rendered.length === 0) {
      return null;
    }
    return { field, label: humanizeField(field), value: rendered.join(COMPOSITE_SEPS[field] ?? " ") };
  }
  for (const key of FIELD_ALIASES[field] ?? [field]) {
    if (present(namespace[key])) {
      return { field, label: humanizeField(field), value: namespace[key] };
    }
  }
  return null;
}

// resolveDisplayFields — a parser's declared display_fields order against its
// namespace, absent pairs skipped. Declared order IS render order.
export function resolveDisplayFields(
  fields: string[],
  namespace: SourceNamespace,
): DisplayPair[] {
  return fields
    .map((field) => resolveDisplayPair(field, namespace))
    .filter((pair): pair is DisplayPair => pair !== null);
}

// ParserFooterGroup — one parser's footer group: the plugin pill identity,
// its declared display_fields order (from module config via the API; empty
// for an element-attached parser — its namespace keys render instead), its
// own `sources.<plugin_id>` namespace, and the element-only flag (an
// element-attached parser renders after the chain, pill-marked).
export interface ParserFooterGroup {
  pluginId: string;
  displayFields: string[];
  namespace: SourceNamespace;
  elementOnly?: boolean;
}

export interface ParserFooterProps {
  groups: ParserFooterGroup[];
}

// SlotNote — the shared slot state (element-pages D-1/D-5): a dashed note
// naming what is missing — never a blank, never a fabricated value. Used for
// empty footer groups (the seeded-but-unloaded provider case) and, from the
// element page, for a missing mandatory identity field.
export function SlotNote(props: { label: string; note?: string }): ReactElement {
  return (
    <div className="rounded border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <span className="font-medium">{props.label}</span>
      {props.note ? <span className="block text-xs">{props.note}</span> : null}
    </div>
  );
}

// ParserFooter — one group per parser in the given order (collection chain,
// then element-only); a group with no displayable pairs renders its pill plus
// the slot note in its chain position.
export function ParserFooter(props: ParserFooterProps): ReactElement {
  const { groups } = props;

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        // Element-attached groups carry no declared display_fields on the
        // wire — their namespace's own keys, insertion order, stand in.
        const fields =
          group.displayFields.length > 0
            ? group.displayFields
            : Object.keys(group.namespace);
        const pairs = resolveDisplayFields(fields, group.namespace);
        return (
          <div key={group.pluginId} className="space-y-2">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {group.pluginId}
              </span>
              {group.elementOnly ? (
                <span className="rounded border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
                  element only
                </span>
              ) : null}
            </span>
            {pairs.length > 0 ? (
              <dl className="space-y-1">
                {pairs.map((pair) => (
                  <div key={pair.field} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <dt className="text-muted-foreground">{pair.label}</dt>
                    <dd className="min-w-0">
                      <JsonValue value={pair.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <SlotNote
                label="No data yet"
                note="This parser has not written anything for this element."
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
