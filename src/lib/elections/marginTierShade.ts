/**
 * Turning a margin tier into a colour.
 *
 * Certainty is distance from the ground the tile sits on: safe is the party
 * colour at full strength, toss-up has almost faded into the page behind it.
 * This reads the same on paper and dark screens, and matches printed election
 * maps (a pale pink county is a lean, not a landslide). Mixing toward a caller
 * named ground fixes both ends and leaves one rule to reason about.
 */

import type { MarginTier } from "./generalViewModel";

/**
 * How far each tier travels from the party colour toward the ground.
 *
 * Roughly even perceptual steps: each tier is about half as present as the one
 * above it. `safe` keeps the colour whole so the states a ticket has actually
 * put away are the loudest thing on the board.
 */
export const TIER_GROUND_MIX: Record<MarginTier, number> = {
  safe: 0,
  likely: 0.34,
  lean: 0.62,
  tossup: 0.82,
};

/** Parse `#rgb`, `#rrggbb` or `rgb(r, g, b)`. Null when it is none of those. */
function parseColor(color: string): [number, number, number] | null {
  const hex = color.trim();
  if (hex.startsWith("#")) {
    const body = hex.slice(1);
    const full =
      body.length === 3
        ? body
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : body;
    if (full.length !== 6) return null;
    const n = [full.slice(0, 2), full.slice(2, 4), full.slice(4, 6)].map((p) => parseInt(p, 16));
    return n.some(Number.isNaN) ? null : [n[0], n[1], n[2]];
  }
  const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(hex);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Shade a party colour by how safe the state is, against the ground behind it.
 *
 * `ground` is required rather than defaulted: the same tier is a different
 * colour on a dark board than on a white map, and a caller that has not
 * thought about which one it is will get the wrong ramp. Returns `color`
 * untouched when either colour cannot be parsed, so a bad value shows as
 * itself instead of black.
 */
export function shadeColorForTier(color: string, tier: MarginTier, ground: string): string {
  const c = parseColor(color);
  const g = parseColor(ground);
  if (!c || !g) return color;
  const t = TIER_GROUND_MIX[tier];
  const mix = (i: number) => Math.round(c[i] + (g[i] - c[i]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/**
 * Ink that stays legible on a shade.
 *
 * Follows the shade's own lightness rather than the tier. The two used to be
 * treated as the same question — "lean and toss-up are near-white, so ink them
 * dark" — which was only ever true while the ramp ran toward white. Reading
 * the colour itself holds whichever ground it was mixed against.
 */
export function readableInk(background: string): string {
  const c = parseColor(background);
  if (!c) return "#ffffff";
  // Rec. 601 luma, which is close enough for picking one of two inks.
  const luma = (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000;
  return luma > 150 ? "#14141c" : "#ffffff";
}
