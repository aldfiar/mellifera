// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

// ThemeToggle — light/dark switch for the SPA (group 3, dark mode).
//
// Persistence + boot behavior:
//   - the choice persists in localStorage under the fixed key below
//     ("light" | "dark"); absent → the system preference (matchMedia) decides.
//   - the theme is expressed as the `dark` class on <html>
//     (document.documentElement), which tailwind.config.ts's
//     `darkMode: "class"` consumes; the CSS variables live in index.css.
//   - the boot apply runs in a mount effect: the toggle is in the admin shell
//     header, so every page load mounts it once and the class lands before
//     first paint of the themed content is noticeable.
// localStorage access is guarded like lib/auth.ts (private-mode / quota-safe):
// an unavailable store degrades to system-preference, never a crash.

// INV-fixed-key: matches contracts.md §Constants MELLIFERA_THEME_KEY. Drift = bug.
export const THEME_KEY = "mellifera.theme";

type Theme = "light" | "dark";

// readStoredTheme — the persisted choice, or null when absent/unreadable (the
// caller then falls back to the system preference).
function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

// storeTheme persists verbatim (lossless round-trip); a throwing store is
// tolerated — the toggle still works for the session.
function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // see readStoredTheme
  }
}

// systemTheme — the OS preference at call time ("dark" only when it says so).
function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// applyTheme — the single writer of the `dark` class on the root element.
function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle(): ReactElement {
  // theme is React state ONLY so the icon re-renders; the DOM effect is
  // applyTheme's class toggle (kept out of render for a stable writer).
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? systemTheme());

  // Boot: apply on mount, so a persisted/system choice colors the page even
  // if the operator never clicks the toggle.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function onToggle(): void {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={theme === "dark"}
      title="Toggle dark mode"
    >
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

// Boot apply — module-evaluation side effect, run ONCE. Sidebar (this
// module's only importer) renders inside the authed shell, but every route is
// reached through statically-imported App.tsx, so this executes at SPA
// startup on all pages and the persisted/system choice colors even the
// surfaces that never mount the toggle (e.g. /login). Idempotent (a class
// toggle), guarded like readStoredTheme.
applyTheme(readStoredTheme() ?? systemTheme());
