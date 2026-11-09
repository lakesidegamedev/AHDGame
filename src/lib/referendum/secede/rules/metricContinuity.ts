import type { ResetMetricSnapshot } from "@/lib/resetMetrics/rules/snapshot";
import type { OpeningMetricObservation } from "@/lib/resetMetrics/rules/openingObservation";
import type { HousingState } from "@/lib/resetMetrics/rules/housing";
import { largestRemainderAllocate } from "../apportion";
import { scaleDeep } from "../docScale";

/** Counts and cash are stocks; the regional housing owner must not clone them. */
export function splitHousingState(
  source: HousingState,
  countryId: string,
  weights: Record<string, number>
): Record<string, HousingState> {
  const split = (value: number) => largestRemainderAllocate(value, weights);
  const occupied = split(source.occupiedDwellings);
  const vacant = split(source.usableDwellings - source.occupiedDwellings);
  const unhoused = split(source.unhousedPeople);
  const cash = split(source.constructionCash);
  const projects = source.pipeline.map((project) => ({
    project,
    counts: split(project.dwellings),
  }));
  return Object.fromEntries(
    Object.entries(weights).map(([id, weight]) => {
      const row: HousingState = {
        ...source,
        countryId,
        regionId: id,
        usableDwellings: occupied[id] + vacant[id],
        occupiedDwellings: occupied[id],
        unhousedPeople: unhoused[id],
        constructionCash: cash[id],
        pipeline: projects.flatMap(({ project, counts }) =>
          counts[id] > 0 ? [{ ...project, id: `${project.id}:${id}`, dwellings: counts[id] }] : []
        ),
        ...(source.model
          ? {
              model: {
                ...source.model,
                openingDwellings: split(source.model.openingDwellings)[id],
                openingHouseholds: source.model.openingHouseholds * weight,
                previousHouseholds: source.model.previousHouseholds * weight,
                currentHouseholds: source.model.currentHouseholds * weight,
              },
            }
          : {}),
      };
      delete row.lastInputKey;
      delete row.lastFlow;
      return [id, row];
    })
  );
}

/** A former UK source is not a certified income/housing source for a new country. */
export function clearCountrySources(row: ResetMetricSnapshot): ResetMetricSnapshot {
  const result = { ...row };
  for (const key of [
    "householdSource",
    "householdReference",
    "householdIncomeModel",
    "householdCurrentState",
    "householdProductionStatus",
    "housingSource",
    "housingProductionStatus",
    "priorValues",
    "lastRefreshFromTurn",
  ] as const)
    delete result[key];
  if (result.scope === "national") delete result.housingState;
  return result;
}

/** Retain the inherited rate, without copying a country's numerator into every region. */
export function inheritedRegionalObservation(
  source: OpeningMetricObservation,
  weight: number
): OpeningMetricObservation {
  const result = structuredClone(source);
  if (result.ratioBasis)
    result.ratioBasis = {
      numerator: result.ratioBasis.numerator * weight,
      denominator: result.ratioBasis.denominator * weight,
    };
  if (result.householdBasis) result.householdBasis.weight *= weight;
  if (result.demographicBasis)
    result.demographicBasis = scaleDeep(
      result.demographicBasis,
      weight
    ) as typeof result.demographicBasis;
  if (result.growthBasis)
    for (const key of ["openingOutput", "closingOutput", "openingHours", "closingHours"] as const)
      result.growthBasis[key] *= weight;
  // Country-wide coverage keys cannot certify the new subdivision universe.
  delete result.countryBasis;
  if (result.definitionVersion === 2) {
    delete result.definitionVersion;
    result.status = "proxy";
    result.source = "Inherited regional rate at independence; awaiting successor owner measurement";
  }
  return result;
}
