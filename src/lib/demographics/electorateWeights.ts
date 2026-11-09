/**
 * The census electorate of each region as population-weighted voter units, the
 * shape approval weighting reads. A region without census cells is left out,
 * which leaves its approval unweighted.
 */
import type { StateDemographics } from "@/lib/db/types";
import type { StateDemographicGroup } from "@/lib/db/types/demographics";
import { buildGranularElectorateSubstrate } from "./granularElectorate";

export interface ElectorateEra {
  preset?: string | null;
  year?: number | null;
  startingYear?: number | null;
}

export type ElectorateDoc = Pick<StateDemographics, "_id" | "countryId"> &
  Partial<Pick<StateDemographics, "layer1PositionOverrides" | "layer1TurnoutOverrides">>;

/** Keyed `${countryId}:${regionId}`; the key matches `weightingFor`. */
export function electorateUnitsByRegion(
  docs: ReadonlyArray<ElectorateDoc>,
  defaults: ReadonlyMap<string, ElectorateDoc>,
  era: ElectorateEra
): Map<string, StateDemographicGroup[]> {
  const out = new Map<string, StateDemographicGroup[]>();
  for (const doc of docs) {
    const substrate = buildGranularElectorateSubstrate({
      countryId: doc.countryId,
      stateId: doc._id,
      preset: era.preset ?? undefined,
      statePopulation: 1,
      demographics: {
        ...doc,
        categoryWeights: {},
        groups: {},
        lastUpdated: new Date(0),
      },
      demographicDefaults: (defaults.get(`${doc.countryId}:${doc._id}`) ??
        null) as StateDemographics | null,
      enriched: [],
      year: era.year,
      startingYear: era.startingYear,
    });
    if (substrate)
      out.set(`${doc.countryId}:${doc._id}`, Object.values(substrate.demographics.groups));
  }
  return out;
}
