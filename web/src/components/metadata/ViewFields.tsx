// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import { JsonValue } from "@/components/metadata/JsonValue";
import type { ViewEntry } from "@/lib/document";

// ViewFields — the Tier-3 computed display block (`_view`). The frozen prop is
// the raw record shape; the page feeds it from viewEntries(doc) so the
// accessor owns the shape. Every `value` renders through <JsonValue> verbatim
// (string, number, or structured — never rounded or stringified, INV-
// no-rounding); source/lang/reason are provenance context and render as text.

export interface ViewFieldsProps {
  entries: Record<string, ViewEntry>;
}

export function ViewFields(props: ViewFieldsProps): ReactElement {
  const { entries } = props;
  const fields = Object.entries(entries);

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">No computed fields</p>;
  }

  return (
    <dl className="space-y-3">
      {fields.map(([fieldPath, entry]) => (
        <div key={fieldPath} className="space-y-1">
          <dt className="font-mono text-xs text-muted-foreground">{fieldPath}</dt>
          <dd className="text-sm">
            <JsonValue value={entry.value} />
            <p className="mt-1 text-xs text-muted-foreground">
              {entry.source}
              {entry.lang !== undefined ? ` (${entry.lang})` : ""} — {entry.reason}
            </p>
          </dd>
        </div>
      ))}
    </dl>
  );
}
