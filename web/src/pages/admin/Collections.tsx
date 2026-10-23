// SPDX-License-Identifier: Apache-2.0
import type { FormEvent, ReactElement } from "react";
import { useState } from "react";

import type {
  ApiError,
  CreateLibraryRequest,
  LibraryDTO,
  ScanResponse,
  UpdateLibraryRequest,
} from "@/lib/api";
import {
  useCreateLibrary,
  useDeleteLibrary,
  useLibraries,
  useLibrarySummary,
  useScanLibrary,
  useUpdateLibrary,
} from "@/lib/queries";
import AdminTabs from "@/pages/admin/AdminTabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// Collections — the admin panel (/admin): collections management
// (web-ui-phase-3 group 6). Evolved from the phase-2 Libraries page; the
// plugin/enrich Status section is GONE (the plugin-health endpoint remains
// available at the API layer, unused here).
//
// Three surfaces:
//  - the collections table: name + description, pastel type badge, root folder
//    (monospace), Items/Updated from GET /libraries/{id}/summary, per-row Scan
//    (result inline on the scanned row only), Edit, and Delete (two-step
//    inline confirm — Confirm delete/No — hitting DELETE /libraries/{id});
//    the header row is
//    position:sticky so it stays visible while 20+ rows scroll
//    (.collections-scroll in index.css owns the scroll container).
//  - the add-collection form: type, name, description, root folder POSTing
//    {module_id, root_path, display_name, description} verbatim to
//    POST /api/v1/libraries (Go createLibraryRequest, handlers.go:33-38).
//  - the edit overlay per row: Name/Description inputs + read-only Type and
//    root folder with the identity warning, PATCHing
//    {display_name, description} to PATCH /api/v1/libraries/{id}; canonical
//    400 (immutable-field attempt) / 404 (unknown) errors surface inline,
//    success closes the overlay and re-fetches the table (["libraries"]
//    invalidation in useUpdateLibrary).
//
// INV-verbatim-payload: the create POST body is exactly { module_id, root_path,
// display_name, description }; the PATCH body carries only the editable
// fields (UpdateLibraryRequest omits root_path/module_id so the client cannot
// even build an immutable-field PATCH — the server would 400 it).
// INV-no-direct-fetch: this page uses ONLY the query hooks in lib/queries.ts.
// INV-scan-not-retried / INV-patch-not-retried: mutations are retry:0 — the
// operator re-clicks on failure (no auto-retry on a 400/404).
// INV-per-row-state: scan result/error are rendered only on the row whose id
// matches scan.variables / scan.data.library_id.
//
// Network paths: NFS/network roots MUST be OS-mounted (local or NFS); the Go
// process reads them like local paths (no SMB/HTTP fetch). Documented inline.
//
// Module types: tv (one card per file), image, and serial (one card per
// series directory — grouped episodes, the /collections serial body). The
// module registry owns the wire values; this list mirrors the shipped
// modules (TypeBadge accepts the same set plus the badge-other fallback).
type ModuleId = "tv" | "image" | "serial";

// MODULE_OPTIONS — the create-form type options, id ASC like every module
// listing. serial is the serials library: one directory = one series.
const MODULE_OPTIONS: ReadonlyArray<{ id: ModuleId; hint: string }> = [
  { id: "tv", hint: "one card per file" },
  { id: "image", hint: "photos" },
  { id: "serial", hint: "one card per series" },
];

export default function Collections(): ReactElement {
  const { data, isLoading, error } = useLibraries();
  const create = useCreateLibrary();
  const scan = useScanLibrary();

  // The row being edited (overlay open when non-null).
  const [editing, setEditing] = useState<LibraryDTO | null>(null);

  const [moduleId, setModuleId] = useState<ModuleId>("tv");
  const [rootPath, setRootPath] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");

  function onAdd(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const req: CreateLibraryRequest = {
      module_id: moduleId,
      root_path: rootPath.trim(),
      display_name: displayName.trim(),
      description: description.trim(),
    };
    create.mutate(req, {
      // The new row appears via the ["libraries"] invalidation; clear the
      // form only when the create actually landed.
      onSuccess: () => {
        setRootPath("");
        setDisplayName("");
        setDescription("");
      },
    });
  }

  const createErr: ApiError | null =
    create.error instanceof Error ? (create.error as ApiError) : null;

  return (
    <div className="flex flex-col gap-6">
      <AdminTabs />

      <section>
        <h2 className="mb-3 text-base font-semibold">Collections</h2>
        <CollectionsTable
          isLoading={isLoading}
          listError={error instanceof Error ? (error as ApiError) : null}
          items={data?.items ?? []}
          scan={scan}
          onEdit={setEditing}
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Add collection</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onAdd}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="coll-module">Type</Label>
                <Select
                  value={moduleId}
                  onValueChange={(v: string) =>
                    MODULE_OPTIONS.some((m) => m.id === v)
                      ? setModuleId(v as ModuleId)
                      : undefined
                  }
                >
                  <SelectTrigger id="coll-module">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODULE_OPTIONS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id} — {m.hint}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="coll-name">Name</Label>
                <Input
                  id="coll-name"
                  name="coll-name"
                  placeholder="TV"
                  autoComplete="off"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="coll-description">Description</Label>
                <Input
                  id="coll-description"
                  name="coll-description"
                  placeholder="Seasonal shows"
                  autoComplete="off"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="coll-root">Root folder</Label>
                <Input
                  id="coll-root"
                  name="coll-root"
                  placeholder="/media/tv"
                  autoComplete="off"
                  value={rootPath}
                  onChange={(e) => setRootPath(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Absolute path, OS-mounted. Network roots must be mounted
                  locally (e.g. NFS) — the server reads them like local paths.
                </p>
              </div>

              {createErr ? (
                <Alert variant="destructive">
                  <AlertTitle>{createErr.code}</AlertTitle>
                  <AlertDescription>
                    {createErr.message}
                    {createErr.retryable ? " — you may retry." : ""}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Adding…" : "Add collection"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {editing ? <EditOverlay lib={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

// EditOverlay — the per-row edit dialog. The form itself is the SHARED
// EditLibraryForm (ui-management pass 3): the same component the collection
// Manage overlay's Edit library section embeds. The admin overlay's own
// contract is unchanged: success closes the overlay (onSaved = onClose — the
// table re-fetch comes from useUpdateLibrary's invalidations), a canonical
// error renders inline and the overlay STAYS OPEN.
function EditOverlay(props: { lib: LibraryDTO; onClose: () => void }): ReactElement {
  const { lib, onClose } = props;
  return (
    <div className="overlay-backdrop" role="dialog" aria-modal="true" aria-label={`Edit ${lib.display_name}`}>
      <div className="overlay-card">
        <h3 className="mb-4 text-base font-semibold">Edit collection</h3>
        <EditLibraryForm lib={lib} onSaved={onClose} onCancel={onClose} />
      </div>
    </div>
  );
}

// EditLibraryForm — the SHARED edit-library form (ui-management pass 3), used
// by BOTH the admin panel's EditOverlay and the collection Manage overlay's
// Edit library section. Name/Description are the only editable fields; Type
// and the root folder render read-only with the identity warning (moving the
// root re-identifies all items — the PATCH endpoint would 400 a
// root_path/module_id attempt anyway, and UpdateLibraryRequest cannot carry
// those fields). Submit PATCHes {display_name, description} ONLY; a canonical
// 400/404 renders inline and the form STAYS (no auto-retry, no auto-close on
// failure); success calls onSaved — the admin overlay closes there, the
// Manage overlay closes its sheet (each save is an independent boundary; the
// edit landing is the operator's done signal there).
export function EditLibraryForm(props: {
  lib: LibraryDTO;
  onSaved: () => void;
  onCancel?: () => void;
}): ReactElement {
  const { lib, onSaved } = props;
  const update = useUpdateLibrary();

  const [displayName, setDisplayName] = useState(lib.display_name);
  const [description, setDescription] = useState(lib.description);

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const req: UpdateLibraryRequest = {
      display_name: displayName.trim(),
      description: description.trim(),
    };
    update.mutate({ id: lib.id, req }, { onSuccess: onSaved });
  }

  const updateErr: ApiError | null =
    update.error instanceof Error ? (update.error as ApiError) : null;

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-name">Name</Label>
        <Input
          id="edit-name"
          name="edit-name"
          autoComplete="off"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-description">Description</Label>
        <Input
          id="edit-description"
          name="edit-description"
          autoComplete="off"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Type</span>
        <TypeBadge moduleId={lib.module_id} />
        <p className="text-xs text-muted-foreground">
          Fixed at creation — cannot be changed.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Root folder</span>
        <code className="break-all font-mono text-sm">{lib.root_path}</code>
        <p className="text-xs text-destructive">
          Moving the root re-identifies all items.
        </p>
      </div>

      {updateErr ? (
        <Alert variant="destructive">
          <AlertTitle>{updateErr.code}</AlertTitle>
          <AlertDescription>{updateErr.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        {props.onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={props.onCancel}
            disabled={update.isPending}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// TypeBadge — the pastel chip keyed by module_id (same hues as the sidebar
// dots; .badge-* in index.css).
function TypeBadge(props: { moduleId: string }): ReactElement {
  const known =
    props.moduleId === "serial" ||
    props.moduleId === "tv" ||
    props.moduleId === "image";
  const cls = known ? `badge-${props.moduleId}` : "badge-other";
  return <span className={`badge-type ${cls}`}>{props.moduleId}</span>;
}

// CollectionsTable — list render with loading/empty/error states plus the
// per-row Scan + Edit actions. The shared `scan` mutation's per-row state is
// derived by matching scan.variables (in-flight/last id) and
// scan.data.library_id (last success) against each row's id (INV-per-row-state).
function CollectionsTable(props: {
  isLoading: boolean;
  listError: ApiError | null;
  items: LibraryDTO[];
  scan: {
    isPending: boolean;
    variables: number | undefined;
    data: ScanResponse | undefined;
    error: unknown;
    mutate: (id: number) => void;
  };
  onEdit: (lib: LibraryDTO) => void;
}): ReactElement {
  const { isLoading, listError, items, scan, onEdit } = props;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading collections…</p>;
  }
  if (listError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{listError.code}</AlertTitle>
        <AlertDescription>{listError.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    // .collections-scroll is the scroll container at 20+ collections; the
    // sticky TableHeader (position:sticky top-0) keeps the header row visible
    // while the rows scroll under it.
    <div className="collections-scroll">
      <Table className="collections-table">
        <TableHeader className="sticky top-0 z-10">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Root folder</TableHead>
            <TableHead className="w-16 text-right">Items</TableHead>
            <TableHead className="w-44">Updated</TableHead>
            <TableHead className="w-44">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No collections yet
              </TableCell>
            </TableRow>
          ) : (
            items.map((lib) => (
              <CollectionRow key={lib.id} lib={lib} scan={scan} onEdit={onEdit} />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// CollectionRow — one library row. Owns the per-library summary hook
// (["library-summary", id]) for the Items/Updated cells, so each row fetches
// its count independently and asynchronously (never blocking the table), and
// the per-row delete mutation: DELETE /libraries/{id} removes the row and
// every dependent server-side row; media files on disk are untouched. The
// delete is a TWO-STEP inline confirm (INV-no-native-confirm): the first
// click only arms the row (Delete → Confirm/No), so a misclick can never
// drop a library. A delete error renders inline on the row (INV-per-row-state
// shape) and the armed state STAYS so the operator can retry or back out.
function CollectionRow(props: {
  lib: LibraryDTO;
  scan: {
    isPending: boolean;
    variables: number | undefined;
    data: ScanResponse | undefined;
    error: unknown;
    mutate: (id: number) => void;
  };
  onEdit: (lib: LibraryDTO) => void;
}): ReactElement {
  const { lib, scan, onEdit } = props;
  const summary = useLibrarySummary(lib.id);
  const del = useDeleteLibrary();
  const [confirming, setConfirming] = useState(false);

  const rowPending = scan.isPending && scan.variables === lib.id;
  const rowResult =
    scan.data && scan.data.library_id === lib.id ? scan.data : null;
  const scanErr = scan.error instanceof Error ? (scan.error as ApiError) : null;
  const rowError = scanErr && scan.variables === lib.id ? scanErr : null;
  const delErr = del.error instanceof Error ? (del.error as ApiError) : null;

  return (
    <TableRow data-library-id={lib.id}>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{lib.display_name}</span>
          {lib.description ? (
            <span className="text-xs text-muted-foreground">{lib.description}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <TypeBadge moduleId={lib.module_id} />
      </TableCell>
      <TableCell className="break-all font-mono text-xs">{lib.root_path}</TableCell>
      <TableCell className="text-right tabular-nums">
        {summary.isLoading ? "…" : summary.data ? summary.data.items : "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {summary.data && summary.data.updated_at ? summary.data.updated_at : "—"}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={rowPending}
              onClick={() => scan.mutate(lib.id)}
            >
              {rowPending ? "Scanning…" : "Scan"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(lib)}
            >
              Edit
            </Button>
            {confirming ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={del.isPending}
                  onClick={() => del.mutate(lib.id)}
                >
                  {del.isPending ? "Deleting…" : "Confirm delete"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={del.isPending}
                  onClick={() => setConfirming(false)}
                >
                  No
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={del.isPending}
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            )}
          </div>
          {rowResult ? (
            <div className="text-xs">
              <span>
                discovered {rowResult.discovered} · persisted{" "}
                {rowResult.persisted}
              </span>
              {rowResult.warnings && rowResult.warnings.length > 0 ? (
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {rowResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {rowError ? (
            <Alert variant="destructive" className="py-2">
              <AlertTitle>{rowError.code}</AlertTitle>
              <AlertDescription>{rowError.message}</AlertDescription>
            </Alert>
          ) : null}
          {delErr ? (
            <Alert variant="destructive" className="py-2">
              <AlertTitle>{delErr.code}</AlertTitle>
              <AlertDescription>
                {delErr.message} — the collection was NOT deleted.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
