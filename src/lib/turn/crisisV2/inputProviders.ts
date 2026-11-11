import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import type { GovernmentApproval } from "@/lib/db/types/governmentApproval";
import { getSovereignConfidencePremium } from "@/lib/budget/debt";
import { resolveRatioGdp } from "@/lib/budget/gdpDenominator";
import type { CountryId } from "@/lib/constants/countries";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import {
  getCrisisInputProvider,
  registerCrisisInputProvider,
  type CrisisInputContext,
  type CrisisInputProvider,
} from "./registry";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import { governmentApprovalsCollection } from "@/lib/db/repositories/governmentApprovals";

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

/** Raw metric per state, for detectors that watch single regions. */
export async function loadStateMetricValues(
  db: CrisisInputContext["db"],
  stateIds: readonly string[],
  field: "unemploymentRate" | "gdpGrowth"
): Promise<Map<string, number>> {
  const valueByState = new Map<string, number>();
  if (stateIds.length === 0) return valueByState;
  const path = `economic.${field}.value`;
  const docs = await macroMetricsCollection(db)
    .find({ _id: { $in: [...stateIds] } }, { projection: { [path]: 1 } })
    .toArray();
  for (const doc of docs) {
    const value = doc.economic?.[field]?.value;
    if (typeof value === "number") valueByState.set(doc._id, value);
  }
  return valueByState;
}

async function loadStateMetric(
  ctx: CrisisInputContext,
  field: "unemploymentRate" | "gdpGrowth"
): Promise<Map<string, number>> {
  const stateIds = [...ctx.countryIds].flatMap((id) => ctx.stateIdsByCountry.get(id) ?? []);
  const valueByState = await loadStateMetricValues(ctx.db, stateIds, field);
  return averageByCountry(ctx.stateIdsByCountry, ctx.countryIds, valueByState);
}

/** Percent, averaged over a country's regions. Economic metrics live on `macroMetrics`. */
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
    const corporations = await getCorporationsCollection(ctx.db);
    const banks = await corporations
      .find(
        { bankCharter: { $exists: true }, countryId: { $in: [...ctx.countryIds] as CountryId[] } },
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

const memo = new WeakMap<CrisisInputContext, Map<string, Promise<unknown>>>();

/** Loads once per context, so several inputs share one read within a turn. */
function once<T>(ctx: CrisisInputContext, key: string, load: () => Promise<T>): Promise<T> {
  let cache = memo.get(ctx);
  if (!cache) {
    cache = new Map();
    memo.set(ctx, cache);
  }
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const pending = load();
  cache.set(key, pending);
  return pending;
}

/** Levels at which each gap input reads zero, i.e. a normal economy. */
export const NORMAL_UNEMPLOYMENT_PCT = 6;
export const NORMAL_GROWTH_PCT = 2;
export const NORMAL_INFLATION_PCT = 2.5;
export const NORMAL_DEBT_TO_GDP_PCT = 90;
export const NORMAL_SAFETY_NET_GDP_PCT = 6;
export const NORMAL_POLICY_RATE_PCT = 3.5;
export const NORMAL_APPROVAL_PCT = 40;
export const NORMAL_ENERGY_PRICE_PREMIUM_PCT = 20;

function shifted(values: Map<string, number>, shift: (value: number) => number) {
  return new Map([...values].map(([id, value]) => [id, shift(value)]));
}

/** Unemployment above (positive) or below normal, in points. */
export const unemploymentGapProvider: CrisisInputProvider = {
  input: "unemploymentGap",
  async load(ctx) {
    const raw = await once(ctx, "unemploymentRate", () => unemploymentRateProvider.load(ctx));
    return shifted(raw, (value) => value - NORMAL_UNEMPLOYMENT_PCT);
  },
};

/** Growth shortfall (positive) or surplus against normal, in points. */
export const growthGapProvider: CrisisInputProvider = {
  input: "growthGap",
  async load(ctx) {
    const raw = await once(ctx, "gdpGrowth", () => gdpGrowthProvider.load(ctx));
    return shifted(raw, (value) => NORMAL_GROWTH_PCT - value);
  },
};

interface BudgetReading {
  gdp: number;
  debtToGdpRatio: number;
  investorConfidence?: number;
  inflationRate?: number;
  safetyNetSpending: number;
}

function loadBudgets(ctx: CrisisInputContext): Promise<Map<string, BudgetReading>> {
  return once(ctx, "federalBudget", async () => {
    const readings = new Map<string, BudgetReading>();
    if (ctx.countryIds.size === 0) return readings;
    const budgets = await getFederalBudgetCollection(ctx.db);
    const docs = await budgets
      .find(
        { countryId: { $in: [...ctx.countryIds] as CountryId[] } },
        {
          projection: {
            countryId: 1,
            gdp: 1,
            gdpSmoothed: 1,
            debtToGdpRatio: 1,
            investorConfidence: 1,
            "economicFactors.inflationRate": 1,
            "spending.byCategory.welfare": 1,
            "spending.byCategory.socialSecurity": 1,
          },
        }
      )
      .toArray();
    for (const doc of docs) {
      const byCategory = doc.spending?.byCategory ?? {};
      readings.set(String(doc.countryId), {
        gdp: resolveRatioGdp(doc),
        debtToGdpRatio: Number(doc.debtToGdpRatio) || 0,
        investorConfidence:
          typeof doc.investorConfidence === "number" ? doc.investorConfidence : undefined,
        inflationRate:
          typeof doc.economicFactors?.inflationRate === "number"
            ? doc.economicFactors.inflationRate
            : undefined,
        safetyNetSpending:
          (Number(byCategory.welfare) || 0) + (Number(byCategory.socialSecurity) || 0),
      });
    }
    return readings;
  });
}

function budgetInput(
  input: string,
  read: (budget: BudgetReading) => number | undefined
): CrisisInputProvider {
  return {
    input,
    async load(ctx) {
      const result = new Map<string, number>();
      for (const [countryId, budget] of await loadBudgets(ctx)) {
        const value = read(budget);
        if (value !== undefined && Number.isFinite(value)) result.set(countryId, value);
      }
      return result;
    },
  };
}

/** Inflation above or below normal, in points. */
export const inflationGapProvider = budgetInput("inflationGap", (budget) =>
  budget.inflationRate === undefined ? undefined : budget.inflationRate - NORMAL_INFLATION_PCT
);

/** Public debt as a share of GDP above or below normal, in points. */
export const debtGapProvider = budgetInput(
  "debtGap",
  (budget) => budget.debtToGdpRatio * 100 - NORMAL_DEBT_TO_GDP_PCT
);

/** Extra borrowing premium investors demand, in basis points. Zero at normal confidence. */
export const bondYieldPressureProvider = budgetInput(
  "bondYieldPressure",
  (budget) => getSovereignConfidencePremium(budget.investorConfidence) * 10_000
);

/**
 * Welfare and social security spending above or below normal, in points of GDP.
 * Policy feedback: more safety-net spending lowers the drivers that read it.
 */
export const safetyNetGapProvider = budgetInput("safetyNetGap", (budget) =>
  budget.gdp > 0
    ? (budget.safetyNetSpending / budget.gdp) * 100 - NORMAL_SAFETY_NET_GDP_PCT
    : undefined
);

/** Central bank policy rate above or below normal, in points. Policy feedback. */
export const policyRateGapProvider: CrisisInputProvider = {
  input: "policyRateGap",
  async load(ctx) {
    const result = new Map<string, number>();
    if (ctx.countryIds.size === 0) return result;
    const banks = await centralBanksCollection(ctx.db)
      .find(
        { countryId: { $in: [...ctx.countryIds] as CountryId[] } },
        { projection: { countryId: 1, primeRate: 1 } }
      )
      .toArray();
    for (const bank of banks) {
      if (typeof bank.primeRate === "number") {
        result.set(String(bank.countryId), bank.primeRate - NORMAL_POLICY_RATE_PCT);
      }
    }
    return result;
  },
};

/** Government approval below (positive) or above normal, in points. Stands in for street unrest. */
export const unrestGapProvider: CrisisInputProvider = {
  input: "unrestGap",
  async load(ctx) {
    const result = new Map<string, number>();
    if (ctx.countryIds.size === 0) return result;
    const docs = await governmentApprovalsCollection(ctx.db)
      .find(
        { _id: { $in: [...ctx.countryIds] as CountryId[] } },
        { projection: { approvalRating: 1 } }
      )
      .toArray();
    for (const doc of docs) {
      if (typeof doc.approvalRating === "number") {
        result.set(String(doc._id), NORMAL_APPROVAL_PCT - doc.approvalRating);
      }
    }
    return result;
  },
};

const ENERGY_COMMODITY = "energy";

/** Regional energy price premium over its base price, in percent, above normal. */
export const energyPriceGapProvider: CrisisInputProvider = {
  input: "energyPriceGap",
  async load(ctx) {
    const doc = await commodityPricesCollection(ctx.db).findOne(
      { commodity: ENERGY_COMMODITY },
      { projection: { basePrice: 1, statePrices: 1 } }
    );
    if (!doc || !(doc.basePrice > 0)) return new Map();
    const premiumByState = new Map<string, number>();
    for (const [stateId, price] of Object.entries(doc.statePrices ?? {})) {
      if (Number.isFinite(price)) {
        premiumByState.set(
          stateId,
          (price / doc.basePrice - 1) * 100 - NORMAL_ENERGY_PRICE_PREMIUM_PCT
        );
      }
    }
    return averageByCountry(ctx.stateIdsByCountry, ctx.countryIds, premiumByState);
  },
};

/** A constant 1, so a definition can carry a steady drift (recovery) as a driver term. */
export const baselineProvider: CrisisInputProvider = {
  input: "baseline",
  async load(ctx) {
    return new Map([...ctx.countryIds].map((countryId) => [countryId, 1]));
  },
};

export const BUILTIN_CRISIS_INPUT_PROVIDERS: readonly CrisisInputProvider[] = [
  unemploymentRateProvider,
  gdpGrowthProvider,
  bankStressProvider,
  unemploymentGapProvider,
  growthGapProvider,
  inflationGapProvider,
  debtGapProvider,
  bondYieldPressureProvider,
  safetyNetGapProvider,
  policyRateGapProvider,
  unrestGapProvider,
  energyPriceGapProvider,
  baselineProvider,
];

/** Registers any missing built-in input. Safe to call every turn. */
export function ensureBuiltinCrisisInputProviders(): void {
  for (const provider of BUILTIN_CRISIS_INPUT_PROVIDERS) {
    if (!getCrisisInputProvider(provider.input)) registerCrisisInputProvider(provider);
  }
}
