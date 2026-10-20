// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";

import type {
  ApiError,
  PluginAdminBinding,
  PluginAdminPlugin,
  PluginHealth,
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
// plugin in boot order: display name + description, capability chips, state
// chips, and its config bindings rendered READ-ONLY.
//
// Wire contract (plugin_admin.go, mirrored verbatim — INV-verbatim-payload):
//  - the state chips consume the SERVED health state (D5 presentation: the
//    served word for `serving` is "working"; `failed`/`not_serving` render
//    "errored" with the served message inline; anything else renders the
//    served word itself) plus one disabled chip per served module verdict
//    that mutes the plugin — the surface NEVER resolves gates client-side.
//  - the config bindings render the served rows verbatim — module, kind,
//    priority, enabled, auth mode, and the display_fields/options JSON
//    pretty-printed exactly as served (raw JSON on the wire, never
//    interpreted here).
//  - the last-logs view fetches GET /admin/plugins/{plugin_id}/logs ON
//    DEMAND per plugin when its view opens — never eagerly for every plugin
//    — and renders the bounded tail oldest-first (in-memory: a server
//    restart empties it, stated in the panel copy).
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
          <TableHead className="w-44">State</TableHead>
          <TableHead className="w-36">Capabilities</TableHead>
          <TableHead>Config</TableHead>
          <TableHead className="w-28">Logs</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.plugins.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground">
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
          <StateChips plugin={p} />
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {p.capabilities.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              p.capabilities.map((cap) => (
                <Badge key={cap} variant="outline">
                  {cap}
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
              p.config.map((b) => <Binding key={`${b.module_id}-${b.kind}`} binding={b} />)
            )}
          </div>
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
          <TableCell colSpan={5}>
            <LogsPanel pluginId={p.plugin_id} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

// StateChips — the served state, verbatim: the health chip (working /
// errored + the served message inline / the served word otherwise) plus one
// disabled chip per served module verdict muting the plugin. No health report
// → "—" (the plugin never reported); no verdicts → no disabled chips.
function StateChips(props: { plugin: PluginAdminPlugin }): ReactElement {
  const { health, effective } = props.plugin;
  const chip = health ? healthChip(health) : null;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        {chip ? (
          <Badge variant={chip.variant}>{chip.label}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {Object.entries(effective?.modules ?? {})
          .filter(([, enabled]) => !enabled)
          .map(([moduleId]) => (
            <Badge key={moduleId} variant="outline" className="text-muted-foreground">
              {moduleId} · disabled
            </Badge>
          ))}
      </div>
      {chip?.message ? (
        <span className="text-xs text-muted-foreground">{chip.message}</span>
      ) : null}
    </div>
  );
}

// healthChip — the D5 presentation of the served health state: `serving`
// renders "working"; `failed`/`not_serving` render "errored" carrying the
// served message; any other state renders the served word itself. Unknown
// states render outline, never a crash.
function healthChip(health: PluginHealth): {
  label: string;
  variant: "secondary" | "destructive" | "outline";
  message?: string;
} {
  if (health.state === "serving") {
    return { label: "working", variant: "secondary" };
  }
  if (health.state === "failed" || health.state === "not_serving") {
    return { label: "errored", variant: "destructive", message: health.message };
  }
  const variant = health.state === "degraded" ? "destructive" : "outline";
  return { label: health.state, variant };
}

// Binding — one config binding row, read-only: module, kind, and the
// metadata-only fields (priority, enabled, auth mode), then the served
// display_fields/options JSON pretty-printed VERBATIM — the SPA interprets
// nothing (INV4 posture: the raw config is rendered, never parsed for
// meaning).
function Binding(props: { binding: PluginAdminBinding }): ReactElement {
  const b = props.binding;

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs">{b.module_id}</span>
      <span className="text-xs text-muted-foreground">
        {b.kind}
        {b.priority !== undefined ? ` · #${b.priority}` : ""}
        {b.enabled !== undefined ? ` · ${b.enabled ? "enabled" : "disabled"}` : ""}
        {b.auth_mode ? ` · ${b.auth_mode}` : ""}
      </span>
      <JsonBlock label="display fields" value={b.display_fields} />
      <JsonBlock label="options" value={b.options} />
    </div>
  );
}

// JsonBlock — one served raw-JSON value pretty-printed verbatim; absent on
// the wire (omitempty) → nothing rendered.
function JsonBlock(props: { label: string; value: unknown }): ReactElement | null {
  if (props.value === undefined || props.value === null) {
    return null;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
        {JSON.stringify(props.value, null, 2)}
      </pre>
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
