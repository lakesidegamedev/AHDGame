import type {
  State,
  StateDemographics,
  StateDemographicTurnout,
  StatePartyOrg,
} from "@/lib/db/types";
import type { Db } from "mongodb";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { CountryId } from "@/lib/constants/countries";
import { turnoutForElection } from "@/lib/campaignTargeting/rules";
import {
  buildGranularElectorateSubstrate,
  type GranularSubstrate,
} from "@/lib/demographics/granularElectorate";
import { mergeRegionalSubstrates } from "@/lib/demographics/nationalElectorate";
import type { EnrichedCandidate } from "./types";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { stateDemographicTurnoutCollection } from "@/lib/db/repositories/stateDemographicTurnout";
import { demographicDefaultsCollection } from "@/lib/db/repositories/demographicDefaults";

export interface NationwideElectoratePreload {
  state: State;
  demographics: StateDemographics;
  turnout: StateDemographicTurnout;
  partyOrgs: StatePartyOrg[];
}

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function latestDate(values: Array<Date | undefined>): Date | undefined {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  if (timestamps.length === 0) return undefined;
  return new Date(Math.max(...timestamps));
}

function earliestDate(values: Array<Date | undefined>): Date | undefined {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  if (timestamps.length === 0) return undefined;
  return new Date(Math.min(...timestamps));
}

function weightedAverage(
  rows: Array<{ value: number | undefined; weight: number }>
): number | undefined {
  const usable = rows.filter(
    (row): row is { value: number; weight: number } =>
      typeof row.value === "number" && Number.isFinite(row.value) && row.weight > 0
  );
  const totalWeight = usable.reduce((total, row) => total + row.weight, 0);
  if (totalWeight <= 0) return undefined;
  return usable.reduce((total, row) => total + row.value * row.weight, 0) / totalWeight;
}

/**
 * Build the synthetic constituency consumed by a nationwide direct election.
 * Regional seed rows remain authoritative; this adapter only folds them into
 * the country-code key used by the election document.
 */
export function buildNationwideElectoratePreload(
  countryId: CountryId,
  states: State[],
  demographics: StateDemographics[],
  turnoutDocs: StateDemographicTurnout[],
  partyOrgs: StatePartyOrg[]
): NationwideElectoratePreload | null {
  const countryStates = states.filter((state) => state.countryId === countryId);
  if (countryStates.length === 0) return null;

  const stateById = new Map(countryStates.map((state) => [state._id, state]));
  const totalPopulation = sum(countryStates.map((state) => state.population));
  if (totalPopulation <= 0) return null;

  const countryDemographics = demographics.filter(
    (row) => row.countryId === countryId && stateById.has(row._id)
  );
  if (countryDemographics.length === 0) return null;

  const countryTurnout = turnoutDocs.filter(
    (row) => row.countryId === countryId && stateById.has(row._id)
  );
  const foldModifiers = (
    field: "modifiers" | "campaignModifiers" | "campaignContactModifiers"
  ): StateDemographicTurnout["modifiers"] => {
    const categories = new Set(countryTurnout.flatMap((row) => Object.keys(row[field] ?? {})));
    const folded: StateDemographicTurnout["modifiers"] = {};
    for (const categoryId of categories) {
      const groupIds = new Set(
        countryTurnout.flatMap((row) => Object.keys(row[field]?.[categoryId] ?? {}))
      );
      folded[categoryId] = {};
      for (const groupId of groupIds) {
        folded[categoryId][groupId] =
          weightedAverage(
            countryTurnout.map((row) => ({
              value: row[field]?.[categoryId]?.[groupId],
              weight: stateById.get(row._id)?.population ?? 0,
            }))
          ) ?? 0;
      }
    }
    return folded;
  };
  const modifiers = foldModifiers("modifiers");
  const campaignModifiers = foldModifiers("campaignModifiers");
  const campaignContactModifiers = foldModifiers("campaignContactModifiers");

  const countryPartyOrgs = partyOrgs.filter(
    (row) => row.countryId === countryId && stateById.has(row.stateId)
  );
  const partyIds = new Set(countryPartyOrgs.map((row) => row.partyId));
  const nationalPartyOrgs: StatePartyOrg[] = [];
  for (const partyId of partyIds) {
    const rows = countryPartyOrgs.filter((row) => row.partyId === partyId);
    const first = rows[0];
    if (!first) continue;
    const weighted = (field: keyof StatePartyOrg) =>
      weightedAverage(
        rows.map((row) => ({
          value: typeof row[field] === "number" ? (row[field] as number) : undefined,
          weight: stateById.get(row.stateId)?.population ?? 0,
        }))
      );
    nationalPartyOrgs.push({
      ...first,
      _id: `${countryId}_${partyId}`,
      stateId: countryId,
      organization: weighted("organization") ?? 0,
      treasury: sum(rows.map((row) => row.treasury)),
      stateTaxRate: weighted("stateTaxRate") ?? 0,
      politicalStrength: weighted("politicalStrength") ?? 0,
      hasPresence: rows.some((row) => row.hasPresence),
      createdAt: earliestDate(rows.map((row) => row.createdAt)) ?? first.updatedAt,
      updatedAt: latestDate(rows.map((row) => row.updatedAt)) ?? first.updatedAt,
      ...(weighted("registration") != null ? { registration: weighted("registration") } : {}),
      ...(weighted("registrationShare") != null
        ? { registrationShare: weighted("registrationShare") }
        : {}),
      ...(weighted("primarySurge") != null ? { primarySurge: weighted("primarySurge") } : {}),
    });
  }

  const demographicUpdatedAt =
    latestDate(countryDemographics.map((row) => row.lastUpdated)) ?? new Date(0);
  const turnoutUpdatedAt =
    countryTurnout.length > 0
      ? (latestDate(countryTurnout.map((row) => row.lastUpdated)) ?? demographicUpdatedAt)
      : demographicUpdatedAt;
  const turnoutDecayAt =
    countryTurnout.length > 0
      ? (latestDate(countryTurnout.map((row) => row.lastDecayApplied)) ?? demographicUpdatedAt)
      : demographicUpdatedAt;

  return {
    state: {
      _id: countryId,
      countryId,
      regionType: "nation",
      name: `${countryId} national electorate`,
      population: totalPopulation,
      votingEligiblePopulation: sum(
        countryStates.map((state) => state.votingEligiblePopulation ?? state.population)
      ),
      workingAgePopulation: sum(countryStates.map((state) => state.workingAgePopulation)),
      militaryServicePopulation: sum(countryStates.map((state) => state.militaryServicePopulation)),
      gdp: sum(countryStates.map((state) => state.gdp)),
      capitalStock: sum(countryStates.map((state) => state.capitalStock)),
      houseDistricts: sum(countryStates.map((state) => state.houseDistricts)),
      stateSenateSeats: sum(countryStates.map((state) => state.stateSenateSeats)),
      region: "National",
      votingSystem: "fptp",
    },
    demographics: {
      _id: countryId,
      countryId,
      categoryWeights: {},
      cachedEconomicLean: weightedAverage(
        countryDemographics.map((row) => ({
          value: row.cachedEconomicLean,
          weight: stateById.get(row._id)?.population ?? 0,
        }))
      ),
      cachedSocialLean: weightedAverage(
        countryDemographics.map((row) => ({
          value: row.cachedSocialLean,
          weight: stateById.get(row._id)?.population ?? 0,
        }))
      ),
      lastUpdated: demographicUpdatedAt,
    },
    turnout: {
      _id: countryId,
      countryId,
      modifiers,
      ...(Object.keys(campaignModifiers).length > 0 ? { campaignModifiers } : {}),
      ...(Object.keys(campaignContactModifiers).length > 0 ? { campaignContactModifiers } : {}),
      lastDecayApplied: turnoutDecayAt,
      lastUpdated: turnoutUpdatedAt,
    },
    partyOrgs: nationalPartyOrgs,
  };
}

export interface NationalSubstrateInput {
  countryId: CountryId;
  nationalDemographics: StateDemographics;
  stateMap: Map<string, State>;
  demographicsMap: Map<string, StateDemographics>;
  turnoutByState: Map<string, StateDemographicTurnout>;
  demographicDefaultsByState?: Map<string, StateDemographics>;
  election: { campaignRulesVersion?: number };
  currentTurn: number;
  preset?: string;
  year?: number | null;
  startingYear?: number | null;
  enriched: EnrichedCandidate[];
  partyGroupFavorabilityByKey?: Map<string, number>;
}

/**
 * The electorate of a nationwide contest: every region's census cells, weighted
 * by eligible population. A region without a census row is an error, never a
 * silent gap in the national vote.
 */
export function buildNationalSubstrate(input: NationalSubstrateInput): GranularSubstrate {
  const regions = [...input.stateMap.values()].filter(
    (state) => state.countryId === input.countryId && state._id !== input.countryId
  );
  if (regions.length === 0) {
    throw new Error(`No regions for ${input.countryId} national electorate`);
  }
  const parts = regions.map((region) => {
    const demographics = input.demographicsMap.get(region._id);
    if (!demographics) {
      throw new Error(`No census electorate for ${input.countryId} region ${region._id}`);
    }
    const electorate = region.votingEligiblePopulation ?? region.population;
    const substrate = buildGranularElectorateSubstrate({
      campaignRulesVersion: input.election.campaignRulesVersion,
      currentTurn: input.currentTurn,
      countryId: input.countryId,
      stateId: region._id,
      preset: input.preset,
      turnoutDoc: turnoutForElection(input.turnoutByState.get(region._id), input.election) ?? null,
      statePopulation: electorate,
      demographics,
      enriched: input.enriched,
      partyGroupFavorabilityByKey: input.partyGroupFavorabilityByKey,
      demographicDefaults: input.demographicDefaultsByState?.get(region._id) ?? null,
      year: input.year,
      startingYear: input.startingYear,
    });
    if (!substrate) {
      throw new Error(`No census electorate for ${input.countryId} region ${region._id}`);
    }
    return { regionId: region._id, electorate, substrate };
  });
  const merged = mergeRegionalSubstrates(parts, input.nationalDemographics);
  if (!merged) throw new Error(`No census electorate for ${input.countryId}`);
  return merged;
}

export interface NationalRegionDocs {
  stateMap: Map<string, State>;
  demographicsMap: Map<string, StateDemographics>;
  turnoutByState: Map<string, StateDemographicTurnout>;
  demographicDefaultsByState: Map<string, StateDemographics>;
}

/** Regional docs for a nationwide contest run outside the batched turn preload. */
export async function loadNationalRegionDocs(
  db: Db,
  countryId: CountryId
): Promise<NationalRegionDocs> {
  const states = await (
    await getStatesCollection(db)
  )
    .find({ countryId, _id: { $ne: countryId } })
    .toArray();
  const filter = { countryId, _id: { $in: states.map((state) => state._id) } };
  const [demographics, turnout, defaults] = await Promise.all([
    stateDemographicsCollection(db).find(filter).toArray(),
    stateDemographicTurnoutCollection(db).find(filter).toArray(),
    demographicDefaultsCollection(db).find(filter).toArray(),
  ]);
  return {
    stateMap: new Map(states.map((row) => [row._id as string, row])),
    demographicsMap: new Map(demographics.map((row) => [row._id as string, row])),
    turnoutByState: new Map(turnout.map((row) => [row._id as string, row])),
    demographicDefaultsByState: new Map(defaults.map((row) => [row._id as string, row])),
  };
}
