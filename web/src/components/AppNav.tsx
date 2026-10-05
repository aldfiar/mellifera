// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";

import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

// AppNav — the primary SPA nav: Browse (/browse) + Admin (/admin), plus the
// ThemeToggle (group 3) as the nav's right-hand control. Rendered in the Admin
// shell header and by the browse pages. NavLink drives the active style from
// the URL, so no per-page state is needed (the Admin section switcher stays a
// separate, page-local nav).
const linkClass = ({ isActive }: { isActive: boolean }): string =>
  cn(
    "rounded-md px-3 py-1.5 text-sm font-medium",
    isActive
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );

export default function AppNav(): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <nav className="flex gap-1" aria-label="Primary">
        <NavLink to="/browse" className={linkClass}>
          Browse
        </NavLink>
        <NavLink to="/admin" className={linkClass}>
          Admin
        </NavLink>
      </nav>
      <ThemeToggle />
    </div>
  );
}
