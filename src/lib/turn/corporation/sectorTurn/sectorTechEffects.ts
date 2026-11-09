import type { AggregatedTechEffects } from "@/lib/constants/techTree";
import {
  getSectorTechEffects,
  getSectorTechEffectsForYear,
  withSunsetPenalty,
  NEUTRAL_TECH_EFFECTS,
} from "@/lib/constants/techTree";
import { withEnergyTransition } from "@/lib/energyTransition/policies";
import { withAutomationLevy } from "@/lib/automationPolicy/policies";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CorporationLookups } from "../types";

/**
 * Per-sector tech effects: Corporate-lane bonuses apply to every sector at
 * reduced strength; Sector-lane bonuses apply only to the corp's primary
 * sector type, full strength. Neutral when the feature gate is off.
 * A retired (sunset) method runs on with dearer inputs, so its penalty folds
 * into the same aggregate (techTree/sunset). Energy transition worlds also
 * fold plant age, climate laws and mineral recycling into the input rates,
 * and automation levies make automation methods' inputs dearer.
 */
export function resolveSectorTechEffects(
  corp: Corporation,
  sector: CorporateSector,
  lookups: CorporationLookups,
  techTreesEnabled: boolean,
  currentYear: number | null | undefined,
  operatingSectorType: Parameters<typeof withSunsetPenalty>[1]
): AggregatedTechEffects {
  const base = techTreesEnabled
    ? withSunsetPenalty(
        currentYear != null
          ? getSectorTechEffectsForYear(
              corp,
              sector.sectorType,
              currentYear,
              sector.industryModel,
              sector.mediaDiscriminator
            )
          : getSectorTechEffects(
              corp,
              sector.sectorType,
              sector.industryModel,
              sector.mediaDiscriminator
            ),
        operatingSectorType,
        sector.strategyId,
        currentYear
      )
    : NEUTRAL_TECH_EFFECTS;
  return withAutomationLevy(
    withEnergyTransition(base, lookups.energyTransition, sector, operatingSectorType, currentYear),
    lookups.automationPolicyByCountry,
    { countryId: sector.countryId ?? corp.countryId, strategyId: sector.strategyId }
  );
}
