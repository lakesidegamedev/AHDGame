import type { CSSProperties } from "react";
import { BLEND, FONT } from "@/components/blend/tokens";
import { readableInk, shadeColorForTier } from "@/lib/elections/marginTierShade";
import type { MarginTier } from "@/lib/elections/generalViewModel";

/**
 * Shared Campaign Manager styling, on Blend tokens. A selected chip inverts to
 * ink on the page colour; resting chips sit on the field ground.
 */

export function chipStyle(on: boolean, extra: CSSProperties = {}): CSSProperties {
  return {
    minHeight: 34,
    padding: "0 10px",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: FONT.sans,
    fontSize: 13,
    fontWeight: 600,
    background: on ? BLEND.ink : BLEND.field,
    color: on ? BLEND.page : BLEND.ink,
    border: `1px solid ${on ? BLEND.ink : BLEND.hairlineStrong}`,
    ...extra,
  };
}

export function segmentStyle(on: boolean): CSSProperties {
  return {
    minHeight: 32,
    border: 0,
    borderRadius: 7,
    cursor: "pointer",
    fontFamily: FONT.sans,
    fontSize: 13,
    fontWeight: 600,
    background: on ? BLEND.ink : "transparent",
    color: on ? BLEND.page : BLEND.muted,
  };
}

export const EYEBROW: CSSProperties = {
  fontFamily: FONT.sans,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: BLEND.muted,
};

export const MONO_COUNT: CSSProperties = { fontFamily: FONT.mono, fontSize: 11, opacity: 0.75 };

/** A party's shade at a tier on this ground, with an ink that reads on it. */
export function tierShade(
  color: string,
  tier: MarginTier,
  ground: string
): { fill: string; ink: string } {
  const fill = shadeColorForTier(color, tier, ground);
  return { fill, ink: readableInk(fill) };
}

export function ratingChipStyle(fill: string, ink: string): CSSProperties {
  return {
    flex: "none",
    alignSelf: "flex-start",
    fontFamily: FONT.sans,
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 6,
    background: fill,
    color: ink,
    whiteSpace: "nowrap",
  };
}
