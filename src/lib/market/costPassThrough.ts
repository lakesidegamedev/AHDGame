/**
 * Producer cost pass-through for commodity price formation.
 *
 * Supply/demand alone lets a commodity trade below its inputs' cost. Each
 * producing sector's rate-weighted average of damped LAGGED input price
 * factors is its input-cost index. When that index exceeds 1, the commodity's
 * base price is lifted before supply/demand applies:
 *
 *     multiplier = min(CAP, 1 + BETA x (index - 1)), floored at 1
 *
 * Deliberate properties:
 *  - FLOOR AT 1: cheap inputs never discount below supply/demand's price;
 *    only cost squeezes are transmitted. It is a floor-lifter, not a price-setter.
 *  - Uses realized price factors with the input bill's exponent and clamp, so
 *    a quote beyond the billed ceiling cannot keep lifting cost pressure.
 *    Existing price adjustment eases the new target in over turns.
 *  - LAGGED ratios (prior turn's prices), matching the input bill's lag, so
 *    there is no same-turn circularity.
 *  - BETA 0.5: producers eat half the squeeze, pass half. Chained recipes
 *    converge geometrically instead of compounding; CAP bounds the worst case.
 *  - Gives shortages a remediation path: expensive inputs raise output prices,
 *    raising margins, attracting supply.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { SECTOR_DEMAND, SECTOR_SUPPLY } from "@/lib/constants/commodities";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import { producerInputCostIndex } from "./rules/producerInputCostIndex";

/** Share of a producer's input-cost excess passed into its output price. */
export const COST_PASS_THROUGH_BETA = 0.5;
/** Hard ceiling on the pass-through multiplier. */
export const COST_PASS_THROUGH_CAP = 1.75;

/**
 * Rate-weighted realized input cost index for a sector type. 1 when the sector
 * has no recipe or every ratio is missing (missing ratio = at base = 1).
 */
export function sectorInputCostIndex(
  sectorType: OperatingSectorType,
  priceRatios: ReadonlyMap<CommodityType, number>
): number {
  const recipe = SECTOR_DEMAND[sectorType];
  if (!recipe || recipe.length === 0) return 1;
  return producerInputCostIndex(recipe, priceRatios);
}

/** commodity -> its producing sector types, weighted by output rate. */
const PRODUCERS_BY_COMMODITY: ReadonlyMap<
  CommodityType,
  { sectorType: OperatingSectorType; weight: number }[]
> = (() => {
  const map = new Map<CommodityType, { sectorType: OperatingSectorType; weight: number }[]>();
  for (const [sectorType, outputs] of Object.entries(SECTOR_SUPPLY)) {
    for (const { commodity, rate } of outputs ?? []) {
      if (!(rate > 0)) continue;
      const list = map.get(commodity) ?? [];
      list.push({ sectorType: sectorType as OperatingSectorType, weight: rate });
      map.set(commodity, list);
    }
  }
  return map;
})();

/**
 * The pass-through multiplier for one commodity given lagged price ratios.
 * >= 1 always; 1 for commodities nothing produces (pure-extraction resources
 * keep their existing pricing untouched).
 */
export function costPassThroughMultiplier(
  commodity: CommodityType,
  priceRatios: ReadonlyMap<CommodityType, number>
): number {
  const producers = PRODUCERS_BY_COMMODITY.get(commodity);
  if (!producers || producers.length === 0) return 1;
  let weighted = 0;
  let totalWeight = 0;
  for (const { sectorType, weight } of producers) {
    weighted += weight * sectorInputCostIndex(sectorType, priceRatios);
    totalWeight += weight;
  }
  const index = totalWeight > 0 ? weighted / totalWeight : 1;
  if (!(index > 1)) return 1;
  return Math.min(COST_PASS_THROUGH_CAP, 1 + COST_PASS_THROUGH_BETA * (index - 1));
}
