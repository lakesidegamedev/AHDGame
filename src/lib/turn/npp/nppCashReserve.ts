import { getEraNominalAmount } from "@/lib/constants/sectorSeedEra";
import { ceoArchetypeModifiers } from "@/lib/turn/ceoArchetype";
import {
  CASH_FLOOR,
  DEFAULT_ARCHETYPE,
  SAFE_CASH_FLOOR_MIN,
} from "@/lib/turn/npp/nppCorporationTuning";

/**
 * The anchor-denominated cash reserve an autonomous NPP corporation must keep.
 * Keep this in one place so turn decisions and owner-issued commands enforce
 * the same personality-adjusted safety rail.
 */
export function getNppCashFloorAnchor(
  preset?: string,
  cashFloorMult = ceoArchetypeModifiers(DEFAULT_ARCHETYPE).cashFloorMult
): number {
  return Math.max(
    getEraNominalAmount(SAFE_CASH_FLOOR_MIN, preset),
    Math.round(getEraNominalAmount(CASH_FLOOR, preset) * cashFloorMult)
  );
}
