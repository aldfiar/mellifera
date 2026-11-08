// SPDX-License-Identifier: Apache-2.0
import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactElement, RefObject } from "react";
import { useNavigate } from "react-router-dom";

import { DialogShell } from "@/components/DialogShell";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import {
  search,
  type ApiError,
  type ItemDTO,
  type SearchResponse,
  type SeriesDTO,
} from "@/lib/api";

// SearchPalette — the global-search palette (browse-scale 5.1, design D6):
// the SPA half of GET /api/v1/search. One mount inside the authenticated
// shell (App Shell); the ⌘K / Ctrl+K combo opens it, Esc closes it. The
// component owns the MECHANICS (overlay state, debounce, abort, keyboard
// walk) and renders SERVED BYTES only: the two arrays ride in verbatim —
// no re-ranking, no filtering, no client-side composition (D6/D7 — the
// server already ranked and bounded the groups at 8+8).
//
// Mechanics:
//   debounce   — 120 ms (design D8's keystroke→paint budget): every
//                keystroke resets ONE timer, so a burst of typing fires
//                exactly one request for the settled query.
//   abort      — each request carries an AbortController; the next settled
//                query, a close, or an unmount aborts the in-flight one.
//                The aborted fetch's rejection is swallowed — a superseded
//                request is never an error state.
//   keyboard   — ↑↓ walk the flattened rows, ↵ navigates (series → the
//                collection's ?series= deep link, item → the element page),
//                Esc closes (through DialogShell's forwarded onEscape).
//   errors     — the canonical ApiError renders through the shared
//                ErrorState, retry:0 (a read never auto-retries, and no
//                onRetry is wired — the next keystroke IS the retry).

// DEBOUNCE_MS — the D8 budget's client leg, named where it is enforced.
const DEBOUNCE_MS = 120;

// PaletteRow — one walkable entry: the flattened, served-order union of the
// two result groups (series first, then items — the wire's array order).
type PaletteRow =
  | { kind: "series"; series: SeriesDTO }
  | { kind: "item"; item: ItemDTO };

function rowsOf(res: SearchResponse): PaletteRow[] {
  return [
    ...res.series.map((series) => ({ kind: "series" as const, series })),
    ...res.items.map((item) => ({ kind: "item" as const, item })),
  ];
}

// rowLabel — the SERVED display name verbatim, with the honest
// relative_path floor for a row the server could not name (display_name is
// optional in TS — an absent field means unset, never a type hole).
function rowLabel(row: PaletteRow): string {
  const dto = row.kind === "series" ? row.series : row.item;
  return dto.display_name ?? dto.relative_path;
}

// rowTarget — the deep link a ↵/click navigates to: a series rides the
// collection page's ?series= param (Collection.tsx's deep-linkable series
// view), an item the element page.
function rowTarget(row: PaletteRow): string {
  return row.kind === "series"
    ? `/collections/${String(row.series.library_id)}?series=${encodeURIComponent(row.series.id)}`
    : `/items/${encodeURIComponent(row.item.id)}`;
}

// isAbortError — the rejection shape a fetch abort produces. The palette's
// own signal.aborted check covers the in-generation abort; the name check
// covers a rejection that raced past it.
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export function SearchPalette(): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  // Focus-return target: whatever was focused when ⌘K summoned the palette
  // (the palette has no trigger button to return to — the summon IS the
  // keyboard).
  const returnFocus = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  // The reset state a fresh palette opens with — also the close state.
  const reset = (): void => {
    setQuery("");
    setResults(null);
    setError(null);
    setLoading(false);
    setActive(0);
  };

  const close = (): void => {
    setOpen(false);
    reset();
  };

  // ⌘K / Ctrl+K toggles the palette (window-level: the combo must work from
  // wherever focus sits). Re-registered per `open` so the handler reads the
  // live flag without a stale-closure ref dance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") {
        return;
      }
      e.preventDefault();
      if (!open) {
        returnFocus.current = document.activeElement as HTMLElement | null;
        reset();
      }
      setOpen(!open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The debounced, abortable search: one 120 ms timer per settled query,
  // one AbortController per request, cleanup aborts (the next keystroke's
  // re-run, a close, or an unmount). Empty/whitespace query = the honest
  // empty state, zero requests.
  useEffect(() => {
    if (!open) {
      return;
    }
    const q = query.trim();
    if (q === "") {
      reset();
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      search(q, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) {
            return; // superseded — never paint a stale answer
          }
          setResults(res);
          setError(null);
          setActive(0);
          setLoading(false);
        })
        .catch((err) => {
          if (controller.signal.aborted || isAbortError(err)) {
            return; // the abort path is not an error state
          }
          setError(err as ApiError);
          setResults(null);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const rows = results === null ? [] : rowsOf(results);

  const go = (row: PaletteRow): void => {
    navigate(rowTarget(row));
    close();
  };

  const onInputKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rows.length > 0) {
        setActive((i) => Math.min(i + 1, rows.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const row = rows[active];
      if (row !== undefined) {
        e.preventDefault();
        go(row);
      }
    }
  };

  return (
    <DialogShell
      open={open}
      label="Search"
      width="identify"
      returnFocusRef={returnFocus as RefObject<HTMLElement>}
      onClose={close}
      onEscape={close}
    >
      <div className="flex flex-col gap-2 p-2" data-testid="search-palette">
        <input
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Search titles…"
          className="rounded-md border bg-card px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        {error !== null ? (
          // The canonical error, retry:0 — no Retry affordance is wired (a
          // read never auto-retries; typing again re-queries).
          <ErrorState error={error} />
        ) : loading ? (
          <LoadingState label="Searching…" />
        ) : results === null ? (
          <p className="text-xs text-muted-foreground">
            Type to search every collection.
          </p>
        ) : rows.length === 0 ? (
          <EmptyState message={`Nothing found for “${query.trim()}”`} />
        ) : (
          rows.map((row, i) => {
            // One group header per wire group, in served order — the header
            // is presentational; the rows themselves ride the arrays
            // verbatim (never re-sorted, never merged).
            const header =
              i === 0 || rows[i - 1].kind !== row.kind ? (
                <p className="px-2 pt-1 text-xs font-semibold text-muted-foreground">
                  {row.kind === "series" ? "Series" : "Items"}
                </p>
              ) : null;
            return (
              <Fragment key={`${row.kind}-${(row.kind === "series" ? row.series : row.item).id}`}>
                {header}
                <button
                  type="button"
                  className={`cardact-row${i === active ? " search-row--active" : ""}`}
                  onClick={() => go(row)}
                >
                  {rowLabel(row)}
                </button>
              </Fragment>
            );
          })
        )}
      </div>
    </DialogShell>
  );
}
