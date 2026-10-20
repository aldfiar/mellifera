// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ApiError,
  LibraryDTO,
  SourceAdminSource,
  SourcePatchResponse,
  SourcePreviewResponse,
  SourcePreviewRow,
} from "@/lib/api";
import {
  deleteLibrarySource,
  getAdminSources,
  patchAdminSource,
  postSourcePreview,
  putLibrarySource,
} from "@/lib/api";
import { useLibraries } from "@/lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Sources — the Sources admin surface (/admin/sources, plugin-title-enrichment
// 6.2) beside the Collections panel (/admin). One row per loaded plugin:
// display name, health chip, serial-chain positions, and the per-module /
// per-Collection effective-enabled state, each togglable.
//
// Wire contract (source_admin.go, mirrored verbatim — INV-verbatim-payload):
//  - a module toggle PATCHes /admin/sources/{plugin_id}; the queued count of
//    the enable renders inline ("re-enriching N items"); a disable answers
//    queued=0 and wakes nothing, so it renders NO wake notice.
//  - a Collection-scope toggle writes the library gate route: OFF clears the
//    override (DELETE — fall back to the module-scope resolution), ON writes
//    the explicit enable (PUT {enabled:true}). Both answer 204.
//  - the composition preview POSTs the hypothetical gate vector to
//    /admin/sources/preview and renders the served before/after pairs
//    symmetrically, marking no_data rows. The preview is a pure read — the
//    surface sends no gate write in doing so.
//
// INV-no-client-gates: the surface consumes the served `effective` verdicts
// and `chains` presentation pairs verbatim; it NEVER resolves gates
// client-side (the only sanctioned mirror is naming.ts's fixture-pinned walk,
// which this page does not need — the preview names arrive composed). After
// every toggle the ["admin-sources"] query is invalidated so the rendered
// verdicts re-read from the server, never from the write's body.
// INV-no-mutation-retry: every mutation is retry:0 — canonical errors surface
// inline and the operator re-clicks.
export default function Sources(): ReactElement {
  const sources = useQuery({
    queryKey: ["admin-sources"],
    queryFn: () => getAdminSources(true),
  });
  const libraries = useLibraries();

  const listErr: ApiError | null =
    sources.error instanceof Error ? (sources.error as ApiError) : null;

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-4" aria-label="Admin">
        <AdminTab to="/admin" label="Collections" />
        <AdminTab to="/admin/sources" label="Sources" />
      </nav>

      <section>
        <h2 className="mb-3 text-base font-semibold">Metadata sources</h2>
        {sources.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading sources…</p>
        ) : listErr ? (
          <Alert variant="destructive">
            <AlertTitle>{listErr.code}</AlertTitle>
            <AlertDescription>{listErr.message}</AlertDescription>
          </Alert>
        ) : (
          <SourcesTable
            sources={sources.data?.sources ?? []}
            libraries={libraries.data?.items ?? []}
          />
        )}
      </section>
    </div>
  );
}

// AdminTab — the two admin surfaces side by side; the active one highlighted.
function AdminTab(props: { to: string; label: string }): ReactElement {
  return (
    <NavLink
      to={props.to}
      end={props.to === "/admin"}
      className={({ isActive }) =>
        cn(
          "text-sm",
          isActive
            ? "font-semibold underline underline-offset-4"
            : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {props.label}
    </NavLink>
  );
}

// healthVariant — the chip tone per served health state (handlers.go
// PluginHealth.state). Unknown states render outline, never a crash.
function healthVariant(state: string): "secondary" | "destructive" | "outline" {
  if (state === "serving") {
    return "secondary";
  }
  if (state === "degraded" || state === "not_serving" || state === "failed") {
    return "destructive";
  }
  return "outline";
}

// SourcesTable — the per-plugin rows plus the composition preview (mounted
// only once both reads have landed, so the preview selects initialize from
// real rows).
function SourcesTable(props: {
  sources: SourceAdminSource[];
  libraries: LibraryDTO[];
}): ReactElement {
  const { sources, libraries } = props;

  return (
    <div className="flex flex-col gap-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead className="w-28">Health</TableHead>
            <TableHead className="w-40">Chain</TableHead>
            <TableHead>Gates</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No plugins loaded
              </TableCell>
            </TableRow>
          ) : (
            sources.map((src) => (
              <SourceRow key={src.plugin_id} src={src} libraries={libraries} />
            ))
          )}
        </TableBody>
      </Table>

      {sources.length > 0 && libraries.length > 0 ? (
        <PreviewPanel sources={sources} libraries={libraries} />
      ) : null}
    </div>
  );
}

// SourceRow — one loaded plugin (the served aggregate verbatim): name +
// description + the on-demand title tally, the health chip, the chain
// positions, and the gate toggles (one per module verdict, one per
// Collection verdict the plugin resolves for).
function SourceRow(props: {
  src: SourceAdminSource;
  libraries: LibraryDTO[];
}): ReactElement {
  const { src, libraries } = props;

  return (
    <TableRow data-plugin-id={src.plugin_id}>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{src.name}</span>
          {src.description ? (
            <span className="text-xs text-muted-foreground">{src.description}</span>
          ) : null}
          {src.title_counts ? (
            <span className="text-xs text-muted-foreground">
              {src.title_counts.items} items · {src.title_counts.series} series
              titled
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {src.health ? (
          <Badge variant={healthVariant(src.health.state)}>{src.health.state}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col text-xs">
          {src.chains.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            src.chains.map((c) => (
              <span key={c.module_id}>
                {c.module_id} · #{c.position}
              </span>
            ))
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {Object.entries(src.effective.modules).map(([moduleId, enabled]) => (
            <GateToggle
              key={`m-${moduleId}`}
              scope="module"
              pluginId={src.plugin_id}
              scopeId={moduleId}
              enabled={enabled}
            />
          ))}
          {libraries.map((lib) => {
            const enabled = src.effective.libraries[String(lib.id)];
            if (enabled === undefined) {
              return null; // the plugin resolves no verdict for this library
            }
            return (
              <GateToggle
                key={`l-${lib.id}`}
                scope="library"
                pluginId={src.plugin_id}
                scopeId={String(lib.id)}
                label={lib.display_name}
                enabled={enabled}
              />
            );
          })}
        </div>
      </TableCell>
    </TableRow>
  );
}

// GateToggle — one effective-enabled verdict and its toggle. The write
// follows the scope: module → PATCH /admin/sources/{plugin_id} (the queued
// count of an enable renders inline; a disable's queued=0 renders NO wake
// notice); library → OFF DELETEs the row (clear-to-inherit), ON PUTs the
// explicit enable. Success invalidates ["admin-sources"] so the verdict
// re-reads from the server. Errors surface inline, retry:0 — no auto-retry.
function GateToggle(props: {
  scope: "module" | "library";
  pluginId: string;
  scopeId: string;
  label?: string;
  enabled: boolean;
}): ReactElement {
  const qc = useQueryClient();
  const gate = useMutation<SourcePatchResponse | null, ApiError, boolean>({
    mutationFn: async (next: boolean) => {
      if (props.scope === "module") {
        return patchAdminSource(props.pluginId, next);
      }
      if (next) {
        await putLibrarySource(Number(props.scopeId), props.pluginId, true);
      } else {
        await deleteLibrarySource(Number(props.scopeId), props.pluginId);
      }
      return null;
    },
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-sources"] });
    },
  });

  const err: ApiError | null =
    gate.error instanceof Error ? (gate.error as ApiError) : null;
  // A disable wakes nothing (queued=0) — only a real enable count renders.
  const wake = props.scope === "module" && (gate.data?.queued ?? 0) > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {props.scope === "module" ? props.scopeId : (props.label ?? props.scopeId)}
        </span>
        <span
          className={cn(
            "text-xs",
            props.enabled ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {props.enabled ? "on" : "off"}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-label={`${props.scope} ${props.scopeId} ${props.pluginId}`}
          disabled={gate.isPending}
          onClick={() => gate.mutate(!props.enabled)}
        >
          {props.enabled ? "Disable" : "Enable"}
        </Button>
      </div>
      {wake ? (
        <span className="text-xs">re-enriching {gate.data?.queued} items</span>
      ) : null}
      {err ? (
        <Alert variant="destructive" className="py-2">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

// PreviewPanel — the composition preview: pick a Collection, a source, and
// the hypothetical state, then POST {library_id, gates:{plugin_id: state}}.
// The response renders each row's before and after names side by side with
// no_data rows marked; nothing is written anywhere (INV from the spec — the
// surface sends no gate write in doing so).
function PreviewPanel(props: {
  sources: SourceAdminSource[];
  libraries: LibraryDTO[];
}): ReactElement {
  const { sources, libraries } = props;
  const [libraryId, setLibraryId] = useState<number>(libraries[0]?.id ?? 0);
  const [pluginId, setPluginId] = useState<string>(sources[0]?.plugin_id ?? "");
  const [enabled, setEnabled] = useState<boolean>(false);

  const preview = useMutation<SourcePreviewResponse, ApiError, void>({
    mutationFn: () =>
      postSourcePreview({ library_id: libraryId, gates: { [pluginId]: enabled } }),
    retry: 0,
  });
  const err: ApiError | null =
    preview.error instanceof Error ? (preview.error as ApiError) : null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Composition preview</h3>
      <p className="text-xs text-muted-foreground">
        Hypothetically flip one source&apos;s gate and see the names recomposed —
        nothing is written.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(libraryId)}
          onValueChange={(v: string) => setLibraryId(Number(v))}
        >
          <SelectTrigger className="w-48" aria-label="Preview collection">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {libraries.map((lib) => (
              <SelectItem key={lib.id} value={String(lib.id)}>
                {lib.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={pluginId} onValueChange={setPluginId}>
          <SelectTrigger className="w-48" aria-label="Preview source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sources.map((src) => (
              <SelectItem key={src.plugin_id} value={src.plugin_id}>
                {src.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={enabled ? "enabled" : "disabled"}
          onValueChange={(v: string) => setEnabled(v === "enabled")}
        >
          <SelectTrigger className="w-36" aria-label="Preview target">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">disabled</SelectItem>
            <SelectItem value="enabled">enabled</SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          disabled={preview.isPending || libraryId === 0 || pluginId === ""}
          onClick={() => preview.mutate()}
        >
          {preview.isPending ? "Composing…" : "Preview"}
        </Button>
      </div>

      {err ? (
        <Alert variant="destructive">
          <AlertTitle>{err.code}</AlertTitle>
          <AlertDescription>{err.message}</AlertDescription>
        </Alert>
      ) : null}

      {preview.data ? <PreviewTable data={preview.data} /> : null}
    </section>
  );
}

// PreviewTable — the served before/after pairs, one row per composed row
// (before[i] and after[i] are the same row — symmetric by construction).
// Each cell renders the pass's composed name; a no_data pass wears the
// marker. The names render VERBATIM as served — the SPA resolves nothing.
function PreviewTable(props: { data: SourcePreviewResponse }): ReactElement {
  const { data } = props;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Row</TableHead>
          <TableHead>Before</TableHead>
          <TableHead>After</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.before.map((row, i) => {
          const afterRow: SourcePreviewRow | undefined = data.after[i];
          return (
            <TableRow key={row.item_id}>
              <TableCell className="font-mono text-xs">{row.item_id}</TableCell>
              <TableCell>
                <NameCell row={row} />
              </TableCell>
              <TableCell>
                {afterRow ? (
                  <NameCell row={afterRow} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// NameCell — one pass's composed name plus its no_data marker.
function NameCell(props: { row: SourcePreviewRow }): ReactElement {
  return (
    <span className="flex items-center gap-2">
      <span>{props.row.name === "" ? "—" : props.row.name}</span>
      {props.row.no_data ? (
        <Badge variant="outline" className="text-muted-foreground">
          no data
        </Badge>
      ) : null}
    </span>
  );
}
