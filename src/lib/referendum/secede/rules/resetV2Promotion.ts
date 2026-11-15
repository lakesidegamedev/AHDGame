import type { ResetRegionalOpeningBoard } from "@/lib/resetFinance/rules/regionalOpeningBoard";
import type { OpeningLawReference } from "@/lib/resetLegislation/openingLaw";
import { regionalizeOpeningReferences } from "@/lib/resetLegislation/rules/regionalizeOpeningReferences";
import {
  normalizeNationalMetricBoard,
  type ResetMetricSnapshot,
} from "@/lib/resetMetrics/rules/snapshot";
import type { ResetV2Successor } from "../subRegions";
import { fiscalOwnerReadings, type FiscalOwnerInput } from "@/lib/resetMetrics/rules/fiscalOwner";
import {
  clearCountrySources,
  splitHousingState,
  inheritedRegionalObservation,
} from "./metricContinuity";

export interface SuccessorRegionSeed {
  id: string;
  population: number;
}

export function buildSuccessorMetricRows(input: {
  countryId: ResetV2Successor;
  aggregate: ResetMetricSnapshot;
  national: ResetMetricSnapshot;
  regions: readonly SuccessorRegionSeed[];
  turn?: number;
  fiscal?: FiscalOwnerInput;
}): ResetMetricSnapshot[] {
  const { aggregate, countryId, regions } = input;
  const national = input.national;
  if (national.scope !== "national")
    throw new Error("Successor national metrics require a national board");
  if (aggregate.scope !== "regional" || regions.length === 0) {
    throw new Error(`${countryId} metric promotion requires a regional aggregate and sub-regions`);
  }
  const turn = input.turn ?? aggregate.asOfTurn;
  const population = regions.reduce((sum, row) => sum + row.population, 0);
  const weights = Object.fromEntries(regions.map((row) => [row.id, row.population / population]));
  const housing = aggregate.housingState
    ? splitHousingState(aggregate.housingState, countryId, weights)
    : {};
  const fiscal = fiscalOwnerReadings(input.fiscal ?? {});
  const values: Record<string, number | null> = {
    "07": fiscal.priceChange,
    "09": fiscal.balanceToGdp,
    "10": fiscal.debtToGdp,
    "57": 0,
  };
  const observations = Object.fromEntries(
    Object.entries(national.observations).map(([id, source]) => {
      const derived = values[id] !== undefined && values[id] !== null;
      return [
        id,
        {
          ...source,
          value: derived ? values[id]! : source.value,
          status: derived ? ("derived" as const) : ("proxy" as const),
          source: derived
            ? "Successor sovereign budget and empty opening force roster"
            : "Inherited shared-currency and energy-network conditions at independence",
          note: derived
            ? "Recomputed for the successor, not the UK's force or fiscal position."
            : "Inherited starting estimate, not a measurement of the new sovereign. Successor owners update it from current funding and conditions.",
          lastUpdatedTurn: turn,
        },
      ];
    })
  );
  const history = (readings: ResetMetricSnapshot["observations"]) =>
    Object.fromEntries(
      Object.entries(readings).map(([id, row]) => [id, [{ turn, value: row.value! }]])
    );
  return [
    normalizeNationalMetricBoard(
      clearCountrySources({
        ...national,
        _id: `${countryId}:national`,
        countryId,
        scope: "national",
        regionId: undefined,
        sourceTurn: turn,
        asOfTurn: turn,
        observations,
        openingValues: Object.fromEntries(
          Object.entries(observations).map(([id, row]) => [id, row.value!])
        ),
        history: history(observations),
      })
    ),
    ...regions.map((region) =>
      clearCountrySources({
        ...aggregate,
        _id: `${countryId}:${region.id}`,
        countryId,
        regionId: region.id,
        sourceTurn: turn,
        asOfTurn: turn,
        observations: Object.fromEntries(
          Object.entries(aggregate.observations).map(([id, row]) => [
            id,
            {
              ...inheritedRegionalObservation(row, weights[region.id]),
              observedAtTurn: row.observedAtTurn ?? row.lastUpdatedTurn ?? aggregate.asOfTurn,
              lastUpdatedTurn: turn,
            },
          ])
        ),
        history: history(aggregate.observations),
        ...(housing[region.id] ? { housingState: housing[region.id] } : {}),
      })
    ),
  ];
}

export function buildSuccessorRegionalRows(input: {
  countryId: ResetV2Successor;
  aggregate: ResetRegionalOpeningBoard;
  regionalReferences: readonly OpeningLawReference[];
  regions: readonly SuccessorRegionSeed[];
}): Array<{
  fiscal: ResetRegionalOpeningBoard;
  references: OpeningLawReference[];
}> {
  const { aggregate, countryId, regionalReferences, regions } = input;
  const totalPopulation = regions.reduce((sum, region) => {
    if (!region.id || !Number.isFinite(region.population) || region.population <= 0) {
      throw new Error(`${countryId} v2 promotion has an invalid sub-region population`);
    }
    return sum + region.population;
  }, 0);
  if (regions.length === 0 || !Number.isFinite(totalPopulation) || totalPopulation <= 0) {
    throw new Error(`${countryId} v2 promotion has no usable sub-region population`);
  }

  return regions.map((region) => {
    const share = region.population / totalPopulation;
    const allocatedClaims = aggregate.allocatedClaims.map((claim) => ({
      ...claim,
      annualBooked: claim.annualBooked * share,
    }));
    const familyOwned = allocatedClaims.reduce((sum, claim) => sum + claim.annualBooked, 0);
    const annualSpending = aggregate.annualSpending * share;
    const fiscal: ResetRegionalOpeningBoard = {
      ...aggregate,
      _id: `${countryId}:${region.id}`,
      countryId,
      regionId: region.id,
      annualSpending,
      familyOwned,
      otherExistingServices: annualSpending - familyOwned,
      ...(aggregate.existingServicesByCategory
        ? {
            existingServicesByCategory: Object.fromEntries(
              Object.entries(aggregate.existingServicesByCategory).map(([category, amount]) => [
                category,
                amount * share,
              ])
            ),
          }
        : {}),
      allocatedClaims,
    };
    return {
      fiscal,
      references: regionalizeOpeningReferences(regionalReferences, allocatedClaims),
    };
  });
}
