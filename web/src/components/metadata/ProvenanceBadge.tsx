// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import { Badge } from "@/components/ui/badge";
import type { ProvenanceEntry } from "@/lib/document";

// ProvenanceBadge — one `_provenance.<field_path>` audit entry: the field path
// as the badge plus the plugin/version/time/confidence/source trail. Optional
// fields render only when present; `confidence` renders verbatim (a parsed JS
// number — never rounded or locale-reformatted, INV-no-rounding).

export interface ProvenanceBadgeProps {
  fieldPath: string;
  entry: ProvenanceEntry;
}

export function ProvenanceBadge(props: ProvenanceBadgeProps): ReactElement {
  const { fieldPath, entry } = props;

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="outline" className="font-mono">
        {fieldPath}
      </Badge>
      <span>{entry.plugin_id}</span>
      {entry.plugin_version !== undefined && (
        <span className="text-muted-foreground">{entry.plugin_version}</span>
      )}
      {entry.fetched_at !== undefined && (
        <span className="text-muted-foreground">{entry.fetched_at}</span>
      )}
      {entry.confidence !== undefined && (
        <span className="font-mono text-muted-foreground">{entry.confidence}</span>
      )}
      {entry.source_url !== undefined && (
        <span className="break-all font-mono text-xs text-muted-foreground">
          {entry.source_url}
        </span>
      )}
    </li>
  );
}
