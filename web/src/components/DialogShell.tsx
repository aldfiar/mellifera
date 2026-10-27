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
