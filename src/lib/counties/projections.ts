/**
 * County population plans freeze a state's realized demographic change before writes.
 * freezeCountyPopulationPlans reads all affected stocks together and rejects missing
 * or inconsistent coverage; the demographic journal owns publishing and recovery.
 */
import type { Db } from "mongodb";
import type { County } from "@/lib/db/types/county";
import type { DemographicFlowRegionInput } from "@/lib/demographics/flowJournal";
import {
  advanceCountyPopulations,
  COUNTY_COUNTRY_IDS,
  countyCountryForId,
  type CountyCountryId,
} from "./rules";
import {
  hasPopulationSubdivisionReference,
  loadPopulationSubdivisionReference,
} from "./subdivisionReference";

/** Identity retained on journal writes so reassigned targets cannot be overwritten. */
export function countyPopulationIdentity(
  stateId: string,
  id: string
): Pick<County, "countryId" | "stateId"> {
  const countryId = countyCountryForId(id);
  if (!countryId) throw new Error(`Invalid subdivision ID ${id}`);
  return { countryId, stateId };
}

export async function freezeCountyPopulationPlans(
  db: Db,
  regions: DemographicFlowRegionInput[]
): Promise<DemographicFlowRegionInput[]> {
  const states = (
    await db
      .collection<{ _id: string; countryId: CountyCountryId; population: number }>("states")
      .find(
        {
          _id: { $in: regions.map((r) => r.regionId) },
          countryId: { $in: [...COUNTY_COUNTRY_IDS] },
        },
        { projection: { _id: 1, countryId: 1, population: 1 } }
      )
      .toArray()
  ).filter((state) => hasPopulationSubdivisionReference(state._id, state.countryId));
  if (!states.length) return regions;
  const counties = await db
    .collection<County>("counties")
    .find(
      { stateId: { $in: states.map((s) => s._id) }, countryId: { $in: [...COUNTY_COUNTRY_IDS] } },
      { projection: { _id: 1, countryId: 1, stateId: 1, population: 1, baselinePopulation: 1 } }
    )
    .toArray();
  const plans = new Map<string, ReturnType<typeof advanceCountyPopulations>>();
  const inputs = new Map(regions.map((r) => [r.regionId, r]));
  for (const state of states) {
    const rows = counties.filter((c) => c.stateId === state._id);
    const reference = await loadPopulationSubdivisionReference(state._id, state.countryId);
    const ids = new Set(rows.map((c) => c._id));
    if (
      rows.length !== reference.length ||
      reference.some((c) => !ids.has(c.id)) ||
      rows.some(
        (c) => c.countryId !== state.countryId || countyCountryForId(c._id) !== state.countryId
      ) ||
      rows.reduce((n, c) => n + c.population, 0) !== state.population
    )
      throw new Error(`County populations not initialized or inconsistent for ${state._id}`);
    plans.set(
      state._id,
      advanceCountyPopulations(
        rows.map((c) => ({ id: c._id, population: c.population })),
        inputs.get(state._id)!.stateAfter.population,
        rows.map((c) => ({
          id: c._id,
          population: c.baselinePopulation ?? reference.find((r) => r.id === c._id)!.population,
        }))
      )
    );
  }
  return regions.map((region) => {
    const countyPopulationsAfter = plans.get(region.regionId);
    return countyPopulationsAfter
      ? {
          ...region,
          countyPopulationsAfter,
          stateAfter: {
            ...region.stateAfter,
            population: countyPopulationsAfter.reduce((n, c) => n + c.population, 0),
          },
        }
      : region;
  });
}
