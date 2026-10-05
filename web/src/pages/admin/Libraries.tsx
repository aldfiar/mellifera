// SPDX-License-Identifier: Apache-2.0
import type { FormEvent, ReactElement } from "react";
import { useState } from "react";

import type { ApiError, CreateLibraryRequest, ScanResponse } from "@/lib/api";
import {
  useCreateLibrary,
  useLibraries,
  useScanLibrary,
} from "@/lib/queries";
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

// Libraries — the admin Libraries page (AC-2 list+add; AC-3 scan trigger).
// Renders existing libraries in a shadcn Table from `useLibraries()` (T05 →
// GET /api/v1/libraries), an add-library form POSTing via `useCreateLibrary()`
// (T05 → POST /api/v1/libraries; on 201 ["libraries"] invalidates and the new
// row re-fetches), and a per-row "Scan" button calling `useScanLibrary()` (T05
// → POST /api/v1/libraries/{id}/scan). AC-2 owns the list+add (T08); AC-3 owns
// the scan trigger (T09).
//
// INV-verbatim-payload: the create POST body is exactly { module_id, root_path,
// display_name } (Go createLibraryRequest, handlers.go:34-38). INV-module-id-
// domain: module_id ∈ {"tv","image"} only (Select-enforced). INV-no-direct-
// fetch: this page uses ONLY the T05 hooks. INV-scan-not-retried: the scan
// mutation is retry:0 in T05 — failures require the operator to re-click.
// INV-per-row-state: scan result/error are rendered only on the row whose id
// matches scan.variables / scan.data.library_id, so a scan on row A does not
// clobber row B's display.
//
// Network paths: NFS/network roots MUST be OS-mounted (local or NFS); the Go
// process reads them like local paths (no SMB/HTTP fetch). Documented inline.
type ModuleId = "tv" | "image";

export default function Libraries(): ReactElement {
  const { data, isLoading, error } = useLibraries();
  const create = useCreateLibrary();
  const scan = useScanLibrary();

  const [moduleId, setModuleId] = useState<ModuleId>("tv");
  const [rootPath, setRootPath] = useState("");
  const [displayName, setDisplayName] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const req: CreateLibraryRequest = {
      module_id: moduleId,
      root_path: rootPath.trim(),
      display_name: displayName.trim(),
    };
    create.mutate(req);
  }

  const createErr: ApiError | null =
    create.error instanceof Error ? (create.error as ApiError) : null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-base font-semibold">Libraries</h2>
        <LibrariesTable
          isLoading={isLoading}
          listError={error instanceof Error ? (error as ApiError) : null}
          items={data?.items ?? []}
          scan={scan}
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Add library</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lib-module">Module</Label>
                <Select
                  value={moduleId}
                  onValueChange={(v: string) =>
                    v === "tv" || v === "image" ? setModuleId(v) : undefined
                  }
                >
                  <SelectTrigger id="lib-module">
                    <SelectValue placeholder="Select module" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tv">tv</SelectItem>
                    <SelectItem value="image">image</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="lib-root">Root path</Label>
                <Input
                  id="lib-root"
                  name="lib-root"
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="lib-name">Display name</Label>
                <Input
                  id="lib-name"
                  name="lib-name"
                  placeholder="TV"
                  autoComplete="off"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
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
                {create.isPending ? "Adding…" : "Add library"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

interface LibraryRow {
  id: number;
  module_id: string;
  root_path: string;
  display_name: string;
}

// LibrariesTable — list render with loading/empty/error states (B7) plus the
// per-row scan trigger (AC-3). The `scan` mutation is shared; per-row state is
// derived by matching scan.variables (in-flight/last id) and scan.data.library_id
// (last success) against each row's id (INV-per-row-state).
function LibrariesTable(props: {
  isLoading: boolean;
  listError: ApiError | null;
  items: LibraryRow[];
  scan: {
    isPending: boolean;
    variables: number | undefined;
    data: ScanResponse | undefined;
    error: unknown;
    mutate: (id: number) => void;
  };
}): ReactElement {
  const { isLoading, listError, items, scan } = props;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading libraries…</p>;
  }
  if (listError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{listError.code}</AlertTitle>
        <AlertDescription>{listError.message}</AlertDescription>
      </Alert>
    );
  }

  const scanErr = scan.error as ApiError | null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">ID</TableHead>
          <TableHead className="w-24">Module</TableHead>
          <TableHead>Root path</TableHead>
          <TableHead className="w-48">Display name</TableHead>
          <TableHead className="w-64">Scan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground">
              No libraries yet
            </TableCell>
          </TableRow>
        ) : (
          items.map((lib) => {
            const rowPending = scan.isPending && scan.variables === lib.id;
            const rowResult =
              scan.data && scan.data.library_id === lib.id ? scan.data : null;
            const rowError =
              scanErr && scan.variables === lib.id ? scanErr : null;
            return (
              <TableRow key={lib.id}>
                <TableCell>{lib.id}</TableCell>
                <TableCell className="font-mono">{lib.module_id}</TableCell>
                <TableCell className="font-mono">{lib.root_path}</TableCell>
                <TableCell>{lib.display_name}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      disabled={rowPending}
                      onClick={() => scan.mutate(lib.id)}
                    >
                      {rowPending ? "Scanning…" : "Scan"}
                    </Button>
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
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
