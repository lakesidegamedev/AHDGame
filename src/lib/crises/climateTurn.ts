import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { spendingProvider } from "@/lib/metricEngine/spendingProvider";
import { loadActiveAgencyNudgesByCountry } from "@/lib/internationalOrganizations/agency";
import {
  advanceClimateExposure,
  climateProfileForStartingYear,
  effectiveEmissions,
  populationWeightedEmissions,
} from "./rules/climateFeedback";
import { loadTransitionPolicies } from "@/lib/energyTransition/policies";
import { NO_TRANSITION_POLICY, policyEmissionsCut } from "@/lib/energyTransition/rules";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateMetricsCollection } from "@/lib/db/repositories/stateMetrics";
import { climateFeedbackStateCollection } from "@/lib/db/repositories/climateFeedbackState";

export interface ClimateFeedbackState {
  _id: "world";
  pressure: number;
  globalTonsPerCapita: number;
  lastMeasuredTurn: number;
}

interface PopulationRow {
  _id: string;
  countryId?: CountryId;
  population?: number;
  regionType?: string;
}

interface EmissionsRow {
  _id: string;
  environment?: { carbonEmissions?: { value?: number } };
}

/** One global atmosphere; live mitigation effort changes the annual sample for everyone. */
export async function processClimateFeedbackTurn(
  db: Db,
  turn: number,
  opts?: { startingYear?: number }
): Promise<number> {
  const profile = climateProfileForStartingYear(opts?.startingYear);
  const collection = climateFeedbackStateCollection<ClimateFeedbackState>(db);
  const prior = await collection.findOne({ _id: "world" });
  // A world that opts in opens on its seeded pressure until the first sample.
  const oldPressure = prior?.pressure ?? profile.startingPressure;
  if (turn % TURNS_PER_YEAR !== 0 || (prior && prior.lastMeasuredTurn >= turn)) return oldPressure;

  const [regions, metrics, spending, agencies, transitionPolicies] = await Promise.all([
    statesCollection<PopulationRow>(db)
      .find(
        { regionType: { $nin: ["nation", "constituency"] } },
        {
          projection: { _id: 1, countryId: 1, population: 1 },
        }
      )
      .toArray(),
    stateMetricsCollection<EmissionsRow>(db)
      .find({}, { projection: { _id: 1, "environment.carbonEmissions.value": 1 } })
      .toArray(),
    spendingProvider(db),
    loadActiveAgencyNudgesByCountry(db, turn),
    // Opted-in worlds: carbon pricing, coal phase-out and clean power laws cut
    // what each country's regions emit.
    profile.broaderEffects ? loadTransitionPolicies(db) : null,
  ]);
  const regionById = new Map(
    regions
      .filter((region) => !NATIONAL_SCOPE_IDS.has(region._id))
      .map((region) => [region._id, region])
  );
  const measured = populationWeightedEmissions(
    metrics.map((metric) => {
      const region = regionById.get(metric._id);
      const seedEmissions = metric.environment?.carbonEmissions?.value;
      const agencyNudge = region?.countryId
        ? (agencies.get(region.countryId)?.get("carbonEmissions") ?? 0)
        : 0;
      const policyCut =
        transitionPolicies && region?.countryId
          ? policyEmissionsCut(transitionPolicies.get(region.countryId) ?? NO_TRANSITION_POLICY)
          : 0;
      return {
        population: region?.population ?? 0,
        tonsPerCapita:
          typeof seedEmissions === "number" && Number.isFinite(seedEmissions)
            ? effectiveEmissions(
                seedEmissions,
                spending.perCapitaByRegion.get(metric._id)?.environment ?? 0,
                agencyNudge
              ) *
              (1 - policyCut)
            : Number.NaN,
      };
    })
  );
  if (measured === null) return oldPressure;

  // Existing saves start measuring now; a new world's first year accrues once.
  const years = prior
    ? Math.max(0, (turn - prior.lastMeasuredTurn) / TURNS_PER_YEAR)
    : turn === TURNS_PER_YEAR
      ? 1
      : 0;
  const next = advanceClimateExposure(oldPressure, measured, years, profile);
  await collection.updateOne(
    { _id: "world" },
    {
      $set: {
        pressure: next.pressure,
        globalTonsPerCapita: next.globalTonsPerCapita,
        lastMeasuredTurn: turn,
      },
    },
    { upsert: true }
  );
  return next.pressure;
}
