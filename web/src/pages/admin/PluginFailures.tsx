// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { useParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";

import type { ApiError, EnrichFailure } from "@/lib/api";
import { listEnrichFailures } from "@/lib/api";
import AdminTabs from "@/pages/admin/AdminTabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// PluginFailures — the per-plugin failures drill-down
// (/admin/plugins/:pluginId/failures, client-relayed-fetch 6.4): the surface
// the Plugins page's «Ошибки» column links into when a plugin's served count
// is positive. Renders the SERVED window of GET /api/v1/enrich/failures
// scoped to the route's plugin_id.
//
// Wire contract (enrich_admin.go enrichFailures + enrichFailureDTO, mirrored
// verbatim — INV-verbatim-payload):
//  - the read is `listEnrichFailures({ plugin_id })` — scoped to the route's
//    plugin_id at the SERVER's default limit (no limit param rides the wire;
//    the store answers its default window of 50, capped at 200 server-side).
//  - paging is SERVER-side offset paging: «Показать ещё» advances the offset
//    by the fetched window lengths and APPENDS the next window. The page
//    never fetches unbounded and slices locally. The control disappears when
//    a short window comes back (fewer than the default 50 — the honest
//    end-of-list signal the handler's windowing gives).
//  - rows render the served DTO fields verbatim — row_kind, title, status,
//    reason, attempts, failed_at. The status literals are the ledger's
//    closed vocabulary ("relayed" / "exhausted" / "no_data" / "pack_failed")
//    and the stamps are RFC3339 strings — the SPA never derives, renames or
//    reformats ledger facts (the existing failures-list convention).
//
// «Ошибок нет» is a NORMAL state (an empty ledger is healthy), rendered as
// plain muted text — never an error banner. Canonical errors surface inline
// (code + message). INV-no-writes: the page reads only; INV-no-mutation-
// retry: the read is retry:0 like every admin surface — the operator
// re-clicks. Query idiom: TanStack v5 useInfiniteQuery (the append semantics
// the contract pins are what the codebase's replacement-paging useQuery
// pattern cannot express; key carries the plugin_id, retry: 0 unchanged).
//
// DEFAULT_FAILURES_LIMIT — enrich_admin.go: an absent limit param answers
// the store's default window of 50. The page requests that default, so 50
// is the requested window the end-of-list check compares against.
const DEFAULT_FAILURES_LIMIT = 50;

export default function PluginFailures(): ReactElement {
  const { pluginId } = useParams<{ pluginId: string }>();

  const failures = useInfiniteQuery({
    queryKey: ["enrich-failures", pluginId],
    enabled: pluginId !== undefined,
    queryFn: ({ pageParam }) =>
      listEnrichFailures({
        plugin_id: pluginId as string,
        offset: pageParam > 0 ? pageParam : undefined,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.failures.length < DEFAULT_FAILURES_LIMIT) {
        return undefined; // short window — the honest end of the ledger
      }
      // The next offset is where the served window ended (windows before the
      // last are exactly the default limit).
      return allPages.reduce((n, page) => n + page.failures.length, 0);
    },
    retry: 0,
  });

  const err: ApiError | null =
    failures.error instanceof Error ? (failures.error as ApiError) : null;
  const rows: EnrichFailure[] = failures.data
    ? failures.data.pages.flatMap((page) => page.failures)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <AdminTabs />

      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-base font-semibold">Ошибки</h2>
          {pluginId ? (
            <span className="font-mono text-xs text-muted-foreground">
              {pluginId}
            </span>
          ) : null}
        </div>
        {failures.isLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : err ? (
          <Alert variant="destructive">
            <AlertTitle>{err.code}</AlertTitle>
            <AlertDescription>{err.message}</AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          // An empty ledger is the normal, healthy state — plain text,
          // never an error banner.
          <p className="text-sm text-muted-foreground">Ошибок нет</p>
        ) : (
          <FailuresTable rows={rows} />
        )}
        {rows.length > 0 && failures.hasNextPage ? (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={failures.isFetchingNextPage}
              onClick={() => failures.fetchNextPage()}
            >
              Показать ещё
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

// FailuresTable — the served window, newest first as served. Every cell is
// the DTO field verbatim; the RFC3339 stamps render exactly as served.
function FailuresTable(props: { rows: EnrichFailure[] }): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Тип</TableHead>
          <TableHead>Название</TableHead>
          <TableHead className="w-28">Статус</TableHead>
          <TableHead>Причина</TableHead>
          <TableHead className="w-20">Попытки</TableHead>
          <TableHead className="w-44">Время сбоя</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((f) => (
          <TableRow key={f.row_id} data-row-id={f.row_id}>
            <TableCell className="font-mono text-xs">{f.row_kind}</TableCell>
            <TableCell>{f.title}</TableCell>
            <TableCell className="font-mono text-xs">{f.status}</TableCell>
            <TableCell className="text-muted-foreground">{f.reason}</TableCell>
            <TableCell>{f.attempts}</TableCell>
            <TableCell className="font-mono text-xs">{f.failed_at}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
