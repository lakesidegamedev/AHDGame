import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
/**
 * First-plant founding: one facility quantum + era-scaled entry fee.
 *
 * Entering a market is a first build, so use one facility (`plantSizeUnits`)
 * rather than a revenue-derived facility count, which breaks era scaling.
 * The entry fee (SECTOR_EXPANSION_BASE_COST) is a modern constant and must be
 * era-deflated to match corp treasuries.
 *
 * expandSector, expand-suggestions, and NPP founding MUST call these helpers
 * so the quote and the charge cannot drift.
 */

import { eraForPreset } from "@/lib/seeds/presetSelector";
import type { CorporationType } from "@/lib/constants/corporations";
import { SECTOR_EXPANSION_BASE_COST } from "@/lib/constants/corporations";
import { plantSizeUnits } from "@/lib/constants/facilityQuantum";
import type { ManufacturingIndustryModel } from "@/lib/constants/corporations";
import type { MediaDiscriminator } from "@/lib/constants/corporations";
import { getEraNominalAmount } from "@/lib/constants/sectorSeedEra";

/** Capacity units ordered for a greenfield first plant (one facility). */
export function foundingStarterUnits(
  sectorType: CorporationType,
  industryModel?: ManufacturingIndustryModel | null,
  mediaDiscriminator?: MediaDiscriminator | null
): number {
  return plantSizeUnits(sectorType, industryModel, mediaDiscriminator);
}

/**
 * Land/permits/licences fee for entering a (state, type) market, in ₳, scaled
 * to the world's era money. `expansionDiscount` is the tech-tree fraction in
 * [0, 1] (already capped upstream).
 */
export function sectorEntryFeeAnchor(preset: string | undefined, expansionDiscount = 0): number {
  const disc =
    Number.isFinite(expansionDiscount) && expansionDiscount > 0
      ? Math.min(1, expansionDiscount)
      : 0;
  return Math.round(
    getEraNominalAmount(
      eraForPreset(preset ?? DEFAULT_SEED_PRESET) === "1991" ? 2_500 : SECTOR_EXPANSION_BASE_COST,
      preset
    ) *
      (1 - disc)
  );
}
