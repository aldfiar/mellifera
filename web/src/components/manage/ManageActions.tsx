// SPDX-License-Identifier: Apache-2.0
import { useState, useRef } from "react";
import type { ReactElement } from "react";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import {
  deleteItemTitle,
  deleteSeriesTitle,
  postLibraryRefresh,
  putItemParsers,
  setItemTitle,
  setSeriesTitle,
  type ApiError,
  type ItemParsersResponse,
  type LibraryRefreshResult,
  type ParserBinding,
  type RefreshSourceBinding,
  type TitleOverrideDTO,
} from "@/lib/api";
import { useItem } from "@/lib/queries";
import { DialogShell } from "@/components/DialogShell";
import { cn } from "@/lib/utils";

// ManageActions — the element-management overlay unit (ui-management §2,
// lifted from Collection.tsx when the item detail page became its second
// consumer): ONE ⋯ trigger opening a dialog overlay whose views are `menu`,
// `rename`, `identify` and `refresh`. The shell MECHANICS (portal, scrim
// click-away, Esc, focus trap, focus-return, aria-modal) live in the shared
// DialogShell; this module owns the POLICY: the view state machine and the
// Esc matrix (a view → menu, menu → close all, IGNORED while a mutation is
// pending — an unmounted view could never render the canonical inline
// error), plus the three views and the rename mutations behind them.
// Consumers (collection cards, the item detail page) pass their own
// invalidation keys and wire only the views they serve.

// NO_REFRESH_SOURCES — the shared empty-state copy of the refresh pickers:
// the served refresh_sources list is empty — no loaded, effectively-enabled
// title source, no kickoff.
export const NO_REFRESH_SOURCES =
  "No refreshable sources — this module has no loaded, enabled title source to refresh with.";

// useTitleOverride — the rename mutations for ONE entity (serial-watch-flow
// 4.3): kind picks the id space ("series" → setSeriesTitle/deleteSeriesTitle,
// "item" → setItemTitle/deleteItemTitle). Both run retry:0
// (INV-no-mutation-retry — a 400/404 surfaces inline, never auto-retried) and
// invalidate the caller's read keys on success so the display follows the
// stored row.
export function useTitleOverride(
  kind: "series" | "item",
  entityId: string,
  invalidate: readonly unknown[],
): {
  set: UseMutationResult<TitleOverrideDTO, ApiError, string>;
  clear: UseMutationResult<void, ApiError, void>;
} {
  const qc = useQueryClient();
  const invalidateRead = (): void => {
    void qc.invalidateQueries({ queryKey: [...invalidate] });
  };
  const set = useMutation<TitleOverrideDTO, ApiError, string>({
    mutationFn: (title: string) =>
      kind === "series"
        ? setSeriesTitle(entityId, title)
        : setItemTitle(entityId, title),
    retry: 0,
    onSuccess: invalidateRead,
  });
  const clear = useMutation<void, ApiError, void>({
    mutationFn: () =>
      kind === "series"
        ? deleteSeriesTitle(entityId)
        : deleteItemTitle(entityId),
    retry: 0,
    onSuccess: invalidateRead,
  });
  return { set, clear };
}

// OverlayState — the overlay's view machine. Overlay state is LOCAL
// (closed|menu|rename|rename-series|identify|refresh), never URL state: a
// route change unmounts the host and discards it.
export type OverlayState =
  | "closed"
  | "menu"
  | "rename"
  | "rename-series"
  | "identify"
  | "refresh";

// CardActions — the per-element management unit: a quiet ⋯ trigger, ONE
// dialog overlay whose views are `menu`, `rename`, `rename-series`,
// `identify` and `refresh`. The trigger carries aria-haspopup="dialog" +
// aria-expanded; the open state persists via data-open because the overlay
// is portaled and :focus-within goes false once focus enters the panel.
export function CardActions(props: {
  triggerLabel: string;
  triggerClassName?: string;
  pending: boolean;
  rows?: ReactElement;
  footer?: ReactElement;
  identify?: (ctl: { collapse: () => void; back: () => void }) => ReactElement;
  identifyFirst?: boolean;
  refresh?: (ctl: { collapse: () => void; back: () => void }) => ReactElement;
  rename: (ctl: { collapse: () => void; back: () => void }) => ReactElement;
  renameSeries?: (ctl: { collapse: () => void; back: () => void }) => ReactElement;
}): ReactElement {
  const [overlay, setOverlay] = useState<OverlayState>("closed");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeAll = (): void => setOverlay("closed");
  const open = overlay !== "closed";

  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      className={cn("cardact-trigger", props.triggerClassName)}
      aria-label={props.triggerLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-open={open ? "" : undefined}
      onClick={() => setOverlay(open ? "closed" : "menu")}
    >
      ⋯
    </button>
  );

  return (
    <>
      {trigger}
      <DialogShell
        open={open}
        label={props.triggerLabel}
        width={overlay === "identify" ? "identify" : "card"}
        returnFocusRef={triggerRef}
        focusKey={overlay}
        onClose={closeAll}
        onEscape={() => {
          if (props.pending) {
            return;
          }
          if (overlay === "menu") {
            closeAll();
          } else {
            setOverlay("menu");
          }
        }}
      >
        {overlay === "menu" ? (
          <>
            {/* Identify… rides the module-wired chain (the row is absent
                without it) and is promoted to the first row when the element
                is unidentified — curing the name is the operator's next
                most likely intent there. */}
            {props.identifyFirst && props.identify ? (
              <button
                type="button"
                className="cardact-row"
                onClick={() => setOverlay("identify")}
              >
                Identify…
              </button>
            ) : null}
            <button
              type="button"
              className="cardact-row"
              onClick={() => setOverlay("rename")}
            >
              Rename…
            </button>
            {props.renameSeries ? (
              <button
                type="button"
                className="cardact-row"
                onClick={() => setOverlay("rename-series")}
              >
                Rename series…
              </button>
            ) : null}
            {!props.identifyFirst && props.identify ? (
              <button
                type="button"
                className="cardact-row"
                onClick={() => setOverlay("identify")}
              >
                Identify…
              </button>
            ) : null}
            {props.refresh ? (
              <button
                type="button"
                className="cardact-row"
                onClick={() => setOverlay("refresh")}
              >
                Refresh metadata…
              </button>
            ) : null}
            {props.rows ?? null}
            {props.footer ?? null}
          </>
        ) : overlay === "rename" ? (
          props.rename({
            collapse: closeAll,
            back: () => setOverlay("menu"),
          })
        ) : overlay === "rename-series" && props.renameSeries ? (
          props.renameSeries({
            collapse: closeAll,
            back: () => setOverlay("menu"),
          })
        ) : overlay === "identify" && props.identify ? (
          props.identify({
            collapse: closeAll,
            back: () => setOverlay("menu"),
          })
        ) : overlay === "refresh" && props.refresh ? (
          props.refresh({
            collapse: closeAll,
            back: () => setOverlay("menu"),
          })
        ) : null}
      </DialogShell>
    </>
  );
}

// IdentifyView — the menu's identify view (ui-management pass 2, boxes
// 2.1–2.2). Opening it performs a MANDATORY GET /items/{id} (the `useItem`
// detail hook): `extra_parsers` — the item's attached parser ids — is
// populated ONLY by the detail endpoint, so computing the attachable diff
// from list rows would show attached parsers as attachable and the
// full-replacement parsers PUT would silently drop existing attachments.
// Rendering is gated on that fetch: no parser list until the detail lands (a
// muted loading line, never a spinner).
//
// The three facts the view shows:
//   - attached — the item's `extra_parsers` in attachment order, up/down
//     reorderable and per-row removable (keyboard-native; drag is a later
//     refinement). The local draft order starts as the served order and is
//     what Save sends as the COMPLETE ordered list — the parsers PUT is a
//     full replacement, so the draft is always sent whole (empty clears).
//   - the parser chain — the library module's declared bindings, served
//     order, from the caller's module block (read-only here; the library
//     Manage overlay owns editing it). Attached entries carry a status label;
//     the attachable ones — declared minus attached (an absent `extra_parsers`
//     field means empty attachments, so every declared parser is attachable) —
//     render as add chips: tapping one appends that id to the END of the
//     draft and the chip disappears; the row's remove affordance returns the
//     parser to the chips.
//
// Save PUTs the full draft (retry:0); a canonical 400 (unknown/mismatched
// parser) surfaces inline and the overlay stays open; the awaited success
// invalidates the caller's read key and this detail entry, then collapses
// the overlay — the name itself updates when the background enrichment lands
// (staleness is copy-only per the accepted default). A detail error surfaces
// inline (role="alert"); Back returns to the menu.
export function IdentifyView(props: {
  itemId: string;
  chain: ParserBinding[];
  invalidate: readonly unknown[];
  onCollapse: () => void;
  onBack: () => void;
}): ReactElement {
  const qc = useQueryClient();
  const detail = useItem(props.itemId);
  // The attachment draft: null until the operator edits — i.e. the served
  // attachment order verbatim; a reorder or removal pins the edited order
  // (an EMPTY pinned draft is the emptied-list save, never "unedited").
  const [order, setOrder] = useState<string[] | null>(null);
  const served = detail.data?.item.extra_parsers ?? [];
  const attached = order ?? served;

  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= attached.length) {
      return;
    }
    const next = [...attached];
    const [picked] = next.splice(index, 1);
    next.splice(target, 0, picked);
    setOrder(next);
  };

  const remove = (id: string): void => {
    setOrder(attached.filter((a) => a !== id));
  };

  const save = useMutation<ItemParsersResponse, ApiError, void>({
    mutationFn: () => putItemParsers(props.itemId, attached),
    retry: 0,
    onSuccess: () => {
      // The write changes what the list rows and the detail read serve
      // (extra_parsers, recomposed names): invalidate the caller's read key
      // and this view's own entry.
      void qc.invalidateQueries({ queryKey: [...props.invalidate] });
      void qc.invalidateQueries({ queryKey: ["item", props.itemId] });
    },
  });

  const saveDraft = (): void => {
    save
      .mutateAsync()
      .then(props.onCollapse) // awaited collapse — never an isSuccess effect
      .catch(() => {}); // the canonical error renders inline below
  };

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-2 p-2">
        <p className="text-xs text-muted-foreground">Loading parser details…</p>
        <button
          type="button"
          className="cardact-row"
          onClick={props.onBack}
        >
          Back
        </button>
      </div>
    );
  }
  if (detail.error !== null || detail.data === undefined) {
    const err = detail.error as ApiError | null;
    return (
      <div className="flex flex-col gap-2 p-2">
        <p role="alert" className="text-xs text-destructive">
          {err ? `${err.code}: ${err.message}` : "not_found: item not found"}
        </p>
        <button
          type="button"
          className="cardact-row"
          onClick={props.onBack}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 p-2"
      onKeyDown={(e) => {
        // While the save is in flight the panel's Esc walk is suppressed —
        // an unmounted view could never render the canonical inline error
        // (the rename view's guard, enforced here because the save mutation
        // lives in this view).
        if (e.key === "Escape" && save.isPending) {
          e.stopPropagation();
        }
      }}
    >
      <p className="text-xs font-medium">Attached parsers</p>
      {attached.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Attached parsers">
          {attached.map((id, i) => (
            <li key={id} className="flex items-center justify-between gap-2">
              <span className="text-xs">{id}</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  aria-label={`Move ${id} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  aria-label={`Move ${id} down`}
                  disabled={i === attached.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  aria-label={`Remove ${id}`}
                  onClick={() => remove(id)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing attached.</p>
      )}
      <p className="text-xs font-medium">Parser chain</p>
      <ul className="flex flex-col gap-1" aria-label="Parser chain">
        {props.chain.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2">
            <span className="text-xs">{b.id}</span>
            {attached.includes(b.id) ? (
              <span className="text-xs text-muted-foreground">attached</span>
            ) : (
              <button
                type="button"
                className="chip"
                aria-label={`Add ${b.id}`}
                onClick={() => setOrder([...attached, b.id])}
              >
                + {b.id}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="cardact-row"
        disabled={save.isPending}
        onClick={saveDraft}
      >
        Save
      </button>
      <p className="text-xs text-muted-foreground">
        Enrichment runs in the background; the name updates when it lands. A
        recently failed row waits out its cooldown before retrying.
      </p>
      <button
        type="button"
        className="cardact-row"
        onClick={props.onBack}
      >
        Back
      </button>
      {save.error ? (
        <p role="alert" className="text-xs text-destructive">
          {save.error.code}: {save.error.message}
        </p>
      ) : null}
    </div>
  );
}

// RefreshView — the per-item metadata refresh view (ui-management pass 2,
// box 2.3; plugin-admin-surfaces): a dropdown of the module block's served
// refresh_sources — the loaded, effectively-enabled title sources (the
// endpoint requires exactly one plugin_id per invocation), so the view
// preselects the served-first source and the selection drives the request
// body — and a confirm that POSTs postLibraryRefresh(libraryId, {plugin_id,
// row_ids: [rowId]}). rowId is the element's own id in the shared row space:
// an episode/item id on the item cards and the item page, the series id from
// the series menu.
// An empty served list renders the view's empty state with explanatory copy
// and a disabled trigger — no refreshable source, no kickoff. The 202 sweep
// counts render inline and the view stays open (names follow when the
// background run lands); a deferred row kept its data — the copy says so;
// 409 refresh_in_flight renders its own line; every other canonical error
// (503 unwired, 400 unknown plugin, 404 unknown rows) renders inline as
// code: message. retry:0 — no auto-retry.
export function RefreshView(props: {
  libraryId: number;
  rowId: string;
  sources: RefreshSourceBinding[];
  onBack: () => void;
}): ReactElement {
  const [pluginId, setPluginId] = useState(props.sources[0]?.id ?? "");
  const refresh = useMutation<LibraryRefreshResult, ApiError, void>({
    mutationFn: () =>
      postLibraryRefresh(props.libraryId, {
        plugin_id: pluginId,
        row_ids: [props.rowId],
      }),
    retry: 0,
  });
  const res = refresh.data;

  return (
    <div
      className="flex flex-col gap-2 p-2"
      onKeyDown={(e) => {
        // While the POST is in flight the panel's Esc walk is suppressed —
        // an unmounted view could never render the canonical inline error.
        if (e.key === "Escape" && refresh.isPending) {
          e.stopPropagation();
        }
      }}
    >
      {props.sources.length === 0 ? (
        // Empty served list — the view's empty state: explanatory copy, the
        // trigger disabled (no refreshable source, no kickoff).
        <p className="text-xs text-muted-foreground">{NO_REFRESH_SOURCES}</p>
      ) : (
        <select
          aria-label="Refresh source"
          className="rounded-md border bg-card px-2 py-1 text-xs"
          value={pluginId}
          onChange={(e) => setPluginId(e.target.value)}
        >
          {props.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="cardact-row"
        disabled={refresh.isPending || pluginId === ""}
        onClick={() => refresh.mutate(undefined)}
      >
        Refresh
      </button>
      <button type="button" className="cardact-row" onClick={props.onBack}>
        Back
      </button>
      {res ? (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            {String(res.queued)} queued · {String(res.stripped)} stripped ·{" "}
            {String(res.deferred)} deferred
          </p>
          {res.deferred > 0 ? (
            <p className="text-xs text-muted-foreground">
              kept its data — try again shortly
            </p>
          ) : null}
        </>
      ) : null}
      {refresh.error ? (
        refresh.error.code === "refresh_in_flight" ? (
          <p role="alert" className="text-xs text-destructive">
            A refresh is already running
          </p>
        ) : (
          <p role="alert" className="text-xs text-destructive">
            {refresh.error.code}: {refresh.error.message}
          </p>
        )
      ) : null}
    </div>
  );
}

// RenameTitle — the rename form (serial-watch-flow 4.3), hosted as the
// CardActions rename view: a prefilled input with Save (PUT the override) and
// Clear (DELETE it). Canonical errors surface INLINE from the mutation
// state — no auto-retry, no navigation; the overlay stays open so the
// operator can correct the value. A landed set or clear collapses the
// overlay — awaited on the exact mutation the operator just ran (NOT an
// isSuccess effect: a stale success from the other mutation would flip when
// the next mutate starts and slam the view shut mid-submission); the display
// behind it follows the invalidated read (the override on set, the chain
// value on clear).
export function RenameTitle(props: {
  entityLabel: string;
  initial: string;
  set: UseMutationResult<TitleOverrideDTO, ApiError, string>;
  clear: UseMutationResult<void, ApiError, void>;
  onCollapse: () => void;
  onBack: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(props.initial);
  const error = props.set.error ?? props.clear.error;
  const busy = props.set.isPending || props.clear.isPending;

  return (
    <form
      className="flex flex-col gap-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        props.set
          .mutateAsync(draft)
          .then(props.onCollapse)
          .catch(() => {}); // the canonical error renders inline below
      }}
    >
      <input
        aria-label={`New title for ${props.entityLabel}`}
        className="w-full rounded-md border bg-transparent px-2 py-1 text-xs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
          onClick={() => {
            props.clear
              .mutateAsync()
              .then(props.onCollapse)
              .catch(() => {}); // the canonical error renders inline below
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
          onClick={props.onBack}
        >
          Back
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error.code}: {error.message}
        </p>
      ) : null}
    </form>
  );
}
