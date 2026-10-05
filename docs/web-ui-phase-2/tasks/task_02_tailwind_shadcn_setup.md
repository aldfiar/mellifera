# Task 02 — Tailwind CSS + shadcn/ui setup (copy-in primitives)

- **Type:** coder
- **Outline Step:** 2 (Tailwind + shadcn/ui setup)
- **Seams:** none new (styling layer; consumed by T07-T10 UI)
- **AC trace:** AC-2, AC-4, AC-6
- **Project scope:** `mellifera`
- **Deps:** T01 (package.json + postcss.config.js present, `npm install` run)
- **Estimated LOC:** ~250 (8 copy-in primitives + 2 config files)

## Context

- **why:** T07-T10 (Login, Admin, Libraries, Status) need styled form controls + a table + badges + alerts. shadcn/ui = copy-in Radix primitives + `class-variance-authority` + `tailwind-merge` + `clsx` (Q1 decision). Tree-shakeable; no runtime CSS-in-JS (MUI rejected — emotion conflicts with Tailwind).
- **data_flow:** enters from: T01 postcss/tailwindcss deps → transforms: `web/src/**/*.tsx` class names via Tailwind → emits to: a compiled `assets/*.css` consumed by every page (T07-T10).
- **rationale:** shadcn copy-in is lower-total-complexity than plain Tailwind primitives for forms/tables/badges (architecture_review R3). Fallback if Steps 1-2 run >50% over: drop shadcn, use plain Tailwind (the DTOs/hooks/pages are unaffected — only the styling layer swaps). Only the primitives 2a uses are copied (`button, input, label, card, select, table, badge, alert`).

## behaviors

- B1: `web/tailwind.config.ts` registers the `content` globs (`./index.html`, `./src/**/*.{ts,tsx}`), the shadcn theme tokens (CSS vars for light/dark via `darkMode: 'class'`), and the `tailwindcss-animate` plugin. | ac: AC-6 | kind: normal
- B2: `web/src/styles/index.css` carries the Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`) + the shadcn CSS custom properties (`:root` + `.dark` palettes — background, foreground, primary, muted, border, ring). | ac: AC-6 | kind: normal
- B3: copy-in shadcn primitives land under `web/src/components/ui/` — `button.tsx`, `input.tsx`, `label.tsx`, `card.tsx`, `select.tsx`, `table.tsx`, `badge.tsx`, `alert.tsx` — each a Radix-backed, cva-styled, forwardRef component exporting the documented variants. | ac: AC-2 | kind: normal
- B4: each primitive composes class names via `cn()` (clsx + tailwind-merge) — a `web/src/lib/utils.ts` helper. | ac: AC-2 | kind: normal
- B5: `npx tsc --noEmit` passes with all 8 primitives + the config in place. | ac: AC-6 | kind: normal

## invariants

- **INV-shadcn-copy-in:** the primitives are VENDORED into `web/src/components/ui/` (copy-in). They are NOT imported from an `shadcn` npm package at runtime — there is no such package. Radix UI primitives (`@radix-ui/*`), `class-variance-authority`, `tailwind-merge`, `clsx` ARE npm deps (declared in T01 package.json).
- **INV-no-runtime-CSS-in-JS:** styling is compile-time Tailwind only. No emotion / styled-components / runtime CSS injection.
- **INV-2a-primitive-set:** only `{button, input, label, card, select, table, badge, alert}` are copied in 2a. Do NOT copy primitives 2a doesn't use (date-picker, dialog, etc.) — they're Phase-2b/c scope.

## precondition

T01 landed: `web/package.json` declares `tailwindcss`, `postcss`, `autoprefixer`, the Radix primitives, `class-variance-authority`, `tailwind-merge`, `clsx`, `tailwindcss-animate`; `web/postcss.config.js` wires tailwindcss+autoprefixer; `web/node_modules/` installed.
- evidence: T01 outputs; `web/README.md:20` (Tailwind CSS named in the toolchain).

## postcondition

(AC-2/AC-4/AC-6) The Tailwind + shadcn/ui styling layer is in place: `tailwind.config.ts` + `styles/index.css` + 8 copy-in primitives under `components/ui/` + a `cn()` helper. `npx tsc --noEmit` exits 0. The primitives are importable by T07-T10 via `@/components/ui/<name>`.

## test_seed

```
# arrange: T01 installed deps; this task created configs + 8 primitives + lib/utils.ts.
# act:     cd web && npx tsc --noEmit
# assert:  exit 0; each of the 8 files under web/src/components/ui/ exports its component;
#          grep -n "export" web/src/components/ui/{button,input,label,card,select,table,badge,alert}.tsx → each has an export.
```

## spec

```
Signatures (files to CREATE):
  web/tailwind.config.ts        # config({ darkMode:'class', content:[...], theme:{ extend:{ colors: <CSS-var mapping>, ... } }, plugins:[tailwindcss-animate] })
  web/src/styles/index.css      # @tailwind base/components/utilities; :root{ --background,... } .dark{ ... }
  web/src/lib/utils.ts          # export function cn(...inputs: ClassValue[]): string  (clsx + tailwind-merge)
  web/src/components/ui/button.tsx   # cva-styled button (variants: default/destructive/outline/secondary/ghost/link; sizes)
  web/src/components/ui/input.tsx    # styled <input>
  web/src/components/ui/label.tsx    # @radix-ui/react-label backed
  web/src/components/ui/card.tsx     # Card/CardHeader/CardTitle/CardContent/CardFooter composition
  web/src/components/ui/select.tsx   # @radix-ui/react-select backed (used by the module tv/image select in T08)
  web/src/components/ui/table.tsx    # Table/TableHeader/TableBody/TableRow/TableCell composition (libraries + status)
  web/src/components/ui/badge.tsx    # cva-styled badge (variants)
  web/src/components/ui/alert.tsx    # Alert/AlertTitle/AlertDescription (used by error rendering in T08/T09)

Steps:
  1. CREATE web/src/lib/utils.ts: `import { type ClassValue, clsx } from 'clsx'; import { twMerge } from 'tailwind-merge'; export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }`
  2. CREATE web/tailwind.config.ts: content globs, darkMode 'class', theme.extend.colors mapping to CSS vars (hsl(var(--background)) etc.), plugin tailwindcss-animate.
  3. CREATE web/src/styles/index.css: the three @tailwind directives + the shadcn :root + .dark CSS-var palettes.
  4. COPY-IN the 8 primitives under web/src/components/ui/ (standard shadcn/ui source; each: Radix-backed where applicable, cva variants, cn() composition, React.forwardRef). Add the Apache-2.0 header to each.
  5. Run `cd web && npx tsc --noEmit` → exit 0.
```

## allowed_imports

- `clsx`  # cn() helper
- `tailwind-merge`  # cn() helper
- `class-variance-authority`  # cva variants (button, badge)
- `@radix-ui/react-label`  # Label primitive
- `@radix-ui/react-select`  # Select primitive (used by the tv/image select in T08)
- `@radix-ui/react-slot`  # asChild pattern (shadcn button uses)
- `react`  # forwardRef, ReactNode
- `tailwindcss`  # config type (tailwind.config.ts)
- `tailwindcss-animate`  # plugin

## allowed_categories

- npm-dev (tailwindcss config types)

## callers_to_update

- (none — new files; T07-T10 import these primitives.)

## negative_examples

- "DO NOT import from an `shadcn` package at runtime — the primitives are copy-in under `@/components/ui/*` (INV-shadcn-copy-in)."
- "DO NOT copy primitives 2a doesn't use (INV-2a-primitive-set)."
- "DO NOT introduce emotion/styled-components — compile-time Tailwind only (INV-no-runtime-CSS-in-JS)."
- "DO NOT edit `internal/` Go files."

## existing_code_snapshot

```
(CREATE — T01 left web/src/ with only a main.tsx stub)
web/src/
  main.tsx   # T01 stub
```

## source_anchor

CREATE under `web/src/`. shadcn/ui primitives are the documented copy-in set (Q1 decision; `implementation_plan.md` Step 2; architecture_review R3). Theme tokens map to CSS custom properties (shadcn convention; Tailwind confirmed `web/README.md:20`).

## contract_test_scope

- (styling layer — no behavioral joint; verified by `tsc --noEmit` + downstream pages rendering. No joint test emitted here.)

## test_exclusions

- All 8 `web/src/components/ui/*.tsx` — copy-in shadcn primitives (vendor code; framework-styled, no project logic). Excluded from unit tests per stack-patterns (framework-generated/validated components).
- `web/tailwind.config.ts`, `web/src/styles/index.css` — config/CSS (no logic).
- `web/src/lib/utils.ts` `cn()` — pass-through wrapper (clsx + twMerge); trivial.

## scope_boundary

"CREATE only: `web/{tailwind.config.ts, src/styles/index.css, src/lib/utils.ts, src/components/ui/{button,input,label,card,select,table,badge,alert}.tsx}`. No other files."

## out_of_scope

- `internal/` Go files (UNCHANGED)
- T01 configs (`package.json`, `vite.config.ts`, `postcss.config.js`)
- page/component code that USES the primitives (T06-T10)

## line_budget

250 (flex 1.2 — copy-in verbosity)

## acceptance_criteria

- scenario: AC-2 | given: the admin add-library form (T08) | when: rendered | then: uses `@/components/ui/{input,label,select,button}` (this task provides them).
- scenario: AC-4 | given: the admin status table (T10) | when: rendered | then: uses `@/components/ui/table` + `badge` (this task provides them).
- scenario: AC-6 | given: the SPA source | when: type-checked | then: `tsc --noEmit` exits 0 (styling layer compiles).

## refactoring_checklist

- `ls web/src/components/ui/` → button, input, label, card, select, table, badge, alert (8 files).
- `grep -rn "from '@radix-ui" web/src/components/ui/` → only label/select/slot (the Radix-backed primitives).
- `cd web && npx tsc --noEmit` → exit 0.
- `grep -rn '"shadcn"' web/package.json` → absent (copy-in; no runtime shadcn import).

## skill_hint

`grounding`, `stack-patterns`
