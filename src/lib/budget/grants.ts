/**
 * Formula grant distribution — federal pool → per-state allocations.
 *
 * **Currency (v0.2.6):** Every flow stays within a single country (federal pool
 * → that country's state budgets), so grant amounts inherit the country's
 * currency on both sides. No FX conversion is required. Cross-country grants
 * do not exist in this system.
 */
import type { Db } from "mongodb";
import type { StateBudget } from "@/lib/db/types/budget";
import type { MacroMetricsDoc } from "@/lib/db/types/macroMetrics";
import type { CountryId } from "@/lib/constants/countries";
import { formulaGrants } from "@/lib/seeds/reference/formulaGrants";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";

import {
  allocateFormulaGrants,
  formulaGrantBreakdown,
  grantPovertyRate,
  type GrantRegion,
} from "./rules/formulaGrants";

async function getStateData(db: Db, countryId?: CountryId): Promise<GrantRegion[]> {
  const states = await statesCollection<Document>(db)
    .find(countryId ? { countryId } : {}, { projection: { _id: 1, population: 1 } })
    .toArray();

  const stateIds = states.map((s) => String(s._id));
  const metricsDocs = await macroMetricsCollection<MacroMetricsDoc>(db)
    .find(
      { _id: { $in: stateIds }, ...(countryId ? { countryId } : {}) },
      { projection: { _id: 1, "economic.povertyRate.value": 1 } }
    )
    .toArray();
  const metricsMap = new Map<string, { economic?: { povertyRate?: { value?: number } } }>();
  for (const doc of metricsDocs) {
    metricsMap.set(String(doc._id), doc as { economic?: { povertyRate?: { value?: number } } });
  }

  return states.map((state) => {
    const metrics = metricsMap.get(String(state._id));
    return {
      id: String(state._id),
      population: state.population || 1000000,
      povertyRate: grantPovertyRate(metrics?.economic?.povertyRate?.value),
    };
  });
}

export async function processFormulaGrants(
  db: Db,
  federalBudgetTotal: number,
  countryId?: CountryId
): Promise<Record<string, number>> {
  const states = await getStateData(db, countryId);
  return allocateFormulaGrants(federalBudgetTotal, formulaGrants, states);
}

export async function loadFormulaGrantBreakdown(db: Db, stateId: string, booked: number) {
  return formulaGrantBreakdown(booked, stateId, formulaGrants, await getStateData(db, "US"));
}

export async function updateStateGrantRevenue(
  db: Db,
  stateId: string,
  countryId: CountryId,
  grantAmount: number
): Promise<void> {
  await stateBudgetsCollection(db).updateOne(
    { _id: stateId, countryId },
    {
      $set: {
        "revenue.federalGrants": grantAmount,
        updatedAt: new Date(),
      },
    }
  );
}
