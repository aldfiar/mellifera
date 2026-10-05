// SPDX-License-Identifier: Apache-2.0
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn() — shadcn class-name helper. clsx resolves conditionals; tailwind-merge
// dedupes conflicting Tailwind utilities so variant overrides win.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
