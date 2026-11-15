import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import { getSectorTechEffects } from "@/lib/constants/techTree";
import { loadStrengthUpkeepStage, upkeptDominanceShield } from "@/lib/corporations/strengthUpkeep";

export interface FoundingTechEffects {
  expansionDiscount: number;
  growthCostMultiplier: number;
  dominanceShield: number;
}

/**
 * Tech-tree effects that price founding a sector in one lane.
 *
 * Scoped to the lane being founded, the same way `buildCapacity` scopes every
 * later build: a corporation's primary-lane research applies in full to its
 * primary lane and only generic research carries into an off-type lane. The
 * founding command and the expansion picker both read this, so the quote and
 * the charge use the same discounts.
 */
export async function loadFoundingTechEffects(
  db: Db,
  corporation: Pick<Corporation, "type" | "unlockedTechNodeIds" | "techDecadeLane">,
  sectorType: OperatingSectorType,
  currentYear: number
): Promise<FoundingTechEffects> {
  const techView = {
    type: corporation.type,
    unlockedTechNodeIds: corporation.unlockedTechNodeIds,
    techDecadeLane: corporation.techDecadeLane,
  };
  const effects = getSectorTechEffects(techView, sectorType);
  return {
    expansionDiscount: effects.expansionDiscount ?? 0,
    growthCostMultiplier: effects.growthCostMultiplier ?? 1,
    dominanceShield: upkeptDominanceShield(
      techView,
      sectorType,
      currentYear,
      await loadStrengthUpkeepStage(db)
    ),
  };
}
