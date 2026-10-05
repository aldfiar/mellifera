// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import Libraries from "@/pages/admin/Libraries";
import Status from "@/pages/admin/Status";

// Admin — the admin-panel shell (AC-2/AC-4). It is the route target for
// /admin/* (App.tsx INV-root-redirect-2a → /admin in 2a) and the default
// export that resolves the T06 import `@/pages/admin/Admin` (the deferred
// gate that this task unblocks).
//
// The shell is a simple two-section switcher — Libraries (T08) and Status
// (T10) — with a tab-style nav. Phase 2a owns admin only; browse/detail live
// in 2b and are intentionally absent here.
type Section = "libraries" | "status";

export default function Admin(): ReactElement {
  const [section, setSection] = useState<Section>("libraries");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">Mellifera admin</h1>
          <nav className="flex gap-1" aria-label="Admin sections">
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
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {section === "libraries" ? <Libraries /> : <Status />}
      </main>
    </div>
  );
}
