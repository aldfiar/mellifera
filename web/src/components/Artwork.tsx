// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

// Artwork — the poster slot (artwork 3.2): PosterFrame renders a blob <img>
// when the authenticated channel resolved the served art URL, else the
// deterministic generated fallback — never a broken-image glyph (a decode
// failure swaps the img for the fallback), never a blank span. The
// fallbackGradient vector is golden-tested in Artwork.test.tsx.

// GradientVector — the pure fallback vector: two pastel HSL stops plus the
// name's first grapheme as the initial.
export interface GradientVector {
  from: string; // "hsl(h s% l%)" — the gradient's first stop
  to: string; // the gradient's second stop
  initial: string; // first grapheme, verbatim ("" for an empty name)
}

// fnv1a — 32-bit FNV-1a over the string's UTF-16 code units. Chosen because
// it is deterministic across engines (no Math.random, no Date, no locale
// collation) and avalanche-y enough that distinct names almost always land
// on distinct hue pairs.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// firstGrapheme — the name's first user-perceived character: an
// Intl.Segmenter grapheme when the platform segments (surrogate pairs and
// combining marks stay ONE character), the first code point otherwise. The
// character rides through VERBATIM — Cyrillic is never transliterated or
// case-folded (the mockup's «С» stays «С»).
function firstGrapheme(s: string): string {
  const trimmed = s.trim();
  if (trimmed === "") {
    return "";
  }
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segments = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(trimmed);
    const first = segments[Symbol.iterator]().next();
    if (!first.done) {
      return first.value.segment;
    }
  }
  return Array.from(trimmed)[0] ?? "";
}

// fallbackGradient — the PURE name → vector function (artwork 3.2): the
// FNV-1a hash picks two hues (the second offset +40..+119° from the first),
// both stops pinned to pastel lightness/saturation bands so any name lands
// on a quiet card. Exported pure for the golden tests.
export function fallbackGradient(name: string): GradientVector {
  const h = fnv1a(name);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + (Math.floor(h / 360) % 80)) % 360;
  return {
    from: `hsl(${String(hue1)} 68% 82%)`,
    to: `hsl(${String(hue2)} 62% 74%)`,
    initial: firstGrapheme(name),
  };
}

// PosterFrame — the ONE poster slot (artwork 3.2): a blob <img> when `src`
// resolved, else the deterministic generated fallback for `name`. The
// fallback carries role="img" + the name as its accessible label, so both
// shapes read the same to a screen reader. `className` lands on BOTH shapes
// so the surface keeps its layout (the collection card's .scard-poster
// ratio, the header's rounded frame); the img adds object-cover so any
// aspect boxes the bytes without distortion.
export function PosterFrame(props: {
  src: string | null;
  name: string;
  className?: string;
}): ReactElement {
  const [failed, setFailed] = useState(false);

  // A new src gets a clean slate — a failed URL must not poison its
  // successor (the override changed under the same card).
  useEffect(() => {
    setFailed(false);
  }, [props.src]);

  const g = fallbackGradient(props.name);
  if (props.src === null || failed) {
    return (
      <span
        role="img"
        aria-label={props.name}
        className={cn(
          "block aspect-[2/3] w-full select-none",
          props.className,
        )}
        style={{ background: `linear-gradient(140deg, ${g.from}, ${g.to})` }}
      >
        <span
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center text-4xl font-semibold text-foreground/70"
        >
          {g.initial}
        </span>
      </span>
    );
  }
  return (
    <img
      src={props.src}
      alt={props.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("block w-full object-cover", props.className)}
    />
  );
}
