// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

// JsonValue — the lossless leaf renderer for any JSON value out of the §3.1
// document (Tier 2 namespaces, _view values, ffprobe blob, …). Recursive over
// objects/arrays; every primitive renders verbatim:
//   - strings pass through untouched (UTF-8/Cyrillic included)
//   - numbers render via React's own number→text conversion — never
//     rounded, padded, or locale-reformatted (INV-no-rounding)
//   - null/booleans render as their JSON literals
// Content is emitted ONLY as text or structured children (list/definition
// markup) — raw-HTML injection is never used (INV-text-children-only).
//
// Components never fetch; this one is a pure function of `value`.

export function JsonValue(props: { value: unknown }): ReactElement {
  const { value } = props;

  if (value === null) {
    return <span className="font-mono text-xs text-muted-foreground">null</span>;
  }

  if (typeof value === "string") {
    return <span className="break-words">{value}</span>;
  }

  // Number + boolean: String() is the lossless primitive stringify (a JS
  // number already carries its parse-time precision; no reformatting here).
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="font-mono">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <ul className="ml-4 list-disc space-y-1">
        {value.map((item, i) => (
          <li key={i}>
            <JsonValue value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <dl className="ml-4 space-y-1">
        {entries.map(([key, v]) => (
          <div key={key} className="flex flex-wrap items-baseline gap-2">
            <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
            <dd className="min-w-0">
              <JsonValue value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  // undefined / functions / symbols never occur in parsed JSON; fall through
  // to the empty-coverage placeholder rather than inventing a value.
  return <span className="text-xs text-muted-foreground">—</span>;
}
