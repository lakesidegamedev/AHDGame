import type { ExtractableResource } from "@/lib/constants/commodities";
import { climateProfileForStartingYear } from "@/lib/crises/rules/climateFeedback";
import { DEPOSIT_RESERVE_TURNS, type DepletableCapacityDoc } from "@/lib/extraction/depletion";
import { prospectDepletionMultiplier } from "./rules";

/**
 * Survey cost multiplier for a deposit in an energy transition world: from
 * 2035 a worked-out field costs more to survey again. 1 in every other world.
 */
export function depositProspectCostMultiplier(
  cap: DepletableCapacityDoc | null | undefined,
  resource: ExtractableResource,
  era: { year: number | null; startingYear: number | null }
): number {
  if (!cap || era.year == null) return 1;
  if (!climateProfileForStartingYear(era.startingYear ?? undefined).broaderEffects) return 1;
  const reserves = Math.max(0, cap.resources?.[resource] ?? 0) * DEPOSIT_RESERVE_TURNS;
  return prospectDepletionMultiplier(cap.extractedUnits?.[resource] ?? 0, reserves, era.year);
}
