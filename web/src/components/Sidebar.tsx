// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, House, Menu, Settings2 } from "lucide-react";

import type { AdminStatus, LibraryDTO } from "@/lib/api";
import { apiRequest } from "@/lib/api";
import { useLibraries, useLibrarySummary } from "@/lib/queries";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

// Sidebar — the SPA shell (web-ui-phase-3 group 3): a 224px left panel that is
// HIDDEN BY DEFAULT. A floating menu button (menu-fab, fixed top-left) opens
// it; the panel chevron and the Escape key close it; the open/hidden choice
// persists in localStorage under mellifera.side. The open state is expressed
// as the `side-open` class on <body> — index.css owns the mechanics (the
// panel's translateX slide, the FAB's visibility, the content's offset and
// the reserved FAB zone) exactly like the theme owns the `dark` class.
//
// Panel anatomy, top to bottom (INV from the mockup):
//   brand + chevron · Home/Admin icon nav · the side-colls list (ALL
//   collections, pastel type dot + item count, INDEPENDENTLY scrollable via
//   min-height: 0) · the pinned profile block (side-foot, margin-top: auto)
//   with the probed role and the theme toggle.
//
// Data flow (D1): GET /libraries renders names + dots immediately; the
// per-library summary counts load asynchronously and MUST NOT block opening —
// the whole panel content mounts only while open, so closed sessions fire no
// library requests at all.
//
// INV-pure-delegation holds: every network call goes through the queries
// hooks or apiRequest. The one inline query is the role probe (D7 — the role
// label is PROBED, not asserted): GET /admin/status succeeding → "admin",
// 403 or any failure → "client".

// INV-fixed-key: the sidebar open-state key (mirrors mellifera.theme /
// mellifera.token). Drift = bug.
export const SIDE_KEY = "mellifera.side";

// readStoredSide — the persisted open choice, defaulting to CLOSED (hidden by
// default) when absent/unreadable. Guarded like lib/auth.ts (private-mode /
// quota-safe): an unavailable store degrades to closed, never a crash.
function readStoredSide(): boolean {
  try {
    return localStorage.getItem(SIDE_KEY) === "open";
  } catch {
    return false;
  }
}

// storeSide persists verbatim ("open" | "closed"); a throwing store is
// tolerated — the panel still works for the session.
function storeSide(open: boolean): void {
  try {
    localStorage.setItem(SIDE_KEY, open ? "open" : "closed");
  } catch {
    // see readStoredSide
  }
}

// dotClass — the pastel type dot per module_id (small accents over the slate
// token base; the shipped palette question stays open, so these are markers,
// not a retheme). Unknown module ids get the audiobook sky rather than
// nothing — a new type must still render a navigable entry.
function dotClass(moduleId: string): string {
  switch (moduleId) {
    case "serial":
      return "dot dot-serial";
    case "tv":
      return "dot dot-tv";
    case "image":
      return "dot dot-image";
    default:
      return "dot dot-audio";
  }
}

// sideLinkClass — full-width clickable nav rows (icon + label); the active
// page's row is highlighted with the primary token.
function sideLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "slink",
    isActive && "slink-active",
  );
}

// collLinkClass — collection entries highlight while their collection page is
// open (the active-type accent; detail-page parent highlighting lands with the
// group-5 collection bodies).
function collLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "clink",
    isActive && "clink-active",
  );
}

export default function Sidebar(): ReactElement {
  // open is React state ONLY so handlers re-render; the DOM effect is the
  // body-class toggle (a single stable writer, like applyTheme).
  const [open, setOpen] = useState<boolean>(() => readStoredSide());

  const close = useCallback(() => {
    setOpen(false);
    storeSide(false);
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    storeSide(true);
  }, []);

  // The body class drives every CSS mechanic (slide, FAB visibility, content
  // offset). Cleanup on unmount keeps other surfaces (none today, but /login
  // mounts a different tree) free of a stale open state.
  useEffect(() => {
    document.body.classList.toggle("side-open", open);
    return () => {
      document.body.classList.remove("side-open");
    };
  }, [open]);

  // Escape closes while open — the keyboard twin of the panel chevron.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        className="menu-fab"
        aria-label="Open menu"
        aria-controls="mellifera-side"
        aria-expanded={open}
        onClick={openPanel}
      >
        <Menu aria-hidden="true" />
      </button>

      <aside id="mellifera-side" className="side" aria-label="Sidebar" aria-hidden={!open}>
        {open ? (
          <>
            <div className="side-top">
              <button
                type="button"
                className="side-toggle"
                aria-label="Close menu"
                onClick={close}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <span className="side-brand">Mellifera</span>
            </div>

            <SideNav />
            <SideFoot />
          </>
        ) : null}
      </aside>
    </>
  );
}

// SideNav — Home/Admin icon nav with the side-colls list between them. The
// list is the ONLY flexible element (flex: 1 + min-height: 0 +
// overflow-y: auto), so Home/Admin stay pinned while 20+ collections scroll.
function SideNav(): ReactElement {
  const libraries = useLibraries();
  const libs: LibraryDTO[] = libraries.data?.items ?? [];

  return (
    <nav className="side-nav" aria-label="Primary">
      <NavLink to="/" end className={sideLinkClass}>
        <House aria-hidden="true" />
        <span className="lbl">Home</span>
      </NavLink>

      <span className="side-label">
        Collections{libs.length > 0 ? ` · ${libs.length}` : ""}
      </span>
      <div className="side-colls">
        {libraries.isLoading ? (
          <span className="side-label">Loading…</span>
        ) : libraries.error ? (
          <span className="side-label">Collections unavailable</span>
        ) : (
          libs.map((lib) => <SideColl key={lib.id} lib={lib} />)
        )}
      </div>

      <NavLink to="/admin" className={sideLinkClass}>
        <Settings2 aria-hidden="true" />
        <span className="lbl">Admin</span>
      </NavLink>
    </nav>
  );
}

// SideColl — one collection entry: pastel dot, name, item count. The count
// comes from the summary hook asynchronously; while it is in flight the entry
// renders WITHOUT the count (never a spinner, never a placeholder that
// shifts layout) — opening the panel never waits on summaries (D1).
function SideColl(props: { lib: LibraryDTO }): ReactElement {
  const { lib } = props;
  const summary = useLibrarySummary(lib.id);

  return (
    <NavLink to={`/collections/${lib.id}`} className={collLinkClass}>
      <span className={dotClass(lib.module_id)} aria-hidden="true" />
      <span className="lbl">{lib.display_name}</span>
      <span className="cnt">
        {summary.data ? String(summary.data.items) : ""}
      </span>
    </NavLink>
  );
}

// SideFoot — the PINNED profile block (margin-top: auto pushes it to the
// panel bottom regardless of list length) plus the theme toggle. The role is
// probed once per session (D7): success → "admin", 403/failure → "client".
// The path is inlined here (same route as ENDPOINTS.adminStatus) so the probe
// stays self-contained, mirroring how queries.ts inlines its GET paths.
function SideFoot(): ReactElement {
  const role = useQuery({
    queryKey: ["admin-role"],
    queryFn: async () => {
      await apiRequest<AdminStatus>("/api/v1/admin/status");
      return "admin" as const;
    },
    retry: false,
    staleTime: Infinity,
  });

  const roleLabel = role.isSuccess ? "admin" : role.isError ? "client" : "…";

  return (
    <div className="side-foot">
      <div className="profile">
        <span className="avatar" aria-hidden="true">OP</span>
        <span className="pinfo">
          <b>Operator</b>
          <small>{roleLabel}</small>
        </span>
      </div>
      <ThemeToggle />
    </div>
  );
}
