import { resolveLegacyTechContext, type LegacyTechContext } from "@/lib/techTree/rules/legacyTech";
import { STARTING_YEAR } from "@/lib/constants/turnTime";
import type { CorporationLookups } from "../types";

/** The tech era context for the turn being processed ("off" when `legacyTechMode` is absent). */
export function legacyTechContextFromLookups(
  lookups: Pick<CorporationLookups, "legacyTechStartingYear" | "legacyTechMode">
): LegacyTechContext {
  return resolveLegacyTechContext({
    startingYear: lookups.legacyTechStartingYear ?? STARTING_YEAR,
    mode: lookups.legacyTechMode,
  });
}
