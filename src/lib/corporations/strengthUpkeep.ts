/**
 * Strength upkeep: corporate strength has to be maintained, not banked.
 *
 * Owner decision 2026-10-20 (contestability plan). Marketing strength now
 * decays like logistics and R&D, group synergy moves strength from the group
 * leader instead of creating it, and the tech dominance shield is capped and
 * expires with its decade. Split attacks and defence read a corporation's
 * stored marketing strength, which with synergy as a transfer is its own.
 *
 * Rolled out one stage per turn through `gameConfig.strengthUpkeepStage`
 * (0 or absent = off). Each stage includes the ones before it.
 */
import type { Db } from "mongodb";
import {
  getSectorTechEffects,
  getSectorTechEffectsForYear,
  type TechCorpView,
} from "@/lib/constants/techTree";
import type {
  ManufacturingIndustryModel,
  MediaDiscriminator,
  OperatingSectorType,
} from "@/lib/constants/corporations";
import {
  DOMINANCE_SHIELD_UPKEEP_CAP,
  STRENGTH_UPKEEP_STAGE,
  strengthUpkeepActive,
} from "./strengthUpkeepRules";

export {
  DOMINANCE_SHIELD_UPKEEP_CAP,
  MARKETING_DECAY_RATE,
  STRENGTH_UPKEEP_STAGE,
  marketingStrengthAfterTurn,
  strengthUpkeepActive,
} from "./strengthUpkeepRules";

export async function loadStrengthUpkeepStage(db: Db): Promise<number> {
  const cfg = await db
    .collection<{ _id: string; strengthUpkeepStage?: number }>("gameConfig")
    .findOne({ _id: "default" }, { projection: { strengthUpkeepStage: 1 } });
  const stage = cfg?.strengthUpkeepStage;
  return typeof stage === "number" && Number.isFinite(stage) ? stage : 0;
}

/**
 * The tech dominance shield a build actually gets. Before the shield stage it
 * is every owned node's shield (aggregate cap TECH_SHIELD_CAP). From the shield
 * stage it counts only nodes from the current and previous decade, like the
 * running plant effects, and is capped at DOMINANCE_SHIELD_UPKEEP_CAP.
 */
export function upkeptDominanceShield(
  corp: TechCorpView,
  sectorType: OperatingSectorType,
  industryModel: ManufacturingIndustryModel | null | undefined,
  mediaDiscriminator: MediaDiscriminator | null | undefined,
  currentYear: number | null | undefined,
  stage: number | null | undefined
): number {
  if (
    !strengthUpkeepActive(stage, STRENGTH_UPKEEP_STAGE.SHIELD) ||
    typeof currentYear !== "number" ||
    !Number.isFinite(currentYear)
  ) {
    return getSectorTechEffects(corp, sectorType, industryModel, mediaDiscriminator)
      .dominanceShield;
  }
  return Math.min(
    DOMINANCE_SHIELD_UPKEEP_CAP,
    getSectorTechEffectsForYear(corp, sectorType, currentYear, industryModel, mediaDiscriminator)
      .dominanceShield
  );
}
