import type { OperatingSectorType } from "@/lib/constants/corporations";
import {
  getSectorTechEffects,
  type LegacyTechContext,
  type TechCorpView,
} from "@/lib/constants/techTree";

/**
 * Resolve the tech-tree growth-cost multiplier for a corp's sector of the given
 * type. Scoped per sector type so the preview matches
 * what the turn engine charges (Corporate-lane reduced + primary-only Sector-lane).
 */
export async function getCorpTechGrowthCostMultiplier(
  corp: TechCorpView,
  sectorType: OperatingSectorType,
  legacy: LegacyTechContext
): Promise<number> {
  return getSectorTechEffects(corp, sectorType, legacy).growthCostMultiplier;
}
