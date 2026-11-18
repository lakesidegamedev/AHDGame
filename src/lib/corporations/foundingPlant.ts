import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
/**
 * First-plant founding: one facility quantum + era-scaled entry fee.
 *
 * Entering a market is a first build, so use one facility (`plantSizeUnits`)
 * rather than a revenue-derived facility count, which breaks era scaling.
 * Era-specific fee calibrations keep entry costs in line with starting budgets.
 *
 * expandSector, expand-suggestions, and NPP founding MUST call these helpers
 * so the quote and the charge cannot drift.
 */

import { eraForPreset, type EraId } from "@/lib/seeds/presetSelector";
import type { CorporationType } from "@/lib/constants/corporations";
import { SECTOR_EXPANSION_BASE_COST } from "@/lib/constants/corporations";
import { plantSizeUnits } from "@/lib/constants/facilityQuantum";
import { getEraNominalAmount } from "@/lib/constants/sectorSeedEra";

const SECTOR_ENTRY_FEE_BY_ERA: Partial<Record<EraId, number>> = {
  "1991": 2_500,
  "2027": 5_000,
};

/** Capacity units ordered for a greenfield first plant (one facility). */
export function foundingStarterUnits(sectorType: CorporationType): number {
  return plantSizeUnits(sectorType);
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
  const era = eraForPreset(preset ?? DEFAULT_SEED_PRESET);
  const fee = SECTOR_ENTRY_FEE_BY_ERA[era] ?? SECTOR_EXPANSION_BASE_COST;
  return Math.round(getEraNominalAmount(fee, preset) * (1 - disc));
}
