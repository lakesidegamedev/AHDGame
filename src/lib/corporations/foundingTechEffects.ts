import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { OperatingSectorIdentity } from "@/lib/constants/corporationsClient";
import { getSectorTechEffects } from "@/lib/constants/techTree";
import { isSectorTechTreesEnabled } from "@/lib/corporations/techTree/featureFlag";
import { loadStrengthUpkeepStage, upkeptDominanceShield } from "@/lib/corporations/strengthUpkeep";

export interface FoundingTechEffects {
  expansionDiscount: number;
  growthCostMultiplier: number;
  dominanceShield: number;
}

const NO_TECH: FoundingTechEffects = {
  expansionDiscount: 0,
  growthCostMultiplier: 1,
  dominanceShield: 0,
};

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
  corporation: Pick<
    Corporation,
    "type" | "industryModel" | "mediaDiscriminator" | "unlockedTechNodeIds" | "techDecadeLane"
  >,
  identity: OperatingSectorIdentity,
  currentYear: number
): Promise<FoundingTechEffects> {
  if (!(await isSectorTechTreesEnabled())) return NO_TECH;
  const techView = {
    type: corporation.type,
    industryModel: corporation.industryModel,
    mediaDiscriminator: corporation.mediaDiscriminator,
    unlockedTechNodeIds: corporation.unlockedTechNodeIds,
    techDecadeLane: corporation.techDecadeLane,
  };
  const effects = getSectorTechEffects(
    techView,
    identity.sectorType,
    identity.industryModel,
    identity.mediaDiscriminator
  );
  return {
    expansionDiscount: effects.expansionDiscount ?? 0,
    growthCostMultiplier: effects.growthCostMultiplier ?? 1,
    dominanceShield: upkeptDominanceShield(
      techView,
      identity.sectorType,
      identity.industryModel,
      identity.mediaDiscriminator,
      currentYear,
      await loadStrengthUpkeepStage(db)
    ),
  };
}
