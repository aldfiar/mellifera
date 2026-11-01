// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// DialogShell — the ONE dialog overlay mechanics unit (ui-management pass 3):
// the overlay shell lifted verbatim out of CardActions once it grew a second
// consumer (the collection header's Manage sheet). The shell owns the
// MECHANICS — portal + fixed positioning, scrim with click-away, Escape,
// focus trap (two-sentinel Tab loop), focus-return, `aria-modal` — and the
// consumer owns the POLICY (its view state machine and callbacks):
//
//   open            — false renders nothing (overlay state is local, never
//                     URL state; a route change unmounts and discards it).
//   [History Back]  — on open the shell pushes ONE history entry (an overlay
//                     marker on the state); a popstate popping it runs the
//                     consumer's close policy (onEscape-else-onClose — the
//                     Esc matrix), so Android TV Back — a history-back, not
//                     a key — closes the overlay identically to Esc and
//                     never exits the SPA. Any other close path (Esc keydown,
//                     scrim click-away, completed action, route-change
//                     unmount) consumes the entry via history.back() under a
//                     suppress flag. The shell only ever consumes an entry
//                     it pushed and still current: Back at the root of
//                     history stays plain router-back, and open/close cycles
//                     never accumulate stale overlay entries.
//   onClose         — scrim click-away (and Esc when no onEscape is given).
//   onEscape        — Esc key press; a consumer with a view walk (view →
//                     menu → close) or a pending-mutation guard implements
//                     its matrix here; absent → Esc behaves as onClose.
//   returnFocusRef  — the element focus returns to on close (the trigger).
//   focusKey        — when it changes while open, focus moves to the panel's
//                     first focusable (the open → view-flip routing).
//   width           — "card" (the card-action menu panel) | "identify" (the
//                     same panel widened for the long-title candidate rows)
//                   | "wide" (the Manage sheet: wide and scrollable).
//
// Esc is forwarded, never consumed: the shell never closes on Esc by itself,
// so a pending mutation can suppress closing (an unmounted view could never
// render the canonical inline error).

const FOCUSABLE_SEL =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

// The overlay history marker: the state key the shell stamps its single
// pushed entry with. The value is a monotonic per-push token, so two shells
// (or two generations of one shell) never mistake each other's entry for
// their own. Exported for the module's test file only.
export const OVERLAY_HISTORY_KEY = "mellifera:overlay";

let overlayHistorySeq = 0;

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter(
    (el) => !el.classList.contains("cardact-sentinel"),
  );
}

export function DialogShell(props: {
  open: boolean;
  label: string;
  width?: "card" | "identify" | "wide";
  focusKey?: string;
  returnFocusRef?: RefObject<HTMLElement>;
  onClose: () => void;
  onEscape?: () => void;
  children: ReactNode;
}): ReactElement | null {
  const { open } = props;
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus routing: into the panel's first focusable on every open and
  // focusKey flip (a view change) — the first effect; back to the trigger on
  // close — the second effect's CLEANUP, so it fires both on an open→false
  // flip and on the shell's unmount (a consumer may close by unmounting it
  // entirely). The return effect keys on `open` alone so a view flip never
  // routes focus through the trigger.
  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = panelRef.current;
    if (panel) {
      focusables(panel)[0]?.focus();
    }
  }, [open, props.focusKey]);
  useEffect(() => {
    if (!open) {
      return;
    }
    return () => {
      props.returnFocusRef?.current?.focus();
    };
  }, [open, props.returnFocusRef]);

  // History Back (the overlay history contract): push on open, popstate runs
  // the close policy, every other close path consumes the entry. The close
  // policy is read through a latest-props ref so the effect keys on `open`
  // alone — a policy identity change mid-open (a consumer's inline closure
  // re-created per render) must never re-push the entry.
  const policyRef = useRef(props);
  policyRef.current = props;
  const entryTokenRef = useRef(0); // our live entry's token; 0 = none on the stack
  const consumedTokenRef = useRef(0); // entry a pending consumption is about to consume
  const consumeTimerRef = useRef(0); // the deferred consumption's timer id
  const suppressRef = useRef(false); // a consumption traversal of ours is in flight
  useEffect(() => {
    if (!open) {
      return;
    }
    // Cancel a pending consumption from a just-closed generation (or
    // StrictMode dev's interleaved cleanup) and re-adopt the entry it was
    // about to consume — the stack still sits on our marker, so pushing a
    // second entry would leak one.
    if (consumeTimerRef.current !== 0) {
      window.clearTimeout(consumeTimerRef.current);
      consumeTimerRef.current = 0;
    }
    const current = window.history.state as Record<string, unknown> | null;
    if (
      consumedTokenRef.current !== 0 &&
      current &&
      current[OVERLAY_HISTORY_KEY] === consumedTokenRef.current
    ) {
      entryTokenRef.current = consumedTokenRef.current;
    } else {
      const token = ++overlayHistorySeq;
      entryTokenRef.current = token;
      window.history.pushState({ [OVERLAY_HISTORY_KEY]: token }, "");
    }
    consumedTokenRef.current = 0;
    suppressRef.current = false;

    // popstate carries the state of the entry we LANDED ON, never the popped
    // one — so the check is inverted: a traversal landing anywhere but our
    // own entry means ours was traversed away from, i.e. the user's Back.
    const onPopState = (e: PopStateEvent): void => {
      const token = entryTokenRef.current;
      if (token === 0) {
        return; // consumed already — a popped-but-closed overlay closes nothing twice
      }
      if (suppressRef.current) {
        suppressRef.current = false;
        return; // a consumption traversal of ours — never a close
      }
      const landed = e.state as Record<string, unknown> | null;
      if (landed && landed[OVERLAY_HISTORY_KEY] === token) {
        return; // landed ON our entry (a sibling consumed theirs above us, or a Forward) — ours was not popped
      }
      entryTokenRef.current = 0;
      const policy = policyRef.current;
      if (policy.onEscape) {
        policy.onEscape();
      } else {
        policy.onClose();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      const token = entryTokenRef.current;
      if (token === 0) {
        return; // the user's Back already consumed it — nothing to unwind
      }
      entryTokenRef.current = 0;
      // Consume only while our entry is still the CURRENT one: a route-change
      // unmount pushes the new route on top, and a blind back() would pop
      // that instead of our marker. The consumption is deferred one task so
      // an immediately-following re-open (StrictMode dev's setup → cleanup →
      // setup) cancels it and re-adopts the entry instead of pushing twice.
      const state = window.history.state as Record<string, unknown> | null;
      if (state && state[OVERLAY_HISTORY_KEY] === token) {
        consumedTokenRef.current = token;
        suppressRef.current = true;
        consumeTimerRef.current = window.setTimeout(() => {
          consumeTimerRef.current = 0;
          window.history.back();
        }, 0);
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  // The two-sentinel Tab loop: focusing a sentinel wraps focus to the
  // opposite edge of the panel's real focusables.
  const wrapFocus = (edge: "top" | "bottom"): void => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const els = focusables(panel);
    (edge === "top" ? els[els.length - 1] : els[0])?.focus();
  };

  // Width variant over the two existing sheet styles: "card" keeps the
  // Pass-1 menu panel (320px), "identify" is the same panel widened inline
  // for the identify view (candidate titles run 100+ chars — at 320px they
  // wrap past any readable clamp; 30rem gives the clamped rows their line
  // budget), "wide" is the scrollable Manage sheet (.overlay-card already
  // carries max-height + overflow-y) widened inline — the variant stays a
  // shell concern, no extra global CSS.
  const wide = props.width === "wide";
  const identify = props.width === "identify";

  return createPortal(
    <div className="overlay-backdrop" onClick={props.onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.label}
        className={wide ? "overlay-card" : "cardact-panel"}
        style={
          wide
            ? { maxWidth: "45rem" }
            : identify
              ? { maxWidth: "30rem" }
              : undefined
        }
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Escape") {
            return;
          }
          if (props.onEscape) {
            props.onEscape();
          } else {
            props.onClose();
          }
        }}
      >
        <span
          aria-hidden="true"
          tabIndex={0}
          className="cardact-sentinel"
          onFocus={() => wrapFocus("top")}
        />
        {props.children}
        <span
          aria-hidden="true"
          tabIndex={0}
          className="cardact-sentinel"
          onFocus={() => wrapFocus("bottom")}
        />
      </div>
    </div>,
    document.body,
  );
}
