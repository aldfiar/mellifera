// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import type { ApiError } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Shared async states for the SPA pages (group 3): one canonical loading,
// empty and error surface so every page renders failures the same way.
//
// ErrorState always surfaces the canonical ApiError code + message; the retry
// affordance renders only when the error is marked retryable AND the caller
// passes an onRetry (the page owns what "retry" means — usually the query's
// refetch). Pages keep their special cases (e.g. ItemDetail's not_found calm
// state) and delegate the generic handling here.

// LoadingState — the one loading surface. `label` names WHAT is loading, so
// screen readers and skimmers get more than a bare spinner word.
export function LoadingState(props: { label: string }): ReactElement {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {props.label}
    </p>
  );
}

// EmptyState — the one empty-result surface (a query succeeded; there is
// simply nothing to show).
export function EmptyState(props: { message: string }): ReactElement {
  return (
    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      {props.message}
    </p>
  );
}

// ErrorState — the canonical error surface: code + message verbatim from the
// ApiError, plus a retry Button when the error is retryable and the caller
// wired onRetry. The destructive Alert variant matches the alert primitive's
// contract (screen readers announce it via role="alert" internally).
export function ErrorState(props: {
  error: ApiError;
  onRetry?: () => void;
}): ReactElement {
  const { error, onRetry } = props;
  return (
    <Alert variant="destructive">
      <AlertTitle>{error.code}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      {error.retryable && onRetry ? (
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}
