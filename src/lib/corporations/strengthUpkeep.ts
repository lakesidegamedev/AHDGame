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

export const STRENGTH_UPKEEP_STAGE = {
  /** Dominance shield capped at DOMINANCE_SHIELD_UPKEEP_CAP, expiring with its decade. */
  SHIELD: 1,
  /** Group synergy is paid for by the group leader. */
  SYNERGY_TRANSFER: 2,
  /** Marketing strength decays MARKETING_DECAY_RATE per turn. */
  MARKETING_DECAY: 3,
} as const;

/** Marketing strength lost per turn once decay is on (halved from 3% on 2026-10-22). */
export const MARKETING_DECAY_RATE = 0.015;

/** Most of the dominance toll a tech shield may remove once capped. */
export const DOMINANCE_SHIELD_UPKEEP_CAP = 0.5;

export function strengthUpkeepActive(stage: number | null | undefined, required: number): boolean {
  return typeof stage === "number" && Number.isFinite(stage) && stage >= required;
}

/** New marketing strength after one turn of decay (when on) and growth. */
export function marketingStrengthAfterTurn(
  current: number,
  growth: number,
  stage: number | null | undefined
): number {
  const base = Number.isFinite(current) ? Math.max(0, current) : 0;
  const decayed = strengthUpkeepActive(stage, STRENGTH_UPKEEP_STAGE.MARKETING_DECAY)
    ? base * (1 - MARKETING_DECAY_RATE)
    : base;
  return Math.max(0, decayed + (Number.isFinite(growth) ? growth : 0));
}

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
