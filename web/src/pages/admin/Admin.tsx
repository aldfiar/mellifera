// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import Libraries from "@/pages/admin/Libraries";
import Status from "@/pages/admin/Status";

// Admin — the admin-panel body (AC-2/AC-4). It is the route target for
// /admin/* inside the sidebar shell (App.tsx): the top navigation header and
// its AppNav row are GONE (web-ui-phase-3 group 3) — the Sidebar owns
// navigation, and the page renders as plain content in .app-content.
//
// The shell is a simple two-section switcher — Libraries (T08) and Status
// (T10) — with a tab-style nav. (Group 5 re-scopes this panel to collections
// management and removes the Status section.)
type Section = "libraries" | "status";

export default function Admin(): ReactElement {
  const [section, setSection] = useState<Section>("libraries");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <nav className="mb-4 flex gap-1" aria-label="Admin sections">
        <Button
          variant={section === "libraries" ? "default" : "ghost"}
          size="sm"
          onClick={() => setSection("libraries")}
          aria-current={section === "libraries"}
        >
          Libraries
        </Button>
        <Button
          variant={section === "status" ? "default" : "ghost"}
          size="sm"
          onClick={() => setSection("status")}
          aria-current={section === "status"}
        >
          Status
        </Button>
      </nav>

      {section === "libraries" ? <Libraries /> : <Status />}
    </main>
  );
}
