/**
 * Live defence tender floors from current lot prices and commodity ratios.
 * Kept pure so publish, bid refresh and the access form share one calculation.
 */
import type { UnitDomain } from "@/lib/db/types/militaryUnit";
import { DEFENCE_STRATEGY_COMPONENT } from "@/lib/military/arsenalComponents";
import {
  GRADE_PRICE_SCALE,
  lotPriceBand,
  lotProductionCost,
  normalizeGrade,
} from "@/lib/military/defenceLotEconomics";
import type { CommodityPriceRatios } from "@/lib/military/defencePriceRatios";

/**
 * Lowest compatible plant bid floor for a defence component and grade at the live anchor.
 * Returns null when no strategy yields a usable band.
 */
export function defenceLiveLotFloor(input: {
  component: UnitDomain;
  grade: number;
  anchor: number;
  ratios: CommodityPriceRatios;
}): number | null {
  const { component, grade, anchor, ratios } = input;
  if (!(anchor > 0) || !Number.isFinite(anchor)) return null;
  let minimum = Infinity;
  for (const [strategy, components] of Object.entries(DEFENCE_STRATEGY_COMPONENT)) {
    if (!components.includes(component)) continue;
    const cost = lotProductionCost(strategy, anchor, ratios);
    const band =
      cost == null ? null : lotPriceBand({ anchorPrice: anchor, productionCost: cost, grade });
    if (band && Number.isFinite(band.floor) && band.floor > 0)
      minimum = Math.min(minimum, band.floor);
  }
  return Number.isFinite(minimum) ? minimum : null;
}

/**
 * Default tender maximum for the publish form: the graded anchor, never below the live floor.
 * At yen scale the floor can sit on the anchor when input costs are at the index cap.
 */
export function suggestedDefenceMaximumPricePerLot(input: {
  anchor: number;
  grade: number;
  liveFloor?: number | null;
}): number | null {
  const { anchor, grade, liveFloor } = input;
  if (!(anchor > 0) || !Number.isFinite(anchor)) return null;
  const graded = Math.max(1, Math.round(anchor * GRADE_PRICE_SCALE[normalizeGrade(grade)]));
  const floor =
    liveFloor != null && Number.isFinite(liveFloor) && liveFloor > 0 ? Math.ceil(liveFloor) : 0;
  return Math.max(graded, floor);
}
