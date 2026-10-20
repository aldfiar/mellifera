// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

// AdminTabs — the tab row shared by the three admin surfaces (Collections
// /admin, Sources /admin/sources, Plugins /admin/plugins; plugin-admin-surfaces
// D6): one source of the admin page list so the surfaces cannot drift apart.
// The active surface's tab is highlighted; the Collections tab is exact (it
// would otherwise match /admin/sources too).
function AdminTab(props: { to: string; label: string }): ReactElement {
  return (
    <NavLink
      to={props.to}
      end={props.to === "/admin"}
      className={({ isActive }) =>
        cn(
          "text-sm",
          isActive
            ? "font-semibold underline underline-offset-4"
            : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {props.label}
    </NavLink>
  );
}

export default function AdminTabs(): ReactElement {
  return (
    <nav className="flex gap-4" aria-label="Admin">
      <AdminTab to="/admin" label="Collections" />
      <AdminTab to="/admin/sources" label="Sources" />
      <AdminTab to="/admin/plugins" label="Plugins" />
    </nav>
  );
}
