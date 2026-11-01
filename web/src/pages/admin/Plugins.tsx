// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type {
  ApiError,
  PluginAdminBinding,
  PluginAdminPlugin,
} from "@/lib/api";
import { getAdminPluginLogs, getAdminPlugins } from "@/lib/api";
import AdminTabs from "@/pages/admin/AdminTabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Plugins — the Plugins admin surface (/admin/plugins, plugin-admin-surfaces)
// beside Collections (/admin) and Sources (/admin/sources). One row per loaded
// plugin in boot order: display name + description, capability chips, the
// colored STATUS (green/red/gray), and its config bindings rendered
// READ-ONLY in human words.
//
// Wire contract (plugin_admin.go, mirrored verbatim — INV-verbatim-payload):
//  - the status cell consumes the SERVED health state and the SERVED module
//    verdicts — the surface never resolves gates client-side. The operator
//    color contract (user-locked 2026-10-21):
//      green  Working    — serving AND effectively enabled somewhere (a
//                         served module verdict is true, or a scanner
//                         binding exists — scanners have no gate)
//      red    Failed     — the subprocess failed / stopped serving /
//                         degraded, the served message inline
//      gray   Disabled   — serving but every served verdict mutes it
//            Not reporting — no health report served ("—")
//  - the config bindings render the served rows as WORDS — module, kind,
//    priority, the EFFECTIVE enablement word (the served module verdict
//    when one exists, else the binding's own enabled flag) colored the same
//    green/gray, auth mode when it is not NONE, and the display fields
//    joined — with the raw options JSON folded behind a disclosure,
//    pretty-printed exactly as served (raw JSON on the wire, never
//    interpreted here).
//  - the last-logs view fetches GET /admin/plugins/{plugin_id}/logs ON
//    DEMAND per plugin when its view opens — never eagerly for every plugin
//    — and renders the bounded tail oldest-first (in-memory: a server
//    restart empties it, stated in the panel copy).
//
//  - the failures cell («Ошибки», client-relayed-fetch D10) renders the
//    SERVED per-plugin count verbatim — 0 muted with no link (an empty
//    ledger is the normal state), any positive count a click-through to
//    the plugin's failures page (/admin/plugins/:pluginId/failures).
//
// INV-no-writes: the page has no write affordance anywhere — Sources keeps
// the gate toggles. INV-no-mutation-retry: every read is retry:0 — canonical
// errors surface inline and the operator re-clicks.
export default function Plugins(): ReactElement {
  const plugins = useQuery({
    queryKey: ["admin-plugins"],
    queryFn: getAdminPlugins,
    retry: 0,
  });

  const listErr: ApiError | null =
    plugins.error instanceof Error ? (plugins.error as ApiError) : null;

  return (
    <div className="flex flex-col gap-6">
      <AdminTabs />

      <section>
        <h2 className="mb-3 text-base font-semibold">Loaded plugins</h2>
        {plugins.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading plugins…</p>
        ) : listErr ? (
          <Alert variant="destructive">
            <AlertTitle>{listErr.code}</AlertTitle>
            <AlertDescription>{listErr.message}</AlertDescription>
          </Alert>
        ) : (
          <PluginsTable plugins={plugins.data?.plugins ?? []} />
        )}
      </section>
    </div>
  );
}

// PluginsTable — the per-plugin rows; `logsOpen` names the one plugin whose
// last-logs view is expanded (on demand, one at a time).
function PluginsTable(props: { plugins: PluginAdminPlugin[] }): ReactElement {
  const [logsOpen, setLogsOpen] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Plugin</TableHead>
          <TableHead className="w-40">Status</TableHead>
          <TableHead className="w-36">Capabilities</TableHead>
          <TableHead>Config</TableHead>
          <TableHead className="w-20">Ошибки</TableHead>
          <TableHead className="w-28">Logs</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.plugins.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground">
              No plugins loaded
            </TableCell>
          </TableRow>
        ) : (
          props.plugins.map((p) => (
            <PluginRow
              key={p.plugin_id}
              plugin={p}
              logsOpen={logsOpen === p.plugin_id}
              onToggleLogs={() =>
                setLogsOpen((cur) => (cur === p.plugin_id ? null : p.plugin_id))
              }
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}

// PluginRow — one loaded plugin (the served aggregate verbatim), plus the
// on-demand last-logs view as an expanded full-width row beneath it.
function PluginRow(props: {
  plugin: PluginAdminPlugin;
  logsOpen: boolean;
  onToggleLogs: () => void;
}): ReactElement {
  const { plugin: p } = props;

  return (
    <>
      <TableRow data-plugin-id={p.plugin_id}>
        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium">{p.name}</span>
            {p.description ? (
              <span className="text-xs text-muted-foreground">{p.description}</span>
            ) : null}
          </div>
        </TableCell>
        <TableCell>
          <StatusCell plugin={p} />
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {p.capabilities.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              p.capabilities.map((cap) => (
                <Badge key={cap} variant="outline">
                  {capabilityWord(cap)}
                </Badge>
              ))
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-2">
            {p.config.length === 0 ? (
              <span className="text-xs text-muted-foreground">No bindings</span>
            ) : (
              p.config.map((b) => (
                <Binding
                  key={`${b.module_id}-${b.kind}`}
                  binding={b}
                  verdict={p.effective?.modules?.[b.module_id]}
                />
              ))
            )}
          </div>
        </TableCell>
        <TableCell>
          <FailuresCell plugin={p} />
        </TableCell>
        <TableCell>
          <Button
            size="sm"
            variant="outline"
            aria-label={`last logs ${p.plugin_id}`}
            aria-expanded={props.logsOpen}
            onClick={props.onToggleLogs}
          >
            {props.logsOpen ? "Hide logs" : "Last logs"}
          </Button>
        </TableCell>
      </TableRow>
      {props.logsOpen ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6}>
            <LogsPanel pluginId={p.plugin_id} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

// StatusCell — the operator's color contract (user-locked 2026-10-21):
// green Working / red Failed / gray Disabled-or-Not-reporting, computed ONLY
// from the served health state and served module verdicts (never resolved
// client-side). The dot is aria-hidden decoration; the word carries the
// state. `data-status` exposes the tone for tests; the title carries the
// operator extras (state · restarts · checked-at) without cluttering the
// cell.
function StatusCell(props: { plugin: PluginAdminPlugin }): ReactElement {
  const { health, effective } = props.plugin;
  const verdicts = Object.values(effective?.modules ?? {});
  const scanner = props.plugin.config.some((b) => b.kind === "scanner");

  let tone: "ok" | "fail" | "off";
  let label: string;
  let message: string | undefined;
  if (health === undefined) {
    tone = "off";
    label = "Not reporting";
  } else if (health.state === "failed" || health.state === "not_serving" || health.state === "degraded") {
    tone = "fail";
    label = "Failed";
    message = health.message;
  } else if (health.state === "serving") {
    if (verdicts.some(Boolean) || scanner) {
      tone = "ok";
      label = "Working";
    } else {
      tone = "off";
      label = "Disabled";
    }
  } else {
    tone = "off";
    label = health.state;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <span
        data-status={tone}
        className={
          tone === "ok"
            ? "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600"
            : tone === "fail"
              ? "inline-flex items-center gap-1.5 text-xs font-medium text-destructive"
              : "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        }
        title={
          health
            ? `state: ${health.state} · restarts: ${health.restarts} · checked ${health.checked_at}`
            : "no health report served"
        }
      >
        <span
          aria-hidden
          className={
            tone === "ok"
              ? "h-2 w-2 rounded-full bg-emerald-500"
              : tone === "fail"
                ? "h-2 w-2 rounded-full bg-destructive"
                : "h-2 w-2 rounded-full bg-muted-foreground/40"
          }
        />
        {label}
      </span>
      {message ? (
        <span className="text-xs text-muted-foreground">{message}</span>
      ) : null}
    </div>
  );
}

// FailuresCell — the «Ошибки» column (client-relayed-fetch D10): the SERVED
// per-plugin failures count rendered verbatim — 0 muted with no link (an
// empty ledger is the normal state, not an error), any positive count a
// click-through to the plugin's failures page
// (/admin/plugins/:pluginId/failures — the drill-down surface). An absent
// field floors to 0: the server always serves the field, so absence means
// "no rows", never a type hole.
function FailuresCell(props: { plugin: PluginAdminPlugin }): ReactElement {
  const count = props.plugin.failures ?? 0;
  if (count <= 0) {
    return <span className="text-sm text-muted-foreground">{count}</span>;
  }
  return (
    <Link
      to={`/admin/plugins/${props.plugin.plugin_id}/failures`}
      className="text-sm font-medium underline underline-offset-4 hover:text-foreground"
    >
      {count}
    </Link>
  );
}

// capabilityWord — the served literal as a human word ("metadata_source" →
// "Metadata source"); unknown literals capitalize, never crash.
function capabilityWord(cap: string): string {
  const words: Record<string, string> = {
    scanner: "Scanner",
    metadata_source: "Metadata source",
    metadata: "Metadata",
  };
  return words[cap] ?? cap.charAt(0).toUpperCase() + cap.slice(1);
}

// kindWord — the binding-kind literal as a human word.
function kindWord(kind: string): string {
  const words: Record<string, string> = {
    scanner: "Scanner",
    metadata: "Metadata source",
  };
  return words[kind] ?? kind;
}

// Binding — one config binding row, read-only and in words: module, kind,
// priority, the EFFECTIVE enablement word (the served module verdict when
// one exists — the resolved gate — else the binding's own enabled flag),
// colored the same green/gray as the status; auth mode shows when it is not
// NONE; the display fields join into one muted line; the raw options JSON
// folds behind a disclosure, pretty-printed verbatim (INV-verbatim payload —
// the SPA still interprets nothing).
function Binding(props: {
  binding: PluginAdminBinding;
  verdict?: boolean;
}): ReactElement {
  const b = props.binding;
  const on = props.verdict !== undefined ? props.verdict : b.enabled;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs">{b.module_id}</span>
        <span className="text-xs text-muted-foreground">{kindWord(b.kind)}</span>
        {b.priority !== undefined ? (
          <span className="text-xs text-muted-foreground">#{b.priority}</span>
        ) : null}
        {on !== undefined ? (
          <span
            className={
              on
                ? "text-xs font-medium text-emerald-600"
                : "text-xs font-medium text-muted-foreground"
            }
          >
            {on ? "Enabled" : "Disabled"}
          </span>
        ) : null}
        {b.auth_mode && b.auth_mode !== "NONE" ? (
          <span className="text-xs text-muted-foreground">
            auth: {b.auth_mode}
          </span>
        ) : null}
      </div>
      {b.display_fields !== undefined && b.display_fields !== null ? (
        Array.isArray(b.display_fields) &&
        b.display_fields.length > 0 &&
        b.display_fields.every((f) => typeof f === "string") ? (
          <span className="text-xs text-muted-foreground">
            fields: {(b.display_fields as string[]).join(", ")}
          </span>
        ) : (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              display fields
            </summary>
            <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
              {JSON.stringify(b.display_fields, null, 2)}
            </pre>
          </details>
        )
      ) : null}
      {b.options !== undefined && b.options !== null ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            options
          </summary>
          <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
            {JSON.stringify(b.options, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

// LogsPanel — the on-demand last-logs view: fetched only when mounted (the
// expanded row mounts it), oldest line first as served. The tail is
// host-captured and in-memory — a server restart empties it (stated copy).
// Canonical errors surface inline, retry:0.
function LogsPanel(props: { pluginId: string }): ReactElement {
  const logs = useQuery({
    queryKey: ["admin-plugin-logs", props.pluginId],
    queryFn: () => getAdminPluginLogs(props.pluginId),
    retry: 0,
  });
  const err: ApiError | null =
    logs.error instanceof Error ? (logs.error as ApiError) : null;

  return (
    <div className="flex flex-col gap-2" data-logs-for={props.pluginId}>
      <div className="flex items-baseline gap-3">
        <h3 className="text-sm font-semibold">Last logs</h3>
        <span className="text-xs text-muted-foreground">
          in-memory tail, oldest first — a server restart empties it
        </span>
      </div>
      {logs.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading logs…</p>
      ) : err ? (
        <Alert variant="destructive" className="py-2">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : (logs.data?.lines.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">No captured output.</p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-xs">
          {logs.data?.lines.join("\n")}
        </pre>
      )}
    </div>
  );
}
