// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import { Badge } from "@/components/ui/badge";
import type { StageEntry } from "@/lib/document";

// StagesProgress — the `_stages` pipeline trail, in array order (the pipeline
// appends; order IS the progress). Each entry renders its stage/plugin/status/
// window verbatim; `error` renders only when present (failed stages). A failed
// status gets the destructive badge variant; timestamps pass through untouched
// (RFC3339 strings — no date reformatting).

export interface StagesProgressProps {
  stages: StageEntry[];
}

export function StagesProgress(props: StagesProgressProps): ReactElement {
  const { stages } = props;

  if (stages.length === 0) {
    return <p className="text-sm text-muted-foreground">No pipeline stages recorded</p>;
  }

  return (
    <ol className="space-y-3">
      {stages.map((stage, i) => (
        <li key={i} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={stage.status === "failed" ? "destructive" : "secondary"}>
              {stage.status}
            </Badge>
            <span className="font-mono">{stage.plugin_id}</span>
            <span className="text-muted-foreground">{stage.stage}</span>
            <span className="text-muted-foreground">→ {stage.advanced_to}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stage.started_at} — {stage.finished_at}
          </p>
          {stage.error !== undefined && (
            <p className="mt-1 text-sm text-destructive">{stage.error}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
