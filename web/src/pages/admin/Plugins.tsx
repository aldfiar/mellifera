// SPDX-License-Identifier: Apache-2.0
import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type {
  ApiError,
  PluginAdminBinding,
  PluginAdminPlugin,
} from "@/lib/api";
import { getAdminPluginLogs, getAdminPlugins } from "@/lib/api";
import {
  BindingOptionsEditor,
  OPTION_WORDS,
} from "@/components/admin/BindingOptionsEditor";
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
// colored STATUS (green/red/gray), and its config bindings rendered in
// human words (read-only except the per-binding options editor — the
// INV-no-writes note below).
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
//  - a metadata binding whose served required_secrets verdicts carry at
//    least one provided:false secret renders the destructive «Требует
//    настройки» badge; all-provided verdicts and absent verdicts (no
//    declarations — scanner rows never carry the field) render none.
//  - the options words layer runs on METADATA bindings only: the known-key
//    presentation vocabulary (language → «Язык») renders served values
//    verbatim for string-valued entries; non-string values and unknown keys
//    stay behind the raw-JSON disclosure untouched. Scanner rows keep
//    today's disclosure-only render. INV-verbatim-payload holds — the SPA
//    interprets no config semantics.
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
// INV-no-writes (amended deliberately, plugin-options-ui design D1): the
// page still resolves nothing client-side and now carries exactly ONE
// sanctioned write — the per-binding options editor (BindingOptionsEditor,
// mounted on METADATA bindings only; scanner bindings keep no edit
// affordance — the endpoint refuses them, design D5). Everything else stays
// read-only (Sources keeps the gate toggles). The editor's mutation is
// retry:0 and its success invalidates ["admin-plugins"] so verdicts and
// badges re-read from the server — never from the write's body (the Sources
// GateToggle law). INV-no-mutation-retry: every read is retry:0 — canonical
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
                  pluginId={p.plugin_id}
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

// OPTION_WORDS — the known-key presentation vocabulary (plugin-options-ui
// D4), imported from the editor component: ONE vocabulary, one home (the
// GATE-2 FLAG-1 dedup — the words layer and the editor's editable set must
// never drift). Keys a plugin actually produces render as words on metadata
// bindings, values verbatim; everything else stays behind the raw
// disclosure. The shipped vocabulary is `language` — the one key with a
// live producer (the tmdb bindings' options); it grows only when a plugin
// actually declares a key (poster_dir was surveyed and dropped — no live
// producer).

// optionWords — the metadata bindings' words entries: [label, served value]
// pairs for every recognized key whose served value is a string (the live
// include_image_types array and any unknown key stay behind the raw
// disclosure). Null when nothing presents — the binding renders
// disclosure-only. `options` travels as raw JSON (typed `unknown`), so the
// shape is checked before the entries are read.
function optionWords(options: unknown): [string, string][] | null {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    return null;
  }
  const words: [string, string][] = [];
  for (const [key, value] of Object.entries(options)) {
    const label = OPTION_WORDS[key];
    if (label !== undefined && typeof value === "string") {
      words.push([label, value]);
    }
  }
  return words.length > 0 ? words : null;
}

// Binding — one config binding row, in words: module, kind, priority, the
// EFFECTIVE enablement word (the served module verdict when one exists — the
// resolved gate — else the binding's own enabled flag), colored the same
// green/gray as the status; auth mode shows when it is not NONE; the display
// fields join into one muted line; the raw options JSON folds behind a
// disclosure, pretty-printed verbatim (INV-verbatim payload — the SPA still
// interprets nothing). A metadata binding with at least one unprovided
// secret (a served required_secrets verdict reading false) renders the
// destructive «Требует настройки» badge; on metadata bindings the words
// layer presents recognized string-valued options inline above the
// disclosure — scanner rows stay disclosure-only.
//
// The Edit affordance (plugin-options-ui 2.3, design D1/D5) rides METADATA
// bindings only: the button is the returnFocusRef target of the
// BindingOptionsEditor it opens — the page's ONE sanctioned write. Scanner
// bindings carry neither button nor editor (the endpoint refuses them).
// The overlay state is parent-owned per binding: onClose flips `editing`,
// so a closed editor is dialog REMOVAL, never a static-open shell.
function Binding(props: {
  binding: PluginAdminBinding;
  verdict?: boolean;
  pluginId: string;
}): ReactElement {
  const b = props.binding;
  const on = props.verdict !== undefined ? props.verdict : b.enabled;
  const needsConfig =
    b.kind === "metadata" &&
    Object.values(b.required_secrets ?? {}).some((provided) => !provided);
  const words = b.kind === "metadata" ? optionWords(b.options) : null;
  const editable = b.kind === "metadata";
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs">{b.module_id}</span>
        <span className="text-xs text-muted-foreground">{kindWord(b.kind)}</span>
        {needsConfig ? (
          <Badge variant="destructive">Требует настройки</Badge>
        ) : null}
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
        {editable ? (
          <Button
            ref={editRef}
            size="sm"
            variant="outline"
            className="ml-auto h-6 px-2 text-xs"
            aria-label={`options ${b.module_id}`}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
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
      {words ? (
        <span className="text-xs" data-option-words>
          {words.map(([label, value]) => (
            <span key={label} className="mr-2">
              {label}: {value}
            </span>
          ))}
        </span>
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
      {editable ? (
        <BindingOptionsEditor
          moduleId={b.module_id}
          pluginId={props.pluginId}
          binding={b}
          open={editing}
          onClose={() => setEditing(false)}
          returnFocusRef={editRef}
        />
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
