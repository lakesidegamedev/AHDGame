import type { Corporation } from "@/lib/db/types";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import {
  getCrisisInputProvider,
  registerCrisisInputProvider,
  type CrisisInputContext,
  type CrisisInputProvider,
} from "./registry";

function averageByCountry(
  stateIdsByCountry: ReadonlyMap<string, readonly string[]>,
  countryIds: ReadonlySet<string>,
  valueByState: ReadonlyMap<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  for (const countryId of countryIds) {
    let sum = 0;
    let count = 0;
    for (const stateId of stateIdsByCountry.get(countryId) ?? []) {
      const value = valueByState.get(stateId);
      if (value === undefined || !Number.isFinite(value)) continue;
      sum += value;
      count += 1;
    }
    if (count > 0) result.set(countryId, sum / count);
  }
  return result;
}

async function loadStateMetric(
  ctx: CrisisInputContext,
  field: "unemploymentRate" | "gdpGrowth"
): Promise<Map<string, number>> {
  const stateIds = [...ctx.countryIds].flatMap((id) => ctx.stateIdsByCountry.get(id) ?? []);
  if (stateIds.length === 0) return new Map();
  const path = `economic.${field}.value`;
  const docs = await ctx.db
    .collection<StateMetrics>("stateMetrics")
    .find({ _id: { $in: stateIds } }, { projection: { [path]: 1 } })
    .toArray();
  const valueByState = new Map<string, number>();
  for (const doc of docs) {
    const value = doc.economic?.[field]?.value;
    if (typeof value === "number") valueByState.set(doc._id, value);
  }
  return averageByCountry(ctx.stateIdsByCountry, ctx.countryIds, valueByState);
}

/** Percent, averaged over a country's regions. */
export const unemploymentRateProvider: CrisisInputProvider = {
  input: "unemploymentRate",
  load: (ctx) => loadStateMetric(ctx, "unemploymentRate"),
};

/** Percent growth rate, averaged over a country's regions. */
export const gdpGrowthProvider: CrisisInputProvider = {
  input: "gdpGrowth",
  load: (ctx) => loadStateMetric(ctx, "gdpGrowth"),
};

/**
 * Worst bank in the country on a 0..100 scale: a failed charter reads 100,
 * otherwise the shortfall of depositor confidence below 0.8. Banks whose
 * depositors have already been resolved no longer count.
 */
export const bankStressProvider: CrisisInputProvider = {
  input: "bankStress",
  async load(ctx) {
    if (ctx.countryIds.size === 0) return new Map();
    const banks = await ctx.db
      .collection<Corporation>("corporations")
      .find(
        { bankCharter: { $exists: true }, countryId: { $in: [...ctx.countryIds] } },
        {
          projection: {
            countryId: 1,
            "bankCharter.status": 1,
            "bankCharter.confidence": 1,
            "bankCharter.depositorsResolvedTurn": 1,
          },
        }
      )
      .toArray();
    const result = new Map<string, number>();
    for (const bank of banks) {
      const charter = bank.bankCharter;
      const countryId = bank.countryId;
      if (!charter || !countryId || charter.depositorsResolvedTurn !== undefined) continue;
      const stress =
        charter.status === "failed" ? 100 : 100 * Math.max(0, 0.8 - (charter.confidence ?? 1));
      result.set(countryId, Math.max(result.get(countryId) ?? 0, stress));
    }
    return result;
  },
};

/** Registers any missing built-in input. Safe to call every turn. */
export function ensureBuiltinCrisisInputProviders(): void {
  for (const provider of [unemploymentRateProvider, gdpGrowthProvider, bankStressProvider]) {
    if (!getCrisisInputProvider(provider.input)) registerCrisisInputProvider(provider);
  }
}
