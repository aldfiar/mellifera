// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import type { ApiError, PluginHealth } from "@/lib/api";
import { useAdminStatus } from "@/lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Status — the admin Status page (AC-4). Polls GET /api/v1/admin/status on a
// 5s refetch interval (set in T05 `useAdminStatus`) so the operator sees the
// enrich queue drain (AC-3 Then: pending → in_flight → done) without manual
// refresh. Renders two blocks: the per-plugin health table and the enrich
// queue stats.
//
// INV-state-domain: plugin `state` is rendered verbatim from the Go enum
// {serving, degraded, not_serving, failed} (handlers.go:86 PluginHealth) — the
// Badge color maps from these; no invented states. INV-503-not-crash: a 503
// (status disabled — nil closure in adminStatus) is a first-class "Status
// unavailable" UI state, never a throw. INV-no-direct-fetch: this page uses
// ONLY `useAdminStatus`.

// Badge variant per Go plugin state (INV-state-domain). Unknown states fall
// back to the default Badge variant rather than crashing — but the four
// documented states are the only ones the server emits.
function stateVariant(state: string):
  | "default"
  | "secondary"
  | "destructive"
  | "outline" {
  switch (state) {
    case "serving":
      // green
      return "default";
    case "degraded":
      // amber (no amber variant in shadcn default — outline reads as neutral)
      return "outline";
    case "not_serving":
      // gray
      return "secondary";
    case "failed":
      // red
      return "destructive";
    default:
      return "outline";
  }
}

export default function Status(): ReactElement {
  const q = useAdminStatus();
  const err = q.error as ApiError | null;

  // 503 (status disabled) and the first-fetch error case render the explicit
  // "Status unavailable" state (B5). When we already have data, a transient
  // refetch error keeps the last-known data rendered (B7) — TanStack holds
  // stale data, so we only show the unavailable state when there is nothing
  // to display.
  if (q.isLoading && !q.data) {
    return <p className="text-sm text-muted-foreground">Loading status…</p>;
  }
  if (err && !q.data) {
    return (
      <Alert>
        <AlertTitle>Status unavailable</AlertTitle>
        <AlertDescription>
          The status endpoint is not available
          {err.status ? ` (HTTP ${err.status})` : ""}.
        </AlertDescription>
      </Alert>
    );
  }

  const status = q.data;

  return (
    <div className="flex flex-col gap-6">
      {err && q.data ? (
        // Transient refetch error while stale data is still shown (B7).
        <Alert variant="destructive">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>
            Last refresh failed; showing the last-known status.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Plugin health</CardTitle>
          <CardDescription>
            Liveness snapshot of base-scanner / tv-parser / image-enricher.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PluginTable plugins={status?.plugins ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrich queue</CardTitle>
          <CardDescription>
            Async enrichment queue (B1) — drains as scanned items progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnrichGrid enrich={status?.enrich} />
        </CardContent>
      </Card>
    </div>
  );
}

function PluginTable(props: { plugins: PluginHealth[] }): ReactElement {
  const { plugins } = props;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Plugin</TableHead>
          <TableHead className="w-32">State</TableHead>
          <TableHead className="w-24">Restarts</TableHead>
          <TableHead className="w-56">Last checked</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {plugins.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground">
              No plugin health reported
            </TableCell>
          </TableRow>
        ) : (
          plugins.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono">{p.id}</TableCell>
              <TableCell>
                <Badge variant={stateVariant(p.state)}>{p.state}</Badge>
              </TableCell>
              <TableCell>{p.restarts}</TableCell>
              <TableCell className="font-mono text-xs">
                {p.checked_at ? p.checked_at : "—"}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function EnrichGrid(props: {
  enrich?:
    | { pending: number; in_flight: number; done: number; failed: number }
    | undefined;
}): ReactElement {
  const e = props.enrich;
  const cells: { label: string; value: number }[] = [
    { label: "Pending", value: e?.pending ?? 0 },
    { label: "In flight", value: e?.in_flight ?? 0 },
    { label: "Done", value: e?.done ?? 0 },
    { label: "Failed", value: e?.failed ?? 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cells.map((c) => (
        <div
          key={c.label}
          className="rounded-md border bg-muted/30 p-4 text-center"
        >
          <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}
