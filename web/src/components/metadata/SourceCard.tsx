// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JsonValue } from "@/components/metadata/JsonValue";
import type { SourceNamespace } from "@/lib/document";

// SourceCard — one plugin's Tier-2 namespace (`sources.<plugin_id>`), rendered
// as its own card with the plugin_id as the title. Namespaces are NEVER merged:
// the page mounts one card per sourcesOf(doc) entry, so two plugins carrying
// the same field name stay visually and structurally separate (INV-no-merge).
// Field values go through <JsonValue> verbatim (INV-no-rounding).

export interface SourceCardProps {
  pluginId: string;
  namespace: SourceNamespace;
}

export function SourceCard(props: SourceCardProps): ReactElement {
  const { pluginId, namespace } = props;
  const fields = Object.entries(namespace);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base">{pluginId}</CardTitle>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">Empty namespace</p>
        ) : (
          <dl className="space-y-3">
            {fields.map(([field, value]) => (
              <div key={field} className="space-y-1">
                <dt className="font-mono text-xs text-muted-foreground">{field}</dt>
                <dd className="min-w-0 text-sm">
                  <JsonValue value={value} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
