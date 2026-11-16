import type { MapOverviewResponse } from "@/lib/map/overviewTypes";
import type { OperatingSectorType } from "@/lib/constants/corporations";

export type LeanAxis = "economic" | "social" | "display";

/** Numeric lean for the selected axis from a map-overview lean entry. */
type LeanFillSource = {
  economicLean: number;
  socialLean: number;
  displayLean?: number;
  /** Lean from the country's even split between its two main parties. */
  labelEconomicLean?: number;
  labelSocialLean?: number;
  labelDisplayLean?: number;
};

/** The value a lean fill shades: centred on the even split when the server sends it. */
export function leanAxisValue(d: LeanFillSource, axis: LeanAxis): number {
  if (axis === "economic") return d.labelEconomicLean ?? d.economicLean;
  if (axis === "social") return d.labelSocialLean ?? d.socialLean;
  return d.labelDisplayLean ?? d.displayLean ?? (d.economicLean + d.socialLean) / 2;
}

/**
 * Symmetric colour-scale half-range for a lean map: the largest |lean| shown on
 * the selected axis, floored at 0.5 and rounded up to one decimal so the legend
 * endpoints read cleanly. Symmetric so zero always sits on the neutral centre.
 */
export function leanHalfRange(
  lean: Record<string, LeanFillSource>,
  axis: LeanAxis
): number {
  let max = 0;
  for (const d of Object.values(lean)) {
    max = Math.max(max, Math.abs(leanAxisValue(d, axis)));
  }
  return Math.max(0.5, Math.ceil(max * 10) / 10);
}

export function interpolateGreen(t: number): string {
  const r = Math.round(220 - t * 160);
  const g = Math.round(240 - t * 80);
  const b = Math.round(200 - t * 160);
  return `rgb(${r},${g},${b})`;
}

export const NATION_COLORS: Record<string, string> = {
  ENG: "#4f7ac7",
  SCO: "#1a5fa8",
  WAL: "#2a7c3e",
  NIR: "#7a4ba8",
};

const SECTOR_MAP_COLORS: Record<OperatingSectorType, string> = {
  financial: "#10b981",
  media: "#3b82f6",
  manufacturing: "#f97316",
  chemical_industries: "#22c55e",
  healthcare: "#f43f5e",
  retail: "#8b5cf6",
  technology: "#06b6d4",
  energy: "#eab308",
  agriculture: "#84cc16",
  real_estate: "#f59e0b",
  construction: "#fb923c",
  defense: "#64748b",
  telecommunications: "#6366f1",
  logistics: "#78716c",
  extraction: "#737373",
};

export function sectorSpecializationMapEntry(
  id: string,
  name: string,
  mapData: MapOverviewResponse | null
): { color: string; label: string; tooltip: string[] } {
  const spec = mapData?.sectorSpecializations?.[id];
  if (!spec) {
    return { color: "#334155", label: name, tooltip: [name, "No sector bonus seeded"] };
  }
  return {
    color: SECTOR_MAP_COLORS[spec.primary] ?? "#334155",
    label: spec.primaryLabel,
    tooltip: spec.tooltip ?? [
      name,
      `Primary: ${spec.primaryLabel} (+10pp)`,
      `Secondary: ${spec.secondaryLabel} (+5pp)`,
    ],
  };
}
